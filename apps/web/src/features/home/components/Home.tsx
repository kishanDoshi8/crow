import React, { Suspense, lazy } from "react";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@/shared/ui/input-otp";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";
import { ChevronRightIcon, TriangleAlert } from "lucide-react";
import { usePlayer } from "@/features/home/hooks/player";
import { AccountSheet, accountInitials } from "./AccountSheet";
import { RoomCardsList } from "@/features/rooms/components/RoomCardsList";
import { ExploreRooms } from "@/features/rooms/components/ExploreRooms";
import { useCreateRoom } from "@/features/rooms/hooks/room";
import type { Room } from "@/features/rooms/types/types";
import {
	CrowTile,
	Input,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/ui";
import { useAppNavigation } from "@/shared/lib/navigation";

const HowToPlayModal = lazy(
	() => import("@/features/onboarding/components/HowToPlayModal"),
);

type Props = {
	roomCode: string;
	setRoomCode: (code: string) => void;
	validatedCode: boolean;
	setValidatedCode: (validated: boolean) => void;
	isLoading: boolean;
	handleEnterRoom: () => void;
	defaultTab?: HomeTab;
	playerRooms?: Room[];
	isPlayerRoomsLoading?: boolean;
	playerRoomsError?: Error | null;
};

export type HomeTab = "rooms" | "explore" | "join" | "create";

export default function Home({
	roomCode,
	setRoomCode,
	validatedCode,
	setValidatedCode,
	isLoading,
	handleEnterRoom,
	defaultTab = "rooms",
	playerRooms,
	isPlayerRoomsLoading = false,
	playerRoomsError = null,
}: Readonly<Props>) {
	const { data: player } = usePlayer();
	const [openHowToPlay, setOpenHowToPlay] = React.useState(false);
	const [activeTab, setActiveTab] = React.useState<HomeTab>(defaultTab);
	const [isAccountOpen, setIsAccountOpen] = React.useState(false);

	React.useEffect(() => {
		setActiveTab(defaultTab);
	}, [defaultTab]);

	// The other tabs point here, so a room list can end with "join or start one".
	const goTo = (tab: HomeTab) => setActiveTab(tab);

	return (
		<div className='mx-auto flex w-full max-w-md flex-col gap-5 px-4 pt-5 pb-8'>
			{/* The mark and name, with the account (sign out, delete) beside them. */}
			<header className='flex items-center justify-between gap-3'>
				<div className='flex items-center gap-2.5'>
					<CrowTile size={40} />
					<div>
						<h1 className='text-2xl font-semibold leading-none tracking-tighter'>crow</h1>
						<p className='text-xs text-muted-foreground'>Call it. Crow about it.</p>
					</div>
				</div>
				<button
					type='button'
					onClick={() => setIsAccountOpen(true)}
					aria-label='Account'
					className='flex size-11 shrink-0 items-center justify-center rounded-full border bg-secondary text-xs font-semibold transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
				>
					{accountInitials(player?.username)}
				</button>
			</header>

			{player ? (
				<p className='text-muted-foreground'>
					Welcome back,{" "}
					<span className='font-semibold text-foreground'>{player.username}</span>
				</p>
			) : null}

			<Tabs
				value={activeTab}
				onValueChange={(value) => setActiveTab(value as HomeTab)}
				className='gap-5'
			>
				<TabsList className='w-full'>
					<TabsTrigger value='rooms'>Rooms</TabsTrigger>
					<TabsTrigger value='explore'>Explore</TabsTrigger>
					<TabsTrigger value='join'>Join</TabsTrigger>
					<TabsTrigger value='create'>Create</TabsTrigger>
				</TabsList>
				<TabsContent value='rooms' className='flex flex-col gap-3'>
					{playerRooms?.length ? (
						<div className='flex items-center gap-2'>
							<h2 className='text-sm font-semibold'>Your rooms</h2>
							<span className='rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold tabular-nums'>
								{playerRooms.length}
							</span>
						</div>
					) : null}
					<RoomCardsList
						rooms={playerRooms}
						isLoading={isPlayerRoomsLoading}
						error={playerRoomsError}
						emptyMessage="You're not in a room yet. Join one with a code, or start your own."
					/>
					<div className='mt-2 grid grid-cols-2 gap-3'>
						<Button variant='outline' size='lg' onClick={() => goTo("join")}>
							Join with a code
						</Button>
						<Button variant='outline' size='lg' onClick={() => goTo("create")}>
							Start a room
						</Button>
					</div>
				</TabsContent>
				<TabsContent value='explore'>
					<ExploreRooms />
				</TabsContent>
				<TabsContent value='join' className='flex flex-col gap-3'>
					<JoinRoom
						roomCode={roomCode}
						setRoomCode={setRoomCode}
						validatedCode={validatedCode}
						setValidatedCode={setValidatedCode}
						isLoading={isLoading}
						handleEnterRoom={handleEnterRoom}
					/>
					<button
						type='button'
						onClick={() => goTo("explore")}
						className='flex min-h-15 items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
					>
						<span>
							<span className='block font-semibold'>No code?</span>
							<span className='block text-xs text-muted-foreground'>
								Browse rooms anyone can join
							</span>
						</span>
						<ChevronRightIcon className='size-4 text-muted-foreground' aria-hidden='true' />
					</button>
				</TabsContent>
				<TabsContent value='create' className='flex flex-col gap-3'>
					<CreateRoom />
				</TabsContent>
			</Tabs>

			<AccountSheet
				open={isAccountOpen}
				onOpenChange={setIsAccountOpen}
				onHowToPlay={() => setOpenHowToPlay(true)}
			/>

			{openHowToPlay ? (
				<Suspense fallback={null}>
					<HowToPlayModal
						open={openHowToPlay}
						onClose={() => setOpenHowToPlay(false)}
					/>
				</Suspense>
			) : null}
		</div>
	);
}

function JoinRoom({
	roomCode,
	setRoomCode,
	validatedCode,
	setValidatedCode,
	isLoading,
	handleEnterRoom,
}: Readonly<Props>) {
	const handleChange = (value: string) => {
		setValidatedCode(false);
		const formattedValue = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
		setRoomCode(formattedValue);
	};

	return (
		<section className='flex flex-col gap-4 rounded-2xl border bg-card px-4 py-5'>
			<div>
				<h2 className='text-lg font-semibold'>Join with a code</h2>
				<p className='text-sm text-muted-foreground'>
					Ask a friend for their room's 6-character code. You'll see who's in
					the room before you join.
				</p>
			</div>
			<InputOTP
				maxLength={6}
				value={roomCode}
				onChange={handleChange}
				type='text'
				inputMode='text'
				aria-label='Room code'
				containerClassName='justify-between gap-1.5'
			>
				<InputOTPGroup className='flex-1 gap-1.5'>
						<InputOTPSlot
							index={0}
							className={SLOT}
							aria-invalid={validatedCode && roomCode.length < 1}
						/>
						<InputOTPSlot
							index={1}
							className={SLOT}
							aria-invalid={validatedCode && roomCode.length < 2}
						/>
						<InputOTPSlot
							index={2}
							className={SLOT}
							aria-invalid={validatedCode && roomCode.length < 3}
						/>
				</InputOTPGroup>
				<InputOTPSeparator className='text-muted-foreground' />
				<InputOTPGroup className='flex-1 gap-1.5'>
						<InputOTPSlot
							index={3}
							className={SLOT}
							aria-invalid={validatedCode && roomCode.length < 4}
						/>
						<InputOTPSlot
							index={4}
							className={SLOT}
							aria-invalid={validatedCode && roomCode.length < 5}
						/>
						<InputOTPSlot
							index={5}
							className={SLOT}
							aria-invalid={validatedCode && roomCode.length < 6}
						/>
				</InputOTPGroup>
			</InputOTP>
			{/* It looks the room up and shows it first; joining is the next step. */}
			<Button
				variant={"linear"}
				size='lg'
				className='h-12'
				onClick={handleEnterRoom}
				disabled={isLoading}
			>
				{isLoading && <Spinner />}
				Find room
			</Button>
		</section>
	);
}

// One box per character, big enough to tap and read.
const SLOT =
	"h-13 w-auto flex-1 rounded-lg border text-xl font-semibold first:rounded-l-lg last:rounded-r-lg";

function CreateRoom() {
	const { switchRoom } = useAppNavigation();
	const { mutate: createRoom, isPending: isLoading } = useCreateRoom();
	const [roomName, setRoomName] = React.useState("");
	const [error, setError] = React.useState<string | null>(null);

	const handleCreateRoom = async () => {
		setError(null);
		if (!roomName.trim()) {
			setError("Give the room a name.");
			return;
		}

		createRoom(
			{ roomName },
			{
				onSuccess: (newRoom) => {
					switchRoom(newRoom.code);
				},
				onError: (error) => {
					setError(
						error.message ||
							"Couldn't create the room. Try again.",
					);
				},
			},
		);
	};
	return (
		<>
			<section className='flex flex-col gap-4 rounded-2xl border bg-card px-4 py-5'>
				<div>
					<h2 className='text-lg font-semibold'>Start a room</h2>
					<p className='text-sm text-muted-foreground'>
						A room is your group's own game. You run it and invite who you like.
					</p>
				</div>
				<div className='flex flex-col gap-1.5'>
					<label htmlFor='room-name' className='text-sm font-medium'>
						Room name
					</label>
					<Input
						id='room-name'
						placeholder='e.g. Matchday Crew'
						className='h-12'
						value={roomName}
						aria-invalid={!!error}
						aria-describedby='room-name-hint'
						onChange={(e) => setRoomName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") void handleCreateRoom();
						}}
					/>
					{error ? (
						<p id='room-name-hint' className='flex items-center gap-2 text-sm text-destructive'>
							<TriangleAlert className='size-4 shrink-0' aria-hidden='true' />
							{error}
						</p>
					) : (
						<p id='room-name-hint' className='text-xs text-muted-foreground'>
							You can change it later in room settings.
						</p>
					)}
				</div>
				<Button
					variant={"linear"}
					size='lg'
					className='h-12'
					onClick={handleCreateRoom}
					disabled={isLoading}
				>
					{isLoading && <Spinner />}
					Create room
				</Button>
			</section>
			{/* A real sequence, so it's numbered. */}
			<section className='flex flex-col gap-2.5 rounded-2xl border bg-card p-4'>
				<h3 className='text-sm font-semibold'>What happens next</h3>
				<ol className='flex flex-col gap-2 text-sm'>
					{[
						"You get a 6-character code and a link to share.",
						"Start a series, so everyone gets points to play with.",
						"Post your first prediction and let friends pick a side.",
					].map((step, index) => (
						<li key={step} className='grid grid-cols-[1.5rem_minmax(0,1fr)] items-baseline gap-x-2.5'>
							<span className='font-bold text-muted-foreground tabular-nums'>{index + 1}</span>
							<span>{step}</span>
						</li>
					))}
				</ol>
			</section>
		</>
	);
}
