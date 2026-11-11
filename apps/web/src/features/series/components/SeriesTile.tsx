import { SeriesStatusBadge } from "@/features/series/components/SeriesStatusBadge";
import { getSeriesProgress } from "@/features/series/lib/progress";
import type { Series } from "@/features/series/types/series";
import { Skeleton, StatStrip } from "@/shared/ui";
import { ChevronRightIcon } from "lucide-react";
import type { SeriesWallet } from "@/shared/lib/api";
import { Link } from "react-router-dom";
import { cn, formatSignedPoints } from "@/shared/lib/utils";

const TILE_SHELL = "rounded-2xl border bg-card p-4";

type SeriesTileProps = {
	series: Series;
	roomCode: string;
	/** The series the room view is following right now. */
	isCurrent?: boolean;
	// The viewer's points in this series, once they've joined it.
	wallet?: SeriesWallet | null;
};

// "+240" / "−60" in the outcome's colour.
function netStat(wallet: SeriesWallet) {
	return {
		label: "Your net",
		value:
			wallet.net_profit < 0
				? `−${Math.abs(wallet.net_profit).toLocaleString()}`
				: formatSignedPoints(wallet.net_profit),
		tone:
			wallet.net_profit > 0
				? "text-win"
				: wallet.net_profit < 0
					? "text-loss"
					: undefined,
	};
}

// A series that's running: how far along it is and where you stand in it.
export function SeriesTile({
	series,
	roomCode,
	isCurrent = false,
	wallet,
}: Readonly<SeriesTileProps>) {
	const progress = getSeriesProgress(series);

	return (
		<Link
			to={`/rooms/${roomCode}/series/${series.id}`}
			className={cn(
				TILE_SHELL,
				"flex flex-col gap-3.5 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
				isCurrent && "border-primary/40",
			)}
			aria-current={isCurrent ? "true" : undefined}
		>
			<div className='flex items-center justify-between gap-2'>
				<SeriesStatusBadge status={series.status} />
				{isCurrent ? (
					<ViewingMark />
				) : (
					<ChevronRightIcon className='size-4 text-muted-foreground' aria-hidden='true' />
				)}
			</div>
			<div>
				<p className='text-lg font-semibold leading-snug'>{series.title}</p>
				{series.description?.trim() ? (
					<p className='truncate text-sm text-muted-foreground'>
						{series.description.trim()}
					</p>
				) : null}
			</div>
			{progress.isOpenEnded ? null : (
				<div className='flex flex-col gap-1.5'>
					<div
						role='img'
						aria-label={`${progress.resolved} of ${progress.expected} games played`}
						className='h-1.5 overflow-hidden rounded-full bg-secondary'
					>
						<span
							className='block h-full rounded-full bg-linear-to-r from-primary to-accent'
							style={{ width: `${progress.percent}%` }}
						/>
					</div>
					<div className='flex items-center justify-between gap-3 text-xs tabular-nums'>
						<p>
							<span className='font-semibold'>{progress.resolved}</span>{" "}
							<span className='text-muted-foreground'>of {progress.expected} played</span>
						</p>
						<p>
							<span className='font-semibold'>{progress.remaining}</span>{" "}
							<span className='text-muted-foreground'>to go</span>
						</p>
					</div>
				</div>
			)}
			<StatStrip
				stats={[
					...(progress.isOpenEnded ? [{ label: "Settled", value: progress.resolved }] : []),
					{ label: "Open now", value: progress.open },
					...(wallet
						? [
								...(progress.isOpenEnded
									? []
									: [{ label: "Your points", value: wallet.balance.toLocaleString() }]),
								netStat(wallet),
							]
						: []),
				]}
			/>
		</Link>
	);
}

// A finished series, as one line in a list: nothing here changes any more.
export function FinishedSeriesRow({
	series,
	roomCode,
	isCurrent = false,
	wallet,
}: Readonly<SeriesTileProps>) {
	const games = series.completedGames;
	const ended = series.completedAt
		? new Date(series.completedAt).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year:
					new Date(series.completedAt).getFullYear() === new Date().getFullYear()
						? undefined
						: "numeric",
			})
		: null;
	const net = wallet ? netStat(wallet) : null;

	return (
		<Link
			to={`/rooms/${roomCode}/series/${series.id}`}
			aria-current={isCurrent ? "true" : undefined}
			className={cn(
				FINISHED_ROW,
				"min-h-15 border-t py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
				isCurrent && "bg-primary/10",
			)}
		>
			<span className='flex min-w-0 flex-col'>
				<span className='truncate text-sm font-semibold'>{series.title}</span>
				<span className='truncate text-xs text-muted-foreground'>
					{games} {games === 1 ? "game" : "games"}
					{ended ? `, ended ${ended}` : ""}
				</span>
			</span>
			{net ? (
				<span className={cn("text-right text-sm font-semibold tabular-nums", net.tone)}>
					{net.value}
				</span>
			) : (
				<span className='text-right text-xs text-muted-foreground'>Didn't play</span>
			)}
			<ChevronRightIcon className='size-4 text-muted-foreground' aria-hidden='true' />
		</Link>
	);
}

// The finished list's columns, shared with its heading row.
export const FINISHED_ROW = "grid grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-3 px-3.5";

// Same tile with placeholders: status + chevron, title, progress, footer line.
export function SeriesTileSkeleton() {
	return (
		<div aria-hidden='true' className={cn(TILE_SHELL, "flex flex-col gap-3.5")}>
			<div className='flex items-center justify-between gap-2'>
				<Skeleton className='h-5.5 w-16 rounded-full' />
				<Skeleton className='size-4' />
			</div>
			<div className='flex h-7 items-center'>
				<Skeleton className='h-4.5 w-44' />
			</div>
			<div className='flex flex-col gap-1.5'>
				<Skeleton className='h-1.5 w-full rounded-full' />
				<div className='flex h-4 items-center justify-between'>
					<Skeleton className='h-3 w-24' />
					<Skeleton className='h-3 w-12' />
				</div>
			</div>
			<Skeleton className='h-13 w-full rounded-xl' />
		</div>
	);
}

// Quiet marker for the series the whole room view is showing.
export function ViewingMark() {
	return (
		<span className='flex items-center gap-1 text-xs text-muted-foreground'>
			<span aria-hidden='true' className='size-1.5 rounded-full bg-primary' />
			You're viewing this
		</span>
	);
}
