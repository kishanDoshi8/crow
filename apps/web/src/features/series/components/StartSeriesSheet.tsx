import { useState } from "react";
import { toast } from "sonner";
import { useStartSeriesFromIdea } from "@/features/series/hooks/suggestions";
import { useCurrentSeries } from "@/features/series/hooks/wallets";
import type { UpNextOption } from "@/shared/lib/api";
import { useAppNavigation } from "@/shared/lib/navigation";
import {
	Button,
	Checkbox,
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	Field,
	FieldLabel,
	Input,
	SheetLink,
	Spinner,
} from "@/shared/ui";

const TITLE_MAX = 60;

type Props = {
	roomId: string;
	roomCode: string;
	idea: UpNextOption;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

// Hosts: the room's favourite becomes the next series in one go. Same points
// as the last series; following the competition brings its matches into
// Fixtures, which is where it goes next.
export function StartSeriesSheet({ roomId, roomCode, idea, open, onOpenChange }: Readonly<Props>) {
	const { open: openPage } = useAppNavigation();
	const { setCurrentSeriesId } = useCurrentSeries(roomId);
	const { mutate: start, isPending } = useStartSeriesFromIdea(roomId);
	const [title, setTitle] = useState(idea.title);
	const canFollow = idea.on_crow && !!idea.competition_id;
	const [follow, setFollow] = useState(canFollow && !idea.followed);

	const submit = () =>
		start(
			{ suggestionId: idea.id ?? "", title: title.trim(), follow: follow || idea.followed },
			{
				onSuccess: ({ series_id, competition_id }) => {
					setCurrentSeriesId(series_id);
					onOpenChange(false);
					toast.success(`${title.trim()} has started.`, {
						description: competition_id ? "Add its first matches." : undefined,
						position: "top-center",
					});
					openPage(
						competition_id
							? `/rooms/${roomCode}/manage/fixtures/${competition_id}`
							: `/rooms/${roomCode}/series/${series_id}`,
					);
				},
				onError: (error) =>
					toast.error("Couldn't start the series. Try again.", {
						description: error.message,
						position: "top-center",
					}),
			},
		);

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className='mx-auto max-w-md'>
				<DrawerHeader className='text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left'>
					<DrawerTitle>Start the next series</DrawerTitle>
					<DrawerDescription>
						{idea.picks} {idea.picks === 1 ? "player" : "players"} picked {idea.title}. Everyone
						starts with the same points as your last series.
					</DrawerDescription>
				</DrawerHeader>
				<form
					className='flex flex-col gap-4 px-4 pb-6'
					onSubmit={(event) => {
						event.preventDefault();
						if (title.trim()) submit();
					}}
				>
					<Field>
						<FieldLabel htmlFor='next-series-title'>Name</FieldLabel>
						<Input
							id='next-series-title'
							value={title}
							maxLength={TITLE_MAX}
							onChange={(event) => setTitle(event.target.value)}
						/>
					</Field>

					{canFollow ? (
						idea.followed ? (
							<p className='text-sm text-muted-foreground'>
								The room already follows {idea.title}, so its matches are in Fixtures.
							</p>
						) : (
							<FieldLabel htmlFor='next-series-follow'>
								<Field orientation='horizontal'>
									<Checkbox
										id='next-series-follow'
										checked={follow}
										onCheckedChange={(checked) => setFollow(checked === true)}
									/>
									<span className='text-sm'>
										Follow {idea.title}, so its matches show up in Fixtures
									</span>
								</Field>
							</FieldLabel>
						)
					) : (
						<p className='text-sm text-muted-foreground'>
							Crow doesn't have {idea.title} yet, so you'll write the questions yourself.
						</p>
					)}

					<div className='flex flex-col gap-2'>
						<Button type='submit' size='lg' disabled={isPending || !title.trim()}>
							{isPending ? <Spinner /> : null}
							Start series
						</Button>
						{/* Other points or a ranking bar: the full form, starting from this idea. */}
						<Button variant='ghost' asChild>
							<SheetLink
								to={`/rooms/${roomCode}/series/new`}
								state={{ suggestionId: idea.id, title: title.trim() }}
								onClick={() => onOpenChange(false)}
							>
								Change the points first
							</SheetLink>
						</Button>
					</div>
				</form>
			</DrawerContent>
		</Drawer>
	);
}
