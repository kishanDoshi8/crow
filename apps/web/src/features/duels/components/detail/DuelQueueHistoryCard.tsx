import type { DuelQueueEntry } from "@/features/duels/types/types";
import {
	DuelAvatarTile,
	QueueStatusChip,
	SectionLabel,
} from "@/features/duels/components/detail/DuelDetailShared";
import { formatJoinedAt } from "@/features/duels/lib/duelDetailUtils";

interface DuelQueueHistoryCardProps {
	queueRows: DuelQueueEntry[];
	queueCount: number;
	currentUserId: string | null;
}

export default function DuelQueueHistoryCard({
	queueRows,
	queueCount,
	currentUserId,
}: Readonly<DuelQueueHistoryCardProps>) {
	return (
		<div className='rounded-2xl border border-border bg-card p-4'>
			<div className='flex items-center justify-between'>
				<SectionLabel>Queue</SectionLabel>
				<span className='rounded-full border border-border bg-secondary px-2 py-1 text-xs text-muted-foreground'>
					Next in at #{queueCount + 1}
				</span>
			</div>
			<div className='mt-3 space-y-2'>
				{queueRows.length === 0 ? (
					<div className='rounded-xl border border-dashed border-border bg-secondary/40 p-3 text-sm text-muted-foreground'>
						No queue entries yet.
					</div>
				) : (
					queueRows
						.filter((row) => row.status !== "cancelled")
						.map((row, index) => {
							const isYou = row.player.id === currentUserId;
							return (
								<div
									key={`${row.player.id}-${row.joinedAt}-${index}`}
									className='flex items-center gap-2 rounded-xl border border-border bg-secondary/30 p-2'
								>
									<span className='w-9 text-center font-mono text-xs tabular-nums text-muted-foreground'>
										#{index + 1}
									</span>
									<DuelAvatarTile
										name={row.player.username}
										size='sm'
										ring={isYou}
									/>
									<div className='min-w-0 flex-1'>
										<p className='truncate text-sm font-medium'>
											{row.player.username}
										</p>
										<p className='text-[11px] text-muted-foreground'>
											{formatJoinedAt(row.joinedAt)}
										</p>
									</div>
									{isYou ? (
										<span className='rounded-full border border-border bg-card px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground'>
											You
										</span>
									) : null}
									<QueueStatusChip status={row.status} />
								</div>
							);
						})
				)}
			</div>
		</div>
	);
}
