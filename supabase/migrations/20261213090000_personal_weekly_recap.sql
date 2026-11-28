-- ============================================================
-- Migration: personal_weekly_recap
-- Description: The weekly recap is about you. private.player_week works out
--   a player's last week in a series: results they picked, how many they
--   called, net points, their best call, and the player just above them (or
--   just behind, for the leader) with the gap. get_my_weekly_recap returns
--   it for Home's recap card, and the Monday push is written for each player
--   from it: "Week 6: you called 6 of 10", "+240 pts. You're 4th, 40 behind
--   Sam." Players with no results last week get the standings, as before.
-- ============================================================

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

create or replace function private.notify_one_series_weekly_recap(p_series_id uuid, p_week_key text)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_room   record;
  v_weeks  integer;
  v_leader text;
  v_leader_id uuid;
  v_topup  text;
  v_member record;
  v_week   json;
  v_rank   integer;
  v_title  text;
  v_body   text;
  v_rival  text;
begin
  select
    s.id as series_id,
    s.room_id,
    s.title,
    s.weekly_topup,
    s.last_topup_week,
    s.last_topup_recipients,
    r.room_code
  into v_room
  from public.series s
  join public.rooms r on r.id = s.room_id
  where s.id = p_series_id
    and s.status = 'active';

  if not found then
    return false;
  end if;

  v_topup := case
    when v_room.last_topup_week = p_week_key and v_room.last_topup_recipients > 0
      then '+' || v_room.weekly_topup || ' points for everyone who played.'
  end;

  select count(distinct week_key)::int into v_weeks
  from public.series_standing_snapshots
  where series_id = v_room.series_id and week_key <= p_week_key;

  if v_weeks >= 2 and exists (
    select 1 from public.series_standing_snapshots
    where series_id = v_room.series_id and week_key = p_week_key
  ) then
    select p.username, p.id into v_leader, v_leader_id
    from public.series_standing_snapshots ss
    join public.players p on p.id = ss.player_id
    where ss.series_id = v_room.series_id
      and ss.week_key = p_week_key
      and ss.rank = 1
    order by p.username
    limit 1;

    for v_member in
      select rm.player_id from public.room_members rm where rm.room_id = v_room.room_id
    loop
      v_week := private.player_week(v_room.series_id, v_member.player_id, p_week_key);
      select case when ss.is_ranked then ss.rank end into v_rank
      from public.series_standing_snapshots ss
      where ss.series_id = v_room.series_id and ss.player_id = v_member.player_id and ss.week_key = p_week_key;

      v_rival := case
        when v_week->'rival' is null or json_typeof(v_week->'rival') = 'null' then null
        when (v_week->'rival'->>'ahead')::boolean
          then (v_week->'rival'->>'gap') || ' behind ' || (v_week->'rival'->>'username')
        else (v_week->'rival'->>'gap') || ' ahead of ' || (v_week->'rival'->>'username')
      end;

      if coalesce((v_week->>'picks')::int, 0) > 0 then
        v_title := 'Week ' || v_weeks || ': you called ' || (v_week->>'called') || ' of ' || (v_week->>'picks');
        v_body := concat_ws(' ',
          private.push_signed_points((v_week->>'net')::int) || '.',
          case when v_rank is not null then
            'You''re ' || private.ordinal(v_rank) || coalesce(', ' || v_rival, '') || '.'
          end,
          v_topup
        );
      else
        v_title := 'Week ' || v_weeks || ' standings are in';
        v_body := concat_ws(' ',
          case
            when v_leader_id = v_member.player_id then 'You lead ' || v_room.title || '.'
            when v_leader is not null then v_leader || ' leads ' || v_room.title || '.'
            else 'Standings for ' || v_room.title || ' are in.'
          end,
          v_topup
        );
      end if;

      perform private.fire_push_notification(
        'weekly_points_claim',
        null,
        v_room.room_id,
        v_title,
        v_body,
        '/rooms/' || v_room.room_code || '/leaderboard',
        jsonb_build_object('target_player_id', v_member.player_id)
      );
    end loop;
    return true;
  elsif v_topup is not null then
    perform private.fire_push_notification(
      'weekly_points_claim',
      null,
      v_room.room_id,
      '+' || v_room.weekly_topup || ' points',
      'Weekly top-ups for ' || v_room.title || ' are in for everyone who played last week.',
      '/rooms/' || v_room.room_code
    );
    return true;
  end if;

  return false;
end;
$$;

revoke execute on function private.ordinal(integer) from public, anon, authenticated;
revoke execute on function private.player_week(uuid, uuid, text) from public, anon, authenticated;
