-- One room's Monday push, for one series (the room's newest active one). From
-- the series' second week it's the weekly standings (with the top-up line when
-- top-ups were paid); in its first week it's only the top-up, if any. Returns
-- whether a push went out.
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
  v_topup  text;
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
    select p.username into v_leader
    from public.series_standing_snapshots ss
    join public.players p on p.id = ss.player_id
    where ss.series_id = v_room.series_id
      and ss.week_key = p_week_key
      and ss.rank = 1
    order by p.username
    limit 1;

    perform private.fire_push_notification(
      'weekly_points_claim',
      null,
      v_room.room_id,
      'Week ' || v_weeks || ' standings are in',
      concat_ws(' ',
        coalesce(v_leader || ' leads ' || v_room.title || '.', 'Standings for ' || v_room.title || ' are in.'),
        v_topup
      ),
      '/rooms/' || v_room.room_code || '/leaderboard'
    );
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
