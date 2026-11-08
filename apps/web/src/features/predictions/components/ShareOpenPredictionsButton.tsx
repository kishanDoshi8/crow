import { Share2Icon } from "lucide-react";
import { toast } from "sonner";
import type { Prediction } from "@/features/predictions/types/types";
import { shareLink } from "@/features/share";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { Button } from "@/shared/ui";

type Props = {
	roomName: string;
	roomCode: string;
	predictions: Prediction[];
};

// For organizers: a nudge for the group chat, for people who don't act on
// notifications. Says how many predictions are open, which closes next, and
// links into the room. Opens the phone's share sheet, or copies the message
// where there isn't one. Nothing to share when no prediction is open.
export function ShareOpenPredictionsButton({ roomName, roomCode, predictions }: Readonly<Props>) {
	const open = predictions
		.filter((p) => p.status === "draft" && Date.parse(p.deadline) > Date.now())
		.sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
	if (open.length === 0) return null;

	const handleShare = async () => {
		const text = openPredictionsMessage(roomName, open, shareLink(roomCode, "picks-nudge"));
		if (typeof navigator.share === "function") {
			try {
				// The link goes in the text: some apps drop a separate url.
				await navigator.share({ text });
				return;
			} catch (error) {
				// Closing the share sheet isn't a failure.
				if (error instanceof DOMException && error.name === "AbortError") return;
			}
		}
		const copied = await copyToClipboard(text);
		if (copied) {
			toast.success("Message copied", {
				description: "Paste it in your group chat.",
				position: "top-center",
			});
		} else {
			toast.error("Couldn't copy the message here.", { position: "top-center" });
		}
	};

	return (
		<Button
			variant='outline'
			size='icon-sm'
			onClick={() => void handleShare()}
			aria-label='Share open predictions'
			title='Share open predictions'
		>
			<Share2Icon />
		</Button>
	);
}

// "🐦 3 predictions are open in Saturday Crew!
//  Next to close: Will India beat Australia? (2h 14m left)
//  Get your picks in: https://…"
// `open` is sorted soonest-closing first.
export function openPredictionsMessage(roomName: string, open: Prediction[], link: string) {
	const [next] = open;
	const left = timeLeft(Date.parse(next.deadline) - Date.now());
	if (open.length === 1) {
		return [
			`🐦 A prediction is open in ${roomName}!`,
			`${next.title} (${left} left)`,
			`Get your pick in: ${link}`,
		].join("\n");
	}
	return [
		`🐦 ${open.length} predictions are open in ${roomName}!`,
		`Next to close: ${next.title} (${left} left)`,
		`Get your picks in: ${link}`,
	].join("\n");
}

// "1d 4h", "2h 14m", "45m": whole minutes, never under 1m.
function timeLeft(ms: number) {
	const minutes = Math.max(1, Math.floor(ms / 60_000));
	const days = Math.floor(minutes / 1440);
	const hours = Math.floor((minutes % 1440) / 60);
	const mins = minutes % 60;
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${mins}m`;
	return `${mins}m`;
}
