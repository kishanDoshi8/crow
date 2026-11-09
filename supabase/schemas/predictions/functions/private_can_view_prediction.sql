-- Who can see a prediction: room members, except scheduled ones, which only
-- organizers see until they go live. Used by RLS on predictions, options,
-- tags and bets, and by the functions that read one prediction.
create or replace function private.can_view_prediction(p_prediction_id uuid)
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
  );
$$;
