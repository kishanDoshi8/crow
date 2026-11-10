import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SearchIcon } from "lucide-react";
import { useExploreRooms } from "@/features/rooms/hooks/room";
import type { ExploreRoom } from "@/shared/lib/api";
import { Input, Skeleton } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";

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
		<div className='mt-4 flex flex-col gap-3'>
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
					className='pl-9'
				/>
			</div>

			{isPending ? (
				[0, 1, 2].map((row) => <Skeleton key={row} aria-hidden='true' className='h-28 rounded-xl' />)
			) : error ? (
				<p className='py-6 text-center text-sm text-muted-foreground'>Couldn't load public rooms.</p>
			) : !rooms || rooms.length === 0 ? (
				<p className='py-6 text-center text-sm text-muted-foreground'>
					{search ? "No public rooms match that." : "No public rooms yet. Make yours public from Room settings."}
				</p>
			) : (
				<ul className='flex flex-col gap-2.5'>
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
	const meta = [
		`${room.member_count} / ${room.member_limit} members`,
		room.series_title,
	]
		.filter(Boolean)
		.join(" · ");
	const activity =
		room.open_prediction_count > 0
			? `${room.open_prediction_count} open now`
			: room.last_activity_at
				? `Active ${activeAgo(room.last_activity_at)}`
				: null;

	return (
		<Link
			to={href}
			className={cn(
				"flex flex-col gap-2 rounded-xl border bg-card p-3.5 transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				isFull && room.my_status !== "member" && "opacity-70",
			)}
		>
			<span className='flex items-center gap-3'>
				<span
					className='size-9 shrink-0 rounded-lg bg-linear-to-br from-primary to-accent'
					aria-hidden='true'
				/>
				<span className='min-w-0 flex-1'>
					<span className='block truncate font-semibold'>{room.name}</span>
					<span className='block truncate text-xs text-muted-foreground'>{meta}</span>
				</span>
				<ExploreAction room={room} isFull={isFull} />
			</span>
			{room.description ? (
				<span className='line-clamp-2 text-sm text-foreground/85'>{room.description}</span>
			) : null}
			{activity ? (
				<span className='flex items-center gap-1.5 text-xs text-muted-foreground'>
					{room.open_prediction_count > 0 ? (
						<span className='size-1.5 rounded-full bg-live' aria-hidden='true' />
					) : null}
					{activity}
				</span>
			) : null}
		</Link>
	);
}

// What tapping the card does, as a label: the card itself is the link.
function ExploreAction({ room, isFull }: Readonly<{ room: ExploreRoom; isFull: boolean }>) {
	const pill = "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold";
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
		<span className={cn(pill, "bg-primary text-primary-foreground")}>Join</span>
	);
}

// "today", "yesterday", "5 days ago": how fresh a room is, roughly.
function activeAgo(iso: string) {
	const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
	if (days <= 0) return "today";
	if (days === 1) return "yesterday";
	return `${days} days ago`;
}
