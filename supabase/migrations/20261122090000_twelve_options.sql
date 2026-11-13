-- ============================================================
-- Migration: twelve_options
-- Description: A prediction can now have up to 12 options (was 6), when
--   created one at a time, in a set, or edited.
-- ============================================================

-- Organizers create a prediction: live now, or scheduled to go live at
-- p_opens_at. A scheduled one stays hidden from members, gets its series
-- number and its activity post when it goes live, and must stay open for at
-- least 5 minutes after that.
create or replace function public.create_prediction(
  p_room_id  uuid,
  p_title    text,
  p_options  text[],
  p_deadline timestamptz,
  p_series_id uuid default null,
  p_opens_at timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id       uuid;
  v_member          public.room_members%rowtype;
  v_room            public.rooms%rowtype;
  v_prediction      public.predictions%rowtype;
  v_option          public.prediction_options%rowtype;
  v_option_ids      uuid[] := '{}';
  v_label           text;
  v_i               int;
  v_scheduled       boolean := p_opens_at is not null and p_opens_at > now();
  v_series          public.series%rowtype;
  v_series_prediction_number int;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  -- Owners and organizers create predictions
  select * into v_member
  from public.room_members
  where room_id = p_room_id
    and player_id = v_player_id
    and role in ('owner', 'organizer');

  if not found then
    raise exception 'Only organizers can create predictions' using errcode = 'P0012';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id and status = 'active';

  if not found then
    raise exception 'Room not found or closed' using errcode = 'P0002';
  end if;

  -- Validate options count
  if coalesce(array_length(p_options, 1), 0) < 2 or array_length(p_options, 1) > 12 then
    raise exception 'Predictions must have between 2 and 12 options' using errcode = 'P0001';
  end if;

  if length(trim(p_title)) = 0 then
    raise exception 'Prediction title cannot be empty' using errcode = 'P0001';
  end if;

  if p_deadline <= now() then
    raise exception 'Deadline must be in the future' using errcode = 'P0001';
  end if;

  if v_scheduled and p_deadline < p_opens_at + interval '5 minutes' then
    raise exception 'Leave at least 5 minutes between going live and the deadline' using errcode = 'P0001';
  end if;

  -- Points live in series wallets, so every prediction needs a series.
  if p_series_id is null then
    raise exception 'Predictions must belong to an active series' using errcode = 'P0001';
  end if;

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
      into v_series_prediction_number
    from public.predictions
    where series_id = p_series_id;
  end if;

  -- Create the prediction (a live one fires the "new prediction" push).
  insert into public.predictions (
    room_id,
    series_id,
    series_prediction_number,
    created_by,
    title,
    status,
    deadline,
    opens_at
  )
  values (
    p_room_id,
    p_series_id,
    v_series_prediction_number,
    v_player_id,
    trim(p_title),
    case when v_scheduled then 'scheduled' else 'draft' end,
    p_deadline,
    case when v_scheduled then p_opens_at else now() end
  )
  returning * into v_prediction;

  -- Create options
  v_i := 1;
  foreach v_label in array p_options loop
    if length(trim(v_label)) = 0 then
      raise exception 'Option labels cannot be empty' using errcode = 'P0001';
    end if;

    insert into public.prediction_options (prediction_id, label, display_order)
    values (v_prediction.id, trim(v_label), v_i - 1)
    returning * into v_option;

    v_option_ids := v_option_ids || v_option.id;
    v_i := v_i + 1;
  end loop;

  -- Members hear about a scheduled one when it goes live.
  if not v_scheduled then
    perform private.create_room_activity(
      p_room_id := p_room_id,
      p_activity_type := 'prediction_created',
      p_activity_tier := 2,
      p_metadata := private.build_prediction_activity_metadata(v_prediction.id),
      p_click_action := jsonb_build_object(
        'type', 'prediction',
        'predictionId', v_prediction.id
      ),
      p_created_by_player_id := v_player_id,
      p_dedupe_key := 'prediction_created:' || v_prediction.id::text
    );
  end if;

  return json_build_object(
    'prediction_id', v_prediction.id,
    'title',         v_prediction.title,
    'status',        v_prediction.status,
    'deadline',      v_prediction.deadline,
    'opens_at',      v_prediction.opens_at,
    'option_ids',    v_option_ids,
    'room_id',       p_room_id,
    'series_id', v_prediction.series_id,
    'series_prediction_number', v_prediction.series_prediction_number
  );
end;
$$;

-- Organizers fix a prediction that's still open for picks: the deadline, and
-- the question and options while nobody has bet. Pass null options to keep
-- them. A scheduled one can also move when it goes live (p_opens_at; null
-- keeps it), and must stay open at least 5 minutes after that.
create or replace function public.update_prediction(
  p_prediction_id uuid,
  p_title         text,
  p_deadline      timestamptz,
  p_options       text[] default null,
  p_opens_at      timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id  uuid;
  v_prediction public.predictions%rowtype;
  v_labels     text[];
  v_current    text[];
  v_i          int;
  v_opens_at   timestamptz;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select * into v_prediction
  from public.predictions
  where id = p_prediction_id
  for update;

  if not found then
    raise exception 'Prediction not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = v_prediction.room_id
      and player_id = v_player_id
      and role in ('owner', 'organizer')
  ) then
    raise exception 'Only organizers can edit predictions' using errcode = 'P0012';
  end if;

  if not (
    v_prediction.status = 'scheduled'
    or (v_prediction.status = 'draft' and v_prediction.deadline > now())
  ) then
    raise exception 'Only predictions still open for picks can be edited' using errcode = 'P0006';
  end if;

  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Prediction title cannot be empty' using errcode = 'P0001';
  end if;

  if p_deadline is null or p_deadline <= now() then
    raise exception 'Deadline must be in the future' using errcode = 'P0001';
  end if;

  if v_prediction.status = 'scheduled' then
    v_opens_at := coalesce(p_opens_at, v_prediction.opens_at);
    if v_opens_at <= now() then
      raise exception 'Pick a go-live time in the future, or put it live now' using errcode = 'P0001';
    end if;
    if p_deadline < v_opens_at + interval '5 minutes' then
      raise exception 'Leave at least 5 minutes between going live and the deadline' using errcode = 'P0001';
    end if;
  end if;

  -- Once someone has bet, the question they bet on stays as it was.
  if trim(p_title) is distinct from v_prediction.title
    and exists (select 1 from public.bets where prediction_id = p_prediction_id)
  then
    raise exception 'The question can''t change once someone has bet' using errcode = 'P0001';
  end if;

  if p_options is not null then
    if coalesce(array_length(p_options, 1), 0) < 2 or array_length(p_options, 1) > 12 then
      raise exception 'Predictions must have between 2 and 12 options' using errcode = 'P0001';
    end if;

    v_labels := array(select trim(o) from unnest(p_options) with ordinality as t(o, n) order by n);

    if exists (select 1 from unnest(v_labels) l where length(l) = 0) then
      raise exception 'Option labels cannot be empty' using errcode = 'P0001';
    end if;

    v_current := array(
      select label from public.prediction_options
      where prediction_id = p_prediction_id
      order by display_order, created_at
    );

    if v_labels is distinct from v_current then
      if exists (select 1 from public.bets where prediction_id = p_prediction_id) then
        raise exception 'Options can''t change once someone has bet' using errcode = 'P0001';
      end if;

      delete from public.prediction_options where prediction_id = p_prediction_id;

      for v_i in 1 .. array_length(v_labels, 1) loop
        insert into public.prediction_options (prediction_id, label, display_order)
        values (p_prediction_id, v_labels[v_i], v_i - 1);
      end loop;
    end if;
  end if;

  update public.predictions
  set title       = trim(p_title),
      deadline    = p_deadline,
      opens_at    = coalesce(v_opens_at, opens_at),
      -- A moved deadline earns a fresh "1 hour left" reminder.
      notified_1h = case when p_deadline = deadline then notified_1h else false end
  where id = p_prediction_id;

  return json_build_object(
    'id',       p_prediction_id,
    'title',    trim(p_title),
    'deadline', p_deadline,
    'opens_at', coalesce(v_opens_at, v_prediction.opens_at)
  );
end;
$$;

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

