
create or replace view public.player_rooms_by_activity
with (security_invoker = true) as
select distinct on (rm.player_id, r.id)
  rm.player_id,
  r.id as room_id,
  r.name,
  r.room_code,
  r.status,              -- 🌟 Added
  r.created_at,
  -- 1. Compute the latest activity timestamp
  p.created_at as latest_prediction_at,
  -- 2. Dynamically count total room members
  (
    select count(*)::int 
    from public.room_members sub_rm 
    where sub_rm.room_id = r.id
  ) as member_count,
  -- 3. Dynamically count active predictions
  (
    select count(*)::int 
    from public.predictions sub_p 
    where sub_p.room_id = r.id 
      and sub_p.status in ('draft', 'locked')
  ) as active_prediction_count
from public.room_members rm
join public.rooms r on r.id = rm.room_id
-- Scheduled predictions don't count as activity until they go live.
left join public.predictions p on p.room_id = r.id and p.status <> 'scheduled'
order by rm.player_id, r.id, p.created_at desc;
