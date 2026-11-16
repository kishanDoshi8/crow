-- ============================================================
-- Migration: friendly_vocabulary
-- Description: Push notifications and Room talk phrases use the app's new
--   words (see apps/web/VOICE.md): questions instead of predictions, picks
--   instead of bets, players instead of members. No betting language.
--   Copy only: every function below is redefined unchanged apart from its
--   notification titles, and two phrase texts are updated in place.
-- ============================================================

create or replace function private.on_prediction_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_room_name text;
  v_room_code text;
  v_series_title text;
  v_series_prediction_number integer;
  v_extra_payload jsonb;
begin
  if coalesce(current_setting('crow.skip_prediction_push', true), '') = 'on' then
    return NEW;
  end if;

  select name, room_code into v_room_name, v_room_code from public.rooms where id = NEW.room_id;
  select s.title into v_series_title from public.series s where s.id = NEW.series_id;
  v_series_prediction_number := NEW.series_prediction_number;
  v_extra_payload := jsonb_build_object(
    'predictionId', NEW.id,
    'predictionTitle', NEW.title,
    'seriesId', NEW.series_id,
    'seriesTitle', v_series_title,
    'seriesPredictionNumber', v_series_prediction_number
  );

  -- New prediction published (draft = live for betting)
  if TG_OP = 'INSERT' and NEW.status = 'draft' then
    perform private.fire_push_notification(
      'prediction_live',
      NEW.id,
      NEW.room_id,
      '🎯 New question',
      coalesce(v_room_name, 'Your room') || ' · ' || NEW.title,
      '/rooms/' || v_room_code || '/predictions/' || NEW.id::text,
      v_extra_payload
    );

  -- Staff closed the prediction (win, no_result, or cancelled). Open
  -- predictions can be cancelled too, which refunds everyone.
  elsif TG_OP = 'UPDATE'
    and (
      (OLD.status = 'locked' and NEW.status in ('revealed', 'no_result', 'cancelled'))
      or (OLD.status = 'draft' and NEW.status = 'cancelled')
    )
  then
    perform private.fire_push_notification(
      'result_revealed',
      NEW.id,
      NEW.room_id,
      '🏆 Result''s in',
      coalesce(v_room_name, 'Your room') || ' · ' || NEW.title,
      '/rooms/' || v_room_code || '/predictions/' || NEW.id::text,
      v_extra_payload
    );
  end if;

  return NEW;
end;
$$;

create or replace function private.on_predictions_locked()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_ids uuid[];
begin
  select array_agg(n.id) into v_ids
  from new_rows n
  join old_rows o on o.id = n.id
  where o.status = 'draft' and n.status = 'locked';

  if v_ids is not null then
    perform private.push_for_predictions(
      'prediction_locked',
      v_ids,
      '🔒 Picks locked',
      '🔒 Picks locked on %s questions'
    );
  end if;

  return null;
end;
$$;

create or replace function private.fire_push_notification_for_deadline_1h()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_ids uuid[];
begin
  -- Mark and collect in one statement, so a concurrent run can't double-send.
  with marked as (
    update public.predictions
    set notified_1h = true
    where status = 'draft'
      and notified_1h = false
      and deadline between now() and now() + interval '1 hour'
    returning id
  )
  select array_agg(id) into v_ids from marked;

  if v_ids is not null then
    perform private.push_for_predictions(
      'deadline_1h',
      v_ids,
      '⏰ 1 hour left to pick',
      '⏰ 1 hour left on %s questions'
    );
  end if;
end;
$$;

create or replace function private.fire_push_notification_for_result_needed()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rec record;
begin
  for v_rec in
    select
      p.id,
      p.room_id,
      p.title,
      p.series_id,
      p.series_prediction_number,
      s.title as series_title,
      r.name as room_name,
      r.room_code
    from public.predictions p
    join public.rooms r on r.id = p.room_id
    left join public.series s on s.id = p.series_id
    where p.status = 'locked'
      and p.notified_result_needed = false
      and p.deadline + make_interval(hours => r.result_reminder_hours) <= now()
  loop
    -- Mark first so a concurrent run does not double-send.
    update public.predictions
    set notified_result_needed = true
    where id = v_rec.id
      and notified_result_needed = false;

    if found then
      perform private.fire_push_notification(
        'result_needed',
        v_rec.id,
        v_rec.room_id,
        '⏳ Result needed',
        coalesce(v_rec.room_name, 'Your room') || ' · ' || v_rec.title,
        '/rooms/' || v_rec.room_code || '/predictions/' || v_rec.id::text,
        jsonb_build_object(
          'predictionId', v_rec.id,
          'predictionTitle', v_rec.title,
          'seriesId', v_rec.series_id,
          'seriesTitle', v_rec.series_title,
          'seriesPredictionNumber', v_rec.series_prediction_number,
          -- Only staff get this one.
          'roles', jsonb_build_array('owner', 'organizer', 'resolver')
        )
      );
    end if;
  end loop;
end;
$$;

create or replace function private.publish_scheduled_predictions(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_prediction public.predictions%rowtype;
  v_published  uuid[] := '{}';
begin
  for v_prediction in
    select p.*
    from public.predictions p
    join public.series s on s.id = p.series_id and s.status = 'active'
    where p.status = 'scheduled'
      and (case when p_ids is null then p.opens_at <= now() else p.id = any(p_ids) end)
    order by p.opens_at, p.created_at
    for update of p skip locked
  loop
    -- Same lock create_prediction takes, so numbers never collide.
    perform 1 from public.series where id = v_prediction.series_id for update;

    update public.predictions
    set status = 'draft',
        opens_at = now(),
        series_prediction_number = (
          select coalesce(max(series_prediction_number), 0) + 1
          from public.predictions
          where series_id = v_prediction.series_id
        )
    where id = v_prediction.id;

    perform private.create_room_activity(
      p_room_id := v_prediction.room_id,
      p_activity_type := 'prediction_created',
      p_activity_tier := 2,
      p_metadata := private.build_prediction_activity_metadata(v_prediction.id),
      p_click_action := jsonb_build_object('type', 'prediction', 'predictionId', v_prediction.id),
      p_created_by_player_id := v_prediction.created_by,
      p_dedupe_key := 'prediction_created:' || v_prediction.id::text
    );

    v_published := v_published || v_prediction.id;
  end loop;

  perform private.push_for_predictions(
    'prediction_live',
    v_published,
    '🎯 New question',
    '🎯 %s new questions'
  );

  return coalesce(array_length(v_published, 1), 0);
end;
$$;

create or replace function public.create_predictions(
  p_room_id     uuid,
  p_series_id   uuid,
  p_predictions jsonb,
  p_deadline    timestamptz,
  p_opens_at    timestamptz default null,
  p_event_title text default null,
  p_tags        text[] default '{}'
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id   uuid;
  v_scheduled   boolean := p_opens_at is not null and p_opens_at > now();
  v_event_title text := nullif(regexp_replace(btrim(coalesce(p_event_title, '')), '\s+', ' ', 'g'), '');
  v_event_id    uuid;
  v_series      public.series%rowtype;
  v_next_number int;
  v_item        jsonb;
  v_position    int;
  v_title       text;
  v_description text;
  v_deadline    timestamptz;
  v_options     jsonb;
  v_label       text;
  v_option_position int;
  v_prediction_id uuid;
  v_ids         uuid[] := '{}';
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and player_id = v_player_id
      and role in ('owner', 'organizer')
  ) then
    raise exception 'Only organizers can create predictions' using errcode = 'P0012';
  end if;

  if not exists (select 1 from public.rooms where id = p_room_id and status = 'active') then
    raise exception 'Room not found or closed' using errcode = 'P0002';
  end if;

  if p_predictions is null or jsonb_typeof(p_predictions) <> 'array'
    or jsonb_array_length(p_predictions) not between 1 and 20
  then
    raise exception 'Add between 1 and 20 predictions' using errcode = 'P0001';
  end if;

  if char_length(v_event_title) > 80 then
    raise exception 'Keep the event name under 80 characters' using errcode = 'P0001';
  end if;

  if p_series_id is null then
    raise exception 'Predictions must belong to an active series' using errcode = 'P0001';
  end if;

  -- Same lock create_prediction takes, so numbers never collide.
  select * into v_series
  from public.series
  where id = p_series_id
    and room_id = p_room_id
  for update;

  if not found then
    raise exception 'Series not found for this room' using errcode = 'P0002';
  end if;

  if v_series.status <> 'active' then
    raise exception 'Predictions can only be assigned to active series' using errcode = 'P0001';
  end if;

  if not v_scheduled then
    select coalesce(max(series_prediction_number), 0) + 1
      into v_next_number
    from public.predictions
    where series_id = p_series_id;
  end if;

  if v_event_title is not null then
    insert into public.prediction_events (room_id, title, created_by)
    values (p_room_id, v_event_title, v_player_id)
    returning id into v_event_id;
  end if;

  -- One push for the set (below), not one per prediction.
  perform set_config('crow.skip_prediction_push', 'on', true);

  for v_item, v_position in
    select t.item, t.position::int
    from jsonb_array_elements(p_predictions) with ordinality as t(item, position)
  loop
    v_title := btrim(coalesce(v_item->>'title', ''));
    v_description := nullif(btrim(coalesce(v_item->>'description', '')), '');
    v_deadline := coalesce((v_item->>'deadline')::timestamptz, p_deadline);
    v_options := v_item->'options';

    if v_title = '' then
      raise exception 'Prediction % needs a question', v_position using errcode = 'P0001';
    end if;

    if v_options is null or jsonb_typeof(v_options) <> 'array'
      or jsonb_array_length(v_options) not between 2 and 12
    then
      raise exception '"%" must have between 2 and 12 options', v_title using errcode = 'P0001';
    end if;

    if v_deadline is null or v_deadline <= now() then
      raise exception 'Deadline must be in the future' using errcode = 'P0001';
    end if;

    if v_scheduled and v_deadline < p_opens_at + interval '5 minutes' then
      raise exception 'Leave at least 5 minutes between going live and the deadline' using errcode = 'P0001';
    end if;

    insert into public.predictions (
      room_id, series_id, series_prediction_number, created_by, title,
      status, deadline, opens_at, event_id, created_at
    )
    values (
      p_room_id,
      p_series_id,
      case when v_scheduled then null else v_next_number + v_position - 1 end,
      v_player_id,
      v_title,
      case when v_scheduled then 'scheduled' else 'draft' end,
      v_deadline,
      case when v_scheduled then p_opens_at else now() end,
      v_event_id,
      -- Scheduled ones go live in created order: keep the order given.
      now() + (v_position - 1) * interval '1 microsecond'
    )
    returning id into v_prediction_id;

    for v_label, v_option_position in
      select btrim(coalesce(o.label, '')), o.position::int
      from jsonb_array_elements_text(v_options) with ordinality as o(label, position)
    loop
      if v_label = '' then
        raise exception 'Option labels cannot be empty' using errcode = 'P0001';
      end if;

      insert into public.prediction_options (prediction_id, label, display_order)
      values (v_prediction_id, v_label, v_option_position - 1);
    end loop;

    -- Tidies and checks the description and tags the same way as for one.
    if v_description is not null or coalesce(cardinality(p_tags), 0) > 0 then
      perform public.set_prediction_details(v_prediction_id, v_description, p_tags);
    end if;

    -- Members hear about scheduled ones when they go live.
    if not v_scheduled then
      perform private.create_room_activity(
        p_room_id := p_room_id,
        p_activity_type := 'prediction_created',
        p_activity_tier := 2,
        p_metadata := private.build_prediction_activity_metadata(v_prediction_id),
        p_click_action := jsonb_build_object('type', 'prediction', 'predictionId', v_prediction_id),
        p_created_by_player_id := v_player_id,
        p_dedupe_key := 'prediction_created:' || v_prediction_id::text
      );
    end if;

    v_ids := v_ids || v_prediction_id;
  end loop;

  perform set_config('crow.skip_prediction_push', 'off', true);

  if not v_scheduled then
    perform private.push_for_predictions(
      'prediction_live',
      v_ids,
      '🎯 New question',
      '🎯 %s new questions'
    );
  end if;

  return json_build_object(
    'room_id',        p_room_id,
    'series_id',      p_series_id,
    'event_id',       v_event_id,
    'status',         case when v_scheduled then 'scheduled' else 'draft' end,
    'opens_at',       case when v_scheduled then p_opens_at else now() end,
    'prediction_ids', to_json(v_ids),
    'count',          cardinality(v_ids)
  );
end;
$$;

create or replace function public.resolve_predictions(
  p_room_id uuid,
  p_results jsonb
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id  uuid;
  v_item       record;
  v_result     json;
  v_ids        uuid[];
  v_closed     uuid[] := '{}';
  v_revealed   int := 0;
  v_no_result  int := 0;
  v_cancelled  int := 0;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and player_id = v_player_id
      and role in ('owner', 'organizer', 'resolver')
  ) then
    raise exception 'Only room staff can close predictions' using errcode = 'P0012';
  end if;

  if p_results is null or jsonb_typeof(p_results) <> 'array'
    or jsonb_array_length(p_results) not between 1 and 50
  then
    raise exception 'Choose between 1 and 50 predictions to close' using errcode = 'P0001';
  end if;

  select array_agg((item->>'prediction_id')::uuid) into v_ids
  from jsonb_array_elements(p_results) item;

  if exists (select 1 from unnest(v_ids) id where id is null)
    or (select count(distinct id) from unnest(v_ids) id) <> cardinality(v_ids)
  then
    raise exception 'Each prediction can be closed only once' using errcode = 'P0001';
  end if;

  -- Lock them all first, in one order, so two staff closing overlapping sets
  -- wait for each other instead of deadlocking.
  perform 1
  from public.predictions
  where id = any(v_ids) and room_id = p_room_id
  order by id
  for update;

  -- Say which one is the problem before touching anything.
  for v_item in
    select r.outcome, r.no_result_reason, p.title, p.status
    from jsonb_to_recordset(p_results) as r(prediction_id uuid, outcome text, no_result_reason text)
    left join public.predictions p on p.id = r.prediction_id and p.room_id = p_room_id
  loop
    if v_item.status is null then
      raise exception 'Prediction not found in this room' using errcode = 'P0006';
    elsif v_item.status = 'draft' and v_item.outcome is distinct from 'cancel' then
      raise exception '"%" is still open for picks, so it can only be cancelled', v_item.title using errcode = 'P0001';
    elsif v_item.status not in ('draft', 'locked') then
      raise exception '"%" is already closed', v_item.title using errcode = 'P0006';
    elsif char_length(btrim(coalesce(v_item.no_result_reason, ''))) > 120 then
      raise exception 'Keep the reason under 120 characters' using errcode = 'P0001';
    end if;
  end loop;

  -- One push for the set (below), not one per prediction.
  perform set_config('crow.skip_prediction_push', 'on', true);

  -- Oldest first, so streaks and ratings move in the order things happened.
  for v_item in
    select r.prediction_id, r.outcome, r.winning_option_id, r.no_result_reason
    from jsonb_to_recordset(p_results)
      as r(prediction_id uuid, outcome text, winning_option_id uuid, no_result_reason text)
    join public.predictions p on p.id = r.prediction_id
    order by p.deadline, p.series_prediction_number, p.id
  loop
    v_result := private.resolve_prediction(
      v_item.prediction_id,
      p_room_id,
      v_item.outcome,
      v_item.winning_option_id,
      v_item.no_result_reason::varchar(120),
      v_player_id
    );

    v_closed := v_closed || v_item.prediction_id;
    -- A win nobody bet on ends as no result, so count what it became.
    case v_result->>'outcome'
      when 'revealed' then v_revealed := v_revealed + 1;
      when 'no_result' then v_no_result := v_no_result + 1;
      else v_cancelled := v_cancelled + 1;
    end case;
  end loop;

  perform set_config('crow.skip_prediction_push', 'off', true);

  perform private.push_for_predictions(
    'result_revealed',
    v_closed,
    '🏆 Result''s in',
    case
      when v_revealed > 0 then '🏆 %s results are in'
      else '↩️ %s questions called off · points back'
    end
  );

  return json_build_object(
    'resolved',  cardinality(v_closed),
    'revealed',  v_revealed,
    'no_result', v_no_result,
    'cancelled', v_cancelled
  );
end;
$$;

create or replace function public.join_room(
  p_room_code text,
  p_ref text default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_player    public.players%rowtype;
  v_room      public.rooms%rowtype;
  v_member    public.room_members%rowtype;
  v_request   public.room_join_requests%rowtype;
  v_ref       text;
  v_membership text := 'member';
begin
  -- Which shared link brought them in, e.g. "brag-card"; anything else is dropped.
  v_ref := lower(trim(p_ref));
  if v_ref !~ '^[a-z][a-z-]{0,31}$' then
    v_ref := null;
  end if;

  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select * into v_player from public.players where id = v_player_id;

  -- Locked, so two people can't both take the last place.
  select * into v_room
  from public.rooms
  where room_code = upper(trim(p_room_code))
    and status = 'active'
  for update;

  if not found then
    raise exception 'Room not found or closed' using errcode = 'P0002';
  end if;

  select * into v_member
  from public.room_members
  where room_id = v_room.id and player_id = v_player_id;

  if not found then
    if exists (
      select 1 from public.room_former_members f
      where f.room_id = v_room.id and f.player_id = v_player_id
        and f.status in ('removed', 'deleted')
    ) then
      raise exception 'You were removed from this room. Ask the owner to let you back in.' using errcode = 'P0012';
    end if;

    if private.room_is_full(v_room.id) then
      raise exception 'This room is full' using errcode = 'P0014';
    end if;

    if v_room.join_policy = 'request' then
      select * into v_request
      from public.room_join_requests
      where room_id = v_room.id and player_id = v_player_id
      for update;

      if found and v_request.status = 'declined' and v_request.decided_at > now() - interval '7 days' then
        raise exception 'Your request was declined. You can ask again after %.',
          to_char(v_request.decided_at + interval '7 days', 'Mon FMDD')
          using errcode = 'P0013';
      end if;

      if not found or v_request.status <> 'pending' then
        insert into public.room_join_requests (room_id, player_id, status, via, created_at, decided_at, decided_by)
        values (v_room.id, v_player_id, 'pending', v_ref, now(), null, null)
        on conflict (room_id, player_id) do update
          set status = 'pending', via = excluded.via, created_at = now(), decided_at = null, decided_by = null;

        perform private.fire_push_notification(
          'join_request',
          null,
          v_room.id,
          '🙋 Join request',
          v_player.username || ' wants to join ' || v_room.name,
          '/rooms/' || v_room.room_code || '/members',
          jsonb_build_object('roles', jsonb_build_array('owner', 'organizer'))
        );
      end if;

      v_membership := 'requested';
    else
      v_member := private.add_room_member(v_room.id, v_player_id, v_ref);

      -- Owners and organizers hear about it, as they do about a request.
      perform private.fire_push_notification(
        'member_joined',
        null,
        v_room.id,
        '👋 New player',
        v_player.username || ' joined ' || v_room.name,
        '/rooms/' || v_room.room_code || '/members',
        jsonb_build_object('roles', jsonb_build_array('owner', 'organizer'))
      );
    end if;
  end if;

  return json_build_object(
    'id',           v_room.id,
    'code',         v_room.room_code,
    'name',         v_room.name,
    'status',       v_room.status,
    'player_id',    v_player_id,
    'username',     v_player.username,
    'membership',   v_membership,
    'is_organizer', v_member.is_organizer,
    'role',         v_member.role,
    'created_at',   v_room.created_at
  );
end;
$$;

-- Room talk: no money talk. Posts point at phrases by id, so earlier posts
-- show the new text too.
update public.talk_phrases set text = 'Easy call' where stage = 'open' and text = 'Easy money';
update public.talk_phrases set text = 'Eat crow' where stage = 'result' and text = 'Pay up';
