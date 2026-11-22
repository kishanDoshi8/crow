import { PencilIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useUpdateFixtureQuestion } from "@/features/admin/hooks";
import type { AdminFixtureQuestion } from "@/shared/lib/api";
import {
	Button,
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Spinner,
} from "@/shared/ui";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";

// One of a match's questions in /admin → Fixtures: show or hide it for
// rooms, or reword it for this match.
export function FixtureQuestionRow({ question }: Readonly<{ question: AdminFixtureQuestion }>) {
	const { mutate: update } = useUpdateFixtureQuestion();
	const [isEditOpen, setIsEditOpen] = useState(false);
	const id = `shown-${question.id}`;

	return (
		<li className='flex items-start gap-3 py-2'>
			<div className='min-w-0 flex-1'>
				<p className={question.hidden ? "text-sm text-muted-foreground" : "text-sm font-medium"}>{question.title}</p>
				<p className='truncate text-xs text-muted-foreground'>
					{question.options.map((option) => option.label).join(" / ")}
				</p>
				{question.customized ? <p className='text-xs text-muted-foreground'>Reworded</p> : null}
				{question.rooms > 0 ? (
					<p className='text-xs text-muted-foreground'>
						In {question.rooms} {question.rooms === 1 ? "room" : "rooms"}
					</p>
				) : null}
			</div>
			<Button variant='ghost' size='sm' aria-label={`Reword ${question.title}`} onClick={() => setIsEditOpen(true)}>
				<PencilIcon />
			</Button>
			<div className='flex flex-col items-center gap-1 pt-0.5'>
				<Switch
					id={id}
					checked={!question.hidden}
					onCheckedChange={(shown) =>
						update(
							{ questionId: question.id, hidden: !shown },
							{
								onError: () =>
									toast.error("Couldn't update the question. Try again.", { position: "top-center" }),
							},
						)
					}
				/>
				<label htmlFor={id} className='text-[0.6875rem] text-muted-foreground'>
					{question.hidden ? "Hidden" : "Shown"}
				</label>
			</div>
			<RewordDialog question={question} open={isEditOpen} onOpenChange={setIsEditOpen} />
		</li>
	);
}

function RewordDialog({
	question,
	open,
	onOpenChange,
}: Readonly<{ question: AdminFixtureQuestion; open: boolean; onOpenChange: (open: boolean) => void }>) {
	const [title, setTitle] = useState(question.title);
	const [description, setDescription] = useState(question.description ?? "");
	const { mutate: update, isPending } = useUpdateFixtureQuestion();

	const done = (message: string) => ({
		onSuccess: () => {
			onOpenChange(false);
			toast.success(message, { position: "top-center" });
		},
		onError: (error: Error) =>
			toast.error("Couldn't update the question. Try again.", {
				description: error.message,
				position: "top-center",
			}),
	});

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (next) {
					setTitle(question.title);
					setDescription(question.description ?? "");
				}
				onOpenChange(next);
			}}
		>
			<DialogContent className='mx-auto sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Reword question</DialogTitle>
					<DialogDescription>
						For this match only. Rooms that already added it keep their wording. The options and how the
						answer is worked out stay the same.
					</DialogDescription>
				</DialogHeader>
				<div className='space-y-3'>
					<label className='block space-y-1.5'>
						<span className='text-xs font-medium text-muted-foreground'>Question</span>
						<Input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
					</label>
					<label className='block space-y-1.5'>
						<span className='text-xs font-medium text-muted-foreground'>How it's decided</span>
						<Textarea
							value={description}
							maxLength={500}
							rows={3}
							onChange={(event) => setDescription(event.target.value)}
						/>
					</label>
				</div>
				<DialogFooter className='gap-2'>
					{question.customized ? (
						<Button
							variant='ghost'
							className='sm:mr-auto'
							disabled={isPending}
							onClick={() => update({ questionId: question.id, reset: true }, done("Wording reset"))}
						>
							Reset wording
						</Button>
					) : null}
					<DialogClose asChild>
						<Button variant='outline'>Cancel</Button>
					</DialogClose>
					<Button
						variant='linear'
						disabled={isPending || title.trim() === ""}
						onClick={() => update({ questionId: question.id, title, description }, done("Question reworded"))}
					>
						{isPending ? <Spinner /> : null}
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
