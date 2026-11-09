import { useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
	ChevronDownIcon,
	ChevronsUpDownIcon,
	EllipsisVerticalIcon,
	InboxIcon,
	LayersIcon,
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

const ITEM =
	"flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
// The rail: the same items as squares, icon only.
const RAIL_ITEM =
	"flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ACTIVE = "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary";

// Desktop sidebar widths, shared with the room layout's content offset.
export const SIDEBAR_WIDTH = { open: "16rem", rail: "4rem" } as const;

type Props = {
	room: Room;
	// Collapsed: a thin rail of icons, labels on hover.
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
	const toResolve = queue?.to_resolve.length ?? 0;
	const memberCount = room.members.length;
	const seriesLabel = currentSeries?.title ?? (can.organize ? "Start a series" : "No series yet");
	const item = (isActive: boolean) => cn(collapsed ? RAIL_ITEM : ITEM, isActive && ACTIVE);

	return (
		<aside
			aria-label='Room'
			className={cn(
				"fixed inset-y-0 left-0 z-30 hidden flex-col gap-1 border-r bg-sidebar py-4 lg:flex",
				collapsed ? "w-16 items-center px-2" : "w-64 px-3",
			)}
		>
			{player ? (
				<RoomSwitcherPopover playerId={player.id}>
					{collapsed ? (
						<button
							type='button'
							title={`${room.name} · switch room`}
							aria-label={`${room.name}. Switch room`}
							className='rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
						>
							<span
								className='block size-10 rounded-lg bg-linear-to-br from-primary to-accent'
								aria-hidden='true'
							/>
						</button>
					) : (
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
					)}
				</RoomSwitcherPopover>
			) : null}

			<div className={cn("mt-2 flex flex-col gap-1", collapsed ? "items-center" : "items-start")}>
				<SeriesPickerPopover roomId={room.id} roomCode={room.code} isOrganizer={can.organize}>
					{collapsed ? (
						<button
							type='button'
							title={`Series: ${seriesLabel}`}
							aria-label={`Series: ${currentSeries?.title ?? "none"}. Change series`}
							className={cn(RAIL_ITEM, "relative")}
						>
							<LayersIcon className='size-4.5' aria-hidden='true' />
							{currentSeries?.status === "active" ? (
								<span
									aria-hidden='true'
									className='absolute top-2.5 right-2.5 size-1.5 rounded-full bg-live'
								/>
							) : null}
						</button>
					) : (
						<button
							type='button'
							className='flex w-full min-w-0 items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 py-1 pr-2 pl-3 text-xs font-medium text-foreground/85 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
							aria-label={`Series: ${currentSeries?.title ?? "none"}. Change series`}
						>
							{currentSeries?.status === "active" ? (
								<span aria-hidden='true' className='size-1.5 shrink-0 rounded-full bg-live' />
							) : null}
							<span className='truncate'>{seriesLabel}</span>
							<ChevronDownIcon className='ml-auto size-3.5 shrink-0' />
						</button>
					)}
				</SeriesPickerPopover>
			</div>

			<nav
				aria-label='Room navigation'
				className={cn("mt-3 flex flex-col gap-1 border-t pt-3", collapsed && "items-center")}
			>
				{ROOM_TABS.map(({ label, segment, icon: Icon }) => {
					const to = segment ? `${base}/${segment}` : base;
					return (
						<RailTip key={label} label={label} collapsed={collapsed}>
							<NavLink
								to={to}
								end={segment.length === 0}
								aria-label={collapsed ? label : undefined}
								onClick={(event) => {
									event.preventDefault();
									switchTab(to);
								}}
								className={({ isActive }) => item(isActive)}
							>
								<Icon className='size-4.5' aria-hidden='true' />
								{collapsed ? null : label}
							</NavLink>
						</RailTip>
					);
				})}
			</nav>

			{can.resolve ? (
				<div className={cn("mt-3 flex flex-col gap-1 border-t pt-3", collapsed && "items-center")}>
					{collapsed ? null : (
						<p className='px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>
							Staff
						</p>
					)}
					<RailTip label={toResolve > 0 ? `Needs you · ${toResolve}` : "Needs you"} collapsed={collapsed}>
						<NavLink
							to={`${base}/manage`}
							aria-label={collapsed ? `Needs you${toResolve > 0 ? `, ${toResolve}` : ""}` : undefined}
							className={({ isActive }) => item(isActive)}
						>
							{/* In the rail, the count is the icon. */}
							{collapsed && toResolve > 0 ? (
								<NeedsYouBadge count={toResolve} />
							) : (
								<InboxIcon className='size-4.5' aria-hidden='true' />
							)}
							{collapsed ? null : (
								<>
									<span className='flex-1'>Needs you</span>
									{toResolve > 0 ? <NeedsYouBadge count={toResolve} /> : null}
								</>
							)}
						</NavLink>
					</RailTip>
					{can.organize && currentSeries?.status === "active" ? (
						<RailTip label='New prediction' collapsed={collapsed}>
							<Link
								to={`${base}/predictions/new`}
								state={{ seriesId: currentSeries.id }}
								aria-label={collapsed ? "New prediction" : undefined}
								className={cn(
									"mt-1 flex items-center justify-center gap-2 rounded-lg bg-linear-to-r from-primary to-accent text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									collapsed ? "size-11" : "h-10",
								)}
							>
								<PlusIcon className='size-4' aria-hidden='true' />
								{collapsed ? null : "New prediction"}
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
					className={cn(collapsed ? RAIL_ITEM : ITEM, !collapsed && "w-full text-left")}
				>
					<UserPlusIcon className='size-4.5' aria-hidden='true' />
					{collapsed ? null : "Invite friends"}
				</button>
			</RailTip>

			<RailTip label='Room menu & account' collapsed={collapsed}>
				<button
					type='button'
					onClick={() => setIsMenuOpen(true)}
					className={cn(
						"mt-1 flex items-center gap-2.5 rounded-lg border-t pt-3 pb-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						collapsed ? "justify-center px-0" : "px-2",
					)}
					aria-label='Room menu'
				>
					<span className='flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold'>
						{player ? player.username.slice(0, 2).toUpperCase() : ""}
					</span>
					{collapsed ? null : (
						<>
							<span className='min-w-0 flex-1 leading-tight'>
								<span className='block truncate text-sm font-semibold'>{player?.username}</span>
								<span className='block text-xs text-muted-foreground'>Room menu &amp; account</span>
							</span>
							<EllipsisVerticalIcon className='size-4 shrink-0 text-muted-foreground' />
						</>
					)}
				</button>
			</RailTip>

			<RoomMenuDrawer room={room} open={isMenuOpen} onOpenChange={setIsMenuOpen} />
		</aside>
	);
}

function NeedsYouBadge({ count }: Readonly<{ count: number }>) {
	return (
		<span className='flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground tabular-nums'>
			{count}
		</span>
	);
}

// The rail shows icons only, so each gets its label on hover and focus.
function RailTip({
	label,
	collapsed,
	children,
}: Readonly<{ label: string; collapsed: boolean; children: ReactNode }>) {
	if (!collapsed) return children;
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side='right'>{label}</TooltipContent>
		</Tooltip>
	);
}
