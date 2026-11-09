create or replace view public.series_with_stats
with (security_invoker = true) as
with series_prediction_stats as (
  select
    p.series_id,
    count(*)::int as total_predictions,
    count(*) filter (where p.status in ('draft', 'locked'))::int as active_predictions,
    count(*) filter (where p.status in ('revealed', 'no_result'))::int as completed_predictions,
    count(*) filter (where p.status = 'cancelled')::int as cancelled_predictions
  from public.predictions p
  where p.series_id is not null
    -- Not a game of the series until it goes live.
    and p.status <> 'scheduled'
  group by p.series_id
)
select
  s.id,
  s.room_id,
  s.title,
  s.description,
  s.status,
  s.expected_games,
  coalesce(sps.total_predictions, 0) as prediction_count,
  coalesce(sps.completed_predictions, 0) as completed_games,
  coalesce(sps.total_predictions, 0) as total_predictions,
  coalesce(sps.active_predictions, 0) as active_predictions,
  coalesce(sps.completed_predictions, 0) as completed_predictions,
  coalesce(sps.cancelled_predictions, 0) as cancelled_predictions,
  greatest(s.expected_games - coalesce(sps.completed_predictions, 0), 0) as remaining_games,
  case
    when s.expected_games > 0 then least(round((coalesce(sps.completed_predictions, 0)::numeric / s.expected_games::numeric) * 100, 2), 100)
    else 0::numeric
  end as progress_percentage,
  s.created_by,
  s.created_at,
  s.started_at,
  s.completed_at,
  s.archived_at,
  s.starting_stack,
  s.weekly_topup,
  s.topups_paid,
  exists (
    select 1
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = s.id
  ) as has_bets,
  s.min_bets_to_rank
from public.series s
left join series_prediction_stats sps on sps.series_id = s.id;
