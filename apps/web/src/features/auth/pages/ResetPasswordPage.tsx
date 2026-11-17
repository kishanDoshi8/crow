import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/shared/lib/supabase";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";
import { Brand } from "@/features/home";

export function ResetPasswordPage() {
	const navigate = useNavigate();

	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
			const { error } = await supabase.auth.updateUser({ password });
			if (error) throw error;
			navigate("/", { replace: true });
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Couldn't update your password. Try again.",
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className='p-8 mt-4 flex flex-col items-center gap-8'>
			<Brand />

			<div className='flex flex-col gap-4 border-2 p-8 w-full max-w-sm'>
				<h2 className='text-2xl font-bold'>Set new password</h2>

				<form
					onSubmit={(e) => void handleSubmit(e)}
					className='flex flex-col gap-4'
				>
					<div className='flex flex-col gap-1'>
						<label
							htmlFor='password'
							className='text-sm text-muted-foreground'
						>
							New password
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
							Confirm new password
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
						variant={"linear"}
						type='submit'
						disabled={isLoading}
						className='w-full'
					>
						{isLoading && <Spinner />}
						Update password
					</Button>
				</form>
			</div>
		</div>
	);
}
