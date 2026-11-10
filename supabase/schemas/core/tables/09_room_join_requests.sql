-- People asking to join a room whose join policy is "request". One row per
-- person per room, reused if they ask again; owners and organizers decide.
create table if not exists public.room_join_requests (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  -- How they found the room: 'explore', or the ref of the link they used.
  via text check (via is null or via ~ '^[a-z][a-z-]{0,31}$'),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.players(id) on delete set null,
  primary key (room_id, player_id)
);

-- Staff's list of requests waiting on them.
create index if not exists idx_room_join_requests_pending on public.room_join_requests (room_id, created_at) where status = 'pending';
create index if not exists idx_room_join_requests_player on public.room_join_requests (player_id);
