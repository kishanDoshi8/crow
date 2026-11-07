import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/context/AuthContext";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";
import { Brand } from "@/features/home";
import { GoogleButton, OrDivider } from "@/features/auth/components/GoogleButton";
import { takePostAuthRedirect } from "@/shared/lib/postAuthRedirect";
import { AboutCrow } from "@/features/legal";

export function LoginPage() {
	const { signIn } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const from = (location.state as { from?: Location })?.from?.pathname ?? "/";

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setIsLoading(true);
		try {
			await signIn(email, password);
			navigate(takePostAuthRedirect(from), { replace: true });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to sign in.");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className='p-8 mt-4 flex flex-col items-center gap-8'>
			<Brand />

			<div className='flex flex-col gap-4 border-2 p-8 w-full max-w-sm'>
				<h2 className='text-2xl font-bold'>Sign in</h2>

				<GoogleButton onError={setError} />
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
							autoComplete='current-password'
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
						variant={"linear"}
						type='submit'
						disabled={isLoading}
						className='w-full'
					>
						{isLoading && <Spinner />}
						Sign in
					</Button>
				</form>

				<div className='flex flex-col gap-2 text-sm text-center text-muted-foreground'>
					<Link
						to='/forgot-password'
						className='text-accent hover:underline'
					>
						Forgot your password?
					</Link>
					<span>
						Don&apos;t have an account?{" "}
						<Link
							to='/signup'
							className='text-accent hover:underline'
						>
							Sign up
						</Link>
					</span>
				</div>
			</div>

			<AboutCrow />
		</div>
	);
}
