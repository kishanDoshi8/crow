import {
	Button,
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	Input,
} from "@/shared/ui";
import { CheckIcon, CopyIcon, Share2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { copyToClipboard } from "@/shared/lib/clipboard";
import type { Room } from "@/features/rooms/types/types";
import { shareLink } from "@/features/share/lib/shareLink";

type Props = {
	room: Room;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function inviteUrlFor(room: Room) {
	return shareLink(room.code, "invite-link");
}

// Shown when the phone's share sheet isn't available: the link is visible and
// selectable, with copy buttons that don't depend on long-press.
export function InviteSheet({ room, open, onOpenChange }: Readonly<Props>) {
	const inviteUrl = inviteUrlFor(room);
	const [copied, setCopied] = useState<"link" | "code" | null>(null);

	const copy = async (what: "link" | "code") => {
		const ok = await copyToClipboard(what === "link" ? inviteUrl : room.code);
		if (ok) {
			setCopied(what);
			globalThis.setTimeout(() => setCopied(null), 2000);
			toast.success(what === "link" ? "Invite link copied" : "Room code copied", {
				position: "top-center",
			});
		} else {
			toast.error("Copy isn't available here. Select the link above and copy it.", {
				position: "top-center",
			});
		}
	};

	const canShare = typeof navigator.share === "function";

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Invite friends to {room.name}</DrawerTitle>
					<DrawerDescription>
						Anyone with this link can join after signing in.
					</DrawerDescription>
				</DrawerHeader>
				<div className='flex flex-col gap-3 px-4 pb-6'>
					<div className='flex gap-2'>
						<Input
							readOnly
							value={inviteUrl}
							aria-label='Invite link'
							onFocus={(event) => event.currentTarget.select()}
							className='font-mono text-xs'
						/>
						<Button
							variant='linear'
							onClick={() => void copy("link")}
							aria-label='Copy invite link'
						>
							{copied === "link" ? <CheckIcon /> : <CopyIcon />}
							Copy
						</Button>
					</div>
					<div className='flex items-center justify-between rounded-lg border px-3 py-2'>
						<div>
							<p className='text-xs text-muted-foreground'>Room code</p>
							<p className='font-mono text-lg tracking-widest'>{room.code}</p>
						</div>
						<Button variant='ghost' size='sm' onClick={() => void copy("code")}>
							{copied === "code" ? <CheckIcon /> : <CopyIcon />}
							Copy code
						</Button>
					</div>
					{canShare ? (
						<Button
							variant='outline'
							onClick={() =>
								void navigator
									.share({
										title: `Join ${room.name} on Crow`,
										text: `Join ${room.name} on Crow.`,
										url: inviteUrl,
									})
									.catch(() => {})
							}
						>
							<Share2Icon />
							Share…
						</Button>
					) : null}
				</div>
			</DrawerContent>
		</Drawer>
	);
}
