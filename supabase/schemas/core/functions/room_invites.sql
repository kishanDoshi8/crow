-- Room invites: asking someone you already play with to join another of
-- your rooms. Only people who share a room with you can be invited, so a
-- stranger can't be sent invites.

-- Your rooms you could invite another player to, each with whether you can:
-- 'available', 'invited' (waiting on them), 'full', or 'unavailable' (the
-- owner removed them, or they said no in the last 7 days). Rooms they're
-- already in are left out.
create or replace function public.get_invitable_rooms(p_player_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_caller_id uuid;
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

  return coalesce((
    select json_agg(row_to_json(x) order by x.name)
    from (
      select r.id as room_id, r.name, r.room_code,
        (select count(*)::int from public.room_members c where c.room_id = r.id) as member_count,
        case
          when exists (
            select 1 from public.room_former_members f
            where f.room_id = r.id and f.player_id = p_player_id
              and f.status in ('removed', 'deleted')
          ) then 'unavailable'
          when i.status = 'declined' and i.decided_at > now() - interval '7 days' then 'unavailable'
          when i.status = 'pending' then 'invited'
          when private.room_is_full(r.id) then 'full'
          else 'available'
        end as invite_status
      from public.room_members me
      join public.rooms r on r.id = me.room_id and r.status = 'active'
      left join public.room_invites i on i.room_id = r.id and i.player_id = p_player_id
      where me.player_id = v_caller_id
        and not exists (
          select 1 from public.room_members them
          where them.room_id = r.id and them.player_id = p_player_id
        )
    ) x
  ), '[]'::json);
end;
$$;

-- Invites a player you share a room with to another of your rooms, and
-- pushes them. Asking again while an invite is waiting does nothing.
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
    '🐦 Room invite',
    v_caller_name || ' invited you to ' || v_room.name,
    '/?tab=rooms',
    jsonb_build_object('target_player_id', p_player_id)
  );

  return json_build_object('status', 'invited', 'room_id', p_room_id, 'player_id', p_player_id);
end;
$$;

-- Your invites waiting on you, newest first. needs_approval: the room asks
-- to approve new players and whoever invited you isn't a host there, so
-- saying yes sends a join request.
create or replace function public.get_my_room_invites()
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := private.get_player_id_from_auth();

  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'P0004';
  end if;

  return coalesce((
    select json_agg(row_to_json(x) order by x.created_at desc)
    from (
      select r.id as room_id, r.name as room_name, r.room_code,
        (select count(*)::int from public.room_members c where c.room_id = r.id) as member_count,
        i.invited_by as invited_by_id,
        p.username as invited_by_username,
        i.created_at,
        r.join_policy = 'request' and not private.invited_by_host(i.room_id, i.invited_by) as needs_approval
      from public.room_invites i
      join public.rooms r on r.id = i.room_id and r.status = 'active'
      left join public.players p on p.id = i.invited_by
      where i.player_id = v_caller_id
        and i.status = 'pending'
        and not exists (
          select 1 from public.room_members m
          where m.room_id = i.room_id and m.player_id = v_caller_id
        )
    ) x
  ), '[]'::json);
end;
$$;

-- Whether a room's invite came from one of its owners or organizers, who
-- can let people in without a join request.
create or replace function private.invited_by_host(p_room_id uuid, p_invited_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room_id and m.player_id = p_invited_by
      and m.role in ('owner', 'organizer')
  );
$$;

-- Says yes or no to an invite. Yes joins the room as join_room would, with
-- one difference: when a host invited you, a room that asks to approve new
-- players lets you straight in. Returns the room's code and 'member' or
-- 'requested' on yes.
create or replace function public.respond_to_room_invite(p_room_id uuid, p_accept boolean)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_caller_id uuid;
  v_invite public.room_invites%rowtype;
  v_room public.rooms%rowtype;
  v_username text;
  v_joined json;
begin
  v_caller_id := private.get_player_id_from_auth();

  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'P0004';
  end if;

  select * into v_invite
  from public.room_invites
  where room_id = p_room_id and player_id = v_caller_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;

  if not p_accept then
    update public.room_invites
    set status = 'declined', decided_at = now()
    where room_id = p_room_id and player_id = v_caller_id;
    return json_build_object('room_id', p_room_id, 'membership', null);
  end if;

  select * into v_room from public.rooms where id = p_room_id and status = 'active' for update;
  if not found then
    raise exception 'Room not found or closed' using errcode = 'P0002';
  end if;

  if v_room.join_policy = 'request'
    and private.invited_by_host(p_room_id, v_invite.invited_by)
    and not exists (
      select 1 from public.room_members
      where room_id = p_room_id and player_id = v_caller_id
    )
  then
    if exists (
      select 1 from public.room_former_members f
      where f.room_id = p_room_id and f.player_id = v_caller_id
        and f.status in ('removed', 'deleted')
    ) then
      raise exception 'You were removed from this room. Ask the owner to let you back in.' using errcode = 'P0012';
    end if;

    if private.room_is_full(p_room_id) then
      raise exception 'This room is full' using errcode = 'P0014';
    end if;

    perform private.add_room_member(p_room_id, v_caller_id, 'invite');

    -- A request they may have sent before is settled by the invite.
    update public.room_join_requests
    set status = 'accepted', decided_at = now(), decided_by = v_invite.invited_by
    where room_id = p_room_id and player_id = v_caller_id and status = 'pending';

    select username into v_username from public.players where id = v_caller_id;
    perform private.fire_push_notification(
      'member_joined',
      null,
      p_room_id,
      '👋 New player',
      v_username || ' joined ' || v_room.name,
      '/rooms/' || v_room.room_code || '/members',
      jsonb_build_object('roles', jsonb_build_array('owner', 'organizer'))
    );

    v_joined := json_build_object('membership', 'member');
  else
    -- Open rooms, rooms they're back in, and invites from players: the
    -- same as joining with the code.
    v_joined := public.join_room(v_room.room_code, 'invite');
  end if;

  update public.room_invites
  set status = 'accepted', decided_at = now()
  where room_id = p_room_id and player_id = v_caller_id;

  return json_build_object(
    'room_id', p_room_id,
    'code', v_room.room_code,
    'name', v_room.name,
    'membership', v_joined->>'membership'
  );
end;
$$;
