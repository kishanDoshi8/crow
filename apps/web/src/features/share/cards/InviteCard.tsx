import {
	CardCanvas,
	LogoTile,
	OptionRow,
	Pill,
} from "@/features/share/components/AppCard";
import { app, type CardFormat } from "@/features/share/tokens";
import { twColor } from "@/shared/lib/utils";

export type InviteCardData = {
	roomName: string;
	roomCode: string;
	host: string;
	memberCount: number;
	livePredictions: number;
	// The active series, if there is one: what a new player would join.
	series: { title: string; startingStack: number } | null;
	// The open prediction that locks soonest, as a taste of what's live.
	teaser: {
		question: string;
		locks: string;
		options: Array<{ label: string; share: number }>;
	} | null;
};

// What fits in the teaser on each format.
// Everything is shown; this only guards against an absurd number of options.
const MAX_TEASER_OPTIONS = 8;

// The room's name is the loudest thing; long names step down to fit.
function nameSize(name: string) {
	if (name.length <= 10) return 132;
	if (name.length <= 15) return 104;
	if (name.length <= 22) return 80;
	return 64;
}

function plural(count: number, one: string, many: string) {
	return `${count} ${count === 1 ? one : many}`;
}

// An invitation that looks like the room itself: who's in, what's live, and
// the button to join.
export function InviteCard({
	data,
	format,
}: Readonly<{ data: InviteCardData; format: CardFormat }>) {
	const { teaser } = data;
	const options = teaser?.options.slice(0, MAX_TEASER_OPTIONS) ?? [];
	const hasCalls = options.some((option) => option.share > 0);

	return (
		<CardCanvas format={format} gap={format === "story" ? 56 : 44}>
			<div style={{ display: "flex", alignItems: "center", gap: 24 }}>
				<LogoTile />
				<span style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.05em" }}>crow</span>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
				<span style={{ fontSize: 34, color: app.muted }}>You're invited to</span>
				<span
					style={{
						fontSize: nameSize(data.roomName),
						fontWeight: 700,
						lineHeight: 1,
						letterSpacing: -4,
						overflowWrap: "anywhere",
					}}
				>
					{data.roomName}
				</span>
				<div style={{ display: "flex", gap: 14, flexWrap: "wrap", paddingTop: 8 }}>
					{data.series ? (
						<Pill tone='live' size={26}>
							● {data.series.title}
						</Pill>
					) : null}
					<Pill size={26}>{plural(data.memberCount, "player", "players")}</Pill>
					<Pill size={26}>{data.livePredictions} live</Pill>
				</div>
			</div>

			{teaser ? (
				<div
					style={{
						borderRadius: 40,
						border: `2px solid ${twColor("primary", 0.35)}`,
						background: `linear-gradient(160deg, ${twColor("primary", 0.14)}, ${app.card} 50%)`,
						padding: 48,
						display: "flex",
						flexDirection: "column",
						gap: 28,
					}}
				>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
						<Pill tone='live'>● Live</Pill>
						<span style={{ fontSize: 24, color: app.muted, whiteSpace: "nowrap" }}>Locks {teaser.locks}</span>
					</div>
					<span
						style={{
							fontSize: 48,
							fontWeight: 700,
							lineHeight: 1.15,
							overflowWrap: "anywhere",
						}}
					>
						{teaser.question}
					</span>
					<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
						{options.map((option) => (
							<OptionRow
								key={option.label}
								label={option.label}
								value={hasCalls ? `${Math.round(option.share)}%` : "No calls yet"}
								share={option.share}
								compact
							/>
						))}
					</div>
				</div>
			) : (
				<div
					style={{
						borderRadius: 40,
						border: `2px dashed ${app.hairline}`,
						padding: 48,
						fontSize: 36,
						color: app.muted,
					}}
				>
					The next prediction drops soon.
				</div>
			)}

			<span style={{ fontSize: 26, color: app.muted, lineHeight: 1.5 }}>
				{data.series
					? `Everyone starts with ${data.series.startingStack.toLocaleString()} pts. Top balance takes the title.`
					: "Same points for everyone. Top balance when the series ends takes the title."}
			</span>

			<div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
				<div
					style={{
						borderRadius: 24,
						background: app.gradient,
						padding: 30,
						textAlign: "center",
						fontSize: 40,
						fontWeight: 700,
						color: app.onGradient,
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					Join {data.roomName}
				</div>
				<span style={{ textAlign: "center", fontSize: 26, color: app.muted }}>
					{data.host} · code {data.roomCode}
				</span>
			</div>
		</CardCanvas>
	);
}
