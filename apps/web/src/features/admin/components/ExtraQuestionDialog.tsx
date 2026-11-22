import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAddFixtureExtra } from "@/features/admin/hooks";
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
import { Textarea } from "@/shared/ui/textarea";

const MAX_OPTIONS = 6;

// An admin writes a one-off question for one match ("Will Kohli score
// 50?"). No feed settles it: the admin picks its answer when confirming.
export function ExtraQuestionDialog({
	fixtureId,
	match,
	open,
	onOpenChange,
}: Readonly<{ fixtureId: string; match: string; open: boolean; onOpenChange: (open: boolean) => void }>) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [options, setOptions] = useState(["Yes", "No"]);
	const { mutate: add, isPending } = useAddFixtureExtra();

	const filled = options.map((o) => o.trim()).filter(Boolean);
	const ready = title.trim() !== "" && filled.length >= 2 && new Set(filled.map((o) => o.toLowerCase())).size === filled.length;

	const reset = () => {
		setTitle("");
		setDescription("");
		setOptions(["Yes", "No"]);
	};

	const submit = () =>
		add(
			{ fixtureId, title, description, options: filled },
			{
				onSuccess: () => {
					onOpenChange(false);
					reset();
					toast.success("Question added", {
						description: "Hosts can add it from the fixtures now.",
						position: "top-center",
					});
				},
				onError: (error) =>
					toast.error("Couldn't add the question. Try again.", {
						description: error.message,
						position: "top-center",
					}),
			},
		);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='mx-auto sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Extra question</DialogTitle>
					<DialogDescription>
						For {match} only. You pick the answer when you confirm the match.
					</DialogDescription>
				</DialogHeader>
				<div className='space-y-3'>
					<label className='block space-y-1.5'>
						<span className='text-xs font-medium text-muted-foreground'>Question</span>
						<Input
							id={`extra-title-${fixtureId}`}
							value={title}
							maxLength={200}
							placeholder='Will Kohli score 50?'
							onChange={(event) => setTitle(event.target.value)}
						/>
					</label>
					<label className='block space-y-1.5'>
						<span className='text-xs font-medium text-muted-foreground'>How it's decided (optional)</span>
						<Textarea
							id={`extra-description-${fixtureId}`}
							value={description}
							maxLength={500}
							rows={2}
							placeholder='In either innings he bats.'
							onChange={(event) => setDescription(event.target.value)}
						/>
					</label>
					<fieldset className='space-y-1.5'>
						<legend className='text-xs font-medium text-muted-foreground'>Options</legend>
						{options.map((option, index) => (
							<div key={index} className='flex items-center gap-2'>
								<Input
									id={`extra-option-${fixtureId}-${index}`}
									aria-label={`Option ${index + 1}`}
									value={option}
									maxLength={60}
									onChange={(event) =>
										setOptions((current) => current.map((o, i) => (i === index ? event.target.value : o)))
									}
								/>
								{options.length > 2 ? (
									<Button
										variant='ghost'
										size='sm'
										aria-label={`Remove option ${index + 1}`}
										onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}
									>
										<XIcon />
									</Button>
								) : null}
							</div>
						))}
						{options.length < MAX_OPTIONS ? (
							<Button variant='ghost' size='sm' onClick={() => setOptions((current) => [...current, ""])}>
								<PlusIcon />
								Add option
							</Button>
						) : null}
					</fieldset>
				</div>
				<DialogFooter className='gap-2'>
					<DialogClose asChild>
						<Button variant='outline'>Cancel</Button>
					</DialogClose>
					<Button variant='linear' disabled={!ready || isPending} onClick={submit}>
						{isPending ? <Spinner /> : null}
						Add question
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
