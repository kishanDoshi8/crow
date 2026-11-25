-- One push per room for a set of predictions that changed together (went
-- live, locked, got results...), instead of one per prediction. A room with
-- one prediction in the set gets the usual push that opens it; a room with
-- several gets a single push that opens the room. p_title_many is the title
-- for several, with %s where the count goes.
--
-- Reminders and results are written for each player instead
-- (push_personal_for_predictions), so the titles passed for those are not
-- used. New questions say when picks close; locking says who picked what
-- is now there to see.
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
  v_title_one text := p_title_one;
  v_title_many text := p_title_many;
  v_closes text;
begin
  if p_event_type in ('deadline_1h', 'result_revealed') then
    perform private.push_personal_for_predictions(p_event_type, p_prediction_ids);
    return;
  end if;

  if p_event_type = 'prediction_locked' then
    v_title_one := '🔒 Picks locked: see who picked what';
    v_title_many := '🔒 Picks locked on %s questions';
  end if;

  for v_room in
    select r.id, r.name, r.room_code,
      count(*)::int as n,
      (array_agg(p.id order by p.deadline, p.series_prediction_number, p.id))[1] as first_id,
      (array_agg(p.title order by p.deadline, p.series_prediction_number, p.id))[1] as first_title,
      (array_agg(p.series_id order by p.deadline, p.series_prediction_number, p.id))[1] as first_series_id,
      (array_agg(p.series_prediction_number order by p.deadline, p.series_prediction_number, p.id))[1] as first_number,
      count(distinct p.event_id)::int as events,
      bool_and(p.event_id is not null) as all_in_events,
      min(e.title) as event_title,
      min(p.deadline) as first_deadline,
      max(p.deadline) as last_deadline
    from public.predictions p
    join public.rooms r on r.id = p.room_id
    left join public.prediction_events e on e.id = p.event_id
    where p.id = any(p_prediction_ids)
    group by r.id
  loop
    -- New questions say when picks close: "closes in 5h", or "first closes"
    -- when a set's deadlines differ.
    v_closes := case
      when p_event_type <> 'prediction_live' then ''
      when v_room.first_deadline = v_room.last_deadline
        then ' · closes ' || private.push_closes_in(v_room.first_deadline)
      else ' · first closes ' || private.push_closes_in(v_room.first_deadline)
    end;
    if v_room.n = 1 then
      select title into v_series_title from public.series where id = v_room.first_series_id;
      perform private.fire_push_notification(
        p_event_type,
        v_room.first_id,
        v_room.id,
        v_title_one,
        coalesce(v_room.name, 'Your room') || ' · ' || v_room.first_title || v_closes,
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
        replace(v_title_many, '%s', v_room.n::text),
        coalesce(v_room.name, 'Your room') || ' · ' || v_about
          || case when p_event_type = 'prediction_locked' then '. See who picked what.' else v_closes end,
        '/rooms/' || v_room.room_code,
        jsonb_build_object('predictionCount', v_room.n)
      );
    end if;
  end loop;
end;
$$;
