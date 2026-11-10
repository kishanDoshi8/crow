import { useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
	ChevronDownIcon,
	ChevronsUpDownIcon,
	EllipsisVerticalIcon,
	InboxIcon,
	LayersIcon,
	LayoutGridIcon,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

// Desktop sidebar widths, shared with the room layout's content offset.
// Collapsed, the rail's inside (4rem less 2 × 0.625rem padding) is exactly
// one 44px item wide, so every item becomes a square.
export const SIDEBAR_WIDTH = { open: "16rem", rail: "4rem" } as const;

// Every row is one height (h-11) in both states, with its icon 13px in from
// the left: centred in the 44px square when collapsed, and in the same spot
// when open. Collapsing only narrows the sidebar and fades the labels, so
// nothing moves.
const ITEM =
	"relative flex h-11 w-full shrink-0 items-center gap-3 rounded-lg px-3.25 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ACTIVE = "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary";
const ICON = "size-4.5 shrink-0";

type Props = {
	room: Room;
	// Collapsed: a 4rem rail, icons only, labels on hover.
	collapsed: boolean;
};

// Desktop (lg and up): the room, its series and its pages down the left
// side, in place of the phone's bottom nav and room menu. Rooms and series
// switch from dropdowns at the top. Points and Activity are in the top bar,
// whose toggle collapses this to a rail of icons.
export function RoomSidebar({ room, collapsed }: Readonly<Props>) {
	const { data: player } = usePlayer();
	const { can } = useRoomRole(room);
	const { currentSeries } = useCurrentSeries(room.id);
	const { data: queue } = useManageQueue(room.id, can.resolve);
	const { openInvite } = useRoomActions();
	const { switchTab } = useAppNavigation();
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const base = `/rooms/${room.code}`;
	// Results to reveal, plus people waiting to be let in.
	const toResolve = (queue?.to_resolve.length ?? 0) + (queue?.join_requests?.length ?? 0);
	const memberCount = room.members.length;
	const seriesLabel = currentSeries?.title ?? (can.organize ? "Start a series" : "No series yet");
	// Labels fade as the sidebar narrows, and stay out of the tab order.
	const label = cn(
		"min-w-0 flex-1 truncate whitespace-nowrap transition-opacity duration-200 motion-reduce:transition-none",
		collapsed && "pointer-events-none opacity-0",
	);

	return (
		<aside
			aria-label='Room'
			className={cn(
				"fixed inset-y-0 left-0 z-30 hidden flex-col gap-1 overflow-hidden bg-sidebar px-2.5 py-4 transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex",
				collapsed ? "w-16" : "w-64",
			)}
		>
			{/* The edge, drawn over the sidebar rather than as a border, so the
			    rail's inside stays exactly one square item wide. */}
			<span className='pointer-events-none absolute inset-y-0 right-0 w-px bg-border' aria-hidden='true' />
			{player ? (
				<RoomSwitcherPopover playerId={player.id}>
					<button
						type='button'
						title={collapsed ? `${room.name} · switch room` : undefined}
						aria-label={`${room.name}. Switch room`}
						className='flex h-11 w-full shrink-0 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
					>
						{/* The phone header's room button. */}
						<span className='flex size-11 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-primary to-accent text-primary-foreground'>
							<LayoutGridIcon className='size-5' aria-hidden='true' />
						</span>
						<span className={cn(label, "leading-tight")}>
							<span className='block truncate font-bold'>{room.name}</span>
							<span className='block text-xs text-muted-foreground'>
								{memberCount} {memberCount === 1 ? "member" : "members"}
							</span>
						</span>
						<ChevronsUpDownIcon className={cn("size-4 shrink-0 text-muted-foreground", label, "flex-none")} />
					</button>
				</RoomSwitcherPopover>
			) : null}

			<SeriesPickerPopover roomId={room.id} roomCode={room.code} isOrganizer={can.organize}>
				<button
					type='button'
					title={collapsed ? `Series: ${seriesLabel}` : undefined}
					aria-label={`Series: ${currentSeries?.title ?? "none"}. Change series`}
					className={cn(ITEM, "mt-2")}
				>
					<span className='relative flex'>
						<LayersIcon className={ICON} aria-hidden='true' />
						{currentSeries?.status === "active" ? (
							<span
								aria-hidden='true'
								className='absolute -top-0.5 -right-0.5 size-2 rounded-full border-2 border-sidebar bg-live'
							/>
						) : null}
					</span>
					<span className={cn(label, "text-foreground/85")}>{seriesLabel}</span>
					<ChevronDownIcon className={cn("size-3.5 shrink-0", label, "flex-none")} />
				</button>
			</SeriesPickerPopover>

			<nav aria-label='Room navigation' className='mt-2 flex flex-col gap-1 border-t pt-3'>
				{ROOM_TABS.map(({ label: name, segment, icon: Icon }) => {
					const to = segment ? `${base}/${segment}` : base;
					return (
						<RailTip key={name} label={name} collapsed={collapsed}>
							<NavLink
								to={to}
								end={segment.length === 0}
								aria-label={collapsed ? name : undefined}
								onClick={(event) => {
									event.preventDefault();
									switchTab(to);
								}}
								className={({ isActive }) => cn(ITEM, isActive && ACTIVE)}
							>
								<Icon className={ICON} aria-hidden='true' />
								<span className={label}>{name}</span>
							</NavLink>
						</RailTip>
					);
				})}
			</nav>

			{can.resolve ? (
				<div className='mt-2 flex flex-col gap-1 border-t pt-3'>
					{/* Keeps its height when collapsed, so the items below stay put. */}
					<p
						className={cn(
							label,
							"flex-none px-3.25 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
						)}
					>
						Staff
					</p>
					<RailTip label={toResolve > 0 ? `Needs you · ${toResolve}` : "Needs you"} collapsed={collapsed}>
						<NavLink
							to={`${base}/manage`}
							aria-label={collapsed ? `Needs you${toResolve > 0 ? `, ${toResolve}` : ""}` : undefined}
							className={({ isActive }) => cn(ITEM, isActive && ACTIVE)}
						>
							{/* Collapsed, the count stands in for the icon. */}
							{collapsed && toResolve > 0 ? (
								<span className='-mx-px flex w-5 shrink-0 justify-center'>
									<NeedsYouBadge count={toResolve} />
								</span>
							) : (
								<InboxIcon className={ICON} aria-hidden='true' />
							)}
							<span className={label}>Needs you</span>
							{!collapsed && toResolve > 0 ? <NeedsYouBadge count={toResolve} /> : null}
						</NavLink>
					</RailTip>
					{can.organize && currentSeries?.status === "active" ? (
						<RailTip label='New prediction' collapsed={collapsed}>
							<Link
								to={`${base}/predictions/new`}
								state={{ seriesId: currentSeries.id }}
								aria-label={collapsed ? "New prediction" : undefined}
								className={cn(
									ITEM,
									"mt-1 bg-linear-to-r from-primary to-accent font-semibold text-primary-foreground hover:bg-transparent hover:text-primary-foreground hover:brightness-110",
								)}
							>
								<PlusIcon className={ICON} aria-hidden='true' />
								<span className={label}>New prediction</span>
							</Link>
						</RailTip>
					) : null}
				</div>
			) : null}

			<div className='flex-1' />

			<RailTip label='Invite friends' collapsed={collapsed}>
				<button
					type='button'
					onClick={openInvite}
					aria-label={collapsed ? "Invite friends" : undefined}
					className={ITEM}
				>
					<UserPlusIcon className={ICON} aria-hidden='true' />
					<span className={label}>Invite friends</span>
				</button>
			</RailTip>

			<div className='mt-1 border-t pt-2'>
				<RailTip label='Room menu & account' collapsed={collapsed}>
					<button
						type='button'
						onClick={() => setIsMenuOpen(true)}
						aria-label='Room menu'
						className={cn(ITEM, "px-1.5 text-foreground")}
					>
						<span className='flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold'>
							{player ? player.username.slice(0, 2).toUpperCase() : ""}
						</span>
						<span className={cn(label, "leading-tight")}>
							<span className='block truncate text-sm font-semibold'>{player?.username}</span>
							<span className='block text-xs font-normal text-muted-foreground'>
								Room menu &amp; account
							</span>
						</span>
						<EllipsisVerticalIcon className={cn("size-4 shrink-0 text-muted-foreground", label, "flex-none")} />
					</button>
				</RailTip>
			</div>

			<RoomMenuDrawer room={room} open={isMenuOpen} onOpenChange={setIsMenuOpen} />
		</aside>
	);
}

function NeedsYouBadge({ count }: Readonly<{ count: number }>) {
	return (
		<span className='flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground tabular-nums'>
			{count}
		</span>
	);
}

// The rail shows icons only, so each gets its label on hover and focus. The
// trigger is a wrapper rather than the item itself: merging the trigger's
// props into a NavLink would break its className function.
function RailTip({
	label,
	collapsed,
	children,
}: Readonly<{ label: string; collapsed: boolean; children: ReactNode }>) {
	if (!collapsed) return children;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className='block'>{children}</span>
			</TooltipTrigger>
			<TooltipContent side='right'>{label}</TooltipContent>
		</Tooltip>
	);
}
