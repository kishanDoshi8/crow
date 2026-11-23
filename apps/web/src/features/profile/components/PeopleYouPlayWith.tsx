import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRightIcon } from "lucide-react";
import { usePeopleYouPlayWith } from "@/features/profile/hooks/profile";
import type { PersonYouPlayWith } from "@/shared/lib/api";
import { initialsOf } from "@/shared/lib/utils";
import { Avatar, AvatarFallback, Button, Skeleton } from "@/shared/ui";

// How many people show before "Show all".
const SHOWN = 5;

// Everyone you share a room with, each opening their profile. Worked out
// from your rooms; there are no friend requests.
export function PeopleYouPlayWith() {
	const { data: people, isPending, error } = usePeopleYouPlayWith();
	const [showAll, setShowAll] = useState(false);

	if (isPending) return <Skeleton aria-hidden='true' className='h-40 rounded-xl' />;
	if (error) {
		return <p className='text-sm text-muted-foreground'>Couldn't load people. Try again.</p>;
	}
	if (people.length === 0) {
		return (
			<p className='rounded-xl border border-dashed border-border/80 px-4 py-5 text-center text-sm text-muted-foreground'>
				Nobody here yet. Invite friends to a room and they'll show up.
			</p>
		);
	}

	const shown = showAll ? people : people.slice(0, SHOWN);

	return (
		<div className='flex flex-col gap-2'>
			<ul className='divide-y overflow-hidden rounded-xl border'>
				{shown.map((person) => (
					<li key={person.player_id}>
						<PersonRow person={person} />
					</li>
				))}
			</ul>
			{people.length > SHOWN ? (
				<Button variant='ghost' className='self-start' onClick={() => setShowAll((all) => !all)}>
					{showAll ? "Show fewer" : `Show all ${people.length}`}
				</Button>
			) : null}
		</div>
	);
}

function PersonRow({ person }: Readonly<{ person: PersonYouPlayWith }>) {
	// One room: name it. More: say how many.
	const together =
		person.shared_rooms === 1 ? person.rooms[0]?.name : `${person.shared_rooms} rooms together`;

	return (
		<Link
			to={`/players/${person.player_id}`}
			className='flex items-center gap-3 px-3 py-3 transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
		>
			<Avatar className='size-10'>
				<AvatarFallback className='bg-muted/70 text-xs font-semibold text-foreground/85'>
					{initialsOf(person.username)}
				</AvatarFallback>
			</Avatar>
			<span className='min-w-0 flex-1'>
				<span className='block truncate text-sm font-medium'>{person.username}</span>
				<span className='block truncate text-xs text-muted-foreground'>{together}</span>
			</span>
			<ChevronRightIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
		</Link>
	);
}
