import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// "+120", "-40", "0": for point changes.
export function formatSignedPoints(value: number) {
	return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

// "1st", "2nd", "3rd", "11th": a place in the standings.
export function ordinal(value: number) {
	const tens = value % 100;
	if (tens >= 11 && tens <= 13) return `${value}th`;
	return `${value}${["th", "st", "nd", "rd"][value % 10] ?? "th"}`;
}

// "today at 8:00 PM" → "Today at 8:00 PM", for a value that starts a line.
export function capitalize(text: string) {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

// Two letters for an avatar: "John Doe", "john_doe" and "JohnDoe" -> "JD";
// otherwise the first two letters or digits, "carol" -> "CA".
export function initialsOf(name: string | null | undefined) {
	const text = (name ?? "").trim();
	const words = text.split(/[\s_.-]+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
	if (words.length > 1) {
		const first = (word: string) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? "";
		return (first(words[0]) + first(words[1])).toUpperCase();
	}
	// CamelCase: a capital at the start of each hump.
	const humps = text.match(/(?:^|(?<=\p{Ll}))\p{Lu}/gu) ?? [];
	if (humps.length > 1) return (humps[0] + humps[1]).toUpperCase();
	return text.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


/**
 * Dynamically retrieves a normal, resolved CSS color string from a Tailwind v4 variable.
 * @param colorName The name of the color (e.g., 'blue-500', 'primary')
 * @returns The computed CSS color value (guaranteed to be an rgb() or rgba() string)
 */
export function twColor(
	name: string,
	alpha?: number,
) {
	if (alpha !== undefined) {
		return `color-mix(in srgb, var(--${name}) ${
			alpha * 100
		}%, transparent)`;
	}

	return `var(--${name})`;
}
