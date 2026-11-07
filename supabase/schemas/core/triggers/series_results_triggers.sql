drop trigger if exists trg_series_placements_immutable on public.series_placements;
create trigger trg_series_placements_immutable
before update or delete on public.series_placements
for each row execute function private.prevent_series_result_mutation();

drop trigger if exists trg_series_awards_immutable on public.series_awards;
create trigger trg_series_awards_immutable
before update or delete on public.series_awards
for each row execute function private.prevent_series_result_mutation();
