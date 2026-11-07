import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/utils";

// The Crow mark: an oversized crow bust with a squinting eye and a crescent cut
// into the wing. Drawn on a 512 grid as a full tile: the body runs off the left
// and bottom edges, so whatever holds it should clip to its own shape.
// The body path is even-odd: the wing and the eye are holes, so whatever is
// behind the crow shows through them; the wing (rose) and eye are then painted
// on top.
// Keep in sync with apps/web/brand/crow.svg, which the icon files are made from.
export const CROW_EYE =
	"M262 180 L318 203 C312 220 296 226 284 222 C268 216 262 198 262 180 Z";
export const CROW_WING =
	"M60 322 C122 284 206 292 236 350 C256 392 246 436 224 474 C232 424 228 380 206 354 C172 316 112 308 60 322 Z";
export const CROW_PATH =
	"M-40 344 L140 192 L95 198 Q160 140 220 122 Q300 128 356 172 L362 180 Q440 190 488 240 Q420 236 372 252 Q334 268 332 300 C330 330 352 360 354 410 Q356 470 322 540 L-40 540 Z " +
	CROW_WING +
	" " +
	CROW_EYE;
export const CROW_PUPIL = { cx: 300, cy: 200, r: 8 } as const;

// The bird alone, in the current text colour, with a rose wing and white eye.
// No masks, so image captures (share cards) keep the holes.
export function CrowGlyph({
	className,
	style,
}: Readonly<{ className?: string; style?: CSSProperties }>) {
	return (
		<svg viewBox='0 0 512 512' className={className} style={style} aria-hidden='true'>
			<path d={CROW_PATH} fillRule='evenodd' fill='currentColor' />
			<path d={CROW_WING} fill='var(--primary)' />
			<path d={CROW_EYE} fill='var(--brand-eye)' />
			<circle {...CROW_PUPIL} fill='currentColor' />
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
				"shrink-0 overflow-hidden bg-linear-135 from-primary to-accent text-brand-ink",
				className,
			)}
			style={{ width: size, height: size, borderRadius: size * 0.27 }}
		>
			<CrowGlyph className='block size-full' />
		</div>
	);
}
