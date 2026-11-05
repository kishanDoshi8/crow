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
