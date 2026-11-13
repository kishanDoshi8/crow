export type LeaderboardEntry = {
  player_id:          string
  username:           string
  total_won_in_room:  number
  // Series wallet: standings rank by balance; net_profit = balance - granted.
  balance:            number
  available:          number
  granted:            number
  net_profit:         number
  joined_at:          string
  is_organizer:       boolean
  current_streak:     number
  highest_streak:     number
  prediction_rating:  number
  peak_prediction_rating: number
  rated_predictions_count: number
  total_bets:         number
  total_revealed_bets:number
  winning_bets:       number
  total_wagered:      number
  total_payout:       number
  net_points:         number
  win_percentage:     number
  // Null until the player has bet on enough settled predictions to be ranked.
  rank:               number | null
  is_ranked:          boolean
  bets_needed:        number
  // Settled predictions a player must have bet on to be ranked right now.
  required_bets:      number
  previous_rank: number | null
  // Places moved since this week's Monday snapshot; positive is up.
  rank_change: number | null
  // Ranked now but not on Monday.
  rank_is_new?: boolean
  previous_prediction_rating: number | null
  rating_change: number | null
  previous_total_won_in_room: number | null
  points_change: number | null
}

export type PredictionHistoryOption = {
  id:            string
  label:         string
  total_bet:     number
  display_order: number
}

export type PredictionHistoryEntry = {
  prediction_id:        string
  title:                string
  description?:         string | null
  series_id:            string | null
  series_title:         string | null
  series_prediction_number: number | null
  status:               'revealed' | 'cancelled' | 'no_result'
  no_result_reason:     string | null
  resolved_at:          string | null
  created_at:           string
  winning_option_id:    string | null
  creator_username:     string
  // Staff member who revealed, marked no result, or cancelled it.
  resolver_username?:   string | null
  winning_option_label: string | null
  total_pool:           number
  participant_count:    number
  total_bets:           number
  winner_count:         number
  total_paid_to_winners:number
  biggest_payout:       number
  selected_option_id  : string | null
  selected_option_label: string | null
  // The viewer's own stake and payout (payout is null until settled).
  my_bet_amount:        number | null
  my_payout:            number | null
  options:              PredictionHistoryOption[] | null
  tags?:                string[]
  // Room talk: the top three reactions, the viewer's own, and phrase count.
  top_reactions?:       Array<{ reaction: string; count: number }> | null
  my_reaction?:         string | null
  post_count?:          number
}

// One row of the standings across every series in a room.
export type OverallStandingEntry = {
  player_id:           string
  username:            string
  joined_at:           string
  current_streak:      number
  net_profit:          number
  series_played:       number
  total_revealed_bets: number
  winning_bets:        number
  titles:              number
  podiums:             number
  rank:                number
}

export type PredictionHistoryFilter = "all" | "wins" | "losses" | "my_bets"

export type SortByOption = "points" | "ratings"

export type PredictionHistoryPage = {
  items: PredictionHistoryEntry[]
  next_cursor_created_at: string | null
  next_cursor_id: string | null
  has_more: boolean
}


export type RoomMemberStats = {
  player_id: string
  username: string
  current_points: number
  points_rank: number
  current_rating: number
  peak_rating: number
  rating_rank: number
  total_predictions: number
  winning_predictions: number
  total_rated_predictions: number
  current_win_streak: number
  highest_win_streak: number
  activity_streak: number
  largest_win_bet: number
  largest_win_payout: number
  largest_win_multiplier: number
}

export type RoomMemberRecentPrediction = {
  prediction_id: string
  prediction_title: string
  selected_option: string
  result: "won" | "lost" | "no_result"
  resolved_at: string
}


// One player in the weekly recap. rank_change is places moved over the week
// (positive is up); null when they weren't ranked the week before.
export interface WeeklyRecapEntry {
  rank:        number
  username:    string
  balance:     number
  rank_change: number | null
  is_new:      boolean
}

// The last completed week of a series: its top 5, biggest climber and
// biggest faller. Compares the two latest Monday snapshots.
export interface SeriesWeeklyRecap {
  week_key:     string
  week_number:  number
  // False in a series' first week: nothing to compare with yet.
  has_previous: boolean
  standings:    WeeklyRecapEntry[]
  climber:      Pick<WeeklyRecapEntry, 'username' | 'rank' | 'rank_change'> | null
  faller:       Pick<WeeklyRecapEntry, 'username' | 'rank' | 'rank_change'> | null
}
