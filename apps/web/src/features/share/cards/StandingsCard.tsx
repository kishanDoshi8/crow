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

export type StandingsCardData = {
	roomName: string;
	roomCode: string;
	host: string;
	seriesTitle: string;
	standings: Array<{
		rank: number;
		username: string;
		balance: number;
		netProfit: number;
	}>;
	awards: Array<{ label: string; username: string; value: string }>;
};

// Everyone is shown; these only guard against a very large room.
const MAX_ROWS = 2;
const MAX_AWARDS = 6;

type Entry = StandingsCardData["standings"][number];

const PLACES = {
	1: { ring: app.gold, avatar: 156, block: 300, number: 88 },
	2: { ring: app.silver, avatar: 120, block: 200, number: 64 },
	3: { ring: app.bronze, avatar: 120, block: 150, number: 56 },
} as const;

function signed(value: number) {
	if (value === 0) return "±0";
	return `${value > 0 ? "+" : "−"}${Math.abs(value).toLocaleString()}`;
}

function Crown() {
	return (
		<svg width='72' height='54' viewBox='0 0 24 18' aria-hidden='true'>
			<path
				d='M2 16 L1 4 L7 9 L12 1 L17 9 L23 4 L22 16 Z'
				fill={app.gold}
			/>
		</svg>
	);
}

// One step of the app's podium: avatar, name, balance and the numbered block.
function Step({
	entry,
	place,
}: Readonly<{ entry: Entry | undefined; place: 1 | 2 | 3 }>) {
	if (!entry) return <div />;
	const style = PLACES[place];
	const isChampion = place === 1;
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 16,
				minWidth: 0,
			}}
		>
			{isChampion ? <Crown /> : null}
			<div
				style={{
					width: style.avatar,
					height: style.avatar,
					borderRadius: 999,
					border: `${isChampion ? 5 : 4}px solid ${style.ring}`,
					background: app.raised,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontSize: style.avatar * 0.38,
					fontWeight: 700,
				}}
			>
				{initials(entry.username)}
			</div>
			<span
				style={{
					fontSize: isChampion ? 44 : 34,
					fontWeight: isChampion ? 700 : 600,
					maxWidth: "100%",
					...singleLine,
				}}
			>
				{entry.username}
			</span>
			<span
				style={{
					fontSize: isChampion ? 28 : 26,
					color: isChampion ? app.gold : app.muted,
					whiteSpace: "nowrap",
				}}
			>
				{entry.balance.toLocaleString()} pts
				{isChampion ? ` · ${signed(entry.netProfit)}` : ""}
			</span>
			<div
				style={{
					width: "100%",
					height: style.block,
					boxSizing: "border-box",
					borderRadius: "28px 28px 0 0",
					background: isChampion
						? "linear-gradient(180deg, var(--primary), var(--accent))"
						: place === 2
							? `linear-gradient(180deg, ${twColor("rank-2", 0.35)}, ${twColor("rank-2", 0.05)})`
							: `linear-gradient(180deg, ${twColor("rank-3", 0.35)}, ${twColor("rank-3", 0.05)})`,
					border: isChampion
						? "none"
						: `2px solid ${twColor(place === 2 ? "rank-2" : "rank-3", 0.4)}`,
					borderBottom: "none",
					display: "flex",
					justifyContent: "center",
					paddingTop: 20,
					fontSize: style.number,
					fontWeight: 700,
					color: isChampion
						? app.onGradient
						: place === 2
							? app.silver
							: app.bronze,
				}}
			>
				{place}
			</div>
		</div>
	);
}

// A finished series as the app's podium and leaderboard.
export function StandingsCard({
	data,
	format,
}: Readonly<{ data: StandingsCardData; format: CardFormat }>) {
	const [first, second, third] = data.standings;
	const rest = data.standings.slice(3, 3 + MAX_ROWS);
	const hidden = data.standings.length - 3 - rest.length;
	const awards = data.awards.slice(0, MAX_AWARDS);

	return (
		<CardCanvas format={format} gap={format === "story" ? 56 : 40}>
			<RoomHeader
				title={data.seriesTitle}
				subtitle={`${data.roomName} · Final standings`}
				trailing={<Pill tone='win'>Completed</Pill>}
			/>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
					gap: 24,
					alignItems: "end",
					paddingTop: 16,
				}}
			>
				<Step entry={second} place={2} />
				<Step entry={first} place={1} />
				<Step entry={third} place={3} />
			</div>

			{rest.length > 0 ? (
				<div
					style={{
						marginTop: -40,
						borderRadius: 32,
						border: `2px solid ${app.hairline}`,
						background: app.card,
						padding: "8px 36px",
						display: "flex",
						flexDirection: "column",
					}}
				>
					{rest.map((entry, index) => (
						<div
							key={entry.username}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 24,
								padding: "20px 0",
								fontSize: 30,
								borderTop:
									index === 0
										? "none"
										: `2px solid ${twColor("foreground", 0.06)}`,
							}}
						>
							<span style={{ width: 48, color: app.muted }}>
								{entry.rank}
							</span>
							<span
								style={{ flex: 1, minWidth: 0, ...singleLine }}
							>
								{entry.username}
							</span>
							<span style={{ color: app.muted }}>
								{entry.balance.toLocaleString()} pts
							</span>
						</div>
					))}
					{hidden > 0 ? (
						<span
							style={{
								padding: "8px 0 18px 72px",
								fontSize: 26,
								color: app.muted,
							}}
						>
							and {hidden} more
						</span>
					) : null}
				</div>
			) : null}

			{awards.length > 0 ? (
				<div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
					{awards.map((award, index) => (
						<span
							key={award.label}
							style={{
								fontSize: 24,
								borderRadius: 999,
								padding: "12px 22px",
								background:
									index % 2 === 0
										? twColor("activity", 0.12)
										: twColor("accent", 0.14),
								color: index % 2 === 0 ? app.activity : app.accent,
								maxWidth: "100%",
								boxSizing: "border-box",
							}}
						>
							{award.label}: {award.username}, {award.value}
						</span>
					))}
				</div>
			) : null}

			<CardFooter
				label='Next series on Crow'
				host={data.host}
				roomCode={data.roomCode}
			/>
		</CardCanvas>
	);
}
