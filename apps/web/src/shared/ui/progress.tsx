import * as React from "react";
import { m } from "framer-motion";
import { Progress as ProgressPrimitive } from "radix-ui";

import { progressTransition } from "@/shared/lib/motion";

import { cn } from "@/shared/lib/utils";

function Progress({
	className,
	indicatorBgClassName,
	value,
	...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
	indicatorBgClassName?: string;
}) {
	return (
		<ProgressPrimitive.Root
			data-slot='progress'
			className={cn(
				"bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
				className,
			)}
			{...props}
		>
			{/* Grows in from empty on mount, then follows value changes. */}
			<ProgressPrimitive.Indicator asChild>
				<m.div
					data-slot='progress-indicator'
					className={cn(
						"h-full w-full flex-1 rounded-full",
						indicatorBgClassName || "bg-linear-to-r from-primary to-accent ",
					)}
					initial={{ x: "-100%" }}
					animate={{ x: `-${100 - (value || 0)}%` }}
					transition={progressTransition}
				/>
			</ProgressPrimitive.Indicator>
		</ProgressPrimitive.Root>
	);
}

export { Progress };
