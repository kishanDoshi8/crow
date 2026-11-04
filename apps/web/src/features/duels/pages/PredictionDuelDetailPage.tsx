import { Spinner } from "@/shared/ui";
import { useBets, useMyBet, usePrediction } from "@/features/predictions";
import { usePredictionDuels } from "@/features/duels/hooks/duel";
import DuelPredictionHeader from "@/features/duels/components/DuelPredictionHeader";
import { usePlayer } from "@/features/home";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useRoomContext } from "@/shared/lib/roomContext";
import DuelJoinView from "@/features/duels/components/detail/DuelJoinView";
import DuelMatchedView from "@/features/duels/components/detail/DuelMatchedView";
import DuelResolvedView from "@/features/duels/components/detail/DuelResolvedView";
import DuelExpiredView from "@/features/duels/components/detail/DuelExpiredView";
import DuelCancelledView from "@/features/duels/components/detail/DuelCancelledView";
import {
	getChallengerPickLabel,
	getMyPickLabel,
	getOpponentPickLabel,
	toVisualState,
} from "@/features/duels/lib/duelDetailUtils";
import { usePredictionDuelActions } from "@/features/duels/hooks/usePredictionDuelActions";

export function PredictionDuelDetailPage() {
	const { predictionId, duelId } = useParams<{
		predictionId: string;
		duelId: string;
	}>();
	const navigate = useNavigate();
	const { room } = useRoomContext();

	const { data: player } = usePlayer();
	const { data: prediction } = usePrediction(room.id, predictionId);
	const { data: duels = [] } = usePredictionDuels(room.id, predictionId);
	const { data: bets = [] } = useBets(room.id, predictionId);
	const { data: myBet } = useMyBet(
		room.id,
		predictionId ?? "",
		player?.id ?? "",
	);

	const duel = useMemo(
		() => duels.find((item) => item.id === duelId),
		[duelId, duels],
	);

	const currentUserId = player?.id ?? null;
	const isCurrentUserChallenger =
		currentUserId != null && duel?.challenger.id === currentUserId;
	const visualState = duel ? toVisualState(duel) : null;

	const challengerPickLabel = getChallengerPickLabel(duel, prediction, bets);
	const opponentPickLabel = getOpponentPickLabel(duel, prediction, bets);
	const myPickLabel = getMyPickLabel(prediction, myBet?.option_id);

	const eligible =
		!!duel &&
		!!player &&
		!!myBet &&
		duel.status !== "matched" &&
		duel.status !== "resolved" &&
		duel.status !== "cancelled" &&
		duel.status !== "expired" &&
		!duel.currentPlayerQueued &&
		!isCurrentUserChallenger &&
		prediction?.status === "draft";
	let ineligibleReason = "This duel is not currently joinable.";
	if (!myBet) {
		ineligibleReason = "Place a qualifying bet before joining this duel.";
	} else if (isCurrentUserChallenger) {
		ineligibleReason = "You cannot join your own duel.";
	} else if (duel?.currentPlayerQueued) {
		ineligibleReason = "You are currently waiting in this queue.";
	}

	const queueRows = duel?.queue ?? [];
	const currentUserWaitingQueueEntry =
		queueRows.find(
			(queueEntry) =>
				queueEntry.player.id === currentUserId &&
				queueEntry.status === "waiting",
		) ?? null;
	const canLeaveQueue =
		!!currentUserWaitingQueueEntry &&
		duel?.status !== "matched" &&
		duel?.status !== "resolved" &&
		duel?.status !== "cancelled" &&
		duel?.status !== "expired" &&
		prediction?.status === "draft";

	const rival = duel?.rivalry ?? null;
	const isWin = duel?.currentPlayerState === "winner";

	const [showWinBurst, setShowWinBurst] = useState(false);
	useEffect(() => {
		if (visualState !== "resolved" || !isWin) return;
		setShowWinBurst(true);
		const timer = globalThis.setTimeout(() => setShowWinBurst(false), 1500);
		return () => globalThis.clearTimeout(timer);
	}, [isWin, visualState]);

	const {
		onCommitEscrow,
		onCancelDuel,
		onCancelQueue,
		isJoining,
		isLeavingQueue,
		isCancelling,
	} = usePredictionDuelActions({
		roomId: room.id,
		duel,
		prediction,
		playerId: player?.id,
		myBetId: myBet?.id,
	});

	if (!duel || !player || !prediction || !visualState) {
		return (
			<div className='mx-auto flex min-h-[40vh] max-w-md items-center justify-center px-4'>
				<div className='rounded-2xl border border-border bg-card p-5 text-center text-sm text-muted-foreground'>
					<Spinner className='mx-auto mb-2' />
					Loading duel details...
				</div>
			</div>
		);
	}

	const onBack = () => {
		navigate(`/rooms/${room.code}/predictions/${predictionId}/duels`, {
			replace: true,
		});
	};

	const onSeeResult = () => {
		navigate(
			`/rooms/${room.code}/predictions/${prediction.id}/duels/${duel.id}`,
		);
	};

	return (
		<div className='mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md flex-col'>
			<div className='flex-1 space-y-4 overflow-y-auto px-4 pb-20 pt-4'>
				<h2 className='flex gap-2 items-center text-lg font-semibold'>
					Duel
				</h2>
				<div className='mb-4'>
					<DuelPredictionHeader room={room} prediction={prediction} />
				</div>
				{visualState === "join" ? (
					<DuelJoinView
						duel={duel}
						predictionDeadline={prediction.deadline}
						challengerPickLabel={challengerPickLabel}
						opponentPickLabel={opponentPickLabel}
						myPickLabel={myPickLabel}
						rival={rival}
						eligible={eligible}
						ineligibleReason={ineligibleReason}
						isCurrentUserChallenger={isCurrentUserChallenger}
						canLeaveQueue={canLeaveQueue}
						isJoining={isJoining}
						isLeavingQueue={isLeavingQueue}
						isCancelling={isCancelling}
						queueRows={queueRows}
						currentUserId={currentUserId}
						onCommitEscrow={onCommitEscrow}
						onCancelQueue={onCancelQueue}
						onCancelDuel={onCancelDuel}
					/>
				) : null}
				{visualState === "matched" ? (
					<DuelMatchedView
						duel={duel}
						currentUserId={currentUserId}
						challengerPickLabel={challengerPickLabel}
						opponentPickLabel={opponentPickLabel}
						onSeeResult={onSeeResult}
					/>
				) : null}
				{visualState === "resolved" ? (
					<DuelResolvedView
						duel={duel}
						isWin={isWin}
						showWinBurst={showWinBurst}
						challengerPickLabel={challengerPickLabel}
						opponentPickLabel={opponentPickLabel}
						rival={rival}
						currentUserId={currentUserId}
						onBack={onBack}
					/>
				) : null}
				{visualState === "expired" ? (
					<DuelExpiredView
						duel={duel}
						challengerPickLabel={challengerPickLabel}
						currentUserId={currentUserId}
						onBack={onBack}
					/>
				) : null}
				{visualState === "cancelled" ? (
					<DuelCancelledView
						duel={duel}
						currentUserId={currentUserId}
						onBack={onBack}
					/>
				) : null}
			</div>
		</div>
	);
}
