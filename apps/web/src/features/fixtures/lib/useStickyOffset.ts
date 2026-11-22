import { useCallback, useEffect, useState } from "react";

// How far from the top a sticky element must sit to clear the room's own
// sticky header (phone header or desktop top bar, whichever shows) and,
// optionally, a sticky bar of the page's own above it: attach `ref` to that
// bar. A callback ref, so a bar that only appears once data loads is still
// measured.
export function useStickyOffset() {
	const [bar, setBar] = useState<HTMLElement | null>(null);
	const [offsets, setOffsets] = useState({ header: 0, total: 0 });
	const ref = useCallback((el: HTMLElement | null) => setBar(el), []);

	useEffect(() => {
		const measure = () => {
			const header = [...document.querySelectorAll<HTMLElement>("[data-room-header]")].find(
				(el) => el.offsetHeight > 0,
			);
			const headerHeight = header?.offsetHeight ?? 0;
			const total = headerHeight + (bar?.offsetHeight ?? 0);
			setOffsets((current) =>
				current.header === headerHeight && current.total === total ? current : { header: headerHeight, total },
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		document.querySelectorAll("[data-room-header]").forEach((el) => observer.observe(el));
		if (bar) observer.observe(bar);
		window.addEventListener("resize", measure);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", measure);
		};
	}, [bar]);

	return { ...offsets, ref };
}
