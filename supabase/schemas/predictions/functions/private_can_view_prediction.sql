-- Used by RLS policies on options, tags and bets.
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
  );
$$;
