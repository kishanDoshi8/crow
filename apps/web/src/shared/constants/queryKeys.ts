// The signed-in player's profile (balance, last visited room, ...).
export const playerQueryKey = ["player"];

export const roomKeys = {
  all: ["rooms"] as const,

  byCode: (roomCode: string) =>
    [...roomKeys.all, "code", roomCode] as const,

  byPlayer: (playerId: string) =>
    [...roomKeys.all, "player", playerId] as const,

  detail: (roomId: string) =>
    [...roomKeys.all, roomId] as const,

  members: (roomId: string) =>
    [...roomKeys.detail(roomId), "members"] as const,

  activePrediction: (roomId: string) =>
    [...roomKeys.detail(roomId), "activePrediction"] as const,

  activePredictions: (roomId: string) =>
    [...roomKeys.detail(roomId), "activePredictions"] as const,

  series: (roomId: string) =>
    [...roomKeys.detail(roomId), "series"] as const,

  prediction: (roomId: string, predictionId: string) =>
    [...roomKeys.detail(roomId), "predictions", predictionId] as const,

  // The match it came from and how it ended; under the prediction's key too.
  matchResult: (roomId: string, predictionId: string) =>
    [...roomKeys.detail(roomId), "predictions", predictionId, "matchResult"] as const,

  // Under the prediction's key, so refreshing a prediction refreshes its talk.
  talk: (roomId: string, predictionId: string) =>
    [...roomKeys.detail(roomId), "predictions", predictionId, "talk"] as const,

  bets: (roomId: string, predictionId: string) =>
    [...roomKeys.detail(roomId), "predictions", predictionId, "bets"] as const,
  // How many picks, points and players, for open predictions (their bets
  // are hidden). One question or a match's worth.
  pickCounts: (roomId: string, predictionIds: string[] = []) =>
    [...roomKeys.detail(roomId), "pickCounts", ...predictionIds] as const,

  myBet: (roomId: string, predictionId: string, playerId: string) =>
    [...roomKeys.detail(roomId), "predictions", predictionId, "myBet", playerId] as const,

  preferences: (roomId: string) =>
    [...roomKeys.detail(roomId), "preferences"] as const,

  seriesLeaderboard: (
    roomId: string,
    seriesId: string,
    sortBy = "points",
  ) => [...roomKeys.detail(roomId), "seriesLeaderboard", seriesId, sortBy] as const,

  // Staff only: locked predictions to close and open ones, across series.
  manageQueue: (roomId: string) =>
    [...roomKeys.detail(roomId), "manageQueue"] as const,

  seriesWallets: (roomId: string) =>
    [...roomKeys.detail(roomId), "seriesWallets"] as const,

  overallStandings: (roomId: string) =>
    [...roomKeys.detail(roomId), "overallStandings"] as const,

  seriesPlacements: (roomId: string, seriesId: string) =>
    [...roomKeys.detail(roomId), "seriesPlacements", seriesId] as const,

  seriesAwards: (roomId: string, seriesId: string) =>
    [...roomKeys.detail(roomId), "seriesAwards", seriesId] as const,

  // Last completed week of a series, for the weekly share card.
  seriesWeeklyRecap: (roomId: string, seriesId: string) =>
    [...roomKeys.detail(roomId), "seriesWeeklyRecap", seriesId] as const,

  seriesLeaderboardSelector: (
    roomId: string,
    selectedSeriesId = "default",
  ) =>
    [...roomKeys.detail(roomId), "seriesLeaderboardSelector", selectedSeriesId] as const,

  seriesSelector: (
    roomId: string,
    mode: "active" | "active-or-last" | "all",
    selectedSeriesId = "default",
  ) =>
    [...roomKeys.detail(roomId), "seriesSelector", mode, selectedSeriesId] as const,

  stats: (roomId: string) =>
    [...roomKeys.detail(roomId), "stats"] as const,

  predictionHistory: (roomId: string) =>
    [...roomKeys.detail(roomId), "predictionHistory"] as const,

  activities: (roomId: string, filter = "all", seriesId = "all") =>
    [...roomKeys.detail(roomId), "activities", filter, seriesId] as const,

  roomMemberStats: (roomId: string, playerId: string) =>
    [...roomKeys.detail(roomId), "memberProfile", playerId, "stats"] as const,

  roomMemberRecentPredictions: (roomId: string, playerId: string, limit = 5, offset = 0) =>
    [...roomKeys.detail(roomId), "memberProfile", playerId, "recentPredictions", limit, offset] as const,

  roomMemberSeriesRecognition: (roomId: string, playerId: string) =>
    [...roomKeys.detail(roomId), "memberProfile", playerId, "seriesRecognition"] as const,
  roomMemberMilestones: (roomId: string, playerId: string) =>
    [...roomKeys.detail(roomId), "memberProfile", playerId, "milestones"] as const,
  roomMemberStyle: (roomId: string, playerId: string) =>
    [...roomKeys.detail(roomId), "memberProfile", playerId, "style"] as const,
  unseenResults: (roomId: string, seriesId: string) =>
    [...roomKeys.detail(roomId), "unseenResults", seriesId] as const,
  myWeeklyRecap: (roomId: string, seriesId: string) =>
    [...roomKeys.detail(roomId), "myWeeklyRecap", seriesId] as const,
  roomTags: (roomId: string) =>
    [...roomKeys.detail(roomId), "roomTags"] as const,

  // Organizers: followed competitions and their upcoming fixtures.
  fixtures: (roomId: string) =>
    [...roomKeys.detail(roomId), "fixtures"] as const,

  // Under fixtures, so adding or following refreshes them all.
  competitions: (roomId: string) =>
    [...roomKeys.fixtures(roomId), "competitions"] as const,

  competitionFixtures: (roomId: string, competitionId: string) =>
    [...roomKeys.fixtures(roomId), "competition", competitionId] as const,
  seriesSuggestions: (roomId: string) =>
    [...roomKeys.detail(roomId), "seriesSuggestions"] as const,
};

// Player profiles across rooms. "me" is your own; others by player id.
export const profileKeys = {
  all: ["profile"] as const,
  detail: (playerId: string | null) =>
    [...profileKeys.all, playerId ?? "me"] as const,
  headToHead: (playerId: string) =>
    [...profileKeys.all, playerId, "headToHead"] as const,
  people: () => [...profileKeys.all, "people"] as const,
  invitableRooms: (playerId: string) =>
    [...profileKeys.all, playerId, "invitableRooms"] as const,
};

// Room invites waiting on you.
export const roomInvitesKey = ["roomInvites"] as const;

export const localStorageKeys = {
  userPreference: {
    theme: "theme",
    // Suffixed with the room id: the series a player last looked at in that room.
    currentSeries: "currentSeries",
  }
}
// Platform admin (/admin).
export const adminKeys = {
  all: ["admin"] as const,
  isAdmin: () => [...adminKeys.all, "isAdmin"] as const,
  results: () => [...adminKeys.all, "results"] as const,
  competitions: () => [...adminKeys.all, "competitions"] as const,
  upNextDemand: () => [...adminKeys.all, "upNextDemand"] as const,
  fixtures: (competitionId?: string) => [...adminKeys.all, "fixtures", ...(competitionId ? [competitionId] : [])] as const,
};
