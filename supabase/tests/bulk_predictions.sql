begin;

create extension if not exists pgtap with schema extensions;

select plan(48);

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
  ('00000000-0000-0000-0000-00000000c4a1', 'authenticated', 'authenticated', 'cara@example.com'),
  ('00000000-0000-0000-0000-00000000da7e', 'authenticated', 'authenticated', 'dave@example.com');

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

create function pg_temp.prediction(p_title text)
returns uuid
language sql
as $$ select id from public.predictions where title = p_title $$;

create function pg_temp.option(p_title text, p_label text)
returns uuid
language sql
as $$
  select o.id from public.prediction_options o
  where o.prediction_id = pg_temp.prediction(p_title) and o.label = p_label
$$;

-- Every push logged for an event type: how many, and the latest one's
-- prediction, title, body and link.
create function pg_temp.pushes(p_event_type text)
returns text
language sql
as $$
  select row(
    count(*),
    max(prediction_id::text) is not null,
    max(payload->'payload'->>'title'),
    max(payload->'payload'->>'body'),
    max(payload->'payload'->>'url')
  )::text
  from private.notification_dispatch_log
  where event_type = p_event_type
$$;

-- Alice owns the room; Bob is a member; Cara resolves; Dave is outside.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Cricket Fever')->>'id'), true);
select set_config('test.room_code', (select room_code from public.rooms where id = pg_temp.setting('room_id')), true);
select set_config('test.room_url', 'https://crow.test/rooms/' || current_setting('test.room_code'), true);
select set_config('test.cup', (public.create_series(pg_temp.setting('room_id'), 'Cup')->>'id'), true);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.register_player('bob');
select public.join_room(current_setting('test.room_code'));
select pg_temp.login('00000000-0000-0000-0000-00000000c4a1');
select public.register_player('cara');
select public.join_room(current_setting('test.room_code'));
select pg_temp.login('00000000-0000-0000-0000-00000000da7e');
select public.register_player('dave');
select set_config('test.other_room', (public.create_room('Elsewhere')->>'id'), true);
select set_config('test.other_cup', (public.create_series(pg_temp.setting('other_room'), 'Other')->>'id'), true);
select set_config('test.outside', (public.create_prediction(pg_temp.setting('other_room'), 'Outside', array['Yes', 'No'], now() + interval '1 day', pg_temp.setting('other_cup'))->>'prediction_id'), true);
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.set_member_role(pg_temp.setting('room_id'), (select id from public.players where username = 'cara'), 'resolver');
delete from private.notification_dispatch_log;

-- ------------------------------------------------------------
-- Creating a set
-- ------------------------------------------------------------
set local role authenticated;
select set_config('test.created', public.create_predictions(
  pg_temp.setting('room_id'),
  pg_temp.setting('cup'),
  '[
    {"title": "Who wins?", "options": ["India", "Draw", "Australia"], "description": " After 90 overs. "},
    {"title": "Toss winner?", "options": ["India", "Australia"]},
    {"title": "A century scored?", "options": ["Yes", "No"]}
  ]'::jsonb,
  now() + interval '1 day',
  null,
  '  India   vs Australia ',
  array['cricket']
)::text, true);
reset role;

select is(
  current_setting('test.created')::json->>'count',
  '3',
  'a set of three is created in one call'
);
select is(
  (select array_agg(title order by series_prediction_number) from public.predictions where room_id = pg_temp.setting('room_id')),
  array['Who wins?', 'Toss winner?', 'A century scored?'],
  'they get series numbers in the order given'
);
select is(
  (select array_agg(distinct status) from public.predictions where room_id = pg_temp.setting('room_id')),
  array['draft'],
  'and are live straight away'
);
select is(
  (select array_agg(label order by display_order) from public.prediction_options where prediction_id = pg_temp.prediction('Who wins?')),
  array['India', 'Draw', 'Australia'],
  'options keep their order'
);
select is(
  (select description from public.predictions where id = pg_temp.prediction('Who wins?')),
  'After 90 overs.',
  'a description is saved, tidied'
);
select is(
  (select count(*)::int from public.prediction_tags t join public.predictions p on p.id = t.prediction_id
   where p.room_id = pg_temp.setting('room_id') and t.tag = 'cricket'),
  3,
  'the tags go on every prediction in the set'
);
select is(
  (select row(count(distinct p.event_id), min(e.title))::text
   from public.predictions p join public.prediction_events e on e.id = p.event_id
   where p.room_id = pg_temp.setting('room_id')),
  row(1::bigint, 'India vs Australia')::text,
  'they share one event, its name tidied'
);
select is(
  (select count(*)::int from public.room_activities
   where room_id = pg_temp.setting('room_id') and activity_type = 'prediction_created'),
  3,
  'each one is posted to the room feed'
);
select is(
  pg_temp.pushes('prediction_live'),
  row(1::bigint, false, '🎯 3 new predictions', 'Cricket Fever · India vs Australia', current_setting('test.room_url'))::text,
  'members get one push for the set, naming the event'
);

-- A set of one is the usual push, opening the prediction.
delete from private.notification_dispatch_log;
set local role authenticated;
select lives_ok(
  format($$ select public.create_predictions(%L, %L, '[{"title": "Solo", "options": ["Yes", "No"], "deadline": "%s"}]'::jsonb, now() + interval '1 day') $$,
    pg_temp.setting('room_id'), pg_temp.setting('cup'), now() + interval '3 days'),
  'a set can hold one prediction, with its own deadline'
);
reset role;
select is(
  pg_temp.pushes('prediction_live'),
  row(1::bigint, true, '🎯 New Prediction', 'Cricket Fever · Solo',
    current_setting('test.room_url') || '/predictions/' || pg_temp.prediction('Solo'))::text,
  'one prediction gets the usual push'
);
select ok(
  (select deadline > now() + interval '2 days' and event_id is null from public.predictions where id = pg_temp.prediction('Solo')),
  'an item''s own deadline wins, and no event name means no event'
);

-- Who can, and what's refused.
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select throws_ok(
  format($$ select public.create_predictions(%L, %L, '[{"title": "Mine", "options": ["Yes", "No"]}]'::jsonb, now() + interval '1 day') $$,
    pg_temp.setting('room_id'), pg_temp.setting('cup')),
  'P0012', 'Only organizers can create predictions',
  'members can''t create a set'
);
select is(
  (select count(*)::int from public.prediction_events where room_id = pg_temp.setting('room_id')),
  1,
  'members can read their room''s events'
);
reset role;
select pg_temp.login('00000000-0000-0000-0000-00000000da7e');
set local role authenticated;
select is(
  (select count(*)::int from public.prediction_events where room_id = pg_temp.setting('room_id')),
  0,
  'people outside the room can''t'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select throws_ok(
  format($$ select public.create_predictions(%L, %L, '[{"title": "Fine", "options": ["Yes", "No"]}, {"title": "One option", "options": ["Yes"]}]'::jsonb, now() + interval '1 day') $$,
    pg_temp.setting('room_id'), pg_temp.setting('cup')),
  'P0001', '"One option" must have between 2 and 6 options',
  'a bad item is refused by name'
);
reset role;
select is(
  (select count(*)::int from public.predictions where title = 'Fine'),
  0,
  'and nothing from that set is created'
);
set local role authenticated;
select throws_ok(
  format($$ select public.create_predictions(%L, %L, '[]'::jsonb, now() + interval '1 day') $$,
    pg_temp.setting('room_id'), pg_temp.setting('cup')),
  'P0001', 'Add between 1 and 20 predictions',
  'an empty set is refused'
);
select throws_ok(
  format($$ select public.create_predictions(%L, %L, (select jsonb_agg(jsonb_build_object('title', 'Q' || n, 'options', array['Yes', 'No'])) from generate_series(1, 21) n), now() + interval '1 day') $$,
    pg_temp.setting('room_id'), pg_temp.setting('cup')),
  'P0001', 'Add between 1 and 20 predictions',
  'so is one over 20'
);

reset role;

-- Scheduled sets stay hidden, then go live together, in order.
delete from private.notification_dispatch_log;
set local role authenticated;
select is(
  public.create_predictions(
    pg_temp.setting('room_id'),
    pg_temp.setting('cup'),
    '[{"title": "Later one", "options": ["Yes", "No"]}, {"title": "Later two", "options": ["Yes", "No"]}]'::jsonb,
    now() + interval '1 day',
    now() + interval '2 hours',
    'Final'
  )->>'status',
  'scheduled',
  'a set with a future go-live time is scheduled'
);
reset role;
select is(
  (select row(count(*), count(series_prediction_number))::text from public.predictions where title like 'Later%'),
  row(2::bigint, 0::bigint)::text,
  'with no series numbers yet'
);
select is(
  (select count(*)::int from private.notification_dispatch_log),
  0,
  'and no push'
);
select is(private.publish_scheduled_predictions(array[pg_temp.prediction('Later one'), pg_temp.prediction('Later two')]), 2, 'both go live');
select is(
  (select series_prediction_number from public.predictions where title = 'Later two')
    - (select series_prediction_number from public.predictions where title = 'Later one'),
  1,
  'numbered in the order they were written'
);
select is(
  pg_temp.pushes('prediction_live'),
  row(1::bigint, false, '🎯 2 new predictions', 'Cricket Fever · Final', current_setting('test.room_url'))::text,
  'with one push when they do'
);

-- ------------------------------------------------------------
-- The 1-hour reminder and locking: one push for predictions sharing a deadline
-- ------------------------------------------------------------
delete from private.notification_dispatch_log;
update public.predictions set deadline = now() + interval '30 minutes'
where id in (pg_temp.prediction('Who wins?'), pg_temp.prediction('Toss winner?'), pg_temp.prediction('A century scored?'));
select private.fire_push_notification_for_deadline_1h();
select is(
  pg_temp.pushes('deadline_1h'),
  row(1::bigint, false, '⏰ 1 hour left on 3 predictions', 'Cricket Fever · India vs Australia', current_setting('test.room_url'))::text,
  'three closing within the hour are one reminder'
);
select private.fire_push_notification_for_deadline_1h();
select is(
  (select count(*)::int from private.notification_dispatch_log where event_type = 'deadline_1h'),
  1,
  'sent once'
);

-- Picks, so the results below move points.
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.place_bet(pg_temp.prediction('Who wins?'), pg_temp.option('Who wins?', 'India'), 100);
select public.place_bet(pg_temp.prediction('A century scored?'), pg_temp.option('A century scored?', 'Yes'), 50);
select pg_temp.login('00000000-0000-0000-0000-00000000c4a1');
select public.place_bet(pg_temp.prediction('Who wins?'), pg_temp.option('Who wins?', 'Australia'), 100);
select set_config('test.bob_before', (
  select (w.balance)::text from public.series_wallets w
  join public.players p on p.id = w.player_id
  where w.series_id = pg_temp.setting('cup') and p.username = 'bob'
), true);

-- The every-minute job locks what's past its deadline, in one statement.
update public.predictions set deadline = now() - interval '1 minute'
where id in (pg_temp.prediction('Who wins?'), pg_temp.prediction('Toss winner?'), pg_temp.prediction('A century scored?'));
update public.predictions set status = 'locked' where status = 'draft' and deadline <= now();
select is(
  pg_temp.pushes('prediction_locked'),
  row(1::bigint, false, '🔒 Betting closed on 3 predictions', 'Cricket Fever · India vs Australia', current_setting('test.room_url'))::text,
  'three locking together are one push'
);

delete from private.notification_dispatch_log;
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.lock_prediction(pg_temp.prediction('Solo'));
select is(
  pg_temp.pushes('prediction_locked'),
  row(1::bigint, true, '🔒 Betting Closed', 'Cricket Fever · Solo',
    current_setting('test.room_url') || '/predictions/' || pg_temp.prediction('Solo'))::text,
  'one locking on its own gets the usual push'
);

-- ------------------------------------------------------------
-- Closing several
-- ------------------------------------------------------------
delete from private.notification_dispatch_log;

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select throws_ok(
  format($$ select public.resolve_predictions(%L, '[{"prediction_id": "%s", "outcome": "cancel"}]'::jsonb) $$,
    pg_temp.setting('room_id'), pg_temp.prediction('Toss winner?')),
  'P0012', 'Only room staff can close predictions',
  'members can''t close predictions'
);
reset role;

-- Cara, a resolver: a winner, a "win" nobody bet on, and a cancellation.
select pg_temp.login('00000000-0000-0000-0000-00000000c4a1');
set local role authenticated;
select throws_ok(
  format($$ select public.resolve_predictions(%L, '[{"prediction_id": "%s", "outcome": "cancel"}, {"prediction_id": "%s", "outcome": "win", "winning_option_id": "%s"}]'::jsonb) $$,
    pg_temp.setting('room_id'), pg_temp.prediction('Toss winner?'), pg_temp.prediction('Later one'), pg_temp.option('Later one', 'Yes')),
  'P0001', '"Later one" is still open for picks, so it can only be cancelled',
  'an open prediction can''t be given a winner'
);
select throws_ok(
  format($$ select public.resolve_predictions(%L, '[{"prediction_id": "%s", "outcome": "cancel"}, {"prediction_id": "%s", "outcome": "cancel"}]'::jsonb) $$,
    pg_temp.setting('room_id'), pg_temp.prediction('Toss winner?'), pg_temp.setting('outside')),
  'P0006', 'Prediction not found in this room',
  'nor can one from another room be closed'
);
select throws_ok(
  format($$ select public.resolve_predictions(%L, '[{"prediction_id": "%s", "outcome": "cancel"}, {"prediction_id": "%s", "outcome": "no_result"}]'::jsonb) $$,
    pg_temp.setting('room_id'), pg_temp.prediction('Toss winner?'), pg_temp.prediction('Toss winner?')),
  'P0001', 'Each prediction can be closed only once',
  'or the same one twice'
);
reset role;
select is(
  (select status from public.predictions where id = pg_temp.prediction('Toss winner?')),
  'locked',
  'a refused set closes nothing'
);

set local role authenticated;
select is(
  public.resolve_predictions(
    pg_temp.setting('room_id'),
    jsonb_build_array(
      jsonb_build_object('prediction_id', pg_temp.prediction('Who wins?'), 'outcome', 'win', 'winning_option_id', pg_temp.option('Who wins?', 'India')),
      jsonb_build_object('prediction_id', pg_temp.prediction('Toss winner?'), 'outcome', 'win', 'winning_option_id', pg_temp.option('Toss winner?', 'Australia')),
      jsonb_build_object('prediction_id', pg_temp.prediction('A century scored?'), 'outcome', 'cancel', 'no_result_reason', 'Rained off')
    )
  )::jsonb,
  '{"resolved": 3, "revealed": 1, "no_result": 1, "cancelled": 1}'::jsonb,
  'a resolver closes three at once, each its own way'
);
reset role;

select is(
  (select array_agg(status || ':' || coalesce(no_result_reason, '') order by series_prediction_number)
   from public.predictions where event_id = (select id from public.prediction_events where title = 'India vs Australia')),
  array['revealed:', 'no_result:Nobody placed a bet', 'cancelled:Rained off'],
  'each ends as chosen (a win nobody bet on is no result)'
);
select is(
  (select w.balance - current_setting('test.bob_before')::int from public.series_wallets w
   join public.players p on p.id = w.player_id
   where w.series_id = pg_temp.setting('cup') and p.username = 'bob'),
  100,
  'the winner is paid and the cancelled stake stays theirs'
);
select is(
  (select w.escrow from public.series_wallets w
   join public.players p on p.id = w.player_id
   where w.series_id = pg_temp.setting('cup') and p.username = 'bob'),
  0,
  'nothing is left held'
);
select is(
  (select count(distinct resolved_by)::int from public.predictions where status in ('revealed', 'no_result', 'cancelled')
     and room_id = pg_temp.setting('room_id')),
  1,
  'all are recorded as closed by the resolver'
);
select is(
  (select array_agg(activity_type order by activity_type) from public.room_activities
   where room_id = pg_temp.setting('room_id')
     and activity_type in ('prediction_revealed', 'prediction_no_result', 'prediction_cancelled')),
  array['prediction_cancelled', 'prediction_no_result', 'prediction_revealed'],
  'each result is posted to the room feed'
);
select is(
  pg_temp.pushes('result_revealed'),
  row(1::bigint, false, '🏆 3 results are in', 'Cricket Fever · India vs Australia', current_setting('test.room_url'))::text,
  'members get one push for all three'
);

set local role authenticated;
select throws_ok(
  format($$ select public.resolve_predictions(%L, '[{"prediction_id": "%s", "outcome": "cancel"}, {"prediction_id": "%s", "outcome": "cancel"}]'::jsonb) $$,
    pg_temp.setting('room_id'), pg_temp.prediction('Later one'), pg_temp.prediction('Who wins?')),
  'P0006', '"Who wins?" is already closed',
  'a closed prediction can''t be closed again, and is named'
);

reset role;

-- A match called off before it locks: open ones can be cancelled together.
delete from private.notification_dispatch_log;
set local role authenticated;
select is(
  public.resolve_predictions(
    pg_temp.setting('room_id'),
    jsonb_build_array(
      jsonb_build_object('prediction_id', pg_temp.prediction('Later one'), 'outcome', 'cancel', 'no_result_reason', 'Called off'),
      jsonb_build_object('prediction_id', pg_temp.prediction('Later two'), 'outcome', 'cancel', 'no_result_reason', 'Called off')
    )
  )->>'cancelled',
  '2',
  'open predictions can be cancelled together'
);
reset role;
select is(
  pg_temp.pushes('result_revealed'),
  row(1::bigint, false, '↩️ 2 predictions called off · points returned', 'Cricket Fever · Final', current_setting('test.room_url'))::text,
  'with one push saying they''re off'
);

-- Closing one through the set is the usual single push.
delete from private.notification_dispatch_log;
set local role authenticated;
select is(
  public.resolve_predictions(
    pg_temp.setting('room_id'),
    jsonb_build_array(jsonb_build_object('prediction_id', pg_temp.prediction('Solo'), 'outcome', 'no_result'))
  )->>'no_result',
  '1',
  'one prediction can be closed this way too'
);
reset role;
select is(
  pg_temp.pushes('result_revealed'),
  row(1::bigint, true, '🏆 Result Is In', 'Cricket Fever · Solo',
    current_setting('test.room_url') || '/predictions/' || pg_temp.prediction('Solo'))::text,
  'and gets the usual push'
);

-- Closing one the old way still pushes once.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select set_config('test.single', (public.create_prediction(pg_temp.setting('room_id'), 'Single', array['Yes', 'No'], now() + interval '1 day', pg_temp.setting('cup'))->>'prediction_id'), true);
reset role;
delete from private.notification_dispatch_log;
set local role authenticated;
select public.resolve_prediction_v2(pg_temp.setting('single'), pg_temp.setting('room_id'), 'cancel');
reset role;
select is(
  (select count(*)::int from private.notification_dispatch_log where event_type = 'result_revealed' and prediction_id = pg_temp.setting('single')),
  1,
  'closing one prediction on its own still sends its push'
);

-- ------------------------------------------------------------
-- The manage queue groups by event
-- ------------------------------------------------------------
set local role authenticated;
select public.create_predictions(
  pg_temp.setting('room_id'), pg_temp.setting('cup'),
  '[{"title": "Queue one", "options": ["Yes", "No"]}, {"title": "Queue two", "options": ["Yes", "No"]}]'::jsonb,
  now() + interval '1 day', null, 'Semi-final'
);
select is(
  (select array_agg(distinct item->>'event_title')
   from json_array_elements(public.get_room_manage_queue(pg_temp.setting('room_id'))->'open') item
   where item->>'title' like 'Queue%'),
  array['Semi-final'],
  'the manage queue says which event each prediction is for'
);
reset role;

select * from finish();

rollback;
