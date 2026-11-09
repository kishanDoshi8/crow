import { useSyncExternalStore } from "react";

// Whether a CSS media query matches, kept up to date as the window changes.
// Prefer Tailwind's responsive classes; use this only where a wider screen
// needs a different structure, not just different styles.
export function useMediaQuery(query: string) {
	return useSyncExternalStore(
		(onChange) => {
			const list = globalThis.matchMedia?.(query);
			list?.addEventListener("change", onChange);
			return () => list?.removeEventListener("change", onChange);
		},
		() => globalThis.matchMedia?.(query).matches ?? false,
		() => false,
	);
}

// Desktop layout: Tailwind's lg breakpoint (64rem, 1024px) and up.
export function useIsDesktop() {
	return useMediaQuery("(min-width: 64rem)");
}
