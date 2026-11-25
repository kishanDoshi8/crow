begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- Pushes to Crow admins: results waiting to be confirmed (once each, one
-- reminder after 6 hours) and competitions that stopped syncing (once per
-- error). Alice hosts a room with questions on two matches; Bob and Carol
-- are Crow admins.
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000ca01', 'authenticated', 'authenticated', 'carol@example.com');

create function pg_temp.login(p_username text)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', case p_username
    when 'alice' then '00000000-0000-0000-0000-00000000a11c'
    when 'bob' then '00000000-0000-0000-0000-000000000b0b'
    when 'carol' then '00000000-0000-0000-0000-00000000ca01' end, true);
  select set_config('request.jwt.claims', json_build_object('sub', current_setting('request.jwt.claim.sub'), 'role', 'authenticated')::text, true);
$$;

create function pg_temp.setting(p_name text)
returns uuid
language sql
as $$ select current_setting('test.' || p_name)::uuid $$;

create function pg_temp.fixture(p_ref text)
returns uuid
language sql
as $$ select id from catalog.fixtures where provider_ref = p_ref and competition_id = pg_temp.setting('comp') $$;

-- The bodies of the pushes admins would get now, joined.
create function pg_temp.bodies()
returns text
language sql
as $$ select string_agg(p->>'title' || ': ' || (p->>'body'), ' | ') from json_array_elements(private.admin_alerts()->'pushes') p $$;

-- Only this test's competition: the database may have real ones.
update catalog.competitions set active = false;

select pg_temp.login('alice');
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Room')->>'id'), true);
select set_config('test.series', (public.create_series(pg_temp.setting('room_id'), 'Cup', null, 0, 1000, 100, 1)->>'id'), true);
select pg_temp.login('bob');
select public.register_player('bob');
select pg_temp.login('carol');
select public.register_player('carol');
insert into public.platform_admins (player_id) select id from public.players where username in ('bob', 'carol');

insert into catalog.competitions (sport, name, format, kind, provider, provider_ref, active)
values ('cricket', 'Asia Cup', 'mixed', 'tour', 'test', 'asia', true);
select set_config('test.comp', (select id::text from catalog.competitions where provider_ref = 'asia'), true);
insert into catalog.teams (sport, provider, provider_ref, name, short_name)
values ('cricket', 'test', 'ind', 'India', 'IND'), ('cricket', 'test', 'pak', 'Pakistan', 'PAK'), ('cricket', 'test', 'sl', 'Sri Lanka', 'SL');
insert into catalog.fixtures (competition_id, provider_ref, season, stage_kind, match_format, home_team_id, away_team_id, kickoff_at)
values
  (pg_temp.setting('comp'), 'm1', '2026', 'group', 't20', (select id from catalog.teams where provider_ref = 'ind'), (select id from catalog.teams where provider_ref = 'pak'), now() + interval '1 day'),
  (pg_temp.setting('comp'), 'm2', '2026', 'group', 't20', (select id from catalog.teams where provider_ref = 'sl'), (select id from catalog.teams where provider_ref = 'ind'), now() + interval '2 days'),
  -- Nobody added questions on this one: admins needn't hear about it.
  (pg_temp.setting('comp'), 'm3', '2026', 'group', 't20', (select id from catalog.teams where provider_ref = 'pak'), (select id from catalog.teams where provider_ref = 'sl'), now() + interval '3 days');
insert into catalog.fixture_questions (fixture_id, title, options)
select f.id, 'Who wins?', '[{"key":"home","label":"Home"},{"key":"away","label":"Away"}]'::jsonb
from catalog.fixtures f where f.competition_id = pg_temp.setting('comp');

select pg_temp.login('alice');
select public.add_fixture_questions(
  pg_temp.setting('room_id'), pg_temp.setting('series'),
  (select array_agg(q.id) from catalog.fixture_questions q where q.fixture_id in (pg_temp.fixture('m1'), pg_temp.fixture('m2')))
);

-- The matches are played.
update catalog.fixtures set kickoff_at = now() - interval '4 hours' where competition_id = pg_temp.setting('comp');

-- ------------------------------------------------------------
-- 1. Results waiting
-- ------------------------------------------------------------
select is(pg_temp.bodies(), null, 'played matches with no score yet: nothing to tell');

update catalog.fixtures set result = '{"winner": "home", "innings": [], "status_text": "India won"}'
where id in (pg_temp.fixture('m1'), pg_temp.fixture('m3'));
select is(
  pg_temp.bodies(),
  '⏳ Results to confirm: India vs Pakistan is ready to confirm.',
  'a match with a score that rooms have questions on is ready'
);
select is(private.send_admin_alerts(), 2, 'each admin gets the push');
select is(pg_temp.bodies(), null, 'and isn''t told again next run');

-- Six hours on, Pakistan's match is still waiting; Sri Lanka's is called off.
update catalog.fixtures set admin_alerted_at = now() - interval '7 hours' where id = pg_temp.fixture('m1');
update catalog.fixtures set status = 'abandoned' where id = pg_temp.fixture('m2');
select is(
  pg_temp.bodies(),
  '⏳ Results to confirm: Sri Lanka vs India is ready to confirm. 1 older one is still waiting.',
  'a called-off match is ready too, and the reminder rides along'
);
select private.send_admin_alerts();
select is(pg_temp.bodies(), null, 'one reminder only');

select ok(
  (select admin_alerted_at is null from catalog.fixtures where id = pg_temp.fixture('m3')),
  'a match no room has questions on is never mentioned'
);

-- Confirmed matches drop out.
update catalog.fixtures set result_confirmed_at = now(), admin_alerted_at = null, admin_reminded_at = null
where id = pg_temp.fixture('m1');
select is(pg_temp.bodies(), null, 'a confirmed match needs nobody');

-- ------------------------------------------------------------
-- 2. Syncs that fail
-- ------------------------------------------------------------
select public.record_fixture_sync_error('test', 'asia', 'CricketData.org daily limit nearly used (95 of 100)');
select is(
  pg_temp.bodies(),
  'Sync failed: Asia Cup: CricketData.org daily limit nearly used (95 of 100)',
  'a failing sync alerts with its error'
);
select private.send_admin_alerts();
select public.record_fixture_sync_error('test', 'asia', 'CricketData.org daily limit nearly used (99 of 100)');
select is(pg_temp.bodies(), null, 'failing again doesn''t alert again');

update catalog.competitions set active = false where id = pg_temp.setting('comp');
update catalog.competitions set sync_error_alerted_at = null where id = pg_temp.setting('comp');
select is(pg_temp.bodies(), null, 'a competition that''s off doesn''t alert');

select * from finish();
rollback;
