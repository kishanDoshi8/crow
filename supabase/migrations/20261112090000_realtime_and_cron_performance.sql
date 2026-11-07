-- ============================================================
-- Migration: realtime_and_cron_performance
-- Description: Less work per result and per minute.
--   1. Stop publishing tables no client listens to. room_stats and
--      player_room_stats are rewritten for every member on every result, and
--      their events were never delivered (no client can read them); rooms
--      has no listener either.
--   2. Index open and locked predictions by deadline for the every-minute
--      lock job and the reminder jobs, which look across all rooms.
-- ============================================================

do $$
declare
  v_table text;
begin
  foreach v_table in array array['rooms', 'room_stats', 'player_room_stats'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', v_table);
    end if;
  end loop;
end $$;

create index if not exists idx_predictions_open_deadline
  on public.predictions(deadline)
  where status in ('draft', 'locked');
