import { Badge, Button, Skeleton } from "@/shared/ui";
import { usePredictionDuelRealtime } from "@/features/rooms";
import { usePredictionDuelSummary, usePredictionDuels } from "@/features/duels/hooks/duel";
import { usePrediction } from "@/features/predictions";
import { useRoomContext } from "@/shared/lib/roomContext";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DuelCard } from "@/features/duels/components/DuelCard";
import { CircleQuestionMarkIcon, SwordsIcon } from "lucide-react";
import DuelPredictionHeader from "@/features/duels/components/DuelPredictionHeader";
import { DuelsHowItWorksDialog } from "@/features/onboarding";
import React from "react";

export function PredictionDuelsPage() {
	const [isHowDuelsDialogOpen, setIsHowDuelsDialogOpen] =
		React.useState(false);
	const { predictionId } = useParams<{ predictionId: string }>();
	const { room } = useRoomContext();
	const navigate = useNavigate();

	const { data: prediction } = usePrediction(room.id, predictionId);
	const { data: duels = [], isPending: isDuelsLoading } = usePredictionDuels(
		room.id,
		predictionId,
	);
	const { data: duelSummary } = usePredictionDuelSummary(
		room.id,
		predictionId,
	);

	usePredictionDuelRealtime(room.id, predictionId ?? null);

	const isDuelOpen = prediction?.status === "draft";
	const canCreateDuel =
		isDuelOpen && (duelSummary?.currentPlayerCanCreate ?? true);

	const duelListContent = (() => {
		if (isDuelsLoading) {
			return (
				<>
					<Skeleton className='h-32 w-full' />
					<Skeleton className='h-32 w-full' />
				</>
			);
		}

		if (duels.length === 0) {
			return (
				<div className='rounded-xl border border-dashed border-border bg-card p-5 text-center space-y-3'>
					<div className='mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent/10'>
						<SwordsIcon className='h-5 w-5 text-accent' />
					</div>
					<div className='space-y-1'>
						<p className='text-sm font-medium'>
							{isDuelOpen
								? "No open duels yet"
								: "Duels are closed"}
						</p>
						<p className='text-sm text-muted-foreground'>
							{isDuelOpen
								? "Be the first to challenge someone on this prediction."
								: "This prediction is no longer accepting new duels."}
						</p>
					</div>
					{canCreateDuel && (
						<Button variant='outline' asChild className='w-full'>
							<Link to='create'>Create the first duel</Link>
						</Button>
					)}
				</div>
			);
		}

		return duels.map((duel) => <DuelCard key={duel.id} duel={duel} />);
	})();

	return (
		<div className='max-w-md mx-auto'>
			<div className={`px-4 pb-6 pt-4 space-y-4`}>
				<DuelPredictionHeader room={room} prediction={prediction} />
				<div className='mt-4 rounded-xl border border-border bg-card p-4 space-y-2'>
					<div className='flex items-center justify-between'>
						<div className={`flex items-center gap-2`}>
							<SwordsIcon className='h-6 w-6 text-accent' />
							<h2 className='text-2xl font-semibold'>Duels</h2>
							<button
								type='button'
								onClick={() => setIsHowDuelsDialogOpen(true)}
								className='inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-help'
								aria-label='How Duels Work'
								title='How Duels Work'
							>
								<CircleQuestionMarkIcon className='h-4 w-4' />
							</button>
						</div>
						<Badge variant={isDuelOpen ? "default" : "secondary"}>
							{isDuelOpen ? "Active" : "Closed"}
						</Badge>
					</div>
					<p className='text-sm text-muted-foreground'>
						Head-to-head challenges with other players. Winner takes
						the full pot when the match resolves.
					</p>
				</div>
				<section className='space-y-3 pb-20'>
					<h3 className='text-lg font-semibold'>Open Duels</h3>
					{duelListContent}
				</section>
			</div>

			{canCreateDuel && (
				<div className='fixed inset-x-0 bottom-0 z-50 p-4 bg-card'>
					<div className='w-full max-w-md mx-auto'>
						<Button
							variant='linear'
							size='lg'
							asChild
							className='w-full mx-auto font-bold shadow-lg text-foreground'
						>
							<Link to='create'>
								<SwordsIcon className='ml-2' />
								Create Duel
							</Link>
						</Button>
					</div>
				</div>
			)}

			{isDuelOpen &&
				!canCreateDuel &&
				duelSummary &&
				!duelSummary.currentPlayerHasCreatedDuel && (
					<div className='fixed inset-x-0 bottom-0 z-50 p-4 bg-card'>
						<div className='w-full max-w-md mx-auto'>
							<Button
								variant='outline'
								size='lg'
								onClick={() => {
									navigate(
										`/rooms/${room.code}/predictions/${predictionId}`,
										{ replace: true },
									);
								}}
								className='w-full mx-auto font-bold shadow-lg text-foreground'
							>
								Bet 100+ points to unlock duels
							</Button>
						</div>
					</div>
				)}

			{duelSummary?.currentPlayerHasCreatedDuel && (
				<div className='fixed inset-x-0 bottom-0 z-50 p-4 bg-card'>
					<div className='w-full max-w-md mx-auto'>
						<Button
							variant='outline'
							size='lg'
							onClick={() => {
								navigate(
									`/rooms/${room.code}/predictions/${predictionId}/duels/${duelSummary.currentPlayerCreatedDuelId}`,
								);
							}}
							className='w-full mx-auto font-bold shadow-lg text-foreground'
						>
							View Your Duel
						</Button>
					</div>
				</div>
			)}

			<DuelsHowItWorksDialog
				open={isHowDuelsDialogOpen}
				onOpenChange={setIsHowDuelsDialogOpen}
			/>
		</div>
	);
}
