import { Button, Spinner } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { Ban, ClockIcon, Flame, Info, Swords } from "lucide-react";
import type { Duel, RivalrySummary } from "@/features/duels/types/types";
import { Countdown } from "@/features/predictions";
import {
	EscrowCard,
	SectionLabel,
	StickyActionBar,
	VsMatchup,
} from "@/features/duels/components/detail/DuelDetailShared";
import DuelQueueHistoryCard from "@/features/duels/components/detail/DuelQueueHistoryCard";
import { fmtPts, signedPts } from "@/features/duels/lib/duelDetailUtils";

interface DuelJoinViewProps {
	duel: Duel;
	predictionDeadline: string;
	challengerPickLabel: string;
	opponentPickLabel: string;
	myPickLabel: string;
	rival: RivalrySummary | null;
	eligible: boolean;
	ineligibleReason: string;
	isCurrentUserChallenger: boolean;
	canLeaveQueue: boolean;
	isJoining: boolean;
	isLeavingQueue: boolean;
	isCancelling: boolean;
	queueRows: Duel["queue"];
	currentUserId: string | null;
	onCommitEscrow: () => void;
	onCancelQueue: () => void;
	onCancelDuel: () => void;
}

export default function DuelJoinView({
	duel,
	predictionDeadline,
	challengerPickLabel,
	opponentPickLabel,
	myPickLabel,
	rival,
	eligible,
	ineligibleReason,
	isCurrentUserChallenger,
	canLeaveQueue,
	isJoining,
	isLeavingQueue,
	isCancelling,
	queueRows,
	currentUserId,
	onCommitEscrow,
	onCancelQueue,
	onCancelDuel,
}: Readonly<DuelJoinViewProps>) {
	return (
		<>
			<EscrowCard amount={duel.totalReserved} />

			<div className='flex flex-col gap-4 items-center justify-center p-4 bg-card rounded-2xl ring-1 ring-primary/50 text-center'>
				<span className='text-muted-foreground tracking-wider uppercase'>
					<ClockIcon
						className='size-4 inline-block mr-2 text-primary/70'
						aria-hidden='true'
					/>
					Lock in before
				</span>
				<Countdown
					targetTime={new Date(predictionDeadline).getTime()}
					textSize='text-2xl'
					hideIcon={true}
				/>
				<span className='text-xs text-muted-foreground'>
					Picks stay hidden until the match locks
				</span>
			</div>

			<VsMatchup
				leftName={duel.challenger.username}
				leftPickLabel={challengerPickLabel}
				leftPickHidden={false}
				rightName='TBD'
				rightEmptyLabel='TBD'
				rightEmptyLabel2={opponentPickLabel}
				rightPickLabel={myPickLabel}
				rightRing
				stake={duel.stakeAmount}
			/>

			{rival ? (
				<div className='rounded-2xl border border-border bg-primary/10 p-4'>
					<div className='mb-2 flex items-center gap-2 text-primary'>
						<Flame className='size-4' aria-hidden='true' />
						<SectionLabel>Rivalry</SectionLabel>
					</div>
					<p className='text-sm font-semibold'>
						{rival.wins}-{rival.losses} in {rival.totalDuels} duel
						{rival.totalDuels === 1 ? "" : "s"}
					</p>
					<p className='text-sm text-muted-foreground'>
						Net points: {signedPts(rival.netPoints)}
					</p>
				</div>
			) : null}

			<DuelQueueHistoryCard
				queueRows={queueRows}
				queueCount={duel.queueCount}
				currentUserId={currentUserId}
			/>

			{eligible ? null : (
				<div className='rounded-2xl border border-border bg-secondary/50 p-4 text-sm text-muted-foreground'>
					<div className='mb-2 flex items-center gap-2'>
						<Info className='size-4' aria-hidden='true' />
						<SectionLabel>Ineligible</SectionLabel>
					</div>
					<p>{ineligibleReason}</p>
				</div>
			)}

			{isCurrentUserChallenger && duel.status !== "matched" ? (
				<Button
					variant='outline'
					className='w-full uppercase tracking-wider'
					onClick={onCancelDuel}
					disabled={isCancelling}
				>
					{isCancelling ? <Spinner /> : <Ban className='size-4' />}
					Cancel duel
				</Button>
			) : null}

			<StickyActionBar>
				{canLeaveQueue ? (
					<Button
						variant='outline'
						className='w-full uppercase tracking-wider'
						onClick={onCancelQueue}
						disabled={isLeavingQueue}
					>
						{isLeavingQueue ? (
							<Spinner />
						) : (
							<Ban className='size-4' />
						)}
						Leave Queue
					</Button>
				) : (
					<Button
						className={cn(
							"w-full bg-linear-to-r from-primary to-accent uppercase tracking-wider shadow-lg shadow-primary/20",
							(!eligible ||
								isJoining ||
								isCurrentUserChallenger) &&
								"shadow-none cursor-not-allowed",
						)}
						onClick={onCommitEscrow}
						disabled={
							!eligible || isJoining || isCurrentUserChallenger
						}
					>
						{isJoining ? (
							<Spinner />
						) : (
							<Swords className='size-4' />
						)}
						Commit {fmtPts(duel.stakeAmount)} pts to Escrow
					</Button>
				)}
			</StickyActionBar>
		</>
	);
}
