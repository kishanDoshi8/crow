import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Reveal,
	Skeleton,
	SkeletonList,
} from "@/shared/ui";
import { useNotificationPermission } from "@/shared/hooks/useNotificationPermission";
import type { PreferenceSettings, RoomPreferenceOverrides } from "@/shared/lib/api";
import {
	needsHomeScreenInstall,
	registerForPushNotifications,
} from "@/shared/lib/pushNotifications";
import {
	usePreferences,
	useResetRoomPreferences,
	useUpdateGlobalPreferences,
	useUpdateRoomPreferences,
} from "@/features/preferences/hooks/preferences";
import { BellOffIcon } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { NotificationPermissionBlockedDialog } from "@/features/predictions";

type Props = {
	roomId: string;
	// Staff also see the "result needed" push.
	isStaff?: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

type NotificationPreferenceKey =
	| "prediction_live"
	| "prediction_locked"
	| "deadline_1h"
	| "result_revealed"
	| "weekly_points_claim"
	| "result_needed";

const SETTINGS_SCROLL =
	"-mx-4 no-scrollbar max-h-[50vh] overflow-y-auto px-4 space-y-6 bg-card/70 py-2";
const SETTING_ROW =
	"flex items-center justify-between gap-4 border rounded-md p-3";

const notificationLabels: Record<NotificationPreferenceKey, string> = {
	prediction_live: "Prediction goes live",
	prediction_locked: "Prediction locked",
	deadline_1h: "Betting deadline (1h)",
	result_revealed: "Result revealed",
	// One Monday push: the weekly standings and any top-up.
	weekly_points_claim: "Weekly recap",
	result_needed: "Result needed (staff)",
};

const notificationKeys: NotificationPreferenceKey[] = [
	"prediction_live",
	"prediction_locked",
	"deadline_1h",
	"result_revealed",
	"weekly_points_claim",
];

// Only room staff get the "result needed" push.
const staffNotificationKeys: NotificationPreferenceKey[] = ["result_needed"];

const cycleOverride = (value: boolean | null): boolean | null => {
	if (value === null) return true;
	if (value === true) return false;
	return null;
};

const overrideLabel = (value: boolean | null) => {
	if (value === null) return "Inherited";
	return value ? "On" : "Off";
};

const overrideVariant = (
	value: boolean | null,
): "default" | "outline" | "secondary" => {
	if (value === null) return "secondary";
	return value ? "default" : "outline";
};

const getErrorMessage = (error: unknown) =>
	error instanceof Error ? error.message : "Unexpected error";

export function RoomPreferencesDialog({
	roomId,
	isStaff = false,
	open,
	onOpenChange,
}: Readonly<Props>) {
	const visibleKeys = isStaff
		? [...notificationKeys, ...staffNotificationKeys]
		: notificationKeys;
	const [isBlockedDialogOpen, setIsBlockedDialogOpen] = useState(false);
	const [isRequestingPermission, setIsRequestingPermission] = useState(false);
	const { permission, requestPermission } = useNotificationPermission();
	const needsInstall = needsHomeScreenInstall();
	const { data: preferences, isPending: isPreferencesPending } =
		usePreferences(roomId);
	const { mutate: updateGlobal, isPending: isUpdatingGlobal } =
		useUpdateGlobalPreferences(roomId);
	const { mutate: updateRoom, isPending: isUpdatingRoom } =
		useUpdateRoomPreferences(roomId);
	const { mutate: resetRoom, isPending: isResettingRoom } =
		useResetRoomPreferences(roomId);

	const handleGlobalToggle = (key: NotificationPreferenceKey) => {
		if (!preferences) return;

		const nextGlobal: PreferenceSettings = {
			...preferences.global,
			[key]: !preferences.global[key],
			dark_mode: true,
		};

		updateGlobal(nextGlobal, {
			onError: (error) => {
				toast.error("Failed to update global preference.", {
					description: getErrorMessage(error),
					duration: 6000,
					position: "top-center",
				});
			},
		});
	};

	const handleRoomCycle = (key: NotificationPreferenceKey) => {
		if (!preferences) return;

		const nextOverrides: RoomPreferenceOverrides = {
			...preferences.room_overrides,
			[key]: cycleOverride(preferences.room_overrides[key]),
		};

		updateRoom(nextOverrides, {
			onError: (error) => {
				toast.error("Failed to update room override.", {
					description: getErrorMessage(error),
					duration: 6000,
					position: "top-center",
				});
			},
		});
	};

	const handleResetRoom = () => {
		resetRoom(undefined, {
			onError: (error) => {
				toast.error("Failed to reset room overrides.", {
					description: getErrorMessage(error),
					duration: 6000,
					position: "top-center",
				});
			},
		});
	};

	const isBusy =
		isPreferencesPending ||
		isUpdatingGlobal ||
		isUpdatingRoom ||
		isResettingRoom;

	// Settings can be changed before notifications are allowed on this device.
	const handleEnableNotifications = async () => {
		if (permission === "denied") {
			setIsBlockedDialogOpen(true);
			return;
		}

		try {
			setIsRequestingPermission(true);
			const nextPermission = needsInstall
				? permission
				: await requestPermission();
			if (nextPermission === "denied") {
				setIsBlockedDialogOpen(true);
				return;
			}
			await saveThisDevice(nextPermission);
		} finally {
			setIsRequestingPermission(false);
		}
	};

	// Saves this device for pushes and says plainly whether it worked.
	const saveThisDevice = async (nextPermission: NotificationPermission) => {
		try {
			const result = await registerForPushNotifications(nextPermission);
			if (result === "subscribed") {
				toast.success("Notifications are on for this device.", {
					position: "top-center",
				});
			} else if (result === "needs-install") {
				toast.info("Add Crow to your Home Screen first.", {
					description: "On iPhone and iPad, notifications only work from the installed app.",
					duration: 8000,
					position: "top-center",
				});
			} else if (result === "unsupported") {
				toast.error("This browser can't receive notifications.", {
					position: "top-center",
				});
			} else if (result === "misconfigured") {
				toast.error("Notifications aren't set up on this server yet.", {
					position: "top-center",
				});
			}
		} catch (error) {
			toast.error("Couldn't turn on notifications for this device.", {
				description: getErrorMessage(error),
				duration: 6000,
				position: "top-center",
			});
		}
	};

	const handleResync = async () => {
		setIsRequestingPermission(true);
		try {
			await saveThisDevice(permission);
		} finally {
			setIsRequestingPermission(false);
		}
	};

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-xl'>
				<DialogHeader>
					<DialogTitle>Notifications</DialogTitle>
					<DialogDescription>
						Defaults apply to every room. This room can override
						each one.
					</DialogDescription>
				</DialogHeader>

				{needsInstall ? (
					<div className='flex items-start gap-2 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm'>
						<BellOffIcon className='size-4 mt-0.5 shrink-0' />
						<p>
							On iPhone and iPad, notifications only work from the
							installed app. Tap Share, then Add to Home Screen, and
							open Crow from there.
						</p>
					</div>
				) : permission !== "granted" ? (
					<div className='flex items-center justify-between gap-3 rounded-md border border-accent/40 bg-accent/10 p-3'>
						<div className='flex items-start gap-2 text-sm'>
							<BellOffIcon className='size-4 mt-0.5 shrink-0' />
							<p>
								{permission === "denied"
									? "Notifications are blocked for this site in your browser."
									: "Notifications are off on this device."}
							</p>
						</div>
						<Button
							size='sm'
							onClick={() => void handleEnableNotifications()}
							disabled={isRequestingPermission}
						>
							{permission === "denied" ? "How to fix" : "Turn on"}
						</Button>
					</div>
				) : (
					<div className='flex items-center justify-between gap-3 rounded-md border border-border/60 p-3 text-sm'>
						<p className='text-muted-foreground'>
							Notifications are allowed on this device.
						</p>
						<Button
							size='sm'
							variant='outline'
							onClick={() => void handleResync()}
							disabled={isRequestingPermission}
						>
							Re-sync device
						</Button>
					</div>
				)}

				{!preferences || isPreferencesPending ? (
					// Same scroll area, headings and toggle rows, so the
					// dialog doesn't resize when settings arrive.
					<div aria-hidden='true' className={SETTINGS_SCROLL}>
						{["Defaults", "This Room"].map((title) => (
							<section key={title} className='space-y-3'>
								<h3 className='font-semibold'>{title}</h3>
								<SkeletonList
									count={visibleKeys.length}
									className='space-y-2'
									renderItem={() => (
										<div className={SETTING_ROW}>
											<Skeleton className='h-3.5 w-40' />
											<Skeleton className='h-8 w-12' />
										</div>
									)}
								/>
							</section>
						))}
					</div>
				) : (
					<Reveal className={SETTINGS_SCROLL}>
						<section className='space-y-3'>
							<h3 className='font-semibold'>Defaults</h3>
							<div className='space-y-2'>
								{visibleKeys.map((key) => (
									<div
										key={`global-${key}`}
										className={SETTING_ROW}
									>
										<p className='text-sm'>
											{notificationLabels[key]}
										</p>
										<Button
											size='sm'
											variant={
												preferences.global[key]
													? "default"
													: "outline"
											}
											onClick={() =>
												handleGlobalToggle(key)
											}
											disabled={isBusy}
										>
											{preferences.global[key]
												? "On"
												: "Off"}
										</Button>
									</div>
								))}
							</div>
						</section>

						<section className='space-y-3'>
							<h3 className='font-semibold'>This Room</h3>
							<div className='space-y-2'>
								{visibleKeys.map((key) => (
									<div
										key={`room-${key}`}
										className={SETTING_ROW}
									>
										<div className='flex flex-col'>
											<p className='text-sm'>
												{notificationLabels[key]}
											</p>
											<p className='text-xs text-muted-foreground'>
												Effective:{" "}
												{preferences.effective[key]
													? "On"
													: "Off"}
											</p>
										</div>
										<Button
											size='sm'
											variant={overrideVariant(
												preferences.room_overrides[key],
											)}
											onClick={() => handleRoomCycle(key)}
											disabled={isBusy}
										>
											{overrideLabel(
												preferences.room_overrides[key],
											)}
										</Button>
									</div>
								))}
							</div>
						</section>
					</Reveal>
				)}

				<DialogFooter className='gap-2'>
					<Button
						variant='outline'
						onClick={handleResetRoom}
						disabled={isBusy || !preferences}
					>
						Reset room overrides
					</Button>
				</DialogFooter>
			</DialogContent>
			</Dialog>

			<NotificationPermissionBlockedDialog
				open={isBlockedDialogOpen}
				onOpenChange={setIsBlockedDialogOpen}
			/>
		</>
	);
}
