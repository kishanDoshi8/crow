import type { LeaderboardEntry } from "./types"

export type RoomStatType = "podium" | "default"
export type RoomStat = PodiumRoomStat | DefaultRoomStat

export type BaseRoomStat = {
  key: string
  type: RoomStatType
  priority?: number
  weight?: number
  displayType?: "pinned" | "priority" | "weighted" | "default"
}

export type DefaultRoomStat = BaseRoomStat & {
  type: 'default'
  title: string
  value: string
  subtitle?: string
  icon?: string
}

export type PodiumRoomStat = BaseRoomStat & {
  type: "podium"
  entries: LeaderboardEntry[]
}
