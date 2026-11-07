create or replace function public.get_room_has_unseen_activities(
  p_room_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_last_activity_seen_at timestamptz;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select rm.last_activity_seen_at
  into v_last_activity_seen_at
  from public.room_members rm
  where rm.room_id = p_room_id
    and rm.player_id = v_player_id;

  if not found then
    raise exception 'Only room members can view room activities' using errcode = 'P0013';
  end if;

  return exists (
    select 1
    from public.room_activities ra
    where ra.room_id = p_room_id
      and (
        v_last_activity_seen_at is null
        or ra.created_at > v_last_activity_seen_at
      )
  );
end;
$$;

create or replace function public.mark_room_activities_seen(
  p_room_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not exists (
    select 1
    from public.room_members rm
    where rm.room_id = p_room_id
      and rm.player_id = v_player_id
  ) then
    raise exception 'Only room members can view room activities' using errcode = 'P0013';
  end if;

  update public.room_members
  set last_activity_seen_at = now()
  where room_id = p_room_id
    and player_id = v_player_id;
end;
$$;
