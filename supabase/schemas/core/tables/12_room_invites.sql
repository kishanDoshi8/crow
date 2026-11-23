-- A player asking someone they already play with to join one of their
-- rooms. One row per person per room, reused if they're asked again. Written
-- only by invite_to_room and respond_to_room_invite.
create table if not exists public.room_invites (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  invited_by uuid references public.players(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (room_id, player_id)
);

-- Someone's invites waiting on them.
create index if not exists idx_room_invites_pending on public.room_invites (player_id, created_at desc) where status = 'pending';
create index if not exists idx_room_invites_invited_by on public.room_invites (invited_by);
