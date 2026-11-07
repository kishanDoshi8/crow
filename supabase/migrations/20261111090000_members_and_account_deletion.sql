-- ============================================================
-- Migration: members_and_account_deletion
-- Description: Members can leave a room and owners can remove them. Their
--   bets and results stay, so history keeps their name; their room stats
--   wait in room_former_members and come back if they rejoin. Removed players
--   need the owner to let them back in. Players can ask for their account to
--   be deleted; private.delete_account carries a request out by hand.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------

-- core/tables/06_room_former_members
-- People who left a room, were removed, or deleted their account. Their bets,
-- wallets and results stay where they are, so history keeps their name; this
-- row keeps their room stats so rejoining picks up where they left off.
--   left:    can rejoin with the code any time
--   removed: can rejoin only after the owner lets them back in
--   deleted: the account is gone (the player row is anonymised)
create table if not exists public.room_former_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null check (status in ('left', 'removed', 'deleted')),
  -- The room_members row as it was, restored on rejoin (role resets to member).
  member jsonb not null,
  left_at timestamptz not null default now(),
  removed_by uuid references public.players(id) on delete set null,
  primary key (room_id, player_id)
);

-- core/policies/room_former_members_policies
-- Read and written only through the membership RPCs.
alter table public.room_former_members enable row level security;
revoke all on public.room_former_members from anon, authenticated;

-- core/tables/07_account_deletion_requests
-- Players asking for their account to be deleted. Processed by hand for now
-- with private.delete_account (see docs/account-deletion.md).
create table if not exists public.account_deletion_requests (
  player_id uuid primary key references public.players(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'done')),
  requested_at timestamptz not null default now(),
  -- When it was cancelled or carried out.
  closed_at timestamptz
);

create index if not exists idx_account_deletion_requests_pending
  on public.account_deletion_requests (requested_at)
  where status = 'pending';

-- core/policies/account_deletion_requests_policies
-- Read and written only through the account deletion RPCs.
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;

-- ------------------------------------------------------------
-- 2. Functions
-- ------------------------------------------------------------

-- core/functions/room_membership
-- Hands back a player's stakes on predictions in a room that are still open
-- for picks. Locked ones stay and settle as normal.
create or replace function private.release_open_bets(
  p_room_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
set search_path = public, private
as $$
declare
  v_bet record;
begin
  for v_bet in
    select b.id, b.option_id, b.amount, p.series_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.room_id = p_room_id
      and p.status = 'draft'
      and b.player_id = p_player_id
    for update of b
  loop
    update public.prediction_options
    set total_bet = total_bet - v_bet.amount
    where id = v_bet.option_id;

    update public.series_wallets
    set escrow     = escrow - v_bet.amount,
        updated_at = now()
    where series_id = v_bet.series_id
      and player_id = p_player_id;

    delete from public.bets where id = v_bet.id;
  end loop;
end;
$$;

-- Moves a member out of the room: open bets come back, their room stats are
-- kept for a rejoin, and they drop out of standings, pushes and room access.
create or replace function private.archive_room_member(
  p_room_id uuid,
  p_player_id uuid,
  p_status text,
  p_removed_by uuid default null
)
returns void
language plpgsql
set search_path = public, private
as $$
declare
  v_member public.room_members%rowtype;
begin
  select * into v_member
  from public.room_members
  where room_id = p_room_id
    and player_id = p_player_id
  for update;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  perform private.release_open_bets(p_room_id, p_player_id);

  insert into public.room_former_members (room_id, player_id, status, member, left_at, removed_by)
  values (p_room_id, p_player_id, p_status, to_jsonb(v_member), now(), p_removed_by)
  on conflict (room_id, player_id) do update
  set status = excluded.status,
      member = excluded.member,
      left_at = excluded.left_at,
      removed_by = excluded.removed_by;

  delete from public.room_members where id = v_member.id;

  delete from public.player_room_stats
  where room_id = p_room_id
    and user_id = p_player_id;
  perform private.refresh_room_featured_streaks(p_room_id);

  update public.players
  set last_visited_room_id = null
  where id = p_player_id
    and last_visited_room_id = p_room_id;
end;
$$;

-- Puts a former member back with the stats they left with, as a plain member.
create or replace function private.restore_room_member(
  p_room_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
set search_path = public, private
as $$
declare
  v_saved public.room_members%rowtype;
begin
  select (jsonb_populate_record(null::public.room_members, f.member)).*
  into v_saved
  from public.room_former_members f
  where f.room_id = p_room_id
    and f.player_id = p_player_id;

  if not found then
    return;
  end if;

  insert into public.room_members (
    id, room_id, player_id, role, total_won_in_room, prediction_rating,
    peak_prediction_rating, rated_predictions_count, rating_system_version,
    joined_at, current_streak, highest_streak, joined_via
  )
  values (
    v_saved.id, p_room_id, p_player_id, 'member', v_saved.total_won_in_room,
    v_saved.prediction_rating, v_saved.peak_prediction_rating,
    v_saved.rated_predictions_count, v_saved.rating_system_version,
    v_saved.joined_at, v_saved.current_streak, v_saved.highest_streak,
    v_saved.joined_via
  )
  on conflict (room_id, player_id) do nothing;

  delete from public.room_former_members
  where room_id = p_room_id
    and player_id = p_player_id;
end;
$$;

-- The owner removes someone. They can't rejoin with the code until the owner
-- lets them back in.
create or replace function public.remove_room_member(
  p_room_id uuid,
  p_player_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_target public.room_members%rowtype;
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
    raise exception 'Only the room owner can remove members' using errcode = 'P0012';
  end if;

  select * into v_target
  from public.room_members
  where room_id = p_room_id
    and player_id = p_player_id;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if v_target.role = 'owner' then
    raise exception 'The owner can''t be removed. Transfer ownership first.' using errcode = 'P0001';
  end if;

  perform private.archive_room_member(p_room_id, p_player_id, 'removed', v_player_id);

  return json_build_object('player_id', p_player_id, 'status', 'removed');
end;
$$;

-- A member leaves. They can come back with the code whenever they like.
create or replace function public.leave_room(
  p_room_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_member public.room_members%rowtype;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select * into v_member
  from public.room_members
  where room_id = p_room_id
    and player_id = v_player_id;

  if not found then
    raise exception 'You''re not in this room' using errcode = 'P0011';
  end if;

  if v_member.role = 'owner' then
    raise exception 'Hand the room to someone else before you leave' using errcode = 'P0001';
  end if;

  perform private.archive_room_member(p_room_id, v_player_id, 'left');

  return json_build_object('room_id', p_room_id, 'status', 'left');
end;
$$;

-- The owner lets a removed player rejoin with the code.
create or replace function public.allow_room_member_back(
  p_room_id uuid,
  p_player_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
begin
  v_player_id := private.get_player_id_from_auth();

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and player_id = v_player_id
      and role = 'owner'
  ) then
    raise exception 'Only the room owner can let members back in' using errcode = 'P0012';
  end if;

  update public.room_former_members
  set status = 'left',
      removed_by = null
  where room_id = p_room_id
    and player_id = p_player_id
    and status = 'removed';

  if not found then
    raise exception 'No removed player to let back in' using errcode = 'P0002';
  end if;

  return json_build_object('player_id', p_player_id, 'status', 'left');
end;
$$;

-- Members see who used to be in the room, so old results keep their names.
-- Only the owner sees who was removed rather than left.
create or replace function public.get_room_former_members(
  p_room_id uuid
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_is_owner boolean;
begin
  v_player_id := private.get_player_id_from_auth();

  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  select exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and player_id = v_player_id
      and role = 'owner'
  ) into v_is_owner;

  return coalesce((
    select json_agg(
      json_build_object(
        'player_id', f.player_id,
        'username', p.username,
        'status', case
          when f.status = 'removed' and not v_is_owner then 'left'
          else f.status
        end,
        'left_at', f.left_at
      )
      order by f.left_at desc
    )
    from public.room_former_members f
    join public.players p on p.id = f.player_id
    where f.room_id = p_room_id
  ), '[]'::json);
end;
$$;

-- core/functions/join_room
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

-- core/functions/get_room_by_code
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

-- core/functions/account_deletion
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

-- ------------------------------------------------------------
-- 3. Access
-- ------------------------------------------------------------
revoke execute on function private.release_open_bets(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.archive_room_member(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function private.restore_room_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.delete_account(uuid) from public, anon, authenticated;
revoke execute on function public.remove_room_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.leave_room(uuid) from public, anon, authenticated;
revoke execute on function public.allow_room_member_back(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.get_room_former_members(uuid) from public, anon, authenticated;
revoke execute on function public.request_account_deletion(text) from public, anon, authenticated;
revoke execute on function public.cancel_account_deletion() from public, anon, authenticated;
revoke execute on function public.get_my_account_deletion() from public, anon, authenticated;
grant execute on function public.remove_room_member(uuid, uuid) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;
grant execute on function public.allow_room_member_back(uuid, uuid) to authenticated;
grant execute on function public.get_room_former_members(uuid) to authenticated;
grant execute on function public.request_account_deletion(text) to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;
grant execute on function public.get_my_account_deletion() to authenticated;
