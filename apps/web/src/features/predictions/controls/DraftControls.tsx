import React, { useEffect } from "react";
import { Slider } from "@/shared/ui/slider";
import { Button } from "@/shared/ui/button";
import {
	ChevronDown,
	Coins,
	MinusIcon,
	PlusIcon,
	RotateCcw,
	X,
} from "lucide-react";
import type { Player } from "@/features/home";
import { useBets, useCancelBet, useMyBet, usePlaceBet } from "@/features/predictions/hooks/bet";
import { usePrediction } from "@/features/predictions/hooks/prediction";
import { previewWinnings } from "@/features/predictions/lib/payoutPreview";
import { Spinner } from "@/shared/ui/spinner";
import { toast } from "sonner";
import { useRoomContext } from "@/shared/lib/roomContext";
import { useRoomActions } from "@/shared/lib/roomActions";
import { useLocalStorage } from "@/shared/hooks/useLocalStorage";
import { localStorageKeys } from "@/shared/constants/queryKeys";
import { Collapse, Counter, FadeContent } from "@/shared/ui";
import { useSeriesWallet } from "@/features/series";

const NOTIFICATIONS_OFFERED_KEY = "notifications-offered-after-bet";

type Props = {
	player: Player;
	predictionId: string;
	seriesId: string | null;
	selectedOption: string | null;
	setSelectedOption: React.Dispatch<React.SetStateAction<string | null>>;
};

export default function DraftControls({
	player,
	predictionId,
	seriesId,
	selectedOption,
	setSelectedOption,
}: Readonly<Props>) {
	const { room } = useRoomContext();
	const { openNotifications } = useRoomActions();
	const { mutate: placeBet, isPending: isPlacingBet } = usePlaceBet();
	const { wallet } = useSeriesWallet(room.id, seriesId);
	const { data: myBet, isPending: isMyBetLoading } = useMyBet(
		room.id,
		predictionId,
		player.id,
	);
	const { mutate: cancelBet, isPending: isCancellingBet } = useCancelBet();
	const { data: prediction } = usePrediction(room.id, predictionId);
	const { data: bets = [] } = useBets(room.id, predictionId);

	const [betAmount, setBetAmount] = React.useState<number>(1);
	// The suggested stake fills in until the player picks their own amount.
	const [hasPickedAmount, setHasPickedAmount] = React.useState(false);
	const [collapseControls, setCollapseControls] = useLocalStorage<boolean>(
		false,
		localStorageKeys.userPreference.bettingControls.collapsed,
	);

	// Bets spend points from this prediction's series wallet.
	const availableBalance = (wallet?.available ?? 0) + (myBet?.amount ?? 0);
	const suggestedStake = defaultStake(availableBalance);

	const optionLabel = (optionId: string | null) =>
		prediction?.prediction_options.find((option) => option.id === optionId)
			?.label ?? "";
	const isSwitchingOption = !!myBet && selectedOption !== myBet.option_id;
	const isAmountChanged = !!myBet && myBet.amount !== betAmount;
	const hasChanges = isSwitchingOption || isAmountChanged;
	const projectedGain = selectedOption
		? previewWinnings(bets, player.id, selectedOption, betAmount)
		: 0;


	// Load the saved bet into the controls when it arrives or changes.
	useEffect(() => {
		if (myBet) {
			setSelectedOption(myBet.option_id);
			setBetAmount(myBet.amount);
		} else if (!hasPickedAmount) {
			setBetAmount(suggestedStake);
		}
	}, [myBet?.option_id, myBet?.amount, suggestedStake]);

	useEffect(() => {
		if (isMyBetLoading) return;
		// Nothing placed yet, or a new option picked: show the full controls.
		if (!myBet || (selectedOption && selectedOption !== myBet.option_id)) {
			setCollapseControls(false);
		}
	}, [myBet, isMyBetLoading, selectedOption, setCollapseControls]);

	useEffect(() => {
		// Collapsing discards unsaved changes.
		if (collapseControls && myBet) {
			setBetAmount(myBet.amount);
			setSelectedOption(myBet.option_id);
		}
	}, [collapseControls]);

	const handlePlaceBet = () => {
		if (!player || !predictionId || !selectedOption) return;

		placeBet(
			{
				roomId: room.id,
				playerId: player.id,
				predictionId: predictionId,
				seriesId,
				optionId: selectedOption,
				amount: betAmount,
			},
			{
				onSuccess: () => {
					if (!myBet) offerNotifications();
				},
				onError: (error) => {
					console.error("Failed to place bet:", error);
					toast.error("Failed to place bet. Please try again.", {
						position: "top-center",
						description: error.message,
					});
				},
			},
		);
	};

	// Right after a first bet is when hearing about the result matters, so
	// offer notifications once per device, if the player hasn't decided yet.
	const offerNotifications = () => {
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
	};

	const handleResetBetAmount = () => {
		if (myBet) {
			setBetAmount(myBet.amount);
			setSelectedOption(myBet.option_id);
		} else {
			setBetAmount(suggestedStake);
			setHasPickedAmount(false);
		}
	};

	const handleCancelBet = () => {
		if (!player || !predictionId) return;

		cancelBet(
			{
				roomId: room.id,
				playerId: player.id,
				predictionId: predictionId,
				seriesId,
			},
			{
				onError: (error) => {
					console.error("Failed to cancel bet:", error);
					toast.error("Failed to cancel bet.", {
						position: "top-center",
						description:
							error instanceof Error ? error.message : undefined,
					});
				},
			},
		);
	};

	const handleAddAmount = (number?: number) => {
		setHasPickedAmount(true);
		setBetAmount((prev) => Math.min(prev + (number ?? 1), availableBalance));
	};

	const handleSubtractAmount = () => {
		setHasPickedAmount(true);
		setBetAmount((prev) => Math.max(prev - 1, 1));
	};

	const removeSelectedOption = () => {
		setSelectedOption(null);
		setBetAmount(suggestedStake);
		setHasPickedAmount(false);
		setCollapseControls(true);
	};

	return (
		<div className={`relative p-4 border rounded-md bg-background`}>
			{/* Folds the controls away once there's a bet to keep. */}
			{myBet ? (
				<Button
					variant={"secondary"}
					className={`absolute -top-1 left-1/2 -translate-x-1/2 bg-background hover:bg-background/80 data-[state=open]:bg-background/80 border rounded-lg rounded-tr-none rounded-tl-none`}
					size={"icon-lg"}
					aria-label={collapseControls ? "Show bet controls" : "Hide bet controls"}
					onClick={() => setCollapseControls((prev) => !prev)}
				>
					<ChevronDown
						className={`w-4 h-4 duration-300 ${collapseControls ? "rotate-180" : ""}`}
					/>
				</Button>
			) : null}
			<div
				className={`flex flex-col ${collapseControls ? "gap-2" : "gap-6"}`}
			>
				<div className={`flex justify-between items-center`}>
					<div>
						{selectedOption && (
							<Button
								className={`flex-col gap-1 items-start p-2`}
								variant={"none"}
								onClick={handleResetBetAmount}
							>
								<p
									className={`flex items-center justify-start gap-2 text-xs text-muted-foreground`}
								>
									{hasChanges && (
										<RotateCcw className={`w-3! h-3!`} />
									)}
									Bet Amount
								</p>
								<p
									className={`flex items-center gap-2 text-win w-full text-lg font-semibold`}
								>
									<Counter value={betAmount} fontSize={24} />
									{" pts"}
									{myBet && myBet?.amount !== betAmount && (
										<span
											className={`text-xs text-muted-foreground`}
										>
											{myBet.amount - betAmount < 0 &&
												"+"}
											{betAmount -
												(myBet.amount ?? 0)}{" "}
										</span>
									)}
								</p>
							</Button>
						)}
					</div>
					<div>
						<p className={`text-xs text-muted-foreground`}>
							Your Balance
						</p>
						<p className={`${selectedOption ? "text-right" : ""}`}>
							<span className={`text-xl font-semibold`}>
								{availableBalance.toLocaleString()} pts
							</span>
						</p>
					</div>
				</div>
				{selectedOption && !collapseControls && (
					<p
						className={`-mt-3 text-sm text-muted-foreground`}
						aria-live='polite'
					>
						{projectedGain > 0 ? (
							<>
								If {optionLabel(selectedOption)} wins:{" "}
								<span className={`font-semibold text-win`}>
									≈ +{projectedGain.toLocaleString()} pts
								</span>
								<span className={`text-xs`}>
									{" "}
									· changes as others bet
								</span>
							</>
						) : (
							<>No one to win from on this pick yet.</>
						)}
					</p>
				)}
				{!collapseControls && (
					<>
						{/* Grows in when an option is picked, instead of popping the panel taller. */}
						<Collapse open={!!selectedOption}>
							<div className={`flex flex-col gap-3`}>
								<div className={`flex gap-2 *:flex-1`}>
									<Button
										variant={"outline"}
										size={"sm"}
										onClick={() => handleAddAmount(5)}
										disabled={
											betAmount === availableBalance
										}
									>
										+5
									</Button>
									<Button
										variant={"outline"}
										size={"sm"}
										onClick={() =>
											handleAddAmount(20)
										}
										disabled={
											betAmount === availableBalance
										}
									>
										+20
									</Button>
									<Button
										variant={"outline"}
										size={"sm"}
										onClick={() =>
											handleAddAmount(50)
										}
										disabled={
											betAmount === availableBalance
										}
									>
										+50
									</Button>
									<Button
										variant={"outline"}
										size={"sm"}
										onClick={() =>
											handleAddAmount(100)
										}
										disabled={
											betAmount === availableBalance
										}
									>
										+100
									</Button>
								</div>
								<div className={`flex gap-3 `}>
									<Button
										variant={"secondary"}
										size={"icon-sm"}
										onClick={handleSubtractAmount}
									>
										<MinusIcon className={`w-3 h-3`} />
									</Button>
									<Slider
										min={1}
										max={availableBalance}
										step={1}
										value={[betAmount]}
										onValueChange={(value) => {
											setHasPickedAmount(true);
											setBetAmount(value[0]);
										}}
										disabled={isPlacingBet}
									/>
									<Button
										variant={"secondary"}
										size={"icon-sm"}
										onClick={() => handleAddAmount()}
									>
										<PlusIcon className={`w-3 h-3`} />
									</Button>
								</div>
							</div>
						</Collapse>
					</>
				)}
				<div>
					{!collapseControls && (
						<FadeContent>
							{myBet && (
								<div className={`flex gap-4`}>
									<Button
										variant={"outline"}
										className={`flex-1`}
										disabled={isCancellingBet}
										onClick={handleCancelBet}
									>
										{isCancellingBet && <Spinner />}
										Cancel Bet
									</Button>
									<Button
										variant={"linear"}
										className={`flex-1`}
										disabled={isPlacingBet || !hasChanges}
										onClick={handlePlaceBet}
									>
										{isPlacingBet && <Spinner />}
										{isSwitchingOption
											? `Switch to ${optionLabel(selectedOption)}`
											: "Update Bet"}
									</Button>
								</div>
							)}
							{selectedOption && !myBet && (
								<div className={`flex gap-2 mt-2`}>
									<Button
										variant={"secondary"}
										size={"lg"}
										onClick={() => removeSelectedOption()}
									>
										<X />
									</Button>
									<Button
										variant={"linear"}
										size={"lg"}
										className={`flex-1`}
										onClick={handlePlaceBet}
										disabled={isPlacingBet}
									>
										{isPlacingBet ? <Spinner /> : <Coins />}
										Place Bet
									</Button>
								</div>
							)}
						</FadeContent>
					)}
					{selectedOption && !myBet && (
						<p className={`text-xs text-muted-foreground mt-2`}>
							Bets are locked and cannot be changed after the
							deadline
						</p>
					)}
					{!selectedOption && !myBet && (
						<p className={`text-xs text-muted-foreground mt-2`}>
							Select an option and place your bet before the
							deadline
						</p>
					)}
					{myBet && (
						<p className={`text-xs text-muted-foreground mt-2`}>
							Tap another option to switch, or change the amount,
							until the deadline.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

// A tenth of the wallet, rounded to a clean multiple of 10: at least 10 and
// never more than the player has.
function defaultStake(available: number) {
	if (available <= 0) return 1;
	const tenth = Math.round((available * 0.1) / 10) * 10;
	return Math.min(Math.max(tenth, 10), available);
}

