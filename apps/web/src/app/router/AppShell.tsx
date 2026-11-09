import { NavigationSync } from "@/app/router/NavigationSync";
import { PushSync } from "@/app/router/PushSync";
import { OfflineBar } from "@/shared/ui";
import { Outlet, ScrollRestoration, useLocation } from "react-router-dom";

// Room pages show the offline bar under their header; everywhere else it
// sits at the top.
const ROOM_PAGE = /^\/rooms\/[^/]+(?:\/(?!join(?:\/|$)).*)?$/;

// Signed-in pages: native-feeling history, scroll positions kept on Back, and
// this device's push subscription kept saved.
export function AppShell() {
	const { pathname } = useLocation();
	return (
		<>
			{ROOM_PAGE.test(pathname) ? null : (
				<OfflineBar className='sticky top-0 z-20' />
			)}
			<NavigationSync />
			<PushSync />
			<ScrollRestoration />
			<Outlet />
		</>
	);
}
