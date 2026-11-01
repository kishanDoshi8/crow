begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000ca01', 'authenticated', 'authenticated', 'carol@example.com');

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

-- One game in a series: Alice backs Home, Bob backs Away, then the winner is revealed.
create function pg_temp.play(p_series text, p_winner text)
returns uuid
language plpgsql
as $$
declare
  v_prediction uuid;
begin
  perform pg_temp.login('00000000-0000-0000-0000-00000000a11c');
  v_prediction := (public.create_prediction(pg_temp.setting('room_id'), 'Game', array['Home', 'Away'], now() + interval '1 day', pg_temp.setting(p_series))->>'prediction_id')::uuid;
  perform public.place_bet(v_prediction, (select id from public.prediction_options where prediction_id = v_prediction and label = 'Home'), 10);
  perform pg_temp.login('00000000-0000-0000-0000-000000000b0b');
  perform public.place_bet(v_prediction, (select id from public.prediction_options where prediction_id = v_prediction and label = 'Away'), 10);
  update public.predictions set status = 'locked' where id = v_prediction;
  perform pg_temp.login('00000000-0000-0000-0000-00000000a11c');
  perform public.resolve_prediction_v2(v_prediction, pg_temp.setting('room_id'), 'win', (select id from public.prediction_options where prediction_id = v_prediction and label = p_winner));
  drop table if exists _winner_gains;
  return v_prediction;
end;
$$;

create function pg_temp.streak(p_series text, p_username text)
returns int
language plpgsql
as $$
declare v json;
begin
  perform pg_temp.login('00000000-0000-0000-0000-00000000a11c');
  set local role authenticated;
  v := public.get_series_leaderboard(pg_temp.setting('room_id'), pg_temp.setting(p_series));
  reset role;
  return (select (e->>'current_streak')::int from json_array_elements(v) e where e->>'username' = p_username);
end;
$$;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Alice room')->>'id'), true);
select set_config('test.room_code', (select room_code from public.rooms where id = pg_temp.setting('room_id')), true);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.register_player('bob');
select public.join_room(current_setting('test.room_code'));
select pg_temp.login('00000000-0000-0000-0000-00000000ca01');
select public.register_player('carol');
select public.join_room(current_setting('test.room_code'));

-- ------------------------------------------------------------
-- Streaks count one series at a time
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select set_config('test.cup', (public.create_series(pg_temp.setting('room_id'), 'Cup', null, 0, 1000, 100, 1)->>'id'), true);
select pg_temp.play('cup', 'Away');
select pg_temp.play('cup', 'Home');
select pg_temp.play('cup', 'Home');
select pg_temp.play('cup', 'Home');
select is(pg_temp.streak('cup', 'alice'), 3, 'a streak counts wins since the last loss');
select is(pg_temp.streak('cup', 'bob'), 0, 'a loss resets the streak');

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select set_config('test.league', (public.create_series(pg_temp.setting('room_id'), 'League', null, 0, 1000, 100, 1)->>'id'), true);
select is(pg_temp.streak('league', 'alice'), 0, 'a new series starts every streak at zero');
select pg_temp.play('league', 'Away');
select is(pg_temp.streak('league', 'bob'), 1, 'and counts only its own games');
select is(pg_temp.streak('cup', 'alice'), 3, 'the old series keeps its own streak');

-- ------------------------------------------------------------
-- Room rank follows net profit, not points held
-- ------------------------------------------------------------
-- Carol never bets but holds a big balance.
update public.series_wallets set balance = 5000, granted = 5000
where player_id = (select id from public.players where username = 'carol');
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select is(
  (select e->>'username' from json_array_elements(public.get_room_overall_standings(pg_temp.setting('room_id'))) e where (e->>'rank')::int = 1),
  'alice',
  'room rank is by net profit, so unspent points do not count'
);
reset role;

-- ------------------------------------------------------------
-- Description and tags
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select set_config('test.final', (public.create_prediction(pg_temp.setting('room_id'), 'Final', array['India', 'Australia'], now() + interval '1 day', pg_temp.setting('league'))->>'prediction_id'), true);
set local role authenticated;
select public.set_prediction_details(pg_temp.setting('final'), '  Winner after super over if tied.  ', array['T20', ' semi  Final ', 't20', '']);
reset role;

select is(
  (select description from public.predictions where id = pg_temp.setting('final')),
  'Winner after super over if tied.',
  'the description is saved, trimmed'
);
select is(
  array(select tag from public.prediction_tags where prediction_id = pg_temp.setting('final') order by tag),
  array['T20', 'semi Final'],
  'tags keep their case, and repeats in any case are dropped'
);

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select throws_ok(
  format($$ select public.set_prediction_details(%L, 'x', array[]::text[]) $$, pg_temp.setting('final')),
  'P0012', null,
  'only organizers can change details'
);
select is(
  (public.get_room_tags(pg_temp.setting('room_id')))::text,
  '["semi Final", "T20"]',
  'members get the room''s tags as suggestions'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select throws_ok(
  format($$ select public.set_prediction_details(%L, null, array['a','b','c','d','e','f']) $$, pg_temp.setting('final')),
  'P0001', null,
  'up to five tags'
);
reset role;

select * from finish();
rollback;
