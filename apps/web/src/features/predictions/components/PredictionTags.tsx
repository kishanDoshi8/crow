import type { PredictionTag } from "@/features/predictions/types/types";
import { cn } from "@/shared/lib/utils";

type Props = {
	tags: PredictionTag[] | undefined;
	className?: string;
};

// Short labels on a prediction (T20, Semi-final), shown as typed.
export function PredictionTags({ tags, className }: Readonly<Props>) {
	if (!tags?.length) return null;
	return (
		<ul aria-label='Tags' className={cn("flex flex-wrap gap-1", className)}>
			{tags.map((tag) => (
				<li
					key={tag.id}
					className='rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium leading-none text-secondary-foreground'
				>
					{tag.tag}
				</li>
			))}
		</ul>
	);
}
