begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

-- ------------------------------------------------------------
-- Fixtures: push config is set, so notifications are dispatched and logged.
-- ------------------------------------------------------------
insert into private.notification_config (key, value)
values
  ('supabase_url', 'http://localhost:54321'),
  ('notification_function_secret', 'secret'),
  ('service_role_key', 'service-key'),
  ('app_url', 'https://crow.test')
on conflict (key) do update set value = excluded.value;

insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-00000000a11c', 'authenticated', 'authenticated', 'alice@example.com');

create function pg_temp.login(p_user_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', p_user_id::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.login('00000000-0000-0000-0000-00000000a11c');
set local role authenticated;
select public.register_player('alice');
select set_config('test.room_id', (public.create_room('Cricket Fever')->>'id'), true);
select set_config('test.series_id', (public.create_series(current_setting('test.room_id')::uuid, 'IND v AUS')->>'id'), true);
select set_config('test.prediction_id',
  (public.create_prediction(current_setting('test.room_id')::uuid, 'Who wins?', array['IND', 'AUS'], now() + interval '1 day', current_setting('test.series_id')::uuid)->>'prediction_id'),
  true);
reset role;

-- ------------------------------------------------------------
-- Pushes open the prediction itself
-- ------------------------------------------------------------
select is(
  (
    select payload->'payload'->>'url'
    from private.notification_dispatch_log
    where event_type = 'prediction_live'
      and prediction_id = current_setting('test.prediction_id')::uuid
  ),
  'https://crow.test/rooms/'
    || (select room_code from public.rooms where id = current_setting('test.room_id')::uuid)
    || '/predictions/' || current_setting('test.prediction_id'),
  'a new prediction push opens the prediction page'
);

-- Picks close and the result is overdue: staff are pushed the same link.
update public.predictions
set status = 'locked', deadline = now() - interval '5 hours'
where id = current_setting('test.prediction_id')::uuid;
select private.fire_push_notification_for_result_needed();

select is(
  (
    select payload->'payload'->>'url'
    from private.notification_dispatch_log
    where event_type = 'result_needed'
      and prediction_id = current_setting('test.prediction_id')::uuid
  ),
  'https://crow.test/rooms/'
    || (select room_code from public.rooms where id = current_setting('test.room_id')::uuid)
    || '/predictions/' || current_setting('test.prediction_id'),
  'a result-needed push opens the prediction page'
);

select * from finish();
rollback;
