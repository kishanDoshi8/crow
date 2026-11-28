import { useState } from "react";
import { Volume2Icon, VolumeXIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useMediaQuery } from "@/shared/lib/useMediaQuery";
import { track } from "@/shared/lib/analytics";

// The 20-second launch video in the hero: a vertical cut on phones, the
// landscape cut from tablet up. Files live in public/video (not imported),
// so the service worker never keeps a copy for offline use.
// Made with /brag-slim: source and plan in apps/web/brag-output.
const CUTS = {
	vertical: {
		src: "/video/crow-launch-vertical.mp4",
		poster: "/video/crow-launch-vertical.jpg",
		aspect: "aspect-[9/16]",
	},
	landscape: {
		src: "/video/crow-launch.mp4",
		poster: "/video/crow-launch.jpg",
		aspect: "aspect-video",
	},
} as const;

export function LaunchVideo({ className }: Readonly<{ className?: string }>) {
	const wide = useMediaQuery("(min-width: 48rem)");
	// Reduced motion: no autoplay. The poster shows, with controls to play it.
	const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
	const [muted, setMuted] = useState(true);
	const cut = wide ? CUTS.landscape : CUTS.vertical;

	return (
		<figure
			className={cn(
				"relative overflow-hidden rounded-2xl border border-border bg-card",
				cut.aspect,
				className,
			)}
		>
			<video
				// A new element per cut, so switching sizes loads the right file.
				key={cut.src}
				className='size-full object-cover'
				src={cut.src}
				poster={cut.poster}
				autoPlay={!reduceMotion}
				loop={!reduceMotion}
				muted={muted}
				controls={reduceMotion}
				playsInline
				preload={reduceMotion ? "none" : "auto"}
				aria-label='Crow in 20 seconds: a group chat argues about the derby, everyone makes a pick, the result comes in and the standings move.'
			/>
			{reduceMotion ? null : (
				<button
					type='button'
					onClick={() => {
						// Turning the sound on is the one sign someone is really watching.
						if (muted) track("landing_video_sound");
						setMuted(!muted);
					}}
					aria-pressed={!muted}
					aria-label={muted ? "Turn sound on" : "Turn sound off"}
					className='absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full bg-background/80 text-foreground outline-none transition-colors hover:bg-background/90 focus-visible:ring-[3px] focus-visible:ring-ring/50'
				>
					{muted ? (
						<VolumeXIcon aria-hidden='true' className='size-5' />
					) : (
						<Volume2Icon aria-hidden='true' className='size-5' />
					)}
				</button>
			)}
		</figure>
	);
}
