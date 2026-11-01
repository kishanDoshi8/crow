-- Each player's win streaks within one series: the current run of wins up to
-- their latest revealed bet, and the longest run. No-result and cancelled
-- predictions neither extend nor break a streak.
create or replace function private.series_streaks(
  p_series_id uuid
)
returns table (
  player_id uuid,
  current_streak integer,
  highest_streak integer
)
language sql
stable
security definer
set search_path = public, private
as $$
  with results as (
    select
      b.player_id,
      (b.option_id = p.winning_option_id) as is_win,
      row_number() over (
        partition by b.player_id
        order by p.resolved_at nulls last, p.series_prediction_number, p.id
      ) as seq
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status = 'revealed'
      and p.winning_option_id is not null
  ),
  -- Each loss starts a new group; wins after it share that group.
  grouped as (
    select
      r.*,
      sum(case when r.is_win then 0 else 1 end) over (
        partition by r.player_id order by r.seq
      ) as loss_group
    from results r
  ),
  runs as (
    select g.player_id, g.loss_group, count(*) filter (where g.is_win)::int as wins, max(g.seq) as last_seq
    from grouped g
    group by g.player_id, g.loss_group
  ),
  latest as (
    select r.player_id, max(r.seq) as last_seq
    from results r
    group by r.player_id
  )
  select
    l.player_id,
    coalesce((
      select ru.wins from runs ru
      where ru.player_id = l.player_id and ru.last_seq = l.last_seq
    ), 0) as current_streak,
    coalesce((select max(ru.wins) from runs ru where ru.player_id = l.player_id), 0) as highest_streak
  from latest l;
$$;
