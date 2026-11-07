-- Read only through the stats RPCs (security definer); no direct access.
alter table public.room_stats enable row level security;
