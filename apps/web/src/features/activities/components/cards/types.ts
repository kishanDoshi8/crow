import type { RoomActivity } from "@/features/activities/types/types";

export type ActivityCardComponentProps<TActivity extends RoomActivity> = {
	activity: TActivity;
	roomCode: string;
	// The "All series" feed mixes series, so prediction cards name theirs.
	showSeries?: boolean;
};
