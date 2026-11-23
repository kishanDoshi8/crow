-- Invites are read by the person invited and the person who sent them; all
-- writes go through the invite functions.
alter table public.room_invites enable row level security;
revoke all on public.room_invites from anon;
revoke insert, update, delete, truncate, references, trigger on public.room_invites from authenticated;
drop policy if exists "room_invites_select" on public.room_invites;
create policy "room_invites_select" on public.room_invites for select to authenticated using (
  player_id = private.get_player_id_from_auth()
  or invited_by = private.get_player_id_from_auth()
);
grant select on public.room_invites to authenticated;
