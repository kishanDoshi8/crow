import { Button } from "@/shared/ui";
import { Ban, ChevronLeft, RotateCw } from "lucide-react";
import type { Duel } from "@/features/duels/types/types";
import DuelQueueHistoryCard from "@/features/duels/components/detail/DuelQueueHistoryCard";
import {
	SectionLabel,
	StatusBanner,
	StickyActionBar,
} from "@/features/duels/components/detail/DuelDetailShared";
import { fmtPts } from "@/features/duels/lib/duelDetailUtils";

interface DuelCancelledViewProps {
	duel: Duel;
	currentUserId: string | null;
	onBack: () => void;
}

export default function DuelCancelledView({
	duel,
	currentUserId,
	onBack,
}: Readonly<DuelCancelledViewProps>) {
	const reason = "This duel was voided and all held stakes were returned.";

	return (
		<>
			<StatusBanner
				icon={
					<Ban
						className='size-5 text-muted-foreground'
						aria-hidden='true'
					/>
				}
				title='Duel cancelled'
				subtitle={reason}
			/>

			<div className='rounded-2xl border border-border bg-card p-4'>
				<SectionLabel>Refund Summary</SectionLabel>
				<div className='mt-3 flex items-center justify-between rounded-xl bg-secondary/40 p-3'>
					<div className='flex items-center gap-2 text-sm text-muted-foreground'>
						<RotateCw
							className='size-4 text-win'
							aria-hidden='true'
						/>
						Stake returned to participants
					</div>
					<span className='font-mono tabular-nums text-win'>
						{fmtPts(duel.stakeAmount)} pts
					</span>
				</div>
			</div>

			<DuelQueueHistoryCard
				queueRows={duel.queue}
				queueCount={duel.queueCount}
				currentUserId={currentUserId}
			/>

			<StickyActionBar>
				<Button
					variant='outline'
					className='w-full uppercase tracking-wider'
					onClick={onBack}
				>
					<ChevronLeft className='size-4' />
					Back to Duels
				</Button>
			</StickyActionBar>
		</>
	);
}
