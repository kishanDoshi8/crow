import { useRoomContext } from "@/shared/lib/roomContext";
import { cn } from "@/shared/lib/utils";
import { HistoryIcon, HomeIcon, MedalIcon, TrophyIcon } from "lucide-react";
import { useAppNavigation } from "@/shared/lib/navigation";
import { NavLink } from "react-router-dom";

// The room's tabs, shared with the desktop sidebar. Activity lives behind
// the bell in the room header.
export const ROOM_TABS = [
	{ label: "Home", segment: "", icon: HomeIcon },
	{ label: "Standings", segment: "leaderboard", icon: MedalIcon },
	{ label: "History", segment: "history", icon: HistoryIcon },
	{ label: "Series", segment: "series", icon: TrophyIcon },
] as const;

export function RoomBottomNavigation() {
	const { room } = useRoomContext();
	const { switchTab } = useAppNavigation();

	return (
		<nav
			// Desktop has the sidebar instead.
			className='fixed bottom-0 left-0 right-0 z-40 backdrop-blur-sm lg:hidden'
			style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
			aria-label='Room navigation'
		>
			<div className='max-w-md mx-auto w-full bg-card/80 border border-t rounded-t-lg'>
				<ul className='flex justify-around h-16 px-2'>
					{ROOM_TABS.map(({ label, segment, icon: Icon }) => {
						const to = segment
							? `/rooms/${room.code}/${segment}`
							: `/rooms/${room.code}`;

						return (
							<li key={label} className={`flex-1 flex items-center justify-center`}>
								<NavLink
									to={to}
									end={segment.length === 0}
									// Home stays at the bottom of history; other tabs
									// replace each other one entry above it.
									onClick={(event) => {
										event.preventDefault();
										switchTab(to);
									}}
									className={({ isActive }) =>
										cn(
											"w-full max-w-20 flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-xs font-medium text-muted-foreground transition-colors",
											isActive
												? "bg-primary/15 text-primary"
												: "hover:text-foreground",
										)
									}
								>
									<Icon size={20} aria-hidden='true' />
									<span>{label}</span>
								</NavLink>
							</li>
						);
					})}
				</ul>
			</div>
		</nav>
	);
}
