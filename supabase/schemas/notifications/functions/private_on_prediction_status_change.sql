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
begin
  if coalesce(current_setting('crow.skip_prediction_push', true), '') = 'on' then
    return NEW;
  end if;

  -- New prediction published (draft = live for betting). Through
  -- push_for_predictions, like a set of one, so it says when picks close.
  if TG_OP = 'INSERT' and NEW.status = 'draft' then
    perform private.push_for_predictions(
      'prediction_live',
      array[NEW.id],
      '🎯 New question',
      '🎯 %s new questions'
    );

  -- Staff closed the prediction (win, no_result, or cancelled). Open
  -- predictions can be cancelled too, which refunds everyone. Each player
  -- hears what happened to their own pick.
  elsif TG_OP = 'UPDATE'
    and (
      (OLD.status = 'locked' and NEW.status in ('revealed', 'no_result', 'cancelled'))
      or (OLD.status = 'draft' and NEW.status = 'cancelled')
    )
  then
    perform private.push_personal_for_predictions('result_revealed', array[NEW.id]);
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
      '🔒 Picks locked: see who picked what',
      '🔒 Picks locked on %s questions'
    );
  end if;

  return null;
end;
$$;
