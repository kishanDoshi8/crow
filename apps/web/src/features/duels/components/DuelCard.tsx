import { Avatar, AvatarFallback, Badge } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { usePlayer } from "@/features/home";
import type { Duel } from "@/features/duels/types/types";
import { ChevronRightIcon, LockIcon, UsersIcon } from "lucide-react";
import { Link } from "react-router-dom";

type DuelCardProps = {
	duel: Duel;
};

const STATUS_LABEL: Record<Duel["status"], string> = {
	created: "Created",
	queued: "Queued",
	matched: "Matched",
	resolved: "Resolved",
	cancelled: "Cancelled",
	expired: "Expired",
};

const STATUS_BADGE_STYLE: Record<Duel["status"], string> = {
	created: "bg-primary/15 text-primary border-primary/30",
	queued: "bg-activity/15 text-activity border-activity/30",
	matched: "bg-matched/15 text-matched border-matched/30",
	resolved: "bg-win/15 text-win border-win/30",
	cancelled: "bg-destructive/15 text-destructive border-destructive/30",
	expired: "bg-muted text-muted-foreground border-border",
};

export function DuelCard({ duel }: Readonly<DuelCardProps>) {
	const { data: player } = usePlayer();
	if (!player) return null;

	const isSelf = duel.challenger.id === player.id;
	let backgroundClass = "from-activity/15";
	if (duel.status === "cancelled") {
		backgroundClass = "from-destructive/15 border-destructive/50";
	} else if (isSelf) {
		backgroundClass = "from-win/15 border-win/30";
	}
	const initials = duel.challenger.username
		? duel.challenger.username.slice(0, 2).toUpperCase()
		: "??";

	return (
		<div
			className={`rounded-xl border border-border bg-linear-to-br ${backgroundClass} to-card/20 p-4`}
		>
			<div className={`flex items-center gap-2`}>
				<Avatar size='lg' className={cn(isSelf && "ring-1 ring-win")}>
					<AvatarFallback className='text-xs'>
						{initials}
					</AvatarFallback>
				</Avatar>
				<div className={`flex-1`}>
					<p className='flex items-center text-foreground font-semibold text-lg'>
						{duel.challenger.username ?? "Anonymous Challenger"}
						{duel.status === "resolved" &&
							duel.winner?.id === duel.challenger.id && (
								<Badge variant='success' className='ml-2'>
									WON
								</Badge>
							)}
						{duel.status === "resolved" &&
							duel.winner?.id === duel.opponent?.id && (
								<Badge variant='destructive' className='ml-2'>
									LOST
								</Badge>
							)}
					</p>
					{duel.opponent ? (
						<p
							className={`flex gap-1 items-center text-muted-foreground text-sm`}
						>
							<LockIcon className={`size-3`} />
							<span>
								{duel.opponent.username ?? "Anonymous Opponent"}
							</span>
						</p>
					) : (
						<p
							className={`flex gap-1 items-center text-muted-foreground text-sm`}
						>
							<UsersIcon className={`size-3`} />
							<span>{duel.queueCount}</span>
							<span>queued</span>
						</p>
					)}
				</div>
				<div>
					<p
						className={`text-2xl font-semibold text-primary text-right`}
					>
						{duel.stakeAmount.toLocaleString()}
					</p>
					<p className={`text-sm text-muted-foreground`}>STAKE</p>
				</div>
			</div>

			<div className='mt-4 flex items-center justify-between gap-3 rounded-lg border bg-card/30 p-2'>
				<span
					className={cn(
						"inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium tracking-wide",
						STATUS_BADGE_STYLE[duel.status],
					)}
				>
					{STATUS_LABEL[duel.status]}
				</span>
				<Link
					to={duel.id}
					className='ml-auto inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20'
				>
					View Duel
					<ChevronRightIcon className='ml-1 h-4 w-4' />
				</Link>
			</div>
		</div>
	);
}
