import { useId, type CSSProperties } from "react";
import { cn } from "@/shared/lib/utils";

// The Crow mark: a crow mid-caw. Drawn on a 512 grid; the eye is cut out so
// whatever is behind the crow shows through it.
// Keep in sync with apps/web/brand/crow.svg, which the icon files are made from.
export const CROW_PATH =
	"M492 190 L344 154 L296 130 L228 140 L186 182 L170 248 L162 312 L122 366 L182 354 L158 414 L216 392 L210 446 L274 406 L316 350 L340 294 L358 262 L482 294 L366 234 Z";
export const CROW_EYE = { cx: 290, cy: 188, r: 15 } as const;

// The bird alone, in the current text colour. `eyeColor` paints the eye instead
// of cutting it out: image captures (share cards) don't always keep SVG masks.
export function CrowGlyph({
	className,
	style,
	eyeColor,
}: Readonly<{ className?: string; style?: CSSProperties; eyeColor?: string }>) {
	const maskId = `crow-eye-${useId().replace(/:/g, "")}`;
	if (eyeColor) {
		return (
			<svg viewBox='0 0 512 512' className={className} style={style} aria-hidden='true'>
				<path d={CROW_PATH} fill='currentColor' />
				<circle {...CROW_EYE} fill={eyeColor} />
			</svg>
		);
	}
	return (
		<svg viewBox='0 0 512 512' className={className} style={style} aria-hidden='true'>
			<mask id={maskId}>
				<rect width='512' height='512' fill='white' />
				<circle {...CROW_EYE} fill='black' />
			</mask>
			<path d={CROW_PATH} fill='currentColor' mask={`url(#${maskId})`} />
		</svg>
	);
}

// The app icon: the crow on the sunset tile, sized by `size` (px).
export function CrowTile({
	size = 48,
	className,
}: Readonly<{ size?: number; className?: string }>) {
	return (
		<div
			className={cn(
				"grid shrink-0 place-items-center bg-linear-135 from-primary to-accent text-brand-ink",
				className,
			)}
			style={{ width: size, height: size, borderRadius: size * 0.27 }}
		>
			<CrowGlyph style={{ width: "80%", height: "80%" }} />
		</div>
	);
}
