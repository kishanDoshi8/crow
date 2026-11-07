-- Members of a room read its finished series' results; only complete_series
-- writes them.
alter table public.series_placements enable row level security;
alter table public.series_awards enable row level security;

drop policy if exists "series_placements_select" on public.series_placements;
create policy "series_placements_select" on public.series_placements for select to authenticated using (private.can_view_series(series_id));
drop policy if exists "series_placements_no_direct_write" on public.series_placements;
create policy "series_placements_no_direct_write" on public.series_placements for insert with check (false);
drop policy if exists "series_placements_no_direct_update" on public.series_placements;
create policy "series_placements_no_direct_update" on public.series_placements for update using (false);
drop policy if exists "series_placements_no_direct_delete" on public.series_placements;
create policy "series_placements_no_direct_delete" on public.series_placements for delete using (false);

drop policy if exists "series_awards_select" on public.series_awards;
create policy "series_awards_select" on public.series_awards for select to authenticated using (private.can_view_series(series_id));
drop policy if exists "series_awards_no_direct_write" on public.series_awards;
create policy "series_awards_no_direct_write" on public.series_awards for insert with check (false);
drop policy if exists "series_awards_no_direct_update" on public.series_awards;
create policy "series_awards_no_direct_update" on public.series_awards for update using (false);
drop policy if exists "series_awards_no_direct_delete" on public.series_awards;
create policy "series_awards_no_direct_delete" on public.series_awards for delete using (false);

grant select on public.series_placements to authenticated;
grant select on public.series_awards to authenticated;
