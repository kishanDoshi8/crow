import {
	ChevronRightIcon,
	CircleQuestionMarkIcon,
	FileTextIcon,
	LogOutIcon,
	ShieldIcon,
	type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIsPlatformAdmin } from "@/features/admin";
import { useSignOut } from "@/features/auth";
import { usePlayer } from "@/features/home/hooks/player";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/shared/ui";
import { cn, initialsOf } from "@/shared/lib/utils";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onHowToPlay: () => void;
};

// The home screen's account menu. The header opens your profile, which holds
// your account settings and Delete account; inside a room, the room menu has
// the same items.
export function AccountSheet({ open, onOpenChange, onHowToPlay }: Readonly<Props>) {
	const navigate = useNavigate();
	const signOut = useSignOut();
	const { data: player } = usePlayer();
	const { data: isPlatformAdmin } = useIsPlatformAdmin(open);
	const close = (run: () => void) => () => {
		onOpenChange(false);
		run();
	};

	const items: Array<{ label: string; icon: LucideIcon; onClick: () => void; isDanger?: boolean }> = [
		{ label: "How to play", icon: CircleQuestionMarkIcon, onClick: close(onHowToPlay) },
		{ label: "Terms & privacy", icon: FileTextIcon, onClick: close(() => navigate("/terms")) },
		// The Crow team only.
		...(isPlatformAdmin
			? [{ label: "Crow admin", icon: ShieldIcon, onClick: close(() => navigate("/admin")) }]
			: []),
		{ label: "Sign out", icon: LogOutIcon, onClick: close(() => void signOut()) },
	];

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className='mx-auto max-w-md'>
				<DrawerHeader className='p-2 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left'>
					<button
						type='button'
						onClick={close(() => navigate("/profile"))}
						className='flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
					>
						<span className='flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold'>
							{accountInitials(player?.username)}
						</span>
						<span className='min-w-0 flex-1'>
							<DrawerTitle className='truncate'>{player?.username ?? "Your account"}</DrawerTitle>
							<DrawerDescription className='truncate'>View profile and account</DrawerDescription>
						</span>
						<ChevronRightIcon className='size-5 shrink-0 text-muted-foreground' aria-hidden='true' />
					</button>
				</DrawerHeader>
				<ul className='flex flex-col gap-1 px-2 pb-6'>
					{items.map(({ label, icon: Icon, onClick, isDanger }) => (
						<li key={label}>
							<button
								type='button'
								onClick={onClick}
								className={cn(
									"flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] font-medium transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									isDanger && "text-destructive",
								)}
							>
								<Icon className={cn("size-5", !isDanger && "text-muted-foreground")} aria-hidden='true' />
								{label}
							</button>
						</li>
					))}
				</ul>
			</DrawerContent>
		</Drawer>
	);
}

export function accountInitials(username: string | undefined) {
	return username ? initialsOf(username) : "";
}
