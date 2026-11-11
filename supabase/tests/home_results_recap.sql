begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

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

create function pg_temp.player(p_username text)
returns uuid
language sql
as $$ select id from public.players where username = p_username $$;

create function pg_temp.option_id(p_prediction text, p_label text)
returns uuid
language sql
as $$
  select id from public.prediction_options
  where prediction_id = pg_temp.setting(p_prediction) and label = p_label
$$;

-- What a player's Home shows, called as that player.
create function pg_temp.results(p_user_id uuid)
returns json
language plpgsql
as $$
declare v json;
begin
  perform pg_temp.login(p_user_id);
  set local role authenticated;
  v := public.get_my_unseen_results(pg_temp.setting('room_id'), pg_temp.setting('cup'));
  reset role;
  return v;
end;
$$;

create function pg_temp.recap(p_user_id uuid)
returns json
language plpgsql
as $$
declare v json;
begin
  perform pg_temp.login(p_user_id);
  set local role authenticated;
  v := public.get_my_weekly_recap(pg_temp.setting('room_id'), pg_temp.setting('cup'));
  reset role;
  return v;
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

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select set_config('test.cup', (public.create_series(pg_temp.setting('room_id'), 'Cup', null, 0, 1000, 100, 1)->>'id'), true);
select set_config('test.g1', (public.create_prediction(pg_temp.setting('room_id'), 'Game 1', array['Home', 'Away'], now() + interval '1 day', pg_temp.setting('cup'))->>'prediction_id'), true);
select set_config('test.g2', (public.create_prediction(pg_temp.setting('room_id'), 'Game 2', array['Home', 'Away'], now() + interval '1 day', pg_temp.setting('cup'))->>'prediction_id'), true);
select set_config('test.g3', (public.create_prediction(pg_temp.setting('room_id'), 'Game 3', array['Home', 'Away'], now() + interval '1 day', pg_temp.setting('cup'))->>'prediction_id'), true);
select public.place_bet(pg_temp.setting('g1'), pg_temp.option_id('g1', 'Home'), 100);
select public.place_bet(pg_temp.setting('g2'), pg_temp.option_id('g2', 'Home'), 100);
select public.place_bet(pg_temp.setting('g3'), pg_temp.option_id('g3', 'Home'), 100);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.place_bet(pg_temp.setting('g1'), pg_temp.option_id('g1', 'Away'), 100);

update public.predictions set status = 'locked' where id in (pg_temp.setting('g1'), pg_temp.setting('g2'));
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.resolve_prediction_v2(pg_temp.setting('g1'), pg_temp.setting('room_id'), 'win', pg_temp.option_id('g1', 'Home'));
drop table if exists _winner_gains;
select public.resolve_prediction_v2(pg_temp.setting('g2'), pg_temp.setting('room_id'), 'no_result', null, 'Postponed');

-- ------------------------------------------------------------
-- Results card
-- ------------------------------------------------------------
select is(json_array_length(pg_temp.results('00000000-0000-0000-0000-00000000a11c')), 2, 'settled bets show; open ones do not');
select is(
  (select (e->>'net')::int from json_array_elements(pg_temp.results('00000000-0000-0000-0000-00000000a11c')) e where e->>'prediction_id' = current_setting('test.g1')),
  100,
  'a win shows what it made'
);
select is(json_array_length(pg_temp.results('00000000-0000-0000-0000-00000000ca01')), 0, 'no bet, no result card');

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.mark_results_seen(array[pg_temp.setting('g1')]);
reset role;
select is(json_array_length(pg_temp.results('00000000-0000-0000-0000-00000000a11c')), 1, 'a dismissed result is gone and the rest stay');
select is(json_array_length(pg_temp.results('00000000-0000-0000-0000-000000000b0b')), 1, 'dismissing is per player');

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.mark_results_seen(array[pg_temp.setting('g1'), pg_temp.setting('g2')]);
reset role;
select is(json_array_length(pg_temp.results('00000000-0000-0000-0000-00000000a11c')), 0, 'dismiss all clears the card');

update public.predictions set resolved_at = now() - interval '20 days' where id = pg_temp.setting('g1');
select is(json_array_length(pg_temp.results('00000000-0000-0000-0000-000000000b0b')), 0, 'results older than two weeks are not shown');

-- ------------------------------------------------------------
-- Weekly recap
-- ------------------------------------------------------------
select is(pg_temp.recap('00000000-0000-0000-0000-00000000a11c')::text, null, 'no recap before two Mondays');

insert into public.series_standing_snapshots (series_id, player_id, week_key, rank, is_ranked, balance)
values
  (pg_temp.setting('cup'), pg_temp.player('alice'), '2026-W40', 2, true, 1000),
  (pg_temp.setting('cup'), pg_temp.player('bob'), '2026-W40', 1, true, 1100),
  (pg_temp.setting('cup'), pg_temp.player('carol'), '2026-W40', null, false, 1000),
  (pg_temp.setting('cup'), pg_temp.player('alice'), '2026-W41', 1, true, 1200),
  (pg_temp.setting('cup'), pg_temp.player('bob'), '2026-W41', 2, true, 1100),
  (pg_temp.setting('cup'), pg_temp.player('carol'), '2026-W41', null, false, 1000);

select is(
  (pg_temp.recap('00000000-0000-0000-0000-00000000a11c')::jsonb - 'week_key'),
  '{"rank": 1, "rank_change": 1, "balance": 1200, "balance_change": 200, "newly_ranked": false}'::jsonb,
  'the recap says how the week went'
);
select is(pg_temp.recap('00000000-0000-0000-0000-00000000ca01')::text, null, 'nothing to say when still unranked and nothing changed');

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.dismiss_weekly_recap(pg_temp.setting('cup'), '2026-W41');
reset role;
select is(pg_temp.recap('00000000-0000-0000-0000-00000000a11c')::text, null, 'a dismissed recap stays away until next week');

-- ------------------------------------------------------------
-- History filter counts
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select is(
  public.get_room_prediction_history_counts(pg_temp.setting('room_id'))::jsonb,
  '{"all": 2, "wins": 1, "losses": 0, "my_bets": 2}'::jsonb,
  'the winner sees one win among two finished predictions, both bet on'
);
select is(
  public.get_room_prediction_history_counts(pg_temp.setting('room_id'), pg_temp.setting('cup'), 'no such title')::jsonb,
  '{"all": 0, "wins": 0, "losses": 0, "my_bets": 0}'::jsonb,
  'the counts follow the search'
);
reset role;
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select is(
  public.get_room_prediction_history_counts(pg_temp.setting('room_id'))::jsonb,
  '{"all": 2, "wins": 0, "losses": 1, "my_bets": 1}'::jsonb,
  'the other player sees a loss, and one finished prediction they sat out'
);
reset role;
select pg_temp.login('00000000-0000-0000-0000-00000000da7e');
set local role authenticated;
select throws_ok(
  format($$ select public.get_room_prediction_history_counts(%L) $$, pg_temp.setting('room_id')),
  NULL, NULL,
  'people outside the room get nothing'
);
reset role;

select * from finish();
rollback;
