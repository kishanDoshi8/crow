import { describeDeadline, shortDeadline } from "@/shared/lib/deadline";
import { capitalize } from "@/shared/lib/utils";

// When picks close, short enough for one line in a stat cell ("8:30 PM",
// "Tomorrow", "Thu", "Nov 28"), so the card's cells keep one shape. The
// countdown above gives the time left; the full time is in the tooltip.
export function ClosesAt({ deadline }: Readonly<{ deadline: string | Date }>) {
	const date = new Date(deadline);
	const full = capitalize(describeDeadline(date).when);
	return (
		<time dateTime={date.toISOString()} title={full} className='block truncate'>
			{shortDeadline(date)}
		</time>
	);
}
