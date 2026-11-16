-- Cron, every 10 minutes: push room staff about predictions that locked a
-- while ago (rooms.result_reminder_hours past the deadline) and still have
-- no result. Each prediction is pushed once.
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
