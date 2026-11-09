import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOffIcon, WifiIcon } from "lucide-react";
import { useOnline } from "@/shared/lib/offline";
import { cn } from "@/shared/lib/utils";

const BACK_ONLINE_MS = 2500;

// A slim line saying the app is offline and how old what's on screen is.
// When the connection returns it says so briefly, then goes away.
export function OfflineBar({ className }: Readonly<{ className?: string }>) {
	const online = useOnline();
	const queryClient = useQueryClient();
	const wasOffline = useRef(!online);
	const [backOnline, setBackOnline] = useState(false);
	const [savedAt, setSavedAt] = useState<number | null>(null);

	useEffect(() => {
		if (!online) {
			wasOffline.current = true;
			setBackOnline(false);
			// The newest data on the device: what the screens are showing.
			const newest = Math.max(
				0,
				...queryClient
					.getQueryCache()
					.getAll()
					.map((query) => query.state.dataUpdatedAt),
			);
			setSavedAt(newest || null);
			return;
		}
		if (!wasOffline.current) return;
		wasOffline.current = false;
		setBackOnline(true);
		const timer = window.setTimeout(() => setBackOnline(false), BACK_ONLINE_MS);
		return () => window.clearTimeout(timer);
	}, [online, queryClient]);

	if (online && !backOnline) return null;

	return (
		<div
			role='status'
			className={cn(
				"flex items-center justify-center gap-1.5 px-3 py-1 text-xs",
				online ? "bg-win/15 text-win" : "bg-muted text-muted-foreground",
				className,
			)}
		>
			{online ? (
				<>
					<WifiIcon className='size-3.5' aria-hidden />
					Back online
				</>
			) : (
				<>
					<CloudOffIcon className='size-3.5' aria-hidden />
					Offline
					{savedAt ? ` · saved ${formatSaved(savedAt)}` : ""}
				</>
			)}
		</div>
	);
}

// "3:42 PM" today, "Sat 3:42 PM" otherwise.
function formatSaved(at: number) {
	const date = new Date(at);
	const today = date.toDateString() === new Date().toDateString();
	return date.toLocaleString("en-US", {
		...(today ? {} : { weekday: "short" }),
		hour: "numeric",
		minute: "2-digit",
	});
}
