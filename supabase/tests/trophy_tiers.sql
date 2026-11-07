begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- ------------------------------------------------------------
-- 1. Series tier: the size of a finished series
-- ------------------------------------------------------------
select is(private.series_tier(7, 10), 'minor', 'seven games is a minor series');
select is(private.series_tier(8, 3), 'standard', 'eight games and three players is standard');
select is(private.series_tier(30, 2), 'minor', 'two players is a minor series, however long');
select is(private.series_tier(19, 10), 'standard', 'nineteen games is not yet major');
select is(private.series_tier(20, 4), 'standard', 'a major series needs five players');
select is(private.series_tier(20, 5), 'major', 'twenty games and five players is major');
select is(private.series_tier(null, null), 'minor', 'no data counts as minor');

-- ------------------------------------------------------------
-- 2. Award tier: how impressive an award was in its series
-- ------------------------------------------------------------
select is(private.series_award_tier('LONGEST_STREAK', 5, 20, 1000), 'gold', 'a streak over a quarter of the series is gold');
select is(private.series_award_tier('LONGEST_STREAK', 3, 4, 1000), 'silver', 'gold streaks need at least four wins');
select is(private.series_award_tier('LONGEST_STREAK', 2, 4, 1000), 'bronze', 'a two-win streak is bronze');
select is(private.series_award_tier('BIGGEST_PROFIT', 1000, 20, 1000), 'gold', 'doubling the stack in one bet is gold');
select is(private.series_award_tier('BIGGEST_PROFIT', 499, 20, 1000), 'bronze', 'under half the stack is bronze');
select is(private.series_award_tier('MOST_POINTS_RISKED', 2000, 20, 1000), 'silver', 'risking twice the stack is silver');
select is(private.series_award_tier('EVER_PRESENT', 10, 10, 1000), 'silver', 'ten games ever-present is silver');
select ok(
  not ('MOST_DUEL_WINS' = any(enum_range(null::public.series_award_type)::text[])),
  'the duel trophy is gone'
);

-- ------------------------------------------------------------
-- 3. Completing a series records its size and tiers
-- ------------------------------------------------------------
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

create function pg_temp.option_id(p_prediction text, p_label text)
returns uuid
language sql
as $$
  select id from public.prediction_options
  where prediction_id = pg_temp.setting(p_prediction) and label = p_label
$$;

-- Alice runs a two-game cup (one bet to rank) with Bob; Carol joins but never bets.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Alice room')->>'id'), true);
reset role;

select set_config('test.room_code', (select room_code from public.rooms where id = pg_temp.setting('room_id')), true);

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select public.register_player('bob');
select public.join_room(current_setting('test.room_code'));
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000ca01');
set local role authenticated;
select public.register_player('carol');
select public.join_room(current_setting('test.room_code'));
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select set_config('test.cup', (public.create_series(pg_temp.setting('room_id'), 'Cup', null, 0, 1000, 100, 1)->>'id'), true);
select set_config(
  'test.g1',
  (public.create_prediction(pg_temp.setting('room_id'), 'Game 1', array['Home', 'Away'], now() + interval '1 day', pg_temp.setting('cup'))->>'prediction_id'),
  true
);
select set_config(
  'test.g2',
  (public.create_prediction(pg_temp.setting('room_id'), 'Game 2', array['Home', 'Away'], now() + interval '1 day', pg_temp.setting('cup'))->>'prediction_id'),
  true
);
select public.place_bet(pg_temp.setting('g1'), pg_temp.option_id('g1', 'Home'), 300);
select public.place_bet(pg_temp.setting('g2'), pg_temp.option_id('g2', 'Home'), 300);
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select public.place_bet(pg_temp.setting('g1'), pg_temp.option_id('g1', 'Away'), 200);
select public.place_bet(pg_temp.setting('g2'), pg_temp.option_id('g2', 'Away'), 200);
reset role;

update public.predictions set status = 'locked' where id in (pg_temp.setting('g1'), pg_temp.setting('g2'));

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.resolve_prediction_v2(pg_temp.setting('g1'), pg_temp.setting('room_id'), 'win', pg_temp.option_id('g1', 'Home'));
-- Each resolve is its own transaction in the app; clear its scratch table here.
reset role;
drop table if exists _winner_gains;
set local role authenticated;
select public.resolve_prediction_v2(pg_temp.setting('g2'), pg_temp.setting('room_id'), 'win', pg_temp.option_id('g2', 'Home'));
select public.complete_series(pg_temp.setting('cup'));
reset role;

select is((select final_games from public.series where id = pg_temp.setting('cup')), 2, 'completion records the settled games');
select is((select final_players from public.series where id = pg_temp.setting('cup')), 2, 'completion counts only players who qualified');
select is((select tier from public.series where id = pg_temp.setting('cup')), 'minor', 'a two-game cup is a minor series');
select ok(
  (select count(*) > 0 and count(*) = count(tier) from public.series_awards where series_id = pg_temp.setting('cup')),
  'every award gets a tier'
);
select is(
  (select tier from public.series_awards where series_id = pg_temp.setting('cup') and award_type = 'LONGEST_STREAK'),
  'bronze',
  'a two-win streak is a bronze award'
);

-- Members can read the new columns.
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select is(
  (select s.tier || '/' || sa.tier
   from public.series_awards sa
   join public.series s on s.id = sa.series_id
   where sa.series_id = pg_temp.setting('cup') and sa.award_type = 'LONGEST_STREAK'),
  'minor/bronze',
  'members can read series and award tiers'
);
select throws_ok(
  format($$ update public.series_awards set tier = 'gold' where series_id = %L $$, pg_temp.setting('cup')),
  null, null,
  'award tiers cannot be changed'
);
reset role;

select * from finish();
rollback;
