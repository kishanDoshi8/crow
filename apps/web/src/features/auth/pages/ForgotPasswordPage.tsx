import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/features/auth/context/AuthContext";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";
import { Brand } from "@/features/home";

export function ForgotPasswordPage() {
  const { sendPasswordResetEmail } = useAuth();

  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(email);
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't send the reset email. Try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='p-8 mt-4 flex flex-col items-center gap-8'>
      <Brand />

      <div className='flex flex-col gap-4 border-2 p-8 w-full max-w-sm'>
        <h2 className='text-2xl font-bold'>Reset password</h2>

        {sent ? (
          <div className='flex flex-col gap-4'>
            <p className='text-sm text-muted-foreground'>
              Check your email for a password reset link.
            </p>
            <Link to='/login' className='text-sm text-primary hover:underline'>
              Back to sign in
            </Link>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className='flex flex-col gap-4'
          >
            <p className='text-sm text-muted-foreground'>
              Enter your email address and we&apos;ll send you a link to reset
              your password.
            </p>

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

            {error && (
              <p className='text-sm text-destructive' role='alert'>
                {error}
              </p>
            )}

            <Button type='submit' disabled={isLoading} className='w-full'>
              {isLoading && <Spinner />}
              Send reset link
            </Button>

            <Link
              to='/login'
              className='text-sm text-center text-muted-foreground hover:text-foreground transition-colors'
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
