-- Event pack questions, what players see:
-- 1. Competition tags: platform admins can set the tag a competition's
--    questions get in rooms (e.g. "Asia Cup" for a long tour name). Null keeps
--    today's rule: the name when it fits, else the sport. Setting one retags
--    the room questions still linked to it.
-- 2. get_prediction_match_result also returns the round, full team names
--    and kickoff, for the match result shown next to a question.

alter table catalog.competitions
  add column if not exists tag text
  check (tag is null or (tag = btrim(tag) and length(tag) between 1 and 24));


-- The tag a competition's questions get in rooms: the one a platform admin
-- set, or else its name when it fits a tag (24 characters), or else the
-- sport.
create or replace function private.competition_tag(p_tag text, p_name text, p_sport text)
returns text
language sql
immutable
set search_path = public, private
as $$
  select coalesce(
    p_tag,
    case
      when char_length(p_name) <= 24 then p_name
      when p_sport = 'soccer' then 'Football'
      else initcap(p_sport)
    end
  );
$$;

revoke execute on function private.competition_tag(text, text, text) from public, anon, authenticated;

-- Organizers add fixture questions to a series: each becomes a normal
-- question that closes at kickoff, linked back to its fixture question.
-- Questions for one match share an event (the one the room already has for
-- that match, if any). Live now, or hidden until p_opens_at as with
-- create_predictions; members get one push for the lot. Questions the room
-- already has are skipped. All or nothing otherwise.
create or replace function public.add_fixture_questions(
  p_room_id              uuid,
  p_series_id            uuid,
  p_fixture_question_ids uuid[],
  p_opens_at             timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id     uuid;
  v_scheduled     boolean := p_opens_at is not null and p_opens_at > now();
  v_series        public.series%rowtype;
  v_next_number   int;
  v_requested     int;
  v_question      record;
  v_event_id      uuid;
  v_event_fixture uuid;
  v_prediction_id uuid;
  v_ids           uuid[] := '{}';
  v_position      int := 0;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not private.is_room_organizer(p_room_id) then
    raise exception 'Only organizers can create predictions' using errcode = 'P0012';
  end if;

  if not exists (select 1 from public.rooms where id = p_room_id and status = 'active') then
    raise exception 'Room not found or closed' using errcode = 'P0002';
  end if;

  v_requested := (select count(distinct x) from unnest(p_fixture_question_ids) x where x is not null);
  if v_requested not between 1 and 60 then
    raise exception 'Add between 1 and 60 questions' using errcode = 'P0001';
  end if;

  if p_series_id is null then
    raise exception 'Predictions must belong to an active series' using errcode = 'P0001';
  end if;

  -- Same lock create_prediction takes, so numbers never collide.
  select * into v_series
  from public.series
  where id = p_series_id
    and room_id = p_room_id
  for update;

  if not found then
    raise exception 'Series not found for this room' using errcode = 'P0002';
  end if;

  if v_series.status <> 'active' then
    raise exception 'Predictions can only be assigned to active series' using errcode = 'P0001';
  end if;

  -- Every one must still be on offer: shown, for a match yet to kick off,
  -- and still open (a toss question closes before the start).
  if (
    select count(*)
    from catalog.fixture_questions q
    join catalog.fixtures f on f.id = q.fixture_id
    join catalog.competitions c on c.id = f.competition_id
    left join catalog.question_templates t on t.id = q.template_id
    where q.id = any(p_fixture_question_ids)
      and not q.hidden
      and (q.template_id is null or private.template_fits(t.active, t.stages, t.formats, f.stage_kind, f.match_format))
      and c.active
      and f.status = 'scheduled'
      and f.kickoff_at - make_interval(mins => coalesce(t.close_minutes_before, 0)::int) > now()
      and f.home_team_id is not null
      and f.away_team_id is not null
  ) <> v_requested then
    raise exception 'Some of those matches have kicked off or changed. Refresh and try again.' using errcode = 'P0001';
  end if;

  if v_scheduled and exists (
    select 1
    from catalog.fixture_questions q
    join catalog.fixtures f on f.id = q.fixture_id
    left join catalog.question_templates t on t.id = q.template_id
    where q.id = any(p_fixture_question_ids)
      and f.kickoff_at - make_interval(mins => coalesce(t.close_minutes_before, 0)::int) < p_opens_at + interval '5 minutes'
  ) then
    raise exception 'Leave at least 5 minutes between going live and the deadline' using errcode = 'P0001';
  end if;

  if not v_scheduled then
    select coalesce(max(series_prediction_number), 0) + 1
      into v_next_number
    from public.predictions
    where series_id = p_series_id;
  end if;

  -- One push for the lot (below), not one per prediction.
  perform set_config('crow.skip_prediction_push', 'on', true);

  for v_question in
    select q.id, q.title, q.description, q.options,
      f.id as fixture_id, f.kickoff_at,
      f.kickoff_at - make_interval(mins => coalesce(t.close_minutes_before, 0)::int) as closes_at,
      h.short_name || ' vs ' || a.short_name as event_title,
      private.competition_tag(c.tag, c.name, c.sport) as competition_name
    from catalog.fixture_questions q
    left join catalog.question_templates t on t.id = q.template_id
    join catalog.fixtures f on f.id = q.fixture_id
    join catalog.competitions c on c.id = f.competition_id
    join catalog.teams h on h.id = f.home_team_id
    join catalog.teams a on a.id = f.away_team_id
    where q.id = any(p_fixture_question_ids)
      -- Already in the room: skip.
      and not exists (
        select 1 from public.predictions p
        where p.room_id = p_room_id
          and p.fixture_question_id = q.id
          and p.status <> 'cancelled'
      )
    order by f.kickoff_at, f.id, q.display_order, q.created_at
  loop
    if v_event_fixture is distinct from v_question.fixture_id then
      v_event_fixture := v_question.fixture_id;
      v_event_id := null;

      select e.id into v_event_id
      from public.prediction_events e
      where e.room_id = p_room_id
        and e.fixture_id = v_question.fixture_id
      order by e.created_at desc
      limit 1;

      if v_event_id is null then
        insert into public.prediction_events (room_id, title, created_by, fixture_id)
        values (p_room_id, left(v_question.event_title, 80), v_player_id, v_question.fixture_id)
        returning id into v_event_id;
      end if;
    end if;

    v_position := v_position + 1;

    insert into public.predictions (
      room_id, series_id, series_prediction_number, created_by, title,
      status, deadline, opens_at, event_id, fixture_question_id, created_at
    )
    values (
      p_room_id,
      p_series_id,
      case when v_scheduled then null else v_next_number + v_position - 1 end,
      v_player_id,
      v_question.title,
      case when v_scheduled then 'scheduled' else 'draft' end,
      -- Picks close at kickoff (a toss question a little before).
      v_question.closes_at,
      case when v_scheduled then p_opens_at else now() end,
      v_event_id,
      v_question.id,
      -- Scheduled ones go live in created order: keep kickoff order.
      now() + (v_position - 1) * interval '1 microsecond'
    )
    returning id into v_prediction_id;

    insert into public.prediction_options (prediction_id, label, display_order, option_key)
    select v_prediction_id, o.value->>'label', (o.position - 1)::smallint, o.value->>'key'
    from jsonb_array_elements(v_question.options) with ordinality as o(value, position);

    -- The competition's tag, so History can filter by it.
    perform public.set_prediction_details(
      v_prediction_id,
      v_question.description,
      array[v_question.competition_name]
    );

    if not v_scheduled then
      perform private.create_room_activity(
        p_room_id := p_room_id,
        p_activity_type := 'prediction_created',
        p_activity_tier := 2,
        p_metadata := private.build_prediction_activity_metadata(v_prediction_id),
        p_click_action := jsonb_build_object('type', 'prediction', 'predictionId', v_prediction_id),
        p_created_by_player_id := v_player_id,
        p_dedupe_key := 'prediction_created:' || v_prediction_id::text
      );
    end if;

    v_ids := v_ids || v_prediction_id;
  end loop;

  perform set_config('crow.skip_prediction_push', 'off', true);

  if cardinality(v_ids) = 0 then
    raise exception 'Those questions are already in this room' using errcode = 'P0001';
  end if;

  if not v_scheduled then
    perform private.push_for_predictions(
      'prediction_live',
      v_ids,
      '🎯 New question',
      '🎯 %s new questions'
    );
  end if;

  return json_build_object(
    'room_id',        p_room_id,
    'series_id',      p_series_id,
    'status',         case when v_scheduled then 'scheduled' else 'draft' end,
    'opens_at',       case when v_scheduled then p_opens_at else now() end,
    'prediction_ids', to_json(v_ids),
    'count',          cardinality(v_ids),
    'skipped',        v_requested - cardinality(v_ids)
  );
end;
$$;

-- The match a room question came from, and how it ended, for showing next
-- to the question's result: its teams (short and full names), round,
-- venue, the confirmed result (a football score, or a cricket scoreboard
-- and toss) and when it was confirmed. Null
-- for a question that isn't from the fixtures, or before an admin has
-- confirmed the match. Anyone who can see the question.
create or replace function public.get_prediction_match_result(p_prediction_id uuid)
returns json
language sql
stable
security definer
set search_path = public, private
as $$
  select json_build_object(
    'sport', c.sport,
    'competition', c.name,
    'format', f.match_format,
    'label', f.label,
    'round', f.round_label,
    'venue', f.venue,
    'kickoff_at', f.kickoff_at,
    'home', h.short_name,
    'away', a.short_name,
    'home_name', h.name,
    'away_name', a.name,
    'status', f.status,
    'result', f.result,
    'confirmed_at', f.result_confirmed_at
  )
  from public.predictions p
  join catalog.fixture_questions q on q.id = p.fixture_question_id
  join catalog.fixtures f on f.id = q.fixture_id
  join catalog.competitions c on c.id = f.competition_id
  left join catalog.teams h on h.id = f.home_team_id
  left join catalog.teams a on a.id = f.away_team_id
  where p.id = p_prediction_id
    and f.result_confirmed_at is not null
    and private.can_view_prediction(p.id);
$$;

-- Every competition, on or off, with how many rooms follow it.
create or replace function public.admin_get_competitions()
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
    select coalesce(json_agg(json_build_object(
      'id', c.id,
      'name', c.name,
      -- The tag its questions get, and whether an admin set it.
      'tag', private.competition_tag(c.tag, c.name, c.sport),
      'tag_is_custom', c.tag is not null,
      'sport', c.sport,
      'provider', c.provider,
      'provider_ref', c.provider_ref,
      'kind', c.kind,
      'starts_on', c.starts_on,
      'ends_on', c.ends_on,
      'region', c.region,
      'season', c.current_season,
      'active', c.active,
      'synced_at', c.synced_at,
      'last_sync_error', c.last_sync_error,
      'last_sync_error_at', c.last_sync_error_at,
      'rooms', (select count(*)::int from public.room_competitions rc where rc.competition_id = c.id),
      'upcoming', (
        select count(*)::int from catalog.fixtures f
        where f.competition_id = c.id and f.status = 'scheduled' and f.kickoff_at > now()
      )
    ) order by c.display_order, c.name), '[]'::json)
    from catalog.competitions c
  );
end;
$$;

-- Sets the tag a competition's questions get in rooms (null or blank goes
-- back to the default: the name when it fits, else the sport). Questions
-- rooms already added from it, still linked to it (a host's edit unlinks
-- one), swap the old tag for the new one.
create or replace function public.admin_set_competition_tag(
  p_competition_id uuid,
  p_tag            text
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_competition catalog.competitions%rowtype;
  v_old text;
  v_new text;
  v_tag text := nullif(btrim(p_tag), '');
  v_updated int := 0;
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  if v_tag is not null and char_length(v_tag) > 24 then
    raise exception 'A tag is 24 characters at most' using errcode = 'P0001';
  end if;

  select * into v_competition from catalog.competitions where id = p_competition_id for update;
  if not found then
    raise exception 'Competition not found' using errcode = 'P0002';
  end if;

  v_old := private.competition_tag(v_competition.tag, v_competition.name, v_competition.sport);
  v_new := private.competition_tag(v_tag, v_competition.name, v_competition.sport);

  update catalog.competitions set tag = v_tag where id = p_competition_id;

  if v_new is distinct from v_old then
    -- Room questions linked to this competition's matches that carry the old tag.
    create temporary table _retag on commit drop as
    select t.id, t.prediction_id
    from public.prediction_tags t
    join public.predictions p on p.id = t.prediction_id
    join catalog.fixture_questions q on q.id = p.fixture_question_id
    join catalog.fixtures f on f.id = q.fixture_id
    where f.competition_id = p_competition_id
      and lower(t.tag) = lower(v_old);

    -- A question that already has the new tag just loses the old one.
    delete from public.prediction_tags t
    using _retag r
    where t.id = r.id
      and exists (
        select 1 from public.prediction_tags other
        where other.prediction_id = r.prediction_id
          and other.id <> r.id
          and lower(other.tag) = lower(v_new)
      );

    update public.prediction_tags t
    set tag = v_new
    from _retag r
    where t.id = r.id;
    get diagnostics v_updated = row_count;

    drop table _retag;
  end if;

  return json_build_object(
    'id', p_competition_id,
    'tag', v_new,
    'tag_is_custom', v_tag is not null,
    'questions_retagged', v_updated
  );
end;
$$;

revoke execute on function public.admin_set_competition_tag(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_competition_tag(uuid, text) to authenticated;

-- A tag can be given when adding: a new signature, so the old one goes.
drop function if exists public.admin_add_competition(text, text, text, text, text, text, date, date);

-- Platform admins add a competition the provider lists (a cricket series
-- found with the search in /admin), or turn an existing one back on. It's
-- synced on the next run; Sync in /admin starts it now.
create or replace function public.admin_add_competition(
  p_provider     text,
  p_provider_ref text,
  p_name         text,
  p_sport        text,
  p_kind         text,
  p_region       text default null,
  p_starts_on    date default null,
  p_ends_on      date default null,
  -- The tag its questions get; null for the default (see competition_tag).
  p_tag          text default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  if nullif(btrim(p_name), '') is null or nullif(btrim(p_provider_ref), '') is null then
    raise exception 'A competition needs a name and the provider''s id' using errcode = 'P0001';
  end if;

  if char_length(btrim(coalesce(p_tag, ''))) > 24 then
    raise exception 'A tag is 24 characters at most' using errcode = 'P0001';
  end if;

  insert into catalog.competitions (
    sport, name, format, kind, region, provider, provider_ref, active, display_order, starts_on, ends_on, tag
  )
  values (
    p_sport, left(btrim(p_name), 40),
    case p_kind when 'league' then 'league' when 'cup' then 'knockout' else 'mixed' end,
    p_kind, nullif(btrim(p_region), ''), p_provider, p_provider_ref, true,
    coalesce((select max(display_order) + 1 from catalog.competitions), 1),
    p_starts_on, p_ends_on, nullif(btrim(p_tag), '')
  )
  on conflict (provider, provider_ref) do update
    set active = true,
        tag = coalesce(excluded.tag, catalog.competitions.tag),
        starts_on = coalesce(excluded.starts_on, catalog.competitions.starts_on),
        ends_on = coalesce(excluded.ends_on, catalog.competitions.ends_on)
  returning id into v_id;

  return json_build_object('id', v_id);
end;
$$;

revoke execute on function public.admin_add_competition(text, text, text, text, text, text, date, date, text) from public, anon, authenticated;
grant execute on function public.admin_add_competition(text, text, text, text, text, text, date, date, text) to authenticated;
