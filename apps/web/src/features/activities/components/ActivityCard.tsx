import type { ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/shared/lib/utils";
import { Badge, Skeleton } from "@/shared/ui";

type ActivityTone =
	| "neutral"
	| "member"
	| "prediction"
	| "success"
	| "warning"
	| "danger";

type ActivityTier = 1 | 2 | 3;

type ActivityCardProps = {
	tier: ActivityTier;
	icon: ReactNode;
	typeLabel: string;
	tone?: ActivityTone;
	actorLabel?: ReactNode;
	contextLabel?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	summary?: ReactNode;
	timestamp: string;
	href?: string | null;
};

const CARD_SHELL =
	"rounded-2xl border px-4 py-3.5 transition-colors duration-200 motion-reduce:transition-none";

const TIER_STYLES: Record<ActivityTier, string> = {
	1: "border-activity/35 bg-activity/10",
	2: "border-border bg-card",
	3: "border-border/70 bg-muted/30",
};

const TONE_STYLES: Record<
	ActivityTone,
	{
		shell: string;
		icon: string;
		typeBadge: string;
		summary: string;
		openPill: string;
	}
> = {
	neutral: {
		shell: "",
		icon: "border-border/60 bg-background/70 text-activity",
		typeBadge: "border-border bg-secondary text-secondary-foreground",
		summary: "border-border/60 bg-muted/35 text-foreground/90",
		openPill: "border-border/70 bg-background/70 text-muted-foreground",
	},
	member: {
		shell: "bg-win/5 border-win/25",
		icon: "border-win/35 bg-win/15 text-win",
		typeBadge: "border-win/30 bg-win/15 text-win",
		summary: "border-win/25 bg-win/10 text-foreground/90",
		openPill: "border-win/30 bg-win/10 text-win",
	},
	prediction: {
		shell: "bg-activity/10 border-activity/30",
		icon: "border-activity/35 bg-activity/18 text-activity",
		typeBadge: "border-activity/30 bg-activity/15 text-activity",
		summary: "border-activity/25 bg-activity/12 text-foreground/90",
		openPill: "border-activity/30 bg-activity/12 text-activity",
	},
	success: {
		shell: "bg-win/6 border-win/30",
		icon: "border-win/35 bg-win/15 text-win",
		typeBadge: "border-win/30 bg-win/15 text-win",
		summary: "border-win/30 bg-win/10 text-foreground/90",
		openPill: "border-win/30 bg-win/10 text-win",
	},
	warning: {
		shell: "bg-accent/10 border-accent/35",
		icon: "border-accent/40 bg-accent/20 text-accent",
		typeBadge: "border-accent/35 bg-accent/20 text-accent",
		summary: "border-accent/35 bg-accent/15 text-foreground/90",
		openPill: "border-accent/35 bg-accent/15 text-foreground/90",
	},
	danger: {
		shell: "bg-destructive/5 border-destructive/30",
		icon: "border-destructive/35 bg-destructive/15 text-destructive",
		typeBadge: "border-destructive/30 bg-destructive/15 text-destructive",
		summary: "border-destructive/30 bg-destructive/10 text-foreground/90",
		openPill: "border-destructive/30 bg-destructive/10 text-destructive",
	},
};

export function ActivityCard({
	tier,
	icon,
	typeLabel,
	tone = "neutral",
	actorLabel,
	contextLabel,
	title,
	description,
	summary,
	timestamp,
	href,
}: Readonly<ActivityCardProps>) {
	const hasSummary = Boolean(summary);
	const hasDescription = Boolean(description);
	const hasMeta = Boolean(actorLabel || contextLabel);
	const toneStyles = TONE_STYLES[tone];

	const body = (
		<div
			className={cn(
				CARD_SHELL,
				TIER_STYLES[tier],
				toneStyles.shell,
				href ? "shadow-xs" : undefined,
			)}
		>
			<div className='flex items-start gap-3.5'>
				<div
					className={cn(
						"mt-0.5 shrink-0 rounded-lg border p-2",
						toneStyles.icon,
					)}
				>
					{icon}
				</div>
				<div className='min-w-0 flex-1'>
					<div className='flex flex-wrap items-center justify-between gap-1.5'>
						<Badge
							variant='outline'
							className={cn(
								"h-5 rounded-full px-2 text-xs font-semibold",
								toneStyles.typeBadge,
							)}
						>
							{typeLabel}
						</Badge>
						<div className='shrink-0 text-sm font-medium text-muted-foreground'>
							{timestamp}
						</div>
					</div>
					<p className='mt-2 text-lg font-semibold leading-snug text-foreground'>
						{title}
					</p>
					{hasDescription ? (
						<p className='mt-1.5 line-clamp-2 text-sm leading-5 text-muted-foreground'>
							{description}
						</p>
					) : null}
					{hasSummary ? (
						<div
							className={cn(
								"mt-2.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium leading-5",
								toneStyles.summary,
							)}
						>
							{summary}
						</div>
					) : null}
					<div
						className={cn(
							"flex items-end justify-between gap-2",
							hasDescription || hasSummary || hasMeta
								? "mt-2.5"
								: "mt-1.5",
						)}
					>
						<div className='min-w-0 flex flex-wrap items-center gap-1.5'>
							{actorLabel ? (
								<Badge
									variant='outline'
									className='h-5 max-w-full rounded-full border-border/70 bg-background/70 px-2 text-xs font-medium text-foreground/90'
								>
									<span className='truncate'>
										{actorLabel}
									</span>
								</Badge>
							) : null}
							{contextLabel ? (
								<Badge
									variant='outline'
									className='h-5 max-w-full rounded-full border-border/70 bg-muted/60 px-2 text-xs font-medium text-foreground/80'
								>
									<span className='truncate'>
										{contextLabel}
									</span>
								</Badge>
							) : null}
						</div>
					</div>
				</div>
			</div>
			{href ? (
				<div className='mt-2 flex justify-end'>
					<span
						className={cn(
							"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
							toneStyles.openPill,
						)}
					>
						Open
						<ChevronRightIcon className='size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none' />
					</span>
				</div>
			) : null}
		</div>
	);

	if (!href) {
		return body;
	}

	return (
		<Link
			to={href}
			className='group block rounded-2xl transition-transform duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 motion-reduce:transition-none'
		>
			{body}
		</Link>
	);
}

// Same shell and rhythm as ActivityCard (icon, type badge + time, title, an
// optional summary, the Open pill) so cards land without shifting the feed.
export function ActivityCardSkeleton({
	withSummary = false,
}: Readonly<{ withSummary?: boolean }>) {
	return (
		<div className={cn(CARD_SHELL, TIER_STYLES[2])}>
			<div className='flex items-start gap-3.5'>
				<Skeleton className='mt-0.5 size-8.5 shrink-0 rounded-lg' />
				<div className='min-w-0 flex-1'>
					<div className='flex items-center justify-between gap-1.5'>
						<Skeleton className='h-5 w-20 rounded-full' />
						<Skeleton className='h-4 w-12' />
					</div>
					<div className='mt-2 flex h-6 items-center'>
						<Skeleton className='h-4.5 w-4/5' />
					</div>
					{withSummary ? (
						<Skeleton className='mt-2.5 h-8 w-full rounded-lg' />
					) : null}
					<div className={withSummary ? "mt-2.5" : "mt-1.5"} />
				</div>
			</div>
			<div className='mt-2 flex justify-end'>
				<Skeleton className='h-5.5 w-14 rounded-full' />
			</div>
		</div>
	);
}
