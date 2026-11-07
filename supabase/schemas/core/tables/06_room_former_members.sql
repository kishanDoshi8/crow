-- People who left a room, were removed, or deleted their account. Their bets,
-- wallets and results stay where they are, so history keeps their name; this
-- row keeps their room stats so rejoining picks up where they left off.
--   left:    can rejoin with the code any time
--   removed: can rejoin only after the owner lets them back in
--   deleted: the account is gone (the player row is anonymised)
create table if not exists public.room_former_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null check (status in ('left', 'removed', 'deleted')),
  -- The room_members row as it was, restored on rejoin (role resets to member).
  member jsonb not null,
  left_at timestamptz not null default now(),
  removed_by uuid references public.players(id) on delete set null,
  primary key (room_id, player_id)
);
