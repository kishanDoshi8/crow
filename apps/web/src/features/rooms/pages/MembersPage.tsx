import { useRoomContext } from "@/shared/lib/roomContext";
import { usePlayer } from "@/features/home";
import { useSetMemberRole, useTransferOwnership } from "@/features/rooms/hooks/staff";
import { useRoomRole } from "@/features/rooms/hooks/useRoomRole";
import {
	ASSIGNABLE_ROLES,
	ROLE_INFO,
	roomRoleRank,
	type RoomRole,
} from "@/features/rooms/lib/roles";
import type { RoomMember } from "@/features/rooms/types/types";
import {
	Avatar,
	AvatarFallback,
	Badge,
	Button,
	Checkbox,
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
	FieldTitle,
	RadioGroup,
	RadioGroupItem,
	Spinner,
} from "@/shared/ui";
import { ChevronRightIcon, CrownIcon, ShieldAlertIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const DRAWER_CLASS =
	"data-[vaul-drawer-direction=bottom]:right-auto data-[vaul-drawer-direction=bottom]:left-1/2 data-[vaul-drawer-direction=bottom]:w-full data-[vaul-drawer-direction=bottom]:max-w-md data-[vaul-drawer-direction=bottom]:-translate-x-1/2";

// Everyone in the room and their role. The owner taps a member to change it.
export default function MembersPage() {
	const { room } = useRoomContext();
	const { data: player } = usePlayer();
	const { can } = useRoomRole(room);
	const [editing, setEditing] = useState<RoomMember | null>(null);

	const members = useMemo(
		() =>
			[...room.members].sort(
				(a, b) =>
					roomRoleRank(b.role) - roomRoleRank(a.role) ||
					a.player.username.localeCompare(b.player.username),
			),
		[room.members],
	);

	return (
		<div className='mx-auto w-full max-w-md space-y-3 p-4'>
			<p className='px-1 text-sm text-muted-foreground'>
				{can.own
					? "Give friends a role to share the work. Resolvers reveal results; organizers also create predictions and series."
					: "Organizers and resolvers help run the room. The owner assigns roles."}
			</p>
			<ul className='divide-y rounded-2xl border bg-card'>
				{members.map((member) => {
					const isMe = member.player_id === player?.id;
					const editable = can.own && member.role !== "owner";
					return (
						<li key={member.id}>
							<MemberRow
								member={member}
								isMe={isMe}
								onClick={editable ? () => setEditing(member) : undefined}
							/>
						</li>
					);
				})}
			</ul>

			{editing ? (
				<RoleDrawer
					roomId={room.id}
					member={editing}
					onClose={() => setEditing(null)}
				/>
			) : null}
		</div>
	);
}

function MemberRow({
	member,
	isMe,
	onClick,
}: Readonly<{ member: RoomMember; isMe: boolean; onClick?: () => void }>) {
	const content = (
		<>
			<Avatar className='ring-1 ring-border/80'>
				<AvatarFallback className='bg-muted/70 text-xs font-semibold text-foreground/85'>
					{member.player.username.slice(0, 2).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<span className='min-w-0 flex-1 truncate text-sm font-medium'>
				{member.player.username}
				{isMe ? (
					<span className='ml-1 text-muted-foreground'>(You)</span>
				) : null}
			</span>
			<RoleBadge role={member.role} />
			{onClick ? (
				<ChevronRightIcon className='size-4 shrink-0 text-muted-foreground' />
			) : null}
		</>
	);

	if (!onClick) {
		return <div className='flex items-center gap-3 px-3 py-2.5'>{content}</div>;
	}

	return (
		<button
			type='button'
			onClick={onClick}
			aria-label={`Change role for ${member.player.username}`}
			className='flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
		>
			{content}
		</button>
	);
}

function RoleBadge({ role }: Readonly<{ role: RoomRole }>) {
	if (role === "member") {
		return null;
	}
	return (
		<Badge
			variant='outline'
			className={role === "owner" ? "border-primary/40 text-primary" : undefined}
		>
			{role === "owner" ? <CrownIcon className='size-3' /> : null}
			{ROLE_INFO[role].label}
		</Badge>
	);
}

function RoleDrawer({
	roomId,
	member,
	onClose,
}: Readonly<{ roomId: string; member: RoomMember; onClose: () => void }>) {
	const [role, setRole] = useState<RoomRole>(member.role);
	const [transferAcknowledged, setTransferAcknowledged] = useState(false);
	const { mutate: setMemberRole, isPending: isSaving } = useSetMemberRole(roomId);
	const { mutate: transferOwnership, isPending: isTransferring } =
		useTransferOwnership(roomId);
	const isPending = isSaving || isTransferring;
	const name = member.player.username;

	const handleSave = () => {
		if (role === member.role || role === "owner") {
			onClose();
			return;
		}
		setMemberRole(
			{ playerId: member.player_id, role },
			{
				onSuccess: () => {
					toast.success(`${name} is now a ${role}.`, {
						position: "top-center",
					});
					onClose();
				},
				onError: (error) => {
					toast.error("Couldn't change the role.", {
						description: error.message,
						position: "top-center",
					});
				},
			},
		);
	};

	const handleTransfer = () => {
		transferOwnership(member.player_id, {
			onSuccess: () => {
				toast.success(`${name} now owns the room. You're an organizer.`, {
					position: "top-center",
				});
				onClose();
			},
			onError: (error) => {
				toast.error("Couldn't transfer ownership.", {
					description: error.message,
					position: "top-center",
				});
			},
		});
	};

	return (
		<Drawer open onOpenChange={(open) => !open && onClose()}>
			<DrawerContent className={DRAWER_CLASS}>
				<DrawerHeader className='text-left'>
					<DrawerTitle>{name}</DrawerTitle>
					<DrawerDescription>Choose what {name} can do.</DrawerDescription>
				</DrawerHeader>
				<div className='space-y-5 overflow-y-auto px-4'>
					<RadioGroup
						value={role}
						onValueChange={(value) => setRole(value as RoomRole)}
						disabled={isPending}
					>
						{[...ASSIGNABLE_ROLES].reverse().map((option) => (
							<FieldLabel key={option} htmlFor={`role-${option}`}>
								<Field orientation='horizontal'>
									<RadioGroupItem value={option} id={`role-${option}`} />
									<FieldContent>
										<FieldTitle>{ROLE_INFO[option].label}</FieldTitle>
										<FieldDescription>
											{ROLE_INFO[option].description}
										</FieldDescription>
									</FieldContent>
								</Field>
							</FieldLabel>
						))}
					</RadioGroup>

					<section className='space-y-2'>
						<p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
							Danger zone
						</p>
						<div className='space-y-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3'>
							<p className='flex items-start gap-2 text-sm text-destructive'>
								<ShieldAlertIcon className='mt-0.5 size-4 shrink-0' />
								Make {name} the owner. You'll stay on as an organizer
								and can't undo this yourself.
							</p>
							<FieldLabel htmlFor='transfer-ownership'>
								<Field orientation='horizontal'>
									<Checkbox
										id='transfer-ownership'
										checked={transferAcknowledged}
										onCheckedChange={(checked) =>
											setTransferAcknowledged(checked === true)
										}
										disabled={isPending}
									/>
									<FieldContent>
										<FieldTitle>I understand</FieldTitle>
									</FieldContent>
								</Field>
							</FieldLabel>
							<Button
								variant='destructive'
								className='w-full'
								onClick={handleTransfer}
								disabled={isPending || !transferAcknowledged}
							>
								{isTransferring && <Spinner />}
								Transfer ownership
							</Button>
						</div>
					</section>
				</div>
				<DrawerFooter>
					<Button onClick={handleSave} disabled={isPending}>
						{isSaving && <Spinner />}
						Save role
					</Button>
					<DrawerClose asChild>
						<Button variant='outline' disabled={isPending}>
							Cancel
						</Button>
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
