-- ============================================================
-- Migration: hidden_draft_picks
-- Description: Picks stay hidden until they lock, in the database too.
--   - bets: while a prediction is open (draft) a player can read only their
--     own bet. Everyone's show once it locks. Realtime applies the same
--     policy, so other players' picks aren't broadcast while it's open.
--   - prediction_options.total_bet is no longer readable: on an open
--     prediction it showed how the picks split. authenticated had a
--     table-wide select grant, so the column list wasn't limiting anything.
--   - get_pick_counts: how many picks, points and players some predictions
--     have, without who picked what, for the open question screens.
-- ============================================================

create or replace function private.can_view_bet(p_prediction_id uuid, p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.predictions p
    where p.id = p_prediction_id
      and private.is_room_member(p.room_id)
      and (p.status <> 'scheduled' or private.is_room_organizer(p.room_id))
      and (
        p.status not in ('scheduled', 'draft')
        or p_player_id = private.get_player_id_from_auth()
      )
  );
$$;

revoke execute on function private.can_view_bet(uuid, uuid) from public, anon, authenticated;
-- Called from the bets policy, so it runs as the querying user.
grant execute on function private.can_view_bet(uuid, uuid) to authenticated;

drop policy if exists "bets_select" on public.bets;
create policy "bets_select" on public.bets for select to authenticated using (private.can_view_bet(prediction_id, player_id));

revoke select on public.prediction_options from authenticated;
grant select (id, prediction_id, label, display_order, created_at, option_key) on public.prediction_options to authenticated;

create or replace function public.get_pick_counts(p_prediction_ids uuid[])
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if exists (
    select 1 from unnest(p_prediction_ids) as ids(id)
    where not private.can_view_prediction(ids.id)
  ) then
    raise exception 'Prediction not found' using errcode = 'P0002';
  end if;

  return (
    select json_build_object(
      'picks', count(*)::int,
      'pool', coalesce(sum(b.amount), 0)::int,
      'players', count(distinct b.player_id)::int
    )
    from public.bets b
    where b.prediction_id = any(p_prediction_ids)
  );
end;
$$;

revoke execute on function public.get_pick_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_pick_counts(uuid[]) to authenticated;
