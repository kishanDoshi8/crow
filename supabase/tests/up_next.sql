begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

-- Up next: one pick each from Crow's competitions (or something Crow doesn't
-- have), hosts start the next series from an idea, and /admin sees demand.
-- Alice hosts the room with Bob and Carol; Dan is a Crow admin elsewhere.
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000ca01', 'authenticated', 'authenticated', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000da40', 'authenticated', 'authenticated', 'dan@example.com');

create function pg_temp.login(p_username text)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', case p_username
    when 'alice' then '00000000-0000-0000-0000-00000000a11c'
    when 'bob' then '00000000-0000-0000-0000-000000000b0b'
    when 'carol' then '00000000-0000-0000-0000-00000000ca01'
    when 'dan' then '00000000-0000-0000-0000-00000000da40' end, true);
  select set_config('request.jwt.claims', json_build_object('sub', current_setting('request.jwt.claim.sub'), 'role', 'authenticated')::text, true);
$$;

create function pg_temp.setting(p_name text)
returns uuid
language sql
as $$ select current_setting('test.' || p_name)::uuid $$;

create function pg_temp.comp(p_ref text)
returns uuid
language sql
as $$ select id from catalog.competitions where provider_ref = p_ref $$;

-- One option on p_viewer's board, by title.
create function pg_temp.option(p_viewer text, p_title text)
returns json
language plpgsql
as $$
begin
  perform pg_temp.login(p_viewer);
  return (
    select o from json_array_elements(public.get_up_next(pg_temp.setting('room_id'))->'options') o
    where o->>'title' = p_title
  );
end;
$$;

-- Only this test's competitions are on offer: the database may already have
-- real ones (the migrations add some), and the board depends on what's on.
update catalog.competitions set active = false;

insert into catalog.competitions (sport, name, format, kind, provider, provider_ref, active, ends_on)
values
  ('soccer', 'Premier League', 'league', 'league', 'test', 'pl', true, null),
  ('soccer', 'Champions League', 'mixed', 'cup', 'test', 'cl', true, null),
  ('cricket', 'Old Tour', 'mixed', 'tour', 'test', 'old', true, current_date - 10),
  ('soccer', 'Switched Off League', 'league', 'league', 'test', 'off', false, null);

select pg_temp.login('alice');
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Room')->>'id'), true);
select set_config('test.code', (select room_code from public.rooms where id = pg_temp.setting('room_id')), true);
select pg_temp.login('bob');
select public.register_player('bob');
select public.join_room(current_setting('test.code'));
select pg_temp.login('carol');
select public.register_player('carol');
select public.join_room(current_setting('test.code'));
select pg_temp.login('dan');
select public.register_player('dan');
insert into public.platform_admins (player_id) select id from public.players where username = 'dan';

-- ------------------------------------------------------------
-- 1. An empty board starts from competitions on offer
-- ------------------------------------------------------------
select pg_temp.login('bob');
select is(
  (select string_agg(o->>'title', ',' order by o->>'title') from json_array_elements(public.get_up_next(pg_temp.setting('room_id'))->'options') o),
  'Champions League,Premier League',
  'with no ideas yet, competitions on offer are suggested; ended and switched-off ones are not'
);
select is(
  json_array_length(public.get_up_next(pg_temp.setting('room_id'))->'catalog'),
  2,
  'Something else offers only competitions on offer'
);

-- ------------------------------------------------------------
-- 2. One pick each
-- ------------------------------------------------------------
select pg_temp.login('bob');
select public.pick_up_next(pg_temp.setting('room_id'), pg_temp.comp('pl'));
select is((pg_temp.option('bob', 'Premier League')->>'picks')::int, 1, 'Bob picks the Premier League');
select ok((pg_temp.option('bob', 'Premier League')->>'picked_by_me')::boolean, 'and it shows as his pick');

select pg_temp.login('carol');
select public.pick_up_next(pg_temp.setting('room_id'), null, '  premier   league ');
select is((pg_temp.option('carol', 'Premier League')->>'picks')::int, 2, 'typing the name of a competition picks it');

select pg_temp.login('bob');
select public.pick_up_next(pg_temp.setting('room_id'), null, 'Six Nations');
select is((pg_temp.option('bob', 'Premier League')->>'picks')::int, 1, 'a new pick replaces the old one');
select is((pg_temp.option('bob', 'Six Nations')->>'on_crow')::boolean, false, 'something Crow does not have is marked so');
select is(
  (public.get_up_next(pg_temp.setting('room_id'))->>'total_picks')::int,
  2,
  'two players, two picks'
);

select pg_temp.login('carol');
select public.clear_up_next_pick(pg_temp.setting('room_id'));
select ok(
  (pg_temp.option('carol', 'Premier League')->>'id') is null,
  'an idea nobody picks comes down, and returns as a suggestion'
);

select pg_temp.login('bob');
select throws_ok(
  format('select public.pick_up_next(%L::uuid, %L::uuid)', pg_temp.setting('room_id'), pg_temp.comp('old')),
  'P0002', 'Competition not found',
  'a competition that is over can''t be picked'
);
select throws_ok(
  format('select public.pick_up_next(%L::uuid, null, %L)', pg_temp.setting('room_id'), repeat('x', 61)),
  'P0001', 'Keep the idea between 1 and 60 characters',
  'a typed idea is 60 characters at most'
);
select pg_temp.login('dan');
select throws_ok(
  format('select public.get_up_next(%L::uuid)', pg_temp.setting('room_id')),
  'P0011', 'You are not a member of this room',
  'only the room sees its board'
);

-- ------------------------------------------------------------
-- 3. Hosts see who picked; a host starts the next series
-- ------------------------------------------------------------
select is((pg_temp.option('bob', 'Six Nations')->'pickers')::text, 'null', 'players don''t see who picked what');
select is((pg_temp.option('alice', 'Six Nations')->'pickers')::text, '["bob"]', 'hosts do');

select pg_temp.login('alice');
select public.create_series(pg_temp.setting('room_id'), 'Last one', null, 0, 500, 50, 2);
select pg_temp.login('carol');
select public.pick_up_next(pg_temp.setting('room_id'), pg_temp.comp('cl'));
select set_config('test.cl_idea', (pg_temp.option('carol', 'Champions League')->>'id'), true);

select pg_temp.login('bob');
select throws_ok(
  format('select public.start_series_from_idea(%L::uuid, %L)', pg_temp.setting('cl_idea'), 'CL'),
  'P0012', null,
  'only hosts start a series from an idea'
);

select pg_temp.login('alice');
select set_config('test.started', (public.start_series_from_idea(pg_temp.setting('cl_idea'), 'Champions League 26/27')->>'series_id'), true);
select is(
  (select title || ' ' || starting_stack || ' ' || weekly_topup || ' ' || min_bets_to_rank from public.series where id = pg_temp.setting('started')),
  'Champions League 26/27 500 50 2',
  'the new series has the title given and the last series'' points'
);
select ok(
  exists (select 1 from public.room_competitions where room_id = pg_temp.setting('room_id') and competition_id = pg_temp.comp('cl')),
  'and the room follows the competition'
);
select is(
  (select status from public.series_suggestions where id = pg_temp.setting('cl_idea')),
  'played',
  'the idea leaves the board'
);

-- ------------------------------------------------------------
-- 4. What rooms ask for, for the Crow team
-- ------------------------------------------------------------
select pg_temp.login('bob');
select throws_ok('select public.admin_get_up_next_demand()', 'P0012', null, 'only platform admins see demand');

select pg_temp.login('dan');
select is(
  (select r->>'rooms' || '/' || (r->>'picks') from json_array_elements(public.admin_get_up_next_demand()->'requests') r where r->>'name' = 'Six Nations'),
  '1/1',
  'admins see what rooms ask for that Crow doesn''t have'
);

select * from finish();
rollback;
