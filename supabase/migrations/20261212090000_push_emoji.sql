-- ============================================================
-- Migration: push_emoji
-- Description: The "You're in" and room invite pushes drop the bird emoji,
--   which reads as a pigeon on a lock screen: "👋 You're in" and
--   "📨 Room invite". Both functions are otherwise unchanged.
-- ============================================================

create or replace function public.decide_join_request(
  p_room_id uuid,
  p_player_id uuid,
  p_accept boolean
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid := private.get_player_id_from_auth();
  v_room public.rooms%rowtype;
  v_request public.room_join_requests%rowtype;
begin
  if not private.is_room_organizer(p_room_id) then
    raise exception 'Only owners and organizers can answer join requests' using errcode = 'P0012';
  end if;

  -- Same lock as join_room, so the last place goes to one person.
  select * into v_room from public.rooms where id = p_room_id and status = 'active' for update;
  if not found then
    raise exception 'Room not found or closed' using errcode = 'P0002';
  end if;

  select * into v_request
  from public.room_join_requests
  where room_id = p_room_id and player_id = p_player_id and status = 'pending'
  for update;

  if not found then
    raise exception 'That request has already been answered' using errcode = 'P0006';
  end if;

  if p_accept then
    if private.room_is_full(p_room_id) then
      raise exception 'This room is full' using errcode = 'P0014';
    end if;

    perform private.add_room_member(p_room_id, p_player_id, v_request.via);

    perform private.fire_push_notification(
      'join_accepted',
      null,
      p_room_id,
      '👋 You''re in',
      'Welcome to ' || v_room.name,
      '/rooms/' || v_room.room_code,
      jsonb_build_object('target_player_id', p_player_id)
    );
  end if;

  update public.room_join_requests
  set status = case when p_accept then 'accepted' else 'declined' end,
      decided_at = now(),
      decided_by = v_player_id
  where room_id = p_room_id and player_id = p_player_id;

  return json_build_object(
    'room_id', p_room_id,
    'player_id', p_player_id,
    'status', case when p_accept then 'accepted' else 'declined' end
  );
end;
$$;

create or replace function public.invite_to_room(p_room_id uuid, p_player_id uuid)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_caller_id uuid;
  v_caller_name text;
  v_room public.rooms%rowtype;
  v_invite public.room_invites%rowtype;
begin
  v_caller_id := private.get_player_id_from_auth();

  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'P0004';
  end if;

  if p_player_id is null
    or p_player_id = v_caller_id
    or not exists (select 1 from public.players where id = p_player_id)
    or not private.shares_room_with(p_player_id)
  then
    raise exception 'Player not found' using errcode = 'P0001';
  end if;

  select * into v_room from public.rooms where id = p_room_id and status = 'active';

  if not found or not exists (
    select 1 from public.room_members
    where room_id = p_room_id and player_id = v_caller_id
  ) then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  if exists (
    select 1 from public.room_members
    where room_id = p_room_id and player_id = p_player_id
  ) then
    raise exception 'They are already in this room' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.room_former_members f
    where f.room_id = p_room_id and f.player_id = p_player_id
      and f.status in ('removed', 'deleted')
  ) then
    raise exception 'They were removed from this room' using errcode = 'P0012';
  end if;

  if private.room_is_full(p_room_id) then
    raise exception 'This room is full' using errcode = 'P0014';
  end if;

  select * into v_invite
  from public.room_invites
  where room_id = p_room_id and player_id = p_player_id
  for update;

  if found and v_invite.status = 'pending' then
    return json_build_object('status', 'invited', 'room_id', p_room_id, 'player_id', p_player_id);
  end if;

  if found and v_invite.status = 'declined' and v_invite.decided_at > now() - interval '7 days' then
    raise exception 'They said no to this room recently' using errcode = 'P0013';
  end if;

  insert into public.room_invites (room_id, player_id, invited_by, status, created_at, decided_at)
  values (p_room_id, p_player_id, v_caller_id, 'pending', now(), null)
  on conflict (room_id, player_id) do update
    set invited_by = excluded.invited_by, status = 'pending',
      created_at = now(), decided_at = null;

  select username into v_caller_name from public.players where id = v_caller_id;

  -- To them alone: they aren't in the room yet, so it isn't a room push.
  perform private.fire_push_notification(
    'room_invite',
    null,
    null,
    '📨 Room invite',
    v_caller_name || ' invited you to ' || v_room.name,
    '/?tab=rooms',
    jsonb_build_object('target_player_id', p_player_id)
  );

  return json_build_object('status', 'invited', 'room_id', p_room_id, 'player_id', p_player_id);
end;
$$;
