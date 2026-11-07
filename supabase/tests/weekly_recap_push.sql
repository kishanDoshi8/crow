begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- ------------------------------------------------------------
-- Fixtures: pushes are dispatched and logged. Alice runs three rooms:
-- - Cricket: second week of its series, top-ups paid
-- - Soccer: first week of its series, top-ups paid
-- - Quiz: first week, nobody played, so no top-ups
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

-- The Monday pushes logged for one room.
create function pg_temp.monday_pushes(p_room text)
returns setof jsonb
language sql
as $$
  select payload->'payload'
  from private.notification_dispatch_log
  where event_type = 'weekly_points_claim' and room_id = pg_temp.setting(p_room)
$$;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.register_player('alice');
select set_config('test.cricket', (public.create_room('Cricket')->>'id'), true);
select set_config('test.soccer', (public.create_room('Soccer')->>'id'), true);
select set_config('test.quiz', (public.create_room('Quiz')->>'id'), true);
select set_config('test.odis', (public.create_series(pg_temp.setting('cricket'), 'IND v AUS', null, 0, 1000, 100)->>'id'), true);
select set_config('test.epl', (public.create_series(pg_temp.setting('soccer'), 'EPL', null, 0, 1000, 50)->>'id'), true);
select public.create_series(pg_temp.setting('quiz'), 'Trivia', null, 0, 1000, 100);
select set_config('test.odi', (public.create_prediction(pg_temp.setting('cricket'), 'ODI 1?', array['IND', 'AUS'], now() + interval '1 day', pg_temp.setting('odis'))->>'prediction_id'), true);
select set_config('test.match', (public.create_prediction(pg_temp.setting('soccer'), 'Derby?', array['Home', 'Away'], now() + interval '1 day', pg_temp.setting('epl'))->>'prediction_id'), true);
select public.place_bet(pg_temp.setting('odi'), (select id from public.prediction_options where prediction_id = pg_temp.setting('odi') limit 1), 100);
select public.place_bet(pg_temp.setting('match'), (select id from public.prediction_options where prediction_id = pg_temp.setting('match') limit 1), 100);
reset role;

-- The bets were placed last week, and this week's top-ups haven't run yet.
update public.bets set placed_at = now() - interval '7 days', updated_at = now() - interval '7 days';
update public.series set last_topup_week = null;

-- The cricket series already had a Monday snapshot last week.
insert into public.series_standing_snapshots (series_id, player_id, week_key, rank, is_ranked, balance)
select pg_temp.setting('odis'), id, '2000-W01', 1, true, 1000 from public.players where username = 'alice';

-- ------------------------------------------------------------
-- 1. Top-ups no longer push on their own
-- ------------------------------------------------------------
select private.snapshot_series_standings();
select private.pay_series_topups();

select is(
  (select count(*)::int from private.notification_dispatch_log where event_type = 'weekly_points_claim'),
  0,
  'paying top-ups sends no push by itself'
);
select is(
  (select last_topup_recipients from public.series where id = pg_temp.setting('odis')),
  1,
  'top-ups record how many players they reached'
);

-- ------------------------------------------------------------
-- 2. One push per room
-- ------------------------------------------------------------
select is(private.notify_weekly_recap(), 2, 'two rooms have something to say');

select is((select count(*)::int from pg_temp.monday_pushes('cricket')), 1, 'one Monday push for a room');
select is(
  (select p->>'title' from pg_temp.monday_pushes('cricket') p),
  'Week 2 standings are in',
  'from the second week it is the standings'
);
select is(
  (select p->>'body' from pg_temp.monday_pushes('cricket') p),
  'alice leads IND v AUS. +100 points for everyone who played.',
  'the standings push names the leader and folds in the top-up'
);
select is(
  (select p->>'url' from pg_temp.monday_pushes('cricket') p),
  'https://crow.test/rooms/' || (select room_code from public.rooms where id = pg_temp.setting('cricket')) || '/leaderboard',
  'the standings push opens the standings'
);
select is(
  (select p->>'title' from pg_temp.monday_pushes('soccer') p),
  '+50 points',
  'in the first week only the top-up is announced'
);
select is((select count(*)::int from pg_temp.monday_pushes('quiz')), 0, 'nothing to say, no push');

-- ------------------------------------------------------------
-- 3. "Result needed" is a setting, with per-room overrides
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select is(
  (public.get_preferences(pg_temp.setting('cricket'))->'global'->>'result_needed')::boolean,
  true,
  'result needed is on by default'
);
select is(
  (public.update_room_preferences(pg_temp.setting('cricket'), p_result_needed => false)->'effective'->>'result_needed')::boolean,
  false,
  'a room can turn result needed off'
);
reset role;

select * from finish();
rollback;
