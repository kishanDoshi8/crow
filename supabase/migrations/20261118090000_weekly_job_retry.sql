-- ============================================================
-- Migration: weekly_job_retry
-- Description: The Monday job (standings snapshot, top-ups, recap push)
--   ran as one transaction, so one error rolled back every room's
--   snapshot and top-up for the week. Now each series' steps run on their
--   own and are logged in private.weekly_job_runs; the job runs hourly on
--   Mondays and each run only does what isn't done yet, so a failure is
--   retried without paying or announcing anything twice.
-- ============================================================

-- The Monday job's progress, one row per series and step for each week, so a
-- failed step can be retried without redoing (or re-announcing) the rest.
--   snapshot: standings recorded · topup: weekly points paid · recap: push sent
create table if not exists private.weekly_job_runs (
  week_key text not null,
  series_id uuid not null references public.series(id) on delete cascade,
  step text not null check (step in ('snapshot', 'topup', 'recap')),
  status text not null check (status in ('done', 'failed')),
  attempts integer not null default 1,
  -- The last failure's message, for whoever looks into it.
  error text,
  updated_at timestamptz not null default now(),
  primary key (week_key, series_id, step)
);

-- One series' standings as they stood when the week ended. Safe to repeat.
create or replace function private.snapshot_one_series(p_series_id uuid, p_week_key text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.series_standing_snapshots (series_id, player_id, week_key, rank, is_ranked, balance)
  select p_series_id, st.player_id, p_week_key, st.rank, st.is_ranked, st.balance
  from private.series_standings(p_series_id) st
  on conflict (series_id, player_id, week_key) do nothing;
end;
$$;

-- Every active series' snapshot, in one go (the Monday job runs them one by
-- one through private.run_weekly_jobs instead). Safe to run twice in a week.
create or replace function private.snapshot_series_standings()
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
  for v_series in
    select s.id from public.series s where s.status = 'active'
  loop
    perform private.snapshot_one_series(v_series.id, v_week_key);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Pays one series' weekly top-up, at most once per ISO week, to the players
-- who bet in the series during the week that just ended. Players with nothing
-- left to bet with are topped up too, so going broke never locks anyone out of
-- a series. Returns whether this call paid the week's round.
create or replace function private.pay_one_series_topup(p_series_id uuid, p_week_key text)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_this_week  timestamptz := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';
  v_last_week  timestamptz := v_this_week - interval '7 days';
  v_series     public.series%rowtype;
  v_paid       integer;
begin
  select * into v_series
  from public.series s
  where s.id = p_series_id
    and s.status = 'active'
    and s.weekly_topup > 0
    and s.last_topup_week is distinct from p_week_key
  for update;

  if not found then
    return false;
  end if;

  update public.series_wallets w
  set balance = w.balance + v_series.weekly_topup,
      granted = w.granted + v_series.weekly_topup,
      updated_at = now()
  where w.series_id = v_series.id
    and (
      w.balance - w.escrow <= 0
      or exists (
        select 1
        from public.bets b
        join public.predictions p on p.id = b.prediction_id
        where p.series_id = v_series.id
          and b.player_id = w.player_id
          and greatest(b.placed_at, b.updated_at) >= v_last_week
          and greatest(b.placed_at, b.updated_at) < v_this_week
      )
    );
  get diagnostics v_paid = row_count;

  -- Counts every week a top-up round ran; caps what a late joiner can start with.
  update public.series
  set topups_paid = topups_paid + 1,
      last_topup_week = p_week_key,
      last_topup_recipients = v_paid
  where id = v_series.id;

  -- The Monday push goes out from private.notify_one_series_weekly_recap.
  return true;
end;
$$;

-- Every active series' top-up, in one go (the Monday job runs them one by one
-- through private.run_weekly_jobs instead).
create or replace function private.pay_series_topups()
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
  for v_series in
    select s.id from public.series s
    where s.status = 'active'
      and s.weekly_topup > 0
      and s.last_topup_week is distinct from v_week_key
  loop
    if private.pay_one_series_topup(v_series.id, v_week_key) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

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

-- Whether a step of this week's Monday job is done for a series.
create or replace function private.weekly_step_done(p_week_key text, p_series_id uuid, p_step text)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from private.weekly_job_runs
    where week_key = p_week_key and series_id = p_series_id and step = p_step and status = 'done'
  );
$$;

-- Records how a step went: done (p_error null) or failed with its message.
create or replace function private.mark_weekly_step(p_week_key text, p_series_id uuid, p_step text, p_error text)
returns void
language sql
security definer
set search_path = public, private
as $$
  insert into private.weekly_job_runs (week_key, series_id, step, status, error)
  values (p_week_key, p_series_id, p_step, case when p_error is null then 'done' else 'failed' end, p_error)
  on conflict (week_key, series_id, step) do update
    set status = excluded.status,
        error = excluded.error,
        attempts = private.weekly_job_runs.attempts + 1,
        updated_at = now();
$$;

-- The Monday job: for every active series, record the standings, then pay the
-- week's top-up; then send each room its one recap push. Each series' step
-- runs on its own, so one failing doesn't undo the others, and every step is
-- logged in private.weekly_job_runs. Run again (it's scheduled hourly on
-- Mondays), it only does what isn't done yet: a top-up waits for its
-- snapshot, a push for both, and nothing is paid or announced twice.
create or replace function private.run_weekly_jobs()
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_week_key text := private.current_week_key();
  v_series   record;
  v_done     integer := 0;
  v_failed   integer := 0;
begin
  for v_series in
    select s.id from public.series s where s.status = 'active' order by s.created_at
  loop
    if not private.weekly_step_done(v_week_key, v_series.id, 'snapshot') then
      begin
        perform private.snapshot_one_series(v_series.id, v_week_key);
        perform private.mark_weekly_step(v_week_key, v_series.id, 'snapshot', null);
        v_done := v_done + 1;
      exception when others then
        perform private.mark_weekly_step(v_week_key, v_series.id, 'snapshot', sqlerrm);
        v_failed := v_failed + 1;
        -- The top-up waits: the snapshot must see the week as it ended.
        continue;
      end;
    end if;

    if not private.weekly_step_done(v_week_key, v_series.id, 'topup') then
      begin
        perform private.pay_one_series_topup(v_series.id, v_week_key);
        perform private.mark_weekly_step(v_week_key, v_series.id, 'topup', null);
        v_done := v_done + 1;
      exception when others then
        perform private.mark_weekly_step(v_week_key, v_series.id, 'topup', sqlerrm);
        v_failed := v_failed + 1;
      end;
    end if;
  end loop;

  -- One push per room, about its newest active series, once that series'
  -- snapshot and top-up are done.
  for v_series in
    select distinct on (s.room_id) s.id
    from public.series s
    where s.status = 'active'
    order by s.room_id, s.created_at desc
  loop
    if private.weekly_step_done(v_week_key, v_series.id, 'snapshot')
      and private.weekly_step_done(v_week_key, v_series.id, 'topup')
      and not private.weekly_step_done(v_week_key, v_series.id, 'recap')
    then
      begin
        perform private.notify_one_series_weekly_recap(v_series.id, v_week_key);
        perform private.mark_weekly_step(v_week_key, v_series.id, 'recap', null);
        v_done := v_done + 1;
      exception when others then
        perform private.mark_weekly_step(v_week_key, v_series.id, 'recap', sqlerrm);
        v_failed := v_failed + 1;
      end;
    end if;
  end loop;

  return json_build_object('week', v_week_key, 'done', v_done, 'failed', v_failed);
end;
$$;

revoke all on private.weekly_job_runs from public, anon, authenticated;
revoke execute on function private.snapshot_one_series(uuid, text) from public, anon, authenticated;
revoke execute on function private.pay_one_series_topup(uuid, text) from public, anon, authenticated;
revoke execute on function private.notify_one_series_weekly_recap(uuid, text) from public, anon, authenticated;
revoke execute on function private.weekly_step_done(text, uuid, text) from public, anon, authenticated;
revoke execute on function private.mark_weekly_step(text, uuid, text, text) from public, anon, authenticated;
revoke execute on function private.run_weekly_jobs() from public, anon, authenticated;

-- ------------------------------------------------------------
-- The schedule: hourly on Mondays from 00:05 UTC; runs after the first
-- only pick up what failed.
-- ------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'series-weekly-topup';
select cron.schedule('weekly-jobs', '5 * * * 1', $$select private.run_weekly_jobs()$$);
