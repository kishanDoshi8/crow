import {
	useSeriesSuggestions,
	useToggleSuggestionVote,
} from "@/features/series/hooks/suggestions";
import { Button, Skeleton } from "@/shared/ui";
import { ChevronRightIcon, ChevronUpIcon, LightbulbIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { UpNextVoteButton } from "./UpNextVoteButton";

const PREVIEW_COUNT = 3;

type Props = {
	roomId: string;
	roomCode: string;
};

// The top ideas for the room's next series, with a way in to suggest more.
export function UpNextCard({ roomId, roomCode }: Readonly<Props>) {
	const { data: suggestions = [], isPending } = useSeriesSuggestions(roomId);
	const { mutate: toggleVote } = useToggleSuggestionVote(roomId);
	const top = suggestions.slice(0, PREVIEW_COUNT);
	const pageLink = `/rooms/${roomCode}/series/next`;

	return (
		<section className='rounded-2xl border bg-card p-4'>
			<div className='flex items-center justify-between gap-3'>
				<div className='min-w-0'>
					<h3 className='flex items-center gap-2 font-semibold'>
						<LightbulbIcon className='size-4 text-accent' />
						Up next
					</h3>
					<p className='text-sm text-muted-foreground'>
						What should we play next? Tap{" "}
						<ChevronUpIcon className={`inline size-5`} /> to vote.
					</p>
				</div>
			</div>

			{isPending ? (
				<Skeleton aria-hidden='true' className='mt-3 h-12 rounded-lg' />
			) : top.length === 0 ? (
				<div className='mt-3 flex flex-col gap-2'>
					<p className='text-sm text-muted-foreground'>
						No ideas yet. Suggest a league, tour or event to play
						next.
					</p>
					<Button
						variant='outline'
						className='w-full text-foreground'
						asChild
					>
						<Link to={pageLink}>
							<LightbulbIcon />
							Suggest the first idea
						</Link>
					</Button>
				</div>
			) : (
				<ul className='mt-3 flex flex-col gap-2'>
					{top.map((suggestion) => (
						<li
							key={suggestion.id}
							className='flex items-center gap-3'
						>
							<UpNextVoteButton
								suggestion={suggestion}
								onToggle={() => toggleVote(suggestion.id)}
							/>
							<p className='min-w-0 flex-1 truncate text-sm font-medium'>
								{suggestion.title}
							</p>
						</li>
					))}
					{suggestions.length > PREVIEW_COUNT ? (
						<li className='text-xs text-muted-foreground'>
							+{suggestions.length - PREVIEW_COUNT} more ideas
						</li>
					) : null}
					<li>
						<Link
							to={pageLink}
							className='flex items-center gap-1.5 text-sm font-medium text-accent'
						>
							{/* <PlusIcon className='size-4' /> */}
							Suggest & vote
							<ChevronRightIcon className='size-4' />
						</Link>
					</li>
				</ul>
			)}
		</section>
	);
}
