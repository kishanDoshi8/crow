-- Owner only. Room name, description and staff settings.
create or replace function public.update_room(
  p_room_id               uuid,
  p_name                  text,
  p_description           text,
  p_result_reminder_hours integer
)
returns json
language plpgsql
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

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and player_id = v_player_id
      and role = 'owner'
  ) then
    raise exception 'Only the room owner can change room settings' using errcode = 'P0012';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Room name cannot be empty' using errcode = 'P0001';
  end if;

  if length(trim(p_name)) > 50 then
    raise exception 'Room name must be 50 characters or fewer' using errcode = 'P0001';
  end if;

  if length(coalesce(p_description, '')) > 240 then
    raise exception 'Description must be 240 characters or fewer' using errcode = 'P0001';
  end if;

  if p_result_reminder_hours is null or p_result_reminder_hours not between 1 and 48 then
    raise exception 'Result reminder must be between 1 and 48 hours' using errcode = 'P0001';
  end if;

  update public.rooms
  set name                  = trim(p_name),
      description           = nullif(trim(coalesce(p_description, '')), ''),
      result_reminder_hours = p_result_reminder_hours
  where id = p_room_id
  returning * into v_room;

  if not found then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;

  return json_build_object(
    'id',                    v_room.id,
    'name',                  v_room.name,
    'description',           v_room.description,
    'result_reminder_hours', v_room.result_reminder_hours
  );
end;
$$;
