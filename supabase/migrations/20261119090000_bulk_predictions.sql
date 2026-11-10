-- ============================================================
-- Migration: bulk_predictions
-- Description: Organizers create a set of predictions in one go
--   (create_predictions) and staff close several at once, each with its
--   own outcome (resolve_predictions). A set can share an event
--   (prediction_events, predictions.event_id), e.g. one match. Members get
--   one push per room for a set instead of one per prediction; the same
--   now goes for predictions that lock together and for the 1-hour
--   reminder.
--   Works with the previous frontend: nothing it calls changes shape.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Events: what a set of predictions is about
-- ------------------------------------------------------------
-- What a set of predictions is about, e.g. one match ("Arsenal vs Chelsea").
-- Predictions made together can share one, so staff can find and close them
-- together and members get one push for the set. Optional: a prediction
-- made on its own has none.
create table if not exists public.prediction_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  created_by uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_prediction_events_room on public.prediction_events (room_id, created_at desc);

alter table public.predictions
  add column if not exists event_id uuid references public.prediction_events(id) on delete set null;
create index if not exists idx_predictions_event on public.predictions (event_id) where event_id is not null;

alter table public.prediction_events enable row level security;
revoke all on public.prediction_events from anon;
revoke insert, update, delete, truncate, references, trigger on public.prediction_events from authenticated;
drop policy if exists "prediction_events_select" on public.prediction_events;
create policy "prediction_events_select" on public.prediction_events for select to authenticated using (private.is_room_member(room_id));
drop policy if exists "prediction_events_no_direct_write" on public.prediction_events;
create policy "prediction_events_no_direct_write" on public.prediction_events for insert with check (false);
drop policy if exists "prediction_events_no_direct_update" on public.prediction_events;
create policy "prediction_events_no_direct_update" on public.prediction_events for update using (false);
drop policy if exists "prediction_events_no_direct_delete" on public.prediction_events;
create policy "prediction_events_no_direct_delete" on public.prediction_events for delete using (false);
grant select (id, room_id, title, created_by, created_at) on public.prediction_events to authenticated;

-- The web app reads predictions with "select *", so the new column has to
-- be readable from the start.
grant select (event_id) on public.predictions to authenticated;

-- ------------------------------------------------------------
-- 2. One push per room for predictions that change together
-- ------------------------------------------------------------
-- One push per room for a set of predictions that changed together (went
-- live, locked, got results...), instead of one per prediction. A room with
-- one prediction in the set gets the usual push that opens it; a room with
-- several gets a single push that opens the room. p_title_many is the title
-- for several, with %s where the count goes.
create or replace function private.push_for_predictions(
  p_event_type text,
  p_prediction_ids uuid[],
  p_title_one text,
  p_title_many text
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_room record;
  v_series_title text;
  v_about text;
begin
  for v_room in
    select r.id, r.name, r.room_code,
      count(*)::int as n,
      (array_agg(p.id order by p.deadline, p.series_prediction_number, p.id))[1] as first_id,
      (array_agg(p.title order by p.deadline, p.series_prediction_number, p.id))[1] as first_title,
      (array_agg(p.series_id order by p.deadline, p.series_prediction_number, p.id))[1] as first_series_id,
      (array_agg(p.series_prediction_number order by p.deadline, p.series_prediction_number, p.id))[1] as first_number,
      count(distinct p.event_id)::int as events,
      bool_and(p.event_id is not null) as all_in_events,
      min(e.title) as event_title
    from public.predictions p
    join public.rooms r on r.id = p.room_id
    left join public.prediction_events e on e.id = p.event_id
    where p.id = any(p_prediction_ids)
    group by r.id
  loop
    if v_room.n = 1 then
      select title into v_series_title from public.series where id = v_room.first_series_id;
      perform private.fire_push_notification(
        p_event_type,
        v_room.first_id,
        v_room.id,
        p_title_one,
        coalesce(v_room.name, 'Your room') || ' · ' || v_room.first_title,
        '/rooms/' || v_room.room_code || '/predictions/' || v_room.first_id::text,
        jsonb_build_object(
          'predictionId', v_room.first_id,
          'predictionTitle', v_room.first_title,
          'seriesId', v_room.first_series_id,
          'seriesTitle', v_series_title,
          'seriesPredictionNumber', v_room.first_number
        )
      );
    else
      -- All for one event: name it. Otherwise the first one "and N more".
      v_about := case
        when v_room.all_in_events and v_room.events = 1 then v_room.event_title
        else v_room.first_title || ' and ' || (v_room.n - 1) || ' more'
      end;
      perform private.fire_push_notification(
        p_event_type,
        null,
        v_room.id,
        replace(p_title_many, '%s', v_room.n::text),
        coalesce(v_room.name, 'Your room') || ' · ' || v_about,
        '/rooms/' || v_room.room_code,
        jsonb_build_object('predictionCount', v_room.n)
      );
    end if;
  end loop;
end;
$$;

-- Pushes for one prediction changing: it went live, or staff closed it.
-- Functions that change several at once (create_predictions,
-- resolve_predictions) switch this off for their transaction with
-- crow.skip_prediction_push and send one push for the set instead. Locking
-- is pushed per statement, below, so a deadline shared by several
-- predictions is one push too.
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
      '🎯 New Prediction',
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
      '🏆 Result Is In',
      coalesce(v_room_name, 'Your room') || ' · ' || NEW.title,
      '/rooms/' || v_room_code || '/predictions/' || NEW.id::text,
      v_extra_payload
    );
  end if;

  return NEW;
end;
$$;

-- Picks closed, by the every-minute job or an organizer. Runs once per
-- statement, so predictions that lock together are one push per room.
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
      '🔒 Betting Closed',
      '🔒 Betting closed on %s predictions'
    );
  end if;

  return null;
end;
$$;

drop trigger if exists trg_predictions_push_notification on public.predictions;
create trigger trg_predictions_push_notification
after insert or update of status on public.predictions
for each row execute function private.on_prediction_status_change();

-- Transition tables can't be combined with "update of status", so this runs
-- on every update and does nothing unless something locked.
drop trigger if exists trg_predictions_locked_push on public.predictions;
create trigger trg_predictions_locked_push
after update on public.predictions
referencing old table as old_rows new table as new_rows
for each statement execute function private.on_predictions_locked();

-- Cron, every minute: push members about predictions that close within the
-- hour. Each prediction is reminded once; several closing together in a
-- room are one push.
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
      '⏰ 1 Hour Left to Bet!',
      '⏰ 1 hour left on %s predictions'
    );
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 3. Scheduled predictions use the same push
-- ------------------------------------------------------------
-- Puts scheduled predictions live: the given ones, or every one that's due.
-- Each gets the next number in its series and its "new prediction" activity,
-- in go-live order; members get one push per room, however many went live.
-- Returns how many went live.
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
    '🎯 New Prediction',
    '🎯 %s new predictions'
  );

  return coalesce(array_length(v_published, 1), 0);
end;
$$;

-- ------------------------------------------------------------
-- 4. Create a set
-- ------------------------------------------------------------
-- Organizers create a set of predictions in one go, e.g. every question for
-- one match. Each item of p_predictions is
--   {"title": "...", "options": ["A", "B"], "description": "...", "deadline": "..."}
-- (description and deadline are optional; deadline defaults to p_deadline).
-- They share the series, go-live time and tags, and with p_event_title the
-- event they're about. Live now: they get series numbers in the order
-- given, an activity post each, and members get one push for the set.
-- Scheduled (p_opens_at in the future): hidden until then, as with
-- create_prediction. All or nothing: one bad item creates none.
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
      or jsonb_array_length(v_options) not between 2 and 6
    then
      raise exception '"%" must have between 2 and 6 options', v_title using errcode = 'P0001';
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
      '🎯 New Prediction',
      '🎯 %s new predictions'
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

-- ------------------------------------------------------------
-- 5. Close several
-- ------------------------------------------------------------
-- Closes one prediction as p_player_id: settles the points, then ratings,
-- stats and the room feed. The caller has already checked that the player is
-- room staff. Shared by resolve_prediction_v2 (one) and resolve_predictions
-- (several at once).
create or replace function private.resolve_prediction(
  p_prediction_id     uuid,
  p_room_id           uuid,
  p_outcome           text,
  p_winning_option_id uuid,
  p_no_result_reason  varchar(50),
  p_player_id         uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id   uuid := p_player_id;
  v_prediction  public.predictions%rowtype;
  v_plan        record;
  v_counts      record;
  v_activity    text;
begin
  select * into v_prediction
  from public.predictions
  where id      = p_prediction_id
    and room_id = p_room_id
    -- Locked predictions can be closed any way; open ones can only be cancelled.
    and (status = 'locked' or (status = 'draft' and p_outcome = 'cancel'))
  -- Lock the prediction so a second resolve call waits, then finds it no longer locked.
  for update;

  if not found then
    raise exception 'Prediction not found or already closed' using errcode = 'P0006';
  end if;

  select * into v_plan
  from private.plan_settlement(p_prediction_id, p_outcome, p_winning_option_id, p_no_result_reason);

  select * into v_counts
  from private.apply_settlement(p_prediction_id, v_plan.status, v_plan.winning_option_id);

  update public.predictions
  set status            = v_plan.status,
      winning_option_id = v_plan.winning_option_id,
      no_result_reason  = v_plan.no_result_reason,
      resolved_at       = now(),
      resolved_by       = v_player_id
  where id = p_prediction_id
  returning * into v_prediction;

  if v_plan.status = 'revealed' then
    perform public.update_prediction_ratings(
      p_room_id,
      p_prediction_id,
      v_plan.winning_option_id
    );
  end if;

  perform public.update_player_stats_after_resolution(
    p_room_id,
    p_prediction_id,
    case when v_plan.status = 'revealed' then v_plan.winning_option_id end,
    case when v_plan.status = 'revealed' then 'win' else v_plan.status end
  );

  perform public.update_room_stats_after_resolution(
    p_room_id,
    p_prediction_id,
    case when v_plan.status = 'revealed' then v_plan.winning_option_id end,
    case when v_plan.status = 'revealed' then 'win' else v_plan.status end
  );

  v_activity := case v_plan.status
    when 'revealed' then 'prediction_revealed'
    when 'cancelled' then 'prediction_cancelled'
    else 'prediction_no_result'
  end;

  perform private.create_room_activity(
    p_room_id := p_room_id,
    p_activity_type := v_activity,
    p_activity_tier := 1,
    p_metadata := private.build_prediction_activity_metadata(p_prediction_id),
    p_click_action := jsonb_build_object(
      'type', 'prediction',
      'predictionId', p_prediction_id
    ),
    p_created_by_player_id := v_player_id,
    p_dedupe_key := v_activity || ':' || p_prediction_id::text
  );

  if v_plan.status = 'revealed' then
    return json_build_object(
      'resolved',          true,
      'outcome',           'revealed',
      'winning_option_id', v_plan.winning_option_id,
      'winning_label',     (select label from public.prediction_options where id = v_plan.winning_option_id),
      'winners',           v_counts.winners,
      'losers',            v_counts.losers
    );
  end if;

  return json_build_object(
    'resolved',          true,
    'outcome',           v_plan.status,
    'reason',            v_plan.no_result_reason,
    'winning_option_id', v_plan.winning_option_id,
    'refunded',          true
  );
end;
$$;

-- Staff close one prediction: reveal the winner, mark no result, or cancel.
create or replace function public.resolve_prediction_v2(
  p_prediction_id     uuid,
  p_room_id           uuid,
  p_outcome           text,
  p_winning_option_id uuid default null,
  p_no_result_reason  varchar(50) default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id   uuid;
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

  return private.resolve_prediction(
    p_prediction_id, p_room_id, p_outcome, p_winning_option_id, p_no_result_reason, v_player_id
  );
end;
$$;

-- Staff close several predictions in one go, each with its own outcome, e.g.
-- every question for a match once it's over, or all of them when it's
-- called off. Each item of p_results is
--   {"prediction_id": "...", "outcome": "win" | "no_result" | "cancel",
--    "winning_option_id": "...", "no_result_reason": "..."}
-- with the same rules as resolve_prediction_v2: locked predictions close any
-- way, open ones can only be cancelled. Members get one push for the set.
-- All or nothing: if one can't be closed, none are.
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
    elsif char_length(btrim(coalesce(v_item.no_result_reason, ''))) > 50 then
      raise exception 'Keep the reason under 50 characters' using errcode = 'P0001';
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
      v_item.no_result_reason::varchar(50),
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
    '🏆 Result Is In',
    case
      when v_revealed > 0 then '🏆 %s results are in'
      else '↩️ %s predictions called off · points returned'
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

-- ------------------------------------------------------------
-- 6. The manage queue says which event each prediction is for
-- ------------------------------------------------------------
-- Staff only. Everything waiting on staff across the room, oldest first:
-- locked predictions to close, predictions still open for picks, and (for
-- organizers) scheduled ones by when they go live and join requests.
create or replace function public.get_room_manage_queue(
  p_room_id uuid
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_role      text;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id
    and player_id = v_player_id;

  if v_role is null or v_role not in ('owner', 'organizer', 'resolver') then
    raise exception 'Only room staff can see the manage queue' using errcode = 'P0012';
  end if;

  return (
    with queue as (
      select
        p.id,
        p.title,
        p.status,
        p.deadline,
        p.opens_at,
        p.series_id,
        p.series_prediction_number,
        s.title as series_title,
        -- The event it was made for, to group a set together.
        p.event_id,
        e.title as event_title,
        (select count(*)::int from public.bets b where b.prediction_id = p.id) as bet_count,
        (
          select coalesce(sum(po.total_bet), 0)::int
          from public.prediction_options po
          where po.prediction_id = p.id
        ) as total_pool,
        (
          select json_agg(
            json_build_object('id', po.id, 'label', po.label, 'display_order', po.display_order)
            order by po.display_order
          )
          from public.prediction_options po
          where po.prediction_id = p.id
        ) as options
      from public.predictions p
      left join public.series s on s.id = p.series_id
      left join public.prediction_events e on e.id = p.event_id
      where p.room_id = p_room_id
        and (
          p.status in ('draft', 'locked')
          -- Scheduled ones are for organizers (resolvers don't create).
          or (p.status = 'scheduled' and v_role in ('owner', 'organizer'))
        )
    )
    select json_build_object(
      'role', v_role,
      'to_resolve', coalesce(
        (select json_agg(q order by q.deadline, q.id) from queue q where q.status = 'locked'),
        '[]'::json
      ),
      'open', coalesce(
        (select json_agg(q order by q.deadline, q.id) from queue q where q.status = 'draft'),
        '[]'::json
      ),
      'scheduled', coalesce(
        (select json_agg(q order by q.opens_at, q.id) from queue q where q.status = 'scheduled'),
        '[]'::json
      ),
      -- Owners and organizers: people waiting to be let in, oldest first.
      'join_requests', case
        when v_role in ('owner', 'organizer') then public.get_room_join_requests(p_room_id)
        else '[]'::json
      end
    )
  );
end;
$$;

-- ------------------------------------------------------------
-- 7. Function access
-- ------------------------------------------------------------
revoke execute on function private.push_for_predictions(text, uuid[], text, text) from public, anon, authenticated;
revoke execute on function private.on_predictions_locked() from public, anon, authenticated;
revoke execute on function private.resolve_prediction(uuid, uuid, text, uuid, character varying, uuid) from public, anon, authenticated;
revoke execute on function public.create_predictions(uuid, uuid, jsonb, timestamp with time zone, timestamp with time zone, text, text[]) from public, anon, authenticated;
revoke execute on function public.resolve_predictions(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_predictions(uuid, uuid, jsonb, timestamp with time zone, timestamp with time zone, text, text[]) to authenticated;
grant execute on function public.resolve_predictions(uuid, jsonb) to authenticated;
