begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com');

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

create function pg_temp.fixture(p_ref text, p_home text, p_away text, p_kickoff timestamptz, p_round text default 'Matchweek 13')
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'provider_ref', p_ref, 'kickoff_at', p_kickoff, 'status', 'scheduled', 'matchday', 13,
    'round_label', p_round, 'stage_kind', 'league',
    'home', jsonb_build_object('provider_ref', 't-' || p_home, 'name', p_home, 'short_name', p_home),
    'away', jsonb_build_object('provider_ref', 't-' || p_away, 'name', p_away, 'short_name', p_away),
    'result', null
  )
$$;

create function pg_temp.question(p_ref text, p_key text)
returns uuid
language sql
security definer
as $$
  select q.id from catalog.fixture_questions q
  join catalog.question_templates t on t.id = q.template_id
  join catalog.fixtures f on f.id = q.fixture_id
  where f.provider_ref = p_ref and t.key = p_key
$$;

select set_config('test.pl', (select id::text from catalog.competitions where provider_ref = 'PL'), true);
select public.sync_competition_fixtures('football-data', 'PL', '2026/27', jsonb_build_array(
  pg_temp.fixture('pl-1', 'Arsenal', 'Chelsea', now() + interval '2 days'),
  pg_temp.fixture('pl-2', 'Liverpool', 'Spurs', now() + interval '3 days'),
  pg_temp.fixture('pl-3', 'Everton', 'Fulham', now() + interval '10 days', 'Matchweek 14')
));

select is(
  (select array_agg(kind || '/' || region order by display_order) from catalog.competitions where active),
  array['league/England', 'cup/Europe'],
  'the launch competitions have a kind and region'
);

-- Alice owns a room; Bob plays in it.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.register_player('alice');
select set_config('test.room', (public.create_room('Room')->>'id'), true);
select set_config('test.series', (public.create_series(pg_temp.setting('room'), 'Season')->>'id'), true);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.register_player('bob');
select public.join_room((select room_code from public.rooms where id = pg_temp.setting('room')));

set local role authenticated;
select throws_ok(
  format($$ select public.get_room_competitions(%L) $$, pg_temp.setting('room')),
  'P0012', null, 'players can''t browse competitions'
);
select throws_ok(
  format($$ select public.get_room_competition_fixtures(%L, %L) $$, pg_temp.setting('room'), pg_temp.setting('pl')),
  'P0012', null, 'or open one'
);

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.set_room_competition(pg_temp.setting('room'), pg_temp.setting('pl'), true);
select public.add_fixture_questions(pg_temp.setting('room'), pg_temp.setting('series'), array[pg_temp.question('pl-1', 'who_wins')]);

select set_config('test.comps', public.get_room_competitions(pg_temp.setting('room'))::text, true);
select is(
  (select array_agg((c->>'name') || ':' || (c->>'following')) from json_array_elements(current_setting('test.comps')::json) c),
  array['Premier League:true', 'Champions League:false'],
  'organizers see every competition and which they follow'
);
select is(
  (select c->'next'->>'home' || ' vs ' || (c->'next'->>'away') from json_array_elements(current_setting('test.comps')::json) c where c->>'name' = 'Premier League'),
  'Arsenal vs Chelsea',
  'with the next match'
);
select is(
  (select (c->>'week_matches') || '/' || (c->>'week_added') from json_array_elements(current_setting('test.comps')::json) c where c->>'name' = 'Premier League'),
  '2/1',
  'and this week''s matches, and how many the room has added from'
);

select set_config('test.page', public.get_room_competition_fixtures(pg_temp.setting('room'), pg_temp.setting('pl'))::text, true);
select is(
  current_setting('test.page')::json->'competition'->>'following',
  'true',
  'a competition''s page says whether the room follows it'
);
select is(
  (select array_agg((f->>'home') || '@' || (f->>'round_label')) from json_array_elements(current_setting('test.page')::json->'fixtures') f),
  array['Arsenal@Matchweek 13', 'Liverpool@Matchweek 13', 'Everton@Matchweek 14'],
  'and lists its coming matches by kickoff, with their round'
);
select is(
  (select count(*)::int from json_array_elements(current_setting('test.page')::json->'fixtures') f,
     json_array_elements(f->'questions') q where q->>'prediction_id' is not null),
  1,
  'marking the questions the room already has'
);
reset role;

-- ------------------------------------------------------------
-- Sync errors
-- ------------------------------------------------------------
select public.record_fixture_sync_error('football-data', 'PL', 'football-data.org PL: 429 Too many requests');
select is(
  (select last_sync_error from catalog.competitions where provider_ref = 'PL'),
  'football-data.org PL: 429 Too many requests',
  'a failed sync is recorded'
);
select public.sync_competition_fixtures('football-data', 'PL', '2026/27', '[]'::jsonb);
select is(
  (select row(last_sync_error, last_sync_error_at)::text from catalog.competitions where provider_ref = 'PL'),
  '(,)',
  'and cleared by the next one that works'
);

set local role authenticated;
select throws_ok(
  $$ select public.record_fixture_sync_error('football-data', 'PL', 'x') $$,
  '42501', null,
  'only the server records sync errors'
);
reset role;

select * from finish();
rollback;
