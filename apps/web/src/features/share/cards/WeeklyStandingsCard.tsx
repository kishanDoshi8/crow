import {
	CardCanvas,
	CardFooter,
	initials,
	Pill,
	RoomHeader,
	singleLine,
} from "@/features/share/components/AppCard";
import { app, type CardFormat } from "@/features/share/tokens";
import { twColor } from "@/shared/lib/utils";

type Mover = { username: string; rank: number; rankChange: number };

export type WeeklyStandingsCardData = {
	roomName: string;
	roomCode: string;
	host: string;
	seriesTitle: string;
	weekNumber: number;
	// False in a series' first week: there's no earlier week to compare.
	hasPrevious: boolean;
	standings: Array<{
		rank: number;
		username: string;
		balance: number;
		rankChange: number | null;
		isNew: boolean;
	}>;
	climber: Mover | null;
	faller: Mover | null;
};

const RANK_COLORS: Record<number, string> = {
	1: app.gold,
	2: app.silver,
	3: app.bronze,
};

// ▲2 / ▼3 / – / NEW, as on the app's standings.
function Movement({
	change,
	isNew,
	size = 28,
}: Readonly<{ change: number | null; isNew?: boolean; size?: number }>) {
	if (isNew) {
		return (
			<span
				style={{
					fontSize: size * 0.75,
					fontWeight: 700,
					borderRadius: 10,
					padding: "4px 12px",
					color: app.text,
					background: twColor("primary", 0.25),
				}}
			>
				NEW
			</span>
		);
	}
	if (change === null) return null;
	if (change === 0) {
		return <span style={{ fontSize: size, color: app.muted }}>–</span>;
	}
	const up = change > 0;
	return (
		<span
			style={{
				fontSize: size,
				fontWeight: 700,
				color: up ? app.win : app.loss,
				whiteSpace: "nowrap",
			}}
		>
			{up ? "▲" : "▼"}
			{Math.abs(change)}
		</span>
	);
}

function MoverTile({
	label,
	mover,
	tone,
}: Readonly<{ label: string; mover: Mover; tone: "win" | "loss" }>) {
	return (
		<div
			style={{
				flex: 1,
				minWidth: 0,
				display: "flex",
				flexDirection: "column",
				gap: 14,
				borderRadius: 28,
				padding: "26px 30px",
				background: twColor(tone, 0.1),
				border: `2px solid ${twColor(tone, 0.3)}`,
			}}
		>
			<span style={{ fontSize: 24, color: app.muted }}>{label}</span>
			<div style={{ display: "flex", alignItems: "center", gap: 18 }}>
				<span
					style={{
						fontSize: 38,
						fontWeight: 700,
						flex: 1,
						minWidth: 0,
						...singleLine,
					}}
				>
					{mover.username}
				</span>
				<Movement change={mover.rankChange} size={38} />
			</div>
			<span style={{ fontSize: 24, color: app.muted }}>
				Now #{mover.rank}
			</span>
		</div>
	);
}

// The week that just ended: top 5 with their moves, and who climbed and fell
// the most. For the group chat on Monday.
export function WeeklyStandingsCard({
	data,
	format,
}: Readonly<{ data: WeeklyStandingsCardData; format: CardFormat }>) {
	return (
		<CardCanvas format={format} gap={format === "story" ? 56 : 40}>
			<RoomHeader
				title={data.seriesTitle}
				subtitle={`${data.roomName} · Weekly standings`}
				trailing={<Pill tone='gradient'>Week {data.weekNumber}</Pill>}
			/>

			<div
				style={{
					borderRadius: 32,
					border: `2px solid ${app.hairline}`,
					background: app.card,
					padding: "8px 36px",
					display: "flex",
					flexDirection: "column",
				}}
			>
				{data.standings.map((entry, index) => (
					<div
						key={entry.username}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 24,
							padding: "22px 0",
							fontSize: 32,
							borderTop:
								index === 0
									? "none"
									: `2px solid ${twColor("foreground", 0.06)}`,
						}}
					>
						<span
							style={{
								width: 56,
								fontWeight: 700,
								color: RANK_COLORS[entry.rank] ?? app.muted,
							}}
						>
							{entry.rank}
						</span>
						<div
							style={{
								width: 64,
								height: 64,
								borderRadius: 999,
								background: app.raised,
								border: `3px solid ${RANK_COLORS[entry.rank] ?? app.hairline}`,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: 24,
								fontWeight: 700,
								flexShrink: 0,
							}}
						>
							{initials(entry.username)}
						</div>
						<span
							style={{
								flex: 1,
								minWidth: 0,
								fontWeight: entry.rank === 1 ? 700 : 500,
								...singleLine,
							}}
						>
							{entry.username}
						</span>
						<Movement change={entry.rankChange} isNew={entry.isNew} />
						<span
							style={{
								width: 200,
								textAlign: "right",
								color: entry.rank === 1 ? app.gold : app.muted,
								whiteSpace: "nowrap",
							}}
						>
							{entry.balance.toLocaleString()} pts
						</span>
					</div>
				))}
			</div>

			{data.climber || data.faller ? (
				<div style={{ display: "flex", gap: 24 }}>
					{data.climber ? (
						<MoverTile
							label='Biggest climber'
							mover={data.climber}
							tone='win'
						/>
					) : null}
					{data.faller ? (
						<MoverTile
							label='Biggest faller'
							mover={data.faller}
							tone='loss'
						/>
					) : null}
				</div>
			) : (
				<span style={{ fontSize: 26, color: app.muted }}>
					{data.hasPrevious
						? "Nobody changed places this week."
						: "First week in the books. Climbers and fallers show up next week."}
				</span>
			)}

			<CardFooter
				label='Weekly standings on Crow'
				host={data.host}
				roomCode={data.roomCode}
			/>
		</CardCanvas>
	);
}
