-- Scheduled predictions: written ahead by organizers, hidden from members,
-- and put live on time by the every-minute job (or early with "Go live now").

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

-- Organizers put a scheduled prediction live straight away.
create or replace function public.publish_prediction_now(p_prediction_id uuid)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_prediction public.predictions%rowtype;
begin
  select * into v_prediction from public.predictions where id = p_prediction_id;

  if not found or not private.is_room_organizer(v_prediction.room_id) then
    raise exception 'Only organizers can publish predictions' using errcode = 'P0012';
  end if;

  if v_prediction.status <> 'scheduled' then
    raise exception 'This prediction is already live' using errcode = 'P0006';
  end if;

  if v_prediction.deadline <= now() + interval '5 minutes' then
    raise exception 'The deadline is too close. Move it first' using errcode = 'P0001';
  end if;

  if private.publish_scheduled_predictions(array[p_prediction_id]) = 0 then
    raise exception 'Its series isn''t active any more' using errcode = 'P0001';
  end if;

  select * into v_prediction from public.predictions where id = p_prediction_id;
  return json_build_object(
    'id', v_prediction.id,
    'status', v_prediction.status,
    'opens_at', v_prediction.opens_at,
    'series_prediction_number', v_prediction.series_prediction_number
  );
end;
$$;

-- Organizers delete a scheduled prediction. Nobody has seen or bet on it,
-- so it goes completely (options and tags with it).
create or replace function public.delete_scheduled_prediction(p_prediction_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_prediction public.predictions%rowtype;
begin
  select * into v_prediction from public.predictions where id = p_prediction_id for update;

  if not found or not private.is_room_organizer(v_prediction.room_id) then
    raise exception 'Only organizers can delete predictions' using errcode = 'P0012';
  end if;

  if v_prediction.status <> 'scheduled' then
    raise exception 'Only scheduled predictions can be deleted. Cancel a live one instead' using errcode = 'P0006';
  end if;

  delete from public.predictions where id = p_prediction_id;
end;
$$;
