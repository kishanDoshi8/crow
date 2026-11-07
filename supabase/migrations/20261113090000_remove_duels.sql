-- ============================================================
-- Migration: remove_duels
-- Description: Duels are retired for good. Drops their tables, functions
--   and triggers, the duel entries in room feeds and the "Duelist"
--   (MOST_DUEL_WINS) series trophy, and rebuilds what referred to them.
-- ============================================================

-- ------------------------------------------------------------
-- 1. History that only made sense with duels
-- ------------------------------------------------------------
delete from public.room_activities where activity_type like 'duel\_%';
-- Finished series' results are locked by a trigger; this is the one sanctioned edit.
alter table public.series_awards disable trigger trg_series_awards_immutable;
delete from public.series_awards where award_type = 'MOST_DUEL_WINS';
alter table public.series_awards enable trigger trg_series_awards_immutable;

-- ------------------------------------------------------------
-- 2. Triggers on tables that stay
-- ------------------------------------------------------------
drop trigger if exists trg_predictions_duel_status on public.predictions;
drop trigger if exists trg_prevent_locked_duel_bet_changes on public.bets;

-- ------------------------------------------------------------
-- 3. Functions
-- ------------------------------------------------------------
drop function if exists public.cancel_duel(uuid, uuid);
drop function if exists public.cancel_duel_queue(uuid, uuid);
drop function if exists public.cancel_duel_queue_view(uuid, uuid);
drop function if exists public.cancel_duel_view(uuid, uuid);
drop function if exists public.create_duel(uuid, uuid, uuid, integer);
drop function if exists public.create_duel_view(uuid, uuid, uuid, integer);
drop function if exists public.get_prediction_duel_summary(uuid);
drop function if exists public.get_prediction_duels_view(uuid);
drop function if exists public.join_duel_queue(uuid, uuid, uuid);
drop function if exists public.join_duel_queue_view(uuid, uuid, uuid);
drop function if exists public.resolve_duels_for_prediction(uuid);
drop function if exists private.build_duel_activity_metadata(uuid);
drop function if exists private.get_duel_view_model(uuid, uuid);
drop function if exists private.log_duel_event(uuid, uuid, text, jsonb);
drop function if exists private.process_duels_on_prediction_lock(uuid);
drop function if exists private.release_duel_escrow(uuid, integer, text);
drop function if exists private.on_prediction_duel_status_change();
drop function if exists private.prevent_locked_duel_bet_changes();

-- ------------------------------------------------------------
-- 4. Tables (their own triggers and policies go with them)
-- ------------------------------------------------------------
drop table if exists public.duel_queue;
drop table if exists private.duel_events;
drop table if exists public.duels;

drop function if exists private.validate_duel_record();
drop function if exists private.validate_duel_queue_record();
drop function if exists private.enforce_duel_queue_status_transition();
drop function if exists private.can_view_duel(uuid);

-- ------------------------------------------------------------
-- 5. The trophy type without MOST_DUEL_WINS
-- ------------------------------------------------------------
drop function if exists private.series_award_tier(public.series_award_type, numeric, integer, integer);
alter type public.series_award_type rename to series_award_type_old;
create type public.series_award_type as enum (
  'LONGEST_STREAK',
  'BIGGEST_PROFIT',
  'MOST_POINTS_RISKED',
  'EVER_PRESENT',
  'SHARPSHOOTER',
  'UNDERDOG',
  'COMEBACK',
  'HOT_FINISH'
);
alter table public.series_awards
  alter column award_type type public.series_award_type
  using award_type::text::public.series_award_type;
drop type public.series_award_type_old;

-- ------------------------------------------------------------
-- 6. Functions that mentioned duels, rebuilt from supabase/schemas
-- ------------------------------------------------------------

-- core/functions/private_series_tier
-- How much a finished series' trophies are worth, from its size.
-- Players counts only those who qualified (see private.series_required_bets).
create or replace function private.series_tier(
  p_games integer,
  p_players integer
)
returns text
language sql
immutable
set search_path = public, private
as $$
  select case
    when coalesce(p_games, 0) <= 7 or coalesce(p_players, 0) <= 2 then 'minor'
    when p_games >= 20 and p_players >= 5 then 'major'
    else 'standard'
  end;
$$;

-- How many of a series' last settled predictions count as its finish.
create or replace function private.series_finish_window(
  p_games integer
)
returns integer
language sql
immutable
set search_path = public, private
as $$
  select greatest(3, ceil(coalesce(p_games, 0) * 0.25))::int;
$$;

-- How impressive an award was for its series: gold, silver or bronze.
-- Compares the type as text so new award types can be added and used in one migration.
create or replace function private.series_award_tier(
  p_award_type public.series_award_type,
  p_value numeric,
  p_games integer,
  p_starting_stack integer
)
returns text
language sql
immutable
set search_path = public, private
as $$
  select case p_award_type::text
    when 'LONGEST_STREAK' then case
      when p_value >= 4 and p_value >= 0.25 * greatest(p_games, 1) then 'gold'
      when p_value >= 3 and p_value >= 0.15 * greatest(p_games, 1) then 'silver'
      else 'bronze'
    end
    when 'BIGGEST_PROFIT' then case
      when p_value >= 1.0 * greatest(p_starting_stack, 1) then 'gold'
      when p_value >= 0.5 * greatest(p_starting_stack, 1) then 'silver'
      else 'bronze'
    end
    when 'MOST_POINTS_RISKED' then case
      when p_value >= 5 * greatest(p_starting_stack, 1) then 'gold'
      when p_value >= 2 * greatest(p_starting_stack, 1) then 'silver'
      else 'bronze'
    end
    when 'EVER_PRESENT' then case
      when p_value >= 20 then 'gold'
      when p_value >= 10 then 'silver'
      else 'bronze'
    end
    -- Win rate, as a percentage of settled bets.
    when 'SHARPSHOOTER' then case
      when p_value >= 75 then 'gold'
      when p_value >= 60 then 'silver'
      else 'bronze'
    end
    -- Payout multiplier of the winning bet.
    when 'UNDERDOG' then case
      when p_value >= 5 then 'gold'
      when p_value >= 3 then 'silver'
      else 'bronze'
    end
    -- Places climbed from the lowest weekly rank.
    when 'COMEBACK' then case
      when p_value >= 5 then 'gold'
      when p_value >= 3 then 'silver'
      else 'bronze'
    end
    -- Wins over the final stretch (see private.series_finish_window).
    when 'HOT_FINISH' then case
      when p_value >= private.series_finish_window(p_games) then 'gold'
      when p_value >= 0.75 * private.series_finish_window(p_games) then 'silver'
      else 'bronze'
    end
    else 'bronze'
  end;
$$;

-- core/functions/complete_series
create or replace function public.complete_series(
  p_series_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_series public.series%rowtype;
  v_unfinished_predictions integer;
  v_required_bets integer;
  v_completed_predictions integer;
  v_eligible_players integer;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select s.* into v_series
  from public.series s
  join public.room_members rm
    on rm.room_id = s.room_id
   and rm.player_id = v_player_id
   and rm.role in ('owner', 'organizer')
  where s.id = p_series_id
  for update;

  if not found then
    raise exception 'Series not found or access denied' using errcode = 'P0002';
  end if;

  if v_series.status <> 'active' then
    raise exception 'Only active series can be completed' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.series_placements sp where sp.series_id = p_series_id
  ) or exists (
    select 1 from public.series_awards sa where sa.series_id = p_series_id
  ) then
    raise exception 'Series final results already exist' using errcode = 'P0001';
  end if;

  select count(*)::int
  into v_unfinished_predictions
  from public.predictions p
  where p.series_id = p_series_id
    and p.status in ('draft', 'locked');

  if v_unfinished_predictions > 0 then
    raise exception 'Series has unfinished predictions and cannot be completed' using errcode = 'P0001';
  end if;

  -- The same bar decides who can place and who can win awards.
  v_required_bets := private.series_required_bets(p_series_id);

  select count(*)::int
  into v_completed_predictions
  from public.predictions p
  where p.series_id = p_series_id
    and p.status in ('revealed', 'no_result');

  -- Players who qualified, which (with games) sets how much the series' trophies are worth.
  select count(*)::int
  into v_eligible_players
  from (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ) eligible;

  insert into public.series_placements (series_id, player_id, placement, points)
  with leaderboard as (
    select
      rm.player_id,
      coalesce(w.balance, v_series.starting_stack + coalesce(stats.net_profit, 0))::numeric as balance,
      coalesce(w.balance - w.granted, coalesce(stats.net_profit, 0))::numeric as net_profit
    from public.room_members rm
    left join public.series_wallets w
      on w.series_id = p_series_id
     and w.player_id = rm.player_id
    left join private.get_leaderboard_player_stats(
      v_series.room_id,
      p_series_id,
      false
    ) stats on stats.player_id = rm.player_id
    where rm.room_id = v_series.room_id
      -- Only players who bet on enough settled predictions can place.
      and coalesce(stats.total_bets, 0) >= v_required_bets
  ),
  -- The final balance decides the title; placements record net profit for the Hall of Fame.
  ranked as (
    select
      l.player_id,
      l.net_profit,
      rank() over (order by l.balance desc) as placement
    from leaderboard l
  )
  select
    p_series_id,
    r.player_id,
    r.placement,
    r.net_profit
  from ranked r
  where r.placement <= 3;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with series_predictions as (
    select
      p.id,
      p.status,
      p.series_prediction_number,
      p.created_at,
      p.winning_option_id
    from public.predictions p
    where p.series_id = p_series_id
  ),
  player_participation as (
    select
      b.player_id,
      count(distinct b.prediction_id)::int as prediction_count
    from public.bets b
    join series_predictions sp
      on sp.id = b.prediction_id
     and sp.status in ('revealed', 'no_result')
    group by b.player_id
  ),
  eligible_players as (
    select pp.player_id
    from player_participation pp
    where pp.prediction_count >= v_required_bets
  ),
  -- The same streaks the series standings showed all season, results in the
  -- order they came in.
  player_streaks as (
    select ss.player_id, ss.highest_streak::numeric as award_value
    from private.series_streaks(p_series_id) ss
    join eligible_players ep on ep.player_id = ss.player_id
  ),
  top_value as (
    select max(ps.award_value) as value
    from player_streaks ps
  )
  select
    p_series_id,
    ps.player_id,
    'LONGEST_STREAK'::public.series_award_type,
    ps.award_value,
    'Achieved the longest winning streak in this Series.',
    private.series_award_tier('LONGEST_STREAK', ps.award_value, v_completed_predictions, v_series.starting_stack)
  from player_streaks ps
  cross join top_value tv
  where tv.value is not null
    and tv.value > 0
    and ps.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with series_predictions as (
    select p.id, p.status
    from public.predictions p
    where p.series_id = p_series_id
  ),
  player_participation as (
    select
      b.player_id,
      count(distinct b.prediction_id)::int as prediction_count
    from public.bets b
    join series_predictions sp
      on sp.id = b.prediction_id
     and sp.status in ('revealed', 'no_result')
    group by b.player_id
  ),
  eligible_players as (
    select pp.player_id
    from player_participation pp
    where pp.prediction_count >= v_required_bets
  ),
  player_biggest_profit as (
    select
      b.player_id,
      max(greatest(coalesce(b.payout, 0) - b.amount, 0))::numeric as award_value
    from public.bets b
    join series_predictions sp on sp.id = b.prediction_id
    join eligible_players ep on ep.player_id = b.player_id
    group by b.player_id
  ),
  top_value as (
    select max(pbp.award_value) as value
    from player_biggest_profit pbp
  )
  select
    p_series_id,
    pbp.player_id,
    'BIGGEST_PROFIT'::public.series_award_type,
    pbp.award_value,
    'Recorded the biggest single prediction profit.',
    private.series_award_tier('BIGGEST_PROFIT', pbp.award_value, v_completed_predictions, v_series.starting_stack)
  from player_biggest_profit pbp
  cross join top_value tv
  where tv.value is not null
    and tv.value > 0
    and pbp.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with series_predictions as (
    select p.id, p.status
    from public.predictions p
    where p.series_id = p_series_id
  ),
  player_participation as (
    select
      b.player_id,
      count(distinct b.prediction_id)::int as prediction_count
    from public.bets b
    join series_predictions sp
      on sp.id = b.prediction_id
     and sp.status in ('revealed', 'no_result')
    group by b.player_id
  ),
  eligible_players as (
    select pp.player_id
    from player_participation pp
    where pp.prediction_count >= v_required_bets
  ),
  points_risked as (
    select
      b.player_id,
      sum(b.amount)::numeric as award_value
    from public.bets b
    join series_predictions sp on sp.id = b.prediction_id
    join eligible_players ep on ep.player_id = b.player_id
    group by b.player_id
  ),
  top_value as (
    select max(pr.award_value) as value
    from points_risked pr
  )
  select
    p_series_id,
    pr.player_id,
    'MOST_POINTS_RISKED'::public.series_award_type,
    pr.award_value,
    'Risked the most points during this Series.',
    private.series_award_tier('MOST_POINTS_RISKED', pr.award_value, v_completed_predictions, v_series.starting_stack)
  from points_risked pr
  cross join top_value tv
  where tv.value is not null
    and tv.value > 0
    and pr.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with completed_predictions as (
    select p.id
    from public.predictions p
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
  ),
  player_participation as (
    select
      b.player_id,
      count(distinct p.id)::int as prediction_count
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
  ),
  eligible_players as (
    select pp.player_id
    from player_participation pp
    where pp.prediction_count >= v_required_bets
  ),
  player_completed_participation as (
    select
      b.player_id,
      count(distinct b.prediction_id)::int as completed_prediction_count
    from public.bets b
    join completed_predictions cp on cp.id = b.prediction_id
    group by b.player_id
  )
  select
    p_series_id,
    ep.player_id,
    'EVER_PRESENT'::public.series_award_type,
    v_completed_predictions::numeric,
    'Participated in every completed prediction.',
    private.series_award_tier('EVER_PRESENT', v_completed_predictions::numeric, v_completed_predictions, v_series.starting_stack)
  from eligible_players ep
  left join player_completed_participation pcp on pcp.player_id = ep.player_id
  where v_completed_predictions > 0
    and coalesce(pcp.completed_prediction_count, 0) = v_completed_predictions;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with
  eligible_players as (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ),
  -- Share of their settled bets that won, as a percentage.
  candidates as (
    select
      b.player_id,
      round(100.0 * count(*) filter (where b.option_id = p.winning_option_id) / count(*), 1) as award_value
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    join eligible_players ep on ep.player_id = b.player_id
    where p.series_id = p_series_id
      and p.status = 'revealed'
      and p.winning_option_id is not null
    group by b.player_id
    having count(*) >= greatest(v_required_bets, 3)
  ),
  top_value as (
    select max(c.award_value) as value
    from candidates c
  )
  select
    p_series_id,
    c.player_id,
    'SHARPSHOOTER'::public.series_award_type,
    c.award_value,
    'Called the highest share of results in this Series.',
    private.series_award_tier('SHARPSHOOTER', c.award_value, v_completed_predictions, v_series.starting_stack)
  from candidates c
  cross join top_value tv
  where tv.value is not null
    and tv.value > 0
    and c.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with
  eligible_players as (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ),
  -- The longest odds they won at: the whole pool over the stake on the winning side.
  odds as (
    select
      p.id,
      p.winning_option_id,
      sum(b.amount)::numeric / nullif(sum(b.amount) filter (where b.option_id = p.winning_option_id), 0) as value
    from public.predictions p
    join public.bets b on b.prediction_id = p.id
    where p.series_id = p_series_id
      and p.status = 'revealed'
    group by p.id, p.winning_option_id
  ),
  candidates as (
    select
      b.player_id,
      max(round(o.value, 2)) as award_value
    from public.bets b
    join odds o on o.id = b.prediction_id and b.option_id = o.winning_option_id
    join eligible_players ep on ep.player_id = b.player_id
    group by b.player_id
  ),
  top_value as (
    select max(c.award_value) as value
    from candidates c
  )
  select
    p_series_id,
    c.player_id,
    'UNDERDOG'::public.series_award_type,
    c.award_value,
    'Won against the longest odds in this Series.',
    private.series_award_tier('UNDERDOG', c.award_value, v_completed_predictions, v_series.starting_stack)
  from candidates c
  cross join top_value tv
  where tv.value is not null
    and tv.value >= 2
    and c.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with
  eligible_players as (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ),
  -- Places climbed from their lowest weekly rank to where they finished.
  final_ranks as (
    select st.player_id, st.rank
    from private.series_standings(p_series_id) st
    where st.is_ranked
  ),
  lowest_ranks as (
    select ss.player_id, max(ss.rank) as rank
    from public.series_standing_snapshots ss
    where ss.series_id = p_series_id
      and ss.is_ranked
      and ss.rank is not null
    group by ss.player_id
  ),
  candidates as (
    select fr.player_id, (lr.rank - fr.rank)::numeric as award_value
    from final_ranks fr
    join lowest_ranks lr on lr.player_id = fr.player_id
    join eligible_players ep on ep.player_id = fr.player_id
  ),
  top_value as (
    select max(c.award_value) as value
    from candidates c
  )
  select
    p_series_id,
    c.player_id,
    'COMEBACK'::public.series_award_type,
    c.award_value,
    'Climbed the most places from their lowest point in this Series.',
    private.series_award_tier('COMEBACK', c.award_value, v_completed_predictions, v_series.starting_stack)
  from candidates c
  cross join top_value tv
  where tv.value is not null
    and tv.value >= 2
    and c.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with
  eligible_players as (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ),
  -- Wins over the series' last few settled predictions.
  finish as (
    select p.id, p.winning_option_id
    from public.predictions p
    where p.series_id = p_series_id
      and p.status = 'revealed'
      and p.winning_option_id is not null
    order by coalesce(p.series_prediction_number, 2147483647) desc, p.created_at desc, p.id desc
    limit private.series_finish_window(v_completed_predictions)
  ),
  candidates as (
    select b.player_id, count(*)::numeric as award_value
    from public.bets b
    join finish f on f.id = b.prediction_id
    join eligible_players ep on ep.player_id = b.player_id
    where b.option_id = f.winning_option_id
    group by b.player_id
  ),
  top_value as (
    select max(c.award_value) as value
    from candidates c
  )
  select
    p_series_id,
    c.player_id,
    'HOT_FINISH'::public.series_award_type,
    c.award_value,
    'Won the most predictions in the final stretch of this Series.',
    private.series_award_tier('HOT_FINISH', c.award_value, v_completed_predictions, v_series.starting_stack)
  from candidates c
  cross join top_value tv
  where tv.value is not null
    and v_completed_predictions >= 6 and tv.value >= 2
    and c.award_value = tv.value;

  update public.series
  set
    status = 'completed',
    completed_at = now(),
    final_games = v_completed_predictions,
    final_players = v_eligible_players,
    tier = private.series_tier(v_completed_predictions, v_eligible_players)
  where id = p_series_id
  returning * into v_series;

  -- Titles, back-to-backs and Ever-Present seasons can unlock career milestones.
  perform private.award_milestones(v_series.room_id);

  return row_to_json(v_series);
end;
$$;

-- activities/functions/get_room_activities
create or replace function public.get_room_activities(
  p_room_id uuid,
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_filter text default 'all',
  p_series_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_limit integer;
  v_filter text;
  v_items json;
  v_next_cursor_created_at timestamptz;
  v_next_cursor_id uuid;
  v_has_more boolean := false;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not exists (
    select 1
    from public.room_members rm
    where rm.room_id = p_room_id
      and rm.player_id = v_player_id
  ) then
    raise exception 'Only room members can view room activities' using errcode = 'P0013';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 20), 50));
  v_filter := coalesce(lower(trim(p_filter)), 'all');

  with scoped as (
    select
      a.id,
      a.activity_type,
      a.activity_tier,
      a.metadata,
      a.click_action,
      a.created_at,
      a.created_by_player_id
    from public.room_activities a
    where a.room_id = p_room_id
      and (
        p_cursor_created_at is null
        or p_cursor_id is null
        or a.created_at < p_cursor_created_at
        or (a.created_at = p_cursor_created_at and a.id < p_cursor_id)
      )
      and (
        v_filter = 'all'
        or (v_filter = 'predictions' and a.activity_type like 'prediction_%')
        or (v_filter = 'members' and a.activity_type like 'room_%')
        or (v_filter = 'achievements' and a.activity_type like 'achievement_%')
      )
      and (
        p_series_id is null
        or exists (
          select 1
          from public.predictions p
          where p.id = case
            when coalesce(
              a.metadata ->> 'predictionId',
              a.click_action ->> 'predictionId'
            ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then coalesce(
              a.metadata ->> 'predictionId',
              a.click_action ->> 'predictionId'
            )::uuid
            else null
          end
            and p.series_id = p_series_id
        )
      )
    order by a.created_at desc, a.id desc
    limit v_limit + 1
  ),
  limited as (
    select *
    from scoped
    order by created_at desc, id desc
    limit v_limit
  ),
  next_cursor as (
    select s.created_at, s.id
    from scoped s
    order by s.created_at desc, s.id desc
    offset v_limit
    limit 1
  )
  select
    coalesce(
      json_agg(
        json_build_object(
          'id', l.id,
          'activityType', l.activity_type,
          'activityTier', l.activity_tier,
          'metadata', l.metadata,
          'clickAction', l.click_action,
          'createdAt', l.created_at,
          -- Who acted, e.g. the staff member who revealed a result.
          'createdBy', (
            select json_build_object('id', pl.id, 'username', pl.username)
            from public.players pl
            where pl.id = l.created_by_player_id
          )
        )
        order by l.created_at desc, l.id desc
      ),
      '[]'::json
    ),
    (select created_at from next_cursor),
    (select id from next_cursor),
    exists(select 1 from next_cursor)
  into v_items, v_next_cursor_created_at, v_next_cursor_id, v_has_more
  from limited l;

  return json_build_object(
    'items', v_items,
    'next_cursor_created_at', v_next_cursor_created_at,
    'next_cursor_id', v_next_cursor_id,
    'has_more', v_has_more
  );
end;
$$;

-- predictions/functions/correct_prediction_result
-- Organizers fix a result that went out wrong: pick a different winner, or
-- turn a revealed result into no result (or back). Points, winnings, ratings,
-- streaks and room stats all move to what they'd be had the right result gone
-- out first. Only while the series is still running, so final standings and
-- trophies are never rewritten.
create or replace function public.correct_prediction_result(
  p_prediction_id     uuid,
  p_room_id           uuid,
  p_outcome           text,
  p_winning_option_id uuid default null,
  p_no_result_reason  varchar(50) default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id      uuid;
  v_prediction     public.predictions%rowtype;
  v_previous       public.predictions%rowtype;
  v_series_status  text;
  v_plan           record;
  v_bettors        uuid[];
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and player_id = v_player_id
      and role in ('owner', 'organizer')
  ) then
    raise exception 'Only organizers can correct a result' using errcode = 'P0012';
  end if;

  if p_outcome not in ('win', 'no_result') then
    raise exception 'A result can be corrected to a winner or to no result' using errcode = 'P0001';
  end if;

  select * into v_prediction
  from public.predictions
  where id = p_prediction_id
    and room_id = p_room_id
  for update;

  if not found or v_prediction.status not in ('revealed', 'no_result') then
    raise exception 'Only revealed or no-result predictions can be corrected' using errcode = 'P0006';
  end if;

  select s.status into v_series_status
  from public.series s
  where s.id = v_prediction.series_id;

  if v_series_status is distinct from 'active' then
    raise exception 'Results can only be corrected while the series is running' using errcode = 'P0006';
  end if;

  if v_prediction.status = 'revealed' and not v_prediction.ratings_reversible then
    raise exception 'This result was revealed before corrections were possible' using errcode = 'P0006';
  end if;

  select * into v_plan
  from private.plan_settlement(p_prediction_id, p_outcome, p_winning_option_id, p_no_result_reason);

  if v_plan.status = v_prediction.status
    and v_plan.winning_option_id is not distinct from v_prediction.winning_option_id
  then
    raise exception 'That''s already the result' using errcode = 'P0001';
  end if;

  v_previous := v_prediction;

  if v_prediction.status = 'revealed' then
    perform private.reverse_prediction_ratings(p_prediction_id);
  end if;

  perform private.apply_settlement(p_prediction_id, v_plan.status, v_plan.winning_option_id);

  -- resolved_at stays, so the result keeps its place in streaks and history.
  update public.predictions
  set status            = v_plan.status,
      winning_option_id = v_plan.winning_option_id,
      no_result_reason  = v_plan.no_result_reason,
      corrected_at      = now(),
      corrected_by      = v_player_id,
      ratings_reversible = true
  where id = p_prediction_id
  returning * into v_prediction;

  if v_plan.status = 'revealed' then
    perform public.update_prediction_ratings(
      p_room_id,
      p_prediction_id,
      v_plan.winning_option_id
    );
  end if;

  select coalesce(array_agg(distinct b.player_id), '{}')
  into v_bettors
  from public.bets b
  where b.prediction_id = p_prediction_id;

  perform private.recompute_room_streaks(p_room_id, v_bettors);

  -- 'corrected' refreshes the streak stats without counting this result
  -- again: streaks were just recounted above.
  perform public.update_player_stats_after_resolution(p_room_id, p_prediction_id, null, 'corrected');
  perform public.update_room_stats_after_resolution(p_room_id, p_prediction_id, null, 'corrected');

  perform private.create_room_activity(
    p_room_id := p_room_id,
    p_activity_type := 'prediction_corrected',
    p_activity_tier := 1,
    p_metadata := private.build_prediction_activity_metadata(p_prediction_id)
      || jsonb_build_object(
        'previousStatus', v_previous.status,
        'previousWinningOptionLabel', (
          select po.label from public.prediction_options po
          where po.id = v_previous.winning_option_id
            and v_previous.status = 'revealed'
        )
      ),
    p_click_action := jsonb_build_object(
      'type', 'prediction',
      'predictionId', p_prediction_id
    ),
    p_created_by_player_id := v_player_id,
    p_dedupe_key := 'prediction_corrected:' || p_prediction_id::text || ':' || extract(epoch from now())::text
  );

  return json_build_object(
    'corrected',         true,
    'outcome',           v_plan.status,
    'winning_option_id', v_plan.winning_option_id,
    'reason',            v_plan.no_result_reason
  );
end;
$$;

revoke execute on function private.series_award_tier(public.series_award_type, numeric, integer, integer) from public, anon, authenticated;
