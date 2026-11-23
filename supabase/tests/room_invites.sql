begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

-- ------------------------------------------------------------
-- Fixtures:
--   Room A (open, Alice owns): Alice, Bob, Carol, Dan, Eve
--   Room C (asks to approve players, Carol owns): Carol, Bob
--   Room O (open, Bob owns): Bob
--   Fay plays nowhere.
-- ------------------------------------------------------------
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000ca01', 'authenticated', 'authenticated', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000da40', 'authenticated', 'authenticated', 'dan@example.com'),
  ('00000000-0000-0000-0000-000000000e7e', 'authenticated', 'authenticated', 'eve@example.com'),
  ('00000000-0000-0000-0000-000000000fa1', 'authenticated', 'authenticated', 'fay@example.com');

create function pg_temp.uid(p_username text)
returns uuid
language sql
as $$
  select case p_username
    when 'alice' then '00000000-0000-0000-0000-00000000a11c'
    when 'bob' then '00000000-0000-0000-0000-000000000b0b'
    when 'carol' then '00000000-0000-0000-0000-00000000ca01'
    when 'dan' then '00000000-0000-0000-0000-00000000da40'
    when 'eve' then '00000000-0000-0000-0000-000000000e7e'
    when 'fay' then '00000000-0000-0000-0000-000000000fa1'
  end::uuid
$$;

create function pg_temp.login(p_username text)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.uid(p_username)::text, ''), true);
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_username), 'role', 'authenticated')::text, true);
$$;

create function pg_temp.room(p_name text)
returns uuid
language sql
as $$ select current_setting('test.room_' || p_name)::uuid $$;

create function pg_temp.code(p_name text)
returns text
language sql
as $$ select room_code from public.rooms where id = pg_temp.room(p_name) $$;

create function pg_temp.player(p_username text)
returns uuid
language sql
as $$ select id from public.players where username = p_username $$;

create function pg_temp.is_member(p_room text, p_username text)
returns boolean
language sql
as $$
  select exists (
    select 1 from public.room_members
    where room_id = pg_temp.room(p_room) and player_id = pg_temp.player(p_username)
  )
$$;

-- The invite_status get_invitable_rooms gives p_viewer for p_target in p_room.
create function pg_temp.invite_status(p_viewer text, p_target text, p_room text)
returns text
language plpgsql
as $$
begin
  perform pg_temp.login(p_viewer);
  return (
    select r->>'invite_status'
    from json_array_elements(public.get_invitable_rooms(pg_temp.player(p_target))) r
    where (r->>'room_id')::uuid = pg_temp.room(p_room)
  );
end;
$$;

select pg_temp.login('alice');
select public.register_player('alice');
select set_config('test.room_a', (public.create_room('Room A')->>'id'), true);

select pg_temp.login('carol');
select public.register_player('carol');
select public.join_room(pg_temp.code('a'));
select set_config('test.room_c', (public.create_room('Room C')->>'id'), true);
update public.rooms set join_policy = 'request' where id = pg_temp.room('c');

select pg_temp.login('bob');
select public.register_player('bob');
select public.join_room(pg_temp.code('a'));
select set_config('test.room_o', (public.create_room('Room O')->>'id'), true);
-- Carol lets Bob into Room C directly, as a host would.
insert into public.room_members (room_id, player_id) values (pg_temp.room('c'), pg_temp.player('bob'));

select pg_temp.login('dan');
select public.register_player('dan');
select public.join_room(pg_temp.code('a'));

select pg_temp.login('eve');
select public.register_player('eve');
select public.join_room(pg_temp.code('a'));

select pg_temp.login('fay');
select public.register_player('fay');

-- ------------------------------------------------------------
-- 1. Who you can invite where
-- ------------------------------------------------------------
select is(pg_temp.invite_status('bob', 'alice', 'c'), 'available', 'Bob can invite Alice to Room C');
select is(pg_temp.invite_status('bob', 'alice', 'a'), null, 'rooms she is already in are left out');

select pg_temp.login('bob');
select throws_ok(
  format('select public.get_invitable_rooms(%L::uuid)', pg_temp.player('fay')),
  'P0001', 'Player not found',
  'someone you share no room with can''t be invited'
);
select throws_ok(
  format('select public.invite_to_room(%L::uuid, %L::uuid)', pg_temp.room('o'), pg_temp.player('fay')),
  'P0001', 'Player not found',
  'invite_to_room refuses strangers too'
);
select throws_ok(
  format('select public.invite_to_room(%L::uuid, %L::uuid)', pg_temp.room('a'), pg_temp.player('alice')),
  'P0001', 'They are already in this room',
  'no invite to a room they are in'
);
select pg_temp.login('alice');
select throws_ok(
  format('select public.invite_to_room(%L::uuid, %L::uuid)', pg_temp.room('o'), pg_temp.player('bob')),
  'P0011', 'You are not a member of this room',
  'you can only invite people to your own rooms'
);

-- ------------------------------------------------------------
-- 2. A player's invite to a room that approves new players
-- ------------------------------------------------------------
select pg_temp.login('bob');
select is(
  public.invite_to_room(pg_temp.room('c'), pg_temp.player('alice'))->>'status',
  'invited',
  'Bob invites Alice to Room C'
);
select lives_ok(
  format('select public.invite_to_room(%L::uuid, %L::uuid)', pg_temp.room('c'), pg_temp.player('alice')),
  'inviting again while it waits does nothing'
);
select is(pg_temp.invite_status('bob', 'alice', 'c'), 'invited', 'Room C now shows as invited');

select pg_temp.login('alice');
select is(json_array_length(public.get_my_room_invites()), 1, 'Alice has one invite waiting');
select is(public.get_my_room_invites()->0->>'invited_by_username', 'bob', 'it says who sent it');
select is((public.get_my_room_invites()->0->>'needs_approval')::boolean, true, 'a player''s invite to Room C still needs a host''s yes');

select is(
  public.respond_to_room_invite(pg_temp.room('c'), true)->>'membership',
  'requested',
  'saying yes sends a join request'
);
select ok(not pg_temp.is_member('c', 'alice'), 'Alice isn''t in Room C yet');
select is(
  (select status from public.room_join_requests where room_id = pg_temp.room('c') and player_id = pg_temp.player('alice')),
  'pending',
  'the join request waits on the hosts'
);
select is(json_array_length(public.get_my_room_invites()), 0, 'the answered invite is gone from her list');

-- ------------------------------------------------------------
-- 3. A host's invite lets you straight in
-- ------------------------------------------------------------
select pg_temp.login('carol');
select public.invite_to_room(pg_temp.room('c'), pg_temp.player('dan'));
select pg_temp.login('dan');
select is((public.get_my_room_invites()->0->>'needs_approval')::boolean, false, 'a host''s invite needs no approval');
select is(public.respond_to_room_invite(pg_temp.room('c'), true)->>'membership', 'member', 'Dan joins Room C');
select ok(pg_temp.is_member('c', 'dan'), 'and is in it');

-- Open rooms: any player's invite works like the code.
select pg_temp.login('bob');
select public.invite_to_room(pg_temp.room('o'), pg_temp.player('alice'));
select pg_temp.login('alice');
select public.respond_to_room_invite(pg_temp.room('o'), true);
select ok(pg_temp.is_member('o', 'alice'), 'an invite to an open room joins it');

-- ------------------------------------------------------------
-- 4. Saying no
-- ------------------------------------------------------------
select pg_temp.login('bob');
select public.invite_to_room(pg_temp.room('o'), pg_temp.player('eve'));
select pg_temp.login('eve');
select public.respond_to_room_invite(pg_temp.room('o'), false);
select ok(not pg_temp.is_member('o', 'eve'), 'saying no keeps you out');
select is(pg_temp.invite_status('bob', 'eve', 'o'), 'unavailable', 'and Bob can''t ask again for a week');

-- ------------------------------------------------------------
-- 5. People you play with
-- ------------------------------------------------------------
select pg_temp.login('alice');
select is(
  public.get_people_you_play_with()->0->>'username',
  'bob',
  'the person you share most rooms with comes first'
);
select is((public.get_people_you_play_with()->0->>'shared_rooms')::int, 2, 'Alice and Bob share Room A and Room O');


-- ------------------------------------------------------------
-- 6. Deleting an account clears invites still waiting
-- ------------------------------------------------------------
select pg_temp.login('carol');
select public.invite_to_room(pg_temp.room('c'), pg_temp.player('eve'));
select private.delete_account(pg_temp.player('eve'));
select is(
  (select count(*)::int from public.room_invites where player_id = pg_temp.player('eve') and status = 'pending'),
  0,
  'a deleted account has no invites waiting'
);

select * from finish();
rollback;
