import type { Bet } from "@/features/predictions/types/bet";
import type { Prediction, PredictionOption } from "@/features/predictions/types/types";

// Option colours follow the option's place in the list, so an option keeps
// its colour on every screen. Twelve, one per option at the most. Complete class names, so Tailwind generates them.
const OPTION_TONES = [
	{ dot: "bg-option-1", bar: "bg-option-1" },
	{ dot: "bg-option-2", bar: "bg-option-2" },
	{ dot: "bg-option-3", bar: "bg-option-3" },
	{ dot: "bg-option-4", bar: "bg-option-4" },
	{ dot: "bg-option-5", bar: "bg-option-5" },
	{ dot: "bg-option-6", bar: "bg-option-6" },
	{ dot: "bg-option-7", bar: "bg-option-7" },
	{ dot: "bg-option-8", bar: "bg-option-8" },
	{ dot: "bg-option-9", bar: "bg-option-9" },
	{ dot: "bg-option-10", bar: "bg-option-10" },
	{ dot: "bg-option-11", bar: "bg-option-11" },
	{ dot: "bg-option-12", bar: "bg-option-12" },
] as const;

export function optionTone(index: number) {
	return OPTION_TONES[index % OPTION_TONES.length];
}

export type OptionTally = {
	option: PredictionOption;
	index: number;
	points: number;
	picks: number;
	// Share of all points staked, 0–100, rounded.
	percent: number;
};

// Points and picks on each option, in display order.
export function tallyOptions(
	prediction: Pick<Prediction, "prediction_options">,
	bets: Pick<Bet, "option_id" | "amount">[],
): { options: OptionTally[]; pool: number; picks: number } {
	const pool = bets.reduce((sum, bet) => sum + bet.amount, 0);
	const options = [...prediction.prediction_options]
		.sort((a, b) => a.display_order - b.display_order)
		.map((option, index) => {
			const onOption = bets.filter((bet) => bet.option_id === option.id);
			const points = onOption.reduce((sum, bet) => sum + bet.amount, 0);
			return {
				option,
				index,
				points,
				picks: onOption.length,
				percent: pool ? Math.round((points / pool) * 100) : 0,
			};
		});
	return { options, pool, picks: bets.length };
}

export function initials(name: string) {
	return name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
}

export function formatPoints(points: number) {
	return points.toLocaleString();
}

// "+68", "−200", "±0": a bet's result, with a real minus sign.
export function formatDelta(points: number) {
	if (points > 0) return `+${points.toLocaleString()}`;
	if (points < 0) return `−${Math.abs(points).toLocaleString()}`;
	return "±0";
}

// "39m ago", "5h ago", "3d ago": short enough to sit beside a status.
export function formatAgo(iso: string, now = Date.now()) {
	const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

// "8:42 PM" today, "Sat 8:42 PM" this week, "Nov 2" before that.
export function formatWhen(iso: string, now = new Date()) {
	const date = new Date(iso);
	const sameDay = date.toDateString() === now.toDateString();
	const days = (now.getTime() - date.getTime()) / 86_400_000;
	if (sameDay) {
		return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
	}
	if (days < 6) {
		return date.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
	}
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
