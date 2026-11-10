import React, { Suspense, lazy } from "react";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@/shared/ui/input-otp";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";
import {
	CircleQuestionMark,
	TriangleAlert,
} from "lucide-react";
import { usePlayer } from "@/features/home/hooks/player";
import Brand from "./Brand";
import { AccountSheet, accountInitials } from "./AccountSheet";
import { RoomCardsList } from "@/features/rooms/components/RoomCardsList";
import { useCreateRoom } from "@/features/rooms/hooks/room";
import type { Room } from "@/features/rooms/types/types";
import {
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

export type HomeTab = "rooms" | "join" | "create";

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

	return (
		<div className={`p-8 mt-4 flex flex-col items-center gap-8`}>
			{/* Account: sign out and delete account, even with no rooms yet. */}
			<button
				type='button'
				onClick={() => setIsAccountOpen(true)}
				aria-label='Account'
				className='fixed top-4 right-4 flex size-10 items-center justify-center rounded-full border bg-secondary text-xs font-semibold transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
			>
				{accountInitials(player?.username)}
			</button>
			<Brand />

			{player && (
				<p className={`text-muted-foreground`}>
					Welcome back,{" "}
					<span className={`text-accent`}>{player.username}!</span>
				</p>
			)}

			<div className={`w-full max-w-md mx-auto`}>
				<Tabs
					value={activeTab}
					onValueChange={(value) => setActiveTab(value as HomeTab)}
				>
					<TabsList className={`w-full `}>
						<TabsTrigger value='rooms'>Your Rooms</TabsTrigger>
						<TabsTrigger value='join'># Join</TabsTrigger>
						<TabsTrigger value='create'>Create Room</TabsTrigger>
					</TabsList>
					<TabsContent value='rooms'>
						<div className={`mt-4`}>
							<RoomCardsList
								rooms={playerRooms}
								isLoading={isPlayerRoomsLoading}
								error={playerRoomsError}
							/>
						</div>
					</TabsContent>
					<TabsContent value='join'>
						<JoinRoom
							roomCode={roomCode}
							setRoomCode={setRoomCode}
							validatedCode={validatedCode}
							setValidatedCode={setValidatedCode}
							isLoading={isLoading}
							handleEnterRoom={handleEnterRoom}
						/>
					</TabsContent>
					<TabsContent value='create'>
						<CreateRoom />
					</TabsContent>
				</Tabs>
			</div>

			<div className={`fixed bottom-4 right-4`}>
				<Button
					variant='outline'
					className={`text-muted-foreground`}
					size='sm'
					onClick={() => setOpenHowToPlay(true)}
				>
					<CircleQuestionMark />
					How to Play
				</Button>
			</div>

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
		<div className={`flex flex-col mt-4 border-2 p-8 rounded-lg`}>
			<h2 className={`text-center text-xl font-semibold`}>
				Enter Room Code
			</h2>
			<p className={`text-sm text-center text-muted-foreground`}>
				Get the 6-character code from a friend
			</p>
			<div className={`flex flex-col gap-4 mt-6 mx-auto`}>
				<InputOTP
					maxLength={6}
					value={roomCode}
					onChange={handleChange}
					type='text'
					inputMode='text'
				>
					<InputOTPGroup>
						<InputOTPSlot
							index={0}
							aria-invalid={validatedCode && roomCode.length < 1}
						/>
						<InputOTPSlot
							index={1}
							aria-invalid={validatedCode && roomCode.length < 2}
						/>
						<InputOTPSlot
							index={2}
							aria-invalid={validatedCode && roomCode.length < 3}
						/>
					</InputOTPGroup>
					<InputOTPSeparator />
					<InputOTPGroup>
						<InputOTPSlot
							index={3}
							aria-invalid={validatedCode && roomCode.length < 4}
						/>
						<InputOTPSlot
							index={4}
							aria-invalid={validatedCode && roomCode.length < 5}
						/>
						<InputOTPSlot
							index={5}
							aria-invalid={validatedCode && roomCode.length < 6}
						/>
					</InputOTPGroup>
				</InputOTP>
				<Button
					variant={"linear"}
					size='lg'
					onClick={handleEnterRoom}
					disabled={isLoading}
				>
					{isLoading && <Spinner />}
					Enter Room
				</Button>
			</div>
		</div>
	);
}

function CreateRoom() {
	const { switchRoom } = useAppNavigation();
	const { mutate: createRoom, isPending: isLoading } = useCreateRoom();
	const [roomName, setRoomName] = React.useState("");
	const [error, setError] = React.useState<string | null>(null);

	const handleCreateRoom = async () => {
		setError(null);
		if (!roomName.trim()) {
			setError("Room name cannot be empty.");
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
							"An error occurred while creating the room.",
					);
				},
			},
		);
	};
	return (
		<div className={`flex flex-col mt-4 border-2 p-8 rounded-lg`}>
			<h2 className={`text-center text-xl font-semibold`}>
				Create a New Room
			</h2>
			<p className={`text-sm text-center text-muted-foreground`}>
				Invite friends with a unique code
			</p>
			<Input
				placeholder='Room Name'
				className={`mt-6`}
				value={roomName}
				onChange={(e) => setRoomName(e.target.value)}
			/>
			{error && (
				<p
					className={`text-destructive text-sm mt-2 flex items-center gap-2`}
				>
					<TriangleAlert className={`w-4 h-4`} />
					{error}
				</p>
			)}
			<div className={`flex flex-col gap-4 mt-6 w-full mx-auto`}>
				<Button
					variant={"linear"}
					size='lg'
					onClick={handleCreateRoom}
					disabled={isLoading}
				>
					{isLoading && <Spinner />}
					Create room
				</Button>
			</div>
		</div>
	);
}
