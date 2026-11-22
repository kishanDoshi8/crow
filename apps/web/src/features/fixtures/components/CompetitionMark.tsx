import { monogram } from "@/features/fixtures/lib/grouping";
import { cn } from "@/shared/lib/utils";

// A competition's initials on a plain tile: no crests or league marks
// (docs/event-packs.md).
export function CompetitionMark({ name, className }: Readonly<{ name: string; className?: string }>) {
	return (
		<span
			aria-hidden='true'
			className={cn(
				"flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-bold tracking-tight",
				className,
			)}
		>
			{monogram(name)}
		</span>
	);
}
