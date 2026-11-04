import { useCreatePlayer, usePlayer } from "@/features/home/hooks/player";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Brand from "./Brand";
import { Button, Input, Spinner } from "@/shared/ui";
import { toast } from "sonner";
import { useAuth } from "@/features/auth";
import { takePostAuthRedirect } from "@/shared/lib/postAuthRedirect";

const MIN_USERNAME_LENGTH = 3;

// "Kishan Doshi" from Google becomes "Kishan"; the player can change it.
function suggestedUsername(metadata: Record<string, unknown> | undefined) {
	const name = metadata?.full_name ?? metadata?.name ?? "";
	if (typeof name !== "string") return "";
	return name.trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{N}_]/gu, "") ?? "";
}

function CreatePlayer() {
	const { data: player, isPending: isPlayerLoading } = usePlayer();
	const { mutate: createPlayer, isPending: isCreatingPlayer } =
		useCreatePlayer();
	const { user } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const from =
		(location.state as { from?: { pathname?: string } } | null)?.from
			?.pathname ?? "/";

	const [username, setUsername] = useState(() =>
		suggestedUsername(user?.user_metadata),
	);
	// The saved destination can be used once; after saving a name the player
	// query refreshes too, and must not trigger a second navigation.
	const hasNavigatedRef = useRef(false);
	const leave = () => {
		if (hasNavigatedRef.current) return;
		hasNavigatedRef.current = true;
		navigate(takePostAuthRedirect(from), { replace: true });
	};
	const trimmed = username.trim();
	const isTooShort = trimmed.length > 0 && trimmed.length < MIN_USERNAME_LENGTH;

	useEffect(() => {
		if (!isPlayerLoading && player) leave();
	}, [player, isPlayerLoading]);

	const handleCreatePlayer = (event: FormEvent) => {
		event.preventDefault();
		if (trimmed.length < MIN_USERNAME_LENGTH) return;

		createPlayer(trimmed, {
			onSuccess: (data) => {
				toast.success(`Welcome ${data.username}!`, {
					position: "top-center",
				});
				leave();
			},
			onError: (error) => {
				toast.error("Couldn't save that name.", {
					description: error.message,
					position: "top-center",
				});
			},
		});
	};

	return (
		<div className={`p-8 mt-4 flex flex-col items-center gap-8`}>
			<Brand />

			<form
				onSubmit={handleCreatePlayer}
				className={`flex flex-col gap-4 border-2 p-8 w-full max-w-sm`}
			>
				<div className='flex flex-col gap-1'>
					<label htmlFor='username' className='text-sm font-medium'>
						Pick a name your friends will see
					</label>
					<Input
						id='username'
						placeholder='e.g. Kishan'
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						autoComplete='nickname'
						autoFocus
						aria-invalid={isTooShort}
						aria-describedby='username-hint'
					/>
					<p
						id='username-hint'
						className={`text-xs ${isTooShort ? "text-destructive" : "text-muted-foreground"}`}
					>
						At least {MIN_USERNAME_LENGTH} characters.
					</p>
				</div>
				<Button
					type='submit'
					variant='linear'
					disabled={isCreatingPlayer || trimmed.length < MIN_USERNAME_LENGTH}
				>
					{isCreatingPlayer && <Spinner />}
					Continue
				</Button>
			</form>
		</div>
	);
}

export default CreatePlayer;
