import { useState } from "react";
import { useAuth } from "@/features/auth";
import {
	Button,
	CrowTile,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui";

// The day Crow replaced Verdict at playcrow.app. Accounts made before it are
// Verdict players: they arrive signed out, with no home-screen app or
// notifications on this new address, so they get this note once.
// Set it to the cutover date before the first playcrow.app deploy.
export const CROW_LAUNCH_DATE = "2026-11-20";

// Long enough for anyone still playing to have seen it.
const SHOW_FOR_DAYS = 60;
const SEEN_KEY = "crow.rebrandWelcomeSeen";

function shouldShow(accountCreatedAt: string | undefined) {
	if (!accountCreatedAt) return false;
	const launch = new Date(CROW_LAUNCH_DATE).getTime();
	if (new Date(accountCreatedAt).getTime() >= launch) return false;
	if (Date.now() > launch + SHOW_FOR_DAYS * 24 * 60 * 60 * 1000) return false;
	try {
		return localStorage.getItem(SEEN_KEY) !== "1";
	} catch {
		// Storage blocked: showing it on every visit would be worse than never.
		return false;
	}
}

export default function RebrandWelcomeDialog() {
	const { user } = useAuth();
	const [dismissed, setDismissed] = useState(false);
	const open = !dismissed && shouldShow(user?.created_at);

	const close = () => {
		try {
			localStorage.setItem(SEEN_KEY, "1");
		} catch {
			// Nothing to remember it in; closing for this visit is enough.
		}
		setDismissed(true);
	};

	return (
		<Dialog open={open} onOpenChange={(next) => !next && close()}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader className='items-center text-center gap-3'>
					<CrowTile size={64} />
					<DialogTitle>Verdict is now Crow</DialogTitle>
					<DialogDescription>
						Same rooms, same points, same friends. New name, new address:
						playcrow.app.
					</DialogDescription>
				</DialogHeader>
				<ul className='flex flex-col gap-3 text-sm'>
					<li>
						<span className='font-medium'>Had Verdict on your home screen?</span>{" "}
						<span className='text-muted-foreground'>
							Add Crow from this page instead, then remove the old icon.
						</span>
					</li>
					<li>
						<span className='font-medium'>Want notifications?</span>{" "}
						<span className='text-muted-foreground'>
							Turn them back on from a room's menu. They don't carry over to
							the new address.
						</span>
					</li>
				</ul>
				<DialogFooter>
					<Button className='w-full' onClick={close}>
						Got it
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
