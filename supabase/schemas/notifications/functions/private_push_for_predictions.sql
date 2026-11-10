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
