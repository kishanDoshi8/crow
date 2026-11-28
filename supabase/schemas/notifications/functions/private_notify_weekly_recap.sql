-- One room's Monday push, for one series (the room's newest active one). From
-- the series' second week it's each player's own week, one push each
-- (private.player_week), with the top-up line when top-ups were paid:
--   "Week 6: you called 6 of 10", "+240 pts. You're 4th, 40 behind Sam."
-- and, for someone with no results last week, the standings:
--   "Week 6 standings are in", "Sam leads December Dominators."
-- In a series' first week it's only the top-up, to the room, if any.
-- Returns whether pushes went out.
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

-- Every room's Monday push, in one go (the Monday job sends them one by one
-- through private.run_weekly_jobs instead, once each).
create or replace function private.notify_weekly_recap()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_week_key text := private.current_week_key();
  v_series   record;
  v_count    integer := 0;
begin
  -- A room with several active series hears about its newest one.
  for v_series in
    select distinct on (s.room_id) s.id
    from public.series s
    where s.status = 'active'
    order by s.room_id, s.created_at desc
  loop
    if private.notify_one_series_weekly_recap(v_series.id, v_week_key) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;
