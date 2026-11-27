import { peekPostAuthRedirect } from "@/shared/lib/postAuthRedirect";

// On the sign-in and sign-up pages, for someone who opened an invite link
// while signed out: say what they're signing in for, so the form isn't the
// first and only thing they see. The room's name needs a signed-in lookup,
// so this names the code.
export function InviteBanner() {
	const redirect = peekPostAuthRedirect();
	const code = redirect?.match(/^\/rooms\/([A-Za-z0-9]{4,12})\/join/)?.[1];
	if (!code) return null;
	return (
		<div className='w-full max-w-sm rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm'>
			<p className='font-semibold'>You're invited to a room on Crow</p>
			<p className='mt-1 text-muted-foreground'>
				Room code <span className='font-semibold tracking-widest text-foreground'>{code.toUpperCase()}</span>.
				Continue with Google to get in fastest, then you'll see the room and join.
			</p>
		</div>
	);
}
