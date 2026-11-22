import type { RoomCompetition } from "@/shared/lib/api";

const SPORTS: Record<string, string> = { soccer: "Football", cricket: "Cricket" };

export const sportLabel = (sport: string) => SPORTS[sport] ?? sport;

// Browse groups: sport plus where it's played. A tour belongs to two
// countries, so tours get a group of their own per sport.
export function categoryOf(competition: Pick<RoomCompetition, "sport" | "kind" | "region">) {
	const sport = sportLabel(competition.sport);
	if (competition.kind === "tour") return `${sport}, tours`;
	return competition.region ? `${sport}, ${competition.region}` : sport;
}

// "Premier League" → "PL", "Indian Premier League" → "IPL".
export function monogram(name: string) {
	const letters = name
		.split(/\s+/)
		.filter((word) => /^[A-Z0-9]/.test(word))
		.map((word) => word[0]);
	return (letters.length > 0 ? letters : [name[0] ?? "?"]).slice(0, 3).join("").toUpperCase();
}

const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

// "Saturday 28 November"
export const dayLabel = (iso: string) => dayFormat.format(new Date(iso));
// "15:00", in the viewer's time zone.
export const kickoffTime = (iso: string) => timeFormat.format(new Date(iso));

type Dated = { kickoff_at: string; round_label: string | null };

// A competition's rounds in the order they're played: matchweeks, cup
// rounds, or (with no round names) days.
export function roundsOf<T extends Dated>(fixtures: T[]) {
	const rounds: { label: string; fixtures: T[] }[] = [];
	for (const fixture of fixtures) {
		const label = fixture.round_label ?? dayLabel(fixture.kickoff_at);
		const round = rounds.find((r) => r.label === label);
		if (round) round.fixtures.push(fixture);
		else rounds.push({ label, fixtures: [fixture] });
	}
	return rounds;
}

// One round's matches by day, for the sticky day headers.
export function daysOf<T extends Dated>(fixtures: T[]) {
	const days: { label: string; fixtures: T[] }[] = [];
	for (const fixture of fixtures) {
		const label = dayLabel(fixture.kickoff_at);
		const day = days.find((d) => d.label === label);
		if (day) day.fixtures.push(fixture);
		else days.push({ label, fixtures: [fixture] });
	}
	return days;
}

// "1st Test, Basin Reserve, Wellington": the line under a cricket match.
export const matchDetail = (match: { label?: string | null; venue?: string | null }) =>
	[match.label, match.venue].filter(Boolean).join(", ") || null;
