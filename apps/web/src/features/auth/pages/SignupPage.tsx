import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/context/AuthContext";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";
import { Brand } from "@/features/home";
import { GoogleButton, OrDivider } from "@/features/auth/components/GoogleButton";
import { AboutCrow } from "@/features/legal";

export function SignupPage() {
	const { signUp } = useAuth();
	const navigate = useNavigate();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [needsConfirmation, setNeedsConfirmation] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (password !== confirmPassword) {
			setError("Passwords do not match.");
			return;
		}

		if (password.length < 6) {
			setError("Password must be at least 6 characters.");
			return;
		}

		setIsLoading(true);
		try {
			const isSignedIn = await signUp(email, password);
			if (isSignedIn) {
				// CreatePlayer continues to the saved destination (e.g. the invite).
				navigate("/create-player", { replace: true });
			} else {
				setNeedsConfirmation(true);
			}
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Failed to create account.",
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className='p-8 mt-4 flex flex-col items-center gap-8'>
			<Brand />

			<div className='flex flex-col gap-4 border-2 p-8 w-full max-w-sm'>
				<h2 className='text-2xl font-bold'>Create account</h2>

				{needsConfirmation ? (
					<p className='rounded-md border border-accent/40 bg-accent/10 p-3 text-sm' role='status'>
						Check {email} for a confirmation link, then come back and
						sign in. Or skip the wait and continue with Google.
					</p>
				) : null}

				<GoogleButton label='Sign up with Google' onError={setError} />
				<OrDivider />

				<form
					onSubmit={(e) => void handleSubmit(e)}
					className='flex flex-col gap-4'
				>
					<div className='flex flex-col gap-1'>
						<label
							htmlFor='email'
							className='text-sm text-muted-foreground'
						>
							Email
						</label>
						<Input
							id='email'
							type='email'
							placeholder='you@example.com'
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							autoComplete='email'
							required
							disabled={isLoading}
						/>
					</div>

					<div className='flex flex-col gap-1'>
						<label
							htmlFor='password'
							className='text-sm text-muted-foreground'
						>
							Password
						</label>
						<Input
							id='password'
							type='password'
							placeholder='••••••••'
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							autoComplete='new-password'
							required
							disabled={isLoading}
						/>
					</div>

					<div className='flex flex-col gap-1'>
						<label
							htmlFor='confirm-password'
							className='text-sm text-muted-foreground'
						>
							Confirm password
						</label>
						<Input
							id='confirm-password'
							type='password'
							placeholder='••••••••'
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							autoComplete='new-password'
							required
							disabled={isLoading}
						/>
					</div>

					{error && (
						<p className='text-sm text-destructive' role='alert'>
							{error}
						</p>
					)}

					<Button
						variant='linear'
						type='submit'
						disabled={isLoading}
						className='w-full'
					>
						{isLoading && <Spinner />}
						Create account
					</Button>
				</form>

				<p className='text-sm text-center text-muted-foreground'>
					Already have an account?{" "}
					<Link to='/login' className='text-accent hover:underline'>
						Sign in
					</Link>
				</p>
			</div>

			<AboutCrow />
		</div>
	);
}
