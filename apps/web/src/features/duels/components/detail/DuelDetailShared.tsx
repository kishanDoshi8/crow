import { cn } from "@/shared/lib/utils";
import {
	Ban,
	Check,
	Hourglass,
	Lock,
	RotateCw,
	ShieldIcon,
	UserIcon,
} from "lucide-react";
import type { DuelQueueStatus } from "@/features/duels/types/types";
import {
	fmtPts,
	initials,
	queueStatusLabel,
	queueStatusTone,
} from "@/features/duels/lib/duelDetailUtils";
import type { ReactNode } from "react";

export function PickChip({
	label,
	hidden = false,
}: Readonly<{ label: string; hidden?: boolean }>) {
	if (hidden) {
		return (
			<span className='inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>
				<Lock className='size-3' />
				Hidden
			</span>
		);
	}

	return (
		<span className='inline-flex items-center rounded-full border border-border bg-secondary px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground'>
			{label}
		</span>
	);
}

export function DuelAvatarTile({
	name,
	hidden = false,
	ring = false,
	size = "md",
}: Readonly<{
	name: string | null | undefined;
	hidden?: boolean;
	ring?: boolean;
	size?: "sm" | "md" | "lg" | "xl";
}>) {
	const sizeClass = {
		sm: "size-9 text-xs",
		md: "size-12 text-sm",
		lg: "size-14 text-base",
		xl: "size-16 text-lg",
	}[size];

	return (
		<div
			className={cn(
				"relative grid place-items-center rounded-2xl bg-linear-to-br from-primary/35 to-accent/35 text-foreground font-semibold",
				sizeClass,
				ring && "ring-2 ring-win ring-offset-2 ring-offset-background",
			)}
		>
			{hidden ? (
				<Lock className='size-5' aria-hidden='true' />
			) : (
				initials(name)
			)}
		</div>
	);
}

export function SectionLabel({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<p className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>
			{children}
		</p>
	);
}

export function VsMatchup({
	leftName,
	rightName,
	leftPickLabel,
	rightPickLabel,
	leftPickHidden = false,
	rightPickHidden = false,
	leftRing = false,
	rightRing = false,
	stake,
	rightEmptyLabel,
	rightEmptyLabel2 = "No Match",
}: Readonly<{
	leftName: string | null | undefined;
	rightName: string | null | undefined;
	leftPickLabel: string;
	rightPickLabel: string;
	leftPickHidden?: boolean;
	rightPickHidden?: boolean;
	leftRing?: boolean;
	rightRing?: boolean;
	stake: number;
	rightEmptyLabel?: string;
	rightEmptyLabel2?: string;
}>) {
	return (
		<div className='rounded-2xl border border-border bg-card p-5'>
			<div className='relative grid grid-cols-[1fr_auto_1fr] items-center gap-3'>
				<div className='flex flex-col items-center gap-2 text-center'>
					<DuelAvatarTile
						name={leftName}
						ring={leftRing}
						size='lg'
						hidden={leftPickHidden && !leftName}
					/>
					<p className='line-clamp-1 text-sm font-semibold'>
						{leftName ?? "Challenger"}
					</p>
					<PickChip label={leftPickLabel} hidden={leftPickHidden} />
				</div>

				<div className='flex flex-col items-center gap-2'>
					<span className='rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-bold tracking-wider'>
						VS
					</span>
					<p className='text-center text-xs font-bold uppercase tracking-wider text-muted-foreground'>
						Stake
					</p>
					<p className='font-mono text-2xl font-bold tabular-nums text-win'>
						{fmtPts(stake)}
					</p>
				</div>

				<div className='flex flex-col items-center gap-2 text-center'>
					{rightEmptyLabel ? (
						<div className='grid size-14 place-items-center rounded-2xl border border-dashed border-border bg-secondary/50 text-muted-foreground'>
							<UserIcon className='size-6' aria-hidden='true' />
						</div>
					) : (
						<DuelAvatarTile
							name={rightName}
							ring={rightRing}
							size='lg'
							hidden={rightPickHidden && !rightName}
						/>
					)}
					<p className='line-clamp-1 text-sm font-semibold'>
						{rightEmptyLabel ?? rightName ?? "Opponent"}
					</p>
					{rightEmptyLabel ? (
						<span className='inline-flex items-center rounded-full border border-border bg-secondary px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>
							{rightEmptyLabel2}
						</span>
					) : (
						<PickChip
							label={rightPickLabel}
							hidden={rightPickHidden}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

export function EscrowCard({ amount }: Readonly<{ amount: number }>) {
	return (
		<div className='rounded-2xl border border-border bg-secondary/40 p-4'>
			<div className='flex gap-4 items-center'>
				<div className='bg-accent/30 rounded-2xl border border-accent p-3'>
					<ShieldIcon className='text-accent' />
				</div>
				<div className='flex-1'>
					<p className='text-sm text-muted-foreground tracking-wider uppercase'>
						In Escrow
					</p>
					<p className='text-2xl font-bold'>{fmtPts(amount)} pts</p>
				</div>
				<span className='flex items-center gap-2 rounded-full bg-secondary px-2 py-1 font-semibold text-sm tracking-wider text-accent'>
					<Lock size={14} />
					Held
				</span>
			</div>
		</div>
	);
}

export function StatusBanner({
	icon,
	title,
	subtitle,
	variant = "neutral",
	extra,
}: Readonly<{
	icon: ReactNode;
	title: string;
	subtitle: string;
	variant?: "neutral" | "primary" | "win";
	extra?: ReactNode;
}>) {
	const styles = {
		neutral: "bg-secondary/50",
		primary: "bg-primary/15 border-primary/30",
		win: "bg-win/15 border-win/30",
	}[variant];

	return (
		<div className={cn("rounded-2xl border border-border p-5", styles)}>
			<div className='mb-2 inline-flex rounded-full border border-border bg-card/80 p-2'>
				{icon}
			</div>
			<h2 className='text-xl font-semibold'>{title}</h2>
			<p className='mt-1 text-sm text-muted-foreground'>{subtitle}</p>
			{extra ? <div className='mt-4'>{extra}</div> : null}
		</div>
	);
}

export function StickyActionBar({
	children,
}: Readonly<{ children: ReactNode }>) {
	return (
		<div className='fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 p-4 backdrop-blur-xl'>
			<div className='mx-auto flex w-full max-w-md flex-col gap-2'>
				{children}
			</div>
		</div>
	);
}

export function QueueStatusIcon({
	status,
}: Readonly<{ status: DuelQueueStatus }>) {
	if (status === "matched") {
		return <Check className='size-3' aria-hidden='true' />;
	}
	if (status === "refunded") {
		return <RotateCw className='size-3' aria-hidden='true' />;
	}
	if (status === "cancelled") {
		return <Ban className='size-3' aria-hidden='true' />;
	}
	return <Hourglass className='size-3 animate-pulse' aria-hidden='true' />;
}

export function QueueStatusChip({
	status,
}: Readonly<{ status: DuelQueueStatus }>) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider",
				queueStatusTone(status),
			)}
		>
			<QueueStatusIcon status={status} />
			{queueStatusLabel(status)}
		</span>
	);
}
