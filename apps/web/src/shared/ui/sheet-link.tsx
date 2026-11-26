import * as React from "react";
import { Link, type LinkProps } from "react-router-dom";
import { useAppNavigation, type NavState } from "@/shared/lib/navigation";

type Props = Omit<LinkProps, "to" | "state"> & { to: string; state?: NavState };

// A link out of an open drawer or dialog to another page. A plain click goes
// through useAppNavigation().open, so the sheet's history entries come off
// before the push and the page under the sheet doesn't flash back on the way
// (a plain <Link> there is tidied up afterwards, with a visible hop). A click
// meant for a new tab or window stays an ordinary link. Fine outside a sheet
// too: it's then a plain push.
export const SheetLink = React.forwardRef<HTMLAnchorElement, Props>(
	function SheetLink({ to, state, onClick, ...props }, ref) {
		const { open } = useAppNavigation();
		return (
			<Link
				ref={ref}
				to={to}
				state={state}
				{...props}
				onClick={(event) => {
					onClick?.(event);
					if (event.defaultPrevented || !isPlainClick(event)) return;
					event.preventDefault();
					open(to, state);
				}}
			/>
		);
	},
);

function isPlainClick(event: React.MouseEvent<HTMLAnchorElement>) {
	const target = event.currentTarget.getAttribute("target");
	return (
		event.button === 0 &&
		(!target || target === "_self") &&
		!event.metaKey &&
		!event.altKey &&
		!event.ctrlKey &&
		!event.shiftKey
	);
}
