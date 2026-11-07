import { Link } from "react-router-dom";
import { cn } from "@/shared/lib/utils";

// "By continuing, you agree to the Terms and Privacy Policy" under sign-in
// forms, or just the two links elsewhere.
export function LegalLinks({
	agreement = false,
	className,
	onNavigate,
}: Readonly<{
	agreement?: boolean;
	className?: string;
	onNavigate?: () => void;
}>) {
	const terms = (
		<Link to='/terms' className='underline underline-offset-2 hover:text-foreground' onClick={onNavigate}>
			Terms of Service
		</Link>
	);
	const privacy = (
		<Link to='/privacy' className='underline underline-offset-2 hover:text-foreground' onClick={onNavigate}>
			Privacy Policy
		</Link>
	);

	return (
		<p className={cn("text-xs text-muted-foreground", className)}>
			{agreement ? (
				<>
					By continuing, you agree to Crow's {terms} and {privacy}.
				</>
			) : (
				<>
					{terms} · {privacy}
				</>
			)}
		</p>
	);
}
