-- Up next: the room answers "What should we predict next?" like one of its
-- own questions. The options are Crow competitions (or something Crow
-- doesn't have yet), each player has one pick, and hosts start the next
-- series from the room's favourite. Across rooms, the picks tell the Crow
-- team which event packs to add (admin_get_up_next_demand).
--
-- Ideas are public.series_suggestions rows; a pick is a
-- series_suggestion_votes row. An idea nobody picks any more is taken down,
-- so the board only shows what someone wants (plus a few suggestions).

-- Whether a competition is on offer to rooms right now: on, and not over
-- (a tour or cup drops out the day after it ends, as in Browse).
create or replace function private.competition_on_offer(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from catalog.competitions c
    where c.id = p_competition_id
      and c.active
      and (c.ends_on is null or c.ends_on >= current_date - 1)
  );
$$;

-- The room's board: every open idea with its picks, then up to a few
-- competitions to start from when there are fewer than four ideas (ones the
-- room follows first, then the most followed on Crow), and every
-- competition on offer for "Something else". Hosts also see who picked what.
create or replace function public.get_up_next(p_room_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid := private.get_player_id_from_auth();
  v_role text;
  v_options json;
  v_open int;
begin
  select rm.role into v_role
  from public.room_members rm
  where rm.room_id = p_room_id and rm.player_id = v_player_id;

  if v_role is null then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  select count(*) into v_open
  from public.series_suggestions ss
  where ss.room_id = p_room_id and ss.status = 'open';

  with ideas as (
    select
      ss.id,
      ss.competition_id,
      coalesce(c.name, ss.title) as title,
      c.sport,
      ss.competition_id is not null and private.competition_on_offer(ss.competition_id) as on_crow,
      (select count(*)::int from public.series_suggestion_votes v where v.suggestion_id = ss.id) as picks,
      exists (
        select 1 from public.series_suggestion_votes v
        where v.suggestion_id = ss.id and v.player_id = v_player_id
      ) as picked_by_me,
      exists (
        select 1 from public.room_competitions rc
        where rc.room_id = p_room_id and rc.competition_id = ss.competition_id
      ) as followed,
      ss.created_by = v_player_id as created_by_me,
      case when v_role in ('owner', 'organizer') then (
        select coalesce(json_agg(p.username order by p.username), '[]'::json)
        from public.series_suggestion_votes v
        join public.players p on p.id = v.player_id
        where v.suggestion_id = ss.id
      ) end as pickers,
      ss.created_at
    from public.series_suggestions ss
    left join catalog.competitions c on c.id = ss.competition_id
    where ss.room_id = p_room_id and ss.status = 'open'
  ),
  seeds as (
    select
      null::uuid as id,
      c.id as competition_id,
      c.name as title,
      c.sport,
      true as on_crow,
      0 as picks,
      false as picked_by_me,
      exists (
        select 1 from public.room_competitions rc
        where rc.room_id = p_room_id and rc.competition_id = c.id
      ) as followed,
      false as created_by_me,
      case when v_role in ('owner', 'organizer') then '[]'::json end as pickers,
      null::timestamptz as created_at,
      (select count(*) from public.room_competitions rc where rc.competition_id = c.id) as popularity
    from catalog.competitions c
    where private.competition_on_offer(c.id)
      and not exists (select 1 from ideas i where i.competition_id = c.id)
    order by
      exists (
        select 1 from public.room_competitions rc
        where rc.room_id = p_room_id and rc.competition_id = c.id
      ) desc,
      (select count(*) from public.room_competitions rc where rc.competition_id = c.id) desc,
      c.display_order,
      c.name
    limit greatest(4 - v_open, 0)
  )
  select coalesce(json_agg(row_to_json(o) order by o.picks desc, o.is_seed, o.created_at, o.title), '[]'::json)
  into v_options
  from (
    select i.*, false as is_seed from ideas i
    union all
    select s.id, s.competition_id, s.title, s.sport, s.on_crow, s.picks, s.picked_by_me,
      s.followed, s.created_by_me, s.pickers, s.created_at, true as is_seed
    from seeds s
  ) o;

  return json_build_object(
    'options', v_options,
    'total_picks', (
      select count(*)::int
      from public.series_suggestion_votes v
      join public.series_suggestions ss on ss.id = v.suggestion_id
      where ss.room_id = p_room_id and ss.status = 'open'
    ),
    -- Everything a player can pick from under "Something else".
    'catalog', (
      select coalesce(json_agg(json_build_object(
        'id', c.id, 'name', c.name, 'sport', c.sport, 'kind', c.kind, 'region', c.region
      ) order by c.sport, c.display_order, c.name), '[]'::json)
      from catalog.competitions c
      where private.competition_on_offer(c.id)
    )
  );
end;
$$;

-- Takes down the room's open ideas nobody picks any more.
create or replace function private.tidy_up_next(p_room_id uuid)
returns void
language sql
security definer
set search_path = public, private
as $$
  update public.series_suggestions ss
  set status = 'removed'
  where ss.room_id = p_room_id
    and ss.status = 'open'
    and not exists (select 1 from public.series_suggestion_votes v where v.suggestion_id = ss.id);
$$;

-- Your pick for the room's next series: a Crow competition, or by name
-- something Crow doesn't have (a name that is a competition on offer picks
-- that competition). Moves your pick if you had one. Returns the board.
create or replace function public.pick_up_next(
  p_room_id        uuid,
  p_competition_id uuid default null,
  p_title          text default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid := private.get_player_id_from_auth();
  v_competition_id uuid := p_competition_id;
  v_title text := regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g');
  v_suggestion_id uuid;
begin
  if v_player_id is null then
    raise exception 'Not authenticated' using errcode = 'P0004';
  end if;

  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  if v_competition_id is null then
    if char_length(v_title) = 0 or char_length(v_title) > 60 then
      raise exception 'Keep the idea between 1 and 60 characters' using errcode = 'P0001';
    end if;

    -- Typed the name of something Crow has: pick that.
    select c.id into v_competition_id
    from catalog.competitions c
    where lower(c.name) = lower(v_title)
      and private.competition_on_offer(c.id)
    limit 1;
  elsif not private.competition_on_offer(v_competition_id) then
    raise exception 'Competition not found' using errcode = 'P0002';
  end if;

  if v_competition_id is not null then
    select ss.id into v_suggestion_id
    from public.series_suggestions ss
    where ss.room_id = p_room_id and ss.status = 'open' and ss.competition_id = v_competition_id;

    if v_suggestion_id is null then
      insert into public.series_suggestions (room_id, title, created_by, competition_id)
      select p_room_id, left(c.name, 60), v_player_id, c.id
      from catalog.competitions c where c.id = v_competition_id
      returning id into v_suggestion_id;
    end if;
  else
    select ss.id into v_suggestion_id
    from public.series_suggestions ss
    where ss.room_id = p_room_id and ss.status = 'open'
      and ss.competition_id is null and lower(ss.title) = lower(v_title);

    if v_suggestion_id is null then
      insert into public.series_suggestions (room_id, title, created_by)
      values (p_room_id, v_title, v_player_id)
      returning id into v_suggestion_id;
    end if;
  end if;

  -- One pick each: this one replaces any other.
  delete from public.series_suggestion_votes v
  using public.series_suggestions ss
  where ss.id = v.suggestion_id
    and ss.room_id = p_room_id
    and v.player_id = v_player_id
    and v.suggestion_id <> v_suggestion_id;

  insert into public.series_suggestion_votes (suggestion_id, player_id)
  values (v_suggestion_id, v_player_id)
  on conflict do nothing;

  perform private.tidy_up_next(p_room_id);
  return public.get_up_next(p_room_id);
end;
$$;

-- Takes your pick back. Returns the board.
create or replace function public.clear_up_next_pick(p_room_id uuid)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid := private.get_player_id_from_auth();
begin
  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  delete from public.series_suggestion_votes v
  using public.series_suggestions ss
  where ss.id = v.suggestion_id
    and ss.room_id = p_room_id
    and v.player_id = v_player_id;

  perform private.tidy_up_next(p_room_id);
  return public.get_up_next(p_room_id);
end;
$$;

-- A host starts the next series from an idea, with the same points as the
-- room's last series (or the usual ones), follows its competition when it's
-- one Crow has, and takes the idea off the board. Picks for other ideas stay
-- for the series after.
create or replace function public.start_series_from_idea(
  p_suggestion_id uuid,
  p_title         text,
  p_follow        boolean default true
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_idea public.series_suggestions%rowtype;
  v_last public.series%rowtype;
  v_series json;
  v_followed boolean := false;
begin
  select * into v_idea
  from public.series_suggestions
  where id = p_suggestion_id and status = 'open'
  for update;

  if not found then
    raise exception 'Idea not found' using errcode = 'P0002';
  end if;

  if not private.is_room_organizer(v_idea.room_id) then
    raise exception 'Only organizers can start a series from an idea' using errcode = 'P0012';
  end if;

  select * into v_last
  from public.series
  where room_id = v_idea.room_id
  order by created_at desc
  limit 1;

  -- create_series checks the title and the caller again.
  v_series := public.create_series(
    v_idea.room_id,
    coalesce(nullif(btrim(p_title), ''), v_idea.title),
    null,
    0,
    coalesce(v_last.starting_stack, 1000),
    coalesce(v_last.weekly_topup, 100),
    coalesce(v_last.min_bets_to_rank, 3)
  );

  if p_follow and v_idea.competition_id is not null and private.competition_on_offer(v_idea.competition_id) then
    insert into public.room_competitions (room_id, competition_id, followed_by)
    values (v_idea.room_id, v_idea.competition_id, private.get_player_id_from_auth())
    on conflict (room_id, competition_id) do nothing;
    v_followed := true;
  end if;

  perform public.mark_series_suggestion_played(p_suggestion_id, (v_series->>'id')::uuid);

  return json_build_object(
    'series_id', v_series->>'id',
    'competition_id', case when v_followed then v_idea.competition_id end
  );
end;
$$;

-- Platform admins: what rooms ask to predict next, over the last 90 days.
-- Competitions Crow has (with how many rooms pick each now and how many
-- started a series from it), then things Crow doesn't have yet, by name.
-- Rooms run by platform admins are left out: they'd skew it.
create or replace function public.admin_get_up_next_demand()
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  return (
    with ideas as (
      select ss.*,
        (select count(*)::int from public.series_suggestion_votes v where v.suggestion_id = ss.id) as picks
      from public.series_suggestions ss
      where ss.status in ('open', 'played')
        and ss.created_at > now() - interval '90 days'
        and not exists (
          select 1 from public.room_members rm
          join public.platform_admins pa on pa.player_id = rm.player_id
          where rm.room_id = ss.room_id and rm.role = 'owner'
        )
    )
    select json_build_object(
      'competitions', coalesce((
        select json_agg(x order by x.rooms desc, x.picks desc, x.name)
        from (
          select c.id, c.name, c.sport,
            private.competition_on_offer(c.id) as on_offer,
            count(distinct i.room_id) filter (where i.status = 'open')::int as rooms,
            coalesce(sum(i.picks) filter (where i.status = 'open'), 0)::int as picks,
            count(*) filter (where i.status = 'played')::int as started,
            max(i.created_at) as last_asked_at
          from ideas i
          join catalog.competitions c on c.id = i.competition_id
          group by c.id
        ) x
      ), '[]'::json),
      'requests', coalesce((
        select json_agg(y order by y.rooms desc, y.picks desc, y.name)
        from (
          select
            -- The spelling most rooms used.
            mode() within group (order by i.title) as name,
            count(distinct i.room_id) filter (where i.status = 'open')::int as rooms,
            coalesce(sum(i.picks) filter (where i.status = 'open'), 0)::int as picks,
            count(*) filter (where i.status = 'played')::int as started,
            max(i.created_at) as last_asked_at
          from ideas i
          where i.competition_id is null
          group by lower(i.title)
        ) y
      ), '[]'::json)
    )
  );
end;
$$;
