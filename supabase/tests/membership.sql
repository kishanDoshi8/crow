begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000ca01', 'authenticated', 'authenticated', 'carol@example.com');

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

create function pg_temp.option(p_prediction uuid, p_label text)
returns uuid
language sql
as $$ select id from public.prediction_options where prediction_id = p_prediction and label = p_label $$;

create function pg_temp.wallet(p_username text)
returns int[]
language sql
as $$
  select array[balance, escrow] from public.series_wallets
  where series_id = pg_temp.setting('cup') and player_id = pg_temp.player(p_username)
$$;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Crow room')->>'id'), true);
select set_config('test.room_code', (select room_code from public.rooms where id = pg_temp.setting('room_id')), true);
select set_config('test.cup', (public.create_series(pg_temp.setting('room_id'), 'Cup', null, 0, 1000, 100, 0)->>'id'), true);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.register_player('bob');
select public.join_room(current_setting('test.room_code'));
select pg_temp.login('00000000-0000-0000-0000-00000000ca01');
select public.register_player('carol');
select public.join_room(current_setting('test.room_code'));

-- Bob plays two predictions: one gets locked, one stays open.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select set_config('test.locked', (public.create_prediction(pg_temp.setting('room_id'), 'Locked', array['Yes', 'No'], now() + interval '1 day', pg_temp.setting('cup'))->>'prediction_id'), true);
select set_config('test.open', (public.create_prediction(pg_temp.setting('room_id'), 'Open', array['Yes', 'No'], now() + interval '1 day', pg_temp.setting('cup'))->>'prediction_id'), true);
select public.place_bet(pg_temp.setting('locked'), pg_temp.option(pg_temp.setting('locked'), 'Yes'), 40);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.place_bet(pg_temp.setting('locked'), pg_temp.option(pg_temp.setting('locked'), 'No'), 30);
select public.place_bet(pg_temp.setting('open'), pg_temp.option(pg_temp.setting('open'), 'No'), 20);
update public.predictions set status = 'locked' where id = pg_temp.setting('locked');
update public.room_members set prediction_rating = 1612, current_streak = 4 where player_id = pg_temp.player('bob');

-- ------------------------------------------------------------
-- Leaving
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select throws_ok(
  format($$ select public.leave_room(%L) $$, pg_temp.setting('room_id')),
  'P0001', 'Hand the room to someone else before you leave',
  'the owner can''t leave'
);

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select lives_ok(
  format($$ select public.leave_room(%L) $$, pg_temp.setting('room_id')),
  'a member can leave'
);
select ok(
  not exists (select 1 from public.room_members where player_id = pg_temp.player('bob')),
  'they''re no longer a member'
);
select is(
  (select count(*)::int from public.bets where prediction_id = pg_temp.setting('open') and player_id = pg_temp.player('bob')),
  0,
  'their bet on an open prediction is handed back'
);
select is(
  (select total_bet from public.prediction_options where id = pg_temp.option(pg_temp.setting('open'), 'No')),
  0,
  'and taken off the option'
);
select is(pg_temp.wallet('bob'), array[1000, 30], 'only the locked stake stays in escrow');

set local role authenticated;
select is(
  (select count(*)::int from public.predictions where room_id = pg_temp.setting('room_id')),
  0,
  'a former member can''t read the room'
);
reset role;

-- The locked prediction still settles with their bet in it.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.resolve_prediction_v2(pg_temp.setting('locked'), pg_temp.setting('room_id'), 'win', pg_temp.option(pg_temp.setting('locked'), 'No'));
select is(pg_temp.wallet('bob'), array[1030, 0], 'a locked bet left behind still pays out (30 won from alice''s 40)');

set local role authenticated;
select is(
  (select json_agg(f->>'username') from json_array_elements(public.get_room_former_members(pg_temp.setting('room_id'))) f)::text,
  '["bob"]',
  'members see who used to be in the room, by name'
);
reset role;

-- Coming back
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select lives_ok(
  format($$ select public.join_room(%L) $$, current_setting('test.room_code')),
  'someone who left can rejoin with the code'
);
select is(
  (select array[prediction_rating, current_streak] from public.room_members where player_id = pg_temp.player('bob')),
  array[1612, 4],
  'and gets their rating and streak back'
);
select is(pg_temp.wallet('bob'), array[1030, 0], 'their wallet is the one they left, not a fresh stack');
select ok(
  not exists (select 1 from public.room_former_members where player_id = pg_temp.player('bob')),
  'they''re no longer listed as a former member'
);

-- ------------------------------------------------------------
-- Removing
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000ca01');
select throws_ok(
  format($$ select public.remove_room_member(%L, %L) $$, pg_temp.setting('room_id'), pg_temp.player('bob')),
  'P0012', 'Only the room owner can remove members',
  'members can''t remove anyone'
);

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.set_member_role(pg_temp.setting('room_id'), pg_temp.player('bob'), 'organizer');
select throws_ok(
  format($$ select public.remove_room_member(%L, %L) $$, pg_temp.setting('room_id'), pg_temp.player('alice')),
  'P0001', 'The owner can''t be removed. Transfer ownership first.',
  'the owner can''t be removed'
);
select lives_ok(
  format($$ select public.remove_room_member(%L, %L) $$, pg_temp.setting('room_id'), pg_temp.player('bob')),
  'the owner removes a member'
);

select pg_temp.login('00000000-0000-0000-0000-00000000ca01');
set local role authenticated;
select is(
  (select f->>'status' from json_array_elements(public.get_room_former_members(pg_temp.setting('room_id'))) f),
  'left',
  'other members just see that they left'
);
reset role;
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select is(
  (select f->>'status' from json_array_elements(public.get_room_former_members(pg_temp.setting('room_id'))) f),
  'removed',
  'the owner sees they were removed'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select is(
  (public.get_room_by_code(current_setting('test.room_code'))->>'is_removed')::boolean,
  true,
  'the join screen knows they were removed'
);
select throws_ok(
  format($$ select public.join_room(%L) $$, current_setting('test.room_code')),
  'P0012', 'You were removed from this room. Ask the owner to let you back in.',
  'a removed player can''t rejoin with the code'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select lives_ok(
  format($$ select public.allow_room_member_back(%L, %L) $$, pg_temp.setting('room_id'), pg_temp.player('bob')),
  'the owner lets them back in'
);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.join_room(current_setting('test.room_code'));
select is(
  (select role from public.room_members where player_id = pg_temp.player('bob')),
  'member',
  'they rejoin as a plain member, not with their old role'
);

-- ------------------------------------------------------------
-- Account deletion
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.request_account_deletion('  Moving on  ');
select is(
  public.get_my_account_deletion()->>'status',
  'pending',
  'a player can ask for their account to be deleted'
);
select lives_ok($$ select public.cancel_account_deletion() $$, 'and change their mind');
select is(public.get_my_account_deletion()::text, null, 'nothing is pending after cancelling');
select public.request_account_deletion(null);
reset role;

select set_config('test.alice', pg_temp.player('alice')::text, true);
select private.delete_account(pg_temp.setting('alice'));

select ok(
  (select username like 'Ghost crow %' and user_id is null from public.players where id = pg_temp.setting('alice')),
  'the player is anonymised and detached from the login'
);
select ok(
  not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000a11c'),
  'the login is deleted'
);
select is(
  (select count(*)::int from public.bets where player_id = pg_temp.setting('alice')),
  1,
  'their past bets stay, so results still add up'
);
select is(
  (select p.username from public.room_members rm join public.players p on p.id = rm.player_id
   where rm.room_id = pg_temp.setting('room_id') and rm.role = 'owner'),
  'carol',
  'the room passes to the longest-standing member'
);
select is(
  (select status from public.account_deletion_requests where player_id = pg_temp.setting('alice')),
  'done',
  'the request is marked done'
);

select * from finish();
rollback;
