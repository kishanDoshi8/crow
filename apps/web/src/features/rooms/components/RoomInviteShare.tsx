import type { Room } from "@/features/rooms/types/types";
import { useCurrentSeries, useSeriesWallet } from "@/features/series/hooks/wallets";
import {
	InviteCard,
	shareHost,
	shareLink,
	ShareSheet,
	type InviteCardData,
} from "@/features/share";
import { useActivePredictions } from "@/features/predictions/hooks/prediction";
import { useBets } from "@/features/predictions/hooks/bet";
import { describeDeadline } from "@/shared/lib/deadline";

type Props = {
	room: Room;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

// The invite card image with the room link, ready to share.
export function RoomInviteShare({ room, open, onOpenChange }: Readonly<Props>) {
	const { currentSeries } = useCurrentSeries(room.id);
	const activeSeries = currentSeries?.status === "active" ? currentSeries : null;
	const { wallet: activeWallet } = useSeriesWallet(room.id, activeSeries?.id);

	// The open prediction that locks soonest, shown on the invite card. Only
	// fetched once the card is open.
	const { data: activePredictions = [] } = useActivePredictions(
		room.id,
		activeSeries?.id,
		open && !!activeSeries,
	);
	const now = Date.now();
	const nextLock = activePredictions
		.filter(
			(prediction) =>
				prediction.status === "draft" &&
				new Date(prediction.deadline).getTime() > now,
		)
		.sort(
			(a, b) =>
				new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
		)[0];
	const { data: nextLockBets = [] } = useBets(room.id, nextLock?.id);
	const nextLockPool = nextLockBets.reduce((sum, bet) => sum + bet.amount, 0);

	const inviteCard: InviteCardData = {
		roomName: room.name,
		roomCode: room.code,
		host: shareHost(),
		memberCount: room.member_count ?? room.members.length,
		livePredictions: room.active_prediction_count ?? 0,
		series:
			activeSeries && activeWallet
				? { title: activeSeries.title, startingStack: activeWallet.starting_stack }
				: null,
		teaser: nextLock
			? {
					question: nextLock.title,
					locks: describeDeadline(new Date(nextLock.deadline)).when,
					options: nextLock.prediction_options.map((option) => ({
						label: option.label,
						share:
							nextLockPool > 0
								? (nextLockBets
										.filter((bet) => bet.option_id === option.id)
										.reduce((sum, bet) => sum + bet.amount, 0) /
										nextLockPool) *
									100
								: 0,
					})),
				}
			: null,
	};

	return (
		<ShareSheet
			open={open}
			onOpenChange={onOpenChange}
			title={`Invite friends to ${room.name}`}
			description='Anyone with the link can join after signing in.'
			message={`Join ${room.name} on Crow. Room code ${room.code}.`}
			link={shareLink(room.code, "invite-card")}
			kind='invite-card'
			roomId={room.id}
			fileName={`crow-invite-${room.code.toLowerCase()}`}
			renderCard={(format) => <InviteCard data={inviteCard} format={format} />}
		/>
	);
}
