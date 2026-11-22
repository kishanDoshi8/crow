import { CheckIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAddCompetition, useSearchSeries } from "@/features/admin/hooks";
import type { ProviderSeries } from "@/shared/lib/api";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Input,
	Spinner,
} from "@/shared/ui";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

// "3 Tests, 3 ODIs and 5 T20s"
function formatsLine(series: ProviderSeries) {
	const parts = [
		series.tests ? `${series.tests} ${series.tests === 1 ? "Test" : "Tests"}` : null,
		series.odis ? `${series.odis} ${series.odis === 1 ? "ODI" : "ODIs"}` : null,
		series.t20s ? `${series.t20s} ${series.t20s === 1 ? "T20" : "T20s"}` : null,
	].filter(Boolean) as string[];
	if (parts.length === 0) return series.matches ? `${series.matches} matches` : "Matches not listed yet";
	return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

function datesLine(series: ProviderSeries) {
	if (!series.starts_on) return null;
	const start = dateFormat.format(new Date(series.starts_on));
	return series.ends_on ? `${start} to ${dateFormat.format(new Date(series.ends_on))}` : `From ${start}`;
}

// Find a cricket series on CricketData.org and add it: hosts can follow it
// straight away, and its matches arrive with the sync it starts.
export function AddSeriesDialog({
	open,
	onOpenChange,
	existingRefs,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; existingRefs: ReadonlySet<string> }>) {
	const [query, setQuery] = useState("");
	const { mutate: search, data: found, isPending: isSearching, reset } = useSearchSeries();
	const { mutate: add, isPending: isAdding, variables: adding } = useAddCompetition();

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		if (query.trim().length < 2) return;
		search(query.trim(), {
			onError: (error) =>
				toast.error("Couldn't search CricketData.org. Try again.", {
					description: error.message,
					position: "top-center",
				}),
		});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) reset();
				onOpenChange(next);
			}}
		>
			<DialogContent className='mx-auto sm:max-w-lg'>
				<DialogHeader>
					<DialogTitle>Add a cricket series</DialogTitle>
					<DialogDescription>
						Tours, leagues and cups from CricketData.org. Each search uses one of the day's 100 calls.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className='flex gap-2'>
					<label className='relative flex-1'>
						<span className='sr-only'>Search series</span>
						<SearchIcon className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' aria-hidden='true' />
						<Input
							id='series-search'
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder='India, IPL, Ashes...'
							className='pl-9'
						/>
					</label>
					<Button type='submit' variant='outline' disabled={isSearching || query.trim().length < 2}>
						{isSearching ? <Spinner /> : null}
						Search
					</Button>
				</form>
				<div className='max-h-[50vh] overflow-y-auto'>
					{found === undefined ? null : found.length === 0 ? (
						<p className='py-4 text-sm text-muted-foreground'>No series match "{query.trim()}".</p>
					) : (
						<ul className='divide-y rounded-xl border'>
							{found.map((series) => {
								const added = existingRefs.has(series.provider_ref);
								const busy = isAdding && adding?.provider_ref === series.provider_ref;
								return (
									<li key={series.provider_ref} className='flex items-start gap-3 px-3 py-2.5'>
										<div className='min-w-0 flex-1'>
											<p className='text-sm font-semibold'>{series.name}</p>
											<p className='text-xs text-muted-foreground'>{formatsLine(series)}</p>
											{datesLine(series) ? <p className='text-xs text-muted-foreground'>{datesLine(series)}</p> : null}
										</div>
										<Button
											variant={added ? "ghost" : "outline"}
											size='sm'
											className='shrink-0'
											disabled={added || isAdding}
											onClick={() =>
												add(series, {
													onSuccess: () =>
														toast.success(`Added ${series.name}`, {
															description: "Its matches arrive with the sync that just started.",
															position: "top-center",
														}),
													onError: (error) =>
														toast.error("Couldn't add the series. Try again.", {
															description: error.message,
															position: "top-center",
														}),
												})
											}
										>
											{busy ? <Spinner /> : added ? <CheckIcon /> : <PlusIcon />}
											{added ? "Added" : "Add"}
										</Button>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
