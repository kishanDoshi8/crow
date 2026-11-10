import { CheckCircle2Icon, InfoIcon } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useResolvePredictions } from "@/features/predictions/hooks/prediction";
import { useManageQueue, useRoomRole, type ManageQueueItem } from "@/features/rooms";
import { describeDeadline } from "@/shared/lib/deadline";
import { useAppNavigation } from "@/shared/lib/navigation";
import { useRoomContext } from "@/shared/lib/roomContext";
import { cn } from "@/shared/lib/utils";
import {
	Alert,
	AlertDescription,
	Button,
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Skeleton,
	Spinner,
} from "@/shared/ui";

// What staff picked for one prediction: the winning option's id, or one of
// the two ways to close it with everyone's points returned.
type Choice = string;
const NO_RESULT = "no_result";
const CANCEL = "cancel";

type Group = {
	key: string;
	// The event's name; null for predictions made on their own.
	title: string | null;
	items: ManageQueueItem[];
};

// Predictions made for the same event sit together, in the order the queue
// gives (oldest deadline first); the rest follow in one group.
function groupByEvent(items: ManageQueueItem[]) {
	const groups: Group[] = [];
	const loose: ManageQueueItem[] = [];
	for (const item of items) {
		if (!item.event_id) {
			loose.push(item);
			continue;
		}
		const group = groups.find((g) => g.key === item.event_id);
		if (group) group.items.push(item);
		else groups.push({ key: item.event_id, title: item.event_title, items: [item] });
	}
	if (loose.length > 0) groups.push({ key: "none", title: null, items: loose });
	return groups;
}

// Staff close several predictions in one go, each with its own outcome:
// winners for a finished match, or everything called off. Members get one
// notification for the lot.
export default function ResolveSeveral() {
	const { room } = useRoomContext();
	const { can } = useRoomRole(room);
	const { back } = useAppNavigation();
	const { data: queue, isPending } = useManageQueue(room.id, can.resolve);
	const { mutate: resolvePredictions, isPending: isClosing } = useResolvePredictions();
	const [choices, setChoices] = useState<Record<string, Choice>>({});
	const [reason, setReason] = useState("");
	const [isConfirmOpen, setIsConfirmOpen] = useState(false);

	if (!can.resolve) {
		return <Navigate to={`/rooms/${room.code}`} replace />;
	}

	// Locked ones can close any way; ones still open can only be cancelled.
	const items = [...(queue?.to_resolve ?? []), ...(queue?.open ?? [])];
	const groups = groupByEvent(items);
	// A prediction someone else closed meanwhile drops out of the queue.
	const chosen = items.filter((item) => choices[item.id]);
	const winners = chosen.filter((item) => choices[item.id] !== NO_RESULT && choices[item.id] !== CANCEL).length;
	const noResults = chosen.filter((item) => choices[item.id] === NO_RESULT).length;
	const cancelled = chosen.filter((item) => choices[item.id] === CANCEL).length;
	const summary = [
		winners ? `${winners} ${winners === 1 ? "winner" : "winners"}` : null,
		noResults ? `${noResults} no result` : null,
		cancelled ? `${cancelled} cancelled` : null,
	]
		.filter(Boolean)
		.join(" · ");

	const choose = (id: string, choice: Choice) =>
		setChoices((prev) => {
			const next = { ...prev };
			// Tapping the chosen one again clears it.
			if (next[id] === choice) delete next[id];
			else next[id] = choice;
			return next;
		});

	const chooseAll = (group: Group, choice: typeof NO_RESULT | typeof CANCEL | null) =>
		setChoices((prev) => {
			const next = { ...prev };
			for (const item of group.items) {
				if (choice === null) delete next[item.id];
				else if (choice === CANCEL || item.status === "locked") next[item.id] = choice;
			}
			return next;
		});

	const handleConfirm = () => {
		resolvePredictions(
			{
				roomId: room.id,
				results: chosen.map((item) => {
					const choice = choices[item.id];
					if (choice === NO_RESULT || choice === CANCEL) {
						return {
							prediction_id: item.id,
							outcome: choice,
							no_result_reason: reason.trim() || null,
						};
					}
					return { prediction_id: item.id, outcome: "win", winning_option_id: choice };
				}),
			},
			{
				onSuccess: ({ resolved }) => {
					setIsConfirmOpen(false);
					toast.success(`${resolved} ${resolved === 1 ? "prediction" : "predictions"} closed`, {
						description: "Members got one notification.",
						position: "top-center",
					});
					back(`/rooms/${room.code}/manage`);
				},
				onError: (error) => {
					setIsConfirmOpen(false);
					toast.error("Nothing was closed.", {
						description: error.message,
						duration: 7000,
						position: "top-center",
					});
				},
			},
		);
	};

	return (
		<div className='flex flex-1 flex-col'>
			<div className='mx-auto w-full max-w-md flex-1 space-y-6 p-4 lg:max-w-2xl lg:pt-6'>
				<p className='px-1 text-sm text-muted-foreground'>
					Pick an outcome for each prediction you want to close. Anything you leave
					alone stays as it is.
				</p>

				{isPending ? (
					<div className='space-y-3 rounded-2xl border bg-card p-3' aria-hidden='true'>
						<Skeleton className='h-4 w-2/3' />
						<Skeleton className='h-9 w-full' />
						<Skeleton className='h-4 w-1/2' />
						<Skeleton className='h-9 w-full' />
					</div>
				) : items.length === 0 ? (
					<p className='flex items-center gap-2 rounded-2xl border bg-card px-3 py-4 text-sm text-muted-foreground'>
						<CheckCircle2Icon className='size-4 text-win' />
						Nothing is open or waiting on a result.
					</p>
				) : (
					groups.map((group) => (
						<section key={group.key} className='space-y-2'>
							<div className='flex flex-wrap items-center gap-x-1 px-1'>
								{/* The name gets its own line; a match's name is the point of the group. */}
								<h2 className='w-full text-xs font-semibold uppercase tracking-wide text-muted-foreground wrap-anywhere'>
									{group.title ?? (groups.length > 1 ? "Other predictions" : "Predictions")}
								</h2>
								{group.items.some((item) => item.status === "locked") ? (
									<Button variant='ghost' size='xs' className='-ml-2' onClick={() => chooseAll(group, NO_RESULT)}>
										No result all
									</Button>
								) : null}
								<Button
									variant='ghost'
									size='xs'
									className={group.items.some((item) => item.status === "locked") ? undefined : "-ml-2"}
									onClick={() => chooseAll(group, CANCEL)}
								>
									Cancel all
								</Button>
								{group.items.some((item) => choices[item.id]) ? (
									<Button variant='ghost' size='xs' onClick={() => chooseAll(group, null)}>
										Clear
									</Button>
								) : null}
							</div>
							<div className='divide-y rounded-2xl border bg-card'>
								{group.items.map((item) => (
									<PredictionRow
										key={item.id}
										item={item}
										choice={choices[item.id]}
										onChoose={(choice) => choose(item.id, choice)}
									/>
								))}
							</div>
						</section>
					))
				)}

				{noResults + cancelled > 0 ? (
					<div className='space-y-1.5'>
						<label htmlFor='close-reason' className='px-1 text-xs font-medium text-muted-foreground'>
							Reason for the ones without a winner (optional)
						</label>
						<Input
							id='close-reason'
							placeholder='e.g. Match abandoned'
							value={reason}
							maxLength={50}
							onChange={(e) => setReason(e.target.value)}
						/>
					</div>
				) : null}
			</div>

			<div className='sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'>
				<div className='mx-auto flex w-full max-w-md items-center gap-3 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:max-w-2xl'>
					<p className='min-w-0 flex-1 text-xs text-muted-foreground' aria-live='polite'>
						{chosen.length === 0 ? "Nothing picked yet" : summary}
					</p>
					<Button
						variant='linear'
						size='lg'
						disabled={chosen.length === 0}
						onClick={() => setIsConfirmOpen(true)}
					>
						Close {chosen.length || ""} {chosen.length === 1 ? "prediction" : "predictions"}
					</Button>
				</div>
			</div>

			<Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
				<DialogContent className='mx-auto sm:max-w-md'>
					<DialogHeader>
						<DialogTitle>
							Close {chosen.length} {chosen.length === 1 ? "prediction" : "predictions"}?
						</DialogTitle>
						<DialogDescription>
							Points move straight away and members get one notification. This
							can't be undone here.
						</DialogDescription>
					</DialogHeader>
					<ul className='max-h-64 divide-y overflow-y-auto rounded-xl border text-sm'>
						{chosen.map((item) => (
							<li key={item.id} className='flex items-baseline gap-3 px-3 py-2'>
								<span className='min-w-0 flex-1 truncate'>{item.title}</span>
								<span className='shrink-0 font-semibold'>
									{choices[item.id] === NO_RESULT
										? "No result"
										: choices[item.id] === CANCEL
											? "Cancelled"
											: (item.options.find((o) => o.id === choices[item.id])?.label ?? "")}
								</span>
							</li>
						))}
					</ul>
					{noResults + cancelled > 0 ? (
						<Alert>
							<InfoIcon />
							<AlertDescription>
								Without a winner, every pick is returned and no one wins or loses points.
							</AlertDescription>
						</Alert>
					) : null}
					<DialogFooter className='gap-4'>
						<DialogClose asChild>
							<Button variant='outline' size='lg' disabled={isClosing}>
								Back
							</Button>
						</DialogClose>
						<Button size='lg' onClick={handleConfirm} disabled={isClosing}>
							{isClosing && <Spinner />}
							Confirm
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

const CHIP =
	"min-h-9 max-w-full rounded-full border px-3 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const CHIP_IDLE = "border-border hover:bg-muted/60";
// A picked winner is green (an outcome); a cancellation is red. Primary
// would read the same as destructive in the dark theme.

function PredictionRow({
	item,
	choice,
	onChoose,
}: Readonly<{
	item: ManageQueueItem;
	choice: Choice | undefined;
	onChoose: (choice: Choice) => void;
}>) {
	const isLocked = item.status === "locked";
	const picks = `${item.bet_count} ${item.bet_count === 1 ? "pick" : "picks"}`;
	const when = describeDeadline(new Date(item.deadline)).relative;

	return (
		<div className='space-y-2.5 px-3 py-3'>
			<div>
				<p className='text-sm font-medium wrap-anywhere'>{item.title}</p>
				<p className='text-xs text-muted-foreground'>
					{isLocked ? `Locked ${when}` : `Still open · closes ${when}`} · {picks}
				</p>
			</div>
			{isLocked ? (
				<div role='group' aria-label={`Winner of ${item.title}`} className='flex flex-wrap gap-1.5'>
					{item.options.map((option) => (
						<button
							key={option.id}
							type='button'
							aria-pressed={choice === option.id}
							onClick={() => onChoose(option.id)}
							className={cn(
								CHIP,
								choice === option.id
									? "border-win bg-win/10 font-semibold text-win"
									: CHIP_IDLE,
							)}
						>
							{option.label}
						</button>
					))}
				</div>
			) : null}
			<div className='flex flex-wrap gap-1.5'>
				{isLocked ? (
					<button
						type='button'
						aria-pressed={choice === NO_RESULT}
						onClick={() => onChoose(NO_RESULT)}
						className={cn(
							CHIP,
							"text-muted-foreground",
							choice === NO_RESULT
								? "border-foreground/50 bg-secondary font-semibold text-foreground"
								: CHIP_IDLE,
						)}
					>
						No result
					</button>
				) : null}
				<button
					type='button'
					aria-pressed={choice === CANCEL}
					onClick={() => onChoose(CANCEL)}
					className={cn(
						CHIP,
						"text-muted-foreground",
						choice === CANCEL
							? "border-destructive bg-destructive/10 font-semibold text-destructive"
							: CHIP_IDLE,
					)}
				>
					Cancel
				</button>
			</div>
		</div>
	);
}
