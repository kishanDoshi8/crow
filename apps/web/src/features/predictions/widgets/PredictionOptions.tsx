import {
	Field,
	FieldContent,
	FieldLabel,
	FieldTitle,
	Progress,
	RadioGroup,
	RadioGroupItem,
	Reveal,
	Skeleton,
	SkeletonList,
} from "@/shared/ui";
import { useBets } from "@/features/predictions/hooks/bet";
import type { Prediction } from "@/features/predictions/types/types";
import React from "react";
import { useRoomContext } from "@/shared/lib/roomContext";
import { useOptionColor } from "@/shared/hooks/useOptionColor";

const OPTIONS_LIST = "mt-4 grid gap-3";
const OPTION_SHELL = "flex items-center gap-2";

// One option row as drawn by FieldLabel + Field (border, p-4): radio, label,
// percentage over points, then the bar.
function PredictionOptionSkeleton() {
	return (
		<div className='flex w-full items-start gap-3 rounded-md border p-4'>
			<Skeleton className='mt-px size-4 shrink-0 rounded-full' />
			<div className='flex flex-1 flex-col gap-1.5'>
				<div className='flex items-start justify-between'>
					<div className='flex h-7 items-center'>
						<Skeleton className='h-4.5 w-28' />
					</div>
					<div className='flex flex-col items-end'>
						<div className='flex h-7 items-center'>
							<Skeleton className='h-4.5 w-10' />
						</div>
						<div className='flex h-4 items-center'>
							<Skeleton className='h-3 w-12' />
						</div>
					</div>
				</div>
				<Skeleton className='h-2 w-full rounded-full' />
			</div>
		</div>
	);
}

type Props = {
	prediction: Prediction | null | undefined;
	selectedOption: string | null;
	setSelectedOption: React.Dispatch<React.SetStateAction<string | null>>;
	fadeDelay?: number;
};

export default function PredictionOptions({
	prediction,
	selectedOption,
	setSelectedOption,
	fadeDelay,
}: Readonly<Props>) {
	const { room } = useRoomContext();
	const { data: bets = [] } = useBets(room.id, prediction?.id);

	// totalBetAmount per option
	const betAmountPerOption: Record<string, number> = {};
	for (const bet of bets) {
		if (!betAmountPerOption[bet.option_id]) {
			betAmountPerOption[bet.option_id] = 0;
		}
		betAmountPerOption[bet.option_id] += bet.amount;
	}

	const totalBetAmount = bets.reduce((sum, bet) => sum + bet.amount, 0);

	return (
		<>
			{prediction ? (
				<div className={`w-full`}>
					<RadioGroup
						className={OPTIONS_LIST}
						value={selectedOption}
						onValueChange={setSelectedOption}
						// A placed bet can switch to another option until the deadline.
						disabled={prediction.status !== "draft"}
					>
						{prediction.prediction_options.map((option, index) => (
							<Reveal
								key={option.id}
								index={index}
								delay={(fadeDelay ?? 0) / 1000}
							>
								<FieldLabel
									className={`${OPTION_SHELL} cursor-pointer bg-background ${prediction.winning_option_id === option.id ? "border-win" : ""} `}
								>
									<Field orientation={"horizontal"}>
										<RadioGroupItem
											value={option.id}
											id={option.id}
										/>
										<FieldContent>
											<FieldTitle
												className={`w-full flex justify-between items-start`}
											>
												<span className={`text-lg`}>
													{option.label}
												</span>
												{(() => {
													const optionTextClass =
														prediction.winning_option_id
															? prediction.winning_option_id ===
																option.id
																? "text-win"
																: "text-loss"
															: useOptionColor(
																	option.id,
																);
													return (
														<p
															className={`flex flex-col`}
														>
															<span
																className={`text-lg text-right ${optionTextClass}`}
															>
																{totalBetAmount
																	? (
																			((betAmountPerOption[
																				option
																					.id
																			] ??
																				0) /
																				totalBetAmount) *
																			100
																		).toFixed(0)
																	: 0}
																%
															</span>
															<span
																className={`text-xs text-muted-foreground text-right`}
															>
																{(
																	betAmountPerOption[
																		option.id
																	] ?? 0
																).toLocaleString()}{" "}
																pts
															</span>
														</p>
													);
												})()}
											</FieldTitle>
											{/* A div, not FieldDescription (<p>): Progress renders block elements. */}
											<div className='w-full'>
												{prediction.winning_option_id ? (
													<Progress
														value={
															totalBetAmount
																? (betAmountPerOption[
																		option.id
																	] /
																		totalBetAmount) *
																	100
																: 0
														}
														className={`${prediction.winning_option_id === option.id ? "bg-win/30" : "bg-muted-foreground/50"}`}
														indicatorBgClassName={`${option.id === prediction.winning_option_id ? "bg-win" : "bg-muted-foreground"} `}
													/>
												) : (
													<Progress
														value={
															totalBetAmount
																? (betAmountPerOption[
																		option.id
																	] /
																		totalBetAmount) *
																	100
																: 0
														}
														className={`${selectedOption !== option.id && "[&>div]:bg-muted-foreground bg-muted-foreground/50"}`}
													/>
												)}
											</div>
										</FieldContent>
									</Field>
								</FieldLabel>
							</Reveal>
						))}
					</RadioGroup>
				</div>
			) : (
				<SkeletonList
					count={2}
					className={`w-full ${OPTIONS_LIST}`}
					renderItem={() => <PredictionOptionSkeleton />}
				/>
			)}
		</>
	);
}
