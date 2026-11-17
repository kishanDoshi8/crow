import React from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	type CarouselApi,
} from "@/shared/ui/carousel";
import { Button } from "@/shared/ui/button";

const SLIDES = [
	{
		emoji: "🎯",
		title: "Join the room",
		description:
			"Enter the 6-character code your friend sent you, or open their invite link. You're in instantly.",
	},
	{
		emoji: "🪙",
		title: "Everyone starts level",
		description:
			"Each series, every player gets the same points. Make a pick during the week and you get a top-up on Monday. Nobody carries a head start from last time.",
	},
	{
		emoji: "📣",
		title: "Make your call",
		description:
			"When a question is open, pick an option and put points on it. The surer you are, the more you put on, and the more you can win.",
	},
	{
		emoji: "🏆",
		title: "Win the series",
		description:
			"Once the host reveals the result, the winners collect points. Make enough picks to be ranked: when the series ends, the most points takes the title.",
	},
] as const;

type Props = {
	open: boolean;
	onClose: () => void;
};

export default function HowToPlayModal({ open, onClose }: Readonly<Props>) {
	const [api, setApi] = React.useState<CarouselApi>();
	const [current, setCurrent] = React.useState(0);
	const [count, setCount] = React.useState(0);

	React.useEffect(() => {
		if (!api) return;

		setCount(api.scrollSnapList().length);
		setCurrent(api.selectedScrollSnap());

		api.on("select", () => {
			setCurrent(api.selectedScrollSnap());
		});
	}, [api]);

	// Reset to first slide when modal opens
	React.useEffect(() => {
		if (open && api) {
			api.scrollTo(0);
		}
	}, [open, api]);

	const isLastSlide = current === count - 1;

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent showCloseButton={false} className={`bg-card`}>
				<DialogHeader>
					<DialogTitle className='text-center text-xl'>
						How to play
					</DialogTitle>
				</DialogHeader>

				<Carousel
					setApi={setApi}
					opts={{ loop: false }}
					className='w-full max-w-xs mx-auto'
				>
					<CarouselContent>
						{SLIDES.map((slide) => (
							<CarouselItem key={slide.title}>
								<div className='flex flex-col items-center gap-4 px-2 py-4 text-center'>
									<span className='text-5xl'>
										{slide.emoji}
									</span>
									<h3 className='text-lg font-semibold'>
										{slide.title}
									</h3>
									<p className='text-muted-foreground text-sm leading-relaxed'>
										{slide.description}
									</p>
								</div>
							</CarouselItem>
						))}
					</CarouselContent>
				</Carousel>

				{/* Dot indicators */}
				<div className='flex justify-center gap-2'>
					{Array.from({ length: count }).map((_, index) => (
						<button
							key={index}
							onClick={() => api?.scrollTo(index)}
							className={`h-2 rounded-full transition-all duration-300 ${
								index === current
									? "w-6 bg-primary"
									: "w-2 bg-muted-foreground/30"
							}`}
							aria-label={`Go to slide ${index + 1}`}
						/>
					))}
				</div>

				<div className='flex gap-2'>
					{!isLastSlide && (
						<Button
							variant='ghost'
							className='flex-1 text-muted-foreground'
							onClick={onClose}
						>
							Skip
						</Button>
					)}
					<Button
						variant={"linear"}
						className='flex-1'
						onClick={() => {
							if (isLastSlide) {
								onClose();
							} else {
								api?.scrollNext();
							}
						}}
					>
						{isLastSlide ? "Let's play" : "Next"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
