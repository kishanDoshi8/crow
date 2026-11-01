-- ============================================================
-- Migration: series_streaks_prediction_details
-- Description: Win streaks in the series standings now count that series
--   only. Predictions gain an optional description and keep their tags as
--   typed (one per prediction whatever the case), set by organizers through
--   set_prediction_details; get_room_tags offers tags used before.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Description and tags
-- ------------------------------------------------------------
alter table public.predictions
  add column if not exists description text
  check (description is null or char_length(description) <= 500);

grant select (id, room_id, series_id, series_prediction_number, created_by, title, status, deadline, winning_option_id, no_result_reason, affects_rating, resolved_at, resolved_by, notified_1h, notified_result_needed, created_at, description) on public.predictions to authenticated;

alter table public.prediction_tags drop constraint if exists prediction_tags_tag_normalized;
alter table public.prediction_tags drop constraint if exists prediction_tags_prediction_id_tag_key;
alter table public.prediction_tags drop constraint if exists prediction_tags_tag_trimmed;
alter table public.prediction_tags
  add constraint prediction_tags_tag_trimmed check (tag = btrim(tag) and length(tag) between 1 and 24);
create unique index if not exists uq_prediction_tags_prediction_tag
  on public.prediction_tags (prediction_id, lower(tag));

-- Organizers set a prediction's optional description and tags. Tags are kept
-- as typed, trimmed, with repeats (any case) dropped; up to five, 24 chars each.
create or replace function public.set_prediction_details(
  p_prediction_id uuid,
  p_description text,
  p_tags text[]
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_room_id uuid;
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_tags text[];
begin
  v_player_id := private.get_player_id_from_auth();

  select p.room_id into v_room_id
  from public.predictions p
  where p.id = p_prediction_id;

  if v_room_id is null or not exists (
    select 1 from public.room_members rm
    where rm.room_id = v_room_id
      and rm.player_id = v_player_id
      and rm.role in ('owner', 'organizer')
  ) then
    raise exception 'Only organizers can edit a prediction' using errcode = 'P0012';
  end if;

  if v_description is not null and char_length(v_description) > 500 then
    raise exception 'Keep the description under 500 characters' using errcode = 'P0001';
  end if;

  -- Tidy, drop blanks and repeats (first spelling wins), keep the order given.
  select coalesce(array_agg(t.tag order by t.first_pos), '{}')
  into v_tags
  from (
    select distinct on (lower(c.tag)) c.tag, c.pos as first_pos
    from (
      select regexp_replace(btrim(x.tag), '\s+', ' ', 'g') as tag, x.pos
      from unnest(coalesce(p_tags, '{}')) with ordinality as x(tag, pos)
    ) c
    where c.tag <> ''
    order by lower(c.tag), c.pos
  ) t;

  if cardinality(v_tags) > 5 then
    raise exception 'Use up to 5 tags' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_tags) t where char_length(t) > 24) then
    raise exception 'Keep each tag under 24 characters' using errcode = 'P0001';
  end if;

  update public.predictions set description = v_description where id = p_prediction_id;

  delete from public.prediction_tags where prediction_id = p_prediction_id;
  insert into public.prediction_tags (prediction_id, tag)
  select p_prediction_id, t from unnest(v_tags) t;

  return json_build_object('description', v_description, 'tags', to_json(v_tags));
end;
$$;

-- Tags already used in a room, most used first, for suggestions. Each tag is
-- shown as it was last typed.
create or replace function public.get_room_tags(
  p_room_id uuid
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_result json;
begin
  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  select coalesce(json_agg(t.tag order by t.uses desc, t.last_used desc, lower(t.tag)), '[]'::json)
  into v_result
  from (
    select
      (array_agg(pt.tag order by pt.created_at desc))[1] as tag,
      count(*) as uses,
      max(pt.created_at) as last_used
    from public.prediction_tags pt
    join public.predictions p on p.id = pt.prediction_id
    where p.room_id = p_room_id
    group by lower(pt.tag)
    order by count(*) desc, max(pt.created_at) desc, lower(pt.tag)
    limit 30
  ) t;

  return v_result;
end;
$$;

revoke execute on function public.set_prediction_details(uuid, text, text[]) from public, anon, authenticated;
revoke execute on function public.get_room_tags(uuid) from public, anon, authenticated;
grant execute on function public.set_prediction_details(uuid, text, text[]) to authenticated;
grant execute on function public.get_room_tags(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. Streaks per series
-- ------------------------------------------------------------
-- Each player's win streaks within one series: the current run of wins up to
-- their latest revealed bet, and the longest run. No-result and cancelled
-- predictions neither extend nor break a streak.
create or replace function private.series_streaks(
  p_series_id uuid
)
returns table (
  player_id uuid,
  current_streak integer,
  highest_streak integer
)
language sql
stable
security definer
set search_path = public, private
as $$
  with results as (
    select
      b.player_id,
      (b.option_id = p.winning_option_id) as is_win,
      row_number() over (
        partition by b.player_id
        order by p.resolved_at nulls last, p.series_prediction_number, p.id
      ) as seq
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status = 'revealed'
      and p.winning_option_id is not null
  ),
  -- Each loss starts a new group; wins after it share that group.
  grouped as (
    select
      r.*,
      sum(case when r.is_win then 0 else 1 end) over (
        partition by r.player_id order by r.seq
      ) as loss_group
    from results r
  ),
  runs as (
    select g.player_id, g.loss_group, count(*) filter (where g.is_win)::int as wins, max(g.seq) as last_seq
    from grouped g
    group by g.player_id, g.loss_group
  ),
  latest as (
    select r.player_id, max(r.seq) as last_seq
    from results r
    group by r.player_id
  )
  select
    l.player_id,
    coalesce((
      select ru.wins from runs ru
      where ru.player_id = l.player_id and ru.last_seq = l.last_seq
    ), 0) as current_streak,
    coalesce((select max(ru.wins) from runs ru where ru.player_id = l.player_id), 0) as highest_streak
  from latest l;
$$;

revoke execute on function private.series_streaks(uuid) from public, anon, authenticated;

create or replace function public.get_series_leaderboard(
  p_room_id uuid,
  p_series_id uuid,
  p_sort_by text default 'points'
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_caller_id uuid;
  v_is_member boolean;
  v_series public.series%rowtype;
  v_required integer;
  v_result json;
  v_week_key text := private.current_week_key();
  v_has_snapshot boolean;
begin
  v_caller_id := private.get_player_id_from_auth();
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'P0004';
  end if;

  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and player_id = v_caller_id
  ) into v_is_member;

  if not v_is_member then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  select * into v_series
  from public.series s
  where s.id = p_series_id
    and s.room_id = p_room_id;

  if not found then
    raise exception 'Series not found for this room' using errcode = 'P0002';
  end if;

  if p_sort_by not in ('points', 'rating', 'accuracy', 'streak') then
    raise exception 'Invalid sort mode: %', p_sort_by using errcode = 'P0001';
  end if;

  v_required := private.series_required_bets(p_series_id);

  -- Movement is measured against this week's Monday snapshot.
  select exists (
    select 1 from public.series_standing_snapshots
    where series_id = p_series_id and week_key = v_week_key
  ) into v_has_snapshot;

  with stats as (
    select *
    from private.get_leaderboard_player_stats(
      p_room_id,
      p_series_id,
      false
    )
  ),
  base_current as (
    select
      rm.player_id,
      p.username,
      coalesce(s.net_profit, 0) as total_won_in_room,
      -- Series that closed before wallets existed fall back to stack + profit.
      coalesce(w.balance, v_series.starting_stack + coalesce(s.net_profit, 0)::int) as balance,
      coalesce(w.balance - w.escrow, v_series.starting_stack + coalesce(s.net_profit, 0)::int) as available,
      coalesce(w.granted, v_series.starting_stack) as granted,
      rm.joined_at,
      rm.is_organizer,
      -- Streaks count this series only.
      coalesce(st.current_streak, 0) as current_streak,
      coalesce(st.highest_streak, 0) as highest_streak,
      rm.prediction_rating,
      rm.peak_prediction_rating,
      rm.rated_predictions_count,
      coalesce(s.total_bets, 0) as total_bets,
      coalesce(s.total_revealed_bets, 0) as total_revealed_bets,
      coalesce(s.winning_bets, 0) as winning_bets,
      coalesce(s.total_wagered, 0) as total_wagered,
      coalesce(s.total_payout, 0) as total_payout,
      coalesce(s.total_profit, 0) as total_profit,
      coalesce(s.total_loss, 0) as total_loss,
      coalesce(s.net_profit, 0) as net_points,
      case
        when coalesce(s.total_revealed_bets, 0) > 0 then
          round((coalesce(s.winning_bets, 0)::numeric / s.total_revealed_bets) * 100, 1)
        else 0
      end as win_percentage,
      case
        when coalesce(s.total_revealed_bets, 0) > 0 then
          coalesce(s.winning_bets, 0)::numeric / s.total_revealed_bets
      end as accuracy_ratio,
      -- Only players who bet on enough settled predictions are ranked.
      coalesce(s.total_bets, 0) >= v_required as is_ranked,
      greatest(v_required - coalesce(s.total_bets, 0), 0)::int as bets_needed
    from public.room_members rm
    join public.players p on p.id = rm.player_id
    left join stats s on s.player_id = rm.player_id
    left join private.series_streaks(p_series_id) st on st.player_id = rm.player_id
    left join public.series_wallets w on w.series_id = p_series_id and w.player_id = rm.player_id
    where rm.room_id = p_room_id
  ),
  ranked as (
    select
      bc.*,
      case when bc.is_ranked then rank() over (
        partition by bc.is_ranked
        order by
          case when p_sort_by = 'points' then bc.balance end desc nulls last,
          case when p_sort_by = 'points' then bc.winning_bets end desc nulls last,
          case when p_sort_by = 'rating' then bc.prediction_rating end desc nulls last,
          case when p_sort_by = 'rating' then bc.rated_predictions_count end desc nulls last,
          case when p_sort_by = 'accuracy' then bc.accuracy_ratio end desc nulls last,
          case when p_sort_by = 'accuracy' then bc.total_revealed_bets end desc nulls last,
          case when p_sort_by = 'streak' then bc.current_streak end desc nulls last,
          case when p_sort_by = 'streak' then bc.highest_streak end desc nulls last,
          bc.joined_at asc nulls last
      ) end as rank
    from base_current bc
  )
  -- Ranked players first, then everyone still short of the bar, closest first.
  select json_agg(lb order by lb.rank nulls last, lb.bets_needed, lb.username, lb.player_id)
  into v_result
  from (
    select
      r.player_id,
      r.username,
      r.total_won_in_room,
      r.balance,
      r.available,
      r.granted,
      r.joined_at,
      r.is_organizer,
      r.current_streak,
      r.highest_streak,
      r.prediction_rating,
      r.peak_prediction_rating,
      r.rated_predictions_count,
      r.total_bets,
      r.total_revealed_bets,
      r.winning_bets,
      r.total_wagered,
      r.total_payout,
      r.net_points,
      r.net_points as net_profit,
      r.win_percentage,
      r.rank,
      r.is_ranked,
      r.bets_needed,
      v_required as required_bets,
      -- Movement since Monday, for the points standings only.
      case when p_sort_by = 'points' then snap.rank end as previous_rank,
      case
        when p_sort_by = 'points' and r.rank is not null and snap.rank is not null
          then snap.rank - r.rank
      end as rank_change,
      -- Ranked now but not on Monday (joined late or just reached the bar).
      (p_sort_by = 'points' and v_has_snapshot and r.rank is not null
        and not coalesce(snap.is_ranked, false)) as rank_is_new,
      null::numeric as previous_prediction_rating,
      null::numeric as rating_change,
      null::numeric as previous_total_won_in_room,
      null::numeric as points_change
    from ranked r
    left join public.series_standing_snapshots snap
      on snap.series_id = p_series_id
     and snap.player_id = r.player_id
     and snap.week_key = v_week_key
  ) lb;

  return coalesce(v_result, '[]'::json);
end;
$$;

