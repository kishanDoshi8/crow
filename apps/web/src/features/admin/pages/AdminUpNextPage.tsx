import { useUpNextDemand } from "@/features/admin/hooks";
import type { UpNextDemand, UpNextDemandRow } from "@/shared/lib/api";
import { describeDeadline } from "@/shared/lib/deadline";
import { FactTag, Skeleton } from "@/shared/ui";

// What rooms want to predict next (their Up next picks), over the last 90
// days, leaving out rooms Crow admins own. What Crow doesn't have yet comes
// first: those are the event packs to add.
export default function AdminUpNextPage() {
	const { data, isPending, error } = useUpNextDemand();

	return (
		<div className='mx-auto flex w-full max-w-md flex-col gap-6 px-4 pb-10 pt-2 lg:max-w-2xl'>
			<p className='text-sm text-muted-foreground'>
				What rooms pick in Up next, over the last 90 days. Rooms owned by Crow admins aren't
				counted.
			</p>

			{error ? (
				<p className='text-sm text-muted-foreground'>Couldn't load Up next. Try again.</p>
			) : isPending ? (
				<div aria-hidden='true' className='flex flex-col gap-2'>
					<Skeleton className='h-20 rounded-xl' />
					<Skeleton className='h-20 rounded-xl' />
				</div>
			) : (
				<>
					<DemandList
						title='Not on Crow yet'
						description='Asked for by name. Candidates for a new event pack.'
						rows={data.requests}
						empty='Nobody has asked for anything Crow doesn’t have.'
					/>
					<DemandList
						title='On Crow'
						description='Competitions rooms picked from Crow.'
						rows={data.competitions}
						empty='No room has picked a competition yet.'
					/>
				</>
			)}
		</div>
	);
}

function DemandList({
	title,
	description,
	rows,
	empty,
}: Readonly<{
	title: string;
	description: string;
	rows: Array<UpNextDemandRow & Partial<UpNextDemand["competitions"][number]>>;
	empty: string;
}>) {
	return (
		<section className='flex flex-col gap-2'>
			<div>
				<h2 className='text-base font-semibold'>{title}</h2>
				<p className='text-xs text-muted-foreground'>{description}</p>
			</div>
			{rows.length === 0 ? (
				<p className='rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground'>
					{empty}
				</p>
			) : (
				<ul className='divide-y overflow-hidden rounded-xl border bg-card'>
					{rows.map((row) => (
						<li key={row.id ?? row.name} className='flex items-start gap-3 px-3.5 py-3'>
							<div className='flex min-w-0 flex-1 flex-col gap-1.5'>
								<p className='text-sm font-semibold wrap-anywhere'>{row.name}</p>
								<div className='flex flex-wrap gap-1.5'>
									<FactTag label='Picks'>{row.picks}</FactTag>
									{row.started > 0 ? <FactTag label='Series started'>{row.started}</FactTag> : null}
									<FactTag label='Last asked'>
										{describeDeadline(new Date(row.last_asked_at)).relative}
									</FactTag>
									{row.on_offer === false ? <FactTag label='Status'>Off or over</FactTag> : null}
								</div>
							</div>
							<div className='shrink-0 text-right'>
								<p className='text-2xl font-bold leading-none tabular-nums'>{row.rooms}</p>
								<p className='text-xs text-muted-foreground'>{row.rooms === 1 ? "room" : "rooms"}</p>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
