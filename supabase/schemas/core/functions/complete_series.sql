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
  -- The final balance decides the title; placements record net profit for the Hall of Fame.
  ranked as (
    select
      l.player_id,
      l.net_profit,
      rank() over (order by l.balance desc) as placement
    from leaderboard l
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
    select p.id, p.winning_option_id
    from public.predictions p
    where p.series_id = p_series_id
      and p.status = 'revealed'
      and p.winning_option_id is not null
  ),
  player_participation as (
    select
      b.player_id,
      count(distinct b.prediction_id)::int as prediction_count
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
  duel_wins as (
    select
      winner.player_id,
      count(*)::numeric as award_value
    from public.duels d
    join series_predictions sp on sp.id = d.prediction_id
    join public.bets challenger_bet on challenger_bet.id = d.challenger_bet_id
    join public.bets opponent_bet on opponent_bet.id = d.matched_opponent_bet_id
    join lateral (
      select case
        when challenger_bet.option_id = sp.winning_option_id then d.challenger_player_id
        else d.matched_opponent_player_id
      end as player_id
    ) winner on true
    join eligible_players ep on ep.player_id = winner.player_id
    where d.status = 'resolved'
    group by winner.player_id
  ),
  top_value as (
    select max(dw.award_value) as value
    from duel_wins dw
  )
  select
    p_series_id,
    dw.player_id,
    'MOST_DUEL_WINS'::public.series_award_type,
    dw.award_value,
    'Won the most duels during this Series.',
    private.series_award_tier('MOST_DUEL_WINS', dw.award_value, v_completed_predictions, v_series.starting_stack)
  from duel_wins dw
  cross join top_value tv
  where tv.value is not null
    and tv.value > 0
    and dw.award_value = tv.value;

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
