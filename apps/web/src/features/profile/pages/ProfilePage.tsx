import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, m } from "framer-motion";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	CrownIcon,
	LinkIcon,
	LogOutIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAccountDeletion } from "@/features/account";
import { useAuth, useSignOut } from "@/features/auth";
import {
	MilestoneRow,
	TrophyCabinet,
	TrophyShowcase,
	identityToneMeta,
	styleTitleIcon,
} from "@/features/leaderboard";
import { usePlayerProfile } from "@/features/profile/hooks/profile";
import type { PlayerProfile, PlayerProfileRoom } from "@/shared/lib/api";
import { EASE_OUT } from "@/shared/lib/motion";
import { buildTrophies, getIdentityTitle } from "@/shared/lib/trophyPrestige";
import { cn, initialsOf } from "@/shared/lib/utils";
import { Avatar, AvatarFallback, Button, Skeleton, StatStrip } from "@/shared/ui";

const viewTransition = { duration: 0.2, ease: EASE_OUT };

// A player's profile across rooms. /profile is your own, with your account
// settings; /players/:playerId is someone else's, covering only the rooms
// you share with them.
export default function ProfilePage() {
	const navigate = useNavigate();
	const { playerId = null } = useParams();
	const { data: profile, isPending, error, refetch } = usePlayerProfile(playerId);
	const [showCabinet, setShowCabinet] = useState(false);

	const handleBack = () => {
		if (globalThis.history.length > 1) {
			navigate(-1);
			return;
		}
		navigate("/", { replace: true });
	};

	return (
		<div className='flex min-h-dvh flex-col'>
			<header className='p-4'>
				<Button
					variant='ghost'
					size='icon'
					className='rounded-lg'
					onClick={showCabinet ? () => setShowCabinet(false) : handleBack}
					aria-label='Back'
				>
					<ChevronLeftIcon />
				</Button>
			</header>

			<main className='mx-auto flex w-full max-w-md flex-col gap-6 px-4 pb-16'>
				{error ? (
					<div className='flex flex-col items-center gap-3 py-10 text-center'>
						<p className='text-sm text-muted-foreground'>
							Couldn't load this profile. Try again.
						</p>
						<Button variant='outline' onClick={() => void refetch()}>
							Try again
						</Button>
					</div>
				) : isPending ? (
					<ProfileSkeleton />
				) : (
					<AnimatePresence mode='wait' initial={false}>
						{showCabinet ? (
							<m.div
								key='cabinet'
								initial={{ opacity: 0, x: 16 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: 16 }}
								transition={viewTransition}
							>
								<ProfileCabinet profile={profile} onBack={() => setShowCabinet(false)} />
							</m.div>
						) : (
							<m.div
								key='profile'
								className='flex flex-col gap-6'
								initial={{ opacity: 0, x: -16 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -16 }}
								transition={viewTransition}
							>
								<ProfileBody profile={profile} onViewCabinet={() => setShowCabinet(true)} />
							</m.div>
						)}
					</AnimatePresence>
				)}
			</main>
		</div>
	);
}

function useTrophies(profile: PlayerProfile) {
	return useMemo(
		() => buildTrophies(profile.championships, profile.awards),
		[profile.championships, profile.awards],
	);
}

function ProfileBody({
	profile,
	onViewCabinet,
}: Readonly<{ profile: PlayerProfile; onViewCabinet: () => void }>) {
	const trophies = useTrophies(profile);
	const { totals } = profile;

	return (
		<>
			<ProfileHero profile={profile} />

			<StatStrip
				stats={[
					{ label: "Rooms", value: totals.rooms, grow: 0.8 },
					{ label: "Picks", value: totals.total_predictions.toLocaleString(), grow: 0.9 },
					{ label: "Win rate", value: formatWinRate(totals) },
					{ label: "Best streak", value: totals.highest_win_streak, grow: 1.4 },
				]}
			/>

			<Section title='Trophies'>
				<TrophyShowcase trophies={trophies} isLoading={false} onViewAll={onViewCabinet} />
				<MilestoneRow milestones={profile.milestones} isLoading={false} />
			</Section>

			<Section title={profile.is_self ? "Your rooms" : "Rooms you share"}>
				<RoomList rooms={profile.rooms} isSelf={profile.is_self} />
			</Section>

			{profile.is_self ? (
				<>
					<AccountSection />
					<DeleteAccountSection />
				</>
			) : null}
		</>
	);
}

function ProfileHero({ profile }: Readonly<{ profile: PlayerProfile }>) {
	const trophies = useTrophies(profile);
	const identity = getIdentityTitle({
		trophies,
		// Play-style titles belong to a room, so a cross-room profile skips them.
		styleTitles: [],
		totalPredictions: profile.totals.total_predictions,
		latestCompletedSeriesId: null,
	});
	const meta = identityToneMeta[identity?.tone ?? "rookie"];
	const Icon = identity?.style ? styleTitleIcon[identity.style] : meta.Icon;
	const since = new Date(profile.player.joined_at).toLocaleDateString(undefined, {
		month: "long",
		year: "numeric",
	});

	return (
		<section className='flex flex-col items-center gap-2 text-center'>
			<Avatar className={cn("size-20", meta.avatarClassName)}>
				<AvatarFallback className='bg-muted/70 text-xl font-semibold text-foreground/85'>
					{initialsOf(profile.player.username)}
				</AvatarFallback>
			</Avatar>
			<h1 className='text-2xl font-bold tracking-tight wrap-anywhere'>
				{profile.player.username}
			</h1>
			{identity ? (
				<span
					className={cn(
						"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
						meta.chipClassName,
					)}
				>
					{Icon ? <Icon className='size-3.5' aria-hidden='true' /> : null}
					{identity.label}
				</span>
			) : null}
			<p className='text-xs text-muted-foreground'>Playing since {since}</p>
		</section>
	);
}

function RoomList({
	rooms,
	isSelf,
}: Readonly<{ rooms: PlayerProfileRoom[]; isSelf: boolean }>) {
	if (rooms.length === 0) {
		return (
			<p className='rounded-xl border border-dashed border-border/80 px-4 py-5 text-center text-sm text-muted-foreground'>
				{isSelf
					? "No rooms yet. Start one or join with a code from Home."
					: "You don't share a room right now."}
			</p>
		);
	}

	return (
		<ul className='divide-y overflow-hidden rounded-xl border'>
			{rooms.map((room) => (
				<li key={room.room_id}>
					<Link
						to={`/rooms/${room.room_code}`}
						className='flex items-center gap-3 px-3 py-3 transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
					>
						<span className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-semibold'>
							{initialsOf(room.name)}
						</span>
						<span className='min-w-0 flex-1'>
							<span className='flex items-center gap-1.5'>
								<span className='truncate text-sm font-medium'>{room.name}</span>
								{room.championships > 0 ? (
									<span
										className='inline-flex shrink-0 items-center gap-0.5 rounded-full bg-rank-1/15 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-rank-1'
										aria-label={`${room.championships} ${room.championships === 1 ? "title" : "titles"}`}
										title={`${room.championships} ${room.championships === 1 ? "title" : "titles"}`}
									>
										<CrownIcon className='size-3' aria-hidden='true' />
										{room.championships}
									</span>
								) : null}
							</span>
							<span className='block text-xs tabular-nums text-muted-foreground'>
								{room.points.toLocaleString()} pts
							</span>
						</span>
						<span className='shrink-0 text-right tabular-nums'>
							<span className='block text-sm font-semibold'>#{room.points_rank}</span>
							<span className='block text-xs text-muted-foreground'>
								of {room.member_count}
							</span>
						</span>
						<ChevronRightIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
					</Link>
				</li>
			))}
		</ul>
	);
}

function AccountSection() {
	const { user, hasGoogleIdentity, linkGoogle } = useAuth();
	const signOut = useSignOut();

	const handleConnectGoogle = async () => {
		try {
			await linkGoogle();
		} catch (error) {
			toast.error("Couldn't connect Google. Try again.", {
				description: error instanceof Error ? error.message : undefined,
				position: "top-center",
			});
		}
	};

	return (
		<Section title='Account'>
			<div className='divide-y overflow-hidden rounded-xl border'>
				<div className='px-3 py-3'>
					<p className='text-xs text-muted-foreground'>Signed in as</p>
					<p className='truncate text-sm font-medium'>{user?.email}</p>
				</div>
				{hasGoogleIdentity ? null : (
					<AccountRow
						icon={LinkIcon}
						label='Connect Google'
						detail='Sign in with Google next time'
						onClick={() => void handleConnectGoogle()}
					/>
				)}
				<AccountRow icon={LogOutIcon} label='Sign out' onClick={() => void signOut()} />
			</div>
		</Section>
	);
}

function AccountRow({
	icon: Icon,
	label,
	detail,
	onClick,
}: Readonly<{ icon: typeof LogOutIcon; label: string; detail?: string; onClick: () => void }>) {
	return (
		<button
			type='button'
			onClick={onClick}
			className='flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
		>
			<Icon className='size-5 shrink-0 text-muted-foreground' aria-hidden='true' />
			<span className='min-w-0 flex-1'>
				<span className='block text-sm font-medium'>{label}</span>
				{detail ? <span className='block text-xs text-muted-foreground'>{detail}</span> : null}
			</span>
		</button>
	);
}

// Kept apart from everything else on the page, with its own warning, so
// deleting your account never sits next to signing out as an equal choice.
function DeleteAccountSection() {
	const navigate = useNavigate();
	const { data: request } = useAccountDeletion();

	return (
		<section
			aria-labelledby='delete-account-heading'
			className='mt-4 flex flex-col gap-3 rounded-xl border border-destructive/40 p-4'
		>
			<h2
				id='delete-account-heading'
				className='flex items-center gap-2 text-sm font-semibold text-destructive'
			>
				<TriangleAlertIcon className='size-4' aria-hidden='true' />
				Delete account
			</h2>
			{request ? (
				<p className='text-sm text-muted-foreground'>
					You asked us to delete your account on{" "}
					{new Date(request.requested_at).toLocaleDateString()}. We'll do it within 30
					days. You can still keep it until then.
				</p>
			) : (
				<p className='text-sm text-muted-foreground'>
					Removes your login and takes you out of every room. Your past results stay,
					under the name Ghost crow. This can't be undone.
				</p>
			)}
			<Button
				variant='outline'
				className='self-start border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive'
				onClick={() => navigate("/account/delete")}
			>
				{request ? "Manage request" : "Delete account"}
			</Button>
		</section>
	);
}

function ProfileCabinet({
	profile,
	onBack,
}: Readonly<{ profile: PlayerProfile; onBack: () => void }>) {
	const trophies = useTrophies(profile);
	return (
		<TrophyCabinet
			trophies={trophies}
			milestones={profile.milestones}
			onBack={onBack}
			backLabel='Back to profile'
		/>
	);
}

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
	return (
		<section className='flex flex-col gap-2'>
			<h2 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
				{title}
			</h2>
			{children}
		</section>
	);
}

// Same rule as the room player card: picks called out of picks with a result.
function formatWinRate(totals: PlayerProfile["totals"]) {
	const rated = totals.total_rated_predictions;
	return rated > 0 ? `${Math.round((totals.winning_predictions / rated) * 100)}%` : "–";
}

function ProfileSkeleton() {
	return (
		<div aria-hidden='true' className='flex flex-col gap-6'>
			<div className='flex flex-col items-center gap-2'>
				<Skeleton className='size-20 rounded-full' />
				<Skeleton className='h-7 w-36 rounded-md' />
				<Skeleton className='h-5 w-24 rounded-full' />
			</div>
			<Skeleton className='h-14 rounded-xl' />
			<Skeleton className='h-40 rounded-xl' />
			<Skeleton className='h-32 rounded-xl' />
		</div>
	);
}
