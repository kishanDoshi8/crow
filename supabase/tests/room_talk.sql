begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000e7e0', 'authenticated', 'authenticated', 'eve@example.com');

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

-- Phrase ids are looked up before switching to the member's role: members
-- can't read talk_phrases directly, only through get_prediction_talk.
create function pg_temp.phrase(p_stage text, p_text text)
returns smallint
language sql
as $$ select current_setting('test.ph_' || md5(p_stage || p_text))::smallint $$;

select set_config('test.ph_' || md5(stage || text), id::text, false) from public.talk_phrases;

create function pg_temp.option(p_label text)
returns uuid
language sql
as $$ select id from public.prediction_options where prediction_id = pg_temp.setting('pred') and label = p_label $$;

-- Alice owns the room; Bob joins; Eve is an outsider.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Talk room')->>'id'), true);
select set_config('test.room_code', (select room_code from public.rooms where id = pg_temp.setting('room_id')), true);
select set_config('test.cup', (public.create_series(pg_temp.setting('room_id'), 'Cup', null, 0, 1000, 100, 0)->>'id'), true);
select set_config('test.pred', (public.create_prediction(pg_temp.setting('room_id'), 'Game', array['Home', 'Away'], now() + interval '1 day', pg_temp.setting('cup'))->>'prediction_id'), true);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.register_player('bob');
select public.join_room(current_setting('test.room_code'));
select pg_temp.login('00000000-0000-0000-0000-00000000e7e0');
select public.register_player('eve');

-- ------------------------------------------------------------
-- Access
-- ------------------------------------------------------------
set local role authenticated;
select throws_ok(
  format($$ select public.get_prediction_talk(%L) $$, pg_temp.setting('pred')),
  'P0002', 'Prediction not found',
  'outsiders can''t read a room''s talk'
);
select throws_ok(
  format($$ select public.set_prediction_reaction(%L, 'fire') $$, pg_temp.setting('pred')),
  'P0002', 'Prediction not found',
  'outsiders can''t react'
);
reset role;

-- ------------------------------------------------------------
-- Open: phrases and reactions
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select is(
  public.get_prediction_talk(pg_temp.setting('pred'))->>'stage',
  'open',
  'an open prediction offers open phrases'
);
select is(
  json_array_length(public.get_prediction_talk(pg_temp.setting('pred'))->'phrases'),
  5,
  'all five open phrases are offered'
);

select public.set_prediction_reaction(pg_temp.setting('pred'), 'fire');
select is(public.get_prediction_talk(pg_temp.setting('pred'))->>'my_reaction', 'fire', 'a member reacts');
select public.set_prediction_reaction(pg_temp.setting('pred'), 'laugh');
select is(
  (select count(*)::int from public.prediction_reactions where prediction_id = pg_temp.setting('pred')),
  1,
  'reacting again switches instead of adding'
);
select is(public.get_prediction_talk(pg_temp.setting('pred'))->>'my_reaction', 'laugh', 'to the new reaction');
select throws_ok(
  format($$ select public.set_prediction_reaction(%L, 'crown') $$, pg_temp.setting('pred')),
  'P0001', 'Unknown reaction',
  'only the six reactions are allowed'
);

select lives_ok(
  format($$ select public.post_prediction_phrase(%L, %s::smallint) $$, pg_temp.setting('pred'), pg_temp.phrase('open', 'Easy money')),
  'a member posts a phrase'
);
select throws_ok(
  format($$ select public.post_prediction_phrase(%L, %s::smallint) $$, pg_temp.setting('pred'), pg_temp.phrase('open', 'Easy money')),
  'P0001', 'You''ve already said that one',
  'each phrase once'
);
select throws_ok(
  format($$ select public.post_prediction_phrase(%L, %s::smallint) $$, pg_temp.setting('pred'), pg_temp.phrase('result', 'Unreal')),
  'P0001', 'That phrase isn''t available now',
  'phrases from another stage are refused'
);
select public.post_prediction_phrase(pg_temp.setting('pred'), pg_temp.phrase('open', 'Bold call'));
select public.post_prediction_phrase(pg_temp.setting('pred'), pg_temp.phrase('open', 'Trust me'));
select throws_ok(
  format($$ select public.post_prediction_phrase(%L, %s::smallint) $$, pg_temp.setting('pred'), pg_temp.phrase('open', 'No chance')),
  'P0001', 'You''ve used your 3 phrases on this prediction',
  'three phrases per person per prediction'
);
select is(
  (select (public.get_prediction_talk(pg_temp.setting('pred'))->>'my_post_count')::int),
  3,
  'the caller''s count is reported'
);
select is(
  (select p->>'text' from json_array_elements(public.get_prediction_talk(pg_temp.setting('pred'))->'posts') p limit 1),
  'Trust me',
  'posts come newest first, with their text'
);
select is(
  (select count(*)::int from json_array_elements(public.get_prediction_talk(pg_temp.setting('pred'))->'phrases') p where (p->>'posted')::boolean),
  3,
  'phrases already posted are marked'
);
select is(
  (select count(*)::int from public.prediction_posts where prediction_id = pg_temp.setting('pred')),
  3,
  'members can read their room''s posts directly (for realtime)'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000e7e0');
set local role authenticated;
select is(
  (select count(*)::int from public.prediction_posts),
  0,
  'outsiders read no posts'
);
reset role;

-- ------------------------------------------------------------
-- Result: phrases for who called it
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.place_bet(pg_temp.setting('pred'), pg_temp.option('Home'), 10);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.place_bet(pg_temp.setting('pred'), pg_temp.option('Away'), 10);
update public.predictions set status = 'locked' where id = pg_temp.setting('pred');
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.resolve_prediction_v2(pg_temp.setting('pred'), pg_temp.setting('room_id'), 'win', pg_temp.option('Home'));

set local role authenticated;
select is(
  (select array_agg(p->>'text' order by ord) from json_array_elements(public.get_prediction_talk(pg_temp.setting('pred'))->'phrases') with ordinality as t(p, ord)),
  array['Called it', 'Never in doubt', 'Pay up', 'Told you so', 'Unreal', 'Well played', 'Robbed', 'Next one''s mine'],
  'the winner sees their phrases first, then everyone''s'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select is(
  (select count(*)::int from json_array_elements(public.get_prediction_talk(pg_temp.setting('pred'))->'phrases') p where p->>'audience' = 'winner'),
  0,
  'someone who missed it doesn''t get the winner phrases'
);
select throws_ok(
  format($$ select public.post_prediction_phrase(%L, %s::smallint) $$, pg_temp.setting('pred'), pg_temp.phrase('result', 'Called it')),
  'P0001', 'That phrase isn''t available now',
  'and can''t post them'
);
select is(
  (select (i->>'post_count')::int || ':' || (i->'top_reactions'->0->>'reaction')
   from json_array_elements(public.get_room_prediction_history(pg_temp.setting('room_id'))->'items') i),
  '3:laugh',
  'history cards carry the post count and top reactions'
);
reset role;

select * from finish();
rollback;
