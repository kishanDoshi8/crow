begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

-- What players see about event pack questions:
-- 1-2. Competition tags: the tag questions from a competition get in rooms. A
--      long tour name tags as the sport until a platform admin sets a tag;
--      setting one retags the room questions still linked to it.
-- 3.   The match result shown next to a question, once Crow confirms it.
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com');

create function pg_temp.login(p_username text)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', case p_username
    when 'alice' then '00000000-0000-0000-0000-00000000a11c'
    when 'bob' then '00000000-0000-0000-0000-000000000b0b' end, true);
  select set_config('request.jwt.claims', json_build_object('sub', current_setting('request.jwt.claim.sub'), 'role', 'authenticated')::text, true);
$$;

create function pg_temp.setting(p_name text)
returns uuid
language sql
as $$ select current_setting('test.' || p_name)::uuid $$;

-- The tags on the room's questions from the tour, sorted and joined.
create function pg_temp.room_tags()
returns text
language sql
as $$
  select string_agg(distinct t.tag, ',' order by t.tag)
  from public.prediction_tags t
  join public.predictions p on p.id = t.prediction_id
  where p.room_id = pg_temp.setting('room_id')
$$;

-- Alice hosts a room with a running series; Bob is a Crow admin.
select pg_temp.login('alice');
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Cricket club')->>'id'), true);
select set_config('test.series', (public.create_series(pg_temp.setting('room_id'), 'Summer', null, 0, 1000, 100, 1)->>'id'), true);
select pg_temp.login('bob');
select public.register_player('bob');
insert into public.platform_admins (player_id) select id from public.players where username = 'bob';

-- A tour with a name too long for a tag, and one match with two questions.
insert into catalog.competitions (sport, name, format, kind, provider, provider_ref, active)
values ('cricket', 'Asia Cup 2026 (Sri Lanka and Pakistan)', 'mixed', 'tour', 'test', 'asia', true);
select set_config('test.comp', (select id::text from catalog.competitions where provider_ref = 'asia'), true);
insert into catalog.teams (sport, provider, provider_ref, name, short_name)
values ('cricket', 'test', 'ind', 'India', 'IND'), ('cricket', 'test', 'pak', 'Pakistan', 'PAK');
insert into catalog.fixtures (competition_id, provider_ref, season, stage_kind, match_format, home_team_id, away_team_id, kickoff_at)
select pg_temp.setting('comp'), 'm1', '2026', 'group', 't20',
  (select id from catalog.teams where provider_ref = 'ind'),
  (select id from catalog.teams where provider_ref = 'pak'),
  now() + interval '2 days';
insert into catalog.fixture_questions (fixture_id, title, options, display_order)
select f.id, x.title, '[{"key":"home","label":"IND"},{"key":"away","label":"PAK"}]'::jsonb, x.n
from catalog.fixtures f, (values ('Who wins?', 0), ('Who wins the toss?', 1)) x(title, n)
where f.provider_ref = 'm1';

-- ------------------------------------------------------------
-- 1. The default tag
-- ------------------------------------------------------------
select is(private.competition_tag(null, 'Premier League', 'soccer'), 'Premier League', 'a name that fits is the tag');
select is(private.competition_tag(null, 'Asia Cup 2026 (Sri Lanka and Pakistan)', 'cricket'), 'Cricket', 'a long name tags the sport');

select pg_temp.login('alice');
select public.add_fixture_questions(
  pg_temp.setting('room_id'), pg_temp.setting('series'),
  (select array_agg(q.id) from catalog.fixture_questions q join catalog.fixtures f on f.id = q.fixture_id where f.provider_ref = 'm1')
);
select is(pg_temp.room_tags(), 'Cricket', 'questions added before a tag is set get the sport');

-- ------------------------------------------------------------
-- 2. An admin sets a tag
-- ------------------------------------------------------------
select pg_temp.login('alice');
select throws_ok(
  format('select public.admin_set_competition_tag(%L::uuid, %L)', pg_temp.setting('comp'), 'Asia Cup'),
  'P0012', null,
  'only platform admins can set a tag'
);

select pg_temp.login('bob');
select throws_ok(
  format('select public.admin_set_competition_tag(%L::uuid, %L)', pg_temp.setting('comp'), repeat('x', 25)),
  'P0001', 'A tag is 24 characters at most',
  'a tag is 24 characters at most'
);
select is(
  (public.admin_set_competition_tag(pg_temp.setting('comp'), '  Asia Cup  ')->>'questions_retagged')::int,
  2,
  'setting a tag retags both questions in the room'
);
select is(pg_temp.room_tags(), 'Asia Cup', 'the room''s questions now say Asia Cup');
select is(
  (select c->>'tag' from json_array_elements(public.admin_get_competitions()) c where (c->>'id')::uuid = pg_temp.setting('comp')),
  'Asia Cup',
  '/admin shows the tag in use'
);

-- A question a host edited is no longer linked and keeps its tag.
update public.predictions set fixture_question_id = null
where id = (select p.id from public.predictions p where p.room_id = pg_temp.setting('room_id') order by p.created_at limit 1);
select public.admin_set_competition_tag(pg_temp.setting('comp'), null);
select is(pg_temp.room_tags(), 'Asia Cup,Cricket', 'clearing the tag goes back to the default, except on an unlinked question');

-- New questions get the tag in use.
select public.admin_set_competition_tag(pg_temp.setting('comp'), 'Asia Cup');
select is(
  (select private.competition_tag(c.tag, c.name, c.sport) from catalog.competitions c where c.id = pg_temp.setting('comp')),
  'Asia Cup',
  'questions added from now on get Asia Cup'
);


-- ------------------------------------------------------------
-- 3. The match result next to a question
-- ------------------------------------------------------------
select set_config('test.question', (
  select p.id::text from public.predictions p
  where p.room_id = pg_temp.setting('room_id') and p.fixture_question_id is not null
  limit 1
), true);

update catalog.fixtures
set status = 'finished', round_label = 'Group A', venue = 'Colombo',
  result = '{"winner": "home", "toss_winner": "away", "toss_choice": "bowl", "innings": [{"team": "home", "runs": 182, "wickets": 6, "overs": 20}, {"team": "away", "runs": 160, "wickets": 9, "overs": 20}], "status_text": "India won by 22 runs"}'
where provider_ref = 'm1';

select pg_temp.login('alice');
select ok(public.get_prediction_match_result(pg_temp.setting('question')) is null, 'nothing shows before Crow confirms the result');

update catalog.fixtures set result_confirmed_at = now() where provider_ref = 'm1';
select is(
  public.get_prediction_match_result(pg_temp.setting('question'))->>'round',
  'Group A',
  'once confirmed, the match shows with its round'
);
select is(
  public.get_prediction_match_result(pg_temp.setting('question'))->>'home_name',
  'India',
  'and the full team names'
);

-- Bob isn't in the room, so he can't read it.
select pg_temp.login('bob');
select ok(public.get_prediction_match_result(pg_temp.setting('question')) is null, 'someone outside the room sees nothing');


-- ------------------------------------------------------------
-- 4. Archiving a competition
-- ------------------------------------------------------------
select pg_temp.login('alice');
select throws_ok(
  format('select public.admin_set_competition_archived(%L::uuid, true)', pg_temp.setting('comp')),
  'P0012', null,
  'only platform admins archive competitions'
);

select pg_temp.login('bob');
select public.admin_set_competition_archived(pg_temp.setting('comp'), true);
select is(
  (select active::text || ' ' || (archived_at is not null)::text from catalog.competitions where id = pg_temp.setting('comp')),
  'false true',
  'archiving files it away and switches it off'
);
select ok(
  (
    select max(n) filter (where (c->>'id')::uuid = pg_temp.setting('comp'))
      > max(n) filter (where c->>'archived_at' is null and (c->>'ends_on' is null or (c->>'ends_on')::date >= current_date))
    from json_array_elements(public.admin_get_competitions()) with ordinality as x(c, n)
  ),
  'archived ones come after every current one in /admin'
);
select public.admin_set_competition_active(pg_temp.setting('comp'), true);
select is(
  (select active::text || ' ' || (archived_at is not null)::text from catalog.competitions where id = pg_temp.setting('comp')),
  'true false',
  'turning it back on takes it out of the archive'
);

select * from finish();
rollback;
