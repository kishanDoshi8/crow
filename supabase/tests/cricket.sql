begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

insert into private.notification_config (key, value)
values ('supabase_url', 'http://localhost:54321'), ('notification_function_secret', 'secret'),
       ('service_role_key', 'service-key'), ('app_url', 'https://crow.test')
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

-- A match as the CricketData.org adapter sends it.
create function pg_temp.match(p_ref text, p_format text, p_kickoff timestamptz, p_label text, p_result jsonb default null, p_status text default 'scheduled')
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'provider_ref', p_ref, 'kickoff_at', p_kickoff, 'status', p_status, 'matchday', null,
    'round_label', case p_format when 'test' then 'Tests' when 'odi' then 'ODIs' else 'T20Is' end,
    'stage_kind', 'league', 'match_format', p_format, 'label', p_label, 'venue', 'Wellington',
    'home', jsonb_build_object('provider_ref', 'New Zealand', 'name', 'New Zealand', 'short_name', 'New Zealand'),
    'away', jsonb_build_object('provider_ref', 'India', 'name', 'India', 'short_name', 'India'),
    'result', p_result
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

create function pg_temp.fixture_id(p_ref text)
returns uuid
language sql
security definer
as $$ select id from catalog.fixtures where provider_ref = p_ref $$;

create function pg_temp.offered(p_ref text)
returns text[]
language sql
security definer
as $$
  select array_agg(t.key order by q.display_order, t.key)
  from catalog.fixture_questions q
  join catalog.question_templates t on t.id = q.template_id
  join catalog.fixtures f on f.id = q.fixture_id
  where f.provider_ref = p_ref and not q.hidden
    and private.template_fits(t.active, t.stages, t.formats, f.stage_kind, f.match_format)
$$;

create function pg_temp.suggested(p_ref text, p_key text)
returns text
language sql
security definer
as $$ select private.fixture_question_outcome(pg_temp.question(p_ref, p_key)) $$;

-- ------------------------------------------------------------
-- Adding a series
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.register_player('alice');
insert into public.platform_admins (player_id) select id from public.players where username = 'alice';
set local role authenticated;
select set_config('test.tour', (public.admin_add_competition(
  'cricketdata', 'series-123', 'India tour of New Zealand', 'cricket', 'tour', 'New Zealand and India',
  current_date - 1, current_date + 30
)->>'id'), true);
reset role;
select is(
  (select row(kind, region, active, sport)::text from catalog.competitions where id = pg_temp.setting('tour')),
  '(tour,"New Zealand and India",t,cricket)',
  'an admin adds a series found in the provider''s search'
);
select is(
  (select count(*)::int from public.get_fixture_sync_targets() where provider = 'cricketdata'),
  1,
  'and it syncs from then on'
);
update catalog.competitions set ends_on = current_date - 8 where id = pg_temp.setting('tour');
select is(
  (select count(*)::int from public.get_fixture_sync_targets() where provider = 'cricketdata'),
  0,
  'until a week after it ends'
);
update catalog.competitions set ends_on = current_date + 30 where id = pg_temp.setting('tour');

select public.sync_competition_fixtures('cricketdata', 'series-123', '2026/27', jsonb_build_array(
  pg_temp.match('t-1', 'test', now() + interval '2 days', '1st Test'),
  pg_temp.match('o-1', 'odi', now() + interval '10 days', '1st ODI'),
  pg_temp.match('t20-1', 't20', now() + interval '20 days', '1st T20I')
));

-- ------------------------------------------------------------
-- Questions by format
-- ------------------------------------------------------------
select is(pg_temp.offered('t-1'), array['who_wins_test', 'toss_winner', 'toss_choice'], 'a Test asks who wins (with a draw) and about the toss');
select is(pg_temp.offered('o-1'), array['who_wins', 'toss_winner', 'toss_choice', 'batting_first_wins', 'par_odi'], 'an ODI adds batting first and a 300 par score');
select is(pg_temp.offered('t20-1'), array['who_wins', 'toss_winner', 'toss_choice', 'batting_first_wins', 'par_t20'], 'a T20 has a 160 par score');
select is(
  (select options from catalog.fixture_questions where id = pg_temp.question('t-1', 'who_wins_test')),
  '[{"key": "home", "label": "New Zealand"}, {"key": "draw", "label": "Draw"}, {"key": "away", "label": "India"}]'::jsonb,
  'only a Test has a draw'
);
select is(
  (select row(label, venue, match_format)::text from catalog.fixtures where provider_ref = 't-1'),
  '("1st Test",Wellington,test)',
  'a match keeps its label, venue and format'
);

-- ------------------------------------------------------------
-- Toss questions close before the toss
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select set_config('test.room', (public.create_room('Cricket night')->>'id'), true);
select set_config('test.series', (public.create_series(pg_temp.setting('room'), 'Summer')->>'id'), true);
set local role authenticated;
select public.add_fixture_questions(pg_temp.setting('room'), pg_temp.setting('series'),
  array[pg_temp.question('o-1', 'who_wins'), pg_temp.question('o-1', 'toss_winner')]);
reset role;
select is(
  (select array_agg(extract(epoch from (f.kickoff_at - p.deadline))::int / 60 order by p.title)
   from public.predictions p join catalog.fixture_questions q on q.id = p.fixture_question_id
   join catalog.fixtures f on f.id = q.fixture_id where p.room_id = pg_temp.setting('room')),
  array[0, 35],
  'who wins closes at the start; the toss 35 minutes before'
);
select is(
  (select (q->>'closes_before')::int from json_array_elements(
    public.get_room_competition_fixtures(pg_temp.setting('room'), pg_temp.setting('tour'))->'fixtures') f,
    json_array_elements(f->'questions') q where q->>'title' like 'Who wins the toss%' and f->>'label' = '1st ODI'),
  35,
  'the fixtures page says so'
);

-- The start moves an hour later: both move with it.
select public.sync_competition_fixtures('cricketdata', 'series-123', '2026/27', jsonb_build_array(
  pg_temp.match('o-1', 'odi', (select kickoff_at from catalog.fixtures where provider_ref = 'o-1') + interval '1 hour', '1st ODI')
));
select is(
  (select array_agg(extract(epoch from (f.kickoff_at - p.deadline))::int / 60 order by p.title)
   from public.predictions p join catalog.fixture_questions q on q.id = p.fixture_question_id
   join catalog.fixtures f on f.id = q.fixture_id where p.room_id = pg_temp.setting('room')),
  array[0, 35],
  'a moved start keeps each question''s gap'
);
select is(
  (select count(*)::int from catalog.fixtures where competition_id = pg_temp.setting('tour')),
  3,
  'a sync with one match leaves the others alone'
);

-- ------------------------------------------------------------
-- Results
-- ------------------------------------------------------------
select is(
  private.fixture_result_due((select id from catalog.fixtures where provider_ref = 'o-1')),
  false,
  'a match that hasn''t started isn''t checked'
);
update catalog.fixtures set kickoff_at = now() - interval '8 hours', result_checked_at = null where provider_ref = 'o-1';
select is(
  private.fixture_result_due((select id from catalog.fixtures where provider_ref = 'o-1')),
  true,
  'an ODI rooms have questions on is checked once it should be over'
);
select is(
  (select array_agg(provider_ref) from public.get_fixture_result_targets('cricketdata')),
  array['o-1'],
  'and handed to the sync function'
);
select public.sync_competition_fixtures('cricketdata', 'series-123', '2026/27', jsonb_build_array(
  pg_temp.match('o-1', 'odi', now() - interval '8 hours', '1st ODI', null, 'live')
));
select is(
  private.fixture_result_due((select id from catalog.fixtures where provider_ref = 'o-1')),
  false,
  'not again within the hour'
);

-- New Zealand win the toss and bowl; India make 312 and lose.
select public.sync_competition_fixtures('cricketdata', 'series-123', '2026/27', jsonb_build_array(
  pg_temp.match('o-1', 'odi', now() - interval '8 hours', '1st ODI',
    '{"winner": "home", "toss_winner": "home", "toss_choice": "bowl",
      "innings": [{"team": "away", "runs": 312, "wickets": 8, "overs": 50}, {"team": "home", "runs": 315, "wickets": 6, "overs": 49.2}],
      "status_text": "New Zealand won by 4 wkts"}'::jsonb, 'finished')
));
select is(
  array[pg_temp.suggested('o-1', 'who_wins'), pg_temp.suggested('o-1', 'toss_winner'), pg_temp.suggested('o-1', 'toss_choice'),
        pg_temp.suggested('o-1', 'batting_first_wins'), pg_temp.suggested('o-1', 'par_odi')],
  array['home', 'home', 'bowl', 'no', 'yes'],
  'each question''s answer follows from the result'
);
update catalog.fixtures set result = '{"winner": "no_result", "toss_winner": "away", "toss_choice": "bat", "innings": [], "status_text": "No result"}'
where provider_ref = 'o-1';
select is(
  array[pg_temp.suggested('o-1', 'who_wins'), pg_temp.suggested('o-1', 'toss_winner'), pg_temp.suggested('o-1', 'par_odi')],
  array['no_result', 'away', 'no_result'],
  'rain: no result, but the toss still counts'
);
update catalog.fixtures set result = '{"winner": "draw", "toss_winner": "home", "toss_choice": "bat", "innings": [], "status_text": "Match drawn"}'
where provider_ref = 't-1';
select is(pg_temp.suggested('t-1', 'who_wins_test'), 'draw', 'a drawn Test');
update catalog.fixtures set result = '{"winner": "tie", "toss_winner": "home", "toss_choice": "bat", "innings": [], "status_text": "Match tied"}'
where provider_ref = 't20-1';
select is(pg_temp.suggested('t20-1', 'who_wins'), null, 'a tie without a super over winner is left to an admin');

-- ------------------------------------------------------------
-- One-off questions
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select set_config('test.extra', (public.admin_add_fixture_extra(
  pg_temp.fixture_id('t20-1'),
  'Will Kohli score 50?', 'In either innings he bats.', array['Yes', 'No']
)->>'id'), true);
select throws_ok(
  format($$ select public.admin_add_fixture_extra(%L, 'Pick one', null, array['Yes']) $$, pg_temp.fixture_id('t20-1')),
  'P0001', 'Give 2 to 6 options',
  'an extra needs at least two options'
);
select is(
  (select count(*)::int from json_array_elements(
    public.get_room_competition_fixtures(pg_temp.setting('room'), pg_temp.setting('tour'))->'fixtures') f,
    json_array_elements(f->'questions') q where q->>'title' = 'Will Kohli score 50?'),
  1,
  'hosts are offered it with the ready-made ones'
);
select public.add_fixture_questions(pg_temp.setting('room'), pg_temp.setting('series'), array[pg_temp.setting('extra')]);
select throws_ok(
  format($$ select public.admin_delete_fixture_extra(%L) $$, pg_temp.setting('extra')),
  'P0001', 'A room has added it: hide it instead',
  'once a room has it, it can''t be removed'
);
select is(
  (select array_agg(option_key order by display_order) from public.prediction_options o
   join public.predictions p on p.id = o.prediction_id where p.fixture_question_id = pg_temp.setting('extra')),
  array['o1', 'o2'],
  'its options keep keys the admin''s answer can find'
);

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.register_player('bob');
select throws_ok(
  $$ select public.admin_add_competition('cricketdata', 'x', 'X', 'cricket', 'tour') $$,
  'P0012', null,
  'players can''t add series'
);
reset role;

select * from finish();
rollback;
