import { useRoomContext } from "@/shared/lib/roomContext";
import {
	CloseWithoutResultDialog,
	ResolvePredictionDrawer,
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
	SettingsIcon,
	UsersIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";

// One place for staff work: results to reveal, then predictions still open
// for picks. Resolvers and up.
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

function LinkRow({
	to,
	icon,
	label,
}: Readonly<{ to: string; icon: ReactNode; label: string }>) {
	return (
		<Link
			to={to}
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
