import { useEffect } from "react";
import { Link } from "react-router-dom";
import { track } from "@/shared/lib/analytics";
import { RankChange } from "@/features/leaderboard";
import { CrowTile } from "@/shared/ui";
import { DemoQuestion } from "@/features/landing/components/DemoQuestion";
import {
	ClosingCta,
	HeaderCta,
	HeroCta,
} from "@/features/landing/components/AuthAwareCta";

// One example week, framed as an example: the host sets the questions and
// the timing, only the order (ask, pick, lock, reveal) is fixed.
const WEEK = [
	{
		day: "Mon",
		title: "Points top up",
		body: "If your series has a weekly top-up, everyone who played last week gets it. You choose the amount, or none.",
	},
	{
		day: "Thu",
		title: "You ask",
		body: "Write your own, or follow a competition like the Premier League and add ready-made questions for each match in a tap.",
	},
	{
		day: "Sat",
		title: "Picks lock",
		body: "Everyone makes their call before the deadline you set. Who picked what stays hidden until then, so nobody copies.",
	},
	{
		day: "Sun",
		title: "Result's in",
		body: "Crow reveals match results for you, and you reveal your own questions. Points move and somebody eats crow.",
	},
] as const;

const FAIR_PLAY = [
	"Same starting points for everyone, every series.",
	"Picks stay hidden until they lock.",
	"Match results are checked by the Crow team before they're revealed.",
	"Every result and point change shows in Activity.",
	"No real money. Ever. Just bragging rights.",
] as const;

const STANDINGS = [
	{ rank: 1, name: "Priya", points: 1640, note: "Top crow", change: 0 },
	{ rank: 2, name: "Sam", points: 1410, note: "", change: -1 },
	{ rank: 3, name: "Jordan", points: 1185, note: "", change: -1 },
	{ rank: 4, name: "You", points: 1020, note: "", change: 2 },
] as const;

const RANK_COLOR: Record<number, string> = {
	1: "var(--rank-1)",
	2: "var(--rank-2)",
	3: "var(--rank-3)",
};

export default function LandingPage() {
	useEffect(() => track("landing_view"), []);

	return (
		<div className='min-h-dvh bg-background text-foreground'>
			<header className='mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 md:px-8 md:py-6'>
				<Link
					to='/welcome'
					className='flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
				>
					<CrowTile size={32} />
					<span className='text-lg font-bold tracking-tight'>crow</span>
				</Link>
				<HeaderCta />
			</header>

			<main>
				{/* Hero: the line, then a question you can actually play. */}
				<section className='mx-auto grid w-full max-w-6xl gap-10 px-4 pt-6 pb-16 md:px-8 md:pt-12 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:pb-24'>
					<div>
						{/* Each line stays whole: the size scales with the screen so
						    "Crow about it." never leaves "it." on its own. */}
						<h1 className='text-[clamp(2.5rem,10.5vw,4.25rem)] leading-[1.04] font-bold tracking-tight'>
							<span className='block whitespace-nowrap'>Call it.</span>
							<span className='block whitespace-nowrap'>Crow about it.</span>
						</h1>
						<p className='mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg'>
							The prediction game for your group chat. Your host asks the
							questions, everyone makes their picks, and Crow keeps score.
							Football weekends, the Oscars, Eurovision, the office bake-off.
						</p>
						<HeroCta className='mt-8' />
						<p className='mt-4 text-sm text-muted-foreground'>
							Free. Works in your browser on any phone.
						</p>
					</div>
					<DemoQuestion className='w-full max-w-lg lg:justify-self-end' />
				</section>

				{/* One week in a room. A vertical rail on phones, a row on desktop. */}
				<section className='border-t border-border'>
					<div className='mx-auto w-full max-w-6xl px-4 py-16 md:px-8 lg:py-24'>
						<h2 className='max-w-xl text-3xl font-bold tracking-tight md:text-4xl'>
							Your room, your rules
						</h2>
						<p className='mt-4 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground'>
							You decide what to ask and when picks close: one question a
							month or ten a weekend. Here's how a football weekend might go.
						</p>
						<ol className='mt-10 grid gap-0 lg:grid-cols-4 lg:gap-8'>
							{WEEK.map((step, index) => (
								<li
									key={step.day}
									className='relative grid grid-cols-[3.5rem_1fr] gap-4 pb-10 last:pb-0 lg:block lg:pb-0'
								>
									{/* The rail joining the days. */}
									{index < WEEK.length - 1 ? (
										<span
											aria-hidden='true'
											className='absolute top-9 bottom-0 left-7 w-px bg-border lg:top-[1.125rem] lg:right-[-2rem] lg:bottom-auto lg:left-14 lg:h-px lg:w-auto'
										/>
									) : null}
									<span className='relative z-10 flex h-9 w-14 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold'>
										{step.day}
									</span>
									<div className='lg:mt-5'>
										<h3 className='text-lg font-semibold'>{step.title}</h3>
										<p className='mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground'>
											{step.body}
										</p>
									</div>
								</li>
							))}
						</ol>
					</div>
				</section>

				{/* Fair play, next to the standings it produces. */}
				<section className='border-t border-border'>
					<div className='mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 md:px-8 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24'>
						<div>
							<h2 className='text-3xl font-bold tracking-tight md:text-4xl'>
								No money. Just bragging rights.
							</h2>
							<p className='mt-4 max-w-lg text-base leading-relaxed text-muted-foreground'>
								The surer you are, the more points you put on a pick. Most
								points when the series ends takes the title.
							</p>
							<ul className='mt-8 flex flex-col gap-3.5'>
								{FAIR_PLAY.map((line) => (
									<li key={line} className='flex gap-3 text-sm leading-relaxed'>
										<span
											aria-hidden='true'
											className='mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-primary'
										/>
										{line}
									</li>
								))}
							</ul>
						</div>

						<figure className='w-full max-w-lg rounded-2xl border border-border bg-card p-5 md:p-6 lg:justify-self-end'>
							<figcaption className='flex items-baseline justify-between gap-3'>
								<span className='font-semibold'>Matchday Crew</span>
								<span className='text-xs text-muted-foreground'>
									Week 6 standings
								</span>
							</figcaption>
							<ol className='mt-5 flex flex-col'>
								{STANDINGS.map((row) => (
									<li
										key={row.rank}
										className={
											row.name === "You"
												? "-mx-2 flex items-center gap-3 rounded-lg bg-muted/50 px-2 py-3"
												: "flex items-center gap-3 border-b border-border py-3 last:border-0"
										}
									>
										<span
											className='w-6 text-center text-sm font-bold tabular-nums'
											style={{ color: RANK_COLOR[row.rank] }}
										>
											{row.rank}
										</span>
										<span className='flex flex-1 items-center gap-2 text-sm font-medium'>
											{row.name}
											{row.note ? (
												<span className='text-xs font-normal text-rank-1'>
													{row.note}
												</span>
											) : null}
											<RankChange change={row.change} pill />
										</span>
										<span className='text-sm tabular-nums text-muted-foreground'>
											{row.points.toLocaleString()} pts
										</span>
									</li>
								))}
							</ol>
						</figure>
					</div>
				</section>

				<section className='border-t border-border'>
					<div className='mx-auto w-full max-w-6xl px-4 py-16 md:px-8 lg:py-24'>
						<h2 className='max-w-2xl text-3xl font-bold tracking-tight text-balance md:text-5xl'>
							Your group chat already argues about it. Keep score.
						</h2>
						<p className='mt-4 max-w-lg text-base text-muted-foreground'>
							Start a room, share the link, post your first question. Takes
							about a minute.
						</p>
						<div className='mt-8'>
							<ClosingCta />
						</div>
					</div>
				</section>
			</main>

			<footer className='border-t border-border'>
				<div className='mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-8'>
					<div className='flex items-center gap-2'>
						<CrowTile size={20} />
						<span>Crow, a game for friends</span>
					</div>
					<nav className='flex gap-5'>
						<Link to='/terms' className='hover:text-foreground'>
							Terms
						</Link>
						<Link to='/privacy' className='hover:text-foreground'>
							Privacy
						</Link>
					</nav>
				</div>
			</footer>
		</div>
	);
}
