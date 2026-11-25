begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

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
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000c4a1', 'authenticated', 'authenticated', 'cara@example.com');

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

create function pg_temp.fixture(
  p_ref text, p_home text, p_away text, p_kickoff timestamptz,
  p_stage_kind text default 'league', p_round text default 'Matchweek 13',
  p_status text default 'scheduled', p_result jsonb default null
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'provider_ref', p_ref,
    'kickoff_at', p_kickoff,
    'status', p_status,
    'matchday', 13,
    'round_label', p_round,
    'stage_kind', p_stage_kind,
    'home', jsonb_build_object('provider_ref', 't-' || p_home, 'name', p_home || ' FC', 'short_name', p_home),
    'away', jsonb_build_object('provider_ref', 't-' || p_away, 'name', p_away || ' FC', 'short_name', p_away),
    'result', p_result
  )
$$;

-- A finished result as the football-data adapter writes it.
create function pg_temp.result(p_home int, p_away int, p_ht_home int, p_ht_away int)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'winner', case when p_home > p_away then 'home' when p_home < p_away then 'away' else 'draw' end,
    'duration', 'regular',
    'full_time', jsonb_build_object('home', p_home, 'away', p_away),
    'half_time', jsonb_build_object('home', p_ht_home, 'away', p_ht_away)
  )
$$;

-- The catalog is closed to app users: these helpers read it as the owner.
create function pg_temp.fixture_id(p_ref text)
returns uuid
language sql
security definer
as $$ select id from catalog.fixtures where provider_ref = p_ref $$;

create function pg_temp.question(p_ref text, p_key text)
returns uuid
language sql
security definer
as $$
  select q.id from catalog.fixture_questions q
  join catalog.question_templates t on t.id = q.template_id
  where q.fixture_id = pg_temp.fixture_id(p_ref) and t.key = p_key
$$;

create function pg_temp.room_question(p_room text, p_ref text, p_key text)
returns uuid
language sql
security definer
as $$
  select p.id from public.predictions p
  where p.room_id = pg_temp.setting(p_room)
    and p.fixture_question_id = pg_temp.question(p_ref, p_key)
$$;

create function pg_temp.suggested(p_ref text, p_key text)
returns text
language sql
security definer
as $$ select private.fixture_question_outcome(pg_temp.question(p_ref, p_key)) $$;

-- Puts a match in the past and locks its room questions, as kickoff and
-- the every-minute lock job would.
create function pg_temp.kick_off(p_ref text)
returns void
language sql
security definer
as $$
  update public.predictions p set status = 'locked', deadline = now() - interval '3 hours'
  from catalog.fixture_questions q
  join catalog.fixtures f on f.id = q.fixture_id
  where q.id = p.fixture_question_id and f.provider_ref = p_ref
    and p.status = 'draft' and p.deadline <= f.kickoff_at;
  update catalog.fixtures set kickoff_at = now() - interval '3 hours' where provider_ref = p_ref;
$$;

select set_config('test.kickoff', (date_trunc('minute', now()) + interval '2 days')::text, true);
select public.sync_competition_fixtures('football-data', 'PL', '2026/27', jsonb_build_array(
  pg_temp.fixture('pl-1', 'Arsenal', 'Chelsea', current_setting('test.kickoff')::timestamptz),
  pg_temp.fixture('pl-2', 'Liverpool', 'Spurs', current_setting('test.kickoff')::timestamptz)
));
-- Champions League games already played: synced while still to come (so
-- they get questions and legs), then finished.
select public.sync_competition_fixtures('football-data', 'CL', '2026/27', jsonb_build_array(
  pg_temp.fixture('cl-1', 'Real', 'Bayern', now() + interval '1 day', 'knockout', 'Quarter-finals'),
  pg_temp.fixture('cl-2', 'Bayern', 'Real', now() + interval '8 days', 'knockout', 'Quarter-finals'),
  pg_temp.fixture('cl-final', 'Inter', 'Milan', now() + interval '20 days', 'final', 'Final')
));
update catalog.fixtures set status = 'finished', kickoff_at = kickoff_at - interval '30 days', result = case provider_ref
  when 'cl-1' then pg_temp.result(2, 0, 1, 0)
  when 'cl-2' then pg_temp.result(3, 0, 1, 0)
  else '{"winner": "away", "duration": "penalties", "full_time": {"home": 1, "away": 1}, "half_time": {"home": 0, "away": 0},
         "regular_time": {"home": 1, "away": 1}, "extra_time": {"home": 0, "away": 0}, "penalties": {"home": 3, "away": 4}}'::jsonb
  end
where provider_ref like 'cl-%';

-- ------------------------------------------------------------
-- Resolvers
-- ------------------------------------------------------------
update catalog.fixtures set status = 'finished', result = pg_temp.result(2, 1, 0, 1) where provider_ref = 'pl-2';
select is(
  array[pg_temp.suggested('pl-2', 'who_wins'), pg_temp.suggested('pl-2', 'both_score'),
        pg_temp.suggested('pl-2', 'three_plus_goals'), pg_temp.suggested('pl-2', 'clean_sheet_home'),
        pg_temp.suggested('pl-2', 'more_goals_half')],
  array['home', 'yes', 'yes', 'no', 'second'],
  'a 2-1 after 0-1 at half time answers each question'
);
update catalog.fixtures set status = 'scheduled', result = null where provider_ref = 'pl-2';
select is(pg_temp.suggested('pl-2', 'who_wins'), null, 'no score, no answer');
select is(pg_temp.suggested('cl-1', 'who_wins'), 'home', 'a first leg is won on the night');
select is(pg_temp.suggested('cl-2', 'goes_through'), 'home', 'a second leg goes by the score over both legs (3-2)');
select is(
  array[pg_temp.suggested('cl-final', 'wins_final'), pg_temp.suggested('cl-final', 'penalties'), pg_temp.suggested('cl-final', 'both_score')],
  array['away', 'yes', 'yes'],
  'a final decided on penalties'
);

-- ------------------------------------------------------------
-- Admins
-- ------------------------------------------------------------
-- Alice owns room A and is on the Crow team; Bob plays there. Cara owns
-- room B.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.register_player('alice');
insert into public.platform_admins (player_id) select id from public.players where username = 'alice';
select set_config('test.room_a', (public.create_room('Room A')->>'id'), true);
select set_config('test.series_a', (public.create_series(pg_temp.setting('room_a'), 'Season')->>'id'), true);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.register_player('bob');
select public.join_room((select room_code from public.rooms where id = pg_temp.setting('room_a')));
select pg_temp.login('00000000-0000-0000-0000-00000000c4a1');
select public.register_player('cara');
select set_config('test.room_b', (public.create_room('Room B')->>'id'), true);
select set_config('test.series_b', (public.create_series(pg_temp.setting('room_b'), 'Season')->>'id'), true);

set local role authenticated;
select is(public.get_my_platform_admin(), false, 'a player isn''t a platform admin');
select throws_ok($$ select public.admin_get_results() $$, 'P0012', null, 'and can''t see the results queue');
select throws_ok(
  format($$ select public.admin_confirm_fixture(%L, '{}') $$, pg_temp.fixture_id('pl-1')),
  'P0012', null, 'or confirm a result'
);
select public.add_fixture_questions(pg_temp.setting('room_b'), pg_temp.setting('series_b'),
  array[pg_temp.question('pl-1', 'who_wins'), pg_temp.question('pl-1', 'both_score')]);
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select is(public.get_my_platform_admin(), true, 'Alice is');
select public.add_fixture_questions(pg_temp.setting('room_a'), pg_temp.setting('series_a'),
  array[pg_temp.question('pl-1', 'who_wins'), pg_temp.question('pl-1', 'both_score'), pg_temp.question('pl-1', 'three_plus_goals')]);
-- Alice moves one question's deadline past kickoff: it locks after Crow reveals.
select public.update_prediction(pg_temp.room_question('room_a', 'pl-1', 'three_plus_goals'),
  'Three or more goals in Arsenal vs Chelsea?', current_setting('test.kickoff')::timestamptz + interval '3 days');
-- Picks on both sides, so the result settles points.
select public.place_bet(pg_temp.room_question('room_a', 'pl-1', 'who_wins'),
  (select id from public.prediction_options where prediction_id = pg_temp.room_question('room_a', 'pl-1', 'who_wins') and option_key = 'draw'), 100);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.place_bet(pg_temp.room_question('room_a', 'pl-1', 'who_wins'),
  (select id from public.prediction_options where prediction_id = pg_temp.room_question('room_a', 'pl-1', 'who_wins') and option_key = 'home'), 100);
reset role;

-- The match is played; room B reveals one question by hand.
select pg_temp.kick_off('pl-1');
select public.sync_competition_fixtures('football-data', 'PL', '2026/27', jsonb_build_array(
  pg_temp.fixture('pl-1', 'Arsenal', 'Chelsea', now() - interval '3 hours', 'league', 'Matchweek 13', 'finished', pg_temp.result(2, 0, 1, 0))
));
select pg_temp.login('00000000-0000-0000-0000-00000000c4a1');
set local role authenticated;
select public.resolve_prediction_v2(pg_temp.room_question('room_b', 'pl-1', 'both_score'), pg_temp.setting('room_b'), 'no_result', null, 'Cara says so');
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');

-- ------------------------------------------------------------
-- The results queue
-- ------------------------------------------------------------
select set_config('test.queue', public.admin_get_results()::text, true);
select is(
  (select array_agg(f->>'home') from json_array_elements(current_setting('test.queue')::json->'to_confirm') f),
  array['Arsenal'],
  'a played match rooms have questions on waits for its result'
);
select is(
  (select array_agg((q->>'title') || '=' || (q->>'suggested') || '/' || (q->>'rooms') || '/' || (q->>'by_hand'))
   from json_array_elements(current_setting('test.queue')::json->'to_confirm'->0->'questions') q),
  array['Who wins Arsenal vs Chelsea? (90 minutes)=home/2/0', 'Do both teams score in Arsenal vs Chelsea?=no/2/1', 'Three or more goals in Arsenal vs Chelsea?=no/1/0'],
  'with the suggested answers and how rooms stand'
);

select throws_ok(
  format($$ select public.admin_confirm_fixture(%L, %L) $$, pg_temp.fixture_id('pl-1'),
    json_build_object(pg_temp.question('pl-1', 'who_wins'), 'home')),
  'P0001', 'Give an answer for "Do both teams score in Arsenal vs Chelsea?"',
  'every question rooms have needs an answer'
);
select throws_ok(
  format($$ select public.admin_confirm_fixture(%L, %L) $$, pg_temp.fixture_id('pl-1'),
    json_build_object(pg_temp.question('pl-1', 'who_wins'), 'yes', pg_temp.question('pl-1', 'both_score'), 'no',
      pg_temp.question('pl-1', 'three_plus_goals'), 'no')),
  'P0001', null,
  'and it must be one of its options'
);

-- ------------------------------------------------------------
-- Confirming reveals in every room
-- ------------------------------------------------------------
reset role;
delete from private.notification_dispatch_log;
set local role authenticated;
select set_config('test.confirmed', public.admin_confirm_fixture(pg_temp.fixture_id('pl-1'), json_build_object(
  pg_temp.question('pl-1', 'who_wins'), 'home',
  pg_temp.question('pl-1', 'both_score'), 'no',
  pg_temp.question('pl-1', 'three_plus_goals'), 'no'
)::jsonb)::text, true);
reset role;

select is(current_setting('test.confirmed')::json->>'revealed', '3', 'confirming reveals the locked room questions');
select is(
  (select row(p.status, o.option_key, p.resolved_by is null, p.revealed_by_crow)::text
   from public.predictions p join public.prediction_options o on o.id = p.winning_option_id
   where p.id = pg_temp.room_question('room_a', 'pl-1', 'who_wins')),
  '(revealed,home,t,t)',
  'as Crow, with the confirmed answer'
);
select is(
  (select balance from public.series_wallets w join public.players pl on pl.id = w.player_id
   where pl.username = 'bob' and w.series_id = pg_temp.setting('series_a')) > 1000,
  true,
  'and points move as for any reveal'
);
select is(
  (select row(no_result_reason, revealed_by_crow)::text from public.predictions where id = pg_temp.room_question('room_b', 'pl-1', 'both_score')),
  '("Cara says so",f)',
  'a question a room revealed by hand is left alone'
);
select is(
  (select status from public.predictions where id = pg_temp.room_question('room_a', 'pl-1', 'three_plus_goals')),
  'draft',
  'one still open for picks waits'
);
select is(
  (select array_agg(pl.username order by pl.username)
   from private.notification_dispatch_log l
   join public.players pl on pl.id::text = l.payload->'payload'->>'target_player_id'
   where l.event_type = 'result_revealed'),
  array['alice', 'bob'],
  'each player in room A hears their own result; room B, where nobody picked, gets none'
);
select is(
  (select bool_and((metadata->>'byCrow')::boolean) from public.room_activities
   where activity_type in ('prediction_revealed', 'prediction_no_result')
     and room_id in (pg_temp.setting('room_a'), pg_temp.setting('room_b'))
     and created_by_player_id is null),
  true,
  'the Activity entries say Crow revealed them'
);
select is(
  (select row(result_confirmed_at is not null, pl.username)::text from catalog.fixtures f
   join public.players pl on pl.id = f.result_confirmed_by where f.id = pg_temp.fixture_id('pl-1')),
  '(t,alice)',
  'the match records who confirmed it'
);

-- The open one locks later: the 15-minute job reveals it.
update public.predictions set status = 'locked' where id = pg_temp.room_question('room_a', 'pl-1', 'three_plus_goals');
select private.run_fixture_results();
select is(
  (select row(status, revealed_by_crow)::text from public.predictions where id = pg_temp.room_question('room_a', 'pl-1', 'three_plus_goals')),
  '(no_result,t)',
  'a question that locks after the match is confirmed gets revealed too'
);

-- ------------------------------------------------------------
-- Fixing a confirmed result
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select set_config('test.fixed', public.admin_confirm_fixture(pg_temp.fixture_id('pl-1'), json_build_object(
  pg_temp.question('pl-1', 'who_wins'), 'draw',
  pg_temp.question('pl-1', 'both_score'), 'no',
  pg_temp.question('pl-1', 'three_plus_goals'), 'no'
)::jsonb)::text, true);
reset role;
select is(current_setting('test.fixed')::json->>'fixed', '2', 'a changed answer is fixed in every room Crow revealed it in');
select is(
  (select row(o.option_key, p.corrected_by is null, p.corrected_at is not null)::text
   from public.predictions p join public.prediction_options o on o.id = p.winning_option_id
   where p.id = pg_temp.room_question('room_b', 'pl-1', 'who_wins')),
  '(draw,t,t)',
  'by Crow'
);
select is(
  (select balance from public.series_wallets w join public.players pl on pl.id = w.player_id
   where pl.username = 'bob' and w.series_id = pg_temp.setting('series_a')) < 1000,
  true,
  'and points move back'
);

-- Alice fixes room A by hand; the next global fix leaves it.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.correct_prediction_result(pg_temp.room_question('room_a', 'pl-1', 'who_wins'), pg_temp.setting('room_a'), 'win',
  (select id from public.prediction_options where prediction_id = pg_temp.room_question('room_a', 'pl-1', 'who_wins') and option_key = 'away'));
select is(
  public.admin_confirm_fixture(pg_temp.fixture_id('pl-1'), json_build_object(
    pg_temp.question('pl-1', 'who_wins'), 'home',
    pg_temp.question('pl-1', 'both_score'), 'no',
    pg_temp.question('pl-1', 'three_plus_goals'), 'no'
  )::jsonb)->>'fixed',
  '1',
  'a room that fixed it by hand keeps its own result'
);
reset role;
select is(
  (select o.option_key from public.predictions p join public.prediction_options o on o.id = p.winning_option_id
   where p.id = pg_temp.room_question('room_a', 'pl-1', 'who_wins')),
  'away',
  'room A stays as Alice set it'
);

-- ------------------------------------------------------------
-- Typing a result, and called-off matches
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select throws_ok(
  format($$ select public.admin_set_fixture_result(%L, 'finished', '{"duration": "regular", "ninety": {"home": 1, "away": 0}, "half_time": {"home": 2, "away": 0}}') $$, pg_temp.fixture_id('pl-2')),
  'P0001', 'Scores can only go up from half time to the end',
  'a typed score must add up'
);
select is(
  (select array_agg(q->>'suggested') from json_array_elements(
    public.admin_set_fixture_result(pg_temp.fixture_id('cl-2'), 'finished',
      '{"duration": "penalties", "ninety": {"home": 2, "away": 0}, "half_time": {"home": 1, "away": 0},
        "after_extra_time": {"home": 2, "away": 0}, "penalties": {"home": 4, "away": 5}}')->'questions') q),
  null,
  'no room has that match''s questions, so none are listed'
);
reset role;
select is(
  array[pg_temp.suggested('cl-2', 'goes_through'), pg_temp.suggested('cl-2', 'penalties'), pg_temp.suggested('cl-2', 'three_plus_goals')],
  array['away', 'yes', 'no'],
  'a typed score with a shootout gives its answers'
);
select is(
  (select result_source from catalog.fixtures where provider_ref = 'cl-2'),
  'manual',
  'and the feed won''t overwrite it'
);

-- pl-2 is called off: everyone gets their points back.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.add_fixture_questions(pg_temp.setting('room_a'), pg_temp.setting('series_a'), array[pg_temp.question('pl-2', 'who_wins')]);
reset role;
select pg_temp.kick_off('pl-2');
set local role authenticated;
select public.admin_set_fixture_result(pg_temp.fixture_id('pl-2'), 'abandoned');
select public.admin_confirm_fixture(pg_temp.fixture_id('pl-2'), json_build_object(pg_temp.question('pl-2', 'who_wins'), 'no_result')::jsonb);
reset role;
select is(
  (select row(status, no_result_reason)::text from public.predictions where id = pg_temp.room_question('room_a', 'pl-2', 'who_wins')),
  '(no_result,"Match abandoned")',
  'an abandoned match ends its questions with no result'
);

-- ------------------------------------------------------------
-- Competitions and wording
-- ------------------------------------------------------------
set local role authenticated;
select is(
  (select array_agg((c->>'name') || ':' || (c->>'rooms')) from json_array_elements(public.admin_get_competitions()) c),
  array['Premier League:0', 'Champions League:0'],
  'admins see every competition'
);
select public.admin_set_competition_active((select (c->>'id')::uuid from json_array_elements(public.admin_get_competitions()) c where c->>'name' = 'Champions League'), false);
reset role;
select is(
  (select array_agg(name) from public.get_fixture_sync_targets()),
  array['Premier League'],
  'a competition turned off isn''t synced'
);

select public.sync_competition_fixtures('football-data', 'PL', '2026/27', jsonb_build_array(
  pg_temp.fixture('pl-3', 'Everton', 'Fulham', now() + interval '3 days')
));
set local role authenticated;
select public.admin_update_fixture_question(pg_temp.question('pl-3', 'both_score'), null, 'Will both Everton and Fulham score?', 'Goals in 90 minutes.');
select public.admin_update_fixture_question(pg_temp.question('pl-3', 'three_plus_goals'), true);
reset role;
select public.sync_competition_fixtures('football-data', 'PL', '2026/27', jsonb_build_array(
  pg_temp.fixture('pl-3', 'Everton', 'Fulham', now() + interval '3 days')
));
select is(
  (select title from catalog.fixture_questions where id = pg_temp.question('pl-3', 'both_score')),
  'Will both Everton and Fulham score?',
  'a reworded question keeps its wording through a sync'
);
select is(
  (select hidden from catalog.fixture_questions where id = pg_temp.question('pl-3', 'three_plus_goals')),
  true,
  'a hidden one stays hidden'
);
set local role authenticated;
select is(
  (select array_agg((q->>'title') || ':' || (q->>'hidden') || ':' || (q->>'customized'))
   from json_array_elements(public.admin_get_fixtures()) f, json_array_elements(f->'questions') q
   where f->>'home' = 'Everton' and (q->>'customized')::boolean),
  array['Will both Everton and Fulham score?:false:true'],
  'admins see what was reworded'
);
select public.admin_update_fixture_question(pg_temp.question('pl-3', 'both_score'), null, null, null, true);
reset role;
select is(
  (select row(title, customized_at is null)::text from catalog.fixture_questions where id = pg_temp.question('pl-3', 'both_score')),
  '("Do both teams score in Everton vs Fulham?",t)',
  'resetting puts the template''s wording back'
);

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select throws_ok(
  format($$ select public.admin_update_fixture_question(%L, true) $$, pg_temp.question('pl-3', 'both_score')),
  'P0012', null,
  'players can''t change fixture questions'
);
select throws_ok($$ select * from public.platform_admins $$, '42501', null, 'or read who the admins are');
reset role;

select * from finish();
rollback;
