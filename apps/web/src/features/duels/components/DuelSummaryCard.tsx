import { cn } from "@/shared/lib/utils";
import type { DuelSummary } from "@/features/duels/types/types";
import type { PredictionStatus } from "@/features/predictions";
import {
	ChevronRightIcon,
	CoinsIcon,
	LandmarkIcon,
	SwordsIcon,
	TrophyIcon,
	UsersIcon,
} from "lucide-react";
import { BackgroundGradient } from "@/shared/ui/animations/background-gradient";

type DuelSummaryCardProps = {
	summary: DuelSummary;
	predictionStatus: PredictionStatus;
	onClick: () => void;
};

export function DuelSummaryCard({
	summary,
	predictionStatus,
	onClick,
}: Readonly<DuelSummaryCardProps>) {
	const { highlight, subtitle, title, glowClass } = getDuelCardContent(
		summary,
		predictionStatus,
	);

	const hasActiveDuels = summary.activeDuels > 0;

	const cardContent = (
		<button
			type='button'
			onClick={onClick}
			className={cn(
				"group relative overflow-hidden rounded-2xl w-full max-w-md mx-auto",
				"border border-border/50",
				"bg-card",
				"shadow-xl shadow-black/30",
				"transition-all duration-300",
				"before:absolute before:inset-0 before:content-['']",
				glowClass,
				highlight &&
					"hover:border-accent/40 hover:shadow-[0_0_30px] hover:shadow-accent/12",
			)}
		>
			{/* background glow */}
			<div className='absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--color-accent),transparent_60%)] opacity-10' />
			<div className='absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,var(--color-primary),transparent_65%)] opacity-8' />

			<div className='relative p-5'>
				{/* HEADER */}
				<div className='flex items-start'>
					<div className='flex-1 flex items-center gap-2'>
						<SwordsIcon className='size-5 text-accent' />
						<h3 className='font-semibold text-lg'>Duels</h3>
					</div>
					<div className='flex gap-2 text-sm'>
						<Stat
							icon={
								<UsersIcon
									size={16}
									className={`text-accent`}
								/>
							}
						>
							{summary.uniqueParticipants}
						</Stat>
						<Stat
							icon={
								<SwordsIcon
									size={16}
									className={`text-primary`}
								/>
							}
						>
							{summary.totalDuels}
						</Stat>
					</div>
				</div>
				<p className='mt-1 text-xs text-muted-foreground text-left'>
					{subtitle}
				</p>

				{/* MAIN STATS */}
				<div className='grid grid-cols-2 gap-3 mt-4'>
					<SummaryBox
						icon={<CoinsIcon className='text-accent size-5' />}
						label='Stake'
						value={summary.totalStake}
					/>

					{predictionStatus === "revealed" ? (
						<SummaryBox
							icon={<TrophyIcon className='text-win size-5' />}
							label='Resolved'
							value={summary.resolvedDuels}
						/>
					) : (
						<SummaryBox
							icon={
								<LandmarkIcon className='text-activity size-5' />
							}
							label='Escrow'
							value={summary.totalEscrow}
						/>
					)}
				</div>

				{/* divider */}
				{/* <div className='my-4 h-px bg-linear-to-r from-transparent via-white/10 to-transparent' /> */}

				{/* CTA */}
				<div className='flex items-center justify-end mt-4'>
					<div className='flex items-center gap-2 text-accent font-medium text-sm'>
						{title}
						<ChevronRightIcon className='size-4 transition-transform group-hover:translate-x-1' />
					</div>
				</div>
			</div>
		</button>
	);

	if (hasActiveDuels) {
		return <BackgroundGradient animate>{cardContent}</BackgroundGradient>;
	}

	return cardContent;
}

interface StatProps {
	icon: React.ReactNode;
	children: React.ReactNode;
}

function Stat({ icon, children }: Readonly<StatProps>) {
	return (
		<div className='flex items-center gap-1 rounded-full bg-card/40 px-2 py-1'>
			<span className='text-muted-foreground'>{icon}</span>
			<span className='font-medium'>{children}</span>
		</div>
	);
}

interface SummaryBoxProps {
	icon: React.ReactNode;
	label: string;
	value: number;
}

function SummaryBox({ icon, label, value }: Readonly<SummaryBoxProps>) {
	return (
		<div className='rounded-xl border border-border/50 bg-card/40 p-3'>
			<div className='flex items-center justify-center gap-2'>
				{icon}

				<span className='text-xl font-semibold'>
					{value.toLocaleString()}
				</span>
			</div>

			<p className='mt-1 text-xs uppercase tracking-wide text-muted-foreground'>
				{label}
			</p>
		</div>
	);
}

type DuelCardState =
	| "draft-create"
	| "waiting-opponent"
	| "queued"
	| "active"
	| "completed"
	| "idle";

interface DuelCardContent {
	state: DuelCardState;
	highlight: boolean;
	glowClass: string;
	subtitle: string;
	title: string;
	description: string;
}

function getDuelCardContent(
	summary: DuelSummary,
	predictionStatus: PredictionStatus,
): DuelCardContent {
	const predictionEnded =
		predictionStatus === "revealed" ||
		predictionStatus === "cancelled" ||
		predictionStatus === "no_result";

	const hasNoDuels = summary.totalDuels === 0;

	if (hasNoDuels && predictionEnded) {
		return {
			state: "completed",
			highlight: false,
			glowClass: "",
			subtitle: "No duels were created",
			title: "Duels closed",
			description: "See previous duels and outcomes.",
		};
	}

	if (predictionEnded) {
		return {
			state: "completed",
			highlight: false,
			glowClass: "",
			subtitle: "Arena closed",
			title: "View duel history",
			description: "See previous duels and outcomes.",
		};
	}

	if (summary.currentPlayerHasCreatedDuel) {
		return {
			state: "waiting-opponent",
			highlight: true,
			glowClass:
				"before:bg-[radial-gradient(circle_at_bottom_right,var(--color-primary),transparent_45%)] before:opacity-12",
			subtitle: "Your duel is waiting",
			title: "Check your duel",
			description: "Share it or wait for someone to accept.",
		};
	}

	if (summary.currentPlayerQueuedCount > 0) {
		return {
			state: "queued",
			highlight: true,
			glowClass:
				"before:bg-[radial-gradient(circle_at_bottom_right,var(--color-activity),transparent_45%)] before:opacity-12",
			subtitle: "Getting matched",
			title: "View matchmaking",
			description: "You're currently queued for a duel.",
		};
	}

	if (summary.activeDuels > 0) {
		return {
			state: "active",
			highlight: false,
			glowClass:
				"before:bg-[radial-gradient(circle_at_bottom_right,var(--color-win),transparent_45%)] before:opacity-10",
			subtitle: "Duels are happening",
			title: "Browse duels",
			description: "Watch or challenge active players.",
		};
	}

	if (summary.currentPlayerCanCreate) {
		return {
			state: "draft-create",
			highlight: predictionStatus === "draft",
			glowClass:
				"before:bg-[radial-gradient(circle_at_bottom_right,var(--color-accent),transparent_45%)] before:opacity-14",
			subtitle: "No duel yet",
			title: "Create the first duel",
			description: "Challenge someone before betting closes.",
		};
	}

	return {
		state: "idle",
		highlight: false,
		glowClass: "",
		subtitle: "Find rivals or challenge friends",
		title: "Browse duels",
		description: "See ongoing matches.",
	};
}
