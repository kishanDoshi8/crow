import type { ReactionKey } from "./reactions";

export type TalkStage = "open" | "locked" | "result" | "void";

export type TalkPost = {
	id: string;
	player_id: string;
	username: string;
	kind: "phrase";
	text: string;
	created_at: string;
};

export type TalkPhrase = {
	id: number;
	text: string;
	// "winner" / "loser": only offered to people who called it / missed it.
	audience: "any" | "winner" | "loser";
	// The caller has already posted it on this prediction.
	posted: boolean;
};

// Everything the Room talk section shows for one prediction.
export type PredictionTalk = {
	stage: TalkStage;
	audience: "winner" | "loser" | null;
	post_limit: number;
	my_reaction: ReactionKey | null;
	reactions: Array<{ reaction: ReactionKey; count: number }>;
	my_post_count: number;
	posts: TalkPost[];
	phrases: TalkPhrase[];
};
