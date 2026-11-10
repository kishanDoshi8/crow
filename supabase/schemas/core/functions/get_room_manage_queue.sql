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
        -- The event it was made for, to group a set together.
        p.event_id,
        e.title as event_title,
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
      left join public.prediction_events e on e.id = p.event_id
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
