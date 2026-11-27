import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CheckIcon, PartyPopperIcon, XIcon } from "lucide-react";
import { useNextUnpicked } from "@/features/predictions";
import { usePlayer } from "@/features/home";
import { useCurrentSeries } from "@/features/series";
import {
	type ChecklistStep,
	type ChecklistStepId,
	useChecklistMemory,
	useRoomChecklist,
} from "@/features/rooms/hooks/useRoomChecklist";
import type { Room } from "@/features/rooms/types/types";
import { useRoomActions } from "@/shared/lib/roomActions";
import { needsHomeScreenInstall } from "@/shared/lib/pushNotifications";
import { cn } from "@/shared/lib/utils";
import { Button, Reveal } from "@/shared/ui";

// Steps that are done the moment you're in the room: shown ticked, never
// celebrated.
const DONE_ON_ARRIVAL: ChecklistStepId[] = ["joined", "created"];

type StepCopy = {
	label: string;
	detail?: string;
	action?: { label: string; to?: string; onClick?: () => void; disabled?: boolean };
};

// Getting started, on a room's Home: a short checklist for players or for
// hosts that ticks itself off. It can be hidden; the room menu brings it
// back until it's done. Once everything's ticked it says so once, then goes.
export function RoomChecklist({ room, isHost }: Readonly<{ room: Room; isHost: boolean }>) {
	const { steps, doneCount, total, isComplete, isLoading, players } = useRoomChecklist(room, isHost);
	const { stored, update } = useChecklistMemory(room.id);
	const { openInvite, openNotifications, openHowToPlay } = useRoomActions();
	const { data: player } = usePlayer();
	const { currentSeriesId, currentSeries } = useCurrentSeries(room.id);
	const { next } = useNextUnpicked(room.id, currentSeriesId ?? null, "", player?.id);

	const firstLook = stored.celebrated === undefined;
	const doneIds = steps.filter((step) => step.done).map((step) => step.id);
	// Ticked since this device last saw the list: celebrate those once.
	const fresh = firstLook
		? []
		: doneIds.filter((id) => !DONE_ON_ARRIVAL.includes(id) && !stored.celebrated?.includes(id));

	useEffect(() => {
		if (isLoading) return;
		if (firstLook) {
			// Someone who'd already done it all before the list existed never
			// needs to see it.
			update({ celebrated: doneIds, ...(isComplete ? { finished: true } : {}) });
			return;
		}
		if (fresh.length === 0) return;
		const timer = window.setTimeout(
			() => update({ celebrated: [...(stored.celebrated ?? []), ...fresh] }),
			1600,
		);
		return () => window.clearTimeout(timer);
	}, [isLoading, firstLook, fresh.join(","), isComplete]);

	if (isLoading || stored.hidden || stored.finished || (firstLook && isComplete)) return null;

	if (isComplete) {
		return (
			<Reveal className='mt-3 flex items-center gap-3 rounded-xl border border-win/30 bg-win/5 p-4'>
				<span className='flex size-10 shrink-0 items-center justify-center rounded-full bg-win/15 text-win motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-500'>
					<PartyPopperIcon className='size-5' aria-hidden />
				</span>
				<div className='min-w-0 flex-1'>
					<p className='font-semibold'>You're all set</p>
					<p className='text-sm text-muted-foreground'>
						{isHost
							? "Your room's ready. Keep the questions coming."
							: currentSeries
								? `Good luck in ${currentSeries.title}.`
								: "Good luck."}
					</p>
				</div>
				<Button size='sm' variant='outline' onClick={() => update({ finished: true })}>
					Done
				</Button>
			</Reveal>
		);
	}

	const copy = (step: ChecklistStep): StepCopy => {
		switch (step.id) {
			case "joined":
				return { label: `Join ${room.name}` };
			case "created":
				return { label: `Create ${room.name}` };
			case "how_it_works":
				return {
					label: "See how Crow works",
					detail: "Points, picks, and how a series is won.",
					action: { label: "Show me", onClick: openHowToPlay },
				};
			case "first_pick":
				return {
					label: "Make your first pick",
					detail: next ? `Next to close: ${next.title}` : "No questions open yet. Your host will add some.",
					action: next
						? { label: "Go", to: `/rooms/${room.code}/predictions/${next.id}` }
						: { label: "Go", disabled: true },
				};
			case "notifications":
				return {
					label: "Turn on notifications",
					detail: needsHomeScreenInstall()
						? "On iPhone, add Crow to your Home Screen first."
						: isHost
							? "Hear when results need you and when people join."
							: "Hear when questions open and results are in.",
					action: { label: "Turn on", onClick: openNotifications },
				};
			case "series":
				return {
					label: "Start a series",
					detail: "Its own points and table, like December Dominators.",
					action: { label: "Start", to: `/rooms/${room.code}/series/new` },
				};
			case "questions":
				return {
					label: "Add your first questions",
					detail: "Add matches from a competition, or write your own.",
					action: { label: "Add", to: `/rooms/${room.code}/manage/fixtures` },
				};
			case "players":
				return {
					label: "Get 3 players in",
					detail: `${players} so far. Share the invite in your group chat.`,
					action: { label: "Invite", onClick: openInvite },
				};
		}
	};

	const firstTodo = steps.find((step) => !step.done)?.id;

	return (
		<Reveal className='mt-3 rounded-xl border bg-card p-4 text-card-foreground'>
			<div className='flex items-start justify-between gap-3'>
				<div>
					<h2 className='font-semibold'>{isHost ? "Set up your room" : "Get started"}</h2>
					<p className='text-xs text-muted-foreground tabular-nums'>
						{doneCount} of {total} done
					</p>
				</div>
				<Button
					variant='ghost'
					size='icon-sm'
					className='-mr-1.5 -mt-1 text-muted-foreground'
					aria-label='Hide for now'
					title='Hide for now. The room menu brings it back.'
					onClick={() => update({ hidden: true })}
				>
					<XIcon />
				</Button>
			</div>

			{/* A segment per step, filled as each is done. */}
			<div className='mt-3 flex gap-1' aria-hidden='true'>
				{steps.map((step) => (
					<span
						key={step.id}
						className={cn(
							"h-1 flex-1 rounded-full transition-colors duration-500 motion-reduce:transition-none",
							step.done ? "bg-win" : "bg-muted-foreground/25",
						)}
					/>
				))}
			</div>

			<ol className='mt-2 flex flex-col'>
				{steps.map((step) => {
					const { label, detail, action } = copy(step);
					const isFresh = fresh.includes(step.id);
					return (
						<li key={step.id} className='flex min-h-12 items-center gap-3 py-2'>
							<span
								className={cn(
									"relative flex size-6 shrink-0 items-center justify-center rounded-full",
									step.done ? "bg-win text-background" : "ring-[1.5px] ring-inset ring-muted-foreground/50",
									isFresh && "motion-safe:animate-in motion-safe:zoom-in-0 motion-safe:duration-500",
								)}
								aria-hidden='true'
							>
								{step.done ? <CheckIcon className='size-4' strokeWidth={3} /> : null}
								{isFresh ? (
									<span className='absolute inset-0 rounded-full bg-win/60 motion-safe:animate-ping motion-reduce:hidden' />
								) : null}
							</span>
							<span className='min-w-0 flex-1'>
								<span className={cn("block text-sm", step.done ? "text-muted-foreground" : "font-medium")}>
									{label}
									<span className='sr-only'>{step.done ? ", done" : ", to do"}</span>
								</span>
								{!step.done && detail ? (
									<span className='block truncate text-xs text-muted-foreground'>{detail}</span>
								) : null}
							</span>
							{!step.done && action ? (
								action.to && !action.disabled ? (
									<Button size='sm' variant={step.id === firstTodo ? "linear" : "outline"} asChild>
										<Link to={action.to}>{action.label}</Link>
									</Button>
								) : (
									<Button
										size='sm'
										variant={step.id === firstTodo ? "linear" : "outline"}
										onClick={action.onClick}
										disabled={action.disabled}
									>
										{action.label}
									</Button>
								)
							) : null}
						</li>
					);
				})}
			</ol>
		</Reveal>
	);
}
