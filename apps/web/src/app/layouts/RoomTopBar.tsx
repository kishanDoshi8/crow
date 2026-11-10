import { useLocation } from "react-router-dom";
import { ChevronLeftIcon, ChevronRightIcon, PanelLeftIcon } from "lucide-react";
import { ROOM_TABS, type Room } from "@/features/rooms";
import { WalletPopover, useCurrentSeries, useSeriesWallet } from "@/features/series";
import { Button, OfflineBar } from "@/shared/ui";

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
// points on the right. Activity is in the room menu.
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
				{/* The toggle stays by the sidebar; the rest lines up with the
				    page content, so on a wide screen the title and points don't
				    drift to opposite edges. */}
				<Button
					variant='ghost'
					size='icon'
					className='shrink-0'
					onClick={onToggleSidebar}
					aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
					aria-expanded={sidebarOpen}
				>
					<PanelLeftIcon />
				</Button>
				<div className='mx-auto flex w-full max-w-260 min-w-0 items-center gap-2 px-4'>
					{showBack ? (
						<Button variant='ghost' size='sm' onClick={onBack} className='gap-1 pl-1.5'>
							<ChevronLeftIcon />
							Back
						</Button>
					) : null}
					{/* With the sidebar collapsed, say which room this is. */}
					{sidebarOpen || heading === room.name ? null : (
						<>
							<span className='min-w-0 shrink truncate text-base text-muted-foreground'>
								{room.name}
							</span>
							<ChevronRightIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
						</>
					)}
					<h1 className='min-w-0 truncate text-base font-semibold'>{heading}</h1>
					<div className='flex-1' />
					{wallet ? <WalletPopover wallet={wallet} /> : null}
				</div>
				{/* Balances the toggle, so the content row stays centred. */}
				<span className='size-9 shrink-0' aria-hidden='true' />
			</div>
			<OfflineBar />
		</header>
	);
}
