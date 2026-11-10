import {
	CircleQuestionMarkIcon,
	FileTextIcon,
	LogOutIcon,
	UserXIcon,
	type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/features/auth";
import { usePlayer } from "@/features/home/hooks/player";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/shared/ui";
import { cn } from "@/shared/lib/utils";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onHowToPlay: () => void;
};

// The home screen's account menu: the way out for someone who isn't in any
// room yet (inside a room, the room menu has the same items).
export function AccountSheet({ open, onOpenChange, onHowToPlay }: Readonly<Props>) {
	const navigate = useNavigate();
	const { user, signOut } = useAuth();
	const { data: player } = usePlayer();
	const close = (run: () => void) => () => {
		onOpenChange(false);
		run();
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

	const items: Array<{ label: string; icon: LucideIcon; onClick: () => void; isDanger?: boolean }> = [
		{ label: "How to play", icon: CircleQuestionMarkIcon, onClick: close(onHowToPlay) },
		{ label: "Terms & privacy", icon: FileTextIcon, onClick: close(() => navigate("/terms")) },
		{ label: "Sign out", icon: LogOutIcon, onClick: close(() => void handleSignOut()) },
		{
			label: "Delete account",
			icon: UserXIcon,
			onClick: close(() => navigate("/account/delete")),
			isDanger: true,
		},
	];

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className='mx-auto max-w-md'>
				<DrawerHeader className='flex-row items-center gap-3 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left'>
					<span className='flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold'>
						{accountInitials(player?.username)}
					</span>
					<div className='min-w-0'>
						<DrawerTitle className='truncate'>{player?.username ?? "Your account"}</DrawerTitle>
						<DrawerDescription className='truncate'>{user?.email}</DrawerDescription>
					</div>
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
	return username ? username.slice(0, 2).toUpperCase() : "";
}
