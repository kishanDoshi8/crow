import { PlusIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useCurrentSeries } from "@/features/series";
import { Alert, AlertDescription, Button } from "@/shared/ui";

// Questions from the fixtures go into an active series: say so when there
// isn't one.
export function NoActiveSeries({ roomId, roomCode }: Readonly<{ roomId: string; roomCode: string }>) {
	const { hasActiveSeries, isPending } = useCurrentSeries(roomId);
	if (isPending || hasActiveSeries) return null;
	return (
		<Alert>
			<AlertDescription className='space-y-3'>
				<p>Start a series first. Questions from the fixtures go into the active series.</p>
				<Button asChild size='sm' variant='outline'>
					<Link to={`/rooms/${roomCode}/series/new`}>
						<PlusIcon />
						New series
					</Link>
				</Button>
			</AlertDescription>
		</Alert>
	);
}
