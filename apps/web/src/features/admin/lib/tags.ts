// Tags are 24 characters at most (public.prediction_tags).
export const TAG_MAX = 24;

// A tag to start from for a competition: its name if it fits; else the name
// without a bracketed part ("Asia Cup 2026 (Sri Lanka and Pakistan)" →
// "Asia Cup 2026"), cut at a word to fit.
export function suggestTag(name: string) {
	const trimmed = name.trim();
	if (trimmed.length <= TAG_MAX) return trimmed;
	const short = trimmed.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
	if (short.length <= TAG_MAX) return short;
	const cut = short.slice(0, TAG_MAX + 1);
	const space = cut.lastIndexOf(" ");
	return (space > 0 ? cut.slice(0, space) : short.slice(0, TAG_MAX)).trim();
}
