begin;

create extension if not exists pgtap with schema extensions;

select plan(45);

-- ------------------------------------------------------------
-- Fixtures: Alice organizes a room with Bob. Carol joins later.
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

create function pg_temp.wallet(p_series text, p_username text)
returns public.series_wallets
language sql
as $$
  select w.*
  from public.series_wallets w
  join public.players p on p.id = w.player_id
  where w.series_id = pg_temp.setting(p_series)
    and p.username = p_username
$$;

create function pg_temp.option_id(p_prediction text, p_label text)
returns uuid
language sql
as $$
  select id from public.prediction_options
  where prediction_id = pg_temp.setting(p_prediction) and label = p_label
$$;

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
reset role;

-- ------------------------------------------------------------
-- 1. Starting a series gives every member the same stack
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;

select throws_ok(
  format($$ select public.create_prediction(%L, 'No series', array['A', 'B'], now() + interval '1 day') $$, pg_temp.setting('room_id')),
  'P0001', 'Predictions must belong to an active series',
  'a prediction needs a series'
);

select set_config('test.cup', (public.create_series(pg_temp.setting('room_id'), 'World Cup')->>'id'), true);
select set_config('test.oscars', (public.create_series(pg_temp.setting('room_id'), 'Oscars', null, 0, 500, 50)->>'id'), true);
reset role;

select is((pg_temp.wallet('cup', 'alice')).balance, 1000, 'the organizer gets the default 1000 stack');
select is((pg_temp.wallet('cup', 'bob')).balance, 1000, 'every member gets the same stack');
select is((pg_temp.wallet('oscars', 'bob')).balance, 500, 'a series can set its own stack');
select is((pg_temp.wallet('cup', 'bob')).granted, 1000, 'granted starts at the stack');

-- ------------------------------------------------------------
-- 2. Points settings can change only before the first bet
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.update_series(pg_temp.setting('oscars'), 'Oscars', null, 0, 800, 50);
reset role;

select is((pg_temp.wallet('oscars', 'bob')).balance, 800, 'changing the stack before any bets reissues wallets');

-- ------------------------------------------------------------
-- 3. Bets move only their own series wallet
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select set_config(
  'test.final',
  (public.create_prediction(pg_temp.setting('room_id'), 'Who wins the final?', array['Brazil', 'France'], now() + interval '1 day', pg_temp.setting('cup'))->>'prediction_id'),
  true
);
select set_config(
  'test.best_picture',
  (public.create_prediction(pg_temp.setting('room_id'), 'Best picture?', array['Film A', 'Film B'], now() + interval '1 day', pg_temp.setting('oscars'))->>'prediction_id'),
  true
);
select public.place_bet(pg_temp.setting('final'), pg_temp.option_id('final', 'France'), 300);
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select public.place_bet(pg_temp.setting('final'), pg_temp.option_id('final', 'Brazil'), 200);
select is(
  (public.place_bet(pg_temp.setting('best_picture'), pg_temp.option_id('best_picture', 'Film A'), 800)->>'points_available')::int,
  0,
  'a bet reports what is left in that series'
);
select throws_ok(
  format($$ select public.place_bet(%L, %L, 1001) $$, pg_temp.setting('final'), pg_temp.option_id('final', 'Brazil')),
  'P0009', null,
  'a bet cannot exceed the series wallet'
);
select is(
  (select count(*)::int from json_array_elements(public.get_my_series_wallets(pg_temp.setting('room_id')))),
  2,
  'a player sees one wallet per series'
);
reset role;

select is((pg_temp.wallet('cup', 'bob')).escrow, 200, 'the World Cup bet is held in the World Cup wallet');
select is((pg_temp.wallet('oscars', 'bob')).escrow, 800, 'the Oscars bet is held in the Oscars wallet');
select is((pg_temp.wallet('cup', 'bob')).balance, 1000, 'holding a bet does not change the balance');

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select throws_ok(
  format($$ select public.update_series(%L, 'World Cup', null, 0, 2000, 100) $$, pg_temp.setting('cup')),
  'P0001', null,
  'points settings are locked once a series has bets'
);
reset role;

-- ------------------------------------------------------------
-- 4. Resolving pays out into the series wallet; refunds release it
-- ------------------------------------------------------------
update public.predictions set status = 'locked' where id in (pg_temp.setting('final'), pg_temp.setting('best_picture'));

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.resolve_prediction_v2(pg_temp.setting('final'), pg_temp.setting('room_id'), 'win', pg_temp.option_id('final', 'France'));
select public.resolve_prediction_v2(pg_temp.setting('best_picture'), pg_temp.setting('room_id'), 'cancel');
reset role;

select is((pg_temp.wallet('cup', 'alice')).balance, 1200, 'the winner is paid in the series wallet');
select is((pg_temp.wallet('cup', 'bob')).balance, 800, 'the loser pays from the series wallet');
select is((pg_temp.wallet('cup', 'alice')).escrow + (pg_temp.wallet('cup', 'bob')).escrow, 0, 'resolving releases all escrow');
select is((pg_temp.wallet('oscars', 'bob')).balance, 800, 'a cancelled prediction refunds in full');
select is((pg_temp.wallet('oscars', 'bob')).escrow, 0, 'a cancelled prediction releases escrow');

-- ------------------------------------------------------------
-- 5. Weekly top-ups go to players who bet last week, or are broke
-- ------------------------------------------------------------
select is(private.pay_series_topups(), 0, 'no top-up in the week a series starts');

update public.series set last_topup_week = '2000-W01' where id in (pg_temp.setting('cup'), pg_temp.setting('oscars'));
-- Bob's bets were last week; Alice's World Cup bet is from this week.
update public.bets set placed_at = now() - interval '7 days', updated_at = now() - interval '7 days'
where player_id = (select id from public.players where username = 'bob');
-- Alice has nothing left to bet with in the Oscars.
update public.series_wallets set balance = 0
where series_id = pg_temp.setting('oscars') and player_id = (select id from public.players where username = 'alice');

select is(private.pay_series_topups(), 2, 'each active series gets its top-up');
select is(private.pay_series_topups(), 0, 'a top-up is paid only once per week');
select is((pg_temp.wallet('cup', 'bob')).balance, 900, 'a player who bet last week gets the top-up');
select is((pg_temp.wallet('cup', 'bob')).granted, 1100, 'the top-up counts as granted, not profit');
select is((pg_temp.wallet('cup', 'alice')).balance, 1200, 'a player who did not bet last week gets no top-up');
select is((pg_temp.wallet('oscars', 'bob')).balance, 850, 'each series pays its own top-up amount');
select is((pg_temp.wallet('oscars', 'alice')).balance, 50, 'a broke player still gets the top-up');

-- ------------------------------------------------------------
-- 6. Late joiners catch up, but never past a player who skipped weeks
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000ca01');
set local role authenticated;
select public.join_room(current_setting('test.room_code'));
reset role;

select is((pg_temp.wallet('cup', 'carol')).balance, 1000, 'a late joiner matches the active player granted the least (Alice missed a top-up)');

-- Carol never bets but sits on the top balance, with no profit.
update public.series_wallets set balance = 1500, granted = 1500
where series_id = pg_temp.setting('cup') and player_id = (select id from public.players where username = 'carol');

-- ------------------------------------------------------------
-- 7. Standings and the series result
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select is(
  array(
    select e->>'username' || ':' || coalesce(e->>'rank', '-')
    from json_array_elements(public.get_series_leaderboard(pg_temp.setting('room_id'), pg_temp.setting('cup'), 'points')) e
  ),
  array['alice:1', 'bob:2', 'carol:-'],
  'ranked players come by balance, then the unranked'
);
select is(
  (
    select (e->>'balance')::int
    from json_array_elements(public.get_series_leaderboard(pg_temp.setting('room_id'), pg_temp.setting('cup'), 'points')) e
    where e->>'username' = 'alice'
  ),
  1200,
  'standings show the balance'
);
select is(
  (
    select (e->>'is_ranked') || '/' || (e->>'bets_needed') || '/' || (e->>'required_bets')
    from json_array_elements(public.get_series_leaderboard(pg_temp.setting('room_id'), pg_temp.setting('cup'), 'points')) e
    where e->>'username' = 'carol'
  ),
  'false/1/1',
  'a player who has not bet is not ranked, and the bar is capped at what has settled'
);
select is(
  (
    select count(*)::int
    from json_array_elements(public.get_series_leaderboard(pg_temp.setting('room_id'), pg_temp.setting('oscars'), 'points')) e
    where (e->>'is_ranked')::boolean
  ),
  3,
  'with nothing settled yet, everyone is ranked'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select throws_ok(
  format($$ select public.update_series(%L, 'World Cup', null, 0, null, null, 51) $$, pg_temp.setting('cup')),
  'P0001', null,
  'the ranking bar has limits'
);
select public.update_series(pg_temp.setting('cup'), 'World Cup', null, 0, null, null, 0);
select is(
  (
    select e->>'rank'
    from json_array_elements(public.get_series_leaderboard(pg_temp.setting('room_id'), pg_temp.setting('cup'), 'points')) e
    where e->>'username' = 'carol'
  ),
  '1',
  'the ranking bar can change while a series runs, and 0 ranks everyone'
);
select public.update_series(pg_temp.setting('cup'), 'World Cup', null, 0, null, null, 3);
select is(
  (public.create_series(pg_temp.setting('room_id'), 'Euros', null, 0, 1000, 100, 5)->>'min_bets_to_rank')::int,
  5,
  'a new series can set its ranking bar'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.complete_series(pg_temp.setting('cup'));
reset role;

select is(
  (select p.username::text from public.series_placements sp join public.players p on p.id = sp.player_id where sp.series_id = pg_temp.setting('cup') and sp.placement = 1),
  'alice',
  'the top ranked balance wins the series'
);
select is(
  (select count(*)::int from public.series_placements sp where sp.series_id = pg_temp.setting('cup')),
  2,
  'unranked players cannot place'
);
select is(
  (select sp.points from public.series_placements sp join public.players p on p.id = sp.player_id where sp.series_id = pg_temp.setting('cup') and p.username = 'alice'),
  200::numeric,
  'placements record net profit'
);

update public.series set last_topup_week = '2000-W02' where id in (pg_temp.setting('cup'), pg_temp.setting('oscars'));
select is(private.pay_series_topups(), 1, 'closed series get no more top-ups');
select is((pg_temp.wallet('cup', 'bob')).balance, 900, 'a closed series wallet is frozen');

-- ------------------------------------------------------------
-- 8. Standings across all series and History stakes
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select is(
  array(
    select e->>'username'
    from json_array_elements(public.get_room_overall_standings(pg_temp.setting('room_id'))) e
    order by (e->>'rank')::int, e->>'username'
  ),
  array['alice', 'carol', 'bob'],
  'overall standings rank by profit summed across series'
);
select is(
  (
    select (e->>'titles')::int
    from json_array_elements(public.get_room_overall_standings(pg_temp.setting('room_id'))) e
    where e->>'username' = 'alice'
  ),
  1,
  'overall standings count titles'
);
select is(
  (
    select (e->>'my_bet_amount')::int || '/' || (e->>'my_payout')::int
    from json_array_elements(public.get_room_prediction_history(pg_temp.setting('room_id'), 10, null, null, null, 'all', null)->'items') e
    where e->>'title' = 'Who wins the final?'
  ),
  '200/0',
  'history shows the caller''s own stake and payout'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000ca01');
set local role authenticated;
select is(
  (select count(*)::int from json_array_elements(public.get_room_overall_standings(pg_temp.setting('room_id')))),
  3,
  'a late joiner appears in overall standings'
);
reset role;

-- ------------------------------------------------------------
-- 9. Retired features stay off
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select throws_ok($$ select public.claim_weekly_points(false) $$, '42501', null, 'weekly claims are retired');
select hasnt_function('public', 'create_duel_view', 'duels are retired');
reset role;

select * from finish();
rollback;
