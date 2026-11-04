import { Button } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { ChevronLeft, Crown, Flame, Sparkles, Trophy } from "lucide-react";
import type { Duel, RivalrySummary } from "@/features/duels/types/types";
import DuelQueueHistoryCard from "@/features/duels/components/detail/DuelQueueHistoryCard";
import {
	DuelAvatarTile,
	PickChip,
	SectionLabel,
	StatusBanner,
	StickyActionBar,
} from "@/features/duels/components/detail/DuelDetailShared";
import {
	getResolvedParticipants,
	signedPts,
} from "@/features/duels/lib/duelDetailUtils";

interface DuelResolvedViewProps {
	duel: Duel;
	isWin: boolean;
	showWinBurst: boolean;
	challengerPickLabel: string;
	opponentPickLabel: string;
	rival: RivalrySummary | null;
	currentUserId: string | null;
	onBack: () => void;
}

export default function DuelResolvedView({
	duel,
	isWin,
	showWinBurst,
	challengerPickLabel,
	opponentPickLabel,
	rival,
	currentUserId,
	onBack,
}: Readonly<DuelResolvedViewProps>) {
	const { winnerName, winnerPick, loserName, loserPick } =
		getResolvedParticipants(duel, challengerPickLabel, opponentPickLabel);

	return (
		<>
			<div className='relative'>
				{showWinBurst ? (
					<div className='pointer-events-none absolute inset-0 overflow-hidden rounded-2xl'>
						<Sparkles
							className='absolute left-6 top-4 size-4 animate-ping text-accent'
							aria-hidden='true'
						/>
						<Sparkles
							className='absolute right-8 top-10 size-3 animate-ping text-primary [animation-delay:180ms]'
							aria-hidden='true'
						/>
						<Sparkles
							className='absolute left-1/2 top-2 size-4 -translate-x-1/2 animate-ping text-win [animation-delay:320ms]'
							aria-hidden='true'
						/>
					</div>
				) : null}
				<StatusBanner
					icon={
						isWin ? (
							<Crown
								className='size-5 text-win'
								aria-hidden='true'
							/>
						) : (
							<Trophy
								className='size-5 text-rank-1'
								aria-hidden='true'
							/>
						)
					}
					title={
						winnerName
							? `${winnerName} won the duel`
							: "Duel resolved"
					}
					subtitle='Outcome is final and payout is settled.'
					variant={isWin ? "win" : "neutral"}
					extra={
						<div className='rounded-xl border border-win/40 bg-win/10 px-4 py-3'>
							<p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
								Winner
							</p>
							<div className='mt-1 flex items-center gap-3'>
								<DuelAvatarTile
									name={winnerName}
									size='sm'
									ring
								/>
								<div className='min-w-0 flex-1'>
									<p className='truncate text-sm font-semibold text-foreground'>
										{winnerName}
									</p>
									<PickChip label={winnerPick} />
								</div>

								<span className='text-2xl text-win font-semibold'>
									+{duel.totalPot}
								</span>
							</div>
						</div>
					}
				/>
			</div>

			<div className='grid grid-cols-2 gap-3'>
				<div
					className={cn(
						"rounded-2xl border p-4 transition-all duration-300",
						"border-win/40 bg-win/10",
					)}
				>
					<SectionLabel>Winner</SectionLabel>
					<div className='mt-2 flex items-center gap-2'>
						<DuelAvatarTile name={winnerName} size='md' ring />
						<div className='min-w-0'>
							<p className='truncate text-sm font-semibold'>
								{winnerName}
							</p>
							<PickChip label={winnerPick} />
						</div>
					</div>
				</div>
				<div
					className={cn(
						"rounded-2xl border p-4 transition-all duration-300",
						"border-border bg-card",
					)}
				>
					<SectionLabel>Next time</SectionLabel>
					<div className='mt-2 flex items-center gap-2'>
						<DuelAvatarTile
							name={loserName}
							size='md'
							ring={false}
						/>
						<div className='min-w-0'>
							<p className='truncate text-sm font-semibold'>
								{loserName}
							</p>
							<PickChip label={loserPick} />
						</div>
					</div>
				</div>
			</div>

			{rival ? (
				<div className='rounded-2xl border border-border bg-accent/10 p-4 text-sm'>
					<div className='mb-2 flex items-center gap-2 text-accent'>
						<Flame className='size-4' aria-hidden='true' />
						<SectionLabel>Series Update</SectionLabel>
					</div>
					<p className='text-muted-foreground'>
						Record: {rival.wins}-{rival.losses} ({rival.totalDuels}{" "}
						total duels), net {signedPts(rival.netPoints)}
					</p>
				</div>
			) : null}

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
