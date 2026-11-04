import { Button } from "@/shared/ui";
import { Hourglass, RotateCw, Swords } from "lucide-react";
import type { Duel } from "@/features/duels/types/types";
import DuelQueueHistoryCard from "@/features/duels/components/detail/DuelQueueHistoryCard";
import {
	SectionLabel,
	StatusBanner,
	StickyActionBar,
	VsMatchup,
} from "@/features/duels/components/detail/DuelDetailShared";
import { fmtPts } from "@/features/duels/lib/duelDetailUtils";

interface DuelExpiredViewProps {
	duel: Duel;
	challengerPickLabel: string;
	currentUserId: string | null;
	onBack: () => void;
}

export default function DuelExpiredView({
	duel,
	challengerPickLabel,
	currentUserId,
	onBack,
}: Readonly<DuelExpiredViewProps>) {
	return (
		<>
			<StatusBanner
				icon={
					<Hourglass
						className='size-5 text-muted-foreground'
						aria-hidden='true'
					/>
				}
				title='Duel expired'
				subtitle='No opponent matched before the deadline.'
			/>

			<div className='rounded-2xl border border-border bg-card p-4'>
				<div className='flex items-center justify-between'>
					<SectionLabel>Stake</SectionLabel>
					<span className='font-mono tabular-nums'>
						{fmtPts(duel.stakeAmount)} pts
					</span>
				</div>
				<div className='mt-3 flex items-center gap-2 rounded-xl bg-secondary/40 p-3 text-sm text-win'>
					<RotateCw className='size-4' aria-hidden='true' />
					Stake refunded
				</div>
			</div>

			<VsMatchup
				leftName={duel.challenger.username}
				rightName={null}
				leftPickLabel={challengerPickLabel}
				rightPickLabel='No match'
				leftPickHidden={false}
				stake={duel.stakeAmount}
				rightEmptyLabel='No match'
			/>

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
					<Swords className='size-4' />
					Create a new duel
				</Button>
			</StickyActionBar>
		</>
	);
}
