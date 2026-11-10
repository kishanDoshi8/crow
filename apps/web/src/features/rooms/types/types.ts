
import type { RoomRole } from "@/features/rooms/lib/roles";

export interface RoomMember {
  id:       string
  room_id:  string
  player_id: string
  role: RoomRole
  total_won_in_room: number
  joined_at: string
  player: {
    id: string
    username: string,
  }
}

// Someone who left, was removed, or deleted their account. Old results still
// show them, so their name stays known. Only the owner sees "removed".
export interface FormerMember {
  player_id: string
  username:  string
  status:    'left' | 'removed' | 'deleted'
  left_at:   string
}

// open: anyone with the link or code joins · request: owners and organizers
// let each person in.
export type JoinPolicy = 'open' | 'request'

export interface Room {
  id:                string
  code:              string
  name:              string
  description?:      string | null
  status:            string
  created_at:        string
  members:           RoomMember[]
  former_members?:   FormerMember[]
  // The caller was removed and can't rejoin until the owner lets them back.
  is_removed?:       boolean
  has_unseen_activities?: boolean
  // Hours after a deadline before staff get a "result needed" push.
  result_reminder_hours?: number
  // Shown in Explore (public), or reached only by link or code (private).
  listed?:           boolean
  join_policy?:      JoinPolicy
  // The most members it can have (set by the operator, not in the app).
  member_limit?:     number
  is_full?:          boolean
  // The caller has asked to join and is waiting.
  has_pending_request?: boolean

  // UI helper properties
  member_count?: number
  active_prediction_count?: number
  // Set by the invite-code lookup, which non-members can use before joining.
  organizer_username?: string | null
}

export interface ManageQueueItem {
  id:                       string
  title:                    string
  status:                   'scheduled' | 'draft' | 'locked'
  deadline:                 string
  // When a scheduled one goes live (or when a live one did).
  opens_at:                 string | null
  series_id:                string | null
  series_prediction_number: number | null
  series_title:             string | null
  // The event it was made for (e.g. a match), when it's one of a set.
  event_id:                 string | null
  event_title:              string | null
  bet_count:                number
  total_pool:               number
  options:                  { id: string; label: string; display_order: number }[]
}

// What's waiting on room staff, oldest deadline first.
export interface ManageQueue {
  role:       RoomRole
  // Locked: picks are closed and the result is due.
  to_resolve: ManageQueueItem[]
  // Still open for picks.
  open:       ManageQueueItem[]
  // Organizers only: written ahead, by when they go live.
  scheduled:  ManageQueueItem[]
  // Owners and organizers: people waiting to be let in, oldest first.
  join_requests: JoinRequest[]
}

export interface JoinRequest {
  player_id:  string
  username:   string
  // 'explore', or the ref of the link they used; null for a typed code.
  via:        string | null
  created_at: string
}
