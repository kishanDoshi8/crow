-- Requests are read by the person who asked and by the room's owners and
-- organizers; all writes go through the join request functions.
alter table public.room_join_requests enable row level security;
revoke all on public.room_join_requests from anon;
revoke insert, update, delete, truncate, references, trigger on public.room_join_requests from authenticated;
drop policy if exists "room_join_requests_select" on public.room_join_requests;
create policy "room_join_requests_select" on public.room_join_requests for select to authenticated using (
  player_id = private.get_player_id_from_auth()
  or private.is_room_organizer(room_id)
);
grant select on public.room_join_requests to authenticated;
