import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SearchIcon } from "lucide-react";
import { useExploreRooms } from "@/features/rooms/hooks/room";
import type { ExploreRoom } from "@/shared/lib/api";
import { Input, Skeleton } from "@/shared/ui";
import { capitalize, cn } from "@/shared/lib/utils";

// Public rooms anyone can find, busiest first. A card opens the room's join
// page, which joins, sends a request, or says it's full.
export function ExploreRooms() {
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");

	useEffect(() => {
		const timeoutId = globalThis.setTimeout(() => setSearch(searchInput.trim()), 300);
		return () => globalThis.clearTimeout(timeoutId);
	}, [searchInput]);

	const { data: rooms, isPending, error } = useExploreRooms(search);

	return (
		<div className='flex flex-col gap-3'>
			<div className='relative'>
				<SearchIcon
					className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
					aria-hidden='true'
				/>
				<Input
					type='search'
					value={searchInput}
					onChange={(event) => setSearchInput(event.target.value)}
					placeholder='Search public rooms'
					aria-label='Search public rooms'
					className='h-11 pl-9'
				/>
			</div>

			{isPending ? (
				[0, 1, 2].map((row) => <Skeleton key={row} aria-hidden='true' className='h-44 rounded-2xl' />)
			) : error ? (
				<p className='py-6 text-center text-sm text-muted-foreground'>Couldn't load public rooms.</p>
			) : !rooms || rooms.length === 0 ? (
				<p className='py-6 text-center text-sm text-muted-foreground'>
					{search ? "No public rooms match that." : "No public rooms yet. Make yours public from Room settings."}
				</p>
			) : (
				<ul className='flex flex-col gap-3'>
					{rooms.map((room) => (
						<li key={room.id}>
							<ExploreCard room={room} />
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function ExploreCard({ room }: Readonly<{ room: ExploreRoom }>) {
	const isFull = room.member_count >= room.member_limit;
	const href =
		room.my_status === "member"
			? `/rooms/${room.room_code}`
			: `/rooms/${room.room_code}/join?ref=explore`;
	const isMember = room.my_status === "member";

	return (
		<Link
			to={href}
			className={cn(
				"flex flex-col gap-2.5 rounded-2xl border bg-card p-3.5 transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				isFull && !isMember && "opacity-70",
			)}
		>
			<span className='flex items-center justify-between gap-3'>
				<span className='truncate text-base font-semibold leading-snug'>{room.name}</span>
				<ExploreAction room={room} isFull={isFull} />
			</span>
			{room.description ? (
				<span className='line-clamp-2 text-sm text-foreground/85'>{room.description}</span>
			) : null}
			<ExploreFacts room={room} />
			{isMember ? (
				<span className='text-xs text-muted-foreground'>You're in this room.</span>
			) : null}
		</Link>
	);
}

const FACT = "min-w-0 px-3 py-2";
const FACT_LABEL = "block truncate text-xs text-muted-foreground";
const FACT_VALUE = "block truncate text-sm font-semibold tabular-nums";

// What it's playing gets a full row, so a long series name isn't cut off;
// the two numbers share the row below.
function ExploreFacts({ room }: Readonly<{ room: ExploreRoom }>) {
	const isOpen = room.open_prediction_count > 0;
	return (
		<span className='grid grid-cols-2 overflow-hidden rounded-xl border'>
			{room.series_title ? (
				<span className={cn(FACT, "col-span-2 border-b")}>
					<span className={FACT_LABEL}>Playing</span>
					<span className={FACT_VALUE}>{room.series_title}</span>
				</span>
			) : null}
			<span className={FACT}>
				<span className={FACT_LABEL}>Members</span>
				<span className={FACT_VALUE}>
					{room.member_count} of {room.member_limit}
				</span>
			</span>
			<span className={cn(FACT, "border-l")}>
				<span className={FACT_LABEL}>{isOpen ? "Open now" : "Last active"}</span>
				<span className={cn(FACT_VALUE, isOpen && "text-primary")}>
					{isOpen
						? room.open_prediction_count
						: room.last_activity_at
							? capitalize(activeAgo(room.last_activity_at))
							: "Not yet"}
				</span>
			</span>
		</span>
	);
}

// What tapping the card does, as a label: the card itself is the link.
function ExploreAction({ room, isFull }: Readonly<{ room: ExploreRoom; isFull: boolean }>) {
	const pill = "shrink-0 rounded-full px-3.5 py-1 text-[13px] font-semibold";
	if (room.my_status === "member") {
		return <span className={cn(pill, "bg-secondary text-foreground")}>Open</span>;
	}
	if (room.my_status === "requested") {
		return <span className={cn(pill, "border border-accent/40 text-accent")}>Requested</span>;
	}
	if (room.my_status === "removed") return null;
	if (isFull) {
		return <span className={cn(pill, "bg-secondary text-muted-foreground")}>Full</span>;
	}
	return room.join_policy === "request" ? (
		<span className={cn(pill, "border border-border text-foreground")}>Request</span>
	) : (
		<span className={cn(pill, "bg-linear-to-r from-primary to-accent text-foreground")}>Join</span>
	);
}

// "today", "yesterday", "5 days ago": how fresh a room is, roughly.
function activeAgo(iso: string) {
	const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
	if (days <= 0) return "today";
	if (days === 1) return "yesterday";
	return `${days} days ago`;
}
