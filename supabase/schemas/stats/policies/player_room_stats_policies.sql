-- Read only through the stats RPCs (security definer); no direct access.
alter table public.player_room_stats enable row level security;
