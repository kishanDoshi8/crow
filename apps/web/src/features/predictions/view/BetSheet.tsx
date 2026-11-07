import { useEffect, useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
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
import { previewWinnings } from "@/features/predictions/lib/payoutPreview";
import { formatPoints } from "@/features/predictions/lib/predictionView";
import { useRoomActions } from "@/shared/lib/roomActions";

const NOTIFICATIONS_OFFERED_KEY = "notifications-offered-after-bet";
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
	bets: Bet[];
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
	bets,
	available,
}: Readonly<Props>) {
	const { openNotifications } = useRoomActions();
	const { mutate: placeBet, isPending: isPlacing } = usePlaceBet();
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
	const gain = optionId ? previewWinnings(bets, playerId, optionId, amount) : 0;
	const busy = isPlacing || isCancelling;

	const close = () => onOpenChange(false);

	const handlePlace = () => {
		if (!optionId) return;
		placeBet(
			{ roomId, playerId, predictionId, seriesId, optionId, amount },
			{
				onSuccess: () => {
					close();
					if (!myBet) offerNotifications(openNotifications);
				},
				onError: (error) => {
					toast.error("Couldn't place the bet.", {
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
					toast.success("Bet cancelled. Your points are back.", { position: "top-center" });
				},
				onError: (error) => {
					toast.error("Couldn't cancel the bet.", {
						position: "top-center",
						description: error instanceof Error ? error.message : undefined,
					});
				},
			},
		);
	};

	let primaryLabel = `Place bet · ${formatPoints(amount)} pts`;
	if (isSwitching) primaryLabel = `Switch to ${optionLabel}`;
	else if (myBet) primaryLabel = "Update bet";

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className='mx-auto sm:max-w-md'>
				<DrawerHeader className='text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left'>
					<DrawerTitle className='sr-only'>Your bet on {optionLabel}</DrawerTitle>
					<div className='flex items-end justify-between gap-3'>
						<div>
							<DrawerDescription>
								{isSwitching ? (
									<>
										Move your bet from {myBetLabel} to{" "}
										<span className='font-semibold text-foreground'>{optionLabel}</span>
									</>
								) : (
									<>
										Your bet on{" "}
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
							Balance
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
							aria-label='Stake'
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
						{gain > 0 ? (
							<>
								If {optionLabel} wins:{" "}
								<span className='font-semibold text-win tabular-nums'>≈ +{formatPoints(gain)} pts</span>
								{" "}· changes as others bet. Locked at the deadline.
							</>
						) : (
							"No one to win from on this pick yet. Locked at the deadline."
						)}
					</p>
				</div>

				<DrawerFooter className='flex-row gap-2.5'>
					{myBet ? (
						<Button
							variant='outline'
							size='lg'
							className='text-destructive'
							onClick={handleCancelBet}
							disabled={busy}
						>
							{isCancelling && <Spinner />}
							Cancel bet
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
						disabled={busy || !hasChanges || !optionId || balance < 1}
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
function offerNotifications(openNotifications: () => void) {
	if (!("Notification" in globalThis) || Notification.permission !== "default") {
		return;
	}
	try {
		if (localStorage.getItem(NOTIFICATIONS_OFFERED_KEY)) return;
		localStorage.setItem(NOTIFICATIONS_OFFERED_KEY, "1");
	} catch {
		return;
	}
	toast("Want to know when it's settled?", {
		description: "Get a notification when results are in.",
		position: "top-center",
		duration: 10000,
		action: { label: "Turn on", onClick: openNotifications },
	});
}
