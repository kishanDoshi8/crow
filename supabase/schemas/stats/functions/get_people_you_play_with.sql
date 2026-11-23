-- Everyone you share a room with right now, most shared rooms first, with
-- the rooms you share. Worked out from rooms alone: there are no friend
-- requests.
create or replace function public.get_people_you_play_with()
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
    select json_agg(row_to_json(x) order by x.shared_rooms desc, lower(x.username))
    from (
      select p.id as player_id, p.username,
        count(*)::int as shared_rooms,
        json_agg(
          json_build_object('room_id', r.id, 'name', r.name)
          order by r.name
        ) as rooms
      from public.room_members me
      join public.room_members them
        on them.room_id = me.room_id and them.player_id <> me.player_id
      join public.rooms r on r.id = me.room_id
      join public.players p on p.id = them.player_id
      where me.player_id = v_caller_id
      group by p.id, p.username
    ) x
  ), '[]'::json);
end;
$$;
