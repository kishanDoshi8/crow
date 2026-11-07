create table if not exists public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  -- owner (one per room), organizer, resolver or member.
  role text not null default 'member' check (role in ('owner', 'organizer', 'resolver', 'member')),
  is_organizer boolean generated always as (role in ('owner', 'organizer')) stored,
  total_won_in_room integer not null default 0,
  prediction_rating integer not null default 1500,
  peak_prediction_rating integer not null default 1500,
  rated_predictions_count integer not null default 0,
  rating_system_version smallint not null default 1,
  joined_at timestamptz not null default now(),
  current_streak integer not null default 0 check (current_streak >= 0),
  highest_streak integer not null default 0 check (highest_streak >= 0),
  -- The ?ref= of the shared link that brought this member in, if any.
  joined_via text,
  -- When this member last opened the room's activity feed.
  last_activity_seen_at timestamptz,
  unique (room_id, player_id)
);
create index if not exists idx_room_members_room_id on public.room_members(room_id);
create unique index if not exists idx_room_members_one_owner on public.room_members(room_id) where role = 'owner';
create index if not exists idx_room_members_player_id on public.room_members(player_id);
create index if not exists idx_room_members_leaderboard on public.room_members(room_id, total_won_in_room desc);
create index if not exists idx_room_members_prediction_rating on public.room_members(room_id, prediction_rating desc);
create index if not exists idx_room_members_room_prediction_rating on public.room_members(room_id, prediction_rating desc);
