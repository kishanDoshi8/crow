import { AnimatePresence, m } from "framer-motion";
import type { ReactNode } from "react";
import { collapseTransition } from "@/shared/lib/motion";

type CollapseProps = {
	open: boolean;
	children: ReactNode;
	className?: string;
};

// Grows content in and out of the layout instead of popping it, so whatever
// sits below slides rather than jumps. Clips only while animating.
export function Collapse({ open, children, className }: Readonly<CollapseProps>) {
	return (
		<AnimatePresence initial={false}>
			{open ? (
				<m.div
					key='collapse'
					className={className}
					initial={{ height: 0, opacity: 0, overflow: "hidden" }}
					animate={{
						height: "auto",
						opacity: 1,
						transitionEnd: { overflow: "visible" },
					}}
					exit={{ height: 0, opacity: 0, overflow: "hidden" }}
					transition={collapseTransition}
				>
					{children}
				</m.div>
			) : null}
		</AnimatePresence>
	);
}
