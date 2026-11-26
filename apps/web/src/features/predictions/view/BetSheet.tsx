import { useEffect, useState } from "react";
import { CheckIcon, MinusIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import {
	Button,
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	Spinner,
} from "@/shared/ui";
import { Slider } from "@/shared/ui/slider";
import type { Bet } from "@/features/predictions/types/bet";
import { useCancelBet, usePlaceBet } from "@/features/predictions/hooks/bet";
import { formatPoints } from "@/features/predictions/lib/predictionView";
import { useRoomActions } from "@/shared/lib/roomActions";
import { useOnline } from "@/shared/lib/offline";
import { needsHomeScreenInstall } from "@/shared/lib/pushNotifications";
import { useNextUnpicked } from "@/features/predictions/hooks/picks";
import { usePrefetchPrediction } from "@/features/predictions/hooks/prefetch";
import { useRoomContext } from "@/shared/lib/roomContext";
import { useAppNavigation } from "@/shared/lib/navigation";
import { describeDeadline } from "@/shared/lib/deadline";

const NOTIFICATIONS_OFFERED_KEY = "notifications-offered-after-bet";
const HOME_SCREEN_OFFERED_KEY = "home-screen-offered-after-bet";
const QUICK_ADDS = [5, 20, 50, 100] as const;

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	roomId: string;
	playerId: string;
	predictionId: string;
	seriesId: string | null;
	// The option being bet on, and its label.
	optionId: string | null;
	optionLabel: string;
	myBet: Bet | null;
	myBetLabel: string;
	// Points free in the series wallet (not counting this prediction's bet).
	available: number;
};

// Placing, changing or cancelling a bet, in a sheet over the options so the
// page itself stays calm. Opened by tapping an option or "Change".
export function BetSheet({
	open,
	onOpenChange,
	roomId,
	playerId,
	predictionId,
	seriesId,
	optionId,
	optionLabel,
	myBet,
	myBetLabel,
	available,
}: Readonly<Props>) {
	const { openNotifications } = useRoomActions();
	const { room } = useRoomContext();
	const { open: openPage } = useAppNavigation();
	const { next, nextMatch, remaining, open: openCount, pickedAfter } = useNextUnpicked(
		roomId,
		seriesId,
		predictionId,
		playerId,
	);
	// After a new pick, the sheet stays up to offer the next question.
	const [lockedIn, setLockedIn] = useState<{ label: string; amount: number } | null>(null);
	const { mutate: placeBet, isPending: isPlacing } = usePlaceBet();
	const prefetchPrediction = usePrefetchPrediction(roomId);
	const { mutate: cancelBet, isPending: isCancelling } = useCancelBet();

	// The existing bet's stake can be moved, so it counts as available here.
	const balance = available + (myBet?.amount ?? 0);
	const [amount, setAmount] = useState(1);

	// Each time the sheet opens, start from the saved stake or a suggestion.
	useEffect(() => {
		if (open) setAmount(myBet ? myBet.amount : defaultStake(balance));
	}, [open]);

	const clamp = (value: number) => Math.max(1, Math.min(value, Math.max(balance, 1)));
	const isSwitching = !!myBet && optionId !== myBet.option_id;
	const hasChanges = !myBet || isSwitching || amount !== myBet.amount;
	const busy = isPlacing || isCancelling;
	const online = useOnline();

	// Closing from the "Locked in" panel is when the notification offer
	// (which used to follow the pick) comes up.
	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen && lockedIn) {
			setLockedIn(null);
			offerNotifications(openNotifications);
		}
		onOpenChange(nextOpen);
	};
	const close = () => handleOpenChange(false);

	// The sheet keeps its "Locked in" panel while it closes (the page is
	// replaced underneath, which resets it), and the move goes through
	// openPage so the question just left doesn't flash back on the way.
	const goToNext = () => {
		if (!next) return;
		openPage(`/rooms/${room.code}/predictions/${next.id}`);
		onOpenChange(false);
	};

	const handlePlace = () => {
		if (!optionId) return;
		// A first pick offers the next question, so start loading it now:
		// it's ready by the time "Next" is tapped.
		if (!myBet && next) prefetchPrediction(next.id);
		placeBet(
			{ roomId, playerId, predictionId, seriesId, optionId, amount },
			{
				onSuccess: () => {
					if (myBet) {
						close();
						return;
					}
					if (next) {
						setLockedIn({ label: optionLabel, amount });
						return;
					}
					close();
					if (openCount > 1 && pickedAfter >= openCount) {
						toast.success(`All ${openCount} picked.`, {
							description: "Results land on Home as they come in.",
							position: "top-center",
						});
					}
					offerNotifications(openNotifications);
				},
				onError: (error) => {
					toast.error("Couldn't lock in your pick. Try again.", {
						position: "top-center",
						description: error.message,
					});
				},
			},
		);
	};

	const handleCancelBet = () => {
		cancelBet(
			{ roomId, playerId, predictionId, seriesId },
			{
				onSuccess: () => {
					close();
					toast.success("Pick taken back. Your points are back.", { position: "top-center" });
				},
				onError: (error) => {
					toast.error("Couldn't take back your pick. Try again.", {
						position: "top-center",
						description: error instanceof Error ? error.message : undefined,
					});
				},
			},
		);
	};

	let primaryLabel = `Lock in pick · ${formatPoints(amount)} pts`;
	if (isSwitching) primaryLabel = `Switch to ${optionLabel}`;
	else if (myBet) primaryLabel = "Change pick";

	if (lockedIn && next) {
		const closes = describeDeadline(new Date(next.deadline));
		return (
			<Drawer open={open} onOpenChange={handleOpenChange}>
				<DrawerContent className='mx-auto sm:max-w-md'>
					<DrawerHeader className='text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left'>
						<div className='flex items-center gap-3'>
							<span className='flex size-10 shrink-0 items-center justify-center rounded-full bg-win/15 text-win motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300'>
								<CheckIcon aria-hidden='true' className='size-5' />
							</span>
							<div>
								<DrawerTitle>Pick locked in</DrawerTitle>
								<DrawerDescription>
									{formatPoints(lockedIn.amount)} pts on{" "}
									<span className='font-semibold text-foreground'>{lockedIn.label}</span>
								</DrawerDescription>
							</div>
						</div>
					</DrawerHeader>

					<div className='px-4'>
						<button
							type='button'
							onClick={goToNext}
							className='w-full rounded-xl border bg-muted/40 p-4 text-left outline-none transition-colors hover:bg-muted/70 focus-visible:ring-[3px] focus-visible:ring-ring/50'
						>
							<span className='flex items-baseline justify-between gap-3 text-xs text-muted-foreground'>
								<span className='truncate'>{nextMatch ? `Next in ${nextMatch}` : "Next question"}</span>
								<span className='tabular-nums'>
									{pickedAfter} of {openCount} picked
								</span>
							</span>
							<span className='mt-1.5 block text-base font-semibold leading-snug text-balance'>
								{next.title}
							</span>
							<span className='mt-1 block text-[13px] text-muted-foreground'>
								Picks close {closes.when}
								{remaining > 1 ? `, ${remaining - 1} more after this` : ""}
							</span>
						</button>
					</div>

					<DrawerFooter className='flex-row gap-2.5'>
						<Button variant='outline' size='lg' onClick={close}>
							Done
						</Button>
						<Button variant='linear' size='lg' className='flex-1' onClick={goToNext}>
							Next question
						</Button>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Drawer open={open} onOpenChange={handleOpenChange}>
			<DrawerContent className='mx-auto sm:max-w-md'>
				<DrawerHeader className='text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left'>
					<DrawerTitle className='sr-only'>Your pick: {optionLabel}</DrawerTitle>
					<div className='flex items-end justify-between gap-3'>
						<div>
							<DrawerDescription>
								{isSwitching ? (
									<>
										Switch your pick from {myBetLabel} to{" "}
										<span className='font-semibold text-foreground'>{optionLabel}</span>
									</>
								) : (
									<>
										Your pick{" "}
										<span className='font-semibold text-foreground'>{optionLabel}</span>
									</>
								)}
							</DrawerDescription>
							<p className='mt-1.5 text-4xl font-bold leading-none tracking-tight tabular-nums'>
								{formatPoints(amount)}
								<span className='ml-1.5 text-lg font-semibold text-muted-foreground'>pts</span>
							</p>
						</div>
						<p className='text-right text-xs text-muted-foreground'>
							Your points
							<span className='block text-[15px] font-semibold text-foreground tabular-nums'>
								{formatPoints(balance)} pts
							</span>
						</p>
					</div>
				</DrawerHeader>

				<div className='flex flex-col gap-4 px-4'>
					<div className='grid grid-cols-4 gap-2'>
						{QUICK_ADDS.map((step) => (
							<Button
								key={step}
								variant='outline'
								className='h-11'
								onClick={() => setAmount((current) => clamp(current + step))}
								disabled={amount >= balance || busy}
							>
								+{step}
							</Button>
						))}
					</div>
					<div className='flex items-center gap-3'>
						<Button
							variant='secondary'
							size='icon'
							className='size-11'
							aria-label='One point less'
							onClick={() => setAmount((current) => clamp(current - 1))}
							disabled={amount <= 1 || busy}
						>
							<MinusIcon />
						</Button>
						<Slider
							min={1}
							max={Math.max(balance, 1)}
							step={1}
							value={[amount]}
							onValueChange={(value) => setAmount(clamp(value[0]))}
							disabled={busy || balance < 1}
							aria-label='How sure are you?'
						/>
						<Button
							variant='secondary'
							size='icon'
							className='size-11'
							aria-label='One point more'
							onClick={() => setAmount((current) => clamp(current + 1))}
							disabled={amount >= balance || busy}
						>
							<PlusIcon />
						</Button>
					</div>
					<p className='text-[13px] text-muted-foreground' aria-live='polite'>
						{/* No estimate: it would show how the others picked, which stays
						    hidden until picks close. */}
						If {optionLabel} wins, you share the points picked against you. The split shows when picks close.
					</p>
				</div>

				<DrawerFooter className='flex-row gap-2.5'>
					{myBet ? (
						<Button
							variant='outline'
							size='lg'
							className='text-destructive'
							onClick={handleCancelBet}
							disabled={busy || !online}
						>
							{isCancelling && <Spinner />}
							Take back pick
						</Button>
					) : (
						<Button variant='outline' size='lg' onClick={close} disabled={busy}>
							Not now
						</Button>
					)}
					<Button
						variant='linear'
						size='lg'
						className='flex-1'
						onClick={handlePlace}
						disabled={busy || !online || !hasChanges || !optionId || balance < 1}
					>
						{isPlacing && <Spinner />}
						{primaryLabel}
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

// A tenth of the wallet, rounded to a clean multiple of 10: at least 10 and
// never more than the player has.
function defaultStake(available: number) {
	if (available <= 0) return 1;
	const tenth = Math.round((available * 0.1) / 10) * 10;
	return Math.min(Math.max(tenth, 10), available);
}

// Right after a first bet is when hearing about the result matters, so
// offer notifications once per device, if the player hasn't decided yet.
// iPhones and iPads in the browser can't get notifications at all until
// Crow is on the Home Screen, so they get that step instead.
function offerNotifications(openNotifications: () => void) {
	if (needsHomeScreenInstall()) {
		offerHomeScreen();
		return;
	}
	if (!("Notification" in globalThis) || Notification.permission !== "default") {
		return;
	}
	try {
		if (localStorage.getItem(NOTIFICATIONS_OFFERED_KEY)) return;
		localStorage.setItem(NOTIFICATIONS_OFFERED_KEY, "1");
	} catch {
		return;
	}
	toast("Want to know when the result's in?", {
		description: "Get a notification when the result is in.",
		position: "top-center",
		duration: 10000,
		action: { label: "Turn on", onClick: openNotifications },
	});
}

function offerHomeScreen() {
	try {
		if (localStorage.getItem(HOME_SCREEN_OFFERED_KEY)) return;
		localStorage.setItem(HOME_SCREEN_OFFERED_KEY, "1");
	} catch {
		return;
	}
	toast("Want to know when the result's in?", {
		description:
			"Add Crow to your Home Screen: tap Share, then Add to Home Screen. Open Crow from there to turn on notifications.",
		position: "top-center",
		duration: 15000,
		action: { label: "Got it", onClick: () => {} },
	});
}
