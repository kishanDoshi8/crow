begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

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

-- The match as the adapter sends it; p_result null while it's to come.
create function pg_temp.match(p_kickoff timestamptz, p_status text, p_result jsonb)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'provider_ref', 'm-9', 'kickoff_at', p_kickoff, 'status', p_status, 'matchday', null,
    'round_label', 'ODIs', 'stage_kind', 'league', 'match_format', 'odi', 'label', '9th Match',
    'venue', 'Doha',
    'home', jsonb_build_object('provider_ref', 'Afghanistan A', 'name', 'Afghanistan A', 'short_name', 'Afghanistan A'),
    'away', jsonb_build_object('provider_ref', 'Hong Kong', 'name', 'Hong Kong', 'short_name', 'Hong Kong'),
    'result', p_result
  )
$$;

create function pg_temp.fixture_id()
returns uuid
language sql
security definer
as $$ select id from catalog.fixtures where provider_ref = 'm-9' $$;

create function pg_temp.question(p_key text)
returns uuid
language sql
security definer
as $$
  select q.id from catalog.fixture_questions q
  join catalog.question_templates t on t.id = q.template_id
  where q.fixture_id = pg_temp.fixture_id() and t.key = p_key
$$;

create function pg_temp.result()
returns jsonb
language sql
security definer
as $$ select result from catalog.fixtures where id = pg_temp.fixture_id() $$;

-- Alice runs Crow and a room; the series and match are synced.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.register_player('alice');
insert into public.platform_admins (player_id) select id from public.players where username = 'alice';
set local role authenticated;
select set_config('test.series_c', (public.admin_add_competition('cricketdata', 'cup-1', 'Rising Stars', 'cricket', 'cup')->>'id'), true);
select set_config('test.room', (public.create_room('Room')->>'id'), true);
select set_config('test.series', (public.create_series(pg_temp.setting('room'), 'Season')->>'id'), true);
reset role;
select public.sync_competition_fixtures('cricketdata', 'cup-1', '2026', jsonb_build_array(
  pg_temp.match(now() + interval '1 day', 'scheduled', null)
));
set local role authenticated;
select set_config('test.who', (public.add_fixture_questions(pg_temp.setting('room'), pg_temp.setting('series'),
  array[pg_temp.question('who_wins'), pg_temp.question('toss_winner')])->'prediction_ids'->>0), true);
reset role;

-- The match is played. The series list says who won, but not the toss.
update catalog.fixtures set kickoff_at = now() - interval '8 hours' where id = pg_temp.fixture_id();
update public.predictions set status = 'locked', deadline = now() - interval '9 hours' where room_id = pg_temp.setting('room');
select public.sync_competition_fixtures('cricketdata', 'cup-1', '2026', jsonb_build_array(
  pg_temp.match(now() - interval '8 hours', 'finished',
    '{"winner": "home", "toss_winner": null, "toss_choice": null, "innings": [], "status_text": "Afghanistan A won by 7 wkts"}')
));
select is(private.fixture_result_due(pg_temp.fixture_id()), true, 'a result from the series list alone is still due for the match''s own page');

-- match_info: the toss and both innings.
select public.sync_competition_fixtures('cricketdata', 'cup-1', '', jsonb_build_array(
  pg_temp.match(now() - interval '8 hours', 'finished',
    '{"winner": "home", "toss_winner": "home", "toss_choice": "bowl", "detailed": true,
      "innings": [{"team": "away", "runs": 66, "wickets": 10, "overs": 21.3}, {"team": "home", "runs": 72, "wickets": 3, "overs": 10.2}],
      "status_text": "Afghanistan A won by 7 wkts"}')
), true);
select is(private.fixture_result_due(pg_temp.fixture_id()), false, 'once it''s read, the match is settled');
select is(
  array[private.fixture_question_outcome(pg_temp.question('toss_winner')), private.fixture_question_outcome(pg_temp.question('toss_choice')),
        private.fixture_question_outcome(pg_temp.question('batting_first_wins')), private.fixture_question_outcome(pg_temp.question('par_odi'))],
  array['home', 'bowl', 'no', 'no'],
  'the toss, batting first and par score all get answers'
);

-- The next series list sync carries the thinner result again.
select public.sync_competition_fixtures('cricketdata', 'cup-1', '2026', jsonb_build_array(
  pg_temp.match(now() - interval '8 hours', 'finished',
    '{"winner": "home", "toss_winner": null, "toss_choice": null, "innings": [], "status_text": "Afghanistan A won by 7 wkts"}')
));
select is(pg_temp.result()->>'toss_choice', 'bowl', 'a later series list doesn''t wipe the fuller result');
select is((select synced_at is not null from catalog.competitions where provider_ref = 'cup-1'), true, 'the series list still counts as a sync');

-- ------------------------------------------------------------
-- The match result for players
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select is(public.get_prediction_match_result(pg_temp.setting('who'))::text, null, 'players see no match result before it''s confirmed');
select public.admin_confirm_fixture(pg_temp.fixture_id(), json_build_object(
  pg_temp.question('who_wins'), 'home', pg_temp.question('toss_winner'), 'home')::jsonb);
select is(
  (select row(r->>'home', r->>'away', r->>'format', r->'result'->'innings'->1->>'runs')::text
   from (select public.get_prediction_match_result(pg_temp.setting('who')) r) x),
  '("Afghanistan A","Hong Kong",odi,72)',
  'then the question shows the match and its scoreboard'
);

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.register_player('bob');
select is(public.get_prediction_match_result(pg_temp.setting('who'))::text, null, 'someone outside the room sees nothing');
reset role;

select * from finish();
rollback;
