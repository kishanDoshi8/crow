-- Room lookup by invite code. Members get the full room; anyone else holding the
-- code gets enough to show the join screen, since table reads are member-only.
create or replace function public.get_room_by_code(
  p_room_code text
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_room      public.rooms%rowtype;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select * into v_room
  from public.rooms
  where room_code = upper(trim(p_room_code));

  if not found then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;

  return json_build_object(
    'id',                v_room.id,
    'room_code',         v_room.room_code,
    'name',              v_room.name,
    'description',       v_room.description,
    'status',            v_room.status,
    'created_at',        v_room.created_at,
    'predictions_limit', v_room.predictions_limit,
    'result_reminder_hours', v_room.result_reminder_hours,
    'is_member',         private.is_room_member(v_room.id),
    -- Removed by the owner: the join screen explains instead of offering Join.
    'is_removed', exists (
      select 1 from public.room_former_members f
      where f.room_id = v_room.id
        and f.player_id = v_player_id
        and f.status in ('removed', 'deleted')
    ),
    'member_count', (
      select count(*)::int
      from public.room_members rm
      where rm.room_id = v_room.id
    ),
    'active_prediction_count', (
      select count(*)::int
      from public.predictions p
      where p.room_id = v_room.id
        and p.status in ('draft', 'locked')
    ),
    'organizer_username', (
      select pl.username
      from public.room_members rm
      join public.players pl on pl.id = rm.player_id
      where rm.room_id = v_room.id
        and rm.role = 'owner'
      order by rm.joined_at
      limit 1
    )
  );
end;
$$;
