// The six reactions, in the order they're shown. The keys match the
// database's check constraint on prediction_reactions.reaction.
export const REACTIONS = [
	{ key: "laugh", emoji: "😂", label: "Laugh" },
	{ key: "wow", emoji: "😮", label: "Wow" },
	{ key: "cry", emoji: "😢", label: "Cry" },
	{ key: "angry", emoji: "😠", label: "Angry" },
	{ key: "meh", emoji: "😒", label: "Meh" },
	{ key: "fire", emoji: "🔥", label: "Fire" },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]["key"];

export function reactionEmoji(key: string) {
	return REACTIONS.find((reaction) => reaction.key === key)?.emoji ?? "";
}
