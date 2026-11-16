import type { RoomMemberRecentPrediction } from "../../types/types";
import { Badge, SkeletonList } from "@/shared/ui";
import { CheckIcon, CircleSlash, X } from "lucide-react";

const resultBadgeMeta = {
	won: {
		label: "Won",
		className: "bg-win/20 text-win",
		icon: <CheckIcon className='w-4 h-4 text-win' />,
	},
	lost: {
		label: "Lost",
		className: "bg-loss/20 text-loss",
		icon: <X className='w-4 h-4 text-loss' />,
	},
	no_result: {
		label: "No result",
		className: "bg-muted text-muted-foreground",
		icon: <CircleSlash className='w-4 h-4 text-muted-foreground' />,
	},
} as const;

type Props = {
	predictions: RoomMemberRecentPrediction[];
	isLoading: boolean;
};

// The last five results, newest first and ringed.
export function RecentForm({ predictions, isLoading }: Readonly<Props>) {
	if (isLoading) {
		return (
			<SkeletonList
				count={5}
				className='flex gap-2'
				itemClassName='size-8.5 rounded-full'
			/>
		);
	}

	if (predictions.length === 0) {
		return (
			<p className='text-sm text-muted-foreground'>
				No results yet.
			</p>
		);
	}

	return (
		<ul className='flex gap-2'>
			{predictions.map((entry, i) => {
				const meta = resultBadgeMeta[entry.result];
				return (
					<li key={entry.prediction_id}>
						<Badge
							aria-label={meta.label}
							className={`rounded-full p-2 border ${meta.className} ${i === 0 ? "ring" : ""}`}
						>
							{meta.icon}
						</Badge>
					</li>
				);
			})}
		</ul>
	);
}
