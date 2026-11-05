begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

-- ------------------------------------------------------------
-- Fixtures: Alice owns a room. Bob, Carol and Dave join.
-- ------------------------------------------------------------
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000ca01', 'authenticated', 'authenticated', 'carol@example.com'),
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

create function pg_temp.player(p_username text)
returns uuid
language sql
as $$ select id from public.players where username = p_username $$;

create function pg_temp.role(p_username text)
returns text
language sql
as $$
  select rm.role from public.room_members rm
  where rm.room_id = pg_temp.setting('room_id') and rm.player_id = pg_temp.player(p_username)
$$;

create function pg_temp.option_id(p_prediction text, p_label text)
returns uuid
language sql
as $$
  select id from public.prediction_options
  where prediction_id = pg_temp.setting(p_prediction) and label = p_label
$$;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Cricket Fever')->>'id'), true);
reset role;

select set_config('test.room_code', (select room_code from public.rooms where id = pg_temp.setting('room_id')), true);

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select public.register_player('bob');
select public.join_room(current_setting('test.room_code'));
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000ca01');
set local role authenticated;
select public.register_player('carol');
select public.join_room(current_setting('test.room_code'));
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000da7e');
set local role authenticated;
select public.register_player('dave');
select public.join_room(current_setting('test.room_code'));
reset role;

-- ------------------------------------------------------------
-- 1. The creator owns the room; everyone else joins as a member
-- ------------------------------------------------------------
select is(pg_temp.role('alice'), 'owner', 'the room creator is its owner');
select is(pg_temp.role('bob'), 'member', 'people who join are members');
select is(
  (select is_organizer from public.room_members where player_id = pg_temp.player('alice')),
  true,
  'is_organizer follows role for the owner'
);

-- ------------------------------------------------------------
-- 2. Only the owner assigns roles
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select throws_ok(
  format($$ select public.set_member_role(%L, %L, 'organizer') $$, pg_temp.setting('room_id'), pg_temp.player('bob')),
  'P0012', null,
  'a member cannot give themselves a role'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.set_member_role(pg_temp.setting('room_id'), pg_temp.player('bob'), 'resolver');
select public.set_member_role(pg_temp.setting('room_id'), pg_temp.player('carol'), 'organizer');
select throws_ok(
  format($$ select public.set_member_role(%L, %L, 'member') $$, pg_temp.setting('room_id'), pg_temp.player('alice')),
  'P0001', null,
  'the owner role cannot be changed with set_member_role'
);
select throws_ok(
  format($$ select public.set_member_role(%L, %L, 'owner') $$, pg_temp.setting('room_id'), pg_temp.player('dave')),
  'P0001', null,
  'ownership is not handed out with set_member_role'
);
select set_config('test.cup', (public.create_series(pg_temp.setting('room_id'), 'IND v AUS')->>'id'), true);
reset role;

select is(pg_temp.role('bob'), 'resolver', 'the owner can make someone a resolver');
select is(pg_temp.role('carol'), 'organizer', 'the owner can make someone an organizer');

-- ------------------------------------------------------------
-- 3. Organizers create and edit predictions; resolvers can't
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select throws_ok(
  format($$ select public.create_prediction(%L, 'Toss?', array['IND', 'AUS'], now() + interval '1 day', %L) $$,
    pg_temp.setting('room_id'), pg_temp.setting('cup')),
  'P0012', null,
  'a resolver cannot create predictions'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000ca01');
set local role authenticated;
select set_config('test.winner',
  (public.create_prediction(pg_temp.setting('room_id'), 'Who wins ODI 1?', array['IND', 'AUS'], now() + interval '1 day', pg_temp.setting('cup'))->>'prediction_id'),
  true);
select set_config('test.toss',
  (public.create_prediction(pg_temp.setting('room_id'), 'Toss?', array['IND', 'AUS'], now() + interval '1 day', pg_temp.setting('cup'))->>'prediction_id'),
  true);
select set_config('test.scorer',
  (public.create_prediction(pg_temp.setting('room_id'), 'Top scorer?', array['Kohli', 'Head'], now() + interval '1 day', pg_temp.setting('cup'))->>'prediction_id'),
  true);

select lives_ok(
  format($$ select public.update_prediction(%L, 'Who wins ODI 1 at Perth?', now() + interval '2 days', array['India', 'Australia', 'No result']) $$,
    pg_temp.setting('winner')),
  'an organizer can edit a prediction before anyone bets'
);
reset role;

select is((select title from public.predictions where id = pg_temp.setting('winner')), 'Who wins ODI 1 at Perth?', 'the title is updated');
select is((select count(*)::int from public.prediction_options where prediction_id = pg_temp.setting('winner')), 3, 'the options are replaced');

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select public.place_bet(pg_temp.setting('winner'), pg_temp.option_id('winner', 'India'), 100);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000da7e');
set local role authenticated;
select public.place_bet(pg_temp.setting('winner'), pg_temp.option_id('winner', 'Australia'), 100);
select throws_ok(
  format($$ select public.update_prediction(%L, 'Hacked', now() + interval '2 days') $$, pg_temp.setting('winner')),
  'P0012', null,
  'a member cannot edit predictions'
);
select throws_ok(
  format($$ select public.get_room_manage_queue(%L) $$, pg_temp.setting('room_id')),
  'P0012', null,
  'a member cannot see the manage queue'
);
select throws_ok(
  format($$ select public.resolve_prediction_v2(%L, %L, 'cancel') $$, pg_temp.setting('toss'), pg_temp.setting('room_id')),
  'P0012', null,
  'a member cannot cancel predictions'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000ca01');
set local role authenticated;
select throws_ok(
  format($$ select public.update_prediction(%L, 'Who wins ODI 1 at Perth?', now() + interval '2 days', array['IND', 'AUS']) $$, pg_temp.setting('winner')),
  'P0001', 'Options can''t change once someone has bet',
  'options are locked once someone has bet'
);
select throws_ok(
  format($$ select public.update_prediction(%L, 'Who loses ODI 1?', now() + interval '2 days') $$, pg_temp.setting('winner')),
  'P0001', 'The question can''t change once someone has bet',
  'the question is locked once someone has bet'
);
select throws_ok(
  format($$ select public.set_prediction_details(%L, 'Decided by run rate', array[]::text[]) $$, pg_temp.setting('winner')),
  'P0001', 'The details can''t change once someone has bet',
  'the details are locked once someone has bet'
);
select lives_ok(
  format($$ select public.update_prediction(%L, 'Who wins ODI 1 at Perth?', now() + interval '3 days', array['India', 'Australia', 'No result']) $$, pg_temp.setting('winner')),
  'the deadline can still change after bets when the question and options are unchanged'
);
select lives_ok(
  format($$ select public.set_prediction_details(%L, null, array['ODI']) $$, pg_temp.setting('winner')),
  'tags can still change after bets'
);
reset role;

-- ------------------------------------------------------------
-- 4. Resolvers see the queue and close predictions, open ones included
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select is(
  json_array_length(public.get_room_manage_queue(pg_temp.setting('room_id'))->'open'),
  3,
  'a resolver sees the predictions still open for picks'
);
select is(
  public.resolve_prediction_v2(pg_temp.setting('toss'), pg_temp.setting('room_id'), 'cancel')->>'outcome',
  'cancelled',
  'a resolver can cancel a prediction that is still open for picks'
);
select throws_ok(
  format($$ select public.resolve_prediction_v2(%L, %L, 'no_result') $$, pg_temp.setting('scorer'), pg_temp.setting('room_id')),
  'P0006', null,
  'an open prediction can only be cancelled, not given a result'
);
reset role;

select is((select resolved_by from public.predictions where id = pg_temp.setting('toss')), pg_temp.player('bob'), 'a cancel records who closed it');

-- The deadline passes and the cron locks it.
update public.predictions set status = 'locked', deadline = now() - interval '5 hours' where id = pg_temp.setting('winner');

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select is(
  json_array_length(public.get_room_manage_queue(pg_temp.setting('room_id'))->'to_resolve'),
  1,
  'locked predictions are waiting to be revealed'
);
select is(
  public.resolve_prediction_v2(pg_temp.setting('winner'), pg_temp.setting('room_id'), 'win', pg_temp.option_id('winner', 'India'))->>'outcome',
  'revealed',
  'a resolver can reveal the result'
);
select is(
  (public.get_room_prediction_history(pg_temp.setting('room_id'))->'items'->0->>'resolver_username'),
  'bob',
  'history says who revealed it'
);
select is(
  (
    select a->'createdBy'->>'username'
    from json_array_elements(public.get_room_activities(pg_temp.setting('room_id'))->'items') a
    where a->>'activityType' = 'prediction_revealed'
  ),
  'bob',
  'the activity feed says who revealed it'
);
select throws_ok(
  format($$ select public.set_member_role(%L, %L, 'organizer') $$, pg_temp.setting('room_id'), pg_temp.player('dave')),
  'P0012', null,
  'a resolver cannot assign roles'
);
reset role;

select is((select resolved_by from public.predictions where id = pg_temp.setting('winner')), pg_temp.player('bob'), 'a reveal records who closed it');

-- ------------------------------------------------------------
-- 5. Owner-only: archive, room settings
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000ca01');
set local role authenticated;
select throws_ok(
  format($$ select public.archive_series(%L) $$, pg_temp.setting('cup')),
  'P0002', null,
  'an organizer cannot archive a series'
);
select throws_ok(
  format($$ select public.update_room(%L, 'Renamed', null, 5, 3) $$, pg_temp.setting('room_id')),
  'P0012', null,
  'an organizer cannot change room settings'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select throws_ok(
  format($$ select public.update_room(%L, 'Cricket Fever', null, 30, 3) $$, pg_temp.setting('room_id')),
  'P0001', null,
  'the open predictions limit is capped at 20'
);
select lives_ok(
  format($$ select public.update_room(%L, '  Cricket Fever 2027 ', 'IPL and India tours', 8, 6) $$, pg_temp.setting('room_id')),
  'the owner can change room settings'
);
reset role;

select is(
  (select row(name, description, predictions_limit, result_reminder_hours)::text from public.rooms where id = pg_temp.setting('room_id')),
  row('Cricket Fever 2027', 'IPL and India tours', 8, 6)::text,
  'room settings are saved and trimmed'
);

-- ------------------------------------------------------------
-- 6. Transferring ownership keeps exactly one owner
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.transfer_ownership(pg_temp.setting('room_id'), pg_temp.player('carol'));
select throws_ok(
  format($$ select public.set_member_role(%L, %L, 'member') $$, pg_temp.setting('room_id'), pg_temp.player('bob')),
  'P0012', null,
  'the previous owner can no longer assign roles'
);
reset role;

select is(pg_temp.role('carol'), 'owner', 'the new owner takes over');
select is(pg_temp.role('alice'), 'organizer', 'the previous owner stays on as an organizer');
select is(
  (select count(*)::int from public.room_members where room_id = pg_temp.setting('room_id') and role = 'owner'),
  1,
  'a room has exactly one owner'
);

-- ------------------------------------------------------------
-- 7. Staff are pushed once when a result is overdue
-- ------------------------------------------------------------
update public.predictions set status = 'locked', deadline = now() - interval '7 hours' where id = pg_temp.setting('scorer');
select private.fire_push_notification_for_result_needed();
select private.fire_push_notification_for_result_needed();

select is(
  (select notified_result_needed from public.predictions where id = pg_temp.setting('scorer')),
  true,
  'an overdue locked prediction is flagged after the push'
);

select * from finish();
rollback;
