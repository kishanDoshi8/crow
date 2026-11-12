-- ============================================================
-- Migration: late_joiners_and_join_pushes
-- Description: Two changes to joining a room.
--   1. A late joiner used to start with the smallest top-up total
--   among active players, so one player who only started betting late
--   pulled every newcomer back to the bare starting stack. They now start
--   with the stack plus half the top-ups of the most topped-up active
--   player, still capped at what every top-up so far adds up to.
--   2. Joining an open room pushes its owners and organizers
--   ('member_joined'), as a join request already does.
-- ============================================================

-- Gives a player their wallet for a series if they don't have one yet.
-- A late joiner starts with the starting stack plus half the top-ups the
-- most topped-up active player has been granted: a fair catch-up that still
-- leaves them behind anyone who showed up every week. Active means they've
-- bet in the series; with no bettors yet, it's the stack.
create or replace function private.ensure_series_wallet(
  p_series_id uuid,
  p_player_id uuid
)
returns void
language sql
security definer
set search_path = public, private
as $$
  insert into public.series_wallets (series_id, player_id, balance, granted)
  select s.id, p_player_id, start.points, start.points
  from public.series s
  cross join lateral (
    select least(
      s.starting_stack + round(0.5 * greatest(
        coalesce(
          (
            select max(w.granted)
            from public.series_wallets w
            where w.series_id = s.id
              and exists (
                select 1
                from public.bets b
                join public.predictions p on p.id = b.prediction_id
                where p.series_id = s.id
                  and b.player_id = w.player_id
              )
          ),
          s.starting_stack
        ) - s.starting_stack,
        0
      ))::int,
      s.starting_stack + s.weekly_topup * s.topups_paid
    ) as points
  ) start
  where s.id = p_series_id
    and s.status = 'active'
  on conflict (series_id, player_id) do nothing;
$$;

-- Joins a room by its code, and pushes the room's owners and organizers.
-- A room whose join policy is "request" records a join request instead
-- (membership: 'requested'), for its owners and organizers to decide. A
-- full room can't be joined; someone the owner removed can't come back until
-- let back in.
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

      -- Owners and organizers hear about it, as they do about a request.
      perform private.fire_push_notification(
        'member_joined',
        null,
        v_room.id,
        '👋 New member',
        v_player.username || ' joined ' || v_room.name,
        '/rooms/' || v_room.room_code || '/members',
        jsonb_build_object('roles', jsonb_build_array('owner', 'organizer'))
      );
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
