import { CheckIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAddCompetition, useSearchSeries } from "@/features/admin/hooks";
import { suggestTag, TAG_MAX } from "@/features/admin/lib/tags";
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
	// The series being added: its questions' tag is checked first.
	const [tagging, setTagging] = useState<{ ref: string; tag: string } | null>(null);

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
								const busy = isAdding && adding?.series.provider_ref === series.provider_ref;
								const isTagging = tagging?.ref === series.provider_ref;
								const confirmAdd = () =>
									add(
										{ series, tag: tagging?.tag },
										{
											onSuccess: () => {
												setTagging(null);
												toast.success(`Added ${series.name}`, {
													description: "Its matches arrive with the sync that just started.",
													position: "top-center",
												});
											},
											onError: (error) =>
												toast.error("Couldn't add the series. Try again.", {
													description: error.message,
													position: "top-center",
												}),
										},
									);
								return (
									<li key={series.provider_ref} className='flex flex-col gap-2.5 px-3 py-2.5'>
										<div className='flex items-start gap-3'>
											<div className='min-w-0 flex-1'>
												<p className='text-sm font-semibold'>{series.name}</p>
												<p className='text-xs text-muted-foreground'>{formatsLine(series)}</p>
												{datesLine(series) ? <p className='text-xs text-muted-foreground'>{datesLine(series)}</p> : null}
											</div>
											{isTagging ? null : (
												<Button
													variant={added ? "ghost" : "outline"}
													size='sm'
													className='shrink-0'
													disabled={added || isAdding}
													onClick={() =>
														setTagging({ ref: series.provider_ref, tag: suggestTag(series.name) })
													}
												>
													{added ? <CheckIcon /> : <PlusIcon />}
													{added ? "Added" : "Add"}
												</Button>
											)}
										</div>
										{isTagging ? (
											// The tag its questions get in rooms, suggested from the name.
											<form
												className='flex flex-col gap-2'
												onSubmit={(event) => {
													event.preventDefault();
													confirmAdd();
												}}
											>
												<label className='flex flex-col gap-1 text-xs text-muted-foreground'>
													Tag on its questions
													<Input
														value={tagging.tag}
														maxLength={TAG_MAX}
														onChange={(event) => setTagging({ ...tagging, tag: event.target.value })}
														aria-describedby={`tag-hint-${series.provider_ref}`}
														autoFocus
													/>
												</label>
												<p id={`tag-hint-${series.provider_ref}`} className='text-xs text-muted-foreground'>
													Up to {TAG_MAX} characters. Leave it empty to use the sport.
												</p>
												<div className='flex justify-end gap-2'>
													<Button type='button' variant='ghost' size='sm' onClick={() => setTagging(null)} disabled={busy}>
														Cancel
													</Button>
													<Button type='submit' size='sm' disabled={isAdding}>
														{busy ? <Spinner /> : <PlusIcon />}
														Add series
													</Button>
												</div>
											</form>
										) : null}
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
