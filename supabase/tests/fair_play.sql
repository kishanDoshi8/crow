begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000ca01', 'authenticated', 'authenticated', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000da7e', 'authenticated', 'authenticated', 'dave@example.com');

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

create function pg_temp.player(p_username text)
returns uuid
language sql
as $$ select id from public.players where username = p_username $$;

create function pg_temp.user_id(p_username text)
returns uuid
language sql
as $$ select user_id from public.players where username = p_username $$;

create function pg_temp.option(p_prediction uuid, p_label text)
returns uuid
language sql
as $$ select id from public.prediction_options where prediction_id = p_prediction and label = p_label $$;

create function pg_temp.bet(p_username text, p_prediction uuid, p_label text, p_amount int)
returns void
language plpgsql
as $$
begin
  perform pg_temp.login(pg_temp.user_id(p_username));
  perform public.place_bet(p_prediction, pg_temp.option(p_prediction, p_label), p_amount);
end;
$$;

create function pg_temp.new_prediction(p_series text, p_title text)
returns uuid
language plpgsql
as $$
begin
  perform pg_temp.login('00000000-0000-0000-0000-00000000a11c');
  return (public.create_prediction(pg_temp.setting('room_id'), p_title, array['Home', 'Away'], now() + interval '1 day', pg_temp.setting(p_series))->>'prediction_id')::uuid;
end;
$$;

create function pg_temp.resolve(p_username text, p_prediction uuid, p_label text)
returns json
language plpgsql
as $$
declare
  v_result json;
begin
  update public.predictions set status = 'locked' where id = p_prediction and status = 'draft';
  perform pg_temp.login(pg_temp.user_id(p_username));
  v_result := public.resolve_prediction_v2(p_prediction, pg_temp.setting('room_id'), 'win', pg_temp.option(p_prediction, p_label));
  -- now() is fixed within the test's transaction; keep results in order.
  update public.predictions set resolved_at = clock_timestamp() where id = p_prediction;
  return v_result;
end;
$$;

create function pg_temp.correct(p_username text, p_prediction uuid, p_outcome text, p_label text default null)
returns json
language plpgsql
as $$
begin
  perform pg_temp.login(pg_temp.user_id(p_username));
  return public.correct_prediction_result(
    p_prediction,
    pg_temp.setting('room_id'),
    p_outcome,
    case when p_label is null then null else pg_temp.option(p_prediction, p_label) end
  );
end;
$$;

-- Each player's wallet, winnings, rating and streaks in one row.
create function pg_temp.state(p_series text)
returns table (username text, balance int, escrow int, total_won_in_room int, rating int, rated int, current_streak int, highest_streak int)
language sql
as $$
  select p.username, w.balance, w.escrow, rm.total_won_in_room, rm.prediction_rating, rm.rated_predictions_count, rm.current_streak, rm.highest_streak
  from public.room_members rm
  join public.players p on p.id = rm.player_id
  join public.series_wallets w on w.player_id = rm.player_id and w.series_id = pg_temp.setting(p_series)
  where rm.room_id = pg_temp.setting('room_id')
$$;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Fair room')->>'id'), true);
select set_config('test.room_code', (select room_code from public.rooms where id = pg_temp.setting('room_id')), true);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.register_player('bob');
select public.join_room(current_setting('test.room_code'));
select pg_temp.login('00000000-0000-0000-0000-00000000ca01');
select public.register_player('carol');
select public.join_room(current_setting('test.room_code'));
select pg_temp.login('00000000-0000-0000-0000-00000000da7e');
select public.register_player('dave');
select public.join_room(current_setting('test.room_code'));

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.set_member_role(pg_temp.setting('room_id'), pg_temp.player('dave'), 'resolver');
select set_config('test.cup', (public.create_series(pg_temp.setting('room_id'), 'Cup', null, 0, 1000, 100, 0)->>'id'), true);

-- ------------------------------------------------------------
-- 1. Picks are final at the deadline
-- ------------------------------------------------------------
select set_config('test.late', pg_temp.new_prediction('cup', 'Late')::text, true);
select pg_temp.bet('bob', pg_temp.setting('late'), 'Home', 10);
-- The deadline passes before the lock job runs.
update public.predictions set deadline = now() - interval '1 minute' where id = pg_temp.setting('late');
select pg_temp.login(pg_temp.user_id('bob'));
select throws_ok(
  format($$ select public.cancel_bet(%L) $$, pg_temp.setting('late')),
  'P0007', 'Betting deadline has passed',
  'a bet can''t be cancelled after the deadline'
);
update public.predictions set deadline = now() + interval '1 day' where id = pg_temp.setting('late');
select lives_ok(
  format($$ select public.cancel_bet(%L) $$, pg_temp.setting('late')),
  'a bet can still be cancelled before the deadline'
);
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.resolve_prediction_v2(pg_temp.setting('late'), pg_temp.setting('room_id'), 'cancel');

-- ------------------------------------------------------------
-- 4. Payouts are whole points and nothing is lost to rounding
-- ------------------------------------------------------------
select set_config('test.split', pg_temp.new_prediction('cup', 'Split')::text, true);
select pg_temp.bet('alice', pg_temp.setting('split'), 'Home', 1);
select pg_temp.bet('bob', pg_temp.setting('split'), 'Home', 1);
select pg_temp.bet('carol', pg_temp.setting('split'), 'Home', 1);
select pg_temp.bet('dave', pg_temp.setting('split'), 'Away', 2);
select pg_temp.resolve('dave', pg_temp.setting('split'), 'Home');

select is(
  (select sum(payout)::int from public.bets where prediction_id = pg_temp.setting('split')),
  5,
  'payouts add up to the stakes: no points vanish'
);
select is(
  (select array_agg(payout order by payout desc) from public.bets where prediction_id = pg_temp.setting('split') and option_id = pg_temp.option(pg_temp.setting('split'), 'Home')),
  array[2, 2, 1],
  'the 2 points lost are shared as whole points: two winners get +1 each'
);
select is(
  (select payout from public.bets where prediction_id = pg_temp.setting('split') and player_id = pg_temp.player('dave')),
  0,
  'the loser loses the stake'
);
select is(
  (select sum(balance)::int from public.series_wallets where series_id = pg_temp.setting('cup')),
  4000,
  'the series holds exactly the points it started with'
);

-- A losing stake bigger than all winning stakes refunds the rest.
select set_config('test.whale', pg_temp.new_prediction('cup', 'Whale')::text, true);
select pg_temp.bet('alice', pg_temp.setting('whale'), 'Home', 3);
select pg_temp.bet('bob', pg_temp.setting('whale'), 'Home', 4);
select pg_temp.bet('carol', pg_temp.setting('whale'), 'Away', 10);
select pg_temp.bet('dave', pg_temp.setting('whale'), 'Away', 5);
select pg_temp.resolve('dave', pg_temp.setting('whale'), 'Home');
select is(
  (select array_agg(payout order by amount) from public.bets where prediction_id = pg_temp.setting('whale')),
  array[8, 11, 0, 3],
  'the pot of 12 (7 of carol''s 10, all of dave''s 5) is shared 5 and 7 by stake; carol gets 3 back'
);

-- ------------------------------------------------------------
-- 2. Organizers correct a wrong result
-- ------------------------------------------------------------
select set_config('test.game', pg_temp.new_prediction('cup', 'Game')::text, true);
select pg_temp.bet('alice', pg_temp.setting('game'), 'Home', 100);
select pg_temp.bet('bob', pg_temp.setting('game'), 'Away', 50);
select pg_temp.bet('carol', pg_temp.setting('game'), 'Away', 50);

-- How things stood before the result.
create temp table before_game as select * from pg_temp.state('cup');

-- Dave reveals the wrong winner.
select pg_temp.resolve('dave', pg_temp.setting('game'), 'Home');
select is(
  (select s.balance - b.balance from pg_temp.state('cup') s join before_game b using (username) where username = 'alice'),
  100,
  'the wrong result paid alice'
);

select throws_ok(
  format($$ select pg_temp.correct('dave', %L, 'win', 'Away') $$, pg_temp.setting('game')),
  'P0012', 'Only organizers can correct a result',
  'resolvers can''t correct results'
);
select throws_ok(
  format($$ select pg_temp.correct('alice', %L, 'win', 'Home') $$, pg_temp.setting('game')),
  'P0001', 'That''s already the result',
  'correcting to the same result is refused'
);

select lives_ok(
  format($$ select pg_temp.correct('alice', %L, 'win', 'Away') $$, pg_temp.setting('game')),
  'an organizer corrects the winner'
);

select is(
  (select array_agg(s.balance - b.balance order by username) from pg_temp.state('cup') s join before_game b using (username)),
  array[-100, 50, 50, 0],
  'wallets end as if Away had won first'
);
select is(
  (select array_agg(s.escrow - b.escrow order by username) from pg_temp.state('cup') s join before_game b using (username)),
  array[-100, -50, -50, 0],
  'stakes are released once'
);
select is(
  (select array_agg(s.total_won_in_room - b.total_won_in_room order by username) from pg_temp.state('cup') s join before_game b using (username)),
  array[0, 50, 50, 0],
  'room winnings follow the corrected result'
);
select is(
  (select array_agg(payout order by amount desc, player_id) from public.bets where prediction_id = pg_temp.setting('game')),
  (select array_agg(x order by o) from (values (0, 1), (100, 2), (100, 3)) v(x, o)),
  'payouts are rewritten'
);
select is(
  (select array_agg(s.rated - b.rated order by username) from pg_temp.state('cup') s join before_game b using (username)),
  array[1, 1, 1, 0],
  'each bettor counts the prediction once in their rating'
);
select ok(
  (select bool_and(case when s.username = 'alice' then s.rating < b.rating else s.rating > b.rating end)
   from pg_temp.state('cup') s join before_game b using (username)
   where s.username in ('alice', 'bob', 'carol')),
  'ratings move as if Away won: alice down, bob and carol up'
);
select is(
  (select array_agg(array[current_streak, highest_streak] order by username) from pg_temp.state('cup')),
  array[array[0, 2], array[3, 3], array[1, 1], array[0, 0]],
  'room streaks are recounted: alice W W L, bob W W W, carol W L W'
);
select is(
  (select array[status, corrected_by::text] from public.predictions where id = pg_temp.setting('game')),
  array['revealed', pg_temp.player('alice')::text],
  'the prediction shows the new result and who corrected it'
);
select is(
  (select metadata->>'previousWinningOptionLabel' from public.room_activities
   where room_id = pg_temp.setting('room_id') and activity_type = 'prediction_corrected'),
  'Home',
  'the room feed says what the result was before'
);

-- Correcting to no result hands every stake back.
select lives_ok(
  format($$ select pg_temp.correct('alice', %L, 'no_result') $$, pg_temp.setting('game')),
  'a revealed result can be corrected to no result'
);
select is(
  (select array_agg(array[s.balance - b.balance, s.total_won_in_room - b.total_won_in_room, s.rating - b.rating, s.rated - b.rated] order by username)
   from pg_temp.state('cup') s join before_game b using (username)),
  array[array[0, 0, 0, 0], array[0, 0, 0, 0], array[0, 0, 0, 0], array[0, 0, 0, 0]],
  'no result puts points, winnings and ratings back where they were'
);
select is(
  (select status from public.predictions where id = pg_temp.setting('game')),
  'no_result',
  'the prediction is now no result'
);

-- And back to a winner.
select lives_ok(
  format($$ select pg_temp.correct('alice', %L, 'win', 'Away') $$, pg_temp.setting('game')),
  'no result can be corrected to a winner'
);
select is(
  (select array_agg(s.balance - b.balance order by username) from pg_temp.state('cup') s join before_game b using (username)),
  array[-100, 50, 50, 0],
  'and pays out as a first result would'
);
select is(
  (select sum(balance)::int from public.series_wallets where series_id = pg_temp.setting('cup')),
  4000,
  'corrections never create or destroy points'
);

-- Bob stakes his winnings, so they can't be taken back.
select set_config('test.next', pg_temp.new_prediction('cup', 'Next')::text, true);
select pg_temp.bet('bob', pg_temp.setting('next'), 'Home', (select balance - escrow from public.series_wallets where series_id = pg_temp.setting('cup') and player_id = pg_temp.player('bob')));
select throws_ok(
  format($$ select pg_temp.correct('alice', %L, 'win', 'Home') $$, pg_temp.setting('game')),
  'P0013', null,
  'a correction can''t take points a player has staked since'
);
select pg_temp.login(pg_temp.user_id('bob'));
select public.cancel_bet(pg_temp.setting('next'));
select lives_ok(
  format($$ select pg_temp.correct('alice', %L, 'win', 'Home') $$, pg_temp.setting('game')),
  'once the bet is cancelled the correction goes through'
);

update public.predictions set ratings_reversible = false where id = pg_temp.setting('game');
select throws_ok(
  format($$ select pg_temp.correct('alice', %L, 'win', 'Away') $$, pg_temp.setting('game')),
  'P0006', 'This result was revealed before corrections were possible',
  'results revealed before this change can''t be corrected'
);
update public.predictions set ratings_reversible = true where id = pg_temp.setting('game');

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.resolve_prediction_v2(pg_temp.setting('next'), pg_temp.setting('room_id'), 'cancel');
select throws_ok(
  format($$ select pg_temp.correct('alice', %L, 'win', 'Away') $$, pg_temp.setting('next')),
  'P0006', 'Only revealed or no-result predictions can be corrected',
  'cancelled predictions can''t be corrected'
);

-- ------------------------------------------------------------
-- 5. The longest-streak trophy matches the streaks shown all season
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select set_config('test.mini', (public.create_series(pg_temp.setting('room_id'), 'Mini', null, 0, 1000, 100, 0)->>'id'), true);
-- Alice: loss, win, win. Bob: win, loss, loss. Carol bets each time so results count.
select set_config('test.m1', pg_temp.new_prediction('mini', 'M1')::text, true);
select pg_temp.bet('alice', pg_temp.setting('m1'), 'Home', 10);
select pg_temp.bet('bob', pg_temp.setting('m1'), 'Away', 10);
select pg_temp.resolve('alice', pg_temp.setting('m1'), 'Away');
select set_config('test.m2', pg_temp.new_prediction('mini', 'M2')::text, true);
select pg_temp.bet('alice', pg_temp.setting('m2'), 'Home', 10);
select pg_temp.bet('bob', pg_temp.setting('m2'), 'Away', 10);
select pg_temp.resolve('alice', pg_temp.setting('m2'), 'Home');
select set_config('test.m3', pg_temp.new_prediction('mini', 'M3')::text, true);
select pg_temp.bet('alice', pg_temp.setting('m3'), 'Home', 10);
select pg_temp.bet('bob', pg_temp.setting('m3'), 'Away', 10);
select pg_temp.resolve('alice', pg_temp.setting('m3'), 'Home');

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.complete_series(pg_temp.setting('mini'));
select is(
  (select array_agg(value::int) from public.series_awards where series_id = pg_temp.setting('mini') and award_type = 'LONGEST_STREAK'),
  array[2],
  'a streak after a loss counts only its wins'
);
select is(
  (select player_id from public.series_awards where series_id = pg_temp.setting('mini') and award_type = 'LONGEST_STREAK'),
  pg_temp.player('alice'),
  'the trophy goes to the longest streak shown in the standings'
);
select throws_ok(
  format($$ select pg_temp.correct('alice', %L, 'win', 'Away') $$, pg_temp.setting('m3')),
  'P0006', 'Results can only be corrected while the series is running',
  'results of a finished series can''t be corrected'
);

select * from finish();
rollback;
