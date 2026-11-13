import { useEffect, useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import {
	usePredictionHistory,
	type PredictionHistoryEntry,
} from "@/features/leaderboard";
import {
	Button,
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	Input,
	Skeleton,
	Spinner,
} from "@/shared/ui";
import {
	formatWhen,
	optionTone,
} from "@/features/predictions/lib/predictionView";
import { cn } from "@/shared/lib/utils";

// Option chips shown per past prediction before "+N".
const CHIPS_SHOWN = 4;

type Props = {
	roomId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPick: (predictionId: string, item: PredictionHistoryEntry) => void;
	// What a copy brings over, under the title.
	description?: string;
};

// The room's past predictions, any series, newest first, to start a new one
// from: same question, options, details and tags. Searchable by question.
export function CopyPredictionSheet({
	roomId,
	open,
	onOpenChange,
	onPick,
	description = "Starts a new one with the same question, options, details and tags.",
}: Readonly<Props>) {
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");

	useEffect(() => {
		const timeoutId = globalThis.setTimeout(
			() => setSearch(searchInput.trim()),
			300,
		);
		return () => globalThis.clearTimeout(timeoutId);
	}, [searchInput]);

	const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } =
		usePredictionHistory(open ? roomId : undefined, "all", search);
	const items = useMemo(
		() => data?.pages.flatMap((page) => page.items) ?? [],
		[data],
	);

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className='mx-auto sm:max-w-md'>
				<DrawerHeader className='text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left'>
					<DrawerTitle>Copy a past prediction</DrawerTitle>
					<DrawerDescription>{description}</DrawerDescription>
				</DrawerHeader>
				<div className='px-4 pb-3'>
					<div className='relative'>
						<SearchIcon className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
						<Input
							value={searchInput}
							onChange={(event) =>
								setSearchInput(event.target.value)
							}
							placeholder='Search questions'
							aria-label='Search past predictions'
							className='pl-9'
						/>
					</div>
				</div>
				<ul className='flex max-h-[55vh] flex-col overflow-y-auto px-2 pb-6'>
					{isPending ? (
						[0, 1, 2].map((row) => (
							<li
								key={row}
								aria-hidden
								className='flex flex-col gap-2 px-2 py-3'
							>
								<Skeleton className='h-3.5 w-3/4' />
								<Skeleton className='h-3 w-1/2' />
							</li>
						))
					) : items.length === 0 ? (
						<li className='px-2 py-4 text-sm text-muted-foreground'>
							{search
								? "No past predictions match that."
								: "No past predictions yet."}
						</li>
					) : (
						items.map((item) => {
							const options = [...(item.options ?? [])].sort(
								(a, b) => a.display_order - b.display_order,
							);
							const extra = options.length - CHIPS_SHOWN;
							const series = item.series_title
								? `${item.series_title}${item.series_prediction_number ? ` #${item.series_prediction_number}` : ""}`
								: null;
							const when = formatWhen(
								item.resolved_at ?? item.created_at,
							);
							return (
								<li key={item.prediction_id}>
									<button
										type='button'
										onClick={() =>
											onPick(item.prediction_id, item)
										}
										className='flex w-full flex-col gap-0.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
									>
										<span className='line-clamp-2 text-md font-medium'>
											{item.title}
										</span>
										{options.length ? (
											<span className='mt-1 flex flex-wrap items-center gap-1'>
												{options
													.slice(0, CHIPS_SHOWN)
													.map((option, index) => (
														<span
															key={option.id}
															className='inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-px text-[11px] text-foreground/85'
														>
															<span
																className={cn(
																	"size-1.5 shrink-0 rounded-full",
																	optionTone(
																		index,
																	).dot,
																)}
																aria-hidden
															/>
															<span className='truncate'>
																{option.label}
															</span>
														</span>
													))}
												{extra > 0 ? (
													<span className='px-0.5 text-[11px] text-muted-foreground'>
														+{extra}
													</span>
												) : null}
											</span>
										) : null}
										{/* Where it sat on the left, when on the right. */}
										<span className='mt-1 flex items-baseline justify-between gap-3 text-xs text-muted-foreground'>
											<span className='min-w-0 truncate'>
												{series}
											</span>
											<span className='shrink-0'>
												{when}
											</span>
										</span>
									</button>
								</li>
							);
						})
					)}
					{hasNextPage ? (
						<li className='px-2 pt-2'>
							<Button
								variant='ghost'
								size='sm'
								className='w-full'
								onClick={() => void fetchNextPage()}
								disabled={isFetchingNextPage}
							>
								{isFetchingNextPage ? <Spinner /> : null}
								Show older
							</Button>
						</li>
					) : null}
				</ul>
			</DrawerContent>
		</Drawer>
	);
}
