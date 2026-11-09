import { Link, useLocation } from "react-router-dom";
import { BellIcon, ChevronLeftIcon, PanelLeftIcon } from "lucide-react";
import { ROOM_TABS, type Room } from "@/features/rooms";
import { WalletPopover, useCurrentSeries, useSeriesWallet } from "@/features/series";
import { Button, OfflineBar } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";

type Props = {
	room: Room;
	// The page's own title; tab pages fall back to the tab's name.
	title?: string;
	showBack: boolean;
	onBack: () => void;
	sidebarOpen: boolean;
	onToggleSidebar: () => void;
};

// Desktop (lg and up): one slim bar on every room page, like the phone's
// header: the sidebar toggle, Back on inner pages, the page title, and the
// points and Activity on the right.
export function RoomTopBar({
	room,
	title,
	showBack,
	onBack,
	sidebarOpen,
	onToggleSidebar,
}: Readonly<Props>) {
	const { pathname } = useLocation();
	const { currentSeriesId } = useCurrentSeries(room.id);
	const { wallet } = useSeriesWallet(room.id, currentSeriesId);
	const base = `/rooms/${room.code}`;
	const segment = pathname.replace(/\/$/, "").slice(base.length).replace(/^\//, "");
	const tab = ROOM_TABS.find((item) => item.segment === segment);
	const heading = title ?? tab?.label ?? room.name;

	return (
		<header className='sticky top-0 z-20 hidden border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:block'>
			<div className='flex h-14 items-center gap-2 px-4'>
				<Button
					variant='ghost'
					size='icon'
					onClick={onToggleSidebar}
					aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
					aria-pressed={sidebarOpen}
				>
					<PanelLeftIcon />
				</Button>
				{showBack ? (
					<Button variant='ghost' size='sm' onClick={onBack} className='gap-1 pl-1.5'>
						<ChevronLeftIcon />
						Back
					</Button>
				) : null}
				<h1 className='min-w-0 truncate text-base font-semibold'>
					{/* With the sidebar hidden, say which room this is. */}
					{sidebarOpen || heading === room.name ? null : (
						<span className='font-normal text-muted-foreground'>{room.name} · </span>
					)}
					{heading}
				</h1>
				<div className='flex-1' />
				{wallet ? <WalletPopover wallet={wallet} /> : null}
				<Button variant='ghost' size='icon' className='relative' asChild>
					<Link
						to={`${base}/activities`}
						aria-label={room.has_unseen_activities ? "Activity, new updates" : "Activity"}
					>
						<BellIcon />
						<span
							className={cn(
								"absolute top-1.5 right-1.5 size-2.5 rounded-full border-2 border-background bg-destructive",
								!room.has_unseen_activities && "hidden",
							)}
							aria-hidden='true'
						/>
					</Link>
				</Button>
			</div>
			<OfflineBar />
		</header>
	);
}
