begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

-- ------------------------------------------------------------
-- Fixtures: Alice runs Room A with Bob and Carol. Carol also runs Room B
-- with Eve, which Alice isn't in. Dan plays nowhere.
-- ------------------------------------------------------------
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000ca01', 'authenticated', 'authenticated', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000da40', 'authenticated', 'authenticated', 'dan@example.com'),
  ('00000000-0000-0000-0000-000000000e7e', 'authenticated', 'authenticated', 'eve@example.com');

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
  end::uuid
$$;

create function pg_temp.login(p_username text)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', coalesce(pg_temp.uid(p_username)::text, ''), true);
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_username), 'role', 'authenticated')::text, true);
$$;

create function pg_temp.setting(p_name text)
returns uuid
language sql
as $$ select current_setting('test.' || p_name)::uuid $$;

create function pg_temp.player(p_username text)
returns uuid
language sql
as $$ select id from public.players where username = p_username $$;

-- One game in a room's series, run by p_host: each bettor backs a side,
-- then the host reveals the winner. p_bets is {"alice": ["Home", 100], ...}.
create function pg_temp.play(p_host text, p_room text, p_series text, p_bets jsonb, p_winner text)
returns uuid
language plpgsql
as $$
declare
  v_prediction uuid;
  v_bettor text;
  v_bet jsonb;
begin
  perform pg_temp.login(p_host);
  v_prediction := (public.create_prediction(
    pg_temp.setting(p_room), 'Game', array['Home', 'Away'], now() + interval '1 day', pg_temp.setting(p_series)
  )->>'prediction_id')::uuid;

  for v_bettor, v_bet in select * from jsonb_each(p_bets) loop
    perform pg_temp.login(v_bettor);
    perform public.place_bet(
      v_prediction,
      (select id from public.prediction_options where prediction_id = v_prediction and label = v_bet->>0),
      (v_bet->>1)::int
    );
  end loop;

  update public.predictions set status = 'locked' where id = v_prediction;

  perform pg_temp.login(p_host);
  perform public.resolve_prediction_v2(
    v_prediction,
    pg_temp.setting(p_room),
    'win',
    (select id from public.prediction_options where prediction_id = v_prediction and label = p_winner)
  );
  drop table if exists _winner_gains;
  return v_prediction;
end;
$$;

-- The profile p_viewer sees of p_target (null: their own).
create function pg_temp.profile(p_viewer text, p_target text default null)
returns json
language plpgsql
as $$
begin
  perform pg_temp.login(p_viewer);
  return public.get_player_profile(pg_temp.player(p_target));
end;
$$;

select pg_temp.login('alice');
select public.register_player('alice');
select set_config('test.room_a', (public.create_room('Room A')->>'id'), true);

select pg_temp.login('bob');
select public.register_player('bob');
select public.join_room((select room_code from public.rooms where id = pg_temp.setting('room_a')));

select pg_temp.login('carol');
select public.register_player('carol');
select public.join_room((select room_code from public.rooms where id = pg_temp.setting('room_a')));
select set_config('test.room_b', (public.create_room('Room B')->>'id'), true);

select pg_temp.login('eve');
select public.register_player('eve');
select public.join_room((select room_code from public.rooms where id = pg_temp.setting('room_b')));

select pg_temp.login('dan');
select public.register_player('dan');

-- Room A: Alice calls three games, Bob misses them all, Carol calls two.
select pg_temp.login('alice');
select set_config('test.cup_a', (public.create_series(pg_temp.setting('room_a'), 'Cup A', null, 0, 1000, 100, 1)->>'id'), true);
select pg_temp.play('alice', 'room_a', 'cup_a', '{"alice": ["Home", 100], "bob": ["Away", 100], "carol": ["Home", 50]}', 'Home');
select pg_temp.play('alice', 'room_a', 'cup_a', '{"alice": ["Home", 100], "bob": ["Away", 100], "carol": ["Home", 50]}', 'Home');
select pg_temp.play('alice', 'room_a', 'cup_a', '{"alice": ["Home", 100], "bob": ["Away", 100], "carol": ["Away", 50]}', 'Home');
select pg_temp.login('alice');
select public.complete_series(pg_temp.setting('cup_a'));

-- Room B: Carol wins a series of her own.
select pg_temp.login('carol');
select set_config('test.cup_b', (public.create_series(pg_temp.setting('room_b'), 'Cup B', null, 0, 1000, 100, 1)->>'id'), true);
select pg_temp.play('carol', 'room_b', 'cup_b', '{"carol": ["Home", 100], "eve": ["Away", 100]}', 'Home');
select pg_temp.login('carol');
select public.complete_series(pg_temp.setting('cup_b'));

-- ------------------------------------------------------------
-- 1. Your own profile covers all your rooms
-- ------------------------------------------------------------
select is((pg_temp.profile('alice')->>'is_self')::boolean, true, 'with no id it is your own profile');
select is(pg_temp.profile('alice')->'player'->>'username', 'alice', 'the profile names its player');
select is((pg_temp.profile('alice')->'totals'->>'total_predictions')::int, 3, 'own totals count every settled pick');
select is((pg_temp.profile('alice')->'totals'->>'winning_predictions')::int, 3, 'own totals count every pick called');
select is((pg_temp.profile('alice')->'totals'->>'championships')::int, 1, 'a series win counts as a championship');
select is(pg_temp.profile('alice')->'rooms'->0->>'points_rank', '1', 'each room line gives the rank in that room');
select is((pg_temp.profile('carol')->'totals'->>'rooms')::int, 2, 'Carol sees both her rooms');
select is((pg_temp.profile('carol')->'totals'->>'total_predictions')::int, 4, 'Carol''s own totals add up both rooms');
select ok(
  (select bool_and(c->>'room_name' is not null) from json_array_elements(pg_temp.profile('carol')->'championships') c),
  'each trophy says which room it came from'
);

-- ------------------------------------------------------------
-- 2. Someone else's profile covers only the rooms you share
-- ------------------------------------------------------------
select is((pg_temp.profile('alice', 'carol')->>'is_self')::boolean, false, 'another player''s profile is not your own');
select is((pg_temp.profile('alice', 'carol')->'totals'->>'rooms')::int, 1, 'Alice sees only the room she shares with Carol');
select is(
  (select array_agg(r->>'name') from json_array_elements(pg_temp.profile('alice', 'carol')->'rooms') r),
  array['Room A'],
  'Room B, which Alice is not in, is left out'
);
select is((pg_temp.profile('alice', 'carol')->'totals'->>'total_predictions')::int, 3, 'shared totals leave out picks from Room B');
select ok(
  not exists (
    select 1 from json_array_elements(pg_temp.profile('alice', 'carol')->'championships') c
    where c->>'room_id' = pg_temp.setting('room_b')::text
  ),
  'trophies from Room B stay hidden from Alice'
);

-- ------------------------------------------------------------
-- 3. Who can't be looked up
-- ------------------------------------------------------------
select pg_temp.login('alice');
select throws_ok(
  format('select public.get_player_profile(%L::uuid)', pg_temp.player('eve')),
  'P0001', 'Player not found',
  'a player you share no room with is not found'
);
select throws_ok(
  'select public.get_player_profile(gen_random_uuid())',
  'P0001', 'Player not found',
  'an unknown id gives the same answer'
);
select is((pg_temp.profile('dan')->'totals'->>'rooms')::int, 0, 'a player with no rooms still gets an empty profile');

select pg_temp.login(null);
select throws_ok('select public.get_player_profile()', 'P0004', 'Not authenticated', 'signed-out callers get nothing');

select * from finish();
rollback;
