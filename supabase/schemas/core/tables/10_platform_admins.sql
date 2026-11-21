-- The Crow team: who can open /admin and run the admin RPCs (confirm match
-- results, turn competitions on or off, reword fixture questions). Added by
-- hand in SQL; nothing in the app writes here.
create table if not exists public.platform_admins (
  player_id uuid primary key references public.players(id) on delete cascade,
  note text,
  added_at timestamptz not null default now()
);
