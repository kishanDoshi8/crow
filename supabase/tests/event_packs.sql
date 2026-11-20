begin;

create extension if not exists pgtap with schema extensions;

select plan(43);

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

-- A fixture as the sync-fixtures adapters send it.
create function pg_temp.fixture(
  p_ref text, p_home text, p_away text, p_kickoff timestamptz,
  p_stage_kind text default 'league', p_round text default 'Matchweek 13'
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'provider_ref', p_ref,
    'kickoff_at', p_kickoff,
    'status', 'scheduled',
    'matchday', 13,
    'round_label', p_round,
    'stage_kind', p_stage_kind,
    'home', case when p_home is null then null else jsonb_build_object('provider_ref', 't-' || p_home, 'name', p_home || ' FC', 'short_name', p_home) end,
    'away', case when p_away is null then null else jsonb_build_object('provider_ref', 't-' || p_away, 'name', p_away || ' FC', 'short_name', p_away) end,
    'result', null
  )
$$;

-- The catalog is closed to app users: these helpers read it as the owner.
create function pg_temp.fixture_id(p_ref text)
returns uuid
language sql
security definer
as $$ select id from catalog.fixtures where provider_ref = p_ref $$;

-- A fixture's questions on offer to rooms, by template key.
create function pg_temp.question(p_ref text, p_key text)
returns uuid
language sql
security definer
as $$
  select q.id from catalog.fixture_questions q
  join catalog.question_templates t on t.id = q.template_id
  where q.fixture_id = pg_temp.fixture_id(p_ref) and t.key = p_key
$$;

create function pg_temp.room_question(p_ref text, p_key text)
returns uuid
language sql
security definer
as $$
  select p.id from public.predictions p
  where p.room_id = pg_temp.setting('room_id')
    and p.fixture_question_id = pg_temp.question(p_ref, p_key)
$$;

-- The launch competitions come with the migration.
select is(
  (select array_agg(provider_ref order by display_order) from catalog.competitions where active),
  array['PL', 'CL'],
  'the Premier League and Champions League are on offer'
);
select set_config('test.pl', (select id::text from catalog.competitions where provider_ref = 'PL'), true);
select set_config('test.cl', (select id::text from catalog.competitions where provider_ref = 'CL'), true);
select set_config('test.kickoff', (date_trunc('minute', now()) + interval '2 days')::text, true);

-- ------------------------------------------------------------
-- Syncing fixtures
-- ------------------------------------------------------------
select is(
  public.sync_competition_fixtures('football-data', 'PL', '2026/27', jsonb_build_array(
    pg_temp.fixture('pl-1', 'Arsenal', 'Chelsea', current_setting('test.kickoff')::timestamptz),
    pg_temp.fixture('pl-2', 'Liverpool', 'Spurs', current_setting('test.kickoff')::timestamptz + interval '1 day'),
    pg_temp.fixture('pl-old', 'Everton', 'Fulham', now() - interval '1 day')
  ))->>'fixtures',
  '3',
  'a sync saves every fixture it is given'
);
select public.sync_competition_fixtures('football-data', 'CL', '2026/27', jsonb_build_array(
  pg_temp.fixture('cl-1', 'Real', 'Bayern', now() + interval '5 days', 'knockout', 'Quarter-finals'),
  pg_temp.fixture('cl-2', 'Bayern', 'Real', now() + interval '12 days', 'knockout', 'Quarter-finals'),
  pg_temp.fixture('cl-final', null, null, now() + interval '20 days', 'final', 'Final')
));

select is(
  (select count(*)::int from catalog.teams where provider = 'football-data'),
  8,
  'each team is saved once'
);
select is(
  (select current_season from catalog.competitions where provider_ref = 'PL'),
  '2026/27',
  'the competition records its season'
);
select is(
  (select array_agg(stage_kind order by kickoff_at) from catalog.fixtures where provider_ref in ('cl-1', 'cl-2')),
  array['first_leg', 'knockout'],
  'the earlier of two legs is a first leg, the later one decides the tie'
);
select is(
  (select title from catalog.fixture_questions where id = pg_temp.question('pl-1', 'who_wins')),
  'Who wins Arsenal vs Chelsea? (90 minutes)',
  'questions are written out with the teams'' names'
);
select is(
  (select options from catalog.fixture_questions where id = pg_temp.question('pl-1', 'who_wins')),
  '[{"key": "home", "label": "Arsenal"}, {"key": "draw", "label": "Draw"}, {"key": "away", "label": "Chelsea"}]'::jsonb,
  'and so are their options, each with its key'
);
select is(
  (select hidden from catalog.fixture_questions where id = pg_temp.question('pl-1', 'clean_sheet_home')),
  true,
  'templates that are off by default start hidden'
);
select is(
  (select count(*)::int from catalog.fixture_questions where fixture_id in (pg_temp.fixture_id('cl-final'), pg_temp.fixture_id('pl-old'))),
  0,
  'no questions for a match without teams, or one already played'
);

-- Alice owns the room; Bob is a player.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Matchday')->>'id'), true);
select set_config('test.room_code', (select room_code from public.rooms where id = pg_temp.setting('room_id')), true);
select set_config('test.series', (public.create_series(pg_temp.setting('room_id'), 'Season')->>'id'), true);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.register_player('bob');
select public.join_room(current_setting('test.room_code'));
delete from private.notification_dispatch_log;

-- ------------------------------------------------------------
-- Following and the fixtures view
-- ------------------------------------------------------------
set local role authenticated;
select throws_ok(
  format($$ select public.get_room_fixtures(%L) $$, pg_temp.setting('room_id')),
  'P0012', null,
  'players can''t open the fixtures'
);
select throws_ok(
  format($$ select public.set_room_competition(%L, %L, true) $$, pg_temp.setting('room_id'), pg_temp.setting('pl')),
  'P0012', null,
  'or follow a competition'
);
select throws_ok(
  $$ select public.sync_competition_fixtures('football-data', 'PL', '2026/27', '[]') $$,
  '42501', null,
  'only the server can sync fixtures'
);
select throws_ok(
  $$ select * from catalog.fixtures $$,
  '42501', null,
  'and nobody reads the catalog directly'
);

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select is(
  json_array_length(public.get_room_fixtures(pg_temp.setting('room_id'))->'fixtures'),
  0,
  'a room that follows nothing has no fixtures'
);
select public.set_room_competition(pg_temp.setting('room_id'), pg_temp.setting('pl'), true);
select set_config('test.view', public.get_room_fixtures(pg_temp.setting('room_id'))::text, true);
select is(
  (select array_agg(c->>'name' || ':' || (c->>'following')) from json_array_elements(current_setting('test.view')::json->'competitions') c),
  array['Premier League:true', 'Champions League:false'],
  'the room follows the Premier League'
);
select is(
  (select array_agg(f->>'home' || ' vs ' || (f->>'away')) from json_array_elements(current_setting('test.view')::json->'fixtures') f),
  array['Arsenal vs Chelsea', 'Liverpool vs Spurs'],
  'and sees its upcoming matches, in kickoff order'
);
select is(
  (select array_agg(q->>'title') from json_array_elements(current_setting('test.view')::json->'fixtures'->0->'questions') q),
  array['Who wins Arsenal vs Chelsea? (90 minutes)', 'Do both teams score in Arsenal vs Chelsea?', 'Three or more goals in Arsenal vs Chelsea?'],
  'each with its suggested questions'
);

select public.set_room_competition(pg_temp.setting('room_id'), pg_temp.setting('cl'), true);
select is(
  (select array_agg(q->>'title') from json_array_elements(public.get_room_fixtures(pg_temp.setting('room_id'))->'fixtures') f,
     json_array_elements(f->'questions') q where f->>'home' = 'Bayern'),
  array['Who goes through, Bayern or Real?', 'Do both teams score in Bayern vs Real?', 'Three or more goals in Bayern vs Real?', 'Does Bayern vs Real go to penalties?'],
  'a deciding leg asks who goes through, never a three-way who wins'
);
select is(
  (select q->>'title' from json_array_elements(public.get_room_fixtures(pg_temp.setting('room_id'))->'fixtures') f,
     json_array_elements(f->'questions') q where f->>'home' = 'Real' order by q->>'title' limit 1),
  'Do both teams score in Real vs Bayern?',
  'a first leg gets the usual questions'
);

-- ------------------------------------------------------------
-- Adding questions
-- ------------------------------------------------------------
select set_config('test.added', public.add_fixture_questions(
  pg_temp.setting('room_id'),
  pg_temp.setting('series'),
  array[pg_temp.question('pl-2', 'who_wins'), pg_temp.question('pl-1', 'who_wins'), pg_temp.question('pl-1', 'both_score')]
)::text, true);
reset role;

select is(
  current_setting('test.added')::json->>'count',
  '3',
  'three questions are added in one call'
);
select is(
  (select array_agg(title order by series_prediction_number) from public.predictions where room_id = pg_temp.setting('room_id')),
  array['Who wins Arsenal vs Chelsea? (90 minutes)', 'Do both teams score in Arsenal vs Chelsea?', 'Who wins Liverpool vs Spurs? (90 minutes)'],
  'they are numbered in kickoff order'
);
select is(
  (select row(status, deadline = current_setting('test.kickoff')::timestamptz)::text from public.predictions where id = pg_temp.room_question('pl-1', 'who_wins')),
  '(draft,t)',
  'they are live and close at kickoff'
);
select is(
  (select array_agg(label || '=' || option_key order by display_order) from public.prediction_options where prediction_id = pg_temp.room_question('pl-1', 'who_wins')),
  array['Arsenal=home', 'Draw=draw', 'Chelsea=away'],
  'their options keep their keys'
);
select is(
  (select description from public.predictions where id = pg_temp.room_question('pl-1', 'who_wins')),
  'Decided by the score after 90 minutes plus stoppage time. Extra time and penalties don''t count.',
  'the template''s description says how it''s decided'
);
select is(
  (select array_agg(distinct t.tag) from public.prediction_tags t join public.predictions p on p.id = t.prediction_id where p.room_id = pg_temp.setting('room_id')),
  array['Premier League'],
  'they are tagged with the competition'
);
select is(
  (select array_agg(e.title || '@' || (e.fixture_id = pg_temp.fixture_id('pl-1')) order by e.title)
   from public.prediction_events e where e.room_id = pg_temp.setting('room_id')),
  array['Arsenal vs Chelsea@true', 'Liverpool vs Spurs@false'],
  'each match gets its own event'
);
select is(
  (select count(*)::int from private.notification_dispatch_log where event_type = 'prediction_live'),
  1,
  'players get one push for the lot'
);

set local role authenticated;
select is(
  public.add_fixture_questions(
    pg_temp.setting('room_id'),
    pg_temp.setting('series'),
    array[pg_temp.question('pl-1', 'who_wins'), pg_temp.question('pl-1', 'three_plus_goals')]
  )->>'skipped',
  '1',
  'questions the room already has are skipped'
);
reset role;
select is(
  (select count(distinct event_id)::int from public.predictions where room_id = pg_temp.setting('room_id') and title like '%Arsenal%'),
  1,
  'a question added later joins the match''s event'
);

set local role authenticated;
select throws_ok(
  format($$ select public.add_fixture_questions(%L, %L, array[%L]::uuid[]) $$,
    pg_temp.setting('room_id'), pg_temp.setting('series'), pg_temp.question('pl-1', 'who_wins')),
  'P0001', 'Those questions are already in this room',
  'adding only questions the room has fails'
);
select throws_ok(
  format($$ select public.add_fixture_questions(%L, %L, array[%L]::uuid[]) $$,
    pg_temp.setting('room_id'), pg_temp.setting('series'), pg_temp.question('pl-1', 'clean_sheet_home')),
  'P0001', null,
  'a hidden question can''t be added'
);
select throws_ok(
  format($$ select public.add_fixture_questions(%L, %L, array[%L]::uuid[], %L) $$,
    pg_temp.setting('room_id'), pg_temp.setting('series'), pg_temp.question('pl-2', 'both_score'),
    current_setting('test.kickoff')::timestamptz + interval '1 day'),
  'P0001', 'Leave at least 5 minutes between going live and the deadline',
  'a scheduled question must go live before kickoff'
);
select is(
  (select f->'questions'->0->>'prediction_id' from json_array_elements(public.get_room_fixtures(pg_temp.setting('room_id'))->'fixtures') f where f->>'home' = 'Arsenal'),
  pg_temp.room_question('pl-1', 'who_wins')::text,
  'the fixtures view shows what the room already has'
);

-- ------------------------------------------------------------
-- Kickoff changes
-- ------------------------------------------------------------
-- The host gives one question their own deadline.
select public.update_prediction(
  pg_temp.room_question('pl-1', 'both_score'),
  'Do both teams score in Arsenal vs Chelsea?',
  current_setting('test.kickoff')::timestamptz - interval '10 minutes'
);
reset role;
select is(
  (select fixture_question_id from public.predictions where id = pg_temp.room_question('pl-1', 'both_score')),
  pg_temp.question('pl-1', 'both_score'),
  'a new deadline alone keeps the link'
);

select is(
  public.sync_competition_fixtures('football-data', 'PL', '2026/27', jsonb_build_array(
    pg_temp.fixture('pl-1', 'Arsenal', 'Chelsea', current_setting('test.kickoff')::timestamptz + interval '2 hours')
  ))->>'moved_deadlines',
  '2',
  'a kickoff that moves takes the questions closing at it along'
);
select is(
  (select deadline from public.predictions where id = pg_temp.room_question('pl-1', 'who_wins')),
  current_setting('test.kickoff')::timestamptz + interval '2 hours',
  'they close at the new kickoff'
);
select is(
  (select deadline from public.predictions where id = pg_temp.room_question('pl-1', 'both_score')),
  current_setting('test.kickoff')::timestamptz - interval '10 minutes',
  'a deadline the host chose stays'
);

-- ------------------------------------------------------------
-- Editing detaches
-- ------------------------------------------------------------
set local role authenticated;
select public.update_prediction(
  pg_temp.room_question('pl-1', 'who_wins'),
  'Arsenal or Chelsea, 90 minutes?',
  current_setting('test.kickoff')::timestamptz + interval '2 hours'
);
reset role;
select is(
  (select row(p.fixture_question_id is null, bool_and(o.option_key is null))::text
   from public.predictions p join public.prediction_options o on o.prediction_id = p.id
   where p.title = 'Arsenal or Chelsea, 90 minutes?'
   group by p.id),
  '(t,t)',
  'changing the question makes it the host''s own'
);

set local role authenticated;
select public.update_prediction(
  pg_temp.room_question('pl-2', 'who_wins'),
  'Who wins Liverpool vs Spurs? (90 minutes)',
  current_setting('test.kickoff')::timestamptz + interval '1 day',
  array['Liverpool', 'Tie', 'Spurs']
);
reset role;
select is(
  (select fixture_question_id from public.predictions where room_id = pg_temp.setting('room_id') and title = 'Who wins Liverpool vs Spurs? (90 minutes)'),
  null,
  'and so does changing its options'
);
select is(
  (select f->'questions'->0->>'prediction_id' from json_array_elements(public.get_room_fixtures(pg_temp.setting('room_id'))->'fixtures') f where f->>'home' = 'Liverpool'),
  null,
  'a detached question can be added again from the fixtures'
);

-- ------------------------------------------------------------
-- Unfollowing, and the sync request
-- ------------------------------------------------------------
set local role authenticated;
select public.set_room_competition(pg_temp.setting('room_id'), pg_temp.setting('pl'), false);
select is(
  (select array_agg(distinct f->>'competition_name') from json_array_elements(public.get_room_fixtures(pg_temp.setting('room_id'))->'fixtures') f),
  array['Champions League'],
  'an unfollowed competition''s fixtures go'
);
reset role;
select is(
  (select count(*)::int from public.predictions where room_id = pg_temp.setting('room_id')),
  4,
  'and the questions already added stay'
);

delete from private.notification_config where key = 'fixture_sync_secret';
select lives_ok(
  $$ select private.request_fixture_sync() $$,
  'the sync request does nothing until its secret is set'
);

select * from finish();
rollback;
