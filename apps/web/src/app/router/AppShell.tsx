import { NavigationSync } from "@/app/router/NavigationSync";
import { PushSync } from "@/app/router/PushSync";
import { RebrandWelcomeDialog } from "@/features/onboarding";
import { Outlet, ScrollRestoration } from "react-router-dom";

// Signed-in pages: native-feeling history, scroll positions kept on Back, and
// this device's push subscription kept saved. Verdict players get a one-time
// note about the move to Crow.
export function AppShell() {
	return (
		<>
			<NavigationSync />
			<PushSync />
			<RebrandWelcomeDialog />
			<ScrollRestoration />
			<Outlet />
		</>
	);
}
