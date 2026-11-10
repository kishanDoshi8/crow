begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

-- ------------------------------------------------------------
-- Fixtures: Alice runs two rooms, each with an active series where she bet
-- last week. Pushes are dispatched and logged.
-- ------------------------------------------------------------
insert into private.notification_config (key, value)
values
  ('supabase_url', 'http://localhost:54321'),
  ('notification_function_secret', 'secret'),
  ('service_role_key', 'service-key'),
  ('app_url', 'https://crow.test')
on conflict (key) do update set value = excluded.value;

insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com');

create function pg_temp.login(p_user_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', p_user_id::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.setting(p_name text)
returns uuid
language sql
as $$ select current_setting('test.' || p_name)::uuid $$;

create function pg_temp.step(p_series text, p_step text)
returns text
language sql
as $$
  select status from private.weekly_job_runs
  where series_id = pg_temp.setting(p_series) and step = p_step and week_key = private.current_week_key()
$$;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.register_player('alice');
select set_config('test.cricket', (public.create_room('Cricket')->>'id'), true);
select set_config('test.soccer', (public.create_room('Soccer')->>'id'), true);
select set_config('test.odis', (public.create_series(pg_temp.setting('cricket'), 'ODIs', null, 0, 1000, 100)->>'id'), true);
select set_config('test.epl', (public.create_series(pg_temp.setting('soccer'), 'EPL', null, 0, 1000, 50)->>'id'), true);
select set_config('test.odi', (public.create_prediction(pg_temp.setting('cricket'), 'ODI 1?', array['IND', 'AUS'], now() + interval '1 day', pg_temp.setting('odis'))->>'prediction_id'), true);
select set_config('test.match', (public.create_prediction(pg_temp.setting('soccer'), 'Derby?', array['Home', 'Away'], now() + interval '1 day', pg_temp.setting('epl'))->>'prediction_id'), true);
select public.place_bet(pg_temp.setting('odi'), (select id from public.prediction_options where prediction_id = pg_temp.setting('odi') limit 1), 100);
select public.place_bet(pg_temp.setting('match'), (select id from public.prediction_options where prediction_id = pg_temp.setting('match') limit 1), 100);
reset role;

update public.bets set placed_at = now() - interval '7 days', updated_at = now() - interval '7 days';
update public.series set last_topup_week = null;

-- The cricket series' snapshot breaks this Monday.
create function pg_temp.break_cricket()
returns trigger
language plpgsql
as $$
begin
  if new.series_id = current_setting('test.odis')::uuid then
    raise exception 'snapshot storage is down';
  end if;
  return new;
end;
$$;
create trigger break_cricket before insert on public.series_standing_snapshots
for each row execute function pg_temp.break_cricket();

delete from private.notification_dispatch_log;

-- ------------------------------------------------------------
-- 1. One series failing doesn't stop the others
-- ------------------------------------------------------------
select is(
  (private.run_weekly_jobs()->>'failed')::int,
  1,
  'a failing series is counted'
);
select is(
  row(pg_temp.step('epl', 'snapshot'), pg_temp.step('epl', 'topup'), pg_temp.step('epl', 'recap'))::text,
  row('done', 'done', 'done')::text,
  'the other series still gets its snapshot, top-up and push'
);
select is(
  (select row(status, error)::text from private.weekly_job_runs
   where series_id = pg_temp.setting('odis') and step = 'snapshot'),
  row('failed', 'snapshot storage is down')::text,
  'the failure is logged with its message'
);
select is(
  (select last_topup_week from public.series where id = pg_temp.setting('odis')),
  null,
  'its top-up waits for the snapshot'
);
select is(
  (select count(*)::int from private.notification_dispatch_log where room_id = pg_temp.setting('cricket')),
  0,
  'and so does its push'
);

-- ------------------------------------------------------------
-- 2. The next run retries only what's missing
-- ------------------------------------------------------------
drop trigger break_cricket on public.series_standing_snapshots;

select is(
  (private.run_weekly_jobs()->>'failed')::int,
  0,
  'the retry succeeds'
);
select is(
  row(pg_temp.step('odis', 'snapshot'), pg_temp.step('odis', 'topup'), pg_temp.step('odis', 'recap'))::text,
  row('done', 'done', 'done')::text,
  'the failed series catches up'
);
select is(
  (select attempts from private.weekly_job_runs where series_id = pg_temp.setting('odis') and step = 'snapshot'),
  2,
  'and its attempts are counted'
);
select is(
  (select count(*)::int from private.notification_dispatch_log where room_id = pg_temp.setting('soccer')),
  1,
  'a room already done isn''t pushed again'
);

-- ------------------------------------------------------------
-- 3. Running again changes nothing
-- ------------------------------------------------------------
select set_config('test.balance_before', (select sum(balance)::text from public.series_wallets), true);
select set_config('test.pushes_before', (select count(*)::text from private.notification_dispatch_log), true);
select is((private.run_weekly_jobs()->>'done')::int, 0, 'a run with nothing left to do does nothing');
select is(
  (select sum(balance)::text from public.series_wallets),
  current_setting('test.balance_before'),
  'nobody is topped up twice'
);
select is(
  (select count(*)::text from private.notification_dispatch_log),
  current_setting('test.pushes_before'),
  'and no room is pushed twice'
);

select * from finish();
rollback;
