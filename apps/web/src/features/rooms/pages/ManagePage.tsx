import { useRoomContext } from "@/shared/lib/roomContext";
import {
	CloseWithoutResultDialog,
	ResolvePredictionDrawer,
	ScheduledActionDialog,
} from "@/features/predictions";
import { useManageQueue } from "@/features/rooms/hooks/staff";
import { useRoomRole } from "@/features/rooms/hooks/useRoomRole";
import type { ManageQueueItem } from "@/features/rooms/types/types";
import { describeDeadline } from "@/shared/lib/deadline";
import { Button, Skeleton } from "@/shared/ui";
import {
	CheckCircle2Icon,
	ChevronRightIcon,
	PencilIcon,
	PlusIcon,
	SettingsIcon,
	Trash2Icon,
	UsersIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";

// One place for staff work: results to reveal, predictions still open for
// picks, and (for organizers) the ones scheduled to go live. Resolvers and up.
export default function ManagePage() {
	const { room } = useRoomContext();
	const { can } = useRoomRole(room);
	const { data: queue, isPending } = useManageQueue(room.id, can.resolve);
	const [revealing, setRevealing] = useState<ManageQueueItem | null>(null);

	if (!can.resolve) {
		return <Navigate to={`/rooms/${room.code}`} replace />;
	}

	const toResolve = queue?.to_resolve ?? [];
	const open = queue?.open ?? [];
	const scheduled = queue?.scheduled ?? [];

	return (
		<div className='mx-auto w-full max-w-md space-y-6 p-4'>
			<Section title='To reveal' count={toResolve.length}>
				{isPending ? (
					<QueueSkeleton />
				) : toResolve.length === 0 ? (
					<EmptyRow>
						<CheckCircle2Icon className='size-4 text-win' />
						All caught up. Nothing waiting on a result.
					</EmptyRow>
				) : (
					toResolve.map((item) => (
						<QueueRow
							key={item.id}
							item={item}
							roomCode={room.code}
							meta={`locked ${describeDeadline(new Date(item.deadline)).relative}`}
						>
							<Button
								variant='linear'
								size='sm'
								onClick={() => setRevealing(item)}
							>
								Reveal
							</Button>
						</QueueRow>
					))
				)}
			</Section>

			<Section title='Open for picks' count={open.length}>
				{isPending ? (
					<QueueSkeleton />
				) : open.length === 0 ? (
					<EmptyRow>No predictions are open right now.</EmptyRow>
				) : (
					open.map((item) => (
						<QueueRow
							key={item.id}
							item={item}
							roomCode={room.code}
							meta={`closes ${describeDeadline(new Date(item.deadline)).relative}`}
						>
							{can.organize ? (
								<Button
									variant='ghost'
									size='sm'
									asChild
									aria-label={`Edit ${item.title}`}
								>
									<Link
										to={`/rooms/${room.code}/predictions/${item.id}/edit`}
									>
										<PencilIcon />
									</Link>
								</Button>
							) : null}
							<CloseWithoutResultDialog
								mode='cancel'
								predictionId={item.id}
								roomId={room.id}
							>
								<Button
									variant='ghost'
									size='sm'
									className='text-destructive'
								>
									Cancel
								</Button>
							</CloseWithoutResultDialog>
						</QueueRow>
					))
				)}
			</Section>

			{can.organize ? (
				<Section title='Scheduled' count={scheduled.length}>
					{isPending ? (
						<QueueSkeleton />
					) : scheduled.length === 0 ? (
						<EmptyRow>
							Nothing scheduled. Write predictions ahead and pick when they go live.
						</EmptyRow>
					) : (
						scheduled.map((item) => (
							<ScheduledRow key={item.id} item={item} roomId={room.id} roomCode={room.code} />
						))
					)}
					<LinkRow
						to={`/rooms/${room.code}/predictions/new`}
						state={{ goLive: "later" }}
						icon={<PlusIcon className='size-4' />}
						label='Schedule a prediction'
					/>
				</Section>
			) : null}

			<Section title='Room'>
				<LinkRow
					to={`/rooms/${room.code}/members`}
					icon={<UsersIcon className='size-4' />}
					label='Members & roles'
				/>
				{can.own ? (
					<LinkRow
						to={`/rooms/${room.code}/settings`}
						icon={<SettingsIcon className='size-4' />}
						label='Room settings'
					/>
				) : null}
			</Section>

			{revealing ? (
				<ResolvePredictionDrawer
					prediction={{
						id: revealing.id,
						title: revealing.title,
						prediction_options: revealing.options.map((option) => ({
							...option,
							prediction_id: revealing.id,
							total_bet: 0,
						})),
					}}
					roomId={room.id}
					open
					onOpenChange={(nextOpen) => {
						if (!nextOpen) setRevealing(null);
					}}
				/>
			) : null}
		</div>
	);
}

function Section({
	title,
	count,
	children,
}: Readonly<{ title: string; count?: number; children: ReactNode }>) {
	return (
		<section className='space-y-2'>
			<h2 className='px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
				{title}
				{count ? ` (${count})` : ""}
			</h2>
			<div className='divide-y rounded-2xl border bg-card'>{children}</div>
		</section>
	);
}

const QUEUE_ROW = "flex items-center gap-3 px-3 py-2.5";

function QueueRow({
	item,
	roomCode,
	meta,
	children,
}: Readonly<{
	item: ManageQueueItem;
	roomCode: string;
	meta: string;
	children: ReactNode;
}>) {
	const picks = `${item.bet_count} ${item.bet_count === 1 ? "pick" : "picks"}`;
	const series = item.series_title
		? `${item.series_title}${item.series_prediction_number ? ` #${item.series_prediction_number}` : ""} · `
		: "";

	return (
		<div className={QUEUE_ROW}>
			<Link
				to={`/rooms/${roomCode}/predictions/${item.id}`}
				className='min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
			>
				<span className='block truncate text-sm font-medium'>
					{item.title}
				</span>
				<span className='block truncate text-xs text-muted-foreground'>
					{series}
					{meta} · {picks}
				</span>
			</Link>
			<div className='flex shrink-0 items-center gap-1'>{children}</div>
		</div>
	);
}

// A scheduled prediction: when it goes live, then what can be done with it
// on a line of its own, so the title and time stay readable.
function ScheduledRow({
	item,
	roomId,
	roomCode,
}: Readonly<{ item: ManageQueueItem; roomId: string; roomCode: string }>) {
	const goesLive = item.opens_at
		? `Goes live ${describeDeadline(new Date(item.opens_at)).when}`
		: "Scheduled";

	return (
		<div className='flex flex-col gap-2 px-3 py-2.5'>
			<Link
				to={`/rooms/${roomCode}/predictions/${item.id}`}
				className='min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
			>
				<span className='block truncate text-sm font-medium'>{item.title}</span>
				<span className='block truncate text-xs text-muted-foreground'>
					{goesLive}
					{item.series_title ? ` · ${item.series_title}` : ""}
				</span>
			</Link>
			<div className='flex items-center gap-1'>
				<Button variant='ghost' size='sm' asChild>
					<Link to={`/rooms/${roomCode}/predictions/${item.id}/edit`}>
						<PencilIcon />
						Edit
					</Link>
				</Button>
				<ScheduledActionDialog mode='delete' roomId={roomId} predictionId={item.id} title={item.title}>
					<Button variant='ghost' size='sm' className='text-destructive'>
						<Trash2Icon />
						Delete
					</Button>
				</ScheduledActionDialog>
				<ScheduledActionDialog mode='publish' roomId={roomId} predictionId={item.id} title={item.title}>
					<Button variant='outline' size='sm' className='ml-auto'>
						Go live now
					</Button>
				</ScheduledActionDialog>
			</div>
		</div>
	);
}

function LinkRow({
	to,
	state,
	icon,
	label,
}: Readonly<{ to: string; state?: unknown; icon: ReactNode; label: string }>) {
	return (
		<Link
			to={to}
			state={state}
			className='flex items-center gap-3 px-3 py-3 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 first:rounded-t-2xl last:rounded-b-2xl'
		>
			<span className='text-muted-foreground'>{icon}</span>
			<span className='flex-1 font-medium'>{label}</span>
			<ChevronRightIcon className='size-4 text-muted-foreground' />
		</Link>
	);
}

function EmptyRow({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<p className='flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground'>
			{children}
		</p>
	);
}

// Two queue rows: title over meta, with the row's action on the right.
function QueueSkeleton() {
	return [0, 1].map((row) => (
		<div
			key={row}
			aria-hidden='true'
			className={QUEUE_ROW}
		>
			<div className='flex min-w-0 flex-1 flex-col gap-2 py-1'>
				<Skeleton className='h-3.5 w-2/3' />
				<Skeleton className='h-3 w-1/2' />
			</div>
			<Skeleton className='h-8 w-16' />
		</div>
	));
}
