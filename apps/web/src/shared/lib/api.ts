import type { Player } from "@/features/home/types/player";
import type {
	PredictionHistoryPage,
	PredictionHistoryFilter,
	LeaderboardEntry,
	OverallStandingEntry,
	RoomMemberRecentPrediction,
	RoomMemberStats,
	SeriesWeeklyRecap,
} from "@/features/leaderboard/types/types";
import type { Prediction, PredictionStatus } from "@/features/predictions/types/types";
import type { Series } from "@/features/series/types/series";
import type { FormerMember, JoinPolicy, ManageQueue, Room, RoomMember } from "@/features/rooms/types/types";
import type { PredictionTalk } from "@/features/talk/types";
import type { RoomRole } from "@/features/rooms/lib/roles";
import type { ActivityFilter, RoomActivitiesPage } from "@/features/activities/types/types";
import type { Json } from '@/shared/lib/supabase.types'
import type { SeriesAwardType } from "@/shared/lib/seriesRewards";
import type { AwardTier, SeriesTier, StyleTitle } from "@/shared/lib/trophyPrestige";
import { isMilestoneType, type MilestoneType } from "@/shared/lib/milestones";
import { supabase } from './supabase'

export type PreferenceSettings = {
  prediction_live: boolean
  prediction_locked: boolean
  deadline_1h: boolean
  result_revealed: boolean
  weekly_points_claim: boolean
  // Staff: a result is overdue.
  result_needed: boolean
  dark_mode: boolean
  sounds_enabled: boolean
}

export type RoomPreferenceOverrides = {
  prediction_live: boolean | null
  prediction_locked: boolean | null
  deadline_1h: boolean | null
  result_revealed: boolean | null
  weekly_points_claim: boolean | null
  result_needed: boolean | null
  dark_mode: boolean | null
  sounds_enabled: boolean | null
}

export type PreferenceResponse = {
  room_id: string | null
  has_seen_how_to_play: boolean
  global: PreferenceSettings
  room_overrides: RoomPreferenceOverrides
  effective: PreferenceSettings
}

export type NotificationEventType =
  | 'prediction_live'
  | 'prediction_locked'
  | 'deadline_1h'
  | 'result_revealed'
  | 'weekly_points_claim'
  | 'result_needed'

type SeriesPayload = {
  id: string
  room_id: string
  title: string
  description: string | null
  status: string
  expected_games: number
  prediction_count: number
  completed_games: number
  total_predictions?: number
  active_predictions?: number
  completed_predictions?: number
  cancelled_predictions?: number
  remaining_games?: number
  progress_percentage?: number
  created_by: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  archived_at: string | null
  starting_stack?: number
  weekly_topup?: number
  topups_paid?: number
  has_bets?: boolean
  min_bets_to_rank?: number
}

export type SeriesWallet = {
  series_id: string
  title: string
  status: Series["status"]
  starting_stack: number
  weekly_topup: number
  balance: number
  escrow: number
  available: number
  granted: number
  net_profit: number
  started_at: string | null
  // Has earned next Monday's top-up by betting this week.
  bet_this_week?: boolean
}

export type RoomSeriesCollection = {
  draft: Series[]
  active: Series[]
  completed: Series[]
  archived: Series[]
}

export type RoomSeriesSelectorOption = {
  id: string
  title: string
  status: Series["status"]
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export type RoomSeriesSelector = {
  selected_series_id: string | null
  series: RoomSeriesSelectorOption[]
}

export type SeriesSelectorMode = 'active' | 'active-or-last' | 'all'

export type SeriesPlacement = {
  id: string
  series_id: string
  player_id: string
  username: string
  placement: number
  points: number
  collected_at: string | null
  created_at: string
}

export type SeriesAward = {
  id: string
  series_id: string
  player_id: string
  username: string
  award_type: SeriesAwardType
  value: number
  description: string
  collected_at: string | null
  created_at: string
}

export type RoomMemberSeriesRecognition = {
  championships: Array<{
    id: string
    series_id: string
    series_title: string
    placement: number
    points: number
    // How much the series' trophies are worth; set when it completes.
    series_tier: SeriesTier | null
    series_completed_at: string | null
    collected_at: string | null
    created_at: string
  }>
  awards: Array<{
    id: string
    series_id: string
    series_title: string
    award_type: SeriesAwardType
    description: string
    value: number
    award_tier: AwardTier | null
    series_tier: SeriesTier | null
    series_completed_at: string | null
    collected_at: string | null
    created_at: string
  }>
}

// A player's profile across rooms (get_player_profile). Your own covers all
// your rooms; anyone else's covers only the rooms you share with them.
export type PlayerProfileRoom = {
  room_id: string
  name: string
  room_code: string
  status: 'active' | 'closed'
  role: 'owner' | 'organizer' | 'resolver' | 'member'
  joined_at: string
  points: number
  points_rank: number
  member_count: number
  total_predictions: number
  winning_predictions: number
  total_rated_predictions: number
  highest_win_streak: number
  championships: number
}

// Trophies and milestones say which room they came from.
type FromRoom = { room_id: string; room_name: string }

export type PlayerProfile = {
  player: {
    id: string
    username: string
    joined_at: string
    activity_streak: number
    longest_activity_streak: number
  }
  is_self: boolean
  totals: {
    rooms: number
    total_predictions: number
    winning_predictions: number
    total_rated_predictions: number
    highest_win_streak: number
    championships: number
    podiums: number
    awards: number
    milestones: number
  }
  rooms: PlayerProfileRoom[]
  championships: Array<RoomMemberSeriesRecognition['championships'][number] & FromRoom>
  awards: Array<RoomMemberSeriesRecognition['awards'][number] & FromRoom>
  milestones: Array<RoomMemberMilestone & FromRoom>
}

// get_head_to_head: you against one other player, over the questions you
// both picked in the rooms you share. you/them are the ones only that
// player called.
export type HeadToHead = {
  player_id: string
  questions: number
  you: number
  them: number
  both_called: number
  both_missed: number
  rooms: Array<{
    room_id: string
    name: string
    questions: number
    you: number
    them: number
    both_called: number
    both_missed: number
  }>
}

// get_people_you_play_with: everyone you share a room with right now.
export type PersonYouPlayWith = {
  player_id: string
  username: string
  shared_rooms: number
  rooms: Array<{ room_id: string; name: string }>
}

// get_invitable_rooms: your rooms you could invite someone to.
export type InvitableRoom = {
  room_id: string
  name: string
  room_code: string
  member_count: number
  // 'unavailable': the owner removed them, or they said no this past week.
  invite_status: 'available' | 'invited' | 'full' | 'unavailable'
}

// get_my_room_invites: invites waiting on you. needs_approval: saying yes
// sends a join request, as the room approves new players.
export type RoomInvite = {
  room_id: string
  room_name: string
  room_code: string
  member_count: number
  invited_by_id: string | null
  invited_by_username: string | null
  created_at: string
  needs_approval: boolean
}

// ============================================================
// API — thin wrappers around Supabase RPC functions
// All functions throw on error so callers can catch uniformly.
// Auth context is automatically attached from the Supabase session.
// ============================================================

function assertOk<T>(data: T | null, error: unknown): T {
  if (error) throw error
  if (data === null) throw new Error('No data returned')
  return data
}

function mapSeriesPayload(series: SeriesPayload): Series {
  return {
    id: series.id,
    roomId: series.room_id,
    title: series.title,
    description: series.description,
    status: series.status as Series["status"],
    expectedGames: series.expected_games,
    predictionCount: series.prediction_count,
    completedGames: series.completed_games,
    totalPredictions: series.total_predictions ?? series.prediction_count,
    activePredictions: series.active_predictions ?? 0,
    completedPredictions: series.completed_predictions ?? series.completed_games,
    cancelledPredictions: series.cancelled_predictions ?? 0,
    remainingGames: series.remaining_games ?? Math.max(series.expected_games - series.completed_games, 0),
    progressPercentage: series.progress_percentage ?? (series.expected_games > 0 ? Math.min((series.completed_games / series.expected_games) * 100, 100) : 0),
    createdBy: series.created_by,
    createdAt: series.created_at,
    startedAt: series.started_at,
    completedAt: series.completed_at,
    archivedAt: series.archived_at,
    startingStack: series.starting_stack ?? 1000,
    weeklyTopup: series.weekly_topup ?? 100,
    topupsPaid: series.topups_paid ?? 0,
    hasBets: series.has_bets ?? false,
    minBetsToRank: series.min_bets_to_rank ?? 3,
  }
}

type UntypedSupabaseClient = {
  from: (table: string) => any
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

const untypedSupabase = supabase as unknown as UntypedSupabaseClient

// #region Players & Session
// -------------------------------------------------------
export async function createPlayer(username: string) {
  const { data, error } = await supabase.rpc('register_player', {
    p_username: username,
  })
  return assertOk(data, error) as {
    player_id: string
    username: string
  }
}

export async function getPlayer(): Promise<Player> {
  const { data, error } = await supabase.rpc('get_player')
  return assertOk(data, error) as {
    id: string
    username: string
    points_in_escrow: number
    points_balance: number
    total_won: number
    current_streak: number
    longest_streak: number
    last_visited_room_id: string | null
  }
}

export async function setLastVisitedRoom(roomId: string) {
  const { error } = await supabase.rpc('set_last_visited_room', {
    p_room_id: roomId,
  })
  if (error) throw error
}

// #endregion Players & Session

// #region Rooms
// -------------------------------------------------------

export async function createRoom(room_name: string): Promise<Room> {
  const { data, error } = await supabase.rpc('create_room', {
    p_room_name: room_name,
  })
  const room = assertOk(data, error) as {
    id: string
    code: string
    name: string
    status: string
    player_id: string
    username: string
    created_at: string
  }
  const members = await getRoomMembers(room.id)

  return {
    ...room,
    members: members,
  }
}

export async function getRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase
    .from("room_members")
    .select(`
      id,
      room_id,
      player_id,
      role,
      joined_at,
      total_won_in_room,
      player:players (
        id,
        username
      )
    `)
    .eq("room_id", roomId)

  if (error) throw error
  return (data ?? []) as RoomMember[]
}

type RoomByCode = {
  id: string
  room_code: string
  name: string
  description: string | null
  status: string
  created_at: string
  result_reminder_hours: number
  listed: boolean
  join_policy: JoinPolicy
  member_limit: number
  is_full: boolean
  has_pending_request: boolean
  is_member: boolean
  is_removed: boolean
  member_count: number
  active_prediction_count: number
  organizer_username: string | null
}

export async function spectateRoom(roomCode: string): Promise<Room> {
  // Room tables are only readable by members, so the invite-code lookup goes through an RPC.
  const { data, error } = await untypedSupabase.rpc('get_room_by_code', {
    p_room_code: roomCode,
  })
  const { is_member, ...room } = assertOk(data, error) as RoomByCode

  if (!is_member) {
    return {
      ...room,
      code: room.room_code,
      members: [],
      has_unseen_activities: false,
    }
  }

  const [members, formerMembers, hasUnseenActivities] = await Promise.all([
    getRoomMembers(room.id),
    getRoomFormerMembers(room.id),
    getRoomHasUnseenActivities(room.id),
  ])

  return {
    ...room,
    code: room.room_code,
    members,
    former_members: formerMembers,
    has_unseen_activities: hasUnseenActivities,
  }
}

// People who left or were removed, so old results keep their names.
export async function getRoomFormerMembers(roomId: string): Promise<FormerMember[]> {
  const { data, error } = await supabase.rpc('get_room_former_members', { p_room_id: roomId })
  return (assertOk(data, error) ?? []) as unknown as FormerMember[]
}

// Owner only. They can't rejoin until allowRoomMemberBack.
export async function removeRoomMember(roomId: string, playerId: string) {
  const { data, error } = await supabase.rpc('remove_room_member', {
    p_room_id: roomId,
    p_player_id: playerId,
  })
  return assertOk(data, error)
}

export async function allowRoomMemberBack(roomId: string, playerId: string) {
  const { data, error } = await supabase.rpc('allow_room_member_back', {
    p_room_id: roomId,
    p_player_id: playerId,
  })
  return assertOk(data, error)
}

// Anyone but the owner. Open bets are handed back; rejoining restores stats.
export async function leaveRoom(roomId: string) {
  const { data, error } = await supabase.rpc('leave_room', { p_room_id: roomId })
  return assertOk(data, error)
}

type AccountDeletion = { status: 'pending'; requested_at: string }

export async function getMyAccountDeletion(): Promise<AccountDeletion | null> {
  const { data, error } = await supabase.rpc('get_my_account_deletion')
  if (error) throw error
  return (data ?? null) as AccountDeletion | null
}

export async function requestAccountDeletion(reason: string | null) {
  const { data, error } = await supabase.rpc('request_account_deletion', {
    p_reason: reason ?? undefined,
  })
  return assertOk(data, error) as unknown as AccountDeletion
}

export async function cancelAccountDeletion() {
  const { data, error } = await supabase.rpc('cancel_account_deletion')
  return assertOk(data, error)
}

// Staff only. Locked predictions to close and open ones, across the room.
export async function getRoomManageQueue(roomId: string) {
  const { data, error } = await supabase.rpc('get_room_manage_queue', {
    p_room_id: roomId,
  })
  return assertOk(data, error) as unknown as ManageQueue
}

// Owner only. Ownership moves with transferOwnership instead.
export async function setMemberRole(roomId: string, playerId: string, role: Exclude<RoomRole, 'owner'>) {
  const { data, error } = await supabase.rpc('set_member_role', {
    p_room_id: roomId,
    p_player_id: playerId,
    p_role: role,
  })
  return assertOk(data, error)
}

export async function transferOwnership(roomId: string, playerId: string) {
  const { data, error } = await supabase.rpc('transfer_ownership', {
    p_room_id: roomId,
    p_player_id: playerId,
  })
  return assertOk(data, error)
}

export type RoomSettings = {
  name: string
  description: string
  resultReminderHours: number
  // Shown in Explore, and whether joining needs the staff's OK.
  listed: boolean
  joinPolicy: JoinPolicy
}

export async function updateRoom(roomId: string, settings: RoomSettings) {
  const { data, error } = await supabase.rpc('update_room', {
    p_room_id: roomId,
    p_name: settings.name,
    p_description: settings.description,
    p_result_reminder_hours: settings.resultReminderHours,
    p_listed: settings.listed,
    p_join_policy: settings.joinPolicy,
  })
  return assertOk(data, error)
}

// Organizers only, while the prediction is open for picks (or scheduled).
// Pass options only to change them; they're fixed once anyone has bet.
// opensAt moves a scheduled prediction's go-live time.
export async function updatePrediction(
  predictionId: string,
  title: string,
  deadline: Date,
  options?: string[],
  opensAt?: Date | null,
) {
  const { data, error } = await supabase.rpc('update_prediction', {
    p_prediction_id: predictionId,
    p_title: title,
    p_deadline: deadline.toISOString(),
    p_options: options,
    p_opens_at: opensAt ? opensAt.toISOString() : undefined,
  })
  return assertOk(data, error)
}

// Organizers put a scheduled prediction live straight away.
export async function publishPredictionNow(predictionId: string) {
  const { data, error } = await supabase.rpc('publish_prediction_now', {
    p_prediction_id: predictionId,
  })
  return assertOk(data, error)
}

// Organizers delete a scheduled prediction (nobody has seen it yet).
export async function deleteScheduledPrediction(predictionId: string) {
  const { error } = await supabase.rpc('delete_scheduled_prediction', {
    p_prediction_id: predictionId,
  })
  if (error) throw error
}

// Logs a completed share so we can see which shareables get used.
export async function recordShare(roomId: string, kind: string) {
  const { error } = await supabase.rpc('record_share', { p_room_id: roomId, p_kind: kind })
  if (error) throw error
}

// Joins a room, or (for a room that approves new members) sends a join
// request: membership says which happened.
export async function joinRoom(
  roomCode: string,
  ref?: string | null,
): Promise<Room & { membership: 'member' | 'requested' }> {
  const { data, error } = await supabase.rpc('join_room', {
    p_room_code: roomCode,
    p_ref: ref ?? undefined,
  })
  const room = assertOk(data, error) as {
    id: string
    code: string
    name: string
    status: string
    player_id: string
    username: string
    created_at: string
    membership: 'member' | 'requested'
  }
  if (room.membership === 'requested') {
    return { ...room, members: [], has_pending_request: true }
  }
  const members = await getRoomMembers(room.id)

  return {
    ...room,
    members: members,
  }
}

// Withdraws your pending request to join a room.
export async function cancelJoinRequest(roomId: string) {
  const { error } = await supabase.rpc('cancel_join_request', { p_room_id: roomId })
  if (error) throw error
}

// Owners and organizers let someone in, or decline them.
export async function decideJoinRequest(roomId: string, playerId: string, accept: boolean) {
  const { data, error } = await supabase.rpc('decide_join_request', {
    p_room_id: roomId,
    p_player_id: playerId,
    p_accept: accept,
  })
  return assertOk(data, error)
}

export type ExploreRoom = {
  id: string
  room_code: string
  name: string
  description: string | null
  join_policy: JoinPolicy
  member_count: number
  member_limit: number
  series_title: string | null
  open_prediction_count: number
  last_activity_at: string | null
  // You're in it, asked to join, or were removed (can't rejoin).
  my_status: 'member' | 'requested' | 'removed' | null
}

// Public rooms, busiest first, optionally matching a search.
export async function getExploreRooms(search: string, offset = 0): Promise<ExploreRoom[]> {
  const { data, error } = await supabase.rpc('get_explore_rooms', {
    p_search: search || undefined,
    p_offset: offset,
  })
  return (assertOk(data, error) ?? []) as unknown as ExploreRoom[]
}

export async function getPlayerRooms(player_id: string): Promise<Room[]> {
  const { data, error } = await supabase
    .from('player_rooms_by_activity')
    .select('*')
    .eq('player_id', player_id)
    .order('latest_prediction_at', { ascending: false, nullsFirst: false });

  if (error) throw error;
  if (!data) return [];

  return data.map((row: any): Room => ({
    id: row.room_id,
    name: row.name,
    code: row.room_code,
    status: row.status,
    created_at: row.created_at,
    
    // UI Counter Helpers
    member_count: row.member_count ?? 0,
    active_prediction_count: row.active_prediction_count ?? 0,
    members: Object.assign([], { length: row.member_count ?? 0 })
  }));
}

// #endregion Rooms

// #region Series
// -------------------------------------------------------

export async function getRoomSeries(roomId: string): Promise<RoomSeriesCollection> {
  const { data, error } = await supabase.rpc('get_room_series', {
    p_room_id: roomId,
  })

  const seriesGroups = assertOk(data, error) as {
    draft?: SeriesPayload[]
    active?: SeriesPayload[]
    completed?: SeriesPayload[]
    archived?: SeriesPayload[]
  }

  return {
    draft: (seriesGroups.draft ?? []).map(mapSeriesPayload),
    active: (seriesGroups.active ?? []).map(mapSeriesPayload),
    completed: (seriesGroups.completed ?? []).map(mapSeriesPayload),
    archived: (seriesGroups.archived ?? []).map(mapSeriesPayload),
  }
}

type SeriesUpsertPayload = {
  title: string
  description: string
  expectedGames: number
  startingStack?: number
  weeklyTopup?: number
  minBetsToRank?: number
}

export async function createSeries(roomId: string, payload: SeriesUpsertPayload): Promise<Series> {
  const { data, error } = await untypedSupabase.rpc('create_series', {
    p_room_id: roomId,
    p_title: payload.title,
    p_description: payload.description,
    p_expected_games: payload.expectedGames,
    p_starting_stack: payload.startingStack,
    p_weekly_topup: payload.weeklyTopup,
    p_min_bets_to_rank: payload.minBetsToRank,
  })
  return mapSeriesPayload(assertOk(data, error) as SeriesPayload)
}

export async function updateSeries(seriesId: string, payload: SeriesUpsertPayload): Promise<Series> {
  const { data, error } = await untypedSupabase.rpc('update_series', {
    p_series_id: seriesId,
    p_title: payload.title,
    p_description: payload.description,
    p_expected_games: payload.expectedGames,
    p_starting_stack: payload.startingStack,
    p_weekly_topup: payload.weeklyTopup,
    p_min_bets_to_rank: payload.minBetsToRank,
  })
  return mapSeriesPayload(assertOk(data, error) as SeriesPayload)
}

export async function getMySeriesWallets(roomId: string): Promise<SeriesWallet[]> {
  const { data, error } = await untypedSupabase.rpc('get_my_series_wallets', {
    p_room_id: roomId,
  })
  return assertOk(data, error) as SeriesWallet[]
}

export async function activateSeries(seriesId: string): Promise<Series> {
  const { data, error } = await supabase.rpc('activate_series', {
    p_series_id: seriesId,
  })
  return mapSeriesPayload(assertOk(data, error) as SeriesPayload)
}

export async function completeSeries(seriesId: string): Promise<Series> {
  const { data, error } = await supabase.rpc('complete_series', {
    p_series_id: seriesId,
  })
  return mapSeriesPayload(assertOk(data, error) as SeriesPayload)
}

export async function archiveSeries(seriesId: string): Promise<Series> {
  const { data, error } = await supabase.rpc('archive_series', {
    p_series_id: seriesId,
  })
  return mapSeriesPayload(assertOk(data, error) as SeriesPayload)
}

export async function getRoomSeriesSelector(
  roomId: string,
  selectedSeriesId?: string | null,
  mode: SeriesSelectorMode = 'active-or-last',
): Promise<RoomSeriesSelector> {
  const { data, error } = await untypedSupabase.rpc('get_room_series_selector', {
    p_room_id: roomId,
    p_selected_series_id: selectedSeriesId ?? undefined,
    p_mode: mode,
  })

  return assertOk(data, error) as RoomSeriesSelector
}

export async function getSeriesPlacements(roomId: string, seriesId: string) {
  const { data, error } = await untypedSupabase.rpc('get_series_placements', {
    p_room_id: roomId,
    p_series_id: seriesId,
  })

  return assertOk(data, error) as SeriesPlacement[]
}

export async function getSeriesAwards(roomId: string, seriesId: string) {
  const { data, error } = await untypedSupabase.rpc('get_series_awards', {
    p_room_id: roomId,
    p_series_id: seriesId,
  })

  return assertOk(data, error) as SeriesAward[]
}

// #endregion Series

// #region Preferences
// -------------------------------------------------------
export async function getPreferences(roomId?: string) {
  const { data, error } = await supabase.rpc('get_preferences', {
    p_room_id: roomId ?? undefined,
  })

  return assertOk(data, error) as PreferenceResponse
}

export async function updateGlobalPreferences(
  preferences: PreferenceSettings,
) {
  const { data, error } = await supabase.rpc('update_global_preferences', {
    p_prediction_live: preferences.prediction_live,
    p_prediction_locked: preferences.prediction_locked,
    p_deadline_1h: preferences.deadline_1h,
    p_result_revealed: preferences.result_revealed,
    p_weekly_points_claim: preferences.weekly_points_claim,
    p_dark_mode: preferences.dark_mode,
    p_sounds_enabled: preferences.sounds_enabled,
    p_result_needed: preferences.result_needed,
  })

  return assertOk(data, error) as PreferenceResponse
}

export async function updateRoomPreferences(
  roomId: string,
  preferences: RoomPreferenceOverrides,
) {
  const { data, error } = await supabase.rpc('update_room_preferences', {
    p_room_id: roomId,
    p_prediction_live: preferences.prediction_live ?? undefined,
    p_prediction_locked: preferences.prediction_locked ?? undefined,
    p_deadline_1h: preferences.deadline_1h ?? undefined,
    p_result_revealed: preferences.result_revealed ?? undefined,
    p_weekly_points_claim: preferences.weekly_points_claim ?? undefined,
    p_dark_mode: preferences.dark_mode ?? undefined,
    p_sounds_enabled: preferences.sounds_enabled ?? undefined,
    p_result_needed: preferences.result_needed ?? undefined,
  })

  return assertOk(data, error) as PreferenceResponse
}

export async function resetRoomPreferences(roomId: string) {
  const { data, error } = await supabase.rpc('reset_room_preferences', {
    p_room_id: roomId,
  })

  return assertOk(data, error) as PreferenceResponse
}

export async function markHowToPlaySeen() {
  const { error } = await supabase.rpc('mark_how_to_play_seen')
  if (error) throw error
}

export async function upsertPushSubscription(
  subscription: PushSubscriptionJSON,
) {
  const { data, error } = await supabase.rpc('upsert_user_push_subscription', {
    p_subscription: subscription as unknown as Json,
  })

  return assertOk(data, error) as string
}

export async function deletePushSubscription(endpoint: string) {
  const { error } = await supabase.rpc('delete_my_push_subscription', {
    p_endpoint: endpoint,
  })
  if (error) throw error
}

// #endregion Preferences

// #region Predictions
// -------------------------------------------------------

export async function createPrediction(
  roomId: string,
  title: string,
  options: string[],
  deadline: Date,
  seriesId?: string | null,
  // Set to schedule it: it stays hidden from members until then.
  opensAt?: Date | null,
): Promise<Prediction> {
  const { data, error } = await supabase.rpc('create_prediction', {
    p_room_id: roomId,
    p_title: title,
    p_options: options,
    p_deadline: deadline.toISOString(),
    p_series_id: seriesId ?? undefined,
    p_opens_at: opensAt ? opensAt.toISOString() : undefined,
  })
  const prediction = assertOk(data, error) as {
    prediction_id: string
    title: string
    status: string
    deadline: string
    option_ids: string[]
    winning_option_id: string | null
    resolved_at: string | null
    series_id: string | null
    series_prediction_number: number | null
  }

  // A new prediction has no picks yet.
  const predictionOptions = prediction.option_ids.map((optionId, index) => ({
    id: optionId,
    prediction_id: prediction.prediction_id,
    label: options[index],
    display_order: index,
  }))

  return {
    ...prediction,
    id: prediction.prediction_id,
    room_id: roomId,
    series_id: prediction.series_id,
    series_prediction_number: prediction.series_prediction_number,
    seriesId: prediction.series_id,
    seriesPredictionNumber: prediction.series_prediction_number,
    tags: [],
    winning_option_id: prediction.winning_option_id ?? null,
    resolved_at: prediction.resolved_at ?? null,
    status: prediction.status as PredictionStatus,
    prediction_options: predictionOptions,
  }
}

export type PredictionDraft = {
  title: string
  options: string[]
  description?: string
}

// Organizers create a set of predictions in one go: one call, one push to
// members. They share the series, timing, tags and (optionally) an event.
export async function createPredictions(
  roomId: string,
  seriesId: string,
  predictions: PredictionDraft[],
  deadline: Date,
  opensAt?: Date | null,
  eventTitle?: string,
  tags?: string[],
) {
  const { data, error } = await untypedSupabase.rpc('create_predictions', {
    p_room_id: roomId,
    p_series_id: seriesId,
    p_predictions: predictions,
    p_deadline: deadline.toISOString(),
    p_opens_at: opensAt ? opensAt.toISOString() : null,
    p_event_title: eventTitle?.trim() || null,
    p_tags: tags ?? [],
  })
  return assertOk(data, error) as {
    room_id: string
    series_id: string
    event_id: string | null
    status: 'draft' | 'scheduled'
    prediction_ids: string[]
    count: number
  }
}

// Every option column players can read. total_bet isn't one: on an open
// prediction it would show how the picks split (getPickCounts).
const PREDICTION_OPTION_COLUMNS = 'id, prediction_id, label, display_order, created_at, option_key'

export async function getPrediction(predictionId: string) {
  const { data, error } = await supabase
    .from('predictions')
    .select(`*, series:series_id(title, status), prediction_tags(id, prediction_id, tag, created_at)`)
    .eq('id', predictionId)
    .maybeSingle()
  
  if (error) throw error
  if (!data) return null

  const { data: predictionOptions, error: optionsError } = await supabase
    .from('prediction_options')
    .select(PREDICTION_OPTION_COLUMNS)
    .eq('prediction_id', data.id)
    .order('display_order', { ascending: true })
  if (optionsError) throw optionsError

  return {
    ...data,
    series_title: data.series?.title ?? null,
    seriesId: data.series_id,
    seriesPredictionNumber: data.series_prediction_number,
    seriesTitle: data.series?.title ?? null,
    seriesStatus: data.series?.status ?? null,
    tags: data.prediction_tags ?? [],
    status: data.status as PredictionStatus,
    prediction_options: predictionOptions ?? [],
  }
}


export async function getActivePrediction(roomId: string) {
  const { data, error } = await supabase
    .from('predictions')
    .select(`*, series:series_id(title), prediction_tags(id, prediction_id, tag, created_at)`)
    .eq('room_id', roomId)
    .neq('status', 'scheduled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const { data: predictionOptions, error: optionsError } = await supabase
    .from('prediction_options')
    .select(PREDICTION_OPTION_COLUMNS)
    .eq('prediction_id', data.id)
    .order('display_order', { ascending: true })

  if (optionsError) throw optionsError

  return {
    ...data,
    series_title: data.series?.title ?? null,
    seriesId: data.series_id,
    seriesPredictionNumber: data.series_prediction_number,
    seriesTitle: data.series?.title ?? null,
    tags: data.prediction_tags ?? [],
    status: data.status as PredictionStatus,
    prediction_options: predictionOptions ?? [],
  }
}

export async function getActivePredictions(roomId: string, seriesId?: string): Promise<Prediction[]> {
  // First: fetch all active (draft/locked) predictions ordered by deadline asc
  let activeQuery = supabase
    .from('predictions')
    .select('*, series:series_id(title), event:event_id(title), prediction_tags(id, prediction_id, tag, created_at)')
    .eq('room_id', roomId)
    .in('status', ['draft', 'locked'])
    .order('deadline', { ascending: true })
  if (seriesId) {
    activeQuery = activeQuery.eq('series_id', seriesId)
  }
  const { data: activeRows, error: activeError } = await activeQuery

  if (activeError) throw activeError

  if (activeRows && activeRows.length > 0) {
    // Fetch options for each active prediction in parallel
    const predictions = await Promise.all(
      activeRows.map(async (row: typeof activeRows[0]) => {
        const { data: opts, error: optsErr } = await supabase
          .from('prediction_options')
          .select(PREDICTION_OPTION_COLUMNS)
          .eq('prediction_id', row.id)
          .order('display_order', { ascending: true })
        if (optsErr) throw optsErr
        return {
          ...row,
          series_title: row.series?.title ?? null,
          seriesId: row.series_id,
          seriesPredictionNumber: row.series_prediction_number,
          seriesTitle: row.series?.title ?? null,
          tags: row.prediction_tags ?? [],
          status: row.status as PredictionStatus,
          prediction_options: opts ?? [],
          event_title: row.event?.title ?? null,
        }
      })
    )
    return predictions
  }

  // Fallback: no active predictions — return the most recently completed prediction
  let fallbackQuery = supabase
    .from('predictions')
    .select('*, series:series_id(title), prediction_tags(id, prediction_id, tag, created_at)')
    .eq('room_id', roomId)
    .in('status', ['revealed', 'cancelled', 'no_result'])
    .order('resolved_at', { ascending: false })
    .limit(1)
  if (seriesId) {
    fallbackQuery = fallbackQuery.eq('series_id', seriesId)
  }
  const { data: fallbackRows, error: fallbackError } = await fallbackQuery

  if (fallbackError) throw fallbackError
  if (!fallbackRows || fallbackRows.length === 0) return []

  const fallback = fallbackRows[0]
  const { data: fallbackOpts, error: fallbackOptsErr } = await supabase
    .from('prediction_options')
    .select(PREDICTION_OPTION_COLUMNS)
    .eq('prediction_id', fallback.id)
    .order('display_order', { ascending: true })
  if (fallbackOptsErr) throw fallbackOptsErr

  return [
    {
      ...fallback,
      series_title: fallback.series?.title ?? null,
      seriesId: fallback.series_id,
      seriesPredictionNumber: fallback.series_prediction_number,
      seriesTitle: fallback.series?.title ?? null,
      tags: fallback.prediction_tags ?? [],
      status: fallback.status as PredictionStatus,
      prediction_options: fallbackOpts ?? [],
    },
  ]
}

export async function getPredictionHistory(roomId: string) {
  const { data, error } = await supabase
    .from('predictions')
    .select(`*`)
    .eq('room_id', roomId)
    .in('status', ['revealed', 'cancelled', 'no_result'])
    .order('resolved_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function resolvePrediction(
  predictionId: string,
  roomId: string,
  outcome: 'win' | 'no_result' | 'cancel',
  winningOptionId?: string,
  noResultReason?: string | null,
) {  
  const { data, error } = await supabase.rpc('resolve_prediction_v2', {
    p_prediction_id: predictionId,
    p_room_id: roomId,
    p_outcome: outcome,
    p_winning_option_id: winningOptionId ?? undefined,
    p_no_result_reason: noResultReason ?? undefined,
  })
  return assertOk(data, error)
}

export type PredictionResult = {
  prediction_id: string
  outcome: 'win' | 'no_result' | 'cancel'
  winning_option_id?: string
  no_result_reason?: string | null
}

// Staff close several predictions in one go, each with its own outcome:
// one call, one push to members. All or nothing.
export async function resolvePredictions(roomId: string, results: PredictionResult[]) {
  const { data, error } = await untypedSupabase.rpc('resolve_predictions', {
    p_room_id: roomId,
    p_results: results,
  })
  return assertOk(data, error) as {
    resolved: number
    revealed: number
    no_result: number
    cancelled: number
  }
}

// Organizers fix a result that went out wrong, while the series runs.
export async function correctPredictionResult(
  predictionId: string,
  roomId: string,
  outcome: 'win' | 'no_result',
  winningOptionId?: string,
  noResultReason?: string | null,
) {
  const { data, error } = await supabase.rpc('correct_prediction_result', {
    p_prediction_id: predictionId,
    p_room_id: roomId,
    p_outcome: outcome,
    p_winning_option_id: winningOptionId ?? undefined,
    p_no_result_reason: noResultReason ?? undefined,
  })
  return assertOk(data, error)
}

// Room talk: reactions and preset phrases on one prediction.
export async function getPredictionTalk(predictionId: string): Promise<PredictionTalk> {
  const { data, error } = await supabase.rpc('get_prediction_talk', { p_prediction_id: predictionId })
  return assertOk(data, error) as unknown as PredictionTalk
}

// null takes the caller's reaction back.
export async function setPredictionReaction(predictionId: string, reaction: string | null) {
  const { data, error } = await supabase.rpc('set_prediction_reaction', {
    p_prediction_id: predictionId,
    p_reaction: reaction ?? undefined,
  })
  return assertOk(data, error)
}

export async function postPredictionPhrase(predictionId: string, phraseId: number) {
  const { data, error } = await supabase.rpc('post_prediction_phrase', {
    p_prediction_id: predictionId,
    p_phrase_id: phraseId,
  })
  return assertOk(data, error)
}

// #endregion Predictions

// #region Fixtures (event packs)
// -------------------------------------------------------
export type FixtureQuestion = {
  id: string
  title: string
  description: string | null
  options: string[]
  // The room's question made from it, if the room has one.
  prediction_id: string | null
  // Minutes before the start that picks close (toss questions).
  closes_before?: number
}

export type Fixture = {
  id: string
  competition_id: string
  competition_name: string
  kickoff_at: string
  matchday: number | null
  // "Matchweek 13", "Quarter-finals"...
  round_label: string | null
  // Cricket: the format, the match's name ("1st Test") and where it's played.
  format?: CricketFormat | null
  label?: string | null
  venue?: string | null
  home: string
  away: string
  questions: FixtureQuestion[]
}

export async function setRoomCompetition(roomId: string, competitionId: string, follow: boolean) {
  const { data, error } = await untypedSupabase.rpc('set_room_competition', {
    p_room_id: roomId,
    p_competition_id: competitionId,
    p_follow: follow,
  })
  return assertOk(data, error) as { competition_id: string; following: boolean }
}

// Adds fixture questions to a series: they close at kickoff, and players get
// one notification for the lot. Ones the room already has are skipped.
export async function addFixtureQuestions(roomId: string, seriesId: string, questionIds: string[]) {
  const { data, error } = await untypedSupabase.rpc('add_fixture_questions', {
    p_room_id: roomId,
    p_series_id: seriesId,
    p_fixture_question_ids: questionIds,
  })
  return assertOk(data, error) as {
    prediction_ids: string[]
    count: number
    skipped: number
  }
}

export type CompetitionKind = 'league' | 'cup' | 'tour' | 'season'

// A competition as the Fixtures home and Browse show it.
export type RoomCompetition = {
  id: string
  name: string
  sport: 'soccer' | 'cricket'
  kind: CompetitionKind
  // "England", "Europe", or a tour's two countries.
  region: string | null
  season: string | null
  following: boolean
  next: { home: string; away: string; kickoff_at: string } | null
  // Matches in the next 7 days, and how many of them the room has added from.
  week_matches: number
  week_added: number
}

export async function getRoomCompetitions(roomId: string) {
  const { data, error } = await untypedSupabase.rpc('get_room_competitions', {
    p_room_id: roomId,
  })
  return assertOk(data, error) as RoomCompetition[]
}

// One competition's page: its coming matches (six weeks) with their questions.
export async function getRoomCompetitionFixtures(roomId: string, competitionId: string) {
  const { data, error } = await untypedSupabase.rpc('get_room_competition_fixtures', {
    p_room_id: roomId,
    p_competition_id: competitionId,
  })
  return assertOk(data, error) as {
    competition: Omit<RoomCompetition, 'next' | 'week_matches' | 'week_added'>
    fixtures: Omit<Fixture, 'competition_id' | 'competition_name'>[]
  }
}

// How the match a question came from ended, once an admin has confirmed it
// (null otherwise, or for a question not from the fixtures). Shown next to
// the question's result (MatchResultCard).
export type PredictionMatchResult = {
  sport: 'soccer' | 'cricket'
  competition: string
  format: CricketFormat | null
  // The match's own name ("1st Test") and its round ("Matchweek 13").
  label: string | null
  round: string | null
  venue: string | null
  kickoff_at: string
  // Short names ("ARS") and full ones ("Arsenal").
  home: string
  away: string
  home_name: string | null
  away_name: string | null
  status: FixtureStatus
  result: FixtureResult | CricketFixtureResult | null
  confirmed_at: string
}

export async function getPredictionMatchResult(predictionId: string) {
  const { data, error } = await untypedSupabase.rpc('get_prediction_match_result', {
    p_prediction_id: predictionId,
  })
  return assertOk(data, error) as PredictionMatchResult | null
}
// #endregion Fixtures

// #region Platform admin (/admin)
// -------------------------------------------------------
// Every call is checked on the server (public.platform_admins).

// Whether the signed-in player is on the Crow team.
export async function getMyPlatformAdmin() {
  const { data, error } = await untypedSupabase.rpc('get_my_platform_admin')
  return assertOk(data, error) as boolean
}

type GoalScore = { home: number | null; away: number | null }

// A match's saved score, as the feed or an admin wrote it.
export type FixtureResult = {
  winner: 'home' | 'away' | 'draw' | null
  duration: 'regular' | 'extra_time' | 'penalties'
  full_time: GoalScore
  half_time: GoalScore
  regular_time?: GoalScore
  extra_time?: GoalScore
  penalties?: GoalScore
}

export type FixtureStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'abandoned' | 'cancelled'

// A cricket match's result, with sides as home or away.
export type CricketFixtureResult = {
  winner: 'home' | 'away' | 'draw' | 'tie' | 'no_result' | null
  toss_winner: 'home' | 'away' | null
  toss_choice: 'bat' | 'bowl' | null
  innings: { team: 'home' | 'away' | null; runs: number; wickets: number; overs: number }[]
  status_text: string
}

export type CricketFormat = 'test' | 'odi' | 't20'

export type AdminResultQuestion = {
  id: string
  title: string
  options: { key: string; label: string }[]
  // What the score says: an option key, or null when it can't tell.
  suggested: string | null
  // The confirmed answer: an option key or 'no_result'.
  outcome: string | null
  rooms: number
  // Room questions still open or locked.
  waiting: number
  by_crow: number
  by_hand: number
}

export type AdminResultFixture = {
  id: string
  competition_name: string
  round_label: string | null
  kickoff_at: string
  status: FixtureStatus
  home: string
  away: string
  sport: 'soccer' | 'cricket'
  format: CricketFormat | null
  // "1st Test"
  label: string | null
  result: FixtureResult | CricketFixtureResult | null
  result_source: 'provider' | 'manual' | null
  confirmed_at: string | null
  confirmed_by: string | null
  questions: AdminResultQuestion[]
}

export async function adminGetResults() {
  const { data, error } = await untypedSupabase.rpc('admin_get_results')
  return assertOk(data, error) as {
    to_confirm: AdminResultFixture[]
    confirmed: AdminResultFixture[]
    last_synced_at: string | null
  }
}

type ScoreInput = { home: number; away: number }

// A score typed by an admin: the 90 minutes, half time, how it ended, and
// with extra time the score after it, with penalties the shootout.
export type ManualFixtureResult = {
  duration: 'regular' | 'extra_time' | 'penalties'
  ninety: ScoreInput
  half_time: ScoreInput
  after_extra_time?: ScoreInput
  penalties?: ScoreInput
}

export async function adminSetFixtureResult(
  fixtureId: string,
  status: Exclude<FixtureStatus, 'scheduled' | 'live'>,
  result: ManualFixtureResult | null,
) {
  const { data, error } = await untypedSupabase.rpc('admin_set_fixture_result', {
    p_fixture_id: fixtureId,
    p_status: status,
    p_result: result,
  })
  return assertOk(data, error) as AdminResultFixture
}

// outcomes: fixture question id → option key or 'no_result'.
export async function adminConfirmFixture(fixtureId: string, outcomes: Record<string, string>) {
  const { data, error } = await untypedSupabase.rpc('admin_confirm_fixture', {
    p_fixture_id: fixtureId,
    p_outcomes: outcomes,
  })
  return assertOk(data, error) as {
    fixture: AdminResultFixture
    revealed: number
    fixed: number
    not_fixed: number
  }
}

export type AdminCompetition = {
  id: string
  name: string
  // The tag its questions get in rooms, and whether an admin set it (else
  // it's the name when it fits, or the sport).
  tag: string
  tag_is_custom: boolean
  // Filed away by an admin (and switched off).
  archived_at: string | null
  sport: 'soccer' | 'cricket'
  provider: string
  provider_ref: string
  kind: CompetitionKind
  region: string | null
  season: string | null
  active: boolean
  synced_at: string | null
  starts_on: string | null
  ends_on: string | null
  // The last failed sync, until one works again.
  last_sync_error: string | null
  last_sync_error_at: string | null
  rooms: number
  upcoming: number
}

export async function adminGetCompetitions() {
  const { data, error } = await untypedSupabase.rpc('admin_get_competitions')
  return assertOk(data, error) as AdminCompetition[]
}

export async function adminSetCompetitionActive(competitionId: string, active: boolean) {
  const { data, error } = await untypedSupabase.rpc('admin_set_competition_active', {
    p_competition_id: competitionId,
    p_active: active,
  })
  return assertOk(data, error)
}

// Every active competition, or one provider's. False when the sync isn't set
// up on the server yet.
export async function adminRequestFixtureSync(provider?: string) {
  const { data, error } = await untypedSupabase.rpc('admin_request_fixture_sync', {
    p_provider: provider ?? null,
  })
  return assertOk(data, error) as boolean
}

export type AdminFixtureQuestion = {
  id: string
  title: string
  description: string | null
  options: { key: string; label: string }[]
  hidden: boolean
  // Reworded by an admin: the sync keeps this wording.
  customized: boolean
  // A one-off question an admin wrote for this match.
  extra: boolean
  // Minutes before the start that picks close (toss questions).
  closes_before: number
  rooms: number
}

export type AdminUpcomingFixture = {
  id: string
  competition_name: string
  round_label: string | null
  matchday?: number | null
  kickoff_at: string
  format: CricketFormat | null
  label: string | null
  venue: string | null
  home: string
  away: string
  questions: AdminFixtureQuestion[]
}

export async function adminGetFixtures(competitionId: string) {
  const { data, error } = await untypedSupabase.rpc('admin_get_fixtures', {
    p_competition_id: competitionId,
    p_days: 42,
  })
  return assertOk(data, error) as AdminUpcomingFixture[]
}

export async function adminUpdateFixtureQuestion(
  questionId: string,
  changes: { hidden?: boolean; title?: string; description?: string; reset?: boolean },
) {
  const { data, error } = await untypedSupabase.rpc('admin_update_fixture_question', {
    p_question_id: questionId,
    p_hidden: changes.hidden ?? null,
    p_title: changes.title ?? null,
    p_description: changes.description ?? null,
    p_reset: changes.reset ?? false,
  })
  return assertOk(data, error)
}
// A series the provider lists, from the search in /admin.
export type ProviderSeries = {
  provider: string
  provider_ref: string
  name: string
  kind: CompetitionKind
  region: string | null
  starts_on: string | null
  ends_on: string | null
  tests: number
  odis: number
  t20s: number
  matches: number
}

// Searches CricketData.org (through the catalog-admin edge function, which
// holds the key). One API call per search.
export async function adminSearchSeries(query: string) {
  const { data, error } = await supabase.functions.invoke('catalog-admin', {
    body: { action: 'search_series', query },
  })
  if (error) {
    let message = error.message
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) message = body.error
    } catch {
      // Keep the client's message.
    }
    throw new Error(message)
  }
  return (data as { series: ProviderSeries[] }).series
}

export async function adminAddCompetition(series: ProviderSeries, sport: 'soccer' | 'cricket', tag?: string | null) {
  const { data, error } = await untypedSupabase.rpc('admin_add_competition', {
    p_provider: series.provider,
    p_provider_ref: series.provider_ref,
    p_name: series.name,
    p_sport: sport,
    p_kind: series.kind,
    p_region: series.region,
    p_starts_on: series.starts_on,
    p_ends_on: series.ends_on,
    p_tag: tag?.trim() || null,
  })
  return assertOk(data, error) as { id: string }
}

// What rooms ask to predict next (Up next), last 90 days, leaving out rooms
// Crow admins own.
export type UpNextDemandRow = {
  name: string
  // Rooms whose open ideas include it, and the picks on those.
  rooms: number
  picks: number
  // Series started from it.
  started: number
  last_asked_at: string
}

export type UpNextDemand = {
  competitions: Array<UpNextDemandRow & { id: string; sport: 'soccer' | 'cricket'; on_offer: boolean }>
  requests: UpNextDemandRow[]
}

export async function adminGetUpNextDemand() {
  const { data, error } = await untypedSupabase.rpc('admin_get_up_next_demand')
  return assertOk(data, error) as UpNextDemand
}

// Files a competition away (switching it off), or brings it back.
export async function adminSetCompetitionArchived(competitionId: string, archived: boolean) {
  const { error } = await untypedSupabase.rpc('admin_set_competition_archived', {
    p_competition_id: competitionId,
    p_archived: archived,
  })
  if (error) throw error
}

// The tag a competition's questions get in rooms; null or blank for the
// default. Questions rooms already added from it get the new tag too.
export async function adminSetCompetitionTag(competitionId: string, tag: string | null) {
  const { data, error } = await untypedSupabase.rpc('admin_set_competition_tag', {
    p_competition_id: competitionId,
    p_tag: tag?.trim() || null,
  })
  return assertOk(data, error) as { id: string; tag: string; tag_is_custom: boolean; questions_retagged: number }
}

// A one-off question for one match; its answer is picked when confirming.
export async function adminAddFixtureExtra(fixtureId: string, title: string, description: string, options: string[]) {
  const { data, error } = await untypedSupabase.rpc('admin_add_fixture_extra', {
    p_fixture_id: fixtureId,
    p_title: title,
    p_description: description,
    p_options: options,
  })
  return assertOk(data, error) as { id: string }
}

export async function adminDeleteFixtureExtra(questionId: string) {
  const { error } = await untypedSupabase.rpc('admin_delete_fixture_extra', { p_question_id: questionId })
  if (error) throw error
}
// #endregion Platform admin

// #region Bets
// -------------------------------------------------------
// Everyone's bets once picks lock. While the prediction is open the database
// returns only the player's own.
export async function getBetsForPrediction(predictionId: string) {
  const { data, error } = await supabase
    .from('bets')
    .select(`
      id,
      prediction_id,
      option_id,
      player_id,
      amount,
      updated_at,
      payout,
      option:prediction_options (
        id,
        label
      )  
    `)
    .eq('prediction_id', predictionId)
    .order('amount', { ascending: false })

  if (error) throw error
  return data ?? []
}

// How many picks, points and players some predictions have, without who
// picked what. While one is open, getBetsForPrediction returns only the
// player's own bet.
export async function getPickCounts(predictionIds: string[]) {
  const { data, error } = await untypedSupabase.rpc('get_pick_counts', {
    p_prediction_ids: predictionIds,
  })
  return assertOk(data, error) as { picks: number; pool: number; players: number }
}

export async function placeBet(
  predictionId: string,
  optionId: string,
  amount: number,
) {
  const { data, error } = await supabase.rpc('place_bet', {
    p_prediction_id: predictionId,
    p_option_id: optionId,
    p_amount: amount,
  })
  return assertOk(data, error) as {
    bet_placed: boolean
    prediction_id: string
    option_id: string
    amount: number
    points_available: number
  }
}

export async function cancelBet(predictionId: string) {
  const { data, error } = await supabase.rpc('cancel_bet', {
    p_prediction_id: predictionId,
  })
  return assertOk(data, error)
}

// #endregion Bets

// #region Leaderboard
export async function getRoomOverallStandings(roomId: string) {
  const { data, error } = await untypedSupabase.rpc('get_room_overall_standings', {
    p_room_id: roomId,
  })
  return assertOk(data, error) as OverallStandingEntry[]
}

export async function getSeriesLeaderboard(
  roomId: string,
  seriesId: string,
  sortBy: 'points' | 'rating' | 'accuracy' | 'streak' = 'points',
) {
  const { data, error } = await untypedSupabase.rpc('get_series_leaderboard', {
    p_room_id: roomId,
    p_series_id: seriesId,
    p_sort_by: sortBy,
  })
  return assertOk(data, error) as LeaderboardEntry[]
}

// Null until the series' first Monday snapshot.
export async function getSeriesWeeklyRecap(roomId: string, seriesId: string) {
  const { data, error } = await supabase.rpc('get_series_weekly_recap', {
    p_room_id: roomId,
    p_series_id: seriesId,
  })
  if (error) throw error
  return (data ?? null) as SeriesWeeklyRecap | null
}

export type PredictionHistoryCounts = {
  all: number
  wins: number
  losses: number
  my_bets: number
}

// How many finished predictions each History filter holds for the caller.
export async function getRoomPredictionHistoryCounts(
  roomId: string,
  seriesId?: string,
  search?: string,
) {
  const { data, error } = await untypedSupabase.rpc('get_room_prediction_history_counts', {
    p_room_id: roomId,
    p_series_id: seriesId ?? null,
    p_search: search || null,
  })
  return assertOk(data, error) as PredictionHistoryCounts
}

type GetRoomPredictionHistoryParams = {
  roomId: string
  limit?: number
  cursorCreatedAt?: string | null
  cursorId?: string | null
  search?: string | null
  filter?: PredictionHistoryFilter
  seriesId?: string | null
}

export async function getRoomPredictionHistory({
  roomId,
  limit = 20,
  cursorCreatedAt = null,
  cursorId = null,
  search = null,
  filter = 'all',
  seriesId = null,
}: GetRoomPredictionHistoryParams) {
  const { data, error } = await untypedSupabase.rpc('get_room_prediction_history', {
    p_room_id: roomId,
    p_limit:   limit,
    p_cursor_created_at: cursorCreatedAt ?? undefined,
    p_cursor_id: cursorId ?? undefined,
    p_search: search ?? undefined,
    p_filter: filter,
    p_series_id: seriesId ?? undefined,
  })
  return assertOk(data, error) as PredictionHistoryPage
}

type GetRoomActivitiesParams = {
  roomId: string
  limit?: number
  cursorCreatedAt?: string | null
  cursorId?: string | null
  filter?: ActivityFilter
  seriesId?: string | null
}

export async function getRoomActivities({
  roomId,
  limit = 20,
  cursorCreatedAt = null,
  cursorId = null,
  filter = 'all',
  seriesId = null,
}: GetRoomActivitiesParams) {
  const { data, error } = await untypedSupabase.rpc('get_room_activities', {
    p_room_id: roomId,
    p_limit: limit,
    p_cursor_created_at: cursorCreatedAt ?? undefined,
    p_cursor_id: cursorId ?? undefined,
    p_filter: filter,
    p_series_id: seriesId ?? undefined,
  })

  return assertOk(data, error) as RoomActivitiesPage
}

export async function getRoomHasUnseenActivities(roomId: string) {
  const { data, error } = await untypedSupabase.rpc(
    'get_room_has_unseen_activities',
    {
      p_room_id: roomId,
    },
  )

  return assertOk(data, error) as boolean
}

export async function markRoomActivitiesSeen(roomId: string) {
  const { error } = await untypedSupabase.rpc('mark_room_activities_seen', {
    p_room_id: roomId,
  })

  if (error) throw error
}


export async function getRoomMemberStats(roomId: string, playerId: string) {
  const { data, error } = await supabase.rpc('get_room_member_stats', {
    p_room_id: roomId,
    p_player_id: playerId,
  })

  return assertOk(data, error) as RoomMemberStats
}

export async function getRoomMemberRecentPredictions(
  roomId: string,
  playerId: string,
  limit = 5,
  offset = 0,
) {
  const { data, error } = await supabase.rpc('get_room_member_recent_predictions', {
    p_room_id: roomId,
    p_player_id: playerId,
    p_limit: limit,
    p_offset: offset,
  })

  return assertOk(data, error) as RoomMemberRecentPrediction[]
}

export async function getRoomMemberSeriesRecognition(
  roomId: string,
  playerId: string,
) {
  const { data: placementsData, error: placementsError } = await untypedSupabase
    .from('series_placements')
    .select(`
      id,
      series_id,
      player_id,
      placement,
      points,
      collected_at,
      created_at,
      series:series!inner (
        id,
        room_id,
        status,
        title,
        tier,
        completed_at
      )
    `)
    .eq('player_id', playerId)
    .eq('series.room_id', roomId)
    .in('series.status', ['completed', 'archived'])
    .order('created_at', { ascending: false })

  if (placementsError) throw placementsError

  const championships = (placementsData ?? []).map((row: any) => ({
    id: row.id,
    series_id: row.series_id,
    series_title: row.series?.title ?? 'Series',
    placement: row.placement,
    points: Number(row.points ?? 0),
    series_tier: row.series?.tier ?? null,
    series_completed_at: row.series?.completed_at ?? null,
    collected_at: row.collected_at,
    created_at: row.created_at,
  }))

  const { data: awardsData, error: awardsError } = await untypedSupabase
    .from('series_awards')
    .select(`
      id,
      series_id,
      player_id,
      award_type,
      description,
      value,
      tier,
      collected_at,
      created_at,
      series:series!inner (
        id,
        room_id,
        status,
        title,
        tier,
        completed_at
      )
    `)
    .eq('player_id', playerId)
    .eq('series.room_id', roomId)
    .in('series.status', ['completed', 'archived'])
    .order('created_at', { ascending: false })

  if (awardsError) throw awardsError

  const awards = (awardsData ?? []).map((row: any) => ({
    id: row.id,
    series_id: row.series_id,
    series_title: row.series?.title ?? 'Series',
    award_type: row.award_type,
    description: row.description,
    value: Number(row.value ?? 0),
    award_tier: row.tier ?? null,
    series_tier: row.series?.tier ?? null,
    series_completed_at: row.series?.completed_at ?? null,
    collected_at: row.collected_at,
    created_at: row.created_at,
  }))

  return {
    championships,
    awards,
  } as RoomMemberSeriesRecognition
}
export type RoomMemberMilestone = {
  id: string
  milestone_type: MilestoneType
  achieved_at: string
  series_id: string | null
}

// Career milestones, newest first.
export async function getRoomMemberMilestones(roomId: string, playerId: string) {
  const { data, error } = await supabase
    .from('room_member_milestones')
    .select('id, milestone_type, achieved_at, series_id')
    .eq('room_id', roomId)
    .eq('player_id', playerId)
    .order('achieved_at', { ascending: false })

  if (error) throw error
  return (data ?? []).filter((row): row is RoomMemberMilestone =>
    isMilestoneType(row.milestone_type),
  )
}

// The play-style titles a player holds in a room right now.
export async function getRoomMemberStyle(roomId: string, playerId: string) {
  const { data, error } = await supabase.rpc('get_room_member_style', {
    p_room_id: roomId,
    p_player_id: playerId,
  })

  return assertOk(data, error) as { titles: StyleTitle[] }
}

// A player's profile across rooms; no id means your own.
export async function getPlayerProfile(playerId: string | null = null) {
  const { data, error } = await untypedSupabase.rpc('get_player_profile', {
    p_player_id: playerId,
  })
  const profile = assertOk(data, error) as PlayerProfile
  return {
    ...profile,
    milestones: profile.milestones.filter((row) => isMilestoneType(row.milestone_type)),
  }
}

// You against another player across the rooms you share.
export async function getHeadToHead(playerId: string) {
  const { data, error } = await untypedSupabase.rpc('get_head_to_head', {
    p_player_id: playerId,
  })
  return assertOk(data, error) as HeadToHead
}

// #endregion Leaderboard
// #region People and room invites
export async function getPeopleYouPlayWith() {
  const { data, error } = await untypedSupabase.rpc('get_people_you_play_with')
  return assertOk(data, error) as PersonYouPlayWith[]
}

export async function getInvitableRooms(playerId: string) {
  const { data, error } = await untypedSupabase.rpc('get_invitable_rooms', {
    p_player_id: playerId,
  })
  return assertOk(data, error) as InvitableRoom[]
}

export async function inviteToRoom(roomId: string, playerId: string) {
  const { error } = await untypedSupabase.rpc('invite_to_room', {
    p_room_id: roomId,
    p_player_id: playerId,
  })
  if (error) throw error
}

export async function getMyRoomInvites() {
  const { data, error } = await untypedSupabase.rpc('get_my_room_invites')
  return assertOk(data, error) as RoomInvite[]
}

// Yes joins (or asks to join) the room; no turns the invite down.
export async function respondToRoomInvite(roomId: string, accept: boolean) {
  const { data, error } = await untypedSupabase.rpc('respond_to_room_invite', {
    p_room_id: roomId,
    p_accept: accept,
  })
  return assertOk(data, error) as {
    room_id: string
    code?: string
    name?: string
    membership: 'member' | 'requested' | null
  }
}
// #endregion People and room invites


// Organizers set a prediction's optional description and tags (kept as typed).
export async function setPredictionDetails(predictionId: string, description: string, tags: string[]) {
  const { error } = await untypedSupabase.rpc('set_prediction_details', {
    p_prediction_id: predictionId,
    p_description: description,
    p_tags: tags,
  })
  if (error) throw error
}

export async function getRoomTags(roomId: string) {
  const { data, error } = await untypedSupabase.rpc('get_room_tags', { p_room_id: roomId })
  return assertOk(data, error) as string[]
}

// #region Home: results and weekly recap
export type UnseenResult = {
  prediction_id: string
  title: string
  status: 'revealed' | 'no_result'
  resolved_at: string | null
  my_pick: string
  winning_label: string | null
  amount: number
  payout: number
  // Points won or lost; 0 for a refund.
  net: number
}

export type MyWeeklyRecap = {
  week_key: string
  rank: number | null
  // Places moved since the Monday before; positive is up.
  rank_change: number | null
  balance: number
  balance_change: number
  newly_ranked: boolean
}

export async function getMyUnseenResults(roomId: string, seriesId: string) {
  const { data, error } = await untypedSupabase.rpc('get_my_unseen_results', {
    p_room_id: roomId,
    p_series_id: seriesId,
  })
  return assertOk(data, error) as UnseenResult[]
}

export async function markResultsSeen(predictionIds: string[]) {
  const { error } = await untypedSupabase.rpc('mark_results_seen', {
    p_prediction_ids: predictionIds,
  })
  if (error) throw error
}

export async function getMyWeeklyRecap(roomId: string, seriesId: string) {
  const { data, error } = await untypedSupabase.rpc('get_my_weekly_recap', {
    p_room_id: roomId,
    p_series_id: seriesId,
  })
  if (error) throw error
  return (data ?? null) as MyWeeklyRecap | null
}

export async function dismissWeeklyRecap(seriesId: string, weekKey: string) {
  const { error } = await untypedSupabase.rpc('dismiss_weekly_recap', {
    p_series_id: seriesId,
    p_week_key: weekKey,
  })
  if (error) throw error
}
// #endregion Home

// #region Up next
// The room answers "What should we predict next?": one pick each, from Crow's
// competitions or something Crow doesn't have yet.
export type UpNextOption = {
  // Null for a competition suggested to start from (nobody has picked it).
  id: string | null
  competition_id: string | null
  title: string
  sport: 'soccer' | 'cricket' | null
  // A competition Crow has on offer now (rooms can follow it).
  on_crow: boolean
  picks: number
  picked_by_me: boolean
  // The room already follows it.
  followed: boolean
  created_by_me: boolean
  is_seed: boolean
  // Who picked it, for hosts only.
  pickers: string[] | null
}

export type UpNextCompetition = {
  id: string
  name: string
  sport: 'soccer' | 'cricket'
  kind: CompetitionKind
  region: string | null
}

export type UpNextBoard = {
  options: UpNextOption[]
  total_picks: number
  // Everything on offer, for "Something else".
  catalog: UpNextCompetition[]
}

export async function getUpNext(roomId: string) {
  const { data, error } = await untypedSupabase.rpc('get_up_next', { p_room_id: roomId })
  return assertOk(data, error) as UpNextBoard
}

// Your pick: a competition, or by name something Crow doesn't have. It
// replaces any pick you had. Returns the board.
export async function pickUpNext(roomId: string, pick: { competitionId: string } | { title: string }) {
  const { data, error } = await untypedSupabase.rpc('pick_up_next', {
    p_room_id: roomId,
    p_competition_id: 'competitionId' in pick ? pick.competitionId : null,
    p_title: 'title' in pick ? pick.title : null,
  })
  return assertOk(data, error) as UpNextBoard
}

export async function clearUpNextPick(roomId: string) {
  const { data, error } = await untypedSupabase.rpc('clear_up_next_pick', { p_room_id: roomId })
  return assertOk(data, error) as UpNextBoard
}

// Hosts: the next series from an idea, with the last series' points, and
// following its competition when Crow has it.
export async function startSeriesFromIdea(suggestionId: string, title: string, follow: boolean) {
  const { data, error } = await untypedSupabase.rpc('start_series_from_idea', {
    p_suggestion_id: suggestionId,
    p_title: title,
    p_follow: follow,
  })
  return assertOk(data, error) as { series_id: string; competition_id: string | null }
}

export async function removeSeriesSuggestion(suggestionId: string) {
  const { error } = await untypedSupabase.rpc('remove_series_suggestion', {
    p_suggestion_id: suggestionId,
  })
  if (error) throw error
}

export async function markSeriesSuggestionPlayed(suggestionId: string, seriesId: string) {
  const { error } = await untypedSupabase.rpc('mark_series_suggestion_played', {
    p_suggestion_id: suggestionId,
    p_series_id: seriesId,
  })
  if (error) throw error
}
// #endregion Up next

export type PredictionNeighbour = {
  id: string
  title: string
  series_prediction_number: number | null
}

// The predictions either side of this one, for stepping through: in a series
// by their number, otherwise the room's others outside a series by when they
// were made. Scheduled ones are left out, as on every list.
export async function getPredictionNeighbours(params: {
  roomId: string
  predictionId: string
  seriesId: string | null
  number: number | null
  createdAt: string | null
}): Promise<{ previous: PredictionNeighbour | null; next: PredictionNeighbour | null }> {
  const { roomId, predictionId, seriesId, number, createdAt } = params
  const side = async (direction: 'previous' | 'next') => {
    let query = supabase
      .from('predictions')
      .select('id, title, series_prediction_number')
      .eq('room_id', roomId)
      .neq('id', predictionId)
      .neq('status', 'scheduled')
    query = seriesId ? query.eq('series_id', seriesId) : query.is('series_id', null)
    const before = direction === 'previous'
    if (number !== null) {
      query = (before ? query.lt('series_prediction_number', number) : query.gt('series_prediction_number', number))
        .order('series_prediction_number', { ascending: !before })
    } else if (createdAt) {
      query = (before ? query.lt('created_at', createdAt) : query.gt('created_at', createdAt))
        .order('created_at', { ascending: !before })
    } else {
      return null
    }
    const { data, error } = await query.limit(1).maybeSingle()
    if (error) throw error
    return data as PredictionNeighbour | null
  }
  const [previous, next] = await Promise.all([side('previous'), side('next')])
  return { previous, next }
}

// Getting started checklist: has this player made any pick in the room?
// Their own bets are always readable to them.
export async function hasPickInRoom(roomId: string, playerId: string): Promise<boolean> {
  const { data, error } = await untypedSupabase
    .from('bets')
    .select('id, predictions!inner(room_id)')
    .eq('player_id', playerId)
    .eq('predictions.room_id', roomId)
    .limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

// Getting started checklist (hosts): has the room had any question yet?
export async function roomHasQuestions(roomId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('predictions')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
  if (error) throw error
  return (count ?? 0) > 0
}
