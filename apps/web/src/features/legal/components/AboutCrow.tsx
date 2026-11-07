import { LegalLinks } from "./LegalLinks";

// Under the sign-in and sign-up forms, which is what playcrow.app shows to
// anyone signed out: what Crow is, and links to the Terms and Privacy Policy
// (Google's branding review looks for both on the home page).
export function AboutCrow() {
	return (
		<footer className='flex w-full max-w-sm flex-col gap-3 text-center'>
			<p className='text-sm text-muted-foreground'>
				Crow is a private prediction game for friend groups. Call real-world
				outcomes with points, not money, and see who ends the series as top
				crow.
			</p>
			<LegalLinks agreement />
		</footer>
	);
}
