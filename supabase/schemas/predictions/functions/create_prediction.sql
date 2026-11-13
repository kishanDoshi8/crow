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
