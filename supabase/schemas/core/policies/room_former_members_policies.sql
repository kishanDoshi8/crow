-- Read and written only through the membership RPCs.
alter table public.room_former_members enable row level security;
revoke all on public.room_former_members from anon, authenticated;
