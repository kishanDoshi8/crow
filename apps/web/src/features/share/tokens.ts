// Shareables look like the app's own screens ("straight from the app"). They're
// captured to PNG, so ShareSheet renders them inside a .dark wrapper: these
// theme variables resolve to the dark theme whatever theme the sharer uses.
export const app = {
	base: "var(--background)",
	card: "var(--card)",
	raised: "var(--secondary)",
	hairline: "var(--border)",
	text: "var(--foreground)",
	muted: "var(--muted-foreground)",
	faint: "color-mix(in srgb, var(--muted-foreground) 60%, transparent)",
	accent: "var(--accent)",
	onGradient: "var(--primary-foreground)",
	brandInk: "var(--brand-ink)",
	gradient: "linear-gradient(90deg, var(--primary), var(--accent))",
	win: "var(--win)",
	loss: "var(--loss)",
	gold: "var(--rank-1)",
	silver: "var(--rank-2)",
	bronze: "var(--rank-3)",
	activity: "var(--activity)",
	font: '"Fira Code Variable", ui-monospace, monospace',
} as const;

// "chat" images are as tall as their content, so nothing is ever cut off;
// "story" keeps the 9:16 frame stories need and shrinks content to fit it.
export type CardFormat = "chat" | "story";

export const CARD_SIZE: Record<CardFormat, { width: number; height?: number }> = {
	chat: { width: 1080 },
	story: { width: 1080, height: 1920 },
};

// Space a story keeps clear at the top and bottom for the app's own controls.
export const STORY_PADDING = { top: 180, bottom: 200, side: 72 } as const;
