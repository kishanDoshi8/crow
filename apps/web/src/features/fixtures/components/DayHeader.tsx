import type { ReactNode } from "react";

// A day's title that sticks under the page's filters while its matches
// scroll past.
export function DayHeader({
	label,
	top,
	action,
}: Readonly<{ label: string; top: number; action?: ReactNode }>) {
	return (
		<div
			style={{ top }}
			className='sticky z-[5] flex items-center justify-between gap-3 border-y bg-secondary/90 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-secondary/75 lg:border-t-0'
		>
			<h3 className='text-sm font-semibold'>{label}</h3>
			{action}
		</div>
	);
}
