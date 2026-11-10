begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

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
  ('00000000-0000-0000-0000-0000000001a0', 'authenticated', 'authenticated', 'olga@example.com'),
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000c4a1', 'authenticated', 'authenticated', 'cara@example.com'),
  ('00000000-0000-0000-0000-000000000da0', 'authenticated', 'authenticated', 'dan@example.com'),
  ('00000000-0000-0000-0000-00000000e7e0', 'authenticated', 'authenticated', 'eve@example.com');

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
as $$ select current_setting('test.p_' || p_username)::uuid $$;

-- What Explore shows the logged-in player for the test room, or null.
create function pg_temp.explore_card(p_search text default null)
returns json
language sql
as $$
  select r
  from json_array_elements(public.get_explore_rooms(p_search)) r
  where (r->>'id')::uuid = current_setting('test.room_id')::uuid
$$;

-- Everyone registers; Alice owns the room, Olga organizes, Bob is a member.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.register_player('alice');
select set_config('test.p_alice', (select id::text from public.players where username = 'alice'), true);
select set_config('test.room_id', (public.create_room('Oscar Night Crew')->>'id'), true);
select set_config('test.room_code', (select room_code from public.rooms where id = pg_temp.setting('room_id')), true);
select pg_temp.login('00000000-0000-0000-0000-0000000001a0');
select public.register_player('olga');
select set_config('test.p_olga', (select id::text from public.players where username = 'olga'), true);
select public.join_room(current_setting('test.room_code'));
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.register_player('bob');
select set_config('test.p_bob', (select id::text from public.players where username = 'bob'), true);
select pg_temp.login('00000000-0000-0000-0000-00000000c4a1');
select public.register_player('cara');
select set_config('test.p_cara', (select id::text from public.players where username = 'cara'), true);
select pg_temp.login('00000000-0000-0000-0000-000000000da0');
select public.register_player('dan');
select set_config('test.p_dan', (select id::text from public.players where username = 'dan'), true);
select pg_temp.login('00000000-0000-0000-0000-00000000e7e0');
select public.register_player('eve');
select set_config('test.p_eve', (select id::text from public.players where username = 'eve'), true);
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.set_member_role(pg_temp.setting('room_id'), pg_temp.player('olga'), 'organizer');

-- ------------------------------------------------------------
-- Defaults: private, open, 50 places
-- ------------------------------------------------------------
select is(
  (select row(listed, join_policy, member_limit)::text from public.rooms where id = pg_temp.setting('room_id')),
  row(false, 'open', 50)::text,
  'a new room is private, lets anyone with the code in, and holds 50'
);

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select ok(pg_temp.explore_card() is null, 'a private room is not in Explore');
reset role;

-- ------------------------------------------------------------
-- Settings: owner only
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000001a0');
set local role authenticated;
select throws_ok(
  format($$ select public.update_room(%L, 'Oscar Night Crew', null, 3, true, 'open') $$, pg_temp.setting('room_id')),
  'P0012', null,
  'organizers can''t change who can find and join the room'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select throws_ok(
  format($$ select public.update_room(%L, 'Oscar Night Crew', null, 3, true, 'invite') $$, pg_temp.setting('room_id')),
  'P0001', null,
  'the join policy is open or request'
);
select is(
  (public.update_room(pg_temp.setting('room_id'), 'Oscar Night Crew', 'Film nerds', 3, true, 'open')->>'listed')::boolean,
  true,
  'the owner can list the room in Explore'
);
reset role;

-- ------------------------------------------------------------
-- Explore
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select is(
  (select row(c->>'name', c->>'description', c->>'join_policy', (c->>'member_count')::int, (c->>'member_limit')::int, c->>'my_status')::text
   from pg_temp.explore_card() c),
  row('Oscar Night Crew', 'Film nerds', 'open', 2, 50, null::text)::text,
  'a listed room shows its card to anyone'
);
select ok(pg_temp.explore_card('oscar') is not null, 'Explore search matches the name, any case');
select ok(pg_temp.explore_card('cricket') is null, 'and leaves out rooms that don''t match');
select is(
  (public.join_room(current_setting('test.room_code'), 'explore')->>'membership'),
  'member',
  'an open room lets people straight in'
);
select is((pg_temp.explore_card()->>'my_status'), 'member', 'Explore marks rooms you''re in');
reset role;

-- ------------------------------------------------------------
-- Request-only rooms
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.update_room(pg_temp.setting('room_id'), 'Oscar Night Crew', 'Film nerds', 3, true, 'request');
reset role;
delete from private.notification_dispatch_log;

select pg_temp.login('00000000-0000-0000-0000-00000000c4a1');
set local role authenticated;
select is(
  (public.join_room(current_setting('test.room_code'), 'explore')->>'membership'),
  'requested',
  'a request-only room records a request instead of joining'
);
select is((pg_temp.explore_card()->>'my_status'), 'requested', 'Explore shows the request as sent');
select is(
  (public.join_room(current_setting('test.room_code'))->>'membership'),
  'requested',
  'asking again while waiting changes nothing'
);
select is(
  (select count(*)::int from public.room_join_requests where room_id = pg_temp.setting('room_id')),
  1,
  'people see their own request'
);
reset role;

select ok(
  not exists (select 1 from public.room_members where room_id = pg_temp.setting('room_id') and player_id = pg_temp.player('cara')),
  'they aren''t a member yet'
);
select is(
  (select row(count(*), max(payload->'payload'->>'body'), max(payload->'payload'->'roles'->>1))::text
   from private.notification_dispatch_log where event_type = 'join_request'),
  row(1::bigint, 'cara wants to join Oscar Night Crew', 'organizer')::text,
  'owners and organizers get one push per request'
);

-- Members can't see or answer requests.
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select is(
  (select count(*)::int from public.room_join_requests where room_id = pg_temp.setting('room_id')),
  0,
  'members can''t see who asked to join'
);
select throws_ok(
  format($$ select public.get_room_join_requests(%L) $$, pg_temp.setting('room_id')),
  'P0012', null,
  'or list the requests'
);
select throws_ok(
  format($$ select public.decide_join_request(%L, %L, true) $$, pg_temp.setting('room_id'), pg_temp.player('cara')),
  'P0012', null,
  'or let anyone in'
);
reset role;

-- An organizer lets Cara in.
select pg_temp.login('00000000-0000-0000-0000-0000000001a0');
set local role authenticated;
select is(
  (public.get_room_join_requests(pg_temp.setting('room_id'))->0->>'username'),
  'cara',
  'organizers see who''s waiting'
);
select is(
  json_array_length(public.get_room_manage_queue(pg_temp.setting('room_id'))->'join_requests'),
  1,
  'and find them in Needs you'
);
select is(
  (public.decide_join_request(pg_temp.setting('room_id'), pg_temp.player('cara'), true)->>'status'),
  'accepted',
  'organizers can let people in'
);
select throws_ok(
  format($$ select public.decide_join_request(%L, %L, true) $$, pg_temp.setting('room_id'), pg_temp.player('cara')),
  'P0006', null,
  'a request is answered once'
);
reset role;

select ok(
  exists (select 1 from public.room_members where room_id = pg_temp.setting('room_id') and player_id = pg_temp.player('cara')),
  'once let in, they''re a member'
);
select is(
  (select payload->'payload'->>'target_player_id' from private.notification_dispatch_log where event_type = 'join_accepted'),
  current_setting('test.p_cara'),
  'and they get a push saying so'
);

-- Declined: Dan can ask again after 7 days.
select pg_temp.login('00000000-0000-0000-0000-000000000da0');
set local role authenticated;
select public.join_room(current_setting('test.room_code'));
reset role;
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.decide_join_request(pg_temp.setting('room_id'), pg_temp.player('dan'), false);
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000da0');
set local role authenticated;
select throws_ok(
  format($$ select public.join_room(%L) $$, current_setting('test.room_code')),
  'P0013', null,
  'someone declined can''t ask again straight away'
);
reset role;
update public.room_join_requests set decided_at = now() - interval '8 days'
where room_id = pg_temp.setting('room_id') and player_id = pg_temp.player('dan');
set local role authenticated;
select is(
  (public.join_room(current_setting('test.room_code'))->>'membership'),
  'requested',
  'after 7 days they can'
);
select lives_ok(
  format($$ select public.cancel_join_request(%L) $$, pg_temp.setting('room_id')),
  'people can cancel their request'
);
select throws_ok(
  format($$ select public.cancel_join_request(%L) $$, pg_temp.setting('room_id')),
  'P0002', null,
  'once'
);
reset role;

-- ------------------------------------------------------------
-- The member cap
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000da0');
set local role authenticated;
select public.join_room(current_setting('test.room_code'));
reset role;
-- The operator caps the room at its current size (4: Alice, Olga, Bob, Cara).
update public.rooms set member_limit = 4 where id = pg_temp.setting('room_id');

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select throws_ok(
  format($$ select public.decide_join_request(%L, %L, true) $$, pg_temp.setting('room_id'), pg_temp.player('dan')),
  'P0014', 'This room is full',
  'a full room can''t take anyone in'
);
select is(
  (public.get_room_by_code(current_setting('test.room_code'))->>'is_full')::boolean,
  true,
  'the room says it''s full'
);
select public.update_room(pg_temp.setting('room_id'), 'Oscar Night Crew', 'Film nerds', 3, true, 'open');
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000e7e0');
set local role authenticated;
select throws_ok(
  format($$ select public.join_room(%L) $$, current_setting('test.room_code')),
  'P0014', 'This room is full',
  'nor join an open one'
);
select is(
  (select (c->>'member_count')::int - (c->>'member_limit')::int from pg_temp.explore_card() c),
  0,
  'Explore shows it full'
);
reset role;

select ok(
  not has_table_privilege('authenticated', 'public.rooms', 'UPDATE')
  and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and pg_get_function_arguments(p.oid) ilike '%member_limit%'
  ),
  'no app call can change the member limit'
);

select * from finish();
rollback;
