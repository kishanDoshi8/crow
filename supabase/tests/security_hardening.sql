begin;

create extension if not exists pgtap with schema extensions;

select plan(49);

-- ------------------------------------------------------------
-- Fixtures: Alice organizes a room, Bob joins it, Carol is an outsider.
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

-- Alice
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Alice room')->>'id'), true);
reset role;

select set_config('test.room_code', (select room_code from public.rooms where id = pg_temp.setting('room_id')), true);

-- Bob
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select public.register_player('bob');
select public.join_room(current_setting('test.room_code'));
reset role;

-- Carol (registered, never joins)
select pg_temp.login('00000000-0000-0000-0000-00000000ca01');
set local role authenticated;
select public.register_player('carol');
reset role;

-- Alice starts a series (everyone gets 1000 points) and opens a prediction in it
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select set_config('test.series_id', (public.create_series(pg_temp.setting('room_id'), 'Season 1')->>'id'), true);
select set_config(
  'test.prediction_id',
  (public.create_prediction(pg_temp.setting('room_id'), 'Will it rain?', array['Yes', 'No'], now() + interval '1 day', pg_temp.setting('series_id'))->>'prediction_id'),
  true
);
reset role;

select set_config('test.yes_id', (select id::text from public.prediction_options where prediction_id = pg_temp.setting('prediction_id') and label = 'Yes'), true);
select set_config('test.no_id', (select id::text from public.prediction_options where prediction_id = pg_temp.setting('prediction_id') and label = 'No'), true);

-- Bob bets Yes, Alice bets No
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select public.place_bet(pg_temp.setting('prediction_id'), pg_temp.setting('yes_id'), 100);
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.place_bet(pg_temp.setting('prediction_id'), pg_temp.setting('no_id'), 100);
reset role;

-- ------------------------------------------------------------
-- 1. Players cannot write tables directly
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;

select throws_ok(
  $$ update public.players set points_balance = 1000000 where user_id = auth.uid() $$,
  '42501', null,
  'a player cannot set their own balance'
);
select throws_ok(
  $$ update public.players set points_in_escrow = 0 where user_id = auth.uid() $$,
  '42501', null,
  'a player cannot clear their own escrow'
);
select throws_ok(
  format(
    $$ insert into public.bets (prediction_id, player_id, option_id, amount) values (%L, %L, %L, 1) $$,
    pg_temp.setting('prediction_id'),
    (select id from public.players where username = 'bob'),
    pg_temp.setting('yes_id')
  ),
  '42501', null,
  'a player cannot insert bets directly'
);
select throws_ok(
  format($$ update public.predictions set status = 'revealed' where id = %L $$, pg_temp.setting('prediction_id')),
  '42501', null,
  'a player cannot change a prediction directly'
);
select throws_ok(
  $$ update public.series_wallets set balance = 1000000 where player_id = (select id from public.players where username = 'bob') $$,
  '42501', null,
  'a player cannot set their own series balance'
);
select throws_ok(
  $$ select player_token from public.players $$,
  '42501', null,
  'player tokens are not readable'
);

reset role;

select is(
  (select balance from public.series_wallets w join public.players p on p.id = w.player_id where p.username = 'bob'),
  1000,
  'bob''s balance is unchanged after the attempted writes'
);

select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and (
        has_table_privilege('authenticated', c.oid, 'INSERT')
        or has_table_privilege('authenticated', c.oid, 'UPDATE')
        or has_table_privilege('authenticated', c.oid, 'DELETE')
        or has_table_privilege('authenticated', c.oid, 'TRUNCATE')
      )
  ),
  0,
  'logged-in users have no write privilege on any public table or view'
);

select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and (
        has_table_privilege('anon', c.oid, 'SELECT')
        or exists (
          select 1 from pg_attribute a
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
            and has_column_privilege('anon', c.oid, a.attnum, 'SELECT')
        )
      )
  ),
  0,
  'logged-out users cannot read any public table or view'
);

-- ------------------------------------------------------------
-- 2. Function access is an allowlist
-- ------------------------------------------------------------
select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0,
  'logged-out users cannot call any public or private function'
);

select is(
  array(
    select p.proname::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    order by 1
  ),
  array[
    'activate_series', 'allow_room_member_back', 'archive_series', 'cancel_account_deletion', 'cancel_bet', 'collect_series_rewards',
    'complete_series', 'correct_prediction_result', 'create_prediction', 'create_room', 'create_series', 'delete_my_push_subscription',
    'dismiss_weekly_recap', 'get_my_account_deletion', 'get_my_series_wallets', 'get_my_unseen_results', 'get_my_weekly_recap',
    'get_player', 'get_preferences', 'get_room_activities', 'get_room_by_code', 'get_room_former_members', 'get_room_has_unseen_activities',
    'get_room_manage_queue', 'get_room_member_recent_predictions', 'get_room_member_stats', 'get_room_member_style',
    'get_room_overall_standings', 'get_room_prediction_history', 'get_room_series', 'get_room_series_selector', 'get_room_stat_cards',
    'get_room_tags', 'get_series_awards', 'get_series_leaderboard', 'get_series_placements', 'get_series_suggestions',
    'get_series_weekly_recap', 'join_room', 'leave_room', 'mark_how_to_play_seen', 'mark_ratings_tip_seen', 'mark_results_seen',
    'mark_room_activities_seen', 'mark_series_suggestion_played', 'place_bet', 'record_share', 'register_player', 'remove_room_member',
    'remove_series_suggestion', 'request_account_deletion', 'reset_room_preferences', 'resolve_prediction_v2', 'set_last_visited_room',
    'set_member_role', 'set_prediction_details', 'suggest_series', 'toggle_series_suggestion_vote', 'transfer_ownership',
    'update_global_preferences', 'update_prediction', 'update_room', 'update_room_preferences', 'update_series',
    'upsert_user_push_subscription'
  ],
  'logged-in users can call exactly the RPCs the app uses'
);

select hasnt_function('public', 'resolve_prediction', array['text', 'uuid', 'text', 'uuid'], 'token-based resolve_prediction is gone');
select hasnt_function('public', 'resolve_prediction_v2', array['text', 'uuid', 'text', 'uuid'], 'token-based resolve_prediction_v2 is gone');

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;

select throws_ok(
  format($$ select public.update_prediction_ratings(%L, %L, %L) $$, pg_temp.setting('room_id'), pg_temp.setting('prediction_id'), pg_temp.setting('yes_id')),
  '42501', null,
  'a player cannot run the rating update'
);
select throws_ok(
  format($$ select public.update_streaks_after_resolution(%L, %L, %L, 'win') $$, pg_temp.setting('room_id'), pg_temp.setting('prediction_id'), pg_temp.setting('yes_id')),
  '42501', null,
  'a player cannot run the streak update'
);
select hasnt_table('public', 'duels', 'the duels feature is gone');
select throws_ok(
  $$ select private.snapshot_series_standings() $$,
  '42501', null,
  'a player cannot write weekly snapshots'
);

reset role;

-- ------------------------------------------------------------
-- 3. Reads are limited to room members
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000ca01');
set local role authenticated;

select is((select count(*)::int from public.rooms), 0, 'an outsider sees no rooms');
select is((select count(*)::int from public.room_members), 0, 'an outsider sees no room members');
select is((select count(*)::int from public.predictions), 0, 'an outsider sees no predictions');
select is((select count(*)::int from public.prediction_options), 0, 'an outsider sees no prediction options');
select is((select count(*)::int from public.bets), 0, 'an outsider sees no bets');
select is((select count(*)::int from public.series_wallets), 0, 'an outsider sees no series wallets');
select is((select count(*)::int from public.player_rooms_by_activity), 0, 'an outsider sees no room list rows');
select is((select array_agg(username::text) from public.players), array['carol'], 'an outsider sees only their own player');

select is(
  (public.get_room_by_code(lower(current_setting('test.room_code')))->>'is_member')::boolean,
  false,
  'the invite lookup tells an outsider they are not a member'
);
select is(
  public.get_room_by_code(current_setting('test.room_code'))->>'name',
  'Alice room',
  'the invite lookup shows the room name'
);
select is(
  (public.get_room_by_code(current_setting('test.room_code'))->>'member_count')::int,
  2,
  'the invite lookup shows the member count'
);
select is(
  public.get_room_by_code(current_setting('test.room_code'))->>'organizer_username',
  'alice',
  'the invite lookup shows the organizer'
);
select throws_ok(
  $$ select public.get_room_by_code('NOPE00') $$,
  'P0002', null,
  'the invite lookup rejects unknown codes'
);

reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;

select is((select count(*)::int from public.rooms), 1, 'a member sees their room');
select is((select count(*)::int from public.room_members), 2, 'a member sees everyone in their room');
select is((select count(*)::int from public.predictions), 1, 'a member sees the room''s predictions');
select is((select count(*)::int from public.prediction_options), 2, 'a member sees prediction options');
select is((select count(*)::int from public.bets), 2, 'a member sees the room''s bets');
select is((select count(*)::int from public.series_wallets), 2, 'a member sees the series wallets in their room');
select is(
  (select array_agg(username::text order by username) from public.players),
  array['alice', 'bob'],
  'a member sees players they share a room with, and not outsiders'
);
select is(
  (select member_count from public.player_rooms_by_activity where player_id = (select id from public.players where username = 'bob')),
  2,
  'the room list still counts every member'
);
select is(
  (public.get_room_by_code(current_setting('test.room_code'))->>'is_member')::boolean,
  true,
  'the invite lookup tells a member they are a member'
);

reset role;

-- ------------------------------------------------------------
-- 4. Points invariant
-- ------------------------------------------------------------
select throws_ok(
  $$ update public.players set points_in_escrow = points_balance + 1 where username = 'bob' $$,
  '23514', null,
  'escrow can never exceed the balance'
);
select throws_ok(
  $$ update public.series_wallets set escrow = balance + 1 where player_id = (select id from public.players where username = 'bob') $$,
  '23514', null,
  'series escrow can never exceed the series balance'
);

select pg_temp.login('00000000-0000-0000-0000-000000000b0b');
set local role authenticated;
select throws_ok(
  format($$ select public.place_bet(%L, %L, 1001) $$, pg_temp.setting('prediction_id'), pg_temp.setting('yes_id')),
  'P0009', null,
  'a bet larger than the available balance is rejected'
);
reset role;

-- ------------------------------------------------------------
-- 5. The normal game still works end to end
-- ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select throws_ok(
  format($$ select public.lock_prediction(%L) $$, pg_temp.setting('prediction_id')),
  '42501', null,
  'the organizer cannot lock betting early'
);
reset role;

-- Same statement the auto-lock-predictions cron job runs at the deadline.
update public.predictions set status = 'locked' where id = pg_temp.setting('prediction_id');

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select is(
  public.resolve_prediction_v2(pg_temp.setting('prediction_id'), pg_temp.setting('room_id'), 'win', pg_temp.setting('yes_id'))->>'outcome',
  'revealed',
  'the organizer can resolve the prediction'
);
select throws_ok(
  format($$ select public.resolve_prediction_v2(%L, %L, 'win', %L) $$, pg_temp.setting('prediction_id'), pg_temp.setting('room_id'), pg_temp.setting('no_id')),
  'P0006', null,
  'a resolved prediction cannot be resolved again'
);
reset role;

select is((select balance from public.series_wallets w join public.players p on p.id = w.player_id where p.username = 'bob'), 1100, 'the winner is paid');
select is((select balance from public.series_wallets w join public.players p on p.id = w.player_id where p.username = 'alice'), 900, 'the loser pays');
select is((select escrow from public.series_wallets w join public.players p on p.id = w.player_id where p.username = 'bob'), 0, 'the winner''s escrow is released');
select is((select escrow from public.series_wallets w join public.players p on p.id = w.player_id where p.username = 'alice'), 0, 'the loser''s escrow is released');

select * from finish();
rollback;
