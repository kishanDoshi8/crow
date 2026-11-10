import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type Stat = {
	label: string;
	value: ReactNode;
	// A text colour class for the value, e.g. "text-win".
	tone?: string;
	// How much of the row this cell takes next to the others (default 1).
	grow?: number;
};

// Two to four facts in one bordered row, each with its label above its
// value. Use this instead of joining facts with a dot ("1,200 pooled · 6
// picks"): every fact keeps its own place and nothing breaks across a line.
export function StatStrip({
	stats,
	size = "sm",
	className,
}: Readonly<{ stats: Stat[]; size?: "sm" | "lg"; className?: string }>) {
	return (
		<dl
			className={cn("grid divide-x overflow-hidden rounded-xl border", className)}
			style={{
				gridTemplateColumns: stats.map((stat) => `minmax(0, ${stat.grow ?? 1}fr)`).join(" "),
			}}
		>
			{stats.map((stat) => (
				<div key={stat.label} className='min-w-0 px-3 py-2'>
					<dt className='truncate text-xs text-muted-foreground'>{stat.label}</dt>
					<dd
						className={cn(
							// Long values wrap inside their cell rather than cut off.
							"font-semibold leading-snug tabular-nums wrap-anywhere",
							size === "lg" ? "text-xl" : "text-sm",
							stat.tone,
						)}
					>
						{stat.value}
					</dd>
				</div>
			))}
		</dl>
	);
}

// One labelled fact as a small tag ("Your pick  Over"). Several sit in a
// flex-wrap row, so they wrap whole and never mid-phrase.
export function FactTag({
	label,
	children,
	className,
}: Readonly<{ label: string; children: ReactNode; className?: string }>) {
	return (
		<span
			className={cn(
				"inline-flex max-w-full items-baseline gap-1.5 rounded-md border px-2 py-0.5 text-xs",
				className,
			)}
		>
			<span className='shrink-0 text-muted-foreground'>{label}</span>
			<span className='truncate font-semibold'>{children}</span>
		</span>
	);
}
