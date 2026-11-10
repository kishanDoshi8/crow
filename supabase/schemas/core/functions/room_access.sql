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
