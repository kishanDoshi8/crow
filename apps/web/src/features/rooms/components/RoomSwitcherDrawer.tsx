import { usePlayerRooms } from "@/features/rooms/hooks/room";
import {
	Button,
	Drawer,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/ui";
import { CircleQuestionMarkIcon, CompassIcon, PlusIcon, UsersIcon } from "lucide-react";
import React, { Suspense, lazy, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { RoomCardsList } from "./RoomCardsList";

const HowToPlayModal = lazy(
	() => import("@/features/onboarding/components/HowToPlayModal"),
);

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	playerId: string;
};

// Phones: your rooms slide in from the left.
export function RoomSwitcherDrawer({
	open,
	onOpenChange,
	playerId,
}: Readonly<Props>) {
	const { data: playerRooms } = usePlayerRooms(playerId);

	return (
		<RoomSwitcher onOpenChange={onOpenChange}>
			{(actions) => (
				<Drawer open={open} onOpenChange={onOpenChange} direction='left'>
					<DrawerContent className='h-dvh'>
						<DrawerHeader>
							<DrawerTitle>Your Rooms</DrawerTitle>
							{playerRooms ? (
								<p className='text-sm text-muted-foreground'>
									{playerRooms.length} rooms
								</p>
							) : null}
						</DrawerHeader>
						<div className='flex-1 overflow-y-auto px-4 pb-4'>
							<RoomList playerId={playerId} onDone={() => onOpenChange(false)} />
						</div>
						<DrawerFooter className='border-t'>{actions}</DrawerFooter>
					</DrawerContent>
				</Drawer>
			)}
		</RoomSwitcher>
	);
}

// Desktop: the same list as a dropdown under the room name in the sidebar.
export function RoomSwitcherPopover({
	playerId,
	children,
}: Readonly<{ playerId: string; children: ReactNode }>) {
	const [open, setOpen] = React.useState(false);

	return (
		<RoomSwitcher onOpenChange={setOpen}>
			{(actions) => (
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>{children}</PopoverTrigger>
					<PopoverContent align='start' className='w-80 p-0'>
						<p className='px-4 pt-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
							Your rooms
						</p>
						<div className='max-h-[60vh] overflow-y-auto px-3 pb-3'>
							<RoomList playerId={playerId} onDone={() => setOpen(false)} />
						</div>
						<div className='flex flex-col gap-1 border-t p-2'>{actions}</div>
					</PopoverContent>
				</Popover>
			)}
		</RoomSwitcher>
	);
}

function RoomList({ playerId, onDone }: Readonly<{ playerId: string; onDone: () => void }>) {
	const { data, isPending, error } = usePlayerRooms(playerId);
	return (
		<RoomCardsList rooms={data} isLoading={isPending} error={error} onRoomSelect={onDone} />
	);
}

// The actions under the room list (explore, create, join, how to play), and the
// how-to-play guide they can open, shared by the drawer and the dropdown.
function RoomSwitcher({
	onOpenChange,
	children,
}: Readonly<{
	onOpenChange: (open: boolean) => void;
	children: (actions: ReactNode) => ReactNode;
}>) {
	const navigate = useNavigate();
	const [openHowToPlay, setOpenHowToPlay] = React.useState(false);

	const handleOpenTab = (tab: "explore" | "join" | "create") => {
		onOpenChange(false);
		navigate(`/?tab=${tab}`);
	};

	const handleHowToPlay = () => {
		onOpenChange(false);
		setOpenHowToPlay(true);
	};

	const actions = (
		<>
			<Button
				variant='ghost'
				className='w-full justify-start'
				onClick={() => handleOpenTab("explore")}
			>
				<CompassIcon />
				Explore rooms
			</Button>
			<Button
				variant='ghost'
				className='w-full justify-start'
				onClick={() => handleOpenTab("create")}
			>
				<PlusIcon />
				Create Room
			</Button>
			<Button
				variant='ghost'
				className='w-full justify-start'
				onClick={() => handleOpenTab("join")}
			>
				<UsersIcon />
				Join Room
			</Button>
			<Button
				variant='ghost'
				className='w-full justify-start'
				onClick={handleHowToPlay}
			>
				<CircleQuestionMarkIcon />
				How To Play
			</Button>
		</>
	);

	return (
		<>
			{children(actions)}
			{openHowToPlay ? (
				<Suspense fallback={null}>
					<HowToPlayModal
						open={openHowToPlay}
						onClose={() => setOpenHowToPlay(false)}
					/>
				</Suspense>
			) : null}
		</>
	);
}
