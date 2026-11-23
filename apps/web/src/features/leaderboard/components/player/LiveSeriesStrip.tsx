import { betsNeededLabel } from "../../lib/standings";
import type { LeaderboardEntry } from "../../types/types";
import { Skeleton } from "@/shared/ui";
import { FlameIcon } from "lucide-react";
import { formatSignedPoints } from "@/shared/lib/utils";

type Props = {
	seriesTitle: string;
	entry: LeaderboardEntry | undefined;
	isLoading: boolean;
};

const STRIP =
	"flex items-center gap-2 rounded-xl border border-live/25 bg-live/5 px-3 py-2 text-xs";

// The player's standing in the series running right now.
export function LiveSeriesStrip({ seriesTitle, entry, isLoading }: Readonly<Props>) {
	if (isLoading) {
		return <Skeleton aria-hidden='true' className='h-9 rounded-xl' />;
	}

	return (
		<div className={STRIP}>
			<span
				aria-hidden='true'
				className='size-1.5 shrink-0 rounded-full bg-live motion-safe:animate-pulse'
			/>
			<span className='min-w-0 truncate font-medium text-foreground'>
				{seriesTitle}
			</span>
			{entry ? (
				<span className='ml-auto flex shrink-0 items-center gap-2 tabular-nums text-muted-foreground'>
					{entry.rank !== null ? (
						<span className='font-semibold text-foreground'>
							#{entry.rank}
						</span>
					) : (
						<span>{betsNeededLabel(entry.bets_needed)}</span>
					)}
					<span aria-hidden='true'>·</span>
					<span>{formatSignedPoints(entry.net_profit)} net</span>
					{entry.current_streak > 0 ? (
						<>
							<span aria-hidden='true'>·</span>
							<span
								className='flex items-center gap-0.5 text-hot'
								aria-label={`${entry.current_streak} win streak`}
							>
								<FlameIcon className='size-3' />
								{entry.current_streak}
							</span>
						</>
					) : null}
				</span>
			) : (
				<span className='ml-auto shrink-0 text-muted-foreground'>
					Not playing yet
				</span>
			)}
		</div>
	);
}
