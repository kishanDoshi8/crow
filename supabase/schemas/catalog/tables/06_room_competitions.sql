-- The competitions a room follows. Its fixtures show up in the room's
-- Fixtures view, ready to add to whichever series is active.
create table if not exists public.room_competitions (
  room_id uuid not null references public.rooms(id) on delete cascade,
  competition_id uuid not null references catalog.competitions(id) on delete cascade,
  followed_by uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (room_id, competition_id)
);
