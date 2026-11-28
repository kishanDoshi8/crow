-- How the caller's bets in a series turned out, for the results card on Home:
-- settled in the last 14 days and not yet dismissed, newest first.
create or replace function public.get_my_unseen_results(
  p_room_id uuid,
  p_series_id uuid
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_result json;
begin
  v_player_id := private.get_player_id_from_auth();

  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  select coalesce(json_agg(row_to_json(r) order by r.resolved_at desc, r.prediction_id), '[]'::json)
  into v_result
  from (
    select
      p.id as prediction_id,
      p.title,
      p.status,
      p.resolved_at,
      picked.label as my_pick,
      winner.label as winning_label,
      b.amount,
      coalesce(b.payout, 0) as payout,
      coalesce(b.payout, 0) - b.amount as net
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    join public.prediction_options picked on picked.id = b.option_id
    left join public.prediction_options winner on winner.id = p.winning_option_id
    where b.player_id = v_player_id
      and p.room_id = p_room_id
      and p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
      and coalesce(p.resolved_at, p.created_at) >= now() - interval '14 days'
      and not exists (
        select 1 from public.result_seen rs
        where rs.player_id = v_player_id and rs.prediction_id = p.id
      )
  ) r;

  return v_result;
end;
$$;

-- Dismisses results from the Home card (one, or all at once).
create or replace function public.mark_results_seen(
  p_prediction_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
begin
  v_player_id := private.get_player_id_from_auth();
  if v_player_id is null then
    raise exception 'Not authenticated' using errcode = 'P0004';
  end if;

  insert into public.result_seen (player_id, prediction_id)
  select v_player_id, b.prediction_id
  from public.bets b
  where b.player_id = v_player_id
    and b.prediction_id = any(p_prediction_ids)
  on conflict do nothing;
end;
$$;

-- The caller's last week in a series, from the two latest Monday snapshots,
-- for the recap card on Home. Null when there's nothing worth showing: no
-- second snapshot yet, already dismissed this week, or nothing changed.
create or replace function public.get_my_weekly_recap(
  p_room_id uuid,
  p_series_id uuid
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_latest text;
  v_previous text;
  v_now public.series_standing_snapshots%rowtype;
  v_before public.series_standing_snapshots%rowtype;
  v_rank_change integer;
  v_balance_change integer;
  v_now_ranked boolean;
  v_week json;
begin
  v_player_id := private.get_player_id_from_auth();

  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  select max(ss.week_key) into v_latest
  from public.series_standing_snapshots ss
  join public.series s on s.id = ss.series_id
  where ss.series_id = p_series_id and s.room_id = p_room_id;

  select max(ss.week_key) into v_previous
  from public.series_standing_snapshots ss
  where ss.series_id = p_series_id and ss.week_key < v_latest;

  if v_latest is null or v_previous is null then
    return null;
  end if;

  if exists (
    select 1 from public.weekly_recap_seen ws
    where ws.player_id = v_player_id and ws.series_id = p_series_id and ws.week_key = v_latest
  ) then
    return null;
  end if;

  select * into v_now from public.series_standing_snapshots
  where series_id = p_series_id and player_id = v_player_id and week_key = v_latest;
  select * into v_before from public.series_standing_snapshots
  where series_id = p_series_id and player_id = v_player_id and week_key = v_previous;

  if v_now.player_id is null then
    return null;
  end if;

  -- Places moved only means something when ranked both weeks; positive is up.
  v_rank_change := case
    when v_now.is_ranked and v_before.is_ranked then v_before.rank - v_now.rank
  end;
  v_balance_change := v_now.balance - coalesce(v_before.balance, v_now.balance);
  v_now_ranked := v_now.is_ranked and not coalesce(v_before.is_ranked, false);

  -- Your own week (picks, calls, best call, the player to catch): see
  -- private.player_week.
  v_week := private.player_week(p_series_id, v_player_id, v_latest);

  if coalesce(v_rank_change, 0) = 0 and v_balance_change = 0 and not v_now_ranked
    and coalesce((v_week->>'picks')::int, 0) = 0 then
    return null;
  end if;

  return json_build_object(
    'week_key', v_latest,
    'rank', case when v_now.is_ranked then v_now.rank end,
    'rank_change', nullif(v_rank_change, 0),
    'balance', v_now.balance,
    'balance_change', v_balance_change,
    'newly_ranked', v_now_ranked,
    'week', json_build_object(
      'picks', v_week->'picks', 'called', v_week->'called', 'net', v_week->'net'
    ),
    'best_call', v_week->'best_call',
    'rival', v_week->'rival'
  );
end;
$$;

-- Dismisses this week's recap for a series; next week's still shows.
create or replace function public.dismiss_weekly_recap(
  p_series_id uuid,
  p_week_key text
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
begin
  v_player_id := private.get_player_id_from_auth();
  if v_player_id is null then
    raise exception 'Not authenticated' using errcode = 'P0004';
  end if;

  insert into public.weekly_recap_seen (player_id, series_id, week_key)
  values (v_player_id, p_series_id, p_week_key)
  on conflict do nothing;
end;
$$;
