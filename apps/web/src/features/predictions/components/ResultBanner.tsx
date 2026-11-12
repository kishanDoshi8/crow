import { useState } from "react";
import { Share2Icon } from "lucide-react";
import { Button } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import {
	ResultCard,
	shareHost,
	shareLink,
	ShareSheet,
	type ResultCardData,
} from "@/features/share";

type Props = {
	roomId: string;
	predictionId: string;
	data: ResultCardData;
};

// The moment a result lands: your number, and a card to share it.
export function ResultBanner({ roomId, predictionId, data }: Readonly<Props>) {
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const { call } = data;
	const won = !!call && call.pick === data.winner;

	let headline = `${data.winner} won`;
	if (call) headline = won ? "You called it" : `You picked ${call.pick}. Time to eat crow.`;
	const total = call
		? `${call.net > 0 ? "+" : call.net < 0 ? "−" : "±"}${Math.abs(call.net).toLocaleString()}`
		: null;

	const message = won
		? `Called it on Crow: ${data.question}`
		: `${data.winner} it is: ${data.question}`;

	return (
		<div className='flex items-center justify-between gap-4 rounded-2xl bg-secondary px-4 py-3.5'>
			<div className='min-w-0'>
				<p className='truncate text-sm text-muted-foreground'>{headline}</p>
				{total ? (
					<p
						className={cn(
							"text-4xl font-bold leading-none",
							call && call.net > 0 && "text-win",
							call && call.net < 0 && "text-loss",
						)}
					>
						{total}
						<span className='ml-1 text-xl'>pts</span>
					</p>
				) : (
					<p className='truncate text-lg font-semibold'>
						{data.calledIt} of {data.participants} called it
					</p>
				)}
			</div>
			<Button
				variant={won ? "linear" : "outline"}
				onClick={() => setIsSheetOpen(true)}
			>
				<Share2Icon />
				{won ? "Crow about it" : "Share result"}
			</Button>
			<ShareSheet
				open={isSheetOpen}
				onOpenChange={setIsSheetOpen}
				title={call ? "Share your result" : "Share the result"}
				description='Friends who tap the link can join the room and see this prediction.'
				message={message}
				link={shareLink(
					data.roomCode,
					"brag-card",
					`/rooms/${data.roomCode}/predictions/${predictionId}`,
				)}
				kind='brag-card'
				roomId={roomId}
				fileName={`crow-${predictionId.slice(0, 8)}`}
				renderCard={(format) => <ResultCard data={{ ...data, host: shareHost() }} format={format} />}
			/>
		</div>
	);
}
