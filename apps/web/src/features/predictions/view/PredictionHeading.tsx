import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PredictionTags } from "@/features/predictions/components/PredictionTags";
import type { Prediction } from "@/features/predictions/types/types";

// Where the prediction sits, the question, its tags and details. Read like a
// post: left-aligned, the question as the page's heading.
export function PredictionHeading({
	prediction,
	roomCode,
	menu,
}: Readonly<{
	prediction: Prediction;
	roomCode: string;
	// Staff tools (⋯), when the viewer has any.
	menu?: ReactNode;
}>) {
	const series = prediction.seriesTitle
		? `${prediction.seriesTitle}${prediction.seriesPredictionNumber ? ` · #${prediction.seriesPredictionNumber}` : ""}`
		: null;

	return (
		<section>
			<div className='flex min-h-6 items-center justify-between gap-2'>
				{series ? (
					<Link
						to={`/rooms/${roomCode}/series/${prediction.seriesId}`}
						className='text-xs text-muted-foreground hover:text-foreground'
					>
						{series}
					</Link>
				) : (
					<span />
				)}
				{menu}
			</div>
			<h1 className='mt-1 text-[1.375rem] font-semibold leading-snug tracking-tight wrap-anywhere'>
				{prediction.title}
			</h1>
			<PredictionTags tags={prediction.tags} className='mt-2.5' />
			{prediction.description ? (
				<p className='mt-2.5 whitespace-pre-line text-sm text-muted-foreground'>
					{prediction.description}
				</p>
			) : null}
		</section>
	);
}
