-- ============================================================
-- Migration: fair_play_fixes
-- Description: Keeps the game fair as rooms grow beyond close friends.
--   1. Bets can't be cancelled once the deadline passes, even before the
--      lock job runs.
--   2. Organizers can correct a revealed or no-result prediction while its
--      series runs (correct_prediction_result). Bets record the rating points
--      they moved so a correction can undo them.
--   3. The question and details of a prediction are fixed once someone bets.
--   4. Payouts are whole points that always add up: leftover points from
--      rounding go to the winners with the largest fractions instead of
--      vanishing. Resolution now runs through plan_settlement and
--      apply_settlement, shared with corrections.
--   5. The LONGEST_STREAK series award uses the same streaks the series
--      standings show (results in the order they came in). It also no longer
--      counts one extra win for streaks that start after a loss.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------
alter table public.bets
  add column if not exists rating_change integer;

alter table public.predictions
  add column if not exists corrected_at timestamptz,
  add column if not exists corrected_by uuid references public.players(id) on delete set null,
  add column if not exists ratings_reversible boolean not null default true;

-- Rating changes weren't recorded before this, so these can't be undone.
update public.predictions
set ratings_reversible = false
where status = 'revealed'
  and affects_rating;

grant select (id, room_id, series_id, series_prediction_number, created_by, title, status, deadline, winning_option_id, no_result_reason, affects_rating, resolved_at, resolved_by, notified_1h, notified_result_needed, created_at, description, corrected_at, corrected_by, ratings_reversible) on public.predictions to authenticated;
grant select (id, prediction_id, player_id, option_id, amount, payout, rating_change, placed_at, updated_at) on public.bets to authenticated;

-- ------------------------------------------------------------
-- 2. Functions
-- ------------------------------------------------------------

-- predictions/functions/private_prediction_payouts
-- What every bet on a prediction pays out if p_winning_option_id wins, in whole
-- points. Nothing is lost to rounding: payouts always add up to the stakes.
--
-- Each losing bet gives up at most the winners' combined stake (W); anything
-- above that is refunded. The winners share the points given up (the pot) by
-- stake. Each gets the whole-number part of their share, and the points left
-- over go one each to the winners with the largest fractions (then the bigger
-- stake, then the earlier bet).
create or replace function private.prediction_payouts(
  p_prediction_id uuid,
  p_winning_option_id uuid
)
returns table (
  bet_id uuid,
  player_id uuid,
  amount integer,
  is_winner boolean,
  payout integer
)
language sql
stable
set search_path = public, private
as $$
  with b as (
    select
      bt.id,
      bt.player_id,
      bt.amount,
      bt.placed_at,
      bt.option_id = p_winning_option_id as is_winner
    from public.bets bt
    where bt.prediction_id = p_prediction_id
  ),
  totals as (
    select coalesce(sum(b.amount) filter (where b.is_winner), 0)::bigint as w
    from b
  ),
  pot as (
    select coalesce(sum(least(b.amount, t.w)) filter (where not b.is_winner), 0)::bigint as p
    from b
    cross join totals t
  ),
  shares as (
    select
      b.id,
      b.player_id,
      b.amount,
      b.placed_at,
      (b.amount::bigint * pot.p) / t.w as base,
      (b.amount::bigint * pot.p) % t.w as remainder
    from b
    cross join totals t
    cross join pot
    where b.is_winner
      and t.w > 0
  ),
  leftover as (
    select pot.p - coalesce((select sum(s.base) from shares s), 0) as points
    from pot
  ),
  ranked as (
    select
      s.*,
      row_number() over (
        order by s.remainder desc, s.amount desc, s.placed_at asc, s.id asc
      ) as rn
    from shares s
  )
  select
    r.id,
    r.player_id,
    r.amount,
    true,
    (r.amount + r.base + case when r.rn <= l.points then 1 else 0 end)::integer
  from ranked r
  cross join leftover l
  union all
  select
    b.id,
    b.player_id,
    b.amount,
    false,
    greatest(b.amount - t.w, 0)::integer
  from b
  cross join totals t
  where not b.is_winner;
$$;

-- predictions/functions/private_settle_prediction
-- Works out how a prediction closes. A win needs bets on more than one option
-- and at least one on the winner; otherwise everyone gets their stake back.
create or replace function private.plan_settlement(
  p_prediction_id uuid,
  p_outcome text,
  p_winning_option_id uuid,
  p_no_result_reason text
)
returns table (
  status text,
  winning_option_id uuid,
  no_result_reason text
)
language plpgsql
stable
set search_path = public, private
as $$
declare
  v_bet_count integer;
  v_sides integer;
  v_winner_total integer;
  v_reason text := nullif(btrim(coalesce(p_no_result_reason, '')), '');
begin
  if p_outcome in ('no_result', 'cancel') then
    return query select
      case when p_outcome = 'cancel' then 'cancelled' else 'no_result' end,
      null::uuid,
      v_reason;
    return;
  end if;

  if p_outcome <> 'win' then
    raise exception 'Invalid outcome. Must be win, no_result, or cancel.' using errcode = 'P0001';
  end if;

  if p_winning_option_id is null then
    raise exception 'p_winning_option_id is required for a win outcome' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.prediction_options
    where id = p_winning_option_id
      and prediction_id = p_prediction_id
  ) then
    raise exception 'Winning option does not belong to this prediction' using errcode = 'P0008';
  end if;

  select
    count(*)::int,
    count(distinct b.option_id)::int,
    coalesce(sum(b.amount) filter (where b.option_id = p_winning_option_id), 0)::int
  into v_bet_count, v_sides, v_winner_total
  from public.bets b
  where b.prediction_id = p_prediction_id;

  if v_bet_count = 0 then
    return query select 'no_result'::text, p_winning_option_id,
      coalesce(v_reason, 'Nobody placed a bet');
  elsif v_sides < 2 then
    return query select 'no_result'::text, p_winning_option_id,
      coalesce(v_reason, 'Only one option had bets — all refunded');
  elsif v_winner_total = 0 then
    return query select 'no_result'::text, p_winning_option_id,
      coalesce(v_reason, 'Nobody bet on the winning option — all refunded');
  else
    return query select 'revealed'::text, p_winning_option_id, null::text;
  end if;
end;
$$;

-- Moves the points for a prediction that is being settled as p_status. Works
-- both for a first result (stakes still held in escrow) and for a corrected
-- one (stakes already paid out): each wallet moves by the difference between
-- the new payout and what the bet already paid, so a correction never sees a
-- wallet halfway through. Returns how many bets won and lost.
create or replace function private.apply_settlement(
  p_prediction_id uuid,
  p_status text,
  p_winning_option_id uuid
)
returns table (
  winners integer,
  losers integer
)
language plpgsql
set search_path = public, private
as $$
declare
  v_prediction public.predictions%rowtype;
  v_row record;
  v_winners integer := 0;
  v_losers integer := 0;
begin
  select * into v_prediction
  from public.predictions
  where id = p_prediction_id;

  create temp table if not exists _settlement (
    bet_id uuid primary key,
    player_id uuid not null,
    amount integer not null,
    is_winner boolean not null,
    old_paid integer not null,
    in_escrow boolean not null,
    new_payout integer not null
  ) on commit drop;
  truncate _settlement;

  insert into _settlement
  select
    b.id,
    b.player_id,
    b.amount,
    coalesce(pp.is_winner, false),
    -- An unsettled bet is still part of the balance, held in escrow.
    coalesce(b.payout, b.amount),
    b.payout is null,
    case when p_status = 'revealed' then pp.payout else b.amount end
  from public.bets b
  left join private.prediction_payouts(p_prediction_id, p_winning_option_id) pp
    on pp.bet_id = b.id and p_status = 'revealed'
  where b.prediction_id = p_prediction_id;

  -- A correction can take back points a player has since staked elsewhere.
  select p.username, s.new_payout - s.old_paid as change
  into v_row
  from _settlement s
  join public.series_wallets w
    on w.series_id = v_prediction.series_id
   and w.player_id = s.player_id
  join public.players p on p.id = s.player_id
  where w.balance + (s.new_payout - s.old_paid)
      < w.escrow - case when s.in_escrow then s.amount else 0 end
  limit 1;

  if found then
    raise exception '% has staked those points on open bets, so % points can''t be taken back yet. Ask them to cancel a bet first.',
      v_row.username,
      -v_row.change
      using errcode = 'P0013';
  end if;

  update public.series_wallets w
  set balance    = w.balance + (s.new_payout - s.old_paid),
      escrow     = w.escrow - case when s.in_escrow then s.amount else 0 end,
      updated_at = now()
  from _settlement s
  where w.series_id = v_prediction.series_id
    and w.player_id = s.player_id;

  update public.bets b
  set payout = s.new_payout
  from _settlement s
  where b.id = s.bet_id;

  -- Lifetime and room winnings count only what a bet gained.
  update public.players p
  set total_won = p.total_won
    + greatest(s.new_payout - s.amount, 0)
    - greatest(s.old_paid - s.amount, 0)
  from _settlement s
  where p.id = s.player_id
    and greatest(s.new_payout - s.amount, 0) <> greatest(s.old_paid - s.amount, 0);

  update public.room_members rm
  set total_won_in_room = rm.total_won_in_room
    + greatest(s.new_payout - s.amount, 0)
    - greatest(s.old_paid - s.amount, 0)
  from _settlement s
  where rm.room_id = v_prediction.room_id
    and rm.player_id = s.player_id
    and greatest(s.new_payout - s.amount, 0) <> greatest(s.old_paid - s.amount, 0);

  if p_status = 'revealed' then
    select
      count(*) filter (where s.is_winner)::int,
      count(*) filter (where not s.is_winner)::int
    into v_winners, v_losers
    from _settlement s;
  end if;

  return query select v_winners, v_losers;
end;
$$;

-- predictions/functions/update_prediction_ratings
create or replace function public.update_prediction_ratings(
  p_room_id uuid,
  p_prediction_id uuid,
  p_winning_option_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_prediction public.predictions%rowtype;
  v_config record;
  v_participant record;
  v_member public.room_members%rowtype;

  v_total_predictors integer;
  v_winning_predictors integer;
  v_prediction_popularity numeric;
  v_surprise numeric;
  v_sample_weight numeric;
  v_difficulty numeric;

  v_experience numeric;
  v_effective_k numeric;
  v_change numeric;
  v_rounded_change integer;
  v_new_rating integer;
begin
  select *
  into v_prediction
  from public.predictions
  where id = p_prediction_id
    and room_id = p_room_id;

  if not found then
    raise exception 'Prediction not found for rating update' using errcode = 'P0006';
  end if;

  if not v_prediction.affects_rating then
    return;
  end if;

  if v_prediction.status <> 'revealed' then
    return;
  end if;

  if v_prediction.winning_option_id is distinct from p_winning_option_id then
    raise exception 'Winning option mismatch for rating update' using errcode = 'P0008';
  end if;

  select version, base_k, min_participants
  into v_config
  from public.rating_system_config
  where is_active = true
  order by version desc
  limit 1;

  if not found then
    raise exception 'No active rating system configuration found' using errcode = 'P0001';
  end if;

  select
    count(distinct b.player_id),
    count(distinct case when b.option_id = p_winning_option_id then b.player_id end)
  into v_total_predictors, v_winning_predictors
  from public.bets b
  where b.prediction_id = p_prediction_id;

  if v_total_predictors < v_config.min_participants then
    return;
  end if;

  -- Popular winners imply low surprise; unpopular winners imply upset outcomes.
  v_prediction_popularity := v_winning_predictors::numeric / v_total_predictors::numeric;
  v_surprise := 1 - v_prediction_popularity;

  -- Scale difficulty by participation size so larger samples carry stronger signal.
  v_sample_weight := ln(v_total_predictors::numeric + 1);
  v_difficulty := 1 + (v_surprise * v_sample_weight * 0.5);

  for v_participant in
    select distinct b.player_id, b.option_id
    from public.bets b
    where b.prediction_id = p_prediction_id
  loop
    select *
    into v_member
    from public.room_members
    where room_id = p_room_id
      and player_id = v_participant.player_id
    for update;

    if not found then
      continue;
    end if;

    v_experience := least(
      1.0::numeric,
      v_member.rated_predictions_count::numeric / 10.0
    );

    v_effective_k := v_config.base_k * (0.25 + (0.75 * v_experience));

    if v_participant.option_id = p_winning_option_id then
      v_change := v_effective_k * v_difficulty;
    else
      v_change := -(v_effective_k / v_difficulty);
    end if;

    v_rounded_change := round(v_change)::integer;
    v_new_rating := greatest(0, v_member.prediction_rating + v_rounded_change);

    update public.room_members
    set prediction_rating = v_new_rating,
        peak_prediction_rating = greatest(peak_prediction_rating, v_new_rating),
        rated_predictions_count = rated_predictions_count + 1,
        rating_system_version = v_config.version
    where id = v_member.id;

    -- Kept so a corrected result can undo exactly this change.
    update public.bets
    set rating_change = v_new_rating - v_member.prediction_rating
    where prediction_id = p_prediction_id
      and player_id = v_participant.player_id;
  end loop;
end;
$$;

-- Undoes the rating changes a revealed prediction made, before its result is
-- corrected. Peak ratings are left as they are.
create or replace function private.reverse_prediction_ratings(
  p_prediction_id uuid
)
returns void
language plpgsql
set search_path = public, private
as $$
begin
  update public.room_members rm
  set prediction_rating = greatest(0, rm.prediction_rating - b.rating_change),
      rated_predictions_count = greatest(0, rm.rated_predictions_count - 1)
  from public.bets b
  join public.predictions p on p.id = b.prediction_id
  where b.prediction_id = p_prediction_id
    and b.rating_change is not null
    and rm.room_id = p.room_id
    and rm.player_id = b.player_id;

  update public.bets
  set rating_change = null
  where prediction_id = p_prediction_id
    and rating_change is not null;
end;
$$;

-- stats/functions/private_recompute_room_streaks
-- Rebuilds room win streaks for some players from their revealed results, in
-- the order the results came in. A corrected result can't simply be undone
-- because a loss resets the streak, so it's recounted instead. No-result and
-- cancelled predictions neither extend nor break a streak.
create or replace function private.recompute_room_streaks(
  p_room_id uuid,
  p_player_ids uuid[]
)
returns void
language sql
set search_path = public, private
as $$
  with results as (
    select
      b.player_id,
      (b.option_id = p.winning_option_id) as is_win,
      row_number() over (
        partition by b.player_id
        order by p.resolved_at nulls last, p.created_at, p.id
      ) as seq
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.room_id = p_room_id
      and p.status = 'revealed'
      and p.winning_option_id is not null
      and b.player_id = any(p_player_ids)
  ),
  grouped as (
    select
      r.*,
      sum(case when r.is_win then 0 else 1 end) over (
        partition by r.player_id order by r.seq
      ) as loss_group
    from results r
  ),
  runs as (
    select
      g.player_id,
      g.loss_group,
      count(*) filter (where g.is_win)::int as wins,
      max(g.seq) as last_seq
    from grouped g
    group by g.player_id, g.loss_group
  ),
  streaks as (
    select
      ids.player_id,
      coalesce((
        select ru.wins from runs ru
        where ru.player_id = ids.player_id
        order by ru.last_seq desc
        limit 1
      ), 0) as current_streak,
      coalesce((select max(ru.wins) from runs ru where ru.player_id = ids.player_id), 0) as highest_streak
    from unnest(p_player_ids) as ids(player_id)
  )
  update public.room_members rm
  set current_streak = s.current_streak,
      highest_streak = s.highest_streak
  from streaks s
  where rm.room_id = p_room_id
    and rm.player_id = s.player_id;
$$;

-- predictions/functions/resolve_prediction_v2
create or replace function public.resolve_prediction_v2(
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
  v_player_id   uuid;
  v_prediction  public.predictions%rowtype;
  v_plan        record;
  v_counts      record;
  v_activity    text;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and player_id = v_player_id
      and role in ('owner', 'organizer', 'resolver')
  ) then
    raise exception 'Only room staff can close predictions' using errcode = 'P0012';
  end if;

  select * into v_prediction
  from public.predictions
  where id      = p_prediction_id
    and room_id = p_room_id
    -- Locked predictions can be closed any way; open ones can only be cancelled.
    and (status = 'locked' or (status = 'draft' and p_outcome = 'cancel'))
  -- Lock the prediction so a second resolve call waits, then finds it no longer locked.
  for update;

  if not found then
    raise exception 'Prediction not found or already closed' using errcode = 'P0006';
  end if;

  select * into v_plan
  from private.plan_settlement(p_prediction_id, p_outcome, p_winning_option_id, p_no_result_reason);

  select * into v_counts
  from private.apply_settlement(p_prediction_id, v_plan.status, v_plan.winning_option_id);

  update public.predictions
  set status            = v_plan.status,
      winning_option_id = v_plan.winning_option_id,
      no_result_reason  = v_plan.no_result_reason,
      resolved_at       = now(),
      resolved_by       = v_player_id
  where id = p_prediction_id
  returning * into v_prediction;

  if v_plan.status = 'revealed' then
    perform public.update_prediction_ratings(
      p_room_id,
      p_prediction_id,
      v_plan.winning_option_id
    );
  end if;

  perform public.update_player_stats_after_resolution(
    p_room_id,
    p_prediction_id,
    case when v_plan.status = 'revealed' then v_plan.winning_option_id end,
    case when v_plan.status = 'revealed' then 'win' else v_plan.status end
  );

  perform public.update_room_stats_after_resolution(
    p_room_id,
    p_prediction_id,
    case when v_plan.status = 'revealed' then v_plan.winning_option_id end,
    case when v_plan.status = 'revealed' then 'win' else v_plan.status end
  );

  v_activity := case v_plan.status
    when 'revealed' then 'prediction_revealed'
    when 'cancelled' then 'prediction_cancelled'
    else 'prediction_no_result'
  end;

  perform private.create_room_activity(
    p_room_id := p_room_id,
    p_activity_type := v_activity,
    p_activity_tier := 1,
    p_metadata := private.build_prediction_activity_metadata(p_prediction_id),
    p_click_action := jsonb_build_object(
      'type', 'prediction',
      'predictionId', p_prediction_id
    ),
    p_created_by_player_id := v_player_id,
    p_dedupe_key := v_activity || ':' || p_prediction_id::text
  );

  if v_plan.status = 'revealed' then
    return json_build_object(
      'resolved',          true,
      'outcome',           'revealed',
      'winning_option_id', v_plan.winning_option_id,
      'winning_label',     (select label from public.prediction_options where id = v_plan.winning_option_id),
      'winners',           v_counts.winners,
      'losers',            v_counts.losers
    );
  end if;

  return json_build_object(
    'resolved',          true,
    'outcome',           v_plan.status,
    'reason',            v_plan.no_result_reason,
    'winning_option_id', v_plan.winning_option_id,
    'refunded',          true
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

  if exists (select 1 from public.duels d where d.prediction_id = p_prediction_id) then
    raise exception 'Predictions with duels can''t be corrected' using errcode = 'P0006';
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

-- predictions/functions/cancel_bet
create or replace function public.cancel_bet(
  p_prediction_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player     public.players%rowtype;
  v_prediction public.predictions%rowtype;
  v_bet        public.bets%rowtype;
  v_is_member  boolean;
begin
  select * into v_player
  from public.players
  where user_id = auth.uid();

  if not found then
    raise exception 'Player profile not found' using errcode = 'P0004';
  end if;

  select * into v_prediction
  from public.predictions
  where id = p_prediction_id and status = 'draft'
  for share;

  if not found then
    raise exception 'Prediction not found or not in draft phase' using errcode = 'P0006';
  end if;

  -- Picks are final at the deadline, even before the lock job catches up.
  if v_prediction.deadline <= now() then
    raise exception 'Betting deadline has passed' using errcode = 'P0007';
  end if;

  select exists (
    select 1 from public.room_members
    where room_id = v_prediction.room_id and player_id = v_player.id
  ) into v_is_member;

  if not v_is_member then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  -- Lock the wallet so a concurrent bet sees the freed points correctly.
  perform 1
  from public.series_wallets
  where series_id = v_prediction.series_id
    and player_id = v_player.id
  for update;

  select * into v_bet
  from public.bets
  where prediction_id = p_prediction_id and player_id = v_player.id;

  if not found then
    raise exception 'No bet found to cancel' using errcode = 'P0010';
  end if;

  update public.prediction_options
  set total_bet = total_bet - v_bet.amount
  where id = v_bet.option_id;

  update public.series_wallets
  set escrow     = escrow - v_bet.amount,
      updated_at = now()
  where series_id = v_prediction.series_id
    and player_id = v_player.id;

  delete from public.bets where id = v_bet.id;

  return json_build_object(
    'cancelled',    true,
    'points_freed', v_bet.amount
  );
end;
$$;

-- predictions/functions/update_prediction
-- Organizers fix a prediction that's still open for picks: the deadline, and
-- the question and options while nobody has bet. Pass null options to keep them.
create or replace function public.update_prediction(
  p_prediction_id uuid,
  p_title         text,
  p_deadline      timestamptz,
  p_options       text[] default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id  uuid;
  v_prediction public.predictions%rowtype;
  v_labels     text[];
  v_current    text[];
  v_i          int;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select * into v_prediction
  from public.predictions
  where id = p_prediction_id
  for update;

  if not found then
    raise exception 'Prediction not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = v_prediction.room_id
      and player_id = v_player_id
      and role in ('owner', 'organizer')
  ) then
    raise exception 'Only organizers can edit predictions' using errcode = 'P0012';
  end if;

  if v_prediction.status <> 'draft' or v_prediction.deadline <= now() then
    raise exception 'Only predictions still open for picks can be edited' using errcode = 'P0006';
  end if;

  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Prediction title cannot be empty' using errcode = 'P0001';
  end if;

  if p_deadline is null or p_deadline <= now() then
    raise exception 'Deadline must be in the future' using errcode = 'P0001';
  end if;

  -- Once someone has bet, the question they bet on stays as it was.
  if trim(p_title) is distinct from v_prediction.title
    and exists (select 1 from public.bets where prediction_id = p_prediction_id)
  then
    raise exception 'The question can''t change once someone has bet' using errcode = 'P0001';
  end if;

  if p_options is not null then
    if coalesce(array_length(p_options, 1), 0) < 2 or array_length(p_options, 1) > 6 then
      raise exception 'Predictions must have between 2 and 6 options' using errcode = 'P0001';
    end if;

    v_labels := array(select trim(o) from unnest(p_options) with ordinality as t(o, n) order by n);

    if exists (select 1 from unnest(v_labels) l where length(l) = 0) then
      raise exception 'Option labels cannot be empty' using errcode = 'P0001';
    end if;

    v_current := array(
      select label from public.prediction_options
      where prediction_id = p_prediction_id
      order by display_order, created_at
    );

    if v_labels is distinct from v_current then
      if exists (select 1 from public.bets where prediction_id = p_prediction_id) then
        raise exception 'Options can''t change once someone has bet' using errcode = 'P0001';
      end if;

      delete from public.prediction_options where prediction_id = p_prediction_id;

      for v_i in 1 .. array_length(v_labels, 1) loop
        insert into public.prediction_options (prediction_id, label, display_order)
        values (p_prediction_id, v_labels[v_i], v_i - 1);
      end loop;
    end if;
  end if;

  update public.predictions
  set title       = trim(p_title),
      deadline    = p_deadline,
      -- A moved deadline earns a fresh "1 hour left" reminder.
      notified_1h = case when p_deadline = deadline then notified_1h else false end
  where id = p_prediction_id;

  return json_build_object(
    'id',       p_prediction_id,
    'title',    trim(p_title),
    'deadline', p_deadline
  );
end;
$$;

-- predictions/functions/prediction_details
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

  -- The details say how the winner is decided, so they're fixed once someone has bet.
  if v_description is distinct from (select p.description from public.predictions p where p.id = p_prediction_id)
    and exists (select 1 from public.bets b where b.prediction_id = p_prediction_id)
  then
    raise exception 'The details can''t change once someone has bet' using errcode = 'P0001';
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
    select p.id, p.winning_option_id
    from public.predictions p
    where p.series_id = p_series_id
      and p.status = 'revealed'
      and p.winning_option_id is not null
  ),
  player_participation as (
    select
      b.player_id,
      count(distinct b.prediction_id)::int as prediction_count
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
  duel_wins as (
    select
      winner.player_id,
      count(*)::numeric as award_value
    from public.duels d
    join series_predictions sp on sp.id = d.prediction_id
    join public.bets challenger_bet on challenger_bet.id = d.challenger_bet_id
    join public.bets opponent_bet on opponent_bet.id = d.matched_opponent_bet_id
    join lateral (
      select case
        when challenger_bet.option_id = sp.winning_option_id then d.challenger_player_id
        else d.matched_opponent_player_id
      end as player_id
    ) winner on true
    join eligible_players ep on ep.player_id = winner.player_id
    where d.status = 'resolved'
    group by winner.player_id
  ),
  top_value as (
    select max(dw.award_value) as value
    from duel_wins dw
  )
  select
    p_series_id,
    dw.player_id,
    'MOST_DUEL_WINS'::public.series_award_type,
    dw.award_value,
    'Won the most duels during this Series.',
    private.series_award_tier('MOST_DUEL_WINS', dw.award_value, v_completed_predictions, v_series.starting_stack)
  from duel_wins dw
  cross join top_value tv
  where tv.value is not null
    and tv.value > 0
    and dw.award_value = tv.value;

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

-- Replaced by apply_settlement.
drop function if exists private.refund_all_bets_v2(uuid);

-- ------------------------------------------------------------
-- 3. Access
-- ------------------------------------------------------------
revoke execute on function private.prediction_payouts(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.plan_settlement(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function private.apply_settlement(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function private.reverse_prediction_ratings(uuid) from public, anon, authenticated;
revoke execute on function private.recompute_room_streaks(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.correct_prediction_result(uuid, uuid, text, uuid, character varying) from public, anon, authenticated;
grant execute on function public.correct_prediction_result(uuid, uuid, text, uuid, character varying) to authenticated;
