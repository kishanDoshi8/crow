import { MessageCircleIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { reactionEmoji } from "../reactions";

type Props = {
	topReactions: Array<{ reaction: string; count: number }> | null | undefined;
	myReaction: string | null | undefined;
	postCount: number | null | undefined;
	className?: string;
};

// A history card's room talk at a glance: the top three reactions (yours
// highlighted) and how many phrases were posted. Nothing when it's quiet.
export function ReactionSummary({ topReactions, myReaction, postCount, className }: Readonly<Props>) {
	const reactions = topReactions ?? [];
	const posts = postCount ?? 0;
	if (reactions.length === 0 && posts === 0) return null;

	return (
		<div className={cn("flex items-center gap-1.5", className)}>
			{reactions.map(({ reaction, count }) => (
				<span
					key={reaction}
					className={cn(
						"inline-flex h-6 items-center gap-1 rounded-full bg-secondary px-2 text-xs tabular-nums",
						reaction === myReaction && "bg-primary/15 text-primary",
					)}
				>
					<span aria-hidden>{reactionEmoji(reaction)}</span>
					<span className='sr-only'>{reaction}</span>
					{count}
				</span>
			))}
			<span className='flex-1' />
			{posts > 0 ? (
				<span className='inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums'>
					<MessageCircleIcon className='size-3.5' aria-hidden />
					<span className='sr-only'>Phrases:</span>
					{posts}
				</span>
			) : null}
		</div>
	);
}
