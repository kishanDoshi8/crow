import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	Spinner,
} from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { useOnline } from "@/shared/lib/offline";
import { usePostPhrase } from "../hooks";
import type { PredictionTalk, TalkPhrase } from "../types";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	roomId: string;
	predictionId: string;
	talk: PredictionTalk | undefined;
};

const GROUP_TITLE = {
	winner: "You called it",
	loser: "You missed it",
	any: "Anyone",
} as const;

// "Say something": the preset phrases for where the prediction is, one tap
// to post. Phrases for people who called it (or missed it) come first.
export function PhraseSheet({ open, onOpenChange, roomId, predictionId, talk }: Readonly<Props>) {
	const { mutate: post, isPending, variables } = usePostPhrase(roomId, predictionId);
	const online = useOnline();
	const left = talk ? Math.max(0, talk.post_limit - talk.my_post_count) : 0;
	const groups = groupPhrases(talk?.phrases ?? []);

	const handlePost = (phrase: TalkPhrase) => {
		post(phrase.id, {
			onSuccess: () => onOpenChange(false),
			onError: (error) => {
				toast.error("Couldn't post that.", {
					description: error.message,
					position: "top-center",
				});
			},
		});
	};

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className='mx-auto sm:max-w-md'>
				<DrawerHeader className='text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left'>
					<DrawerTitle>Say something</DrawerTitle>
					<DrawerDescription>
						{!online
							? "You're offline. Phrases can be posted once you're back."
							: left > 0
								? "Tap one to post it to Room talk."
								: "You've used your 3 phrases on this prediction."}
					</DrawerDescription>
				</DrawerHeader>
				<div className='flex flex-col gap-4 px-4 pb-2'>
					{groups.map(([audience, phrases]) => (
						<section key={audience}>
							<h3 className='mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground'>
								{GROUP_TITLE[audience]}
							</h3>
							<div className='grid grid-cols-2 gap-2'>
								{phrases.map((phrase) => {
									const posting = isPending && variables === phrase.id;
									return (
										<button
											key={phrase.id}
											type='button'
											onClick={() => handlePost(phrase)}
											disabled={phrase.posted || left === 0 || isPending || !online}
											className={cn(
												"flex min-h-12 items-center gap-2 rounded-xl border bg-background px-3.5 text-left text-[15px] font-semibold transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
												(phrase.posted || left === 0) && "opacity-45",
											)}
										>
											{posting ? <Spinner className='size-4' /> : null}
											<span className='min-w-0 flex-1'>{phrase.text}</span>
											{phrase.posted ? (
												<>
													<CheckIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden />
													<span className='sr-only'>posted</span>
												</>
											) : null}
										</button>
									);
								})}
							</div>
						</section>
					))}
					{groups.length === 0 ? (
						<p className='text-sm text-muted-foreground'>No phrases for this stage yet.</p>
					) : null}
				</div>
				<p className='px-4 pt-2 pb-6 text-xs text-muted-foreground'>
					{left} of {talk?.post_limit ?? 3} left on this prediction
				</p>
			</DrawerContent>
		</Drawer>
	);
}

// Audience-specific phrases first, then everyone's, keeping the server's order.
function groupPhrases(phrases: TalkPhrase[]) {
	const groups = new Map<TalkPhrase["audience"], TalkPhrase[]>();
	for (const phrase of phrases) {
		groups.set(phrase.audience, [...(groups.get(phrase.audience) ?? []), phrase]);
	}
	return [...groups.entries()].sort(([a], [b]) => Number(a === "any") - Number(b === "any"));
}
