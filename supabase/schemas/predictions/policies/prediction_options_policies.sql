alter table public.prediction_options enable row level security;
revoke all on public.prediction_options from anon;
revoke insert, update, delete, truncate, references, trigger on public.prediction_options from authenticated;
drop policy if exists "prediction_options_select" on public.prediction_options;
create policy "prediction_options_select" on public.prediction_options for select to authenticated using (private.can_view_prediction(prediction_id));
drop policy if exists "prediction_options_no_direct_write" on public.prediction_options;
create policy "prediction_options_no_direct_write" on public.prediction_options for insert with check (false);
drop policy if exists "prediction_options_no_direct_update" on public.prediction_options;
create policy "prediction_options_no_direct_update" on public.prediction_options for update using (false);
drop policy if exists "prediction_options_no_direct_delete" on public.prediction_options;
create policy "prediction_options_no_direct_delete" on public.prediction_options for delete using (false);
-- total_bet is not granted: on an open prediction it would show how the
-- picks split. get_pick_counts gives the totals without the split.
revoke select on public.prediction_options from authenticated;
grant select (id, prediction_id, label, display_order, created_at, option_key) on public.prediction_options to authenticated;
