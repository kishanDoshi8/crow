import {
	Button,
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	Spinner,
} from "@/shared/ui";
import {
	BellIcon,
	CopyIcon,
	DoorOpenIcon,
	FlagIcon,
	LayoutGridIcon,
	LinkIcon,
	LogOutIcon,
	SettingsIcon,
	Share2Icon,
	UserXIcon,
	UsersIcon,
	type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Room } from "@/features/rooms/types/types";
import { SettingsRow } from "@/features/series/components/SeriesOrganizerActionsMenu";
import { useAuth } from "@/features/auth";
import { LegalLinks } from "@/features/legal";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { InviteSheet } from "./InviteSheet";
import { useLeaveRoom, useManageQueue } from "@/features/rooms/hooks/staff";
import { useRoomRole } from "@/features/rooms/hooks/useRoomRole";
import { useRoomActions } from "@/shared/lib/roomActions";

type Props = {
	room: Room;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function RoomMenuDrawer({ room, open, onOpenChange }: Readonly<Props>) {
	const navigate = useNavigate();
	const { user, hasGoogleIdentity, linkGoogle, signOut } = useAuth();
	const [isInviteSheetOpen, setIsInviteSheetOpen] = useState(false);
	const [isLeaveOpen, setIsLeaveOpen] = useState(false);
	const { mutate: leaveRoom, isPending: isLeaving } = useLeaveRoom(room.id);
	const { openInvite, openNotifications, openRoomSwitcher } =
		useRoomActions();
	const { can } = useRoomRole(room);
	const { data: manageQueue } = useManageQueue(room.id, can.resolve && open);
	const close = (then: () => void) => () => {
		onOpenChange(false);
		then();
	};

	const handleCopyCode = async () => {
		if (await copyToClipboard(room.code)) {
			toast.success("Room code copied", { position: "top-center" });
		} else {
			setIsInviteSheetOpen(true);
		}
	};

	const handleConnectGoogle = async () => {
		try {
			await linkGoogle();
		} catch (error) {
			toast.error("Couldn't connect Google.", {
				description: error instanceof Error ? error.message : undefined,
				position: "top-center",
			});
		}
	};

	const handleLeave = () => {
		leaveRoom(undefined, {
			onSuccess: () => {
				setIsLeaveOpen(false);
				toast.success(`You left ${room.name}.`, { position: "top-center" });
				navigate("/?tab=rooms", { replace: true });
			},
			onError: (error) => {
				toast.error("Couldn't leave the room.", {
					description: error.message,
					position: "top-center",
				});
			},
		});
	};

	const handleSignOut = async () => {
		try {
			await signOut();
			navigate("/login", { replace: true });
		} catch (error) {
			toast.error("Couldn't sign out. Try again.", {
				description: error instanceof Error ? error.message : undefined,
				position: "top-center",
			});
		}
	};

	const items: Array<{
		label: string;
		detail?: string;
		icon: LucideIcon;
		onClick: () => void;
	}> = [
		{
			label: "Invite friends",
			icon: Share2Icon,
			onClick: close(openInvite),
		},
		{
			label: "Copy room code",
			detail: room.code,
			icon: CopyIcon,
			onClick: close(() => void handleCopyCode()),
		},
		{
			label: "Switch room",
			detail: "Your other rooms, or join a new one",
			icon: LayoutGridIcon,
			onClick: close(openRoomSwitcher),
		},
		// {
		// 	label: "All series and past champions",
		// 	icon: TrophyIcon,
		// 	onClick: close(() => navigate(`/rooms/${room.code}/series`)),
		// },
	];

	const toResolveCount = manageQueue?.to_resolve.length ?? 0;
	// Staff tools first; everyone can see who's in the room and their roles.
	const roomSectionItems: Array<{
		label: string;
		detail?: string;
		icon: LucideIcon;
		onClick: () => void;
	}> = [
		...(can.resolve
			? [
					{
						label: "Needs you",
						detail:
							toResolveCount > 0
								? `${toResolveCount} ${toResolveCount === 1 ? "result" : "results"} to reveal`
								: "Nothing waiting on a result",
						icon: FlagIcon,
						onClick: close(() =>
							navigate(`/rooms/${room.code}/manage`),
						),
					},
				]
			: []),
		{
			label: can.own ? "Members & roles" : "Members",
			icon: UsersIcon,
			onClick: close(() => navigate(`/rooms/${room.code}/members`)),
		},
		...(can.own
			? [
					{
						label: "Room settings",
						detail: "Name, open predictions limit, result reminders",
						icon: SettingsIcon,
						onClick: close(() =>
							navigate(`/rooms/${room.code}/settings`),
						),
					},
				]
			: []),
		// The owner hands the room over first (Members & roles).
		...(can.own
			? []
			: [
					{
						label: "Leave room",
						detail: "Open bets come back to you",
						icon: DoorOpenIcon,
						onClick: close(() => setIsLeaveOpen(true)),
					},
				]),
	];

	const settingsSectionItems: Array<{
		label: string;
		detail?: string;
		icon: LucideIcon;
		onClick: () => void;
	}> = [
		{
			label: "Notifications",
			icon: BellIcon,
			onClick: close(openNotifications),
		},
	];

	const accountSectionItems: Array<{
		label: string;
		detail?: string;
		icon: LucideIcon;
		onClick: () => void;
		isDanger?: boolean;
	}> = [
		...(hasGoogleIdentity
			? []
			: [
					{
						label: "Connect Google",
						detail: "Sign in with Google next time",
						icon: LinkIcon,
						onClick: close(() => void handleConnectGoogle()),
					},
				]),
		{
			label: "Sign out",
			detail: user?.email ?? undefined,
			icon: LogOutIcon,
			onClick: close(() => void handleSignOut()),
			isDanger: true,
		},
		{
			label: "Delete account",
			icon: UserXIcon,
			onClick: close(() => navigate("/account/delete")),
			isDanger: true,
		},
	];

	return (
		<>
			<Drawer open={open} onOpenChange={onOpenChange}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>{room.name}</DrawerTitle>
						<DrawerDescription>
							{room.members.length} member
							{room.members.length === 1 ? "" : "s"}
						</DrawerDescription>
					</DrawerHeader>
					<div className='flex flex-col gap-1 space-y-5 overflow-y-auto px-4 pb-4'>
						<ul>
							{items.map(
								({ label, detail, icon: Icon, onClick }) => (
									<li key={label}>
										<SettingsRow
											icon={
												<Icon className='size-5 text-muted-foreground' />
											}
											label={label}
											description={detail}
											onClick={onClick}
										/>
									</li>
								),
							)}
						</ul>
						<MenuSection title='Room' items={roomSectionItems} />
						<MenuSection
							title='Settings'
							items={settingsSectionItems}
						/>
						<section className='space-y-2'>
							<p className='px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
								Account
							</p>
							{accountSectionItems.map(
								({
									label,
									detail,
									icon: Icon,
									onClick,
									isDanger,
								}) => (
									<SettingsRow
										key={label}
										icon={
											<Icon className='size-5 text-muted-foreground' />
										}
										isDanger={isDanger}
										label={label}
										description={detail}
										onClick={onClick}
									/>
								),
							)}
						</section>
						<LegalLinks
							className='px-2'
							onNavigate={() => onOpenChange(false)}
						/>
					</div>
				</DrawerContent>
			</Drawer>
			<InviteSheet
				room={room}
				open={isInviteSheetOpen}
				onOpenChange={setIsInviteSheetOpen}
			/>
			<Dialog open={isLeaveOpen} onOpenChange={setIsLeaveOpen}>
				<DialogContent className='sm:max-w-md mx-auto'>
					<DialogHeader>
						<DialogTitle>Leave {room.name}?</DialogTitle>
						<DialogDescription>
							Bets on open predictions come back to you. Locked ones still
							settle. Your past results stay, and if you rejoin with the
							code you pick up where you left off.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className='gap-4'>
						<DialogClose asChild>
							<Button variant='outline' size='lg' disabled={isLeaving}>
								Stay
							</Button>
						</DialogClose>
						<Button
							variant='destructive'
							size='lg'
							onClick={handleLeave}
							disabled={isLeaving}
						>
							{isLeaving && <Spinner />}
							Leave room
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function MenuSection({
	title,
	items,
}: Readonly<{
	title: string;
	items: Array<{
		label: string;
		detail?: string;
		icon: LucideIcon;
		onClick: () => void;
	}>;
}>) {
	return (
		<section className='space-y-2'>
			<p className='px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
				{title}
			</p>
			{items.map(({ label, detail, icon: Icon, onClick }) => (
				<SettingsRow
					key={label}
					icon={<Icon className='size-5 text-muted-foreground' />}
					label={label}
					description={detail}
					onClick={onClick}
				/>
			))}
		</section>
	);
}
