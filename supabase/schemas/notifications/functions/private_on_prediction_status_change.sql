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
