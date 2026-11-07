import { m, type HTMLMotionProps } from "framer-motion";
import { revealVariants } from "@/shared/lib/motion";

type RevealElement = "div" | "li" | "section";

type RevealProps = HTMLMotionProps<"div"> & {
	/** Position in a list: staggers the entrance (capped for long lists). */
	index?: number;
	/** Extra wait in seconds before entering, to sequence sections. */
	delay?: number;
	/** Element to render, so list rows keep their own semantics and layout. */
	as?: RevealElement;
};

// Fades and lifts its content in on mount. Use it for content that replaces a
// skeleton, so the swap reads as one smooth step instead of a jump.
export function Reveal({
	index = 0,
	delay = 0,
	as = "div",
	...props
}: Readonly<RevealProps>) {
	const Component = m[as] as typeof m.div;
	return (
		<Component
			variants={revealVariants}
			initial='hidden'
			animate='visible'
			custom={{ index, delay }}
			{...props}
		/>
	);
}
