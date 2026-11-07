import {
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from "react";
import { app, CARD_SIZE, STORY_PADDING, type CardFormat } from "@/features/share/tokens";
import { twColor } from "@/shared/lib/utils";
import { CrowGlyph } from "@/shared/ui";

const columnStyle = (gap: number): CSSProperties => ({
	display: "flex",
	flexDirection: "column",
	gap,
});

const textStyle: CSSProperties = {
	background: app.base,
	color: app.text,
	fontFamily: app.font,
	fontVariantNumeric: "tabular-nums",
};

// Shrinks its content to fit the space available, never cropping it.
function FitBox({ available, children }: Readonly<{ available: number; children: ReactNode }>) {
	const ref = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);

	useLayoutEffect(() => {
		const node = ref.current;
		if (!node) return;
		const fit = () => setScale(Math.min(1, available / node.offsetHeight));
		fit();
		// Fonts and images can change the height after the first layout.
		const observer = new ResizeObserver(fit);
		observer.observe(node);
		return () => observer.disconnect();
	}, [available]);

	return (
		<div ref={ref} style={{ width: "100%", transform: `scale(${scale})`, transformOrigin: "center center" }}>
			{children}
		</div>
	);
}

// The 1080-wide field every card is drawn on. A chat image grows with its
// content; a story keeps its 9:16 frame and centres the content in it.
export function CardCanvas({
	format,
	gap = 40,
	children,
}: Readonly<{ format: CardFormat; gap?: number; children: ReactNode }>) {
	const { width, height } = CARD_SIZE[format];

	if (format === "story" && height) {
		const available = height - STORY_PADDING.top - STORY_PADDING.bottom;
		return (
			<div
				style={{
					...textStyle,
					width,
					height,
					boxSizing: "border-box",
					padding: `${STORY_PADDING.top}px ${STORY_PADDING.side}px ${STORY_PADDING.bottom}px`,
					display: "flex",
					alignItems: "center",
					overflow: "hidden",
				}}
			>
				<FitBox available={available}>
					<div style={columnStyle(gap)}>{children}</div>
				</FitBox>
			</div>
		);
	}

	return (
		<div style={{ ...textStyle, width, boxSizing: "border-box", padding: 72, ...columnStyle(gap) }}>
			{children}
		</div>
	);
}

// The Crow mark, drawn rather than loaded so captures never miss it. The eye is
// painted in the tile's colour at that spot instead of cut out (see CrowGlyph).
export function LogoTile({ size = 88 }: Readonly<{ size?: number }>) {
	return (
		<div
			style={{
				width: size,
				height: size,
				flexShrink: 0,
				borderRadius: size * 0.27,
				background: "linear-gradient(135deg, var(--primary), var(--accent))",
				color: app.brandInk,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<CrowGlyph
				style={{ width: size * 0.8, height: size * 0.8 }}
				eyeColor='color-mix(in srgb, var(--primary) 55%, var(--accent))'
			/>
		</div>
	);
}

// Logo tile, title and a muted line under it, like the app's room header.
export function RoomHeader({
	title,
	subtitle,
	trailing,
}: Readonly<{ title: string; subtitle?: string | null; trailing?: ReactNode }>) {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 24, minWidth: 0 }}>
				<LogoTile />
				<div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
					<span style={{ fontSize: 40, fontWeight: 700, ...singleLine }}>{title}</span>
					{subtitle ? (
						<span style={{ fontSize: 28, color: app.muted, ...singleLine }}>{subtitle}</span>
					) : null}
				</div>
			</div>
			{trailing}
		</div>
	);
}

export const singleLine: CSSProperties = {
	whiteSpace: "nowrap",
	overflow: "hidden",
	textOverflow: "ellipsis",
};

type PillTone = "win" | "live" | "neutral" | "gradient";

const PILL_TONES: Record<PillTone, CSSProperties> = {
	win: { color: app.win, background: twColor("win", 0.15) },
	live: { color: app.loss, background: twColor("loss", 0.18) },
	neutral: { color: app.text, background: app.raised },
	gradient: { color: app.onGradient, background: app.gradient },
};

// The app's status and info chips.
export function Pill({
	tone = "neutral",
	size = 24,
	children,
}: Readonly<{ tone?: PillTone; size?: number; children: ReactNode }>) {
	return (
		<span
			style={{
				alignSelf: "flex-start",
				fontSize: size,
				fontWeight: 600,
				borderRadius: 999,
				padding: `${size * 0.35}px ${size * 0.9}px`,
				whiteSpace: "nowrap",
				...PILL_TONES[tone],
			}}
		>
			{children}
		</span>
	);
}

// One option as the app shows it: label, value and a bar filled by its share.
export function OptionRow({
	label,
	value,
	share,
	isWinner = false,
	chip,
	muted = false,
	compact = false,
}: Readonly<{
	label: string;
	value: string;
	share: number;
	isWinner?: boolean;
	chip?: string | null;
	// Losing options on a settled prediction fade back.
	muted?: boolean;
	compact?: boolean;
}>) {
	const fontSize = compact ? 28 : 32;
	return (
		<div
			style={{
				borderRadius: 24,
				border: isWinner ? `3px solid ${app.win}` : `2px solid ${twColor("foreground", 0.08)}`,
				background: app.base,
				padding: compact ? "18px 24px" : "24px 28px",
				display: "flex",
				flexDirection: "column",
				gap: compact ? 10 : 14,
			}}
		>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, fontSize }}>
				<span style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
					<span style={singleLine}>{label}</span>
					{chip ? (
						<span
							style={{
								fontSize: 22,
								fontWeight: 600,
								color: app.base,
								background: isWinner ? app.win : app.text,
								borderRadius: 999,
								padding: "4px 16px",
								whiteSpace: "nowrap",
							}}
						>
							{chip}
						</span>
					) : null}
				</span>
				<span style={{ color: isWinner ? app.win : app.muted, whiteSpace: "nowrap" }}>{value}</span>
			</div>
			<div style={{ height: compact ? 12 : 14, borderRadius: 999, background: app.raised }}>
				<div
					style={{
						width: `${Math.max(0, Math.min(100, share))}%`,
						height: "100%",
						borderRadius: 999,
						background: muted ? app.faint : app.gradient,
					}}
				/>
			</div>
		</div>
	);
}

// How to get in: the room on the left, the address and code on the right.
export function CardFooter({
	label,
	host,
	roomCode,
}: Readonly<{ label: string; host: string; roomCode: string }>) {
	return (
		<div
			style={{
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
				gap: 24,
				fontSize: 26,
				color: app.muted,
				borderTop: `2px solid ${app.hairline}`,
				paddingTop: 28,
			}}
		>
			<span style={singleLine}>{label}</span>
			<span style={{ color: app.text, whiteSpace: "nowrap" }}>
				{host} · {roomCode}
			</span>
		</div>
	);
}

// "carol" -> "CA", "Nadia Newbie" -> "NN".
export function initials(name: string) {
	const words = name.trim().split(/\s+/).filter(Boolean);
	const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
	return letters.toUpperCase();
}
