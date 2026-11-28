import "./brag.css";
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { CheckIcon, ChevronLeftIcon, LockIcon, MinusIcon, PlusIcon } from "lucide-react";
import { OptionsBoard } from "@/features/predictions/view/OptionsBoard";
import type { OptionTally } from "@/features/predictions/lib/predictionView";
import type { PredictionOption, PredictionStatus } from "@/features/predictions/types/types";
import {
	STANDINGS_TABLE,
	StandingRow,
	StandingsHeading,
} from "@/features/leaderboard/components/leaderboard/LeaderboardRow";
import { RankChange } from "@/features/leaderboard/components/leaderboard/RankChange";
import { Button } from "@/shared/ui/button";
import { CrowTile } from "@/shared/ui/crow-mark";
import { cn, twColor } from "@/shared/lib/utils";

// ---------------------------------------------------------------------------
// Time helpers. Every frame is a pure function of t (seconds). 120 BPM: a beat
// is 0.5 s, so every cut and hit below sits on a multiple of 0.25 s.
// ---------------------------------------------------------------------------
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const prog = (t: number, at: number, dur: number) => clamp01((t - at) / dur);
const outCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const inCubic = (x: number) => x * x * x;
const outBack = (x: number) => {
	const c1 = 1.9;
	const c3 = c1 + 1;
	return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
const inWindow = (t: number, a: number, b: number) => t >= a && t < b;

// Enter (rise + fade) at `at`, leave at `out`.
function rise(t: number, at: number, out = Infinity, dist = 48, dur = 0.28): CSSProperties {
	const i = outCubic(prog(t, at, dur));
	const o = inCubic(prog(t, out, 0.16));
	return {
		opacity: i * (1 - o),
		transform: `translateY(${lerp(dist, 0, i) - o * 24}px)`,
	};
}

function pop(t: number, at: number, dur = 0.32): CSSProperties {
	const x = prog(t, at, dur);
	return { opacity: clamp01(x * 3), transform: `scale(${lerp(0.55, 1, outBack(x))})` };
}

// ---------------------------------------------------------------------------
// Data: the placeholders the landing page already uses. Numbers add up:
// 1,300 pts in play, 100 on Arsenal returns 217, so +117.
// ---------------------------------------------------------------------------
const opt = (id: string, label: string, i: number): PredictionOption =>
	({ id, prediction_id: "demo", label, display_order: i }) as PredictionOption;
const OPTIONS = [
	{ option: opt("home", "Arsenal", 0), points: 600, picks: 6, percent: 46 },
	{ option: opt("draw", "Draw", 1), points: 280, picks: 3, percent: 22 },
	{ option: opt("away", "Spurs", 2), points: 420, picks: 5, percent: 32 },
];

function tallies(fill: number): OptionTally[] {
	return OPTIONS.map((o, index) => ({
		...o,
		index,
		points: Math.round(o.points * fill),
		percent: Math.round(o.percent * fill),
	}));
}

// ---------------------------------------------------------------------------
// Scene 1: the group chat argument.
// ---------------------------------------------------------------------------
const CHAT = [
	{ at: 0.0, name: "Sam", text: "Spurs win Sunday. Easy.", tone: "bg-option-3" },
	{ at: 0.5, name: "Priya", text: "no chance", tone: "bg-option-1" },
	{ at: 1.0, name: "Jordan", text: "draw. calling it now", tone: "bg-option-2" },
	{ at: 1.5, name: "You", text: "ok who's keeping score?", tone: "" },
];

function Chat({ t }: { t: number }) {
	const exit = inCubic(prog(t, 3.8, 0.2));
	return (
		<div
			className='absolute top-0 left-[120px] flex h-full w-[800px] flex-col justify-center gap-7'
			style={{ transform: `translateX(${-exit * 900}px)`, opacity: 1 - exit }}
		>
			{CHAT.map((m) => {
				const mine = m.name === "You";
				const s = pop(t, m.at);
				return (
					<div
						key={m.at}
						className={cn("flex items-end gap-4", mine && "justify-end")}
						style={{ ...s, transformOrigin: mine ? "right bottom" : "left bottom" }}
					>
						{mine ? null : (
							<span
								className={cn(
									"flex size-16 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-background",
									m.tone,
								)}
							>
								{m.name[0]}
							</span>
						)}
						<div
							className={cn(
								"rounded-[28px] px-7 py-4",
								mine
									? "rounded-br-md bg-primary text-primary-foreground"
									: "rounded-bl-md border border-border bg-card",
							)}
						>
							{mine ? null : (
								<p className='text-xl font-semibold text-muted-foreground'>{m.name}</p>
							)}
							<p className='text-[46px] leading-tight font-medium'>{m.text}</p>
						</div>
					</div>
				);
			})}
		</div>
	);
}

function Headline({ t }: { t: number }) {
	const lines = ["Your group", "chat already", "argues", "about it."];
	return (
		<h1 className='absolute top-0 left-[1020px] flex h-full w-[820px] flex-col justify-center text-[104px] leading-[1.04] font-bold tracking-tight'>
			{lines.map((line, i) => (
				<span key={line} className='block whitespace-nowrap' style={rise(t, 2.0 + i * 0.08, 3.82)}>
					{line}
				</span>
			))}
		</h1>
	);
}

// ---------------------------------------------------------------------------
// Scene 2: Crow arrives.
// ---------------------------------------------------------------------------
function Reveal({ t }: { t: number }) {
	const leave = inCubic(prog(t, 6.5, 0.2));
	return (
		<div
			className='absolute inset-0 flex flex-col items-center justify-center'
			style={{ opacity: 1 - leave, transform: `scale(${1 - leave * 0.08})` }}
		>
			<div style={pop(t, 4.0, 0.4)}>
				<CrowTile size={200} />
			</div>
			<h2 className='mt-12 text-[150px] leading-none font-bold tracking-tight' style={rise(t, 4.2)}>
				Keep score.
			</h2>
			<p className='mt-8 text-[52px] text-muted-foreground' style={rise(t, 4.6)}>
				The prediction game for friends.
			</p>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Scenes 3 to 5: the phone.
// ---------------------------------------------------------------------------
const PILL = "inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold";

// A finger tap: a ring that lands on the element matching `selector`.
function Tap({ t, at, selector }: { t: number; at: number; selector: string }) {
	const ref = useRef<HTMLSpanElement>(null);
	useLayoutEffect(() => {
		const el = ref.current;
		const screen = el?.parentElement;
		const target = screen?.querySelector(selector);
		if (!el || !screen || !target) return;
		const s = screen.getBoundingClientRect();
		const r = target.getBoundingClientRect();
		const scale = s.width / screen.offsetWidth;
		el.style.left = `${(r.left + r.width / 2 - s.left) / scale}px`;
		el.style.top = `${(r.top + r.height / 2 - s.top) / scale}px`;
	});
	const x = prog(t, at - 0.2, 0.55);
	if (x <= 0 || x >= 1) return <span ref={ref} className='hidden' />;
	const press = x < 0.36 ? outCubic(x / 0.36) : 1 - (x - 0.36) / 0.64;
	const ring = x < 0.36 ? 0 : outCubic((x - 0.36) / 0.64);
	return (
		<span ref={ref} className='pointer-events-none absolute z-40'>
			<span
				className='absolute size-14 rounded-full bg-foreground/35'
				style={{ opacity: press, transform: `translate(-50%,-50%) scale(${lerp(1.3, 0.85, press)})` }}
			/>
			<span
				className='absolute size-14 rounded-full border-2 border-foreground'
				style={{ opacity: (1 - ring) * 0.8, transform: `translate(-50%,-50%) scale(${1 + ring * 1.1})` }}
			/>
		</span>
	);
}

function TopBar({ points }: { points: number }) {
	return (
		<div className='flex items-center justify-between gap-3 px-4 pt-12 pb-3'>
			<span className='flex items-center gap-2 text-sm font-semibold'>
				<ChevronLeftIcon className='size-5 text-muted-foreground' aria-hidden />
				<CrowTile size={24} />
				Matchday Crew
			</span>
			<span className='text-sm font-semibold tabular-nums'>{points.toLocaleString()} pts</span>
		</div>
	);
}

function Question({ t }: { t: number }) {
	const status: PredictionStatus = t < 11 ? "draft" : t < 12 ? "locked" : "revealed";
	const fill = status === "draft" ? 1 : status === "locked" ? outCubic(prog(t, 11.1, 0.6)) : 1;
	const selected = t >= 7.5 ? "home" : null;
	const won = outCubic(prog(t, 12.25, 0.5));
	const points = Math.round(lerp(1350, 1467, won));

	let pill: ReactNode;
	let aside: string;
	if (status === "draft") {
		pill = (
			<span className={cn(PILL, "bg-live/15 text-live")}>
				<span aria-hidden className='size-1.5 rounded-full bg-current' />
				Open
			</span>
		);
		aside = "Closes Sun 2pm";
	} else if (status === "locked") {
		pill = (
			<span className={cn(PILL, "bg-accent/15 text-accent")}>
				<LockIcon className='size-3' aria-hidden />
				Locked
			</span>
		);
		aside = "Picks closed just now";
	} else {
		pill = (
			<span className={cn(PILL, "bg-win/15 text-win")}>
				<CheckIcon className='size-3 shrink-0' strokeWidth={3} aria-hidden />
				Arsenal won
			</span>
		);
		aside = "Result's in";
	}

	return (
		<div className='absolute inset-0'>
			<TopBar points={points} />
			<div className='flex flex-col gap-5 px-4 pt-3'>
				<div className='flex flex-col gap-2'>
					<div className='flex items-center justify-between gap-3'>
						{pill}
						<span className='shrink-0 text-xs text-muted-foreground'>{aside}</span>
					</div>
					<h1 className='mt-1 text-[1.375rem] leading-snug font-semibold tracking-tight'>
						Who wins the derby on Sunday?
					</h1>
				</div>
				<section>
					<h2 className='mb-2.5 flex items-baseline justify-between gap-3 text-sm font-semibold'>
						{status === "draft" ? "Make your call" : "The split"}
						<span className='text-xs font-normal text-muted-foreground tabular-nums'>
							{status === "revealed" ? "6 of 14 called it" : "1,300 pts from 14 picks"}
						</span>
					</h2>
					<OptionsBoard
						status={status}
						options={tallies(fill)}
						winningOptionId={status === "revealed" ? "home" : null}
						myOptionId={t >= 10 ? "home" : null}
						selectedOptionId={selected}
						onPick={status === "draft" ? () => {} : undefined}
					/>
				</section>
			</div>
		</div>
	);
}

// The pick sheet, markup and classes from BetSheet + DrawerContent.
function PickSheet({ t }: { t: number }) {
	const up = outCubic(prog(t, 8.0, 0.3)) * (1 - inCubic(prog(t, 10.6, 0.25)));
	if (up <= 0) return null;
	const amount = Math.round(lerp(50, 100, outCubic(prog(t, 9.0, 0.25))));
	const balance = 1350;
	const locked = t >= 10.0;
	const check = outBack(prog(t, 10.0, 0.3));
	return (
		<>
			<div className='absolute inset-0 z-20 bg-black/50' style={{ opacity: up }} />
			<div
				className='absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-lg border-t bg-background pb-6'
				style={{ transform: `translateY(${(1 - up) * 100}%)` }}
			>
				<div className='mx-auto mt-4 h-2 w-25 shrink-0 rounded-full bg-muted' />
				{locked ? (
					<>
						<div className='flex flex-col gap-0.5 p-4 text-left'>
							<div className='flex items-center gap-3'>
								<span
									className='flex size-10 shrink-0 items-center justify-center rounded-full bg-win/15 text-win'
									style={{ transform: `scale(${lerp(0.5, 1, check)})` }}
								>
									<CheckIcon aria-hidden='true' className='size-5' />
								</span>
								<div>
									<p className='font-semibold text-foreground'>Pick locked in</p>
									<p className='text-sm text-muted-foreground'>
										100 pts on <span className='font-semibold text-foreground'>Arsenal</span>
									</p>
								</div>
							</div>
						</div>
						<div className='px-4'>
							<div className='w-full rounded-xl border bg-muted/40 p-4 text-left'>
								<span className='flex items-baseline justify-between gap-3 text-xs text-muted-foreground'>
									<span className='truncate'>Next question</span>
									<span className='tabular-nums'>1 of 3 picked</span>
								</span>
								<span className='mt-1.5 block text-base leading-snug font-semibold'>
									Who scores first?
								</span>
								<span className='mt-1 block text-[13px] text-muted-foreground'>
									Picks close Sun 2pm, 1 more after this
								</span>
							</div>
						</div>
						<div className='mt-auto flex flex-row gap-2.5 p-4'>
							<Button variant='outline' size='lg'>
								Done
							</Button>
							<Button variant='linear' size='lg' className='flex-1'>
								Next question
							</Button>
						</div>
					</>
				) : (
					<>
						<div className='flex flex-col gap-0.5 p-4 text-left'>
							<div className='flex items-end justify-between gap-3'>
								<div>
									<p className='text-sm text-muted-foreground'>
										Your pick <span className='font-semibold text-foreground'>Arsenal</span>
									</p>
									<p className='mt-1.5 text-4xl leading-none font-bold tracking-tight tabular-nums'>
										{amount}
										<span className='ml-1.5 text-lg font-semibold text-muted-foreground'>pts</span>
									</p>
								</div>
								<p className='text-right text-xs text-muted-foreground'>
									Your points
									<span className='block text-[15px] font-semibold text-foreground tabular-nums'>
										{balance.toLocaleString()} pts
									</span>
								</p>
							</div>
						</div>
						<div className='flex flex-col gap-4 px-4'>
							<div className='grid grid-cols-4 gap-2'>
								{[5, 20, 50, 100].map((step) => (
									<Button key={step} variant='outline' className='h-11' data-tap={`plus${step}`}>
										+{step}
									</Button>
								))}
							</div>
							<div className='flex items-center gap-3'>
								<Button variant='secondary' size='icon' className='size-11' aria-label='One point less'>
									<MinusIcon />
								</Button>
								<div className='relative flex w-full items-center'>
									<div className='relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted'>
										<div className='absolute h-full bg-primary' style={{ width: `${(amount / balance) * 100}%` }} />
									</div>
									<span
										className='absolute block size-4 -translate-x-1/2 rounded-full border border-primary bg-white shadow-sm'
										style={{ left: `${(amount / balance) * 100}%` }}
									/>
								</div>
								<Button variant='secondary' size='icon' className='size-11' aria-label='One point more'>
									<PlusIcon />
								</Button>
							</div>
							<p className='text-[13px] text-muted-foreground'>
								If Arsenal wins, you share the points picked against you. The split shows when picks close.
							</p>
						</div>
						<div className='mt-auto flex flex-row gap-2.5 p-4'>
							<Button variant='outline' size='lg'>
								Not now
							</Button>
							<Button variant='linear' size='lg' className='flex-1' data-tap='lock'>
								Lock in pick · {amount} pts
							</Button>
						</div>
					</>
				)}
			</div>
		</>
	);
}

const ROW_H = 60;
const PLAYERS = [
	{ id: "priya", name: "Priya", from: 0, to: 0, p0: 1640, p1: 1640, d0: "9 of 13 called", d1: "10 of 14 called", net: 0 },
	{ id: "sam", name: "Sam", from: 1, to: 2, p0: 1410, p1: 1310, d0: "7 of 13 called", d1: "7 of 14 called", net: -100 },
	{ id: "you", name: "You", from: 2, to: 1, p0: 1350, p1: 1467, d0: "8 of 13 called", d1: "9 of 14 called", net: 117 },
	{ id: "jordan", name: "Jordan", from: 3, to: 3, p0: 1185, p1: 1185, d0: "6 of 13 called", d1: "6 of 14 called", net: 0 },
];

function Standings({ t }: { t: number }) {
	const count = outCubic(prog(t, 15.0, 0.4));
	const swap = outCubic(prog(t, 15.5, 0.4));
	const settled = t >= 15.9;
	return (
		<div className='absolute inset-0'>
			<TopBar points={1467} />
			<div className='px-4 pt-3'>
				<h1 className='text-[1.375rem] font-semibold tracking-tight'>Standings</h1>
				<p className='mt-0.5 text-sm text-muted-foreground'>Week 6, after Sunday's derby</p>
				<div className={cn(STANDINGS_TABLE, "mt-5")}>
					<StandingsHeading right='Points' />
					<div className='relative' style={{ height: ROW_H * PLAYERS.length }}>
						{PLAYERS.map((p) => {
							const pos = lerp(p.from, p.to, swap);
							const points = Math.round(lerp(p.p0, p.p1, count));
							const rank = settled ? p.to + 1 : p.from + 1;
							return (
								<div
									key={p.id}
									className='absolute inset-x-0 bg-card [&>button]:min-h-15'
									style={{ top: pos * ROW_H, height: ROW_H, zIndex: p.id === "you" ? 2 : 1 }}
								>
									<StandingRow
										rank={rank}
										name={p.name}
										isSelf={p.id === "you"}
										chips={
											settled && p.from !== p.to ? <RankChange change={p.from - p.to} pill /> : null
										}
										detail={rank === 1 ? "Top crow" : count > 0.5 ? p.d1 : p.d0}
										value={`${points.toLocaleString()} pts`}
										valueDetail={
											p.net !== 0 && count > 0 ? (
												<span className={p.net > 0 ? "text-win" : "text-loss"} style={{ opacity: count }}>
													{p.net > 0 ? `+${p.net}` : `−${Math.abs(p.net)}`}
												</span>
											) : null
										}
									/>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}

function Phone({ t }: { t: number }) {
	const enter = outCubic(prog(t, 6.6, 0.4));
	const exit = inCubic(prog(t, 17.5, 0.25));
	// Inside the phone, question out then standings in (no muddy crossfade).
	const qOut = prog(t, 14.5, 0.12);
	const sIn = outCubic(prog(t, 14.62, 0.25));
	return (
		<div
			className='absolute top-1/2 left-[1390px]'
			style={{
				transform: `translate(-50%,-50%) translateX(${(1 - enter) * 700 + exit * 700}px) scale(1.3) rotate(${(1 - enter) * 6}deg)`,
				opacity: enter * (1 - exit),
			}}
		>
			<div className='rounded-[58px] border-[10px] border-secondary bg-secondary shadow-2xl ring-1 ring-border'>
				<div className='relative h-[740px] w-[390px] overflow-hidden rounded-[48px] bg-background'>
					<div className='absolute top-3 left-1/2 z-50 h-7 w-28 -translate-x-1/2 rounded-full bg-black' />
					{t < 14.62 ? (
						<div className='absolute inset-0' style={{ opacity: 1 - qOut }}>
							<Question t={t} />
						</div>
					) : (
						<div className='absolute inset-0' style={{ opacity: sIn, transform: `translateY(${(1 - sIn) * 30}px)` }}>
							<Standings t={t} />
						</div>
					)}
					<PickSheet t={t} />
					<Tap t={t} at={7.5} selector='[aria-label="Options"] li:first-child button' />
					<Tap t={t} at={9.0} selector='[data-tap="plus50"]' />
					<Tap t={t} at={9.75} selector='[data-tap="lock"]' />
				</div>
			</div>
		</div>
	);
}

// The big words left of the phone. Each sits in its own full-height slot so
// two captions crossing never share a line box.
function Slot({ children }: { children: ReactNode }) {
	return <div className='absolute inset-y-0 left-0 flex w-full items-center'>{children}</div>;
}

function Captions({ t }: { t: number }) {
	const big = "text-[136px] leading-[1.02] font-bold tracking-tight";
	return (
		<div className='absolute inset-y-0 left-[130px] w-[860px]'>
			{inWindow(t, 6.75, 8.75) && (
				<Slot>
					<h2 className={big} style={rise(t, 6.75, 8.5)}>
						Call it.
					</h2>
				</Slot>
			)}
			{inWindow(t, 8.6, 11.2) && (
				<Slot>
					<h2 className={big} style={rise(t, 8.6, 10.95)}>
						Put points
						<br />
						on it.
					</h2>
				</Slot>
			)}
			{inWindow(t, 11.0, 12.2) && (
				<Slot>
					<h2 className={big} style={rise(t, 11.0, 11.95)}>
						Picks lock.
					</h2>
				</Slot>
			)}
			{inWindow(t, 12.0, 14.75) && (
				<Slot>
					<div style={rise(t, 12.0, 14.5, 30, 0.2)}>
						<p
							className='text-[220px] leading-none font-bold tracking-tight text-win tabular-nums'
							style={{ transform: `scale(${lerp(0.7, 1, outBack(prog(t, 12.0, 0.35)))})`, transformOrigin: "left center" }}
						>
							+117
						</p>
						<h2 className={cn(big, "mt-6")} style={rise(t, 12.25, Infinity, 30)}>
							Called it.
						</h2>
					</div>
				</Slot>
			)}
			{inWindow(t, 14.75, 17.75) && (
				<Slot>
					<h2 className={big} style={rise(t, 14.75, 17.5)}>
						Sam eats
						<br />
						crow.
					</h2>
				</Slot>
			)}
		</div>
	);
}

function Outro({ t }: { t: number }) {
	return (
		<div className='absolute inset-0 flex flex-col items-center justify-center text-center'>
			<div style={pop(t, 17.75, 0.4)}>
				<CrowTile size={170} />
			</div>
			<h2 className='mt-10 text-[132px] leading-[1.04] font-bold tracking-tight'>
				<span className='block' style={rise(t, 17.9)}>
					Call it.
				</span>
				<span className='block' style={rise(t, 18.0)}>
					Crow about it.
				</span>
			</h2>
			<p className='mt-10 text-[60px] font-semibold text-primary' style={rise(t, 18.4)}>
				playcrow.app
			</p>
			<p className='mt-3 text-[34px] text-muted-foreground' style={rise(t, 18.5)}>
				Free. No money. Just bragging rights.
			</p>
		</div>
	);
}

function Frame({ t }: { t: number }) {
	// A faint rose glow that follows the action, from the theme token.
	const glowX = t < 4 ? 30 : t < 6.6 || t >= 17.6 ? 50 : 70;
	return (
		<div className='relative h-[1080px] w-[1920px] overflow-hidden bg-background text-foreground'>
			<div
				className='absolute inset-0'
				style={{
					background: `radial-gradient(900px circle at ${glowX}% 50%, ${twColor("primary", 0.09)}, transparent 70%)`,
				}}
			/>
			{t < 4.3 && <Chat t={t} />}
			{inWindow(t, 2.0, 4.2) && <Headline t={t} />}
			{inWindow(t, 4.0, 6.75) && <Reveal t={t} />}
			{inWindow(t, 6.6, 17.8) && <Phone t={t} />}
			{inWindow(t, 6.75, 17.8) && <Captions t={t} />}
			{t >= 17.75 && <Outro t={t} />}
		</div>
	);
}

const root = createRoot(document.getElementById("root")!);
declare global {
	interface Window {
		__setTime: (t: number) => void;
	}
}
window.__setTime = (t: number) => flushSync(() => root.render(<Frame t={t} />));
window.__setTime(Number(new URLSearchParams(location.search).get("t") ?? 0));
