import { useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
	ChevronDownIcon,
	ChevronsUpDownIcon,
	EllipsisVerticalIcon,
	InboxIcon,
	PlusIcon,
	UserPlusIcon,
} from "lucide-react";
import {
	ROOM_TABS,
	RoomMenuDrawer,
	RoomSwitcherPopover,
	useManageQueue,
	useRoomRole,
	type Room,
} from "@/features/rooms";
import { SeriesPickerPopover, useCurrentSeries } from "@/features/series";
import { usePlayer } from "@/features/home";
import { useAppNavigation } from "@/shared/lib/navigation";
import { useRoomActions } from "@/shared/lib/roomActions";
import { cn } from "@/shared/lib/utils";

const ITEM =
	"flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ACTIVE = "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary";

// Desktop (lg and up): the room, its series and its pages down the left
// side, in place of the phone's bottom nav and room menu. Rooms and series
// switch from dropdowns at the top. Points and Activity are in the top bar.
// It can be hidden from the top bar's toggle.
export function RoomSidebar({ room }: Readonly<{ room: Room }>) {
	const { data: player } = usePlayer();
	const { can } = useRoomRole(room);
	const { currentSeries } = useCurrentSeries(room.id);
	const { data: queue } = useManageQueue(room.id, can.resolve);
	const { openInvite } = useRoomActions();
	const { switchTab } = useAppNavigation();
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const base = `/rooms/${room.code}`;
	const toResolve = queue?.to_resolve.length ?? 0;
	const memberCount = room.members.length;

	return (
		<aside
			aria-label='Room'
			className='fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-1 border-r bg-sidebar px-3 py-4 lg:flex'
		>
			{player ? (
				<RoomSwitcherPopover playerId={player.id}>
					<button
						type='button'
						className='flex items-center gap-2.5 rounded-xl border bg-card p-2 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
						aria-label={`${room.name}. Switch room`}
					>
						<span
							className='size-9 shrink-0 rounded-lg bg-linear-to-br from-primary to-accent'
							aria-hidden='true'
						/>
						<span className='min-w-0 flex-1 leading-tight'>
							<span className='block truncate font-bold'>{room.name}</span>
							<span className='block text-xs text-muted-foreground'>
								{memberCount} {memberCount === 1 ? "member" : "members"}
							</span>
						</span>
						<ChevronsUpDownIcon className='size-4 shrink-0 text-muted-foreground' />
					</button>
				</RoomSwitcherPopover>
			) : null}

			<div className='mt-2 flex flex-col items-start gap-1'>
				<SeriesPickerPopover roomId={room.id} roomCode={room.code} isOrganizer={can.organize}>
					<button
						type='button'
						className='flex w-full min-w-0 items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 py-1 pr-2 pl-3 text-xs font-medium text-foreground/85 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
						aria-label={`Series: ${currentSeries?.title ?? "none"}. Change series`}
					>
						{currentSeries?.status === "active" ? (
							<span aria-hidden='true' className='size-1.5 shrink-0 rounded-full bg-live' />
						) : null}
						<span className='truncate'>
							{currentSeries?.title ?? (can.organize ? "Start a series" : "No series yet")}
						</span>
						<ChevronDownIcon className='ml-auto size-3.5 shrink-0' />
					</button>
				</SeriesPickerPopover>
			</div>

			<nav aria-label='Room navigation' className='mt-3 flex flex-col gap-1 border-t pt-3'>
				{ROOM_TABS.map(({ label, segment, icon: Icon }) => {
					const to = segment ? `${base}/${segment}` : base;
					return (
						<NavLink
							key={label}
							to={to}
							end={segment.length === 0}
							onClick={(event) => {
								event.preventDefault();
								switchTab(to);
							}}
							className={({ isActive }) => cn(ITEM, isActive && ACTIVE)}
						>
							<Icon className='size-4.5' aria-hidden='true' />
							{label}
						</NavLink>
					);
				})}
			</nav>

			{can.resolve ? (
				<div className='mt-3 flex flex-col gap-1 border-t pt-3'>
					<p className='px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>
						Staff
					</p>
					<NavLink to={`${base}/manage`} className={({ isActive }) => cn(ITEM, isActive && ACTIVE)}>
						<InboxIcon className='size-4.5' aria-hidden='true' />
						<span className='flex-1'>Needs you</span>
						{toResolve > 0 ? (
							<span className='flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground tabular-nums'>
								{toResolve}
							</span>
						) : null}
					</NavLink>
					{can.organize && currentSeries?.status === "active" ? (
						<Link
							to={`${base}/predictions/new`}
							state={{ seriesId: currentSeries.id }}
							className='mt-1 flex h-10 items-center justify-center gap-2 rounded-lg bg-linear-to-r from-primary to-accent text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
						>
							<PlusIcon className='size-4' aria-hidden='true' />
							New prediction
						</Link>
					) : null}
				</div>
			) : null}

			<div className='flex-1' />

			<SidebarButton onClick={openInvite} icon={<UserPlusIcon className='size-4.5' aria-hidden='true' />}>
				Invite friends
			</SidebarButton>

			<button
				type='button'
				onClick={() => setIsMenuOpen(true)}
				className='mt-1 flex items-center gap-2.5 rounded-lg border-t px-2 pt-3 pb-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
				aria-label='Room menu'
			>
				<span className='flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold'>
					{player ? player.username.slice(0, 2).toUpperCase() : ""}
				</span>
				<span className='min-w-0 flex-1 leading-tight'>
					<span className='block truncate text-sm font-semibold'>{player?.username}</span>
					<span className='block text-xs text-muted-foreground'>Room menu &amp; account</span>
				</span>
				<EllipsisVerticalIcon className='size-4 shrink-0 text-muted-foreground' />
			</button>

			<RoomMenuDrawer room={room} open={isMenuOpen} onOpenChange={setIsMenuOpen} />
		</aside>
	);
}

function SidebarButton({
	onClick,
	icon,
	children,
}: Readonly<{ onClick: () => void; icon: ReactNode; children: ReactNode }>) {
	return (
		<button type='button' onClick={onClick} className={cn(ITEM, "w-full text-left")}>
			{icon}
			{children}
		</button>
	);
}
