-- Series standings rank by net points (won minus put on settled picks), not by
-- wallet, so top-ups and starting points don't count. The live table, the
-- weekly snapshots, the champion and the podium all use the same ranking.
-- Finished series keep the results they were given.

alter table public.series_standing_snapshots add column if not exists net_points integer;

-- It returns net_points now, so it's recreated rather than replaced.
drop function if exists private.series_standings(uuid);
-- A series' points standings: ranked players by net points (won minus put on
-- settled picks, so top-ups and starting points don't count), then winning
-- bets, then who joined first. Same rule as get_series_leaderboard's points
-- sort (tests keep the two in step). Decides champions, podium trophies and
-- the weekly snapshots. Unranked players get a null rank. balance is still
-- returned: snapshots keep it.
create or replace function private.series_standings(
  p_series_id uuid
)
returns table (
  player_id uuid,
  rank integer,
  is_ranked boolean,
  balance integer,
  net_points integer
)
language sql
stable
security definer
set search_path = public, private
as $$
  with series as (
    select s.id, s.room_id, s.starting_stack, private.series_required_bets(s.id) as required
    from public.series s
    where s.id = p_series_id
  ),
  stats as (
    select st.*
    from series se
    cross join lateral private.get_leaderboard_player_stats(se.room_id, se.id, false) st
  ),
  members as (
    select
      rm.player_id,
      rm.joined_at,
      coalesce(w.balance, se.starting_stack + coalesce(st.net_profit, 0)::int) as balance,
      coalesce(st.net_profit, 0) as net_points,
      coalesce(st.winning_bets, 0) as winning_bets,
      coalesce(st.total_bets, 0) >= se.required as is_ranked
    from series se
    join public.room_members rm on rm.room_id = se.room_id
    left join stats st on st.player_id = rm.player_id
    left join public.series_wallets w on w.series_id = se.id and w.player_id = rm.player_id
  )
  select
    m.player_id,
    case when m.is_ranked then (rank() over (
      partition by m.is_ranked
      order by m.net_points desc, m.winning_bets desc, m.joined_at asc
    ))::int end as rank,
    m.is_ranked,
    m.balance,
    m.net_points::int
  from members m;
$$;

revoke execute on function private.series_standings(uuid) from public, anon, authenticated;

-- One series' standings as they stood when the week ended. Safe to repeat.
create or replace function private.snapshot_one_series(p_series_id uuid, p_week_key text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.series_standing_snapshots (series_id, player_id, week_key, rank, is_ranked, balance, net_points)
  select p_series_id, st.player_id, p_week_key, st.rank, st.is_ranked, st.balance, st.net_points
  from private.series_standings(p_series_id) st
  on conflict (series_id, player_id, week_key) do nothing;
end;
$$;

-- Every active series' snapshot, in one go (the Monday job runs them one by
-- one through private.run_weekly_jobs instead). Safe to run twice in a week.
create or replace function private.snapshot_series_standings()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_week_key text := private.current_week_key();
  v_series   record;
  v_count    integer := 0;
begin
  for v_series in
    select s.id from public.series s where s.status = 'active'
  loop
    perform private.snapshot_one_series(v_series.id, v_week_key);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

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
          -- Points: net points (won minus put on settled picks), so weekly
          -- top-ups and starting points don't count; the wallet is shown beside it.
          case when p_sort_by = 'points' then bc.net_points end desc nulls last,
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


-- The last completed week of a series for the weekly share card: the top 5
-- and the biggest climber and faller, comparing the latest Monday snapshot
-- with the one before. Null until the first snapshot.
create or replace function public.get_series_weekly_recap(
  p_room_id   uuid,
  p_series_id uuid
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_caller_id   uuid;
  v_latest      text;
  v_previous    text;
  v_week_number integer;
begin
  v_caller_id := private.get_player_id_from_auth();
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id and player_id = v_caller_id
  ) then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  if not exists (
    select 1 from public.series where id = p_series_id and room_id = p_room_id
  ) then
    raise exception 'Series not found for this room' using errcode = 'P0002';
  end if;

  -- Week keys look like 2026-W44, so text order is time order.
  select max(week_key), count(distinct week_key)::int
  into v_latest, v_week_number
  from public.series_standing_snapshots
  where series_id = p_series_id;

  if v_latest is null then
    return null;
  end if;

  select max(week_key) into v_previous
  from public.series_standing_snapshots
  where series_id = p_series_id and week_key < v_latest;

  return (
    with latest as (
      select s.player_id, s.rank, s.balance, s.net_points
      from public.series_standing_snapshots s
      where s.series_id = p_series_id and s.week_key = v_latest and s.rank is not null
    ),
    previous as (
      select s.player_id, s.rank
      from public.series_standing_snapshots s
      where s.series_id = p_series_id and s.week_key = v_previous and s.rank is not null
    ),
    moves as (
      select
        l.player_id,
        p.username,
        l.rank,
        l.balance,
        l.net_points,
        pv.rank - l.rank as rank_change,
        v_previous is not null and pv.rank is null as is_new
      from latest l
      join public.players p on p.id = l.player_id
      left join previous pv on pv.player_id = l.player_id
    )
    select json_build_object(
      'week_key', v_latest,
      'week_number', v_week_number,
      'has_previous', v_previous is not null,
      'standings', coalesce((
        select json_agg(json_build_object(
          'rank', m.rank,
          'username', m.username,
          'balance', m.balance,
          'net_points', m.net_points,
          'rank_change', m.rank_change,
          'is_new', m.is_new
        ) order by m.rank, m.username)
        from (select * from moves order by rank, username limit 5) m
      ), '[]'::json),
      'climber', (
        select json_build_object('username', m.username, 'rank', m.rank, 'rank_change', m.rank_change)
        from moves m
        where m.rank_change > 0
        order by m.rank_change desc, m.rank
        limit 1
      ),
      'faller', (
        select json_build_object('username', m.username, 'rank', m.rank, 'rank_change', m.rank_change)
        from moves m
        where m.rank_change < 0
        order by m.rank_change asc, m.rank
        limit 1
      )
    )
  );
end;
$$;

create or replace function public.complete_series(
  p_series_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_series public.series%rowtype;
  v_unfinished_predictions integer;
  v_required_bets integer;
  v_completed_predictions integer;
  v_eligible_players integer;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select s.* into v_series
  from public.series s
  join public.room_members rm
    on rm.room_id = s.room_id
   and rm.player_id = v_player_id
   and rm.role in ('owner', 'organizer')
  where s.id = p_series_id
  for update;

  if not found then
    raise exception 'Series not found or access denied' using errcode = 'P0002';
  end if;

  if v_series.status <> 'active' then
    raise exception 'Only active series can be completed' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.series_placements sp where sp.series_id = p_series_id
  ) or exists (
    select 1 from public.series_awards sa where sa.series_id = p_series_id
  ) then
    raise exception 'Series final results already exist' using errcode = 'P0001';
  end if;

  select count(*)::int
  into v_unfinished_predictions
  from public.predictions p
  where p.series_id = p_series_id
    and p.status in ('draft', 'locked');

  if v_unfinished_predictions > 0 then
    raise exception 'Series has unfinished predictions and cannot be completed' using errcode = 'P0001';
  end if;

  -- Scheduled ones never went live (nobody saw or bet on them): they go with
  -- the series, before anything below counts the series' predictions.
  delete from public.predictions p
  where p.series_id = p_series_id
    and p.status = 'scheduled';

  -- The same bar decides who can place and who can win awards.
  v_required_bets := private.series_required_bets(p_series_id);

  select count(*)::int
  into v_completed_predictions
  from public.predictions p
  where p.series_id = p_series_id
    and p.status in ('revealed', 'no_result');

  -- Players who qualified, which (with games) sets how much the series' trophies are worth.
  select count(*)::int
  into v_eligible_players
  from (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ) eligible;

  insert into public.series_placements (series_id, player_id, placement, points)
  with leaderboard as (
    select
      rm.player_id,
      coalesce(w.balance, v_series.starting_stack + coalesce(stats.net_profit, 0))::numeric as balance,
      coalesce(w.balance - w.granted, coalesce(stats.net_profit, 0))::numeric as net_profit
    from public.room_members rm
    left join public.series_wallets w
      on w.series_id = p_series_id
     and w.player_id = rm.player_id
    left join private.get_leaderboard_player_stats(
      v_series.room_id,
      p_series_id,
      false
    ) stats on stats.player_id = rm.player_id
    where rm.room_id = v_series.room_id
      -- Only players who bet on enough settled predictions can place.
      and coalesce(stats.total_bets, 0) >= v_required_bets
  ),
  -- The standings decide the title (net points, as the table shows them);
  -- placements record net profit for the Hall of Fame.
  ranked as (
    select
      l.player_id,
      l.net_profit,
      st.rank as placement
    from leaderboard l
    join private.series_standings(p_series_id) st
      on st.player_id = l.player_id and st.is_ranked
  )
  select
    p_series_id,
    r.player_id,
    r.placement,
    r.net_profit
  from ranked r
  where r.placement <= 3;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with series_predictions as (
    select
      p.id,
      p.status,
      p.series_prediction_number,
      p.created_at,
      p.winning_option_id
    from public.predictions p
    where p.series_id = p_series_id
  ),
  player_participation as (
    select
      b.player_id,
      count(distinct b.prediction_id)::int as prediction_count
    from public.bets b
    join series_predictions sp
      on sp.id = b.prediction_id
     and sp.status in ('revealed', 'no_result')
    group by b.player_id
  ),
  eligible_players as (
    select pp.player_id
    from player_participation pp
    where pp.prediction_count >= v_required_bets
  ),
  -- The same streaks the series standings showed all season, results in the
  -- order they came in.
  player_streaks as (
    select ss.player_id, ss.highest_streak::numeric as award_value
    from private.series_streaks(p_series_id) ss
    join eligible_players ep on ep.player_id = ss.player_id
  ),
  top_value as (
    select max(ps.award_value) as value
    from player_streaks ps
  )
  select
    p_series_id,
    ps.player_id,
    'LONGEST_STREAK'::public.series_award_type,
    ps.award_value,
    'Achieved the longest winning streak in this Series.',
    private.series_award_tier('LONGEST_STREAK', ps.award_value, v_completed_predictions, v_series.starting_stack)
  from player_streaks ps
  cross join top_value tv
  where tv.value is not null
    and tv.value > 0
    and ps.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with series_predictions as (
    select p.id, p.status
    from public.predictions p
    where p.series_id = p_series_id
  ),
  player_participation as (
    select
      b.player_id,
      count(distinct b.prediction_id)::int as prediction_count
    from public.bets b
    join series_predictions sp
      on sp.id = b.prediction_id
     and sp.status in ('revealed', 'no_result')
    group by b.player_id
  ),
  eligible_players as (
    select pp.player_id
    from player_participation pp
    where pp.prediction_count >= v_required_bets
  ),
  player_biggest_profit as (
    select
      b.player_id,
      max(greatest(coalesce(b.payout, 0) - b.amount, 0))::numeric as award_value
    from public.bets b
    join series_predictions sp on sp.id = b.prediction_id
    join eligible_players ep on ep.player_id = b.player_id
    group by b.player_id
  ),
  top_value as (
    select max(pbp.award_value) as value
    from player_biggest_profit pbp
  )
  select
    p_series_id,
    pbp.player_id,
    'BIGGEST_PROFIT'::public.series_award_type,
    pbp.award_value,
    'Recorded the biggest single prediction profit.',
    private.series_award_tier('BIGGEST_PROFIT', pbp.award_value, v_completed_predictions, v_series.starting_stack)
  from player_biggest_profit pbp
  cross join top_value tv
  where tv.value is not null
    and tv.value > 0
    and pbp.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with series_predictions as (
    select p.id, p.status
    from public.predictions p
    where p.series_id = p_series_id
  ),
  player_participation as (
    select
      b.player_id,
      count(distinct b.prediction_id)::int as prediction_count
    from public.bets b
    join series_predictions sp
      on sp.id = b.prediction_id
     and sp.status in ('revealed', 'no_result')
    group by b.player_id
  ),
  eligible_players as (
    select pp.player_id
    from player_participation pp
    where pp.prediction_count >= v_required_bets
  ),
  points_risked as (
    select
      b.player_id,
      sum(b.amount)::numeric as award_value
    from public.bets b
    join series_predictions sp on sp.id = b.prediction_id
    join eligible_players ep on ep.player_id = b.player_id
    group by b.player_id
  ),
  top_value as (
    select max(pr.award_value) as value
    from points_risked pr
  )
  select
    p_series_id,
    pr.player_id,
    'MOST_POINTS_RISKED'::public.series_award_type,
    pr.award_value,
    'Risked the most points during this Series.',
    private.series_award_tier('MOST_POINTS_RISKED', pr.award_value, v_completed_predictions, v_series.starting_stack)
  from points_risked pr
  cross join top_value tv
  where tv.value is not null
    and tv.value > 0
    and pr.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with completed_predictions as (
    select p.id
    from public.predictions p
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
  ),
  player_participation as (
    select
      b.player_id,
      count(distinct p.id)::int as prediction_count
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
  ),
  eligible_players as (
    select pp.player_id
    from player_participation pp
    where pp.prediction_count >= v_required_bets
  ),
  player_completed_participation as (
    select
      b.player_id,
      count(distinct b.prediction_id)::int as completed_prediction_count
    from public.bets b
    join completed_predictions cp on cp.id = b.prediction_id
    group by b.player_id
  )
  select
    p_series_id,
    ep.player_id,
    'EVER_PRESENT'::public.series_award_type,
    v_completed_predictions::numeric,
    'Participated in every completed prediction.',
    private.series_award_tier('EVER_PRESENT', v_completed_predictions::numeric, v_completed_predictions, v_series.starting_stack)
  from eligible_players ep
  left join player_completed_participation pcp on pcp.player_id = ep.player_id
  where v_completed_predictions > 0
    and coalesce(pcp.completed_prediction_count, 0) = v_completed_predictions;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with
  eligible_players as (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ),
  -- Share of their settled bets that won, as a percentage.
  candidates as (
    select
      b.player_id,
      round(100.0 * count(*) filter (where b.option_id = p.winning_option_id) / count(*), 1) as award_value
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    join eligible_players ep on ep.player_id = b.player_id
    where p.series_id = p_series_id
      and p.status = 'revealed'
      and p.winning_option_id is not null
    group by b.player_id
    having count(*) >= greatest(v_required_bets, 3)
  ),
  top_value as (
    select max(c.award_value) as value
    from candidates c
  )
  select
    p_series_id,
    c.player_id,
    'SHARPSHOOTER'::public.series_award_type,
    c.award_value,
    'Called the highest share of results in this Series.',
    private.series_award_tier('SHARPSHOOTER', c.award_value, v_completed_predictions, v_series.starting_stack)
  from candidates c
  cross join top_value tv
  where tv.value is not null
    and tv.value > 0
    and c.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with
  eligible_players as (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ),
  -- The longest odds they won at: the whole pool over the stake on the winning side.
  odds as (
    select
      p.id,
      p.winning_option_id,
      sum(b.amount)::numeric / nullif(sum(b.amount) filter (where b.option_id = p.winning_option_id), 0) as value
    from public.predictions p
    join public.bets b on b.prediction_id = p.id
    where p.series_id = p_series_id
      and p.status = 'revealed'
    group by p.id, p.winning_option_id
  ),
  candidates as (
    select
      b.player_id,
      max(round(o.value, 2)) as award_value
    from public.bets b
    join odds o on o.id = b.prediction_id and b.option_id = o.winning_option_id
    join eligible_players ep on ep.player_id = b.player_id
    group by b.player_id
  ),
  top_value as (
    select max(c.award_value) as value
    from candidates c
  )
  select
    p_series_id,
    c.player_id,
    'UNDERDOG'::public.series_award_type,
    c.award_value,
    'Won against the longest odds in this Series.',
    private.series_award_tier('UNDERDOG', c.award_value, v_completed_predictions, v_series.starting_stack)
  from candidates c
  cross join top_value tv
  where tv.value is not null
    and tv.value >= 2
    and c.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with
  eligible_players as (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ),
  -- Places climbed from their lowest weekly rank to where they finished.
  final_ranks as (
    select st.player_id, st.rank
    from private.series_standings(p_series_id) st
    where st.is_ranked
  ),
  lowest_ranks as (
    select ss.player_id, max(ss.rank) as rank
    from public.series_standing_snapshots ss
    where ss.series_id = p_series_id
      and ss.is_ranked
      and ss.rank is not null
    group by ss.player_id
  ),
  candidates as (
    select fr.player_id, (lr.rank - fr.rank)::numeric as award_value
    from final_ranks fr
    join lowest_ranks lr on lr.player_id = fr.player_id
    join eligible_players ep on ep.player_id = fr.player_id
  ),
  top_value as (
    select max(c.award_value) as value
    from candidates c
  )
  select
    p_series_id,
    c.player_id,
    'COMEBACK'::public.series_award_type,
    c.award_value,
    'Climbed the most places from their lowest point in this Series.',
    private.series_award_tier('COMEBACK', c.award_value, v_completed_predictions, v_series.starting_stack)
  from candidates c
  cross join top_value tv
  where tv.value is not null
    and tv.value >= 2
    and c.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with
  eligible_players as (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ),
  -- Wins over the series' last few settled predictions.
  finish as (
    select p.id, p.winning_option_id
    from public.predictions p
    where p.series_id = p_series_id
      and p.status = 'revealed'
      and p.winning_option_id is not null
    order by coalesce(p.series_prediction_number, 2147483647) desc, p.created_at desc, p.id desc
    limit private.series_finish_window(v_completed_predictions)
  ),
  candidates as (
    select b.player_id, count(*)::numeric as award_value
    from public.bets b
    join finish f on f.id = b.prediction_id
    join eligible_players ep on ep.player_id = b.player_id
    where b.option_id = f.winning_option_id
    group by b.player_id
  ),
  top_value as (
    select max(c.award_value) as value
    from candidates c
  )
  select
    p_series_id,
    c.player_id,
    'HOT_FINISH'::public.series_award_type,
    c.award_value,
    'Won the most predictions in the final stretch of this Series.',
    private.series_award_tier('HOT_FINISH', c.award_value, v_completed_predictions, v_series.starting_stack)
  from candidates c
  cross join top_value tv
  where tv.value is not null
    and v_completed_predictions >= 6 and tv.value >= 2
    and c.award_value = tv.value;

  update public.series
  set
    status = 'completed',
    completed_at = now(),
    final_games = v_completed_predictions,
    final_players = v_eligible_players,
    tier = private.series_tier(v_completed_predictions, v_eligible_players)
  where id = p_series_id
  returning * into v_series;

  -- Titles, back-to-backs and Ever-Present seasons can unlock career milestones.
  perform private.award_milestones(v_series.room_id);

  return row_to_json(v_series);
end;
$$;
