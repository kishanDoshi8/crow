import { NavigationSync } from "@/app/router/NavigationSync";
import { PushSync } from "@/app/router/PushSync";
import { Outlet, ScrollRestoration } from "react-router-dom";

// Signed-in pages: native-feeling history, scroll positions kept on Back, and
// this device's push subscription kept saved.
export function AppShell() {
	return (
		<>
			<NavigationSync />
			<PushSync />
			<ScrollRestoration />
			<Outlet />
		</>
	);
}
