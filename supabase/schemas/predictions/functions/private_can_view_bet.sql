-- Who can see a bet: anyone who can see its prediction, except that while
-- the prediction is open for picks (draft) players see only their own, so
-- nobody copies. Everyone's picks show once it locks. Used by RLS on bets,
-- which Realtime also applies before sending a change to a subscriber.
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
