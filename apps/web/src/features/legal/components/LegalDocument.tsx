import { Button, CrowTile } from "@/shared/ui";
import { ChevronLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LEGAL_CONTACT_EMAIL, LEGAL_UPDATED } from "@/features/legal/lib/legal";

// The frame for the Terms and Privacy pages: readable for anyone, signed in
// or not, with the summary up front and the full text in numbered sections.
export function LegalDocument({
	title,
	summary,
	children,
}: Readonly<{
	title: string;
	summary: ReactNode;
	children: ReactNode;
}>) {
	const navigate = useNavigate();

	const handleBack = () => {
		if (globalThis.history.length > 1) {
			navigate(-1);
			return;
		}
		navigate("/", { replace: true });
	};

	return (
		<div className='min-h-dvh'>
			<header className='mx-auto flex w-full max-w-2xl items-center gap-2 p-4'>
				<Button
					variant='ghost'
					size='icon'
					className='rounded-lg'
					onClick={handleBack}
					aria-label='Back'
				>
					<ChevronLeftIcon />
				</Button>
				<Link to='/' className='flex items-center gap-2' aria-label='Crow home'>
					<CrowTile size={28} />
					<span className='font-semibold tracking-tighter'>crow</span>
				</Link>
			</header>

			<main className='mx-auto w-full max-w-2xl px-4 pb-16'>
				<h1 className='text-3xl font-bold tracking-tight'>{title}</h1>
				<p className='mt-2 text-xs text-muted-foreground'>
					Last updated {LEGAL_UPDATED}
				</p>

				<div className='mt-6 rounded-xl border bg-card p-4 text-sm leading-relaxed'>
					{summary}
				</div>

				<article className='mt-8 space-y-8 text-sm leading-relaxed [&_a]:text-accent [&_a]:underline-offset-2 hover:[&_a]:underline [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5'>
					{children}
				</article>

				<footer className='mt-12 flex flex-wrap gap-x-4 gap-y-2 border-t pt-6 text-xs text-muted-foreground'>
					<Link to='/terms' className='hover:text-foreground'>
						Terms of Service
					</Link>
					<Link to='/privacy' className='hover:text-foreground'>
						Privacy Policy
					</Link>
					<a
						href={`mailto:${LEGAL_CONTACT_EMAIL}`}
						className='hover:text-foreground'
					>
						{LEGAL_CONTACT_EMAIL}
					</a>
				</footer>
			</main>
		</div>
	);
}

export function LegalSection({
	id,
	title,
	children,
}: Readonly<{ id: string; title: string; children: ReactNode }>) {
	return (
		<section id={id} className='scroll-mt-4'>
			<h2 className='text-lg font-semibold'>{title}</h2>
			{children}
		</section>
	);
}
