import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useRoomRole } from "@/features/rooms";
import { UpNextBallot } from "@/features/series/components/UpNextBallot";
import { useRemoveSuggestion, useUpNext } from "@/features/series/hooks/suggestions";
import { useRoomContext } from "@/shared/lib/roomContext";
import { Button } from "@/shared/ui";

// "Up next": the whole board, and for hosts a way to take ideas down.
export default function UpNextPage() {
	const { room } = useRoomContext();
	const isHost = useRoomRole(room).can.organize;
	const { data: board } = useUpNext(room.id);
	const { mutate: remove, isPending: isRemoving } = useRemoveSuggestion(room.id);
	// Ideas players added (not the competitions suggested to start from).
	const ideas = (board?.options ?? []).filter((option) => option.id && !option.is_seed);

	return (
		<div className='mx-auto flex w-full max-w-md flex-col gap-6 p-4 lg:max-w-2xl lg:pt-6'>
			<UpNextBallot roomId={room.id} roomCode={room.code} variant='page' isHost={isHost} />

			{isHost && ideas.length > 0 ? (
				<section aria-labelledby='up-next-manage' className='flex flex-col gap-2'>
					<div>
						<h2 id='up-next-manage' className='text-sm font-semibold'>
							Take an idea down
						</h2>
						<p className='text-xs text-muted-foreground'>
							For one that doesn't belong. Players who picked it can pick again.
						</p>
					</div>
					<ul className='divide-y overflow-hidden rounded-xl border'>
						{ideas.map((idea) => (
							<li key={idea.id} className='flex items-center gap-3 px-3 py-2'>
								<span className='min-w-0 flex-1 truncate text-sm'>{idea.title}</span>
								<Button
									variant='ghost'
									size='icon-sm'
									aria-label={`Take down ${idea.title}`}
									className='text-muted-foreground'
									disabled={isRemoving}
									onClick={() =>
										remove(idea.id ?? "", {
											onSuccess: () =>
												toast.success(`${idea.title} taken down.`, { position: "top-center" }),
											onError: () =>
												toast.error("Couldn't take it down. Try again.", { position: "top-center" }),
										})
									}
								>
									<Trash2Icon />
								</Button>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</div>
	);
}
