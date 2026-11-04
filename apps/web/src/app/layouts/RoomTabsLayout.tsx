import { Outlet, useOutletContext } from "react-router-dom";
import { RoomBottomNavigation } from "@/features/rooms/components";
import type { RoomOutletContext } from "@/shared/lib/roomContext";

export default function RoomTabsLayout() {
	const context = useOutletContext<RoomOutletContext>();

	return (
		<div className='flex-1 flex flex-col'>
			<div className='flex-1 pb-24'>
				<Outlet context={context} />
			</div>
			<RoomBottomNavigation />
		</div>
	);
}
