import {
	CardCanvas,
	CardFooter,
	OptionRow,
	Pill,
	RoomHeader,
	singleLine,
} from "@/features/share/components/AppCard";
import { app, type CardFormat } from "@/features/share/tokens";
import { twColor } from "@/shared/lib/utils";

export type ResultCardData = {
	roomName: string;
	roomCode: string;
	host: string;
	seriesTitle: string | null;
	predictionNumber: number | null;
	question: string;
	winner: string;
	calledIt: number;
	participants: number;
	playerName: string;
	// Every option with the points riding on it, in display order.
	options: Array<{ label: string; pool: number; isWinner: boolean; isMine: boolean }>;
	// The sharer's own call; null when they didn't bet.
	call: { pick: string; stake: number; net: number } | null;
};

// Everything is shown; this only guards against an absurd number of options.
const MAX_OPTIONS = 10;

function seriesLine(data: ResultCardData) {
	if (!data.seriesTitle) return null;
	return data.predictionNumber
		? `${data.seriesTitle} · #${data.predictionNumber}`
		: data.seriesTitle;
}

// The rare results worth calling out.
function rareCall(data: ResultCardData) {
	if (!data.call || data.call.pick !== data.winner || data.participants < 3) return null;
	if (data.calledIt === 1) return `Only 1 of ${data.participants} called it`;
	if (data.calledIt / data.participants < 1 / 3) return "Called the upset";
	return null;
}

function signedPoints(net: number) {
	if (net === 0) return "±0";
	return `${net > 0 ? "+" : "−"}${Math.abs(net).toLocaleString()}`;
}

// A settled prediction as the app shows it, with the sharer's result under it.
export function ResultCard({
	data,
	format,
}: Readonly<{ data: ResultCardData; format: CardFormat }>) {
	const { call } = data;
	const total = data.options.reduce((sum, option) => sum + option.pool, 0);
	const shown = data.options.slice(0, MAX_OPTIONS);
	const hidden = data.options.length - shown.length;
	const rare = rareCall(data);
	const won = !!call && call.pick === data.winner;

	let lead = `${data.winner} won`;
	if (call) lead = won ? `${data.playerName} called it` : `${data.playerName} picked ${call.pick}`;

	let resultColor: string = app.text;
	if (call && call.net > 0) resultColor = app.win;
	if (call && call.net < 0) resultColor = app.loss;

	return (
		<CardCanvas format={format} gap={format === "story" ? 56 : 40}>
			<RoomHeader title={data.roomName} subtitle={seriesLine(data)} />

			<div
				style={{
					borderRadius: 40,
					border: `2px solid ${twColor("win", 0.3)}`,
					background: `linear-gradient(160deg, ${twColor("win", 0.12)}, ${app.card} 45%)`,
					padding: 52,
					display: "flex",
					flexDirection: "column",
					gap: 32,
				}}
			>
				<Pill tone='win'>✓ Resolved</Pill>
				<span
					style={{
						fontSize: 56,
						fontWeight: 700,
						lineHeight: 1.15,
						overflowWrap: "anywhere",
					}}
				>
					{data.question}
				</span>
				<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
					{shown.map((option) => {
						let chip: string | null = null;
						const pick = `${data.playerName}'s pick`;
						if (option.isWinner && option.isMine) chip = `Winner · ${pick}`;
						else if (option.isWinner) chip = "Winner";
						else if (option.isMine) chip = pick;
						return (
							<OptionRow
								key={option.label}
								label={option.label}
								value={`${option.pool.toLocaleString()} pts`}
								share={total > 0 ? (option.pool / total) * 100 : 0}
								isWinner={option.isWinner}
								chip={chip}
								muted={!option.isWinner}
								compact={data.options.length > 3}
							/>
						);
					})}
					{hidden > 0 ? (
						<span style={{ fontSize: 26, color: app.muted }}>+{hidden} more options</span>
					) : null}
				</div>
			</div>

			<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
				<div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
					<span style={{ fontSize: 30, color: app.muted, ...singleLine }}>{lead}</span>
					{call ? (
						<span
							style={{
								fontSize: format === "story" ? 180 : 150,
								fontWeight: 700,
								lineHeight: 0.95,
								letterSpacing: -4,
								color: resultColor,
								whiteSpace: "nowrap",
							}}
						>
							{signedPoints(call.net)}
							<span style={{ fontSize: 48, letterSpacing: 0 }}> pts</span>
						</span>
					) : (
						<span style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>
							{data.calledIt} of {data.participants} called it
						</span>
					)}
				</div>
				{rare ? (
					<div style={{ marginBottom: 18 }}>
						<Pill tone='gradient' size={26}>
							{rare}
						</Pill>
					</div>
				) : null}
			</div>

			<CardFooter label={`Join ${data.roomName} on Crow`} host={data.host} roomCode={data.roomCode} />
		</CardCanvas>
	);
}
