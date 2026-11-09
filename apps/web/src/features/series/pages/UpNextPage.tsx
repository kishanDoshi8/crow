import { useRoomContext } from "@/shared/lib/roomContext";
import { useRoomRole } from "@/features/rooms";
import {
	useRemoveSuggestion,
	useSeriesSuggestions,
	useSuggestSeries,
	useToggleSuggestionVote,
} from "@/features/series/hooks/suggestions";
import { UpNextVoteButton } from "@/features/series/components/UpNextVoteButton";
import type { SeriesSuggestion } from "@/shared/lib/api";
import { Button, Input, Reveal, Skeleton, SkeletonList } from "@/shared/ui";
import { ChevronUpIcon, PlusIcon, RocketIcon, Trash2Icon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const TITLE_MAX_LENGTH = 60;

// "Up next": suggest what the room plays next and back the ideas you like.
export default function UpNextPage() {
	const { room } = useRoomContext();
	const isOrganizer = useRoomRole(room).can.organize;
	const { data: suggestions = [], isPending } = useSeriesSuggestions(room.id);
	const { mutate: suggest, isPending: isSuggesting } = useSuggestSeries(
		room.id,
	);
	const { mutate: toggleVote } = useToggleSuggestionVote(room.id);
	const { mutate: remove } = useRemoveSuggestion(room.id);
	const [title, setTitle] = useState("");

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		const trimmed = title.trim();
		if (!trimmed) return;

		suggest(trimmed, {
			onSuccess: (result) => {
				setTitle("");
				toast.success(
					result.existing
						? "That one's already up. Your vote's been added."
						: "Idea added, with your vote.",
					{ position: "top-center" },
				);
			},
			onError: (error) => {
				toast.error(error.message || "Couldn't add your idea.", {
					position: "top-center",
				});
			},
		});
	};

	const handleRemove = (suggestion: SeriesSuggestion) => {
		remove(suggestion.id, {
			onError: (error) => {
				toast.error(error.message || "Couldn't remove that idea.", {
					position: "top-center",
				});
			},
		});
	};

	return (
		<div className='mx-auto w-full max-w-md space-y-5 p-4 lg:max-w-2xl lg:pt-6'>
			<div>
				<h2 className='text-lg font-semibold'>
					What should we play next?
				</h2>
				<p className='text-sm text-muted-foreground'>
					Suggest a league, tour or event. Tap{" "}
					<ChevronUpIcon className={`inline size-5`} /> on any idea to
					vote for it, and tap again to take your vote back.
				</p>
			</div>

			<form onSubmit={handleSubmit} className='flex flex-col gap-1.5'>
				<div className='flex gap-2'>
					<Input
						value={title}
						onChange={(event) =>
							setTitle(
								event.target.value.slice(0, TITLE_MAX_LENGTH),
							)
						}
						placeholder='e.g. Champions League'
						// Nothing on the board yet: the first thing to do is suggest.
						autoFocus={!isPending && suggestions.length === 0}
						aria-label='Suggest a series'
						maxLength={TITLE_MAX_LENGTH}
					/>
					<Button
						type='submit'
						variant='linear'
						disabled={!title.trim() || isSuggesting}
					>
						<PlusIcon />
						Suggest
					</Button>
				</div>
				<p className='text-right text-xs tabular-nums text-muted-foreground'>
					{title.length}/{TITLE_MAX_LENGTH}
				</p>
			</form>

			{isPending ? (
				<SkeletonList
					count={3}
					className='flex flex-col gap-2'
					renderItem={() => <Skeleton className='h-16 rounded-xl' />}
				/>
			) : suggestions.length === 0 ? (
				<p className='rounded-xl border border-dashed border-border/80 px-4 py-6 text-center text-sm text-muted-foreground'>
					No ideas yet. Be the first to suggest one.
				</p>
			) : (
				<ul className='flex flex-col gap-2'>
					{suggestions.map((suggestion, index) => (
						<Reveal
							as='li'
							key={suggestion.id}
							index={index}
							className='flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3'
						>
							<UpNextVoteButton
								suggestion={suggestion}
								onToggle={() => toggleVote(suggestion.id)}
							/>
							<div className='min-w-0 flex-1'>
								<p className='font-medium break-words'>
									{suggestion.title}
								</p>
								<p className='text-xs text-muted-foreground'>
									Suggested by{" "}
									{suggestion.created_by_me
										? "you"
										: suggestion.created_by_username}
								</p>
								{isOrganizer && suggestion.voters?.length ? (
									<p className='mt-1 text-xs text-muted-foreground'>
										Backed by {suggestion.voters.join(", ")}
									</p>
								) : null}
								{isOrganizer ? (
									<Button
										variant='link'
										size='sm'
										className='mt-1 h-auto px-0 has-[>svg]:px-0 text-accent'
										asChild
									>
										<Link
											to={`/rooms/${room.code}/series/new`}
											state={{
												suggestionId: suggestion.id,
												title: suggestion.title,
											}}
										>
											<RocketIcon />
											Start this series
										</Link>
									</Button>
								) : null}
							</div>
							{suggestion.created_by_me || isOrganizer ? (
								<Button
									variant='ghost'
									size='icon-sm'
									aria-label={`Remove ${suggestion.title}`}
									className='text-muted-foreground'
									onClick={() => handleRemove(suggestion)}
								>
									<Trash2Icon />
								</Button>
							) : null}
						</Reveal>
					))}
				</ul>
			)}
		</div>
	);
}
