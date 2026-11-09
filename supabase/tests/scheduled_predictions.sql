begin;

create extension if not exists pgtap with schema extensions;

select plan(37);

-- Push config is set, so pushes are dispatched and logged.
insert into private.notification_config (key, value)
values
  ('supabase_url', 'http://localhost:54321'),
  ('notification_function_secret', 'secret'),
  ('service_role_key', 'service-key'),
  ('app_url', 'https://crow.test')
on conflict (key) do update set value = excluded.value;

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000c4a1', 'authenticated', 'authenticated', 'cara@example.com');

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

create function pg_temp.schedule(p_title text, p_opens interval, p_deadline interval, p_series text default 'cup')
returns uuid
language sql
as $$
  select (public.create_prediction(
    pg_temp.setting('room_id'), p_title, array['Yes', 'No'],
    now() + p_deadline, pg_temp.setting(p_series), now() + p_opens
  )->>'prediction_id')::uuid
$$;

-- Alice owns the room; Bob is a member; Cara resolves.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Cricket Fever')->>'id'), true);
select set_config('test.room_code', (select room_code from public.rooms where id = pg_temp.setting('room_id')), true);
select set_config('test.cup', (public.create_series(pg_temp.setting('room_id'), 'Cup')->>'id'), true);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.register_player('bob');
select public.join_room(current_setting('test.room_code'));
select pg_temp.login('00000000-0000-0000-0000-00000000c4a1');
select set_config('test.cara', (public.register_player('cara')->>'id'), true);
select public.join_room(current_setting('test.room_code'));
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.set_member_role(pg_temp.setting('room_id'), (select id from public.players where username = 'cara'), 'resolver');

-- ------------------------------------------------------------
-- Scheduling
-- ------------------------------------------------------------
set local role authenticated;
select set_config('test.later', pg_temp.schedule('Toss winner?', interval '2 hours', interval '1 day')::text, true);
reset role;

select is(
  (select row(status, series_prediction_number)::text from public.predictions where id = pg_temp.setting('later')),
  row('scheduled', null::int)::text,
  'a prediction with a future go-live time is scheduled, with no series number yet'
);
select is(
  (select count(*)::int from public.room_activities where metadata->>'prediction_id' = current_setting('test.later')
     or click_action->>'predictionId' = current_setting('test.later')),
  0,
  'scheduling posts nothing to the room feed'
);
select is(
  (select count(*)::int from private.notification_dispatch_log where prediction_id = pg_temp.setting('later')),
  0,
  'scheduling sends no push'
);

set local role authenticated;
select throws_ok(
  format($$ select public.create_prediction(%L, 'Too short', array['Yes', 'No'], now() + interval '2 hours 3 minutes', %L, now() + interval '2 hours') $$,
    pg_temp.setting('room_id'), pg_temp.setting('cup')),
  'P0001', 'Leave at least 5 minutes between going live and the deadline',
  'a scheduled prediction stays open at least 5 minutes'
);
select is(
  (public.create_prediction(pg_temp.setting('room_id'), 'Now', array['Yes', 'No'], now() + interval '1 day', pg_temp.setting('cup'), now() - interval '1 minute')->>'status'),
  'draft',
  'a go-live time already past means live now'
);
select ok(
  (select opens_at is not null from public.predictions where title = 'Now'),
  'a live prediction records when it went live'
);

-- No more open predictions limit (it was 5).
select lives_ok(
  format($$ select public.create_prediction(%L, 'Game ' || n, array['Yes', 'No'], now() + interval '1 day', %L) from generate_series(1, 6) n $$,
    pg_temp.setting('room_id'), pg_temp.setting('cup')),
  'rooms have no limit on open predictions'
);
reset role;

-- ------------------------------------------------------------
-- Hidden from everyone but organizers
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select is(
  (select count(*)::int from public.predictions where id = pg_temp.setting('later')),
  0,
  'members can''t see a scheduled prediction'
);
select is(
  (select count(*)::int from public.prediction_options where prediction_id = pg_temp.setting('later')),
  0,
  'or its options'
);
select throws_ok(
  format($$ select public.get_prediction_talk(%L) $$, pg_temp.setting('later')),
  'P0002', 'Prediction not found',
  'or its room talk'
);
select throws_ok(
  format($$ select public.place_bet(%L, (select id from public.prediction_options limit 1), 10) $$, pg_temp.setting('later')),
  'P0006', null,
  'members can''t bet on it'
);
select throws_ok(
  format($$ select public.publish_prediction_now(%L) $$, pg_temp.setting('later')),
  'P0012', null,
  'members can''t put it live'
);
select throws_ok(
  format($$ select public.delete_scheduled_prediction(%L) $$, pg_temp.setting('later')),
  'P0012', null,
  'members can''t delete it'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000c4a1');
set local role authenticated;
select is(
  (select count(*)::int from public.predictions where id = pg_temp.setting('later')),
  0,
  'resolvers can''t see scheduled predictions either'
);
select is(
  json_array_length(public.get_room_manage_queue(pg_temp.setting('room_id'))->'scheduled'),
  0,
  'a resolver''s queue has no scheduled section'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select is(
  (select count(*)::int from public.predictions where id = pg_temp.setting('later')),
  1,
  'organizers see it'
);
select is(
  (public.get_room_manage_queue(pg_temp.setting('room_id'))->'scheduled'->0->>'id'),
  current_setting('test.later'),
  'and find it in the manage queue'
);
select throws_ok(
  format($$ select public.set_prediction_reaction(%L, 'fire') $$, pg_temp.setting('later')),
  'P0001', 'It isn''t live yet',
  'nobody reacts before it goes live'
);

-- ------------------------------------------------------------
-- Editing
-- ------------------------------------------------------------
select lives_ok(
  format($$ select public.update_prediction(%L, 'Who wins the toss?', now() + interval '2 days', array['Home', 'Away', 'Neither'], now() + interval '3 hours') $$,
    pg_temp.setting('later')),
  'organizers can change everything on a scheduled prediction, including when it goes live'
);
select throws_ok(
  format($$ select public.update_prediction(%L, 'Who wins the toss?', now() + interval '2 days', null, now() - interval '1 minute') $$,
    pg_temp.setting('later')),
  'P0001', 'Pick a go-live time in the future, or put it live now',
  'the go-live time stays in the future'
);
select throws_ok(
  format($$ select public.update_prediction(%L, 'Who wins the toss?', now() + interval '3 hours 2 minutes', null) $$,
    pg_temp.setting('later')),
  'P0001', 'Leave at least 5 minutes between going live and the deadline',
  'moving the deadline keeps 5 minutes after going live'
);
reset role;

select is(
  (select row(title, (select count(*) from public.prediction_options o where o.prediction_id = p.id))::text
   from public.predictions p where id = pg_temp.setting('later')),
  row('Who wins the toss?', 3::bigint)::text,
  'the edits are saved'
);

-- ------------------------------------------------------------
-- Going live now
-- ------------------------------------------------------------
set local role authenticated;
select is(
  (public.publish_prediction_now(pg_temp.setting('later'))->>'status'),
  'draft',
  'an organizer can put it live straight away'
);
reset role;

select is(
  (select series_prediction_number from public.predictions where id = pg_temp.setting('later')),
  (select max(series_prediction_number) from public.predictions where series_id = pg_temp.setting('cup')),
  'it takes the next number in the series'
);
select is(
  (select count(*)::int from public.room_activities
   where activity_type = 'prediction_created' and click_action->>'predictionId' = current_setting('test.later')),
  1,
  'and its "new prediction" post'
);
select is(
  (select payload->'payload'->>'url' from private.notification_dispatch_log
   where event_type = 'prediction_live' and prediction_id = pg_temp.setting('later')),
  'https://crow.test/rooms/' || current_setting('test.room_code') || '/predictions/' || current_setting('test.later'),
  'one prediction going live gets the usual push, to the prediction'
);

set local role authenticated;
select throws_ok(
  format($$ select public.publish_prediction_now(%L) $$, pg_temp.setting('later')),
  'P0006', 'This prediction is already live',
  'it can''t go live twice'
);
select throws_ok(
  format($$ select public.delete_scheduled_prediction(%L) $$, pg_temp.setting('later')),
  'P0006', null,
  'a live prediction can''t be deleted, only cancelled'
);
reset role;

-- ------------------------------------------------------------
-- The every-minute job
-- ------------------------------------------------------------
set local role authenticated;
select set_config('test.second', pg_temp.schedule('Second to open', interval '1 hour', interval '1 day')::text, true);
select set_config('test.first', pg_temp.schedule('First to open', interval '30 minutes', interval '1 day')::text, true);
select set_config('test.not_yet', pg_temp.schedule('Not yet', interval '5 hours', interval '1 day')::text, true);
reset role;

-- Time passes: the first two are due.
update public.predictions set opens_at = now() - interval '2 minutes' where id = pg_temp.setting('first');
update public.predictions set opens_at = now() - interval '1 minute' where id = pg_temp.setting('second');
delete from private.notification_dispatch_log;

select is(private.publish_scheduled_predictions(), 2, 'the job puts every due prediction live');
select is(
  (select status from public.predictions where id = pg_temp.setting('not_yet')),
  'scheduled',
  'and leaves the rest scheduled'
);
select is(
  (select series_prediction_number from public.predictions where id = pg_temp.setting('second'))
    - (select series_prediction_number from public.predictions where id = pg_temp.setting('first')),
  1,
  'numbers follow the order they went live'
);
select is(
  (select row(count(*), max(prediction_id::text), max(payload->'payload'->>'title'), max(payload->'payload'->>'url'))::text
   from private.notification_dispatch_log where event_type = 'prediction_live'),
  row(1::bigint, null::text, '🎯 2 new predictions', 'https://crow.test/rooms/' || current_setting('test.room_code'))::text,
  'several going live at once send one push to the room'
);
select is(private.publish_scheduled_predictions(), 0, 'running it again does nothing');

-- ------------------------------------------------------------
-- Deleting, and ending the series
-- ------------------------------------------------------------
set local role authenticated;
select lives_ok(
  format($$ select public.delete_scheduled_prediction(%L) $$, pg_temp.setting('not_yet')),
  'an organizer can delete a scheduled prediction'
);
reset role;
select is(
  (select count(*)::int from public.predictions where id = pg_temp.setting('not_yet')),
  0,
  'it''s gone'
);

-- A series with only a scheduled prediction left ends, and takes it along.
set local role authenticated;
select set_config('test.league', (public.create_series(pg_temp.setting('room_id'), 'League')->>'id'), true);
select set_config('test.unplayed', pg_temp.schedule('Never played', interval '1 day', interval '2 days', 'league')::text, true);
select lives_ok(
  format($$ select public.complete_series(%L) $$, pg_temp.setting('league')),
  'a series with scheduled predictions can still end'
);
reset role;
select is(
  (select count(*)::int from public.predictions where id = pg_temp.setting('unplayed')),
  0,
  'ending a series deletes its scheduled predictions'
);

select * from finish();
rollback;
