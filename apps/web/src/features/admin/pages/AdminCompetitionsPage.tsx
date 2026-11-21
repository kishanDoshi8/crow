import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import {
	useAdminCompetitions,
	useRequestFixtureSync,
	useSetCompetitionActive,
} from "@/features/admin/hooks";
import type { AdminCompetition } from "@/shared/lib/api";
import { describeDeadline } from "@/shared/lib/deadline";
import { Button, Skeleton, Spinner } from "@/shared/ui";
import { Switch } from "@/shared/ui/switch";

// Which competitions rooms can follow. Off: not synced or offered, but
// questions rooms already have still get their results in Results.
export default function AdminCompetitionsPage() {
	const { data, isPending, isError, refetch } = useAdminCompetitions();
	const { mutate: requestSync, isPending: isSyncing } = useRequestFixtureSync();

	const sync = () =>
		requestSync(undefined, {
			onSuccess: (started) =>
				started
					? toast.success("Sync started", {
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
			onSettled: () => {
				// The edge function runs on its own; look again shortly.
				setTimeout(() => void refetch(), 15_000);
			},
		});

	return (
		<div className='space-y-3'>
			<div className='flex items-center justify-between gap-3 px-1'>
				<p className='text-xs text-muted-foreground'>Syncs every 3 hours, and every 15 minutes while matches finish.</p>
				<Button variant='outline' size='sm' className='shrink-0' disabled={isSyncing} onClick={sync}>
					{isSyncing ? <Spinner /> : <RefreshCwIcon />}
					Sync now
				</Button>
			</div>

			<div className='divide-y rounded-2xl border bg-card'>
				{isPending ? (
					<div className='space-y-2 p-3'>
						<Skeleton className='h-10 w-full' />
						<Skeleton className='h-10 w-full' />
					</div>
				) : isError ? (
					<p className='px-3 py-4 text-sm text-muted-foreground'>
						Couldn't load the competitions.{" "}
						<button type='button' className='font-medium text-foreground underline underline-offset-2' onClick={() => void refetch()}>
							Try again
						</button>
					</p>
				) : (
					data.map((competition) => <CompetitionRow key={competition.id} competition={competition} />)
				)}
			</div>
		</div>
	);
}

function CompetitionRow({ competition }: Readonly<{ competition: AdminCompetition }>) {
	const { mutate: setActive } = useSetCompetitionActive();
	const id = `active-${competition.id}`;

	return (
		<div className='flex items-start gap-3 px-3 py-3'>
			<label htmlFor={id} className='min-w-0 flex-1 cursor-pointer'>
				<span className='block text-sm font-medium'>{competition.name}</span>
				<span className='block text-xs text-muted-foreground'>
					{competition.provider} {competition.provider_ref}
					{competition.season ? `, ${competition.season}` : ""}
				</span>
				<span className='block text-xs text-muted-foreground'>
					{competition.synced_at
						? `Synced ${describeDeadline(new Date(competition.synced_at)).relative}`
						: "Never synced"}
				</span>
				<span className='block text-xs text-muted-foreground'>
					Followed by {competition.rooms} {competition.rooms === 1 ? "room" : "rooms"}
				</span>
				<span className='block text-xs text-muted-foreground'>
					{competition.upcoming} upcoming {competition.upcoming === 1 ? "match" : "matches"}
				</span>
			</label>
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
