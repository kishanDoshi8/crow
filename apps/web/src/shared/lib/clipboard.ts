// Copies text, falling back to the old execCommand path where the Clipboard API
// is missing or refused (some in-app browsers and iOS home-screen apps).
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// fall through to the legacy path
	}

	const field = document.createElement("textarea");
	field.value = text;
	field.setAttribute("readonly", "");
	field.style.position = "fixed";
	field.style.opacity = "0";
	document.body.appendChild(field);
	field.select();
	field.setSelectionRange(0, text.length);
	let copied: boolean;
	try {
		copied = document.execCommand("copy");
	} catch {
		copied = false;
	}
	field.remove();
	return copied;
}
