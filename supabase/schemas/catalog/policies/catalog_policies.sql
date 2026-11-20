-- The catalog is read and written only through RPCs (security definer) and
-- the service role: no direct access for app users.
alter table catalog.competitions enable row level security;
alter table catalog.teams enable row level security;
alter table catalog.fixtures enable row level security;
alter table catalog.question_templates enable row level security;
alter table catalog.fixture_questions enable row level security;
revoke all on all tables in schema catalog from public, anon, authenticated;
revoke all on schema catalog from public, anon, authenticated;

-- Members see what their room follows; following goes through
-- set_room_competition.
alter table public.room_competitions enable row level security;
revoke all on public.room_competitions from anon;
revoke insert, update, delete, truncate, references, trigger on public.room_competitions from authenticated;
drop policy if exists "room_competitions_select" on public.room_competitions;
create policy "room_competitions_select" on public.room_competitions for select to authenticated using (private.is_room_member(room_id));
drop policy if exists "room_competitions_no_direct_write" on public.room_competitions;
create policy "room_competitions_no_direct_write" on public.room_competitions for insert with check (false);
drop policy if exists "room_competitions_no_direct_update" on public.room_competitions;
create policy "room_competitions_no_direct_update" on public.room_competitions for update using (false);
drop policy if exists "room_competitions_no_direct_delete" on public.room_competitions;
create policy "room_competitions_no_direct_delete" on public.room_competitions for delete using (false);
grant select (room_id, competition_id, followed_by, created_at) on public.room_competitions to authenticated;
