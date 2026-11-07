-- A player asks for their account to be deleted. Requests are carried out by
-- hand with private.delete_account until there's a profile page that does it.
create or replace function public.request_account_deletion(
  p_reason text default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_request public.account_deletion_requests%rowtype;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters' using errcode = 'P0001';
  end if;

  insert into public.account_deletion_requests (player_id, reason)
  values (v_player_id, v_reason)
  on conflict (player_id) do update
  set reason = excluded.reason,
      status = 'pending',
      requested_at = now(),
      closed_at = null
  where public.account_deletion_requests.status <> 'pending'
  returning * into v_request;

  if not found then
    select * into v_request
    from public.account_deletion_requests
    where player_id = v_player_id;
  end if;

  return json_build_object(
    'status', v_request.status,
    'requested_at', v_request.requested_at
  );
end;
$$;

create or replace function public.cancel_account_deletion()
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
begin
  v_player_id := private.get_player_id_from_auth();

  update public.account_deletion_requests
  set status = 'cancelled',
      closed_at = now()
  where player_id = v_player_id
    and status = 'pending';

  if not found then
    raise exception 'No pending deletion request' using errcode = 'P0002';
  end if;

  return json_build_object('status', 'cancelled');
end;
$$;

-- The caller's pending request, or null.
create or replace function public.get_my_account_deletion()
returns json
language sql
stable
security definer
set search_path = public, private
as $$
  select json_build_object(
    'status', r.status,
    'requested_at', r.requested_at
  )
  from public.account_deletion_requests r
  where r.player_id = private.get_player_id_from_auth()
    and r.status = 'pending';
$$;

-- Admin only (run in the SQL editor; no client can call it). Deletes the
-- login and personal data but keeps the game fair for everyone else: bets,
-- wallets and results stay under an anonymous "Ghost crow" name, open bets
-- are refunded, and rooms they owned pass to the next most senior member.
create or replace function private.delete_account(
  p_player_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player public.players%rowtype;
  v_membership record;
  v_successor uuid;
  v_ghost text;
  v_rooms integer := 0;
begin
  select * into v_player
  from public.players
  where id = p_player_id
  for update;

  if not found then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;

  for v_membership in
    select rm.room_id, rm.role
    from public.room_members rm
    where rm.player_id = p_player_id
  loop
    if v_membership.role = 'owner' then
      select rm.player_id into v_successor
      from public.room_members rm
      where rm.room_id = v_membership.room_id
        and rm.player_id <> p_player_id
      order by
        case rm.role when 'organizer' then 0 when 'resolver' then 1 else 2 end,
        rm.joined_at
      limit 1;

      -- The unique-owner index allows one owner, so step down first.
      update public.room_members
      set role = 'member'
      where room_id = v_membership.room_id
        and player_id = p_player_id;

      if v_successor is not null then
        update public.room_members
        set role = 'owner'
        where room_id = v_membership.room_id
          and player_id = v_successor;
      else
        update public.rooms
        set status = 'closed'
        where id = v_membership.room_id;
      end if;
    end if;

    perform private.archive_room_member(v_membership.room_id, p_player_id, 'deleted');
    v_rooms := v_rooms + 1;
  end loop;

  update public.room_former_members
  set status = 'deleted'
  where player_id = p_player_id;

  -- Unique, recognisable, and nothing like the old name.
  v_ghost := 'Ghost crow ' || upper(left(replace(p_player_id::text, '-', ''), 6));

  update public.players
  set username = v_ghost,
      user_id = null,
      last_visited_room_id = null
  where id = p_player_id;

  delete from public.user_push_subscriptions where user_id = p_player_id;
  delete from public.room_preferences where player_id = p_player_id;
  delete from public.player_preferences where player_id = p_player_id;

  -- Last, now nothing cascades from it: the login itself.
  if v_player.user_id is not null then
    delete from auth.users where id = v_player.user_id;
  end if;

  update public.account_deletion_requests
  set status = 'done',
      closed_at = now(),
      reason = null
  where player_id = p_player_id;

  return json_build_object(
    'player_id', p_player_id,
    'username', v_ghost,
    'rooms_left', v_rooms
  );
end;
$$;
