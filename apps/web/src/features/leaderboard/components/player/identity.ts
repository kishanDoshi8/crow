import {
	CalendarCheckIcon,
	CoinsIcon,
	CrosshairIcon,
	CrownIcon,
	MedalIcon,
	RocketIcon,
} from "lucide-react";
import type { IdentityTitle, StyleTitle } from "@/shared/lib/trophyPrestige";

// How a player's identity title looks: the chip and the ring on the avatar.
// Shared by the room player card and the profile page.
export const identityToneMeta: Record<
	IdentityTitle["tone"],
	{ chipClassName: string; avatarClassName: string; Icon?: typeof CrownIcon }
> = {
	champion: {
		chipClassName: "bg-rank-1/15 text-rank-1",
		avatarClassName: "ring-2 ring-rank-1/70",
		Icon: CrownIcon,
	},
	podium: {
		chipClassName: "bg-rank-2/15 text-rank-2",
		avatarClassName: "ring-2 ring-rank-2/60",
		Icon: MedalIcon,
	},
	style: {
		chipClassName: "bg-accent/15 text-accent",
		avatarClassName: "ring-1 ring-border",
	},
	rookie: {
		chipClassName: "bg-muted text-muted-foreground",
		avatarClassName: "ring-1 ring-border",
	},
};

// Each play-style title carries its own icon.
export const styleTitleIcon: Record<StyleTitle, typeof CrownIcon> = {
	SHARPSHOOTER: CrosshairIcon,
	GIANT_KILLER: RocketIcon,
	HIGH_ROLLER: CoinsIcon,
	EVER_PRESENT: CalendarCheckIcon,
};
