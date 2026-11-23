begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

-- Standings, the champion and the podium rank by net points (won minus put
-- on settled picks), not by wallet: top-ups and starting points don't count.
-- Bob has the bigger wallet from extra top-ups; Alice called better.
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

create function pg_temp.player(p_username text)
returns uuid
language sql
as $$ select id from public.players where username = p_username $$;

-- One game: each bettor backs a side, then Alice reveals the winner.
create function pg_temp.play(p_bets jsonb, p_winner text)
returns void
language plpgsql
as $$
declare
  v_prediction uuid;
  v_bettor text;
  v_bet jsonb;
begin
  perform pg_temp.login('alice');
  v_prediction := (public.create_prediction(
    pg_temp.setting('room_id'), 'Game', array['Home', 'Away'], now() + interval '1 day', pg_temp.setting('series')
  )->>'prediction_id')::uuid;
  for v_bettor, v_bet in select * from jsonb_each(p_bets) loop
    perform pg_temp.login(v_bettor);
    perform public.place_bet(
      v_prediction,
      (select id from public.prediction_options where prediction_id = v_prediction and label = v_bet->>0),
      (v_bet->>1)::int
    );
  end loop;
  update public.predictions set status = 'locked' where id = v_prediction;
  perform pg_temp.login('alice');
  perform public.resolve_prediction_v2(
    v_prediction, pg_temp.setting('room_id'), 'win',
    (select id from public.prediction_options where prediction_id = v_prediction and label = p_winner)
  );
  drop table if exists _winner_gains;
end;
$$;

select pg_temp.login('alice');
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Room')->>'id'), true);
select pg_temp.login('bob');
select public.register_player('bob');
select public.join_room((select room_code from public.rooms where id = pg_temp.setting('room_id')));

select pg_temp.login('alice');
select set_config('test.series', (public.create_series(pg_temp.setting('room_id'), 'Cup', null, 0, 1000, 100, 1)->>'id'), true);

-- Alice wins 100 off Bob; then Bob's wallet gets 500 more in top-ups.
select pg_temp.play('{"alice": ["Home", 100], "bob": ["Away", 100]}', 'Home');
update public.series_wallets
set balance = balance + 500, granted = granted + 500
where series_id = pg_temp.setting('series') and player_id = pg_temp.player('bob');

select ok(
  (select balance from public.series_wallets where series_id = pg_temp.setting('series') and player_id = pg_temp.player('bob'))
    > (select balance from public.series_wallets where series_id = pg_temp.setting('series') and player_id = pg_temp.player('alice')),
  'Bob has the bigger wallet'
);

select pg_temp.login('alice');
select is(
  (select e->>'username' from json_array_elements(public.get_series_leaderboard(pg_temp.setting('room_id'), pg_temp.setting('series'), 'points')) e where e->>'rank' = '1'),
  'alice',
  'the standings put the better caller first'
);
select is(
  (select pl.username from private.series_standings(pg_temp.setting('series')) st join public.players pl on pl.id = st.player_id where st.rank = 1),
  'alice',
  'the shared standings agree with the table'
);

select private.snapshot_one_series(pg_temp.setting('series'), '2026-W01');
select is(
  (select net_points from public.series_standing_snapshots where series_id = pg_temp.setting('series') and player_id = pg_temp.player('alice') and week_key = '2026-W01'),
  100,
  'weekly snapshots keep the net points the rank was decided on'
);

select public.complete_series(pg_temp.setting('series'));
select is(
  (select pl.username::text from public.series_placements sp join public.players pl on pl.id = sp.player_id where sp.series_id = pg_temp.setting('series') and sp.placement = 1),
  'alice',
  'and she is crowned champion'
);

select * from finish();
rollback;
