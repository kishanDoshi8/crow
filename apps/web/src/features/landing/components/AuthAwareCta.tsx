import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/features/auth";
import { savePostAuthRedirect } from "@/shared/lib/postAuthRedirect";
import { cn } from "@/shared/lib/utils";
import { Button, Skeleton } from "@/shared/ui";

// Where the app's own home lives. The landing page links here once someone
// is signed in.
const APP_HOME = "/";

// Signed-out visitors go through sign-up and land on the right Home tab.
function useStartFlow() {
	const navigate = useNavigate();
	return {
		startRoom: () => {
			savePostAuthRedirect(`${APP_HOME}?tab=create`);
			navigate("/signup");
		},
		joinRoom: () => {
			savePostAuthRedirect(`${APP_HOME}?tab=join`);
			navigate("/login");
		},
		signIn: () => navigate("/login"),
		openRooms: () => navigate(APP_HOME),
		newRoom: () => navigate(`${APP_HOME}?tab=create`),
	};
}

// While the saved session loads, a placeholder the size of the buttons holds
// the space; the real buttons fade in over it, so nothing jumps.
function Swap({
	loading,
	placeholder,
	children,
}: Readonly<{
	loading: boolean;
	placeholder: React.ReactNode;
	children: React.ReactNode;
}>) {
	if (loading) {
		return (
			<div aria-busy='true' aria-label='Checking if you are signed in'>
				{placeholder}
			</div>
		);
	}
	return (
		<div className='motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300'>
			{children}
		</div>
	);
}

export function HeaderCta() {
	const { user, isLoading, signOut } = useAuth();
	const flow = useStartFlow();
	const [isSigningOut, setIsSigningOut] = useState(false);

	// Signing out keeps you here; the buttons switch back to the visitor ones.
	const handleSignOut = async () => {
		setIsSigningOut(true);
		try {
			await signOut();
			toast.success("Signed out.", { position: "top-center" });
		} catch {
			toast.error("Couldn't sign out. Try again.", { position: "top-center" });
		} finally {
			setIsSigningOut(false);
		}
	};

	return (
		<Swap loading={isLoading} placeholder={<Skeleton className='h-8 w-24' />}>
			{user ? (
				<div className='flex items-center gap-1 sm:gap-2'>
					<Button
						size='sm'
						variant='ghost'
						onClick={() => void handleSignOut()}
						disabled={isSigningOut}
					>
						Sign out
					</Button>
					<Button size='sm' onClick={flow.openRooms}>
						Open Crow
					</Button>
				</div>
			) : (
				<Button size='sm' variant='ghost' onClick={flow.signIn}>
					Sign in
				</Button>
			)}
		</Swap>
	);
}

export function HeroCta({ className }: Readonly<{ className?: string }>) {
	const { user, isLoading } = useAuth();
	const flow = useStartFlow();

	return (
		<div className={cn("min-h-24 sm:min-h-12", className)}>
			<Swap
				loading={isLoading}
				placeholder={
					<div className='flex flex-col gap-3 sm:flex-row'>
						<Skeleton className='h-11 w-full sm:w-40' />
						<Skeleton className='h-11 w-full sm:w-44' />
					</div>
				}
			>
				<div className='flex flex-col gap-3 sm:flex-row'>
					{user ? (
						<>
							<Button size='lg' className='h-11 px-6' onClick={flow.openRooms}>
								Go to your rooms
							</Button>
							<Button
								size='lg'
								variant='outline'
								className='h-11 px-6'
								onClick={flow.newRoom}
							>
								Start another room
							</Button>
						</>
					) : (
						<>
							<Button size='lg' className='h-11 px-6' onClick={flow.startRoom}>
								Start a room
							</Button>
							<Button
								size='lg'
								variant='outline'
								className='h-11 px-6'
								onClick={flow.joinRoom}
							>
								Join with a code
							</Button>
						</>
					)}
				</div>
			</Swap>
		</div>
	);
}

export function ClosingCta() {
	const { user, isLoading } = useAuth();
	const flow = useStartFlow();

	return (
		<Swap loading={isLoading} placeholder={<Skeleton className='h-11 w-40' />}>
			{user ? (
				<Button size='lg' className='h-11 px-6' onClick={flow.openRooms}>
					Go to your rooms
				</Button>
			) : (
				<Button size='lg' className='h-11 px-6' onClick={flow.startRoom}>
					Start a room
				</Button>
			)}
		</Swap>
	);
}
