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
  v_was_inserted boolean := false;
  v_former_status text;
  v_ref       text;
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

  select * into v_room
  from public.rooms
  where room_code = upper(trim(p_room_code))
    and status = 'active';

  if not found then
    raise exception 'Room not found or closed' using errcode = 'P0002';
  end if;

  -- Former members come back with their stats; removed ones need the owner's OK.
  select f.status into v_former_status
  from public.room_former_members f
  where f.room_id = v_room.id
    and f.player_id = v_player_id
  for update;

  if v_former_status in ('removed', 'deleted') then
    raise exception 'You were removed from this room. Ask the owner to let you back in.' using errcode = 'P0012';
  elsif v_former_status = 'left' then
    perform private.restore_room_member(v_room.id, v_player_id);
    -- Series that started while they were away need a wallet.
    perform private.ensure_series_wallet(s.id, v_player_id)
    from public.series s
    where s.room_id = v_room.id
      and s.status = 'active';
  end if;

  insert into public.room_members (room_id, player_id, joined_via)
  values (v_room.id, v_player_id, v_ref)
  on conflict (room_id, player_id) do nothing
  returning * into v_member;

  if found then
    v_was_inserted := true;
  else
    select * into v_member
    from public.room_members
    where room_id = v_room.id and player_id = v_player_id;
  end if;

  if v_was_inserted then
    perform private.ensure_series_wallet(s.id, v_player_id)
    from public.series s
    where s.room_id = v_room.id
      and s.status = 'active';

    perform private.create_room_activity(
      p_room_id := v_room.id,
      p_activity_type := 'room_joined',
      p_activity_tier := 2,
      p_metadata := jsonb_build_object(
        'member', jsonb_build_object(
          'id', v_player.id,
          'username', v_player.username
        )
      ),
      p_created_by_player_id := v_player.id,
      p_dedupe_key := 'room_joined:' || v_room.id::text || ':' || v_player.id::text
    );
  end if;

  return json_build_object(
    'id',           v_room.id,
    'code',         v_room.room_code,
    'name',         v_room.name,
    'status',       v_room.status,
    'player_id',    v_player_id,
    'username',     v_player.username,
    'is_organizer', v_member.is_organizer,
    'role',         v_member.role,
    'created_at',   v_room.created_at
  );
end;
$$;
