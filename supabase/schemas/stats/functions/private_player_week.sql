-- "1st", "2nd", "3rd", "4th", "11th": for push copy.
create or replace function private.ordinal(p_n integer)
returns text
language sql
immutable
as $$
  select p_n || case
    when p_n % 100 in (11, 12, 13) then 'th'
    when p_n % 10 = 1 then 'st'
    when p_n % 10 = 2 then 'nd'
    when p_n % 10 = 3 then 'rd'
    else 'th'
  end;
$$;

-- One player's last week in a series, for the weekly recap on Home and the
-- Monday push. "Last week" is the ISO week (UTC) before the one p_week_key
-- names, the week the Monday snapshot p_week_key closed:
--
--   week:      questions with a winner revealed that week that they picked,
--              how many they called, and their net points on them
--   best_call: their biggest win of the week (question, points, ×multiple)
--   rival:     the player just above them in that snapshot and the gap in
--              net points, or, for the leader, the player just behind
--
-- Called-off questions (no result, scrapped) don't count: nothing moved.
create or replace function private.player_week(
  p_series_id uuid,
  p_player_id uuid,
  p_week_key text
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_week_end timestamptz := (to_date(p_week_key, 'IYYY"-W"IW')::timestamp at time zone 'UTC');
  v_week_start timestamptz := v_week_end - interval '7 days';
  v_week record;
  v_best record;
  v_me public.series_standing_snapshots%rowtype;
  v_rival_name text;
  v_rival_gap integer;
  v_rival_ahead boolean;
begin
  select
    count(*)::int as picks,
    count(*) filter (where b.option_id = p.winning_option_id)::int as called,
    coalesce(sum(coalesce(b.payout, 0) - b.amount), 0)::int as net
  into v_week
  from public.bets b
  join public.predictions p on p.id = b.prediction_id
  where b.player_id = p_player_id
    and p.series_id = p_series_id
    and p.status = 'revealed'
    and p.resolved_at >= v_week_start
    and p.resolved_at < v_week_end;

  select p.title, (b.payout - b.amount)::int as net,
    round(b.payout::numeric / nullif(b.amount, 0), 1) as multiple
  into v_best
  from public.bets b
  join public.predictions p on p.id = b.prediction_id
  where b.player_id = p_player_id
    and p.series_id = p_series_id
    and p.status = 'revealed'
    and b.option_id = p.winning_option_id
    and coalesce(b.payout, 0) > b.amount
    and p.resolved_at >= v_week_start
    and p.resolved_at < v_week_end
  order by b.payout - b.amount desc, p.resolved_at
  limit 1;

  select * into v_me
  from public.series_standing_snapshots
  where series_id = p_series_id and player_id = p_player_id and week_key = p_week_key;

  if v_me.is_ranked and v_me.rank is not null then
    select pl.username,
      abs(coalesce(ss.net_points, ss.balance) - coalesce(v_me.net_points, v_me.balance))::int,
      ss.rank < v_me.rank
    into v_rival_name, v_rival_gap, v_rival_ahead
    from public.series_standing_snapshots ss
    join public.players pl on pl.id = ss.player_id
    where ss.series_id = p_series_id
      and ss.week_key = p_week_key
      and ss.is_ranked
      and ss.player_id <> p_player_id
      and ss.rank = case when v_me.rank = 1 then 2 else v_me.rank - 1 end
    order by pl.username
    limit 1;
  end if;

  return json_build_object(
    'picks', v_week.picks,
    'called', v_week.called,
    'net', v_week.net,
    'best_call', case when v_best.title is not null then json_build_object(
      'title', v_best.title, 'net', v_best.net, 'multiple', v_best.multiple
    ) end,
    'rival', case when v_rival_name is not null then json_build_object(
      'username', v_rival_name, 'gap', v_rival_gap, 'ahead', v_rival_ahead
    ) end
  );
end;
$$;
