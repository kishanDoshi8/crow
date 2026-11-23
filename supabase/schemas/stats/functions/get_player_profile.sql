-- A player's profile across rooms: who they are, their career numbers, the
-- rooms behind them, and every trophy and milestone they hold.
--
-- Without p_player_id it's the caller's own profile, over all their rooms.
-- With someone else's id it covers only the rooms the caller shares with
-- them, so a profile never shows a room the caller isn't in. Players who
-- share no room with the caller can't be looked up at all.
--
-- Numbers use the same definitions as get_room_member_stats, so a room's
-- line here matches that room's player card.
create or replace function public.get_player_profile(p_player_id uuid default null)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_caller_id uuid;
  v_target_id uuid;
  v_result json;
begin
  v_caller_id := private.get_player_id_from_auth();

  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'P0004';
  end if;

  v_target_id := coalesce(p_player_id, v_caller_id);

  -- One error for "no such player" and "no shared room", so the function
  -- can't be used to find out who plays Crow.
  if not exists (select 1 from public.players where id = v_target_id)
    or (v_target_id <> v_caller_id and not private.shares_room_with(v_target_id))
  then
    raise exception 'Player not found' using errcode = 'P0001';
  end if;

  with rooms_in_view as (
    select rm.room_id, rm.role, rm.joined_at, rm.total_won_in_room,
      rm.rated_predictions_count, rm.highest_streak, r.name, r.room_code, r.status
    from public.room_members rm
    join public.rooms r on r.id = rm.room_id
    where rm.player_id = v_target_id
      and (
        v_target_id = v_caller_id
        or exists (
          select 1 from public.room_members me
          where me.room_id = rm.room_id and me.player_id = v_caller_id
        )
      )
  ),
  room_ranks as (
    select rm.room_id, rm.player_id,
      rank() over (partition by rm.room_id order by rm.total_won_in_room desc) as points_rank,
      count(*) over (partition by rm.room_id) as member_count
    from public.room_members rm
    where rm.room_id in (select room_id from rooms_in_view)
  ),
  room_predictions as (
    select pred.room_id,
      count(*)::int as total_predictions,
      count(*) filter (
        where pred.status = 'revealed' and b.option_id = pred.winning_option_id
      )::int as winning_predictions
    from public.bets b
    join public.predictions pred on pred.id = b.prediction_id
    where b.player_id = v_target_id
      and pred.room_id in (select room_id from rooms_in_view)
      and pred.status in ('revealed', 'cancelled', 'no_result')
    group by pred.room_id
  ),
  finished_series as (
    select s.id, s.room_id, s.title, s.tier, s.completed_at, v.name as room_name
    from public.series s
    join rooms_in_view v on v.room_id = s.room_id
    where s.status in ('completed', 'archived')
  ),
  placements as (
    select sp.id, sp.series_id, fs.title as series_title, sp.placement,
      sp.points, fs.tier as series_tier, fs.completed_at as series_completed_at,
      sp.collected_at, sp.created_at, fs.room_id, fs.room_name
    from public.series_placements sp
    join finished_series fs on fs.id = sp.series_id
    where sp.player_id = v_target_id
  ),
  awards as (
    select sa.id, sa.series_id, fs.title as series_title, sa.award_type,
      sa.description, sa.value, sa.tier as award_tier, fs.tier as series_tier,
      fs.completed_at as series_completed_at, sa.collected_at, sa.created_at,
      fs.room_id, fs.room_name
    from public.series_awards sa
    join finished_series fs on fs.id = sa.series_id
    where sa.player_id = v_target_id
  ),
  milestones as (
    select m.id, m.room_id, v.name as room_name, m.milestone_type,
      m.achieved_at, m.series_id
    from public.room_member_milestones m
    join rooms_in_view v on v.room_id = m.room_id
    where m.player_id = v_target_id
  ),
  room_lines as (
    select v.room_id, v.name, v.room_code, v.status, v.role, v.joined_at,
      v.total_won_in_room as points,
      rr.points_rank,
      rr.member_count::int as member_count,
      coalesce(rp.total_predictions, 0) as total_predictions,
      coalesce(rp.winning_predictions, 0) as winning_predictions,
      v.rated_predictions_count as total_rated_predictions,
      v.highest_streak as highest_win_streak,
      (select count(*)::int from placements pl
        where pl.room_id = v.room_id and pl.placement = 1) as championships
    from rooms_in_view v
    join room_ranks rr on rr.room_id = v.room_id and rr.player_id = v_target_id
    left join room_predictions rp on rp.room_id = v.room_id
  )
  select json_build_object(
    'player', json_build_object(
      'id', p.id,
      'username', p.username,
      'joined_at', p.created_at,
      'activity_streak', p.current_streak,
      'longest_activity_streak', p.longest_streak
    ),
    'is_self', v_target_id = v_caller_id,
    'totals', (
      select json_build_object(
        'rooms', count(*)::int,
        'total_predictions', coalesce(sum(rl.total_predictions), 0)::int,
        'winning_predictions', coalesce(sum(rl.winning_predictions), 0)::int,
        'total_rated_predictions', coalesce(sum(rl.total_rated_predictions), 0)::int,
        'highest_win_streak', coalesce(max(rl.highest_win_streak), 0),
        'championships', (select count(*)::int from placements where placement = 1),
        'podiums', (select count(*)::int from placements),
        'awards', (select count(*)::int from awards),
        'milestones', (select count(*)::int from milestones)
      )
      from room_lines rl
    ),
    -- Rooms with titles first, then where they rank best, then newest.
    'rooms', coalesce((
      select json_agg(row_to_json(rl) order by rl.championships desc, rl.points_rank, rl.joined_at desc)
      from room_lines rl
    ), '[]'::json),
    'championships', coalesce((
      select json_agg(row_to_json(pl) order by pl.created_at desc) from placements pl
    ), '[]'::json),
    'awards', coalesce((
      select json_agg(row_to_json(a) order by a.created_at desc) from awards a
    ), '[]'::json),
    'milestones', coalesce((
      select json_agg(row_to_json(m) order by m.achieved_at desc) from milestones m
    ), '[]'::json)
  )
  into v_result
  from public.players p
  where p.id = v_target_id;

  return v_result;
end;
$$;
