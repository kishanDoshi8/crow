import { ChevronRightIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useAdminCompetitions } from "@/features/admin/hooks";
import { CompetitionMark } from "@/features/fixtures";
import { Skeleton } from "@/shared/ui";

// /admin → Fixtures: pick a competition to see its coming matches and
// their questions.
export default function AdminFixturesPage() {
	const { data, isPending, isError, refetch } = useAdminCompetitions();

	if (isPending) return <Skeleton className='h-40 w-full rounded-2xl' />;

	if (isError) {
		return (
			<p className='text-sm text-muted-foreground'>
				Couldn't load the competitions.{" "}
				<button type='button' className='font-medium text-foreground underline underline-offset-2' onClick={() => void refetch()}>
					Try again
				</button>
			</p>
		);
	}

	const active = data.filter((c) => c.active);

	return (
		<div className='space-y-2'>
			<p className='px-1 text-xs text-muted-foreground'>
				Hide a question from rooms, or reword it for one match. Turn competitions on in Competitions.
			</p>
			{active.length === 0 ? (
				<p className='rounded-2xl border bg-card px-3 py-4 text-sm text-muted-foreground'>No competition is on.</p>
			) : (
				<div className='divide-y rounded-2xl border bg-card'>
					{active.map((competition) => (
						<Link
							key={competition.id}
							to={`/admin/fixtures/${competition.id}`}
							className='flex items-center gap-3 px-3 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
						>
							<CompetitionMark name={competition.name} />
							<span className='min-w-0 flex-1'>
								<span className='block truncate text-sm font-semibold'>{competition.name}</span>
								<span className='block text-xs text-muted-foreground'>
									{competition.upcoming} upcoming {competition.upcoming === 1 ? "match" : "matches"}
								</span>
							</span>
							<ChevronRightIcon className='size-4 text-muted-foreground' aria-hidden='true' />
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
