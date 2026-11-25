-- Up next ideas that are a Crow competition: the room's pick links to it, so
-- a host can start the next series following it, and /admin can count what
-- rooms ask for. Null: something Crow doesn't have yet (the title says what).
-- Here, not with series_suggestions, because it must load after
-- catalog.competitions.
alter table public.series_suggestions
  add column if not exists competition_id uuid references catalog.competitions(id) on delete set null;

-- One open idea per competition in a room.
create unique index if not exists uq_series_suggestions_open_competition
  on public.series_suggestions (room_id, competition_id)
  where status = 'open' and competition_id is not null;
