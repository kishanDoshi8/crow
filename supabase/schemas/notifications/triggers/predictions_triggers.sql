drop trigger if exists trg_predictions_push_notification on public.predictions;
create trigger trg_predictions_push_notification
after insert or update of status on public.predictions
for each row execute function private.on_prediction_status_change();

-- Transition tables can't be combined with "update of status", so this runs
-- on every update and does nothing unless something locked.
drop trigger if exists trg_predictions_locked_push on public.predictions;
create trigger trg_predictions_locked_push
after update on public.predictions
referencing old table as old_rows new table as new_rows
for each statement execute function private.on_predictions_locked();
