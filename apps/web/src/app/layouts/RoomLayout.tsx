import {
	Navigate,
	Outlet,
	generatePath,
	useMatches,
	useNavigate,
	useParams,
} from "react-router-dom";
import type {
	Room} from "@/features/rooms";
import {
	useRoom,
	RoomPrefetcher,
	RoomInviteShare,
	RoomSwitcherDrawer,
	useRoomRealtime,
	useRoomRole,
} from "@/features/rooms";
import { RoomPreferencesDialog } from "@/features/preferences";
import { SeriesPickerDrawer } from "@/features/series";
import { RoomActionsContext, type RoomActions } from "@/shared/lib/roomActions";
import type { RoomOutletContext } from "@/shared/lib/roomContext";
import { RoomHeader } from "@/features/predictions";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { usePlayer, useSetLastVisitedRoom } from "@/features/home";
import { usePreferences, useMarkHowToPlaySeen } from "@/features/preferences";
import { Loading } from "@/shared/ui";
import { useAppNavigation } from "@/shared/lib/navigation";
import { RebrandWelcomeDialog } from "@/features/onboarding";
import { prefetchRoomPages } from "@/app/router/roomPages";
import { RoomSidebar, SIDEBAR_WIDTH } from "@/app/layouts/RoomSidebar";
import { RoomTopBar } from "@/app/layouts/RoomTopBar";
import { cn } from "@/shared/lib/utils";

const HowToPlayModal = lazy(
	() => import("@/features/onboarding/components/HowToPlayModal"),
);

export default function RoomLayout() {
	const navigate = useNavigate();
	const { back } = useAppNavigation();
	const matches = useMatches();
	const activeMatch = matches.at(-1);
	const { data: player, isPending: isPlayerLoading } = usePlayer();
	const params = useParams();
	const { roomCode } = params as { roomCode?: string };
	const { data: room, isPending, isError } = useRoom(roomCode);
	const headerConfig = (activeMatch?.handle as RoomRouteHandle | undefined)
		?.header;

	useRoomRealtime(room?.id ?? null);

	const roomId = room?.id ?? "";
	const { data: preferences } = usePreferences(roomId);
	const { mutate: markSeen } = useMarkHowToPlaySeen(roomId || undefined);
	const { mutate: setLastVisitedRoom } = useSetLastVisitedRoom();
	const [showHowToPlay, setShowHowToPlay] = useState(false);
	const [showRoomSwitcher, setShowRoomSwitcher] = useState(false);
	const [showInvite, setShowInvite] = useState(false);
	const [showNotifications, setShowNotifications] = useState(false);
	const [showSeriesPicker, setShowSeriesPicker] = useState(false);
	const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);
	const roomActions = useMemo<RoomActions>(
		() => ({
			openRoomSwitcher: () => setShowRoomSwitcher(true),
			openInvite: () => setShowInvite(true),
			openNotifications: () => setShowNotifications(true),
			openSeriesPicker: () => setShowSeriesPicker(true),
		}),
		[],
	);

	useEffect(() => {
		if (!isPlayerLoading && !player) {
			navigate("/create-player", { replace: true });
		}
	}, [player, isPlayerLoading, navigate]);

	useEffect(() => {
		if (preferences && !preferences.has_seen_how_to_play) {
			setShowHowToPlay(true);
		}
	}, [preferences]);

	useEffect(() => {
		if (!room?.id || player?.last_visited_room_id === room.id) {
			return;
		}

		setLastVisitedRoom(room.id);
	}, [room?.id, player?.last_visited_room_id, setLastVisitedRoom]);

	// Once the room is up, fetch the code for its other pages in idle time.
	useEffect(() => {
		if (room?.id) prefetchRoomPages();
	}, [room?.id]);

	// Remember the desktop sidebar's state, and let sheets and dialogs centre
	// on the area beside it (shared/ui drawer and dialog read the offset).
	useEffect(() => {
		writeSidebarOpen(sidebarOpen);
		const root = document.documentElement;
		root.style.setProperty(
			"--sidebar-offset",
			sidebarOpen ? SIDEBAR_WIDTH.open : SIDEBAR_WIDTH.rail,
		);
		return () => {
			root.style.removeProperty("--sidebar-offset");
		};
	}, [sidebarOpen]);

	const handleHowToPlayClose = () => {
		setShowHowToPlay(false);
		markSeen();
	};

	if (isPending || isPlayerLoading) {
		return (
			<div className='flex items-center justify-center h-dvh'>
				<Loading className={`size-10 text-primary`} />
			</div>
		);
	}

	if (!room || isError || room.code !== roomCode) {
		return <Navigate to='/404' replace />;
	}

	const handleHeaderLeftAction = () => {
		const leftAction = headerConfig?.leftAction ?? "home";

		if (leftAction === "none") {
			return;
		}

		if (leftAction === "home") {
			setShowRoomSwitcher(true);
			return;
		}

		// Opened with nothing under it: go to the page it belongs to.
		const parent = headerConfig?.parent
			? `/rooms/${room.code}/${generatePath(headerConfig.parent, params)}`
			: `/rooms/${room.code}`;
		back(parent);
	};

	return (
		<RoomActionsContext.Provider value={roomActions}>
		{/* Desktop: the sidebar takes the header's and bottom nav's place, and the
		    pages sit to its right. Phones and tablets never see it. */}
		<RoomSidebar room={room} collapsed={!sidebarOpen} />
		<div
			className={cn(
				'min-h-dvh flex flex-col lg:transition-[padding] lg:duration-200 lg:ease-out motion-reduce:transition-none',
				sidebarOpen ? 'lg:pl-64' : 'lg:pl-16',
			)}
		>
			<RoomTopBar
				room={room}
				title={headerConfig?.title}
				showBack={headerConfig?.leftAction === "back"}
				onBack={handleHeaderLeftAction}
				sidebarOpen={sidebarOpen}
				onToggleSidebar={() => setSidebarOpen((open) => !open)}
			/>
			<RoomHeader
				room={room}
				leftAction={headerConfig?.leftAction ?? "home"}
				title={headerConfig?.title}
				onLeftAction={handleHeaderLeftAction}
			/>

			<main className='max-w-280 w-full mx-auto flex-1 flex flex-col'>
				<Outlet context={{ room, roomCode } satisfies RoomOutletContext} />
			</main>
			<RoomPrefetcher roomId={room.id} />

			{player ? (
				<RoomSwitcherDrawer
					open={showRoomSwitcher}
					onOpenChange={setShowRoomSwitcher}
					playerId={player.id}
				/>
			) : null}

			<RoomInviteShare
				room={room}
				open={showInvite}
				onOpenChange={setShowInvite}
			/>
			<RoomNotificationsDialog
				room={room}
				open={showNotifications}
				onOpenChange={setShowNotifications}
			/>
			<RoomSeriesPicker
				room={room}
				open={showSeriesPicker}
				onOpenChange={setShowSeriesPicker}
			/>

			{showHowToPlay ? null : <RebrandWelcomeDialog />}

			{showHowToPlay ? (
				<Suspense fallback={null}>
					<HowToPlayModal
						open={showHowToPlay}
						onClose={handleHowToPlayClose}
					/>
				</Suspense>
			) : null}
		</div>
		</RoomActionsContext.Provider>
	);
}

// This room's notification settings; staff also see result reminders.
function RoomNotificationsDialog({
	room,
	open,
	onOpenChange,
}: Readonly<{ room: Room; open: boolean; onOpenChange: (open: boolean) => void }>) {
	const { can } = useRoomRole(room);
	return (
		<RoomPreferencesDialog
			roomId={room.id}
			isStaff={can.resolve}
			open={open}
			onOpenChange={onOpenChange}
		/>
	);
}

// Which series the whole room view follows; organizers can also start one.
function RoomSeriesPicker({
	room,
	open,
	onOpenChange,
}: Readonly<{ room: Room; open: boolean; onOpenChange: (open: boolean) => void }>) {
	const { can } = useRoomRole(room);
	return (
		<SeriesPickerDrawer
			roomId={room.id}
			roomCode={room.code}
			isOrganizer={can.organize}
			open={open}
			onOpenChange={onOpenChange}
		/>
	);
}

type RoomHeaderHandle = {
	leftAction: "home" | "back" | "none";
	title?: string;
	// Where Back goes when the page was opened from a link with nothing
	// under it, relative to the room (e.g. "series"). Defaults to Home.
	parent?: string;
};

type RoomRouteHandle = {
	header?: RoomHeaderHandle;
};

const SIDEBAR_KEY = "crow.sidebarOpen";

function readSidebarOpen() {
	try {
		return localStorage.getItem(SIDEBAR_KEY) !== "false";
	} catch {
		return true;
	}
}

function writeSidebarOpen(open: boolean) {
	try {
		localStorage.setItem(SIDEBAR_KEY, String(open));
	} catch {
		// Storage unavailable: it opens again next time.
	}
}
