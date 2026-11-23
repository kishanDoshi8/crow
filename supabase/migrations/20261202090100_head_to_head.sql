-- Head to head: how two players who share a room compare on the questions
-- they both picked.

-- How the caller and another player compare on the questions they both
-- picked, in the rooms they share right now. Only questions with a result
-- count. The record is the questions only one of them called: "you 14, them
-- 9". Both calling it or both missing it is a draw.
create or replace function public.get_head_to_head(p_player_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_caller_id uuid;
  v_result json;
begin
  v_caller_id := private.get_player_id_from_auth();

  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'P0004';
  end if;

  if p_player_id = v_caller_id then
    raise exception 'Head to head needs another player' using errcode = 'P0001';
  end if;

  -- Same answer as get_player_profile for anyone you can't see.
  if p_player_id is null
    or not exists (select 1 from public.players where id = p_player_id)
    or not private.shares_room_with(p_player_id)
  then
    raise exception 'Player not found' using errcode = 'P0001';
  end if;

  with shared_rooms as (
    select me.room_id, r.name
    from public.room_members me
    join public.room_members them
      on them.room_id = me.room_id and them.player_id = p_player_id
    join public.rooms r on r.id = me.room_id
    where me.player_id = v_caller_id
  ),
  meetings as (
    select pred.room_id,
      mine.option_id = pred.winning_option_id as i_called,
      theirs.option_id = pred.winning_option_id as they_called
    from public.predictions pred
    join shared_rooms sr on sr.room_id = pred.room_id
    join public.bets mine
      on mine.prediction_id = pred.id and mine.player_id = v_caller_id
    join public.bets theirs
      on theirs.prediction_id = pred.id and theirs.player_id = p_player_id
    where pred.status = 'revealed'
      and pred.winning_option_id is not null
  ),
  per_room as (
    select sr.room_id, sr.name,
      count(m.room_id)::int as questions,
      count(*) filter (where m.i_called and not m.they_called)::int as you,
      count(*) filter (where m.they_called and not m.i_called)::int as them,
      count(*) filter (where m.i_called and m.they_called)::int as both_called,
      count(*) filter (where not m.i_called and not m.they_called)::int as both_missed
    from shared_rooms sr
    left join meetings m on m.room_id = sr.room_id
    group by sr.room_id, sr.name
  )
  select json_build_object(
    'player_id', p_player_id,
    'questions', coalesce(sum(pr.questions), 0)::int,
    'you', coalesce(sum(pr.you), 0)::int,
    'them', coalesce(sum(pr.them), 0)::int,
    'both_called', coalesce(sum(pr.both_called), 0)::int,
    'both_missed', coalesce(sum(pr.both_missed), 0)::int,
    -- Rooms where you've met, most meetings first.
    'rooms', coalesce(
      json_agg(row_to_json(pr) order by pr.questions desc, pr.name)
        filter (where pr.questions > 0),
      '[]'::json
    )
  )
  into v_result
  from per_room pr;

  return v_result;
end;
$$;

revoke execute on function public.get_head_to_head(uuid) from public, anon, authenticated;
grant execute on function public.get_head_to_head(uuid) to authenticated;
