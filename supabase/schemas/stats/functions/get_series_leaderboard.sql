create or replace function public.get_series_leaderboard(
  p_room_id uuid,
  p_series_id uuid,
  p_sort_by text default 'points'
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_caller_id uuid;
  v_is_member boolean;
  v_series public.series%rowtype;
  v_required integer;
  v_result json;
  v_week_key text := private.current_week_key();
  v_has_snapshot boolean;
begin
  v_caller_id := private.get_player_id_from_auth();
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'P0004';
  end if;

  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and player_id = v_caller_id
  ) into v_is_member;

  if not v_is_member then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  select * into v_series
  from public.series s
  where s.id = p_series_id
    and s.room_id = p_room_id;

  if not found then
    raise exception 'Series not found for this room' using errcode = 'P0002';
  end if;

  if p_sort_by not in ('points', 'rating', 'accuracy', 'streak') then
    raise exception 'Invalid sort mode: %', p_sort_by using errcode = 'P0001';
  end if;

  v_required := private.series_required_bets(p_series_id);

  -- Movement is measured against this week's Monday snapshot.
  select exists (
    select 1 from public.series_standing_snapshots
    where series_id = p_series_id and week_key = v_week_key
  ) into v_has_snapshot;

  with stats as (
    select *
    from private.get_leaderboard_player_stats(
      p_room_id,
      p_series_id,
      false
    )
  ),
  base_current as (
    select
      rm.player_id,
      p.username,
      coalesce(s.net_profit, 0) as total_won_in_room,
      -- Series that closed before wallets existed fall back to stack + profit.
      coalesce(w.balance, v_series.starting_stack + coalesce(s.net_profit, 0)::int) as balance,
      coalesce(w.balance - w.escrow, v_series.starting_stack + coalesce(s.net_profit, 0)::int) as available,
      coalesce(w.granted, v_series.starting_stack) as granted,
      rm.joined_at,
      rm.is_organizer,
      -- Streaks count this series only.
      coalesce(st.current_streak, 0) as current_streak,
      coalesce(st.highest_streak, 0) as highest_streak,
      rm.prediction_rating,
      rm.peak_prediction_rating,
      rm.rated_predictions_count,
      coalesce(s.total_bets, 0) as total_bets,
      coalesce(s.total_revealed_bets, 0) as total_revealed_bets,
      coalesce(s.winning_bets, 0) as winning_bets,
      coalesce(s.total_wagered, 0) as total_wagered,
      coalesce(s.total_payout, 0) as total_payout,
      coalesce(s.total_profit, 0) as total_profit,
      coalesce(s.total_loss, 0) as total_loss,
      coalesce(s.net_profit, 0) as net_points,
      case
        when coalesce(s.total_revealed_bets, 0) > 0 then
          round((coalesce(s.winning_bets, 0)::numeric / s.total_revealed_bets) * 100, 1)
        else 0
      end as win_percentage,
      case
        when coalesce(s.total_revealed_bets, 0) > 0 then
          coalesce(s.winning_bets, 0)::numeric / s.total_revealed_bets
      end as accuracy_ratio,
      -- Only players who bet on enough settled predictions are ranked.
      coalesce(s.total_bets, 0) >= v_required as is_ranked,
      greatest(v_required - coalesce(s.total_bets, 0), 0)::int as bets_needed
    from public.room_members rm
    join public.players p on p.id = rm.player_id
    left join stats s on s.player_id = rm.player_id
    left join private.series_streaks(p_series_id) st on st.player_id = rm.player_id
    left join public.series_wallets w on w.series_id = p_series_id and w.player_id = rm.player_id
    where rm.room_id = p_room_id
  ),
  ranked as (
    select
      bc.*,
      case when bc.is_ranked then rank() over (
        partition by bc.is_ranked
        order by
          case when p_sort_by = 'points' then bc.balance end desc nulls last,
          case when p_sort_by = 'points' then bc.winning_bets end desc nulls last,
          case when p_sort_by = 'rating' then bc.prediction_rating end desc nulls last,
          case when p_sort_by = 'rating' then bc.rated_predictions_count end desc nulls last,
          case when p_sort_by = 'accuracy' then bc.accuracy_ratio end desc nulls last,
          case when p_sort_by = 'accuracy' then bc.total_revealed_bets end desc nulls last,
          case when p_sort_by = 'streak' then bc.current_streak end desc nulls last,
          case when p_sort_by = 'streak' then bc.highest_streak end desc nulls last,
          bc.joined_at asc nulls last
      ) end as rank
    from base_current bc
  )
  -- Ranked players first, then everyone still short of the bar, closest first.
  select json_agg(lb order by lb.rank nulls last, lb.bets_needed, lb.username, lb.player_id)
  into v_result
  from (
    select
      r.player_id,
      r.username,
      r.total_won_in_room,
      r.balance,
      r.available,
      r.granted,
      r.joined_at,
      r.is_organizer,
      r.current_streak,
      r.highest_streak,
      r.prediction_rating,
      r.peak_prediction_rating,
      r.rated_predictions_count,
      r.total_bets,
      r.total_revealed_bets,
      r.winning_bets,
      r.total_wagered,
      r.total_payout,
      r.net_points,
      r.net_points as net_profit,
      r.win_percentage,
      r.rank,
      r.is_ranked,
      r.bets_needed,
      v_required as required_bets,
      -- Movement since Monday, for the points standings only.
      case when p_sort_by = 'points' then snap.rank end as previous_rank,
      case
        when p_sort_by = 'points' and r.rank is not null and snap.rank is not null
          then snap.rank - r.rank
      end as rank_change,
      -- Ranked now but not on Monday (joined late or just reached the bar).
      (p_sort_by = 'points' and v_has_snapshot and r.rank is not null
        and not coalesce(snap.is_ranked, false)) as rank_is_new,
      null::numeric as previous_prediction_rating,
      null::numeric as rating_change,
      null::numeric as previous_total_won_in_room,
      null::numeric as points_change
    from ranked r
    left join public.series_standing_snapshots snap
      on snap.series_id = p_series_id
     and snap.player_id = r.player_id
     and snap.week_key = v_week_key
  ) lb;

  return coalesce(v_result, '[]'::json);
end;
$$;

