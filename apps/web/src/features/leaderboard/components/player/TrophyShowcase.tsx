import { Reveal, Skeleton } from "@/shared/ui";
import {
	getSeriesAwardLabel,
	type SeriesAwardType,
} from "@/shared/lib/seriesRewards";
import {
	getAwardVisual,
	getChampionshipVisual,
	getTierTileClassName,
	getTrophyVisual,
} from "@/shared/lib/seriesRecognitionVisuals";
import {
	formatTrophyDate,
	formatTrophyValue,
	type Trophy,
} from "@/shared/lib/trophyPrestige";
import { cn } from "@/shared/lib/utils";
import { ChevronRightIcon } from "lucide-react";

const FEATURED_COUNT = 3;

type Props = {
	trophies: Trophy[];
	isLoading: boolean;
	onViewAll: () => void;
};

type TallyItem = {
	key: string;
	count: number;
	label: string;
	visual: ReturnType<typeof getAwardVisual>;
};

const PLACEMENT_TALLY_LABEL: Record<number, [string, string]> = {
	1: ["title", "titles"],
	2: ["runner-up finish", "runner-up finishes"],
	3: ["third-place finish", "third-place finishes"],
};

// One chip per kind of trophy: titles, then podiums, then awards by count.
function buildTally(trophies: Trophy[]): TallyItem[] {
	const placements = new Map<number, number>();
	const awards = new Map<SeriesAwardType, number>();

	for (const trophy of trophies) {
		if (trophy.kind === "placement") {
			placements.set(
				trophy.placement,
				(placements.get(trophy.placement) ?? 0) + 1,
			);
		} else {
			awards.set(trophy.awardType, (awards.get(trophy.awardType) ?? 0) + 1);
		}
	}

	const placementItems = [...placements.entries()]
		.sort(([a], [b]) => a - b)
		.map(([placement, count]): TallyItem => {
			const [one, many] = PLACEMENT_TALLY_LABEL[placement] ?? [
				"podium",
				"podiums",
			];
			return {
				key: `placement-${placement}`,
				count,
				label: `${count} ${count === 1 ? one : many}`,
				visual: getChampionshipVisual(placement),
			};
		});

	const awardItems = [...awards.entries()]
		.sort(([, a], [, b]) => b - a)
		.map(
			([awardType, count]): TallyItem => ({
				key: `award-${awardType}`,
				count,
				label: `${count} × ${getSeriesAwardLabel(awardType)}`,
				visual: getAwardVisual(awardType),
			}),
		);

	return [...placementItems, ...awardItems];
}

// Soft podium-gold wash behind a major trophy.
function MajorWash() {
	return (
		<div
			aria-hidden='true'
			className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,var(--color-rank-1),transparent_65%)] opacity-10'
		/>
	);
}

// The single most prestigious trophy: wide, with what it was won with.
function HeroTrophy({ trophy }: { trophy: Trophy }) {
	const visual = getTrophyVisual(trophy);

	return (
		<Reveal
			className={cn(
				"relative col-span-2 flex items-center gap-4 overflow-hidden rounded-xl border bg-card p-4",
				getTierTileClassName(trophy.tier),
			)}
		>
			{trophy.tier === "major" ? <MajorWash /> : null}
			<div
				className={cn(
					"relative flex size-14 shrink-0 items-center justify-center rounded-full border",
					visual.ringClassName,
				)}
			>
				<visual.Icon className={cn("size-7", visual.textClassName)} />
			</div>
			<div className='relative min-w-0 flex-1'>
				<p className={cn("text-base font-semibold", visual.textClassName)}>
					{visual.label}
				</p>
				<p className='text-sm text-foreground'>{trophy.seriesTitle}</p>
				<p className='mt-0.5 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground'>
					<span>{formatTrophyValue(trophy)}</span>
					<span>{formatTrophyDate(trophy.wonAt)}</span>
				</p>
			</div>
		</Reveal>
	);
}

// The runners-up beside each other, with full titles that wrap if needed.
// A lone runner-up takes the full width as a slim row instead.
function SupportingTrophy({
	trophy,
	index,
	wide = false,
}: {
	trophy: Trophy;
	index: number;
	wide?: boolean;
}) {
	const visual = getTrophyVisual(trophy);

	return (
		<Reveal
			index={index}
			className={cn(
				"relative flex min-w-0 gap-2 overflow-hidden rounded-xl border bg-card p-3",
				wide ? "col-span-2 items-center gap-3" : "flex-col",
				getTierTileClassName(trophy.tier),
			)}
		>
			{trophy.tier === "major" ? <MajorWash /> : null}
			<div
				className={cn(
					"relative flex size-9 shrink-0 items-center justify-center rounded-full border",
					visual.ringClassName,
				)}
			>
				<visual.Icon className={cn("size-4.5", visual.textClassName)} />
			</div>
			<div className='relative min-w-0 flex-1'>
				<p
					className={cn(
						"text-xs font-semibold text-balance",
						visual.textClassName,
					)}
				>
					{visual.label}
				</p>
				<p className='line-clamp-2 text-xs text-muted-foreground'>
					{trophy.seriesTitle}
				</p>
			</div>
			{wide ? (
				<p className='relative shrink-0 text-xs tabular-nums text-muted-foreground'>
					{formatTrophyValue(trophy)}
				</p>
			) : null}
		</Reveal>
	);
}

export function TrophyShowcaseSkeleton() {
	return (
		<div aria-hidden='true' className='flex flex-col gap-3'>
			<div className='grid grid-cols-2 gap-2'>
				<Skeleton className='col-span-2 h-24 rounded-xl' />
				<Skeleton className='h-26 rounded-xl' />
				<Skeleton className='h-26 rounded-xl' />
			</div>
			<Skeleton className='h-6 w-48 rounded-full' />
		</div>
	);
}

// The best few trophies up front, then a one-line count of everything.
export function TrophyShowcase({
	trophies,
	isLoading,
	onViewAll,
}: Readonly<Props>) {
	if (isLoading) return <TrophyShowcaseSkeleton />;

	if (trophies.length === 0) {
		return (
			<p className='rounded-xl border border-dashed border-border/80 px-4 py-5 text-center text-sm text-muted-foreground'>
				Shelf's empty. Finish top 3 in a series to fill it.
			</p>
		);
	}

	const [hero, ...supporting] = trophies.slice(0, FEATURED_COUNT);
	const tally = buildTally(trophies);

	return (
		<div className='flex flex-col gap-3'>
			<div className='grid grid-cols-2 gap-2'>
				<HeroTrophy trophy={hero} />
				{supporting.map((trophy, index) => (
					<SupportingTrophy
						key={trophy.id}
						trophy={trophy}
						index={index + 1}
						wide={supporting.length === 1}
					/>
				))}
			</div>

			<div className='flex items-start gap-2'>
				<ul className='flex min-w-0 flex-1 flex-wrap gap-1.5'>
					{tally.map((item) => (
						<li
							key={item.key}
							aria-label={item.label}
							title={item.label}
							className='flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-xs font-medium tabular-nums text-foreground'
						>
							<item.visual.Icon
								aria-hidden='true'
								className={cn("size-3.5", item.visual.textClassName)}
							/>
							×{item.count}
						</li>
					))}
				</ul>
				<button
					type='button'
					onClick={onViewAll}
					className='flex shrink-0 items-center gap-0.5 rounded-md py-0.5 pl-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
				>
					View all
					<ChevronRightIcon className='size-3.5' />
				</button>
			</div>
		</div>
	);
}
