import { m, type HTMLMotionProps } from "framer-motion";
import { stepVariants, type StepDirection } from "@/shared/lib/motion";

type StepInElement = "div" | "section";

type StepInProps = HTMLMotionProps<"div"> & {
	/** Which way the reader moved: 1 forward, -1 back, 0 just arrived. */
	direction?: StepDirection;
	/** Position on the page: later sections follow a beat behind. */
	index?: number;
	as?: StepInElement;
};

// Brings a page's section in when it replaces another in a sequence (the
// next question): it slides a little from the side the reader is moving
// towards and fades up, so the change reads as a step rather than a cut.
// With no direction it's a plain Reveal-style lift.
export function StepIn({ direction = 0, index = 0, as = "div", ...props }: Readonly<StepInProps>) {
	const Component = m[as] as typeof m.div;
	return (
		<Component
			variants={stepVariants}
			initial='hidden'
			animate='visible'
			custom={{ direction, index }}
			{...props}
		/>
	);
}
