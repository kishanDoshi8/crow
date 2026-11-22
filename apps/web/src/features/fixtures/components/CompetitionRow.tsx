import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CompetitionMark } from "@/features/fixtures/components/CompetitionMark";
import { useFollowCompetition } from "@/features/fixtures/hooks";
import { cn } from "@/shared/lib/utils";

// A competition in a list: its mark and name, a line or two about it, and
// either a way in (chevron) or a Follow button.
export function CompetitionRow({
	to,
	name,
	lines,
	trailing,
}: Readonly<{ to: string; name: string; lines: ReactNode[]; trailing?: ReactNode }>) {
	return (
		<div className='flex items-center gap-3 px-3 py-3'>
			<Link
				to={to}
				className='flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
			>
				<CompetitionMark name={name} />
				<span className='min-w-0 flex-1'>
					<span className='block truncate text-sm font-semibold'>{name}</span>
					{lines.filter(Boolean).map((line, index) => (
						<span
							key={index}
							className={cn("block truncate text-xs", index === 0 ? "text-foreground/80" : "text-muted-foreground")}
						>
							{line}
						</span>
					))}
				</span>
				{trailing ? null : <ChevronRightIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />}
			</Link>
			{trailing}
		</div>
	);
}

export function FollowButton({
	roomId,
	competitionId,
	name,
	following,
}: Readonly<{ roomId: string; competitionId: string; name: string; following: boolean }>) {
	const { mutate: follow, isPending } = useFollowCompetition(roomId);
	return (
		<button
			type='button'
			aria-pressed={following}
			aria-label={following ? `Stop following ${name}` : `Follow ${name}`}
			disabled={isPending}
			onClick={() =>
				follow(
					{ competitionId, follow: !following },
					{
						onSuccess: () =>
							toast.success(following ? `Stopped following ${name}` : `Following ${name}`, {
								position: "top-center",
							}),
						onError: () =>
							toast.error(
								following ? "Couldn't unfollow that competition. Try again." : "Couldn't follow that competition. Try again.",
								{ position: "top-center" },
							),
					},
				)
			}
			className={cn(
				"h-8 shrink-0 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
				following ? "border-transparent bg-primary/10 text-primary" : "bg-card hover:bg-muted",
			)}
		>
			{following ? "Following" : "Follow"}
		</button>
	);
}

const KINDS: Record<string, string> = { league: "League", cup: "Cup", tour: "Tour", season: "Season" };
export const kindLabel = (kind: string) => KINDS[kind] ?? kind;
