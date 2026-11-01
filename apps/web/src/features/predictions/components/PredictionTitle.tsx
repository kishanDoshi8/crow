import { FadeContent, Skeleton } from "@/shared/ui";
import { Prediction } from "@/features/predictions";
import { PredictionTags } from "@/features/predictions/components/PredictionTags";

type Props = {
	prediction: Prediction | null | undefined;
	fadeDelay?: number;
};

export default function PredictionTitle({
	prediction,
	fadeDelay,
}: Readonly<Props>) {
	return (
		<>
			{prediction ? (
				<FadeContent delay={fadeDelay}>
					<h4
						className={`text-xl md:text-3xl font-semibold text-center`}
					>
						{prediction.title}
					</h4>
					<PredictionTags
						tags={prediction.tags}
						className='mt-2 justify-center'
					/>
					{prediction.description ? (
						<div className='mx-auto mt-3 max-w-md rounded-lg border border-border/60 px-3 py-2 text-left'>
							<p className='text-xs font-semibold text-muted-foreground'>
								Details
							</p>
							<p className='mt-0.5 whitespace-pre-line text-sm text-foreground/90'>
								{prediction.description}
							</p>
						</div>
					) : null}
				</FadeContent>
			) : (
				// Holds the heading's line height (text-xl, md:text-3xl).
				<div className={`flex h-7 md:h-9 items-center justify-center`}>
					<Skeleton className={`h-5 md:h-7 max-w-xs w-3/4`} />
				</div>
			)}
		</>
	);
}
