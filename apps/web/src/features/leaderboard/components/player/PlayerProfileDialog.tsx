import {
	Avatar,
	AvatarFallback,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	Skeleton,
} from "@/shared/ui";
import {
	useRoomMemberRecentPredictions,
	useRoomMemberSeriesRecognition,
	useRoomMemberMilestones,
	useRoomMemberStats,
	useRoomMemberStyle,
	useRoomOverallStandings,
	useSeriesLeaderboard,
} from "../../hooks/leaderboard";
import { useCurrentSeries } from "@/features/series";
import {
	buildTrophies,
	getIdentityTitle,
	type IdentityTitle,
	type StyleTitle,
} from "@/shared/lib/trophyPrestige";
import { EASE_OUT } from "@/shared/lib/motion";
import { cn } from "@/shared/lib/utils";
import { FEATURES } from "@/shared/constants/features";
import { AnimatePresence, m } from "framer-motion";
import {
	CalendarCheckIcon,
	CoinsIcon,
	CrosshairIcon,
	CrownIcon,
	MedalIcon,
	RocketIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { CareerStats } from "./CareerStats";
import { LiveSeriesStrip } from "./LiveSeriesStrip";
import { MilestoneRow } from "./MilestoneRow";
import { RecentForm } from "./RecentForm";
import { TrophyCabinet } from "./TrophyCabinet";
import { TrophyShowcase } from "./TrophyShowcase";

type Props = {
	roomId: string;
	playerId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const identityToneMeta: Record<
	IdentityTitle["tone"],
	{ chipClassName: string; avatarClassName: string; Icon?: typeof CrownIcon }
> = {
	champion: {
		chipClassName: "bg-rank-1/15 text-rank-1",
		avatarClassName: "ring-2 ring-rank-1/70",
		Icon: CrownIcon,
	},
	podium: {
		chipClassName: "bg-rank-2/15 text-rank-2",
		avatarClassName: "ring-2 ring-rank-2/60",
		Icon: MedalIcon,
	},
	style: {
		chipClassName: "bg-accent/15 text-accent",
		avatarClassName: "ring-1 ring-border",
	},
	rookie: {
		chipClassName: "bg-muted text-muted-foreground",
		avatarClassName: "ring-1 ring-border",
	},
};

// Each play-style title carries its own icon.
const styleTitleIcon: Record<StyleTitle, typeof CrownIcon> = {
	SHARPSHOOTER: CrosshairIcon,
	GIANT_KILLER: RocketIcon,
	HIGH_ROLLER: CoinsIcon,
	EVER_PRESENT: CalendarCheckIcon,
};

const viewTransition = { duration: 0.2, ease: EASE_OUT };

function CardSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className='flex flex-col gap-2'>
			<h3 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
				{title}
			</h3>
			{children}
		</section>
	);
}

export function PlayerProfileDialog({
	roomId,
	playerId,
	open,
	onOpenChange,
}: Readonly<Props>) {
	const enabled = open && !!playerId;
	const {
		data: stats,
		isPending: isStatsLoading,
		error: statsError,
	} = useRoomMemberStats(roomId, playerId, enabled);
	const {
		data: recentPredictions = [],
		isPending: isHistoryLoading,
		error: historyError,
	} = useRoomMemberRecentPredictions(roomId, playerId, 5, 0, enabled);
	const {
		data: seriesRecognition,
		isPending: isSeriesRecognitionLoading,
		error: seriesRecognitionError,
	} = useRoomMemberSeriesRecognition(roomId, playerId, enabled);
	const { data: milestones = [], isPending: isMilestonesLoading } =
		useRoomMemberMilestones(roomId, playerId, enabled);
	const { data: style, isPending: isStyleLoading } = useRoomMemberStyle(
		roomId,
		playerId,
		enabled,
	);
	const { data: overall = [] } = useRoomOverallStandings(roomId, enabled);
	const { currentSeries, seriesOptions } = useCurrentSeries(roomId);

	// The series running now: the one being viewed if it's live, else any live one.
	const activeSeries =
		currentSeries?.status === "active"
			? currentSeries
			: (seriesOptions.find((series) => series.status === "active") ??
				null);
	const { data: seriesLeaderboard = [], isPending: isSeriesLeaderboardLoading } =
		useSeriesLeaderboard(roomId, activeSeries?.id, enabled && !!activeSeries);

	// Which player's cabinet is open, so it closes when the card shows someone else.
	const [cabinetPlayerId, setCabinetPlayerId] = useState<string | null>(null);
	const showCabinet = !!playerId && cabinetPlayerId === playerId;

	const trophies = useMemo(
		() =>
			buildTrophies(
				seriesRecognition?.championships ?? [],
				// Duel awards stay hidden while duels are switched off, as in the Hall of Fame.
				(seriesRecognition?.awards ?? []).filter(
					(award) => FEATURES.duels || award.award_type !== "MOST_DUEL_WINS",
				),
			),
		[seriesRecognition],
	);

	const latestCompletedSeriesId =
		seriesOptions
			.filter((series) => series.status === "completed" && series.completed_at)
			.sort((a, b) =>
				(b.completed_at ?? "").localeCompare(a.completed_at ?? ""),
			)[0]?.id ?? null;

	const isIdentityReady =
		!!stats && !isSeriesRecognitionLoading && !isStyleLoading;
	const identity = isIdentityReady
		? getIdentityTitle({
				trophies,
				styleTitles: style?.titles ?? [],
				totalPredictions: stats.total_predictions ?? 0,
				latestCompletedSeriesId,
			})
		: null;
	const identityMeta = identityToneMeta[identity?.tone ?? "rookie"];
	const IdentityIcon = identity?.style
		? styleTitleIcon[identity.style]
		: identityMeta.Icon;
	const overallEntry = overall.find((entry) => entry.player_id === playerId);
	const roomRank =
		overallEntry && overallEntry.series_played > 0 ? overallEntry.rank : null;
	const seriesEntry = seriesLeaderboard.find(
		(entry) => entry.player_id === playerId,
	);

	const loadError = statsError ?? historyError ?? seriesRecognitionError;
	const username = stats?.username;

	const isDesktop = window.innerWidth >= 768; // Example breakpoint for desktop
	const MainComponent = isDesktop ? Dialog : Drawer;
	const ContentComponent = isDesktop ? DialogContent : DrawerContent;
	const HeaderComponent = isDesktop ? DialogHeader : DrawerHeader;
	const TitleComponent = isDesktop ? DialogTitle : DrawerTitle;
	const DescriptionComponent = isDesktop
		? DialogDescription
		: DrawerDescription;

	return (
		<MainComponent open={open} onOpenChange={onOpenChange}>
			<ContentComponent className='flex max-h-[85vh] flex-col sm:max-w-md'>
				<HeaderComponent className='items-center gap-2 px-4 pt-5 text-center sm:text-center'>
					<Avatar
						className={cn(
							"size-16 transition-shadow",
							identityMeta.avatarClassName,
						)}
					>
						<AvatarFallback className='bg-muted/70 text-lg font-semibold text-foreground/85'>
							{username ? username.slice(0, 2).toUpperCase() : ""}
						</AvatarFallback>
					</Avatar>
					<TitleComponent className='text-2xl'>
						{username ?? (
							// A span: the title is a heading, which can't hold a div.
							<span className='mx-auto block h-7 w-32 animate-pulse rounded-md bg-muted-foreground/35' />
						)}
					</TitleComponent>
					<DescriptionComponent
						asChild
						className='flex min-h-6 items-center justify-center gap-2 text-xs'
					>
						<div>
							{!isIdentityReady ? (
								<Skeleton className='h-5 w-24 rounded-full' />
							) : identity ? (
								<span
									className={cn(
										"inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
										identityMeta.chipClassName,
									)}
								>
									{IdentityIcon ? (
										<IdentityIcon className='size-3.5' />
									) : null}
									{identity.label}
								</span>
							) : null}
							{roomRank !== null ? (
								<span className='tabular-nums text-muted-foreground'>
									#{roomRank} in room
								</span>
							) : null}
						</div>
					</DescriptionComponent>
				</HeaderComponent>

				{loadError ? (
					<p className='px-4 text-sm text-destructive'>
						{loadError.message ||
							"Something went wrong loading this player."}
					</p>
				) : null}

				<div className='min-h-0 overflow-auto no-scrollbar p-4 pt-2'>
					<AnimatePresence mode='wait' initial={false}>
						{showCabinet ? (
							<m.div
								key='cabinet'
								initial={{ opacity: 0, x: 16 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: 16 }}
								transition={viewTransition}
							>
								<TrophyCabinet
									trophies={trophies}
									milestones={milestones}
									onBack={() => setCabinetPlayerId(null)}
								/>
							</m.div>
						) : (
							<m.div
								key='card'
								className='flex flex-col gap-5'
								initial={{ opacity: 0, x: -16 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -16 }}
								transition={viewTransition}
							>
								{activeSeries ? (
									<LiveSeriesStrip
										seriesTitle={activeSeries.title}
										entry={seriesEntry}
										isLoading={isSeriesLeaderboardLoading}
									/>
								) : null}

								<CardSection title='Trophies'>
									<TrophyShowcase
										trophies={trophies}
										isLoading={isSeriesRecognitionLoading}
										onViewAll={() => setCabinetPlayerId(playerId)}
									/>
									<MilestoneRow
										milestones={milestones}
										isLoading={isMilestonesLoading}
									/>
								</CardSection>

								<CardSection title='Form'>
									<RecentForm
										predictions={recentPredictions}
										isLoading={isHistoryLoading}
									/>
								</CardSection>

								<CardSection title='Career'>
									<CareerStats
										stats={stats}
										isLoading={isStatsLoading}
									/>
								</CardSection>
							</m.div>
						)}
					</AnimatePresence>
				</div>
			</ContentComponent>
		</MainComponent>
	);
}
