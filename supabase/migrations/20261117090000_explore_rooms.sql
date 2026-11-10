-- ============================================================
-- Migration: explore_rooms
-- Description: Public rooms in Explore, join requests, and a member cap.
--   Rooms gain: listed (shown in Explore), join_policy ('open': anyone
--   with the link or code joins; 'request': owners and organizers let
--   people in) and member_limit (default 50, set only by the operator).
--   join_room honours the cap and the policy (a request-only room records
--   a request instead); owners and organizers accept or decline requests,
--   which show in Needs you with a push to them. Existing rooms stay
--   private and open, so nothing changes for them.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rooms: who can find and join, and how many fit
-- ------------------------------------------------------------
alter table public.rooms
  add column if not exists listed boolean not null default false,
  add column if not exists join_policy text not null default 'open',
  add column if not exists member_limit integer not null default 50;

alter table public.rooms
  drop constraint if exists rooms_join_policy_check,
  add constraint rooms_join_policy_check check (join_policy in ('open', 'request')),
  drop constraint if exists rooms_member_limit_check,
  add constraint rooms_member_limit_check check (member_limit >= 1);

-- Rooms already past the default keep everyone; the limit stops new joins only.

create index if not exists idx_rooms_listed on public.rooms (created_at desc) where listed and status = 'active';

grant select (id, room_code, name, description, status, created_at, result_reminder_hours, listed, join_policy, member_limit) on public.rooms to authenticated;


-- ------------------------------------------------------------
-- 2. Join requests
-- ------------------------------------------------------------
-- People asking to join a room whose join policy is "request". One row per
-- person per room, reused if they ask again; owners and organizers decide.
create table if not exists public.room_join_requests (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  -- How they found the room: 'explore', or the ref of the link they used.
  via text check (via is null or via ~ '^[a-z][a-z-]{0,31}$'),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.players(id) on delete set null,
  primary key (room_id, player_id)
);

-- Staff's list of requests waiting on them.
create index if not exists idx_room_join_requests_pending on public.room_join_requests (room_id, created_at) where status = 'pending';
create index if not exists idx_room_join_requests_player on public.room_join_requests (player_id);

-- Requests are read by the person who asked and by the room's owners and
-- organizers; all writes go through the join request functions.
alter table public.room_join_requests enable row level security;
revoke all on public.room_join_requests from anon;
revoke insert, update, delete, truncate, references, trigger on public.room_join_requests from authenticated;
drop policy if exists "room_join_requests_select" on public.room_join_requests;
create policy "room_join_requests_select" on public.room_join_requests for select to authenticated using (
  player_id = private.get_player_id_from_auth()
  or private.is_room_organizer(room_id)
);
grant select on public.room_join_requests to authenticated;

-- ------------------------------------------------------------
-- 3. Joining, requests, Explore and settings
-- ------------------------------------------------------------
drop function if exists public.update_room(uuid, text, text, integer);

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

-- Join requests and Explore. Requests come from join_room on a room whose
-- join policy is "request"; owners and organizers let people in or decline.

-- The asker withdraws their pending request.
create or replace function public.cancel_join_request(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid := private.get_player_id_from_auth();
begin
  update public.room_join_requests
  set status = 'cancelled', decided_at = now(), decided_by = v_player_id
  where room_id = p_room_id
    and player_id = v_player_id
    and status = 'pending';

  if not found then
    raise exception 'No request to cancel' using errcode = 'P0002';
  end if;
end;
$$;

-- Owners and organizers let someone in (p_accept) or decline them. A full
-- room can't take them; someone declined can ask again after 7 days.
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
      '🐦 You''re in',
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

-- Owners and organizers: who's waiting to be let in, oldest first.
create or replace function public.get_room_join_requests(p_room_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_room_organizer(p_room_id) then
    raise exception 'Only owners and organizers can see join requests' using errcode = 'P0012';
  end if;

  return coalesce(
    (
      select json_agg(
        json_build_object(
          'player_id', r.player_id,
          'username', p.username,
          'via', r.via,
          'created_at', r.created_at
        )
        order by r.created_at
      )
      from public.room_join_requests r
      join public.players p on p.id = r.player_id
      where r.room_id = p_room_id
        and r.status = 'pending'
    ),
    '[]'::json
  );
end;
$$;

-- Explore: active public rooms, busiest first, optionally matching a search.
-- Only what a room's public card shows; nothing about its members.
create or replace function public.get_explore_rooms(
  p_search text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid := private.get_player_id_from_auth();
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  return coalesce(
    (
      select json_agg(row_to_json(x) order by x.last_activity_at desc nulls last, x.member_count desc, x.name)
      from (
        select * from (
        select
          r.id,
          r.room_code,
          r.name,
          r.description,
          r.join_policy,
          r.member_limit,
          (select count(*)::int from public.room_members rm where rm.room_id = r.id) as member_count,
          (
            select s.title from public.series s
            where s.room_id = r.id and s.status = 'active'
            order by s.created_at desc
            limit 1
          ) as series_title,
          (
            select count(*)::int from public.predictions p
            where p.room_id = r.id and p.status = 'draft'
          ) as open_prediction_count,
          (
            select max(a.created_at) from public.room_activities a where a.room_id = r.id
          ) as last_activity_at,
          case
            when exists (
              select 1 from public.room_members rm
              where rm.room_id = r.id and rm.player_id = v_player_id
            ) then 'member'
            when exists (
              select 1 from public.room_former_members f
              where f.room_id = r.id and f.player_id = v_player_id and f.status in ('removed', 'deleted')
            ) then 'removed'
            when exists (
              select 1 from public.room_join_requests q
              where q.room_id = r.id and q.player_id = v_player_id and q.status = 'pending'
            ) then 'requested'
          end as my_status
        from public.rooms r
        where r.listed
          and r.status = 'active'
          and (v_search is null or r.name ilike '%' || replace(replace(v_search, '%', '\%'), '_', '\_') || '%')
        ) c
        -- Busiest first: most recent activity, then the most members.
        order by c.last_activity_at desc nulls last, c.member_count desc, c.name
        limit least(greatest(coalesce(p_limit, 30), 1), 50)
        offset greatest(coalesce(p_offset, 0), 0)
      ) x
    ),
    '[]'::json
  );
end;
$$;

-- Owner only. Room name, description, staff settings, and who can find and
-- join the room. The member limit isn't here: only the operator sets it.
create or replace function public.update_room(
  p_room_id               uuid,
  p_name                  text,
  p_description           text,
  p_result_reminder_hours integer,
  p_listed                boolean,
  p_join_policy           text
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

  if p_listed is null or p_join_policy is null or p_join_policy not in ('open', 'request') then
    raise exception 'Choose who can find and join the room' using errcode = 'P0001';
  end if;

  update public.rooms
  set name                  = trim(p_name),
      description           = nullif(trim(coalesce(p_description, '')), ''),
      result_reminder_hours = p_result_reminder_hours,
      listed                = p_listed,
      join_policy           = p_join_policy
  where id = p_room_id
  returning * into v_room;

  if not found then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;

  return json_build_object(
    'id',                    v_room.id,
    'name',                  v_room.name,
    'description',           v_room.description,
    'result_reminder_hours', v_room.result_reminder_hours,
    'listed',                v_room.listed,
    'join_policy',           v_room.join_policy
  );
end;
$$;

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
    'result_reminder_hours', v_room.result_reminder_hours,
    'listed',            v_room.listed,
    'join_policy',       v_room.join_policy,
    'member_limit',      v_room.member_limit,
    'is_full',           private.room_is_full(v_room.id),
    -- The caller's own pending request, for the join screen.
    'has_pending_request', exists (
      select 1 from public.room_join_requests q
      where q.room_id = v_room.id
        and q.player_id = v_player_id
        and q.status = 'pending'
    ),
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

-- Staff only. Everything waiting on staff across the room, oldest first:
-- locked predictions to close, predictions still open for picks, and (for
-- organizers) scheduled ones by when they go live and join requests.
create or replace function public.get_room_manage_queue(
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
  v_role      text;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id
    and player_id = v_player_id;

  if v_role is null or v_role not in ('owner', 'organizer', 'resolver') then
    raise exception 'Only room staff can see the manage queue' using errcode = 'P0012';
  end if;

  return (
    with queue as (
      select
        p.id,
        p.title,
        p.status,
        p.deadline,
        p.opens_at,
        p.series_id,
        p.series_prediction_number,
        s.title as series_title,
        (select count(*)::int from public.bets b where b.prediction_id = p.id) as bet_count,
        (
          select coalesce(sum(po.total_bet), 0)::int
          from public.prediction_options po
          where po.prediction_id = p.id
        ) as total_pool,
        (
          select json_agg(
            json_build_object('id', po.id, 'label', po.label, 'display_order', po.display_order)
            order by po.display_order
          )
          from public.prediction_options po
          where po.prediction_id = p.id
        ) as options
      from public.predictions p
      left join public.series s on s.id = p.series_id
      where p.room_id = p_room_id
        and (
          p.status in ('draft', 'locked')
          -- Scheduled ones are for organizers (resolvers don't create).
          or (p.status = 'scheduled' and v_role in ('owner', 'organizer'))
        )
    )
    select json_build_object(
      'role', v_role,
      'to_resolve', coalesce(
        (select json_agg(q order by q.deadline, q.id) from queue q where q.status = 'locked'),
        '[]'::json
      ),
      'open', coalesce(
        (select json_agg(q order by q.deadline, q.id) from queue q where q.status = 'draft'),
        '[]'::json
      ),
      'scheduled', coalesce(
        (select json_agg(q order by q.opens_at, q.id) from queue q where q.status = 'scheduled'),
        '[]'::json
      ),
      -- Owners and organizers: people waiting to be let in, oldest first.
      'join_requests', case
        when v_role in ('owner', 'organizer') then public.get_room_join_requests(p_room_id)
        else '[]'::json
      end
    )
  );
end;
$$;

-- ------------------------------------------------------------
-- 4. Function access
-- ------------------------------------------------------------
revoke execute on function private.add_room_member(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function private.room_is_full(uuid) from public, anon, authenticated;
revoke execute on function public.update_room(uuid, text, text, integer, boolean, text) from public, anon, authenticated;
revoke execute on function public.cancel_join_request(uuid) from public, anon, authenticated;
revoke execute on function public.decide_join_request(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.get_room_join_requests(uuid) from public, anon, authenticated;
revoke execute on function public.get_explore_rooms(text, integer, integer) from public, anon, authenticated;
grant execute on function public.update_room(uuid, text, text, integer, boolean, text) to authenticated;
grant execute on function public.cancel_join_request(uuid) to authenticated;
grant execute on function public.decide_join_request(uuid, uuid, boolean) to authenticated;
grant execute on function public.get_room_join_requests(uuid) to authenticated;
grant execute on function public.get_explore_rooms(text, integer, integer) to authenticated;
