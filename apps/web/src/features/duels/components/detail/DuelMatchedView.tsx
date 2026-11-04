import { Button } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { Clock, Lock, Trophy } from "lucide-react";
import type { Duel } from "@/features/duels/types/types";
import {
	EscrowCard,
	StatusBanner,
	StickyActionBar,
	VsMatchup,
} from "@/features/duels/components/detail/DuelDetailShared";
import DuelQueueHistoryCard from "@/features/duels/components/detail/DuelQueueHistoryCard";

interface DuelMatchedViewProps {
	duel: Duel;
	currentUserId: string | null;
	challengerPickLabel: string;
	opponentPickLabel: string;
	onSeeResult: () => void;
}

export default function DuelMatchedView({
	duel,
	currentUserId,
	challengerPickLabel,
	opponentPickLabel,
	onSeeResult,
}: Readonly<DuelMatchedViewProps>) {
	const resultReady = duel.status === "resolved";

	return (
		<>
			<EscrowCard amount={duel.totalPot} />

			<StatusBanner
				icon={
					<Lock className='size-5 text-primary' aria-hidden='true' />
				}
				title='Duel Locked'
				subtitle='Picks revealed - opponent matched.'
				variant='primary'
			/>

			<VsMatchup
				leftName={duel.challenger.username}
				rightName={duel.opponent?.username}
				leftPickLabel={challengerPickLabel}
				rightPickLabel={opponentPickLabel}
				leftRing={currentUserId === duel.challenger.id}
				rightRing={currentUserId === duel.opponent?.id}
				stake={duel.stakeAmount}
			/>

			<DuelQueueHistoryCard
				queueRows={duel.queue}
				queueCount={duel.queueCount}
				currentUserId={currentUserId}
			/>

			<StickyActionBar>
				<Button
					className={cn(
						"w-full uppercase tracking-wider",
						resultReady
							? "bg-linear-to-r from-primary to-accent shadow-lg shadow-primary/20"
							: "bg-secondary text-muted-foreground cursor-not-allowed",
					)}
					disabled={!resultReady}
					onClick={onSeeResult}
				>
					{resultReady ? (
						<Trophy className='size-4' />
					) : (
						<Clock className='size-4' />
					)}
					{resultReady ? "See Result" : "Waiting for result..."}
				</Button>
			</StickyActionBar>
		</>
	);
}
