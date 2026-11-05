-- Rebuilds room win streaks for some players from their revealed results, in
-- the order the results came in. A corrected result can't simply be undone
-- because a loss resets the streak, so it's recounted instead. No-result and
-- cancelled predictions neither extend nor break a streak.
create or replace function private.recompute_room_streaks(
  p_room_id uuid,
  p_player_ids uuid[]
)
returns void
language sql
set search_path = public, private
as $$
  with results as (
    select
      b.player_id,
      (b.option_id = p.winning_option_id) as is_win,
      row_number() over (
        partition by b.player_id
        order by p.resolved_at nulls last, p.created_at, p.id
      ) as seq
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.room_id = p_room_id
      and p.status = 'revealed'
      and p.winning_option_id is not null
      and b.player_id = any(p_player_ids)
  ),
  grouped as (
    select
      r.*,
      sum(case when r.is_win then 0 else 1 end) over (
        partition by r.player_id order by r.seq
      ) as loss_group
    from results r
  ),
  runs as (
    select
      g.player_id,
      g.loss_group,
      count(*) filter (where g.is_win)::int as wins,
      max(g.seq) as last_seq
    from grouped g
    group by g.player_id, g.loss_group
  ),
  streaks as (
    select
      ids.player_id,
      coalesce((
        select ru.wins from runs ru
        where ru.player_id = ids.player_id
        order by ru.last_seq desc
        limit 1
      ), 0) as current_streak,
      coalesce((select max(ru.wins) from runs ru where ru.player_id = ids.player_id), 0) as highest_streak
    from unnest(p_player_ids) as ids(player_id)
  )
  update public.room_members rm
  set current_streak = s.current_streak,
      highest_streak = s.highest_streak
  from streaks s
  where rm.room_id = p_room_id
    and rm.player_id = s.player_id;
$$;
