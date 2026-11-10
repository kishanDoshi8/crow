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
