begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000b0b', 'authenticated', 'authenticated', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000da7e', 'authenticated', 'authenticated', 'dave@example.com'),
  ('00000000-0000-0000-0000-000000000e7e', 'authenticated', 'authenticated', 'erin@example.com');

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

create function pg_temp.granted(p_username text)
returns integer
language sql
as $$
  select w.granted
  from public.series_wallets w
  join public.players p on p.id = w.player_id
  where w.series_id = pg_temp.setting('cup') and p.username = p_username
$$;

-- Joins the room as this user, which creates their wallet in the live series.
create function pg_temp.join_as(p_user_id uuid, p_username text)
returns void
language plpgsql
as $$
begin
  perform pg_temp.login(p_user_id);
  perform public.register_player(p_username);
  perform public.join_room(current_setting('test.room_code'));
end;
$$;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Alice room')->>'id'), true);
select set_config('test.room_code', (select room_code from public.rooms where id = pg_temp.setting('room_id')), true);
select pg_temp.join_as('00000000-0000-0000-0000-000000000b0b', 'bob');

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select set_config('test.cup', (public.create_series(pg_temp.setting('room_id'), 'Cup', null, 0, 1000, 100, 1)->>'id'), true);

-- Two Mondays have passed with nobody betting yet.
update public.series set topups_paid = 2 where id = pg_temp.setting('cup');

select pg_temp.join_as('00000000-0000-0000-0000-00000000da7e', 'dave');
select is(pg_temp.granted('dave'), 1000, 'with no bettors yet, a late joiner gets the starting stack');

-- Alice and Bob bet and both collected every top-up.
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
select set_config(
  'test.game',
  (public.create_prediction(pg_temp.setting('room_id'), 'Game', array['Home', 'Away'], now() + interval '1 day', pg_temp.setting('cup'))->>'prediction_id'),
  true
);
select public.place_bet(pg_temp.setting('game'), (select id from public.prediction_options where prediction_id = pg_temp.setting('game') and label = 'Home'), 50);
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
select public.place_bet(pg_temp.setting('game'), (select id from public.prediction_options where prediction_id = pg_temp.setting('game') and label = 'Away'), 50);
update public.series_wallets
set granted = 1200, balance = balance + 200
where series_id = pg_temp.setting('cup')
  and player_id in (select id from public.players where username in ('alice', 'bob'));

select pg_temp.join_as('00000000-0000-0000-0000-000000000e7e', 'erin');
select is(pg_temp.granted('erin'), 1100, 'a late joiner gets the stack plus half the top-ups active players got');

-- ------------------------------------------------------------
-- Next Monday's top-up: earned by betting this week
-- ------------------------------------------------------------
create function pg_temp.bet_this_week(p_user_id uuid)
returns boolean
language plpgsql
as $$
declare
  v_wallets json;
begin
  perform pg_temp.login(p_user_id);
  set local role authenticated;
  v_wallets := public.get_my_series_wallets(pg_temp.setting('room_id'));
  reset role;
  return (v_wallets->0->>'bet_this_week')::boolean;
end;
$$;

select is(pg_temp.bet_this_week('00000000-0000-0000-0000-00000000a11c'), true, 'a player who bet this week has earned the next top-up');
select is(pg_temp.bet_this_week('00000000-0000-0000-0000-00000000da7e'), false, 'a player who has not bet this week has not');

update public.bets set placed_at = now() - interval '8 days', updated_at = now() - interval '8 days'
where prediction_id = pg_temp.setting('game');
select is(pg_temp.bet_this_week('00000000-0000-0000-0000-00000000a11c'), false, 'last week''s bets do not count for this Monday');

-- ------------------------------------------------------------
-- A late bettor on the bare stack doesn't lower what newcomers get
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000da7e');
select public.place_bet(pg_temp.setting('game'), (select id from public.prediction_options where prediction_id = pg_temp.setting('game') and label = 'Home'), 50);
insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000f0a11', 'authenticated', 'authenticated', 'frank@example.com');
select pg_temp.join_as('00000000-0000-0000-0000-0000000f0a11', 'frank');
select is(pg_temp.granted('frank'), 1100, 'an active player on the bare stack does not lower what newcomers get');

select * from finish();
rollback;
