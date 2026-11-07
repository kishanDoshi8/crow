import { useMemo, useState } from "react";
import { Button, Skeleton } from "@/shared/ui";
import { usePlayer } from "@/features/home";
import { PlayerProfileDialog } from "@/features/leaderboard";
import { roomPlayerName, useRoomBetRealtime, useRoomRole } from "@/features/rooms";
import { useSeriesWallet } from "@/features/series";
import type { ResultCardData } from "@/features/share";
import { useRoomContext } from "@/shared/lib/roomContext";
import { useBets } from "@/features/predictions/hooks/bet";
import { ResolvePredictionDrawer } from "@/features/predictions/components/ResolvePredictionDrawer";
import type { Prediction } from "@/features/predictions/types/types";
import { formatPoints, tallyOptions } from "@/features/predictions/lib/predictionView";
import { PredictionHeading } from "./PredictionHeading";
import { PredictionStatusLine } from "./PredictionStatusLine";
import { OptionsBoard } from "./OptionsBoard";
import { YourCall } from "./YourCall";
import { PicksList } from "./PicksList";
import { BetSheet } from "./BetSheet";
import { PredictionStaffMenu } from "./PredictionStaffMenu";

type Props = {
	prediction: Prediction | null | undefined;
	isLoading: boolean;
	onDeadline: () => void;
};

// One page for a prediction in every state, top to bottom: the question, one
// status line, your call, the options, who picked what, and one action at
// the bottom. Discussion will slot in under the picks.
export function PredictionView({ prediction, isLoading, onDeadline }: Readonly<Props>) {
	if (!prediction) {
		return isLoading ? (
			<PredictionViewSkeleton />
		) : (
			<p className='p-6 text-center text-muted-foreground'>This prediction isn't here any more.</p>
		);
	}
	return <LoadedPrediction prediction={prediction} onDeadline={onDeadline} />;
}

function LoadedPrediction({
	prediction,
	onDeadline,
}: Readonly<{ prediction: Prediction; onDeadline: () => void }>) {
	const { room } = useRoomContext();
	const { can } = useRoomRole(room);
	const { data: player } = usePlayer();
	const { data: bets = [], isPending: isBetsLoading } = useBets(room.id, prediction.id);
	const { wallet } = useSeriesWallet(room.id, prediction.seriesId ?? null);
	useRoomBetRealtime(room.id, prediction.id);

	const [sheetOptionId, setSheetOptionId] = useState<string | null>(null);
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [isRevealOpen, setIsRevealOpen] = useState(false);
	const [profileId, setProfileId] = useState<string | null>(null);

	const { options, pool, picks } = useMemo(
		() => tallyOptions(prediction, bets),
		[prediction, bets],
	);
	const labelOf = (optionId: string | null | undefined) =>
		options.find((tally) => tally.option.id === optionId)?.option.label ?? "";
	const myBet = bets.find((bet) => bet.player_id === player?.id) ?? null;
	const nameOf = (playerId: string) => {
		if (player?.id === playerId) return player.username;
		return roomPlayerName(room, playerId) ?? "Unknown";
	};
	const status = prediction.status;
	const winnerLabel = labelOf(prediction.winning_option_id) || null;

	const openSheet = (optionId: string) => {
		setSheetOptionId(optionId);
		setIsSheetOpen(true);
	};

	const resultCard: ResultCardData | null =
		status === "revealed" && prediction.winning_option_id && !isBetsLoading
			? {
					roomName: room.name,
					roomCode: room.code,
					host: "",
					seriesTitle: prediction.seriesTitle ?? null,
					predictionNumber: prediction.seriesPredictionNumber ?? null,
					question: prediction.title,
					winner: winnerLabel ?? "",
					calledIt: bets.filter((bet) => bet.option_id === prediction.winning_option_id).length,
					participants: bets.length,
					playerName: player?.username ?? "",
					options: options.map((tally) => ({
						label: tally.option.label,
						pool: tally.points,
						isWinner: tally.option.id === prediction.winning_option_id,
						isMine: tally.option.id === myBet?.option_id,
					})),
					call: myBet
						? {
								pick: labelOf(myBet.option_id),
								stake: myBet.amount,
								net: (myBet.payout ?? 0) - myBet.amount,
							}
						: null,
				}
			: null;

	const isOpen = status === "draft";
	const showRevealBar = status === "locked" && can.resolve;
	const showBetBar = isOpen && !!player;

	return (
		<div className='flex min-h-[calc(100dvh-3.5rem)] flex-col'>
			<div className='mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-8'>
				<PredictionHeading
					prediction={prediction}
					roomCode={room.code}
					menu={
						<PredictionStaffMenu
							prediction={prediction}
							roomId={room.id}
							roomCode={room.code}
							can={can}
						/>
					}
				/>

				<PredictionStatusLine
					prediction={prediction}
					winnerLabel={winnerLabel}
					resolvedByName={prediction.resolved_by ? nameOf(prediction.resolved_by) : null}
					correctedByName={prediction.corrected_by ? nameOf(prediction.corrected_by) : null}
					onDeadline={onDeadline}
				/>

				{player && !isBetsLoading ? (
					<YourCall
						prediction={prediction}
						bets={bets}
						myBet={myBet}
						viewerId={player.id}
						options={options}
						roomId={room.id}
						resultCard={resultCard}
					/>
				) : null}

				<section>
					<h2 className='mb-2.5 flex items-baseline justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground'>
						{isOpen ? "Make your call" : "The split"}
						<span className='normal-case tracking-normal tabular-nums'>
							{status === "revealed"
								? `${bets.filter((bet) => bet.option_id === prediction.winning_option_id).length} of ${picks} called it`
								: `${formatPoints(pool)} pts · ${picks} ${picks === 1 ? "pick" : "picks"}`}
						</span>
					</h2>
					{isBetsLoading ? (
						<OptionsSkeleton count={options.length || 2} />
					) : (
						<OptionsBoard
							status={status}
							options={options}
							winningOptionId={prediction.winning_option_id}
							myOptionId={myBet?.option_id ?? null}
							selectedOptionId={isSheetOpen ? sheetOptionId : null}
							onPick={showBetBar ? openSheet : undefined}
						/>
					)}
				</section>

				{!isBetsLoading ? (
					<PicksList
						status={status}
						bets={bets}
						options={options}
						winningOptionId={prediction.winning_option_id}
						viewerId={player?.id ?? null}
						nameOf={nameOf}
						onOpenPlayer={setProfileId}
					/>
				) : null}
			</div>

			{showBetBar || showRevealBar ? (
				<div className='sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'>
					<div className='mx-auto flex w-full max-w-md items-center gap-3 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]'>
						{showRevealBar ? (
							<>
								<span className='flex-1 text-xs text-muted-foreground'>
									Waiting on you for the result
								</span>
								<Button variant='linear' size='lg' onClick={() => setIsRevealOpen(true)}>
									Reveal result
								</Button>
							</>
						) : myBet ? (
							<>
								<span className='flex-1 leading-tight'>
									<span className='block text-xs text-muted-foreground'>Your pick</span>
									<span className='font-semibold'>
										{labelOf(myBet.option_id)} ·{" "}
										<span className='tabular-nums'>{formatPoints(myBet.amount)} pts</span>
									</span>
								</span>
								<Button variant='outline' size='lg' onClick={() => openSheet(myBet.option_id)}>
									Change
								</Button>
							</>
						) : (
							<p className='flex-1 text-xs text-muted-foreground'>
								Tap an option to make your call ·{" "}
								<span className='font-semibold text-foreground tabular-nums'>
									{formatPoints(wallet?.available ?? 0)} pts
								</span>{" "}
								to play
							</p>
						)}
					</div>
				</div>
			) : null}

			{showBetBar && player ? (
				<BetSheet
					open={isSheetOpen}
					onOpenChange={setIsSheetOpen}
					roomId={room.id}
					playerId={player.id}
					predictionId={prediction.id}
					seriesId={prediction.seriesId ?? null}
					optionId={sheetOptionId}
					optionLabel={labelOf(sheetOptionId)}
					myBet={myBet}
					myBetLabel={labelOf(myBet?.option_id)}
					bets={bets}
					available={wallet?.available ?? 0}
				/>
			) : null}

			{showRevealBar ? (
				<ResolvePredictionDrawer
					prediction={prediction}
					roomId={room.id}
					open={isRevealOpen}
					onOpenChange={setIsRevealOpen}
				/>
			) : null}

			<PlayerProfileDialog
				playerId={profileId}
				open={!!profileId}
				onOpenChange={(next) => !next && setProfileId(null)}
				roomId={room.id}
			/>
		</div>
	);
}

function OptionsSkeleton({ count }: Readonly<{ count: number }>) {
	return (
		<div className='flex flex-col gap-2'>
			{Array.from({ length: count }, (_, index) => (
				<Skeleton key={index} className='h-[84px] w-full rounded-xl' />
			))}
		</div>
	);
}

function PredictionViewSkeleton() {
	return (
		<div className='mx-auto flex w-full max-w-md flex-col gap-5 px-4 pt-4' aria-busy='true'>
			<div className='space-y-2'>
				<Skeleton className='h-3 w-32' />
				<Skeleton className='h-6 w-full' />
				<Skeleton className='h-6 w-2/3' />
			</div>
			<Skeleton className='h-11 w-full rounded-lg' />
			<OptionsSkeleton count={2} />
			<Skeleton className='h-4 w-24' />
		</div>
	);
}
