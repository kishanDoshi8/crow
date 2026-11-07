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
