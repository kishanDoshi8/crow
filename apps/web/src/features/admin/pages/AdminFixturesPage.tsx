import { PencilIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAdminFixtures, useUpdateFixtureQuestion } from "@/features/admin/hooks";
import type { AdminFixtureQuestion, AdminUpcomingFixture } from "@/shared/lib/api";
import { describeDeadline } from "@/shared/lib/deadline";
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
	Skeleton,
	Spinner,
} from "@/shared/ui";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";

// The next two weeks' matches with every question that fits them: hide one
// from rooms, or reword it for one match. Rooms that already added a
// question keep their copy.
export default function AdminFixturesPage() {
	const { data, isPending, isError, refetch } = useAdminFixtures();

	if (isPending) {
		return (
			<div className='space-y-3'>
				<Skeleton className='h-32 w-full rounded-2xl' />
				<Skeleton className='h-32 w-full rounded-2xl' />
			</div>
		);
	}

	if (isError) {
		return (
			<p className='text-sm text-muted-foreground'>
				Couldn't load the fixtures.{" "}
				<button type='button' className='font-medium text-foreground underline underline-offset-2' onClick={() => void refetch()}>
					Try again
				</button>
			</p>
		);
	}

	if (data.length === 0) {
		return (
			<p className='rounded-2xl border bg-card px-3 py-4 text-sm text-muted-foreground'>
				No matches in the next two weeks. Check that a competition is on and has synced.
			</p>
		);
	}

	return (
		<div className='space-y-3'>
			<p className='px-1 text-xs text-muted-foreground'>
				Hidden questions aren't offered to rooms. A reworded one keeps its wording when the fixtures sync.
			</p>
			{data.map((fixture) => (
				<FixtureCard key={fixture.id} fixture={fixture} />
			))}
		</div>
	);
}

function FixtureCard({ fixture }: Readonly<{ fixture: AdminUpcomingFixture }>) {
	return (
		<article className='rounded-2xl border bg-card'>
			<header className='flex items-start justify-between gap-3 px-3 pt-3 pb-1'>
				<div className='min-w-0'>
					<h3 className='text-sm font-semibold'>
						{fixture.home} vs {fixture.away}
					</h3>
					<p className='text-xs text-muted-foreground'>
						{fixture.competition_name}
						{fixture.round_label ? `, ${fixture.round_label}` : ""}
					</p>
				</div>
				<time dateTime={fixture.kickoff_at} className='shrink-0 text-xs text-muted-foreground'>
					{describeDeadline(new Date(fixture.kickoff_at)).when}
				</time>
			</header>
			<ul className='divide-y'>
				{fixture.questions.map((question) => (
					<QuestionRow key={question.id} question={question} />
				))}
			</ul>
		</article>
	);
}

function QuestionRow({ question }: Readonly<{ question: AdminFixtureQuestion }>) {
	const { mutate: update } = useUpdateFixtureQuestion();
	const [isEditOpen, setIsEditOpen] = useState(false);
	const id = `shown-${question.id}`;

	return (
		<li className='flex items-start gap-3 px-3 py-2.5'>
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
