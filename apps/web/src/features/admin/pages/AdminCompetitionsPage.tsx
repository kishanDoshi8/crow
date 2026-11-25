import { PlusIcon, RefreshCwIcon, SearchIcon, TagIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { isFinished } from "@/features/admin/lib/competitions";
import { toast } from "sonner";
import { AddSeriesDialog } from "@/features/admin/components/AddSeriesDialog";
import { CompetitionTagDialog } from "@/features/admin/components/CompetitionTagDialog";
import {
	useAdminCompetitions,
	useRequestFixtureSync,
	useSetCompetitionActive,
	useSetCompetitionArchived,
} from "@/features/admin/hooks";
import { chipClass, sportLabel } from "@/features/fixtures";
import type { AdminCompetition } from "@/shared/lib/api";
import { describeDeadline } from "@/shared/lib/deadline";
import { Button, Input, Skeleton, Spinner } from "@/shared/ui";
import { Switch } from "@/shared/ui/switch";

type Filter = "current" | "on" | "off" | "problems" | "finished";

// The sites fixtures come from, by catalog.competitions.provider.
const PROVIDERS: Record<string, string> = {
	"football-data": "football-data.org",
	cricketdata: "CricketData.org",
};
const providerName = (provider: string) => PROVIDERS[provider] ?? provider;

// Finished ones (ended or archived) only show under Finished, so the list
// stays about what's running.
const matches: Record<Filter, (c: AdminCompetition) => boolean> = {
	current: (c) => !isFinished(c),
	on: (c) => c.active && !isFinished(c),
	off: (c) => !c.active && !isFinished(c),
	problems: (c) => !!c.last_sync_error && !isFinished(c),
	finished: (c) => isFinished(c),
};

// Which competitions rooms can follow, by the provider their fixtures come
// from. Off: not synced or offered, but questions rooms already have still
// get their results in Results.
export default function AdminCompetitionsPage() {
	const { data, isPending, isError, refetch } = useAdminCompetitions();
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<Filter>("current");
	const [isAddOpen, setIsAddOpen] = useState(false);
	const existingRefs = useMemo(
		() => new Set((data ?? []).filter((c) => c.active).map((c) => c.provider_ref)),
		[data],
	);

	const groups = useMemo(() => {
		const q = query.trim().toLowerCase();
		const shown = (data ?? []).filter(
			(c) => matches[filter](c) && (!q || `${c.name} ${c.provider_ref} ${c.region ?? ""}`.toLowerCase().includes(q)),
		);
		const byProvider = new Map<string, AdminCompetition[]>();
		for (const competition of shown) {
			byProvider.set(competition.provider, [...(byProvider.get(competition.provider) ?? []), competition]);
		}
		return [...byProvider.entries()];
	}, [data, filter, query]);

	const filters: { value: Filter; label: string }[] = [
		{ value: "current", label: "Current" },
		{ value: "on", label: "On" },
		{ value: "off", label: "Off" },
		{ value: "problems", label: "Sync problems" },
		{ value: "finished", label: "Finished" },
	];

	return (
		<div className='space-y-6'>
			<div className='space-y-2'>
				<div className='flex justify-end'>
					<Button variant='outline' size='sm' onClick={() => setIsAddOpen(true)}>
						<PlusIcon />
						Add a cricket series
					</Button>
				</div>
				<label className='relative block'>
					<span className='sr-only'>Search competitions</span>
					<SearchIcon className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' aria-hidden='true' />
					<Input
						id='admin-competitions-search'
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder='Search competitions'
						className='pl-9'
					/>
				</label>
				<div className='flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
					{filters.map((f) => {
						const count = (data ?? []).filter(matches[f.value]).length;
						if (f.value === "problems" && count === 0) return null;
						return (
							<button
								key={f.value}
								type='button'
								aria-pressed={filter === f.value}
								onClick={() => setFilter(f.value)}
								className={chipClass(filter === f.value)}
							>
								{f.label}
								<span className='opacity-60 tabular-nums'>{count}</span>
							</button>
						);
					})}
				</div>
				<p className='px-1 text-xs text-muted-foreground'>
					Fixtures sync every 3 hours, and every 15 minutes while matches rooms have questions on finish.
				</p>
			</div>

			{isPending ? (
				<Skeleton className='h-40 w-full rounded-2xl' />
			) : isError ? (
				<p className='text-sm text-muted-foreground'>
					Couldn't load the competitions.{" "}
					<button type='button' className='font-medium text-foreground underline underline-offset-2' onClick={() => void refetch()}>
						Try again
					</button>
				</p>
			) : groups.length === 0 ? (
				<p className='rounded-2xl border bg-card px-3 py-4 text-sm text-muted-foreground'>No competitions match.</p>
			) : (
				groups.map(([provider, competitions]) => (
					<ProviderGroup
						key={provider}
						provider={provider}
						competitions={competitions}
						onSynced={() => setTimeout(() => void refetch(), 15_000)}
					/>
				))
			)}

			<AddSeriesDialog open={isAddOpen} onOpenChange={setIsAddOpen} existingRefs={existingRefs} />
		</div>
	);
}

function ProviderGroup({
	provider,
	competitions,
	onSynced,
}: Readonly<{ provider: string; competitions: AdminCompetition[]; onSynced: () => void }>) {
	const { mutate: requestSync, isPending } = useRequestFixtureSync();
	const sports = [...new Set(competitions.map((c) => sportLabel(c.sport)))].join(" and ");

	const sync = () =>
		requestSync(provider, {
			onSuccess: (started) =>
				started
					? toast.success(`Syncing ${providerName(provider)}`, {
							description: "Fixtures update in a minute or so.",
							position: "top-center",
						})
					: toast.error("The sync isn't set up yet", {
							description: "Add fixture_sync_secret to private.notification_config.",
							position: "top-center",
						}),
			onError: (error) =>
				toast.error("Couldn't start the sync. Try again.", {
					description: error.message,
					position: "top-center",
				}),
			onSettled: onSynced,
		});

	return (
		<section className='space-y-2'>
			<div className='flex items-end justify-between gap-3 px-1'>
				<div className='min-w-0'>
					<h2 className='text-base font-semibold'>{providerName(provider)}</h2>
					<p className='text-xs text-muted-foreground'>
						{sports}, {competitions.length} {competitions.length === 1 ? "competition" : "competitions"}
					</p>
				</div>
				<Button variant='outline' size='sm' className='shrink-0' disabled={isPending} onClick={sync}>
					{isPending ? <Spinner /> : <RefreshCwIcon />}
					Sync
				</Button>
			</div>
			<div className='divide-y rounded-2xl border bg-card'>
				{competitions.map((competition) => (
					<CompetitionRow key={competition.id} competition={competition} />
				))}
			</div>
		</section>
	);
}

function CompetitionRow({ competition }: Readonly<{ competition: AdminCompetition }>) {
	const { mutate: setActive } = useSetCompetitionActive();
	const { mutate: setArchived, isPending: isArchiving } = useSetCompetitionArchived();
	const [isTagOpen, setIsTagOpen] = useState(false);
	const archive = (archived: boolean) =>
		setArchived(
			{ competitionId: competition.id, archived },
			{
				onSuccess: () =>
					toast.success(archived ? `${competition.name} archived` : `${competition.name} restored`, {
						description: archived ? "It's off, and filed under Finished." : "It's still off. Turn it on when you want it.",
						position: "top-center",
					}),
				onError: () => toast.error("Couldn't change the competition. Try again.", { position: "top-center" }),
			},
		);
	const endedOn =
		!competition.archived_at && competition.ends_on && isFinished(competition)
			? new Date(competition.ends_on).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
			: null;
	const id = `active-${competition.id}`;
	const synced = competition.synced_at
		? `synced ${describeDeadline(new Date(competition.synced_at)).relative}`
		: "never synced";

	return (
		<div className='flex items-start gap-3 px-3 py-3'>
			<div className='min-w-0 flex-1'>
				<label htmlFor={id} className='block cursor-pointer'>
					<span className='block text-sm font-semibold'>{competition.name}</span>
					<span className='block text-xs text-muted-foreground'>
						{[competition.provider_ref, competition.season, competition.active ? synced : "off"].filter(Boolean).join(", ")}
					</span>
					{competition.last_sync_error ? (
						<span className='block text-xs text-destructive'>
							Last sync failed
							{competition.last_sync_error_at
								? ` ${describeDeadline(new Date(competition.last_sync_error_at)).relative}`
								: ""}
							: {competition.last_sync_error}
						</span>
					) : null}
					<span className='block text-xs text-muted-foreground'>
						{competition.active
							? `Followed by ${competition.rooms} ${competition.rooms === 1 ? "room" : "rooms"}, ${competition.upcoming} upcoming`
							: "Not offered to rooms"}
					</span>
				</label>
				{/* Outside the label, so editing the tag doesn't flip the switch. */}
				<span className='mt-1 flex items-center gap-2'>
					<span className='inline-flex max-w-40 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs'>
						<TagIcon className='size-3 shrink-0 text-muted-foreground' aria-hidden='true' />
						<span className='truncate'>{competition.tag}</span>
					</span>
					<Button
						variant='ghost'
						size='xs'
						onClick={() => setIsTagOpen(true)}
						aria-label={`Edit tag for ${competition.name}`}
					>
						Edit tag
					</Button>
					<Button
						variant='ghost'
						size='xs'
						disabled={isArchiving}
						onClick={() => archive(!competition.archived_at)}
						aria-label={`${competition.archived_at ? "Restore" : "Archive"} ${competition.name}`}
					>
						{competition.archived_at ? "Restore" : "Archive"}
					</Button>
				</span>
				{competition.archived_at ? (
					<span className='mt-1 block text-xs text-muted-foreground'>
						Archived {describeDeadline(new Date(competition.archived_at)).relative}
					</span>
				) : endedOn ? (
					<span className='mt-1 block text-xs text-muted-foreground'>Ended {endedOn}</span>
				) : null}
			</div>
			{isTagOpen ? (
				<CompetitionTagDialog competition={competition} open={isTagOpen} onOpenChange={setIsTagOpen} />
			) : null}
			<Switch
				id={id}
				checked={competition.active}
				onCheckedChange={(active) =>
					setActive(
						{ competitionId: competition.id, active },
						{
							onError: () =>
								toast.error("Couldn't change the competition. Try again.", { position: "top-center" }),
						},
					)
				}
			/>
		</div>
	);
}
