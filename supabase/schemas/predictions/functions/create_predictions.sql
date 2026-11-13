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
