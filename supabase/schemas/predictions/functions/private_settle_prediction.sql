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
