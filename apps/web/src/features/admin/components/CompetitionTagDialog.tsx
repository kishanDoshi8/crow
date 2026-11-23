import { useState } from "react";
import { toast } from "sonner";
import { useSetCompetitionTag } from "@/features/admin/hooks";
import { suggestTag, TAG_MAX } from "@/features/admin/lib/tags";
import type { AdminCompetition } from "@/shared/lib/api";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Spinner,
} from "@/shared/ui";

type Props = {
	competition: AdminCompetition;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

// Sets the tag a competition's questions get in rooms. Questions rooms have
// already added from it (unless a host edited them) take the new tag too.
export function CompetitionTagDialog({ competition, open, onOpenChange }: Readonly<Props>) {
	// A custom tag as it is; else a suggestion from the name to start from.
	const [tag, setTag] = useState(() =>
		competition.tag_is_custom ? competition.tag : suggestTag(competition.name),
	);
	const { mutate: save, isPending, variables } = useSetCompetitionTag();

	const submit = (next: string | null) =>
		save(
			{ competitionId: competition.id, tag: next },
			{
				onSuccess: ({ tag: saved, questions_retagged }) => {
					onOpenChange(false);
					toast.success(`Tag is now ${saved}`, {
						description:
							questions_retagged > 0
								? `${questions_retagged} ${questions_retagged === 1 ? "question" : "questions"} in rooms updated.`
								: undefined,
						position: "top-center",
					});
				},
				onError: (error) =>
					toast.error("Couldn't save the tag. Try again.", {
						description: error.message,
						position: "top-center",
					}),
			},
		);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='mx-auto sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Tag for {competition.name}</DialogTitle>
					<DialogDescription>
						The tag on its questions in rooms, used to filter History. Questions rooms have
						already added get it too.
					</DialogDescription>
				</DialogHeader>
				<form
					id='competition-tag-form'
					onSubmit={(event) => {
						event.preventDefault();
						submit(tag);
					}}
					className='flex flex-col gap-1.5'
				>
					<Input
						value={tag}
						maxLength={TAG_MAX}
						onChange={(event) => setTag(event.target.value)}
						aria-label='Tag'
						autoFocus
					/>
					<p className='text-xs text-muted-foreground'>
						Up to {TAG_MAX} characters. Now: {competition.tag}
						{competition.tag_is_custom ? "" : " (default)"}.
					</p>
				</form>
				<DialogFooter className='gap-2'>
					{competition.tag_is_custom ? (
						<Button variant='ghost' disabled={isPending} onClick={() => submit(null)}>
							{isPending && variables?.tag === null ? <Spinner /> : null}
							Use default
						</Button>
					) : null}
					<Button type='submit' form='competition-tag-form' disabled={isPending || !tag.trim()}>
						{isPending && variables?.tag !== null ? <Spinner /> : null}
						Save tag
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
