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
