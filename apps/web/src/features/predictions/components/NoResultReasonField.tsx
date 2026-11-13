import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/lib/utils";

// The database keeps up to this many characters (predictions.no_result_reason).
export const NO_RESULT_REASON_MAX = 120;

type Props = {
	value: string;
	onChange: (value: string) => void;
	id?: string;
	placeholder?: string;
	className?: string;
};

// Why a prediction has no winner, in a sentence or two, with what's left to
// type underneath once it gets close to the limit.
export function NoResultReasonField({
	value,
	onChange,
	id,
	placeholder = "Reason (optional)",
	className,
}: Readonly<Props>) {
	const left = NO_RESULT_REASON_MAX - value.length;

	return (
		<div className={cn("flex flex-col gap-1", className)}>
			<Textarea
				id={id}
				placeholder={placeholder}
				value={value}
				maxLength={NO_RESULT_REASON_MAX}
				rows={2}
				onChange={(event) => onChange(event.target.value)}
				className='min-h-16 resize-none'
			/>
			<p
				className={cn(
					"self-end text-xs tabular-nums text-muted-foreground",
					left > 20 && "invisible",
				)}
				aria-live='polite'
			>
				{left} {left === 1 ? "character" : "characters"} left
			</p>
		</div>
	);
}
