-- Adds a player to a room: a former member who left comes back with their
-- stats, a new one is inserted; either way they get a wallet in each active
-- series and a "joined" post. Used by join_room and by accepting a join
-- request. The caller has checked the room's policy and its member limit.
create or replace function private.add_room_member(
  p_room_id uuid,
  p_player_id uuid,
  p_via text default null
)
returns public.room_members
language plpgsql
set search_path = public, private
as $$
declare
  v_member public.room_members%rowtype;
  v_username text;
begin
  if exists (
    select 1 from public.room_former_members f
    where f.room_id = p_room_id and f.player_id = p_player_id and f.status = 'left'
  ) then
    perform private.restore_room_member(p_room_id, p_player_id);
  end if;

  insert into public.room_members (room_id, player_id, joined_via)
  values (p_room_id, p_player_id, p_via)
  on conflict (room_id, player_id) do nothing
  returning * into v_member;

  if not found then
    -- Already in (or just restored): nothing new to announce.
    select * into v_member
    from public.room_members
    where room_id = p_room_id and player_id = p_player_id;
  else
    select username into v_username from public.players where id = p_player_id;
    perform private.create_room_activity(
      p_room_id := p_room_id,
      p_activity_type := 'room_joined',
      p_activity_tier := 2,
      p_metadata := jsonb_build_object(
        'member', jsonb_build_object('id', p_player_id, 'username', v_username)
      ),
      p_created_by_player_id := p_player_id,
      p_dedupe_key := 'room_joined:' || p_room_id::text || ':' || p_player_id::text
    );
  end if;

  -- Series that started while they were away (or before they came) need a wallet.
  perform private.ensure_series_wallet(s.id, p_player_id)
  from public.series s
  where s.room_id = p_room_id
    and s.status = 'active';

  return v_member;
end;
$$;

-- Whether a room has no space left for another member.
create or replace function private.room_is_full(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select (select count(*) from public.room_members rm where rm.room_id = r.id) >= r.member_limit
  from public.rooms r
  where r.id = p_room_id;
$$;

-- Joins a room by its code. A room whose join policy is "request" records a
-- join request instead (membership: 'requested'), for its owners and
-- organizers to decide. A full room can't be joined; someone the owner
-- removed can't come back until let back in.
create or replace function public.join_room(
  p_room_code text,
  p_ref text default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_player    public.players%rowtype;
  v_room      public.rooms%rowtype;
  v_member    public.room_members%rowtype;
  v_request   public.room_join_requests%rowtype;
  v_ref       text;
  v_membership text := 'member';
begin
  -- Which shared link brought them in, e.g. "brag-card"; anything else is dropped.
  v_ref := lower(trim(p_ref));
  if v_ref !~ '^[a-z][a-z-]{0,31}$' then
    v_ref := null;
  end if;

  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select * into v_player from public.players where id = v_player_id;

  -- Locked, so two people can't both take the last place.
  select * into v_room
  from public.rooms
  where room_code = upper(trim(p_room_code))
    and status = 'active'
  for update;

  if not found then
    raise exception 'Room not found or closed' using errcode = 'P0002';
  end if;

  select * into v_member
  from public.room_members
  where room_id = v_room.id and player_id = v_player_id;

  if not found then
    if exists (
      select 1 from public.room_former_members f
      where f.room_id = v_room.id and f.player_id = v_player_id
        and f.status in ('removed', 'deleted')
    ) then
      raise exception 'You were removed from this room. Ask the owner to let you back in.' using errcode = 'P0012';
    end if;

    if private.room_is_full(v_room.id) then
      raise exception 'This room is full' using errcode = 'P0014';
    end if;

    if v_room.join_policy = 'request' then
      select * into v_request
      from public.room_join_requests
      where room_id = v_room.id and player_id = v_player_id
      for update;

      if found and v_request.status = 'declined' and v_request.decided_at > now() - interval '7 days' then
        raise exception 'Your request was declined. You can ask again after %.',
          to_char(v_request.decided_at + interval '7 days', 'Mon FMDD')
          using errcode = 'P0013';
      end if;

      if not found or v_request.status <> 'pending' then
        insert into public.room_join_requests (room_id, player_id, status, via, created_at, decided_at, decided_by)
        values (v_room.id, v_player_id, 'pending', v_ref, now(), null, null)
        on conflict (room_id, player_id) do update
          set status = 'pending', via = excluded.via, created_at = now(), decided_at = null, decided_by = null;

        perform private.fire_push_notification(
          'join_request',
          null,
          v_room.id,
          '🙋 Join request',
          v_player.username || ' wants to join ' || v_room.name,
          '/rooms/' || v_room.room_code || '/members',
          jsonb_build_object('roles', jsonb_build_array('owner', 'organizer'))
        );
      end if;

      v_membership := 'requested';
    else
      v_member := private.add_room_member(v_room.id, v_player_id, v_ref);
    end if;
  end if;

  return json_build_object(
    'id',           v_room.id,
    'code',         v_room.room_code,
    'name',         v_room.name,
    'status',       v_room.status,
    'player_id',    v_player_id,
    'username',     v_player.username,
    'membership',   v_membership,
    'is_organizer', v_member.is_organizer,
    'role',         v_member.role,
    'created_at',   v_room.created_at
  );
end;
$$;
