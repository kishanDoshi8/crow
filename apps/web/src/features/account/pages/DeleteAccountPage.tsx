import {
	useAccountDeletion,
	useCancelAccountDeletion,
	useRequestAccountDeletion,
} from "@/features/account/hooks/accountDeletion";
import { useAuth } from "@/features/auth";
import {
	Alert,
	AlertDescription,
	Button,
	Checkbox,
	Field,
	FieldContent,
	FieldLabel,
	FieldTitle,
	Loading,
	Spinner,
} from "@/shared/ui";
import { Textarea } from "@/shared/ui/textarea";
import { ChevronLeftIcon, InfoIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

// Players ask for their account to be deleted; it's carried out by hand
// within 30 days for now. The future profile page will host this.
export default function DeleteAccountPage() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const { data: request, isPending } = useAccountDeletion();
	const { mutate: requestDeletion, isPending: isRequesting } =
		useRequestAccountDeletion();
	const { mutate: cancelDeletion, isPending: isCancelling } =
		useCancelAccountDeletion();
	const [reason, setReason] = useState("");
	const [understood, setUnderstood] = useState(false);

	const handleBack = () => {
		if (globalThis.history.length > 1) {
			navigate(-1);
			return;
		}
		navigate("/", { replace: true });
	};

	const handleRequest = () => {
		requestDeletion(reason.trim() || null, {
			onSuccess: () => {
				toast.success("Request sent. We'll delete your account within 30 days.", {
					position: "top-center",
				});
			},
			onError: (error) => {
				toast.error("Couldn't send the request.", {
					description: error.message,
					position: "top-center",
				});
			},
		});
	};

	const handleCancel = () => {
		cancelDeletion(undefined, {
			onSuccess: () => {
				toast.success("Request cancelled. Your account stays.", {
					position: "top-center",
				});
			},
			onError: (error) => {
				toast.error("Couldn't cancel the request.", {
					description: error.message,
					position: "top-center",
				});
			},
		});
	};

	return (
		<div className='min-h-dvh flex flex-col'>
			<header className='p-4'>
				<Button
					variant='ghost'
					size='icon'
					className='rounded-lg'
					onClick={handleBack}
					aria-label='Back'
				>
					<ChevronLeftIcon />
				</Button>
			</header>

			<main className='w-full max-w-md mx-auto flex flex-col gap-5 px-4 pb-16'>
				<h1 className='text-3xl font-bold tracking-tight'>Delete account</h1>

				{isPending ? (
					<div className='flex justify-center py-10'>
						<Loading className='size-8 text-primary' />
					</div>
				) : request ? (
					<>
						<Alert>
							<InfoIcon />
							<AlertDescription>
								You asked us to delete your account on{" "}
								{new Date(request.requested_at).toLocaleDateString()}. We'll
								do it within 30 days and email {user?.email ?? "you"} when
								it's done. Until then everything works as normal.
							</AlertDescription>
						</Alert>
						<Button
							variant='outline'
							size='lg'
							onClick={handleCancel}
							disabled={isCancelling}
						>
							{isCancelling && <Spinner />}
							Keep my account
						</Button>
					</>
				) : (
					<>
						<div className='space-y-3 text-sm text-muted-foreground'>
							<p>When your account is deleted:</p>
							<ul className='list-disc space-y-1.5 pl-5'>
								<li>Your login, email and settings are removed.</li>
								<li>
									You leave every room. Bets on open predictions are
									refunded; rooms you own pass to another member.
								</li>
								<li>
									Your past results stay so everyone else's points still add
									up, under the name "Ghost crow" instead of yours.
								</li>
							</ul>
							<p>We'll do it within 30 days of your request.</p>
						</div>

						<Field>
							<FieldLabel htmlFor='deletion-reason'>
								Anything we should know?{" "}
								<span className='font-normal text-muted-foreground'>
									(optional)
								</span>
							</FieldLabel>
							<Textarea
								id='deletion-reason'
								value={reason}
								maxLength={500}
								onChange={(e) => setReason(e.target.value)}
								placeholder='What made you want to leave?'
							/>
						</Field>

						<FieldLabel htmlFor='deletion-understood'>
							<Field orientation='horizontal'>
								<Checkbox
									id='deletion-understood'
									checked={understood}
									onCheckedChange={(checked) => setUnderstood(checked === true)}
								/>
								<FieldContent>
									<FieldTitle>
										I understand my account can't be recovered once it's
										deleted
									</FieldTitle>
								</FieldContent>
							</Field>
						</FieldLabel>

						<Button
							variant='destructive'
							size='lg'
							onClick={handleRequest}
							disabled={!understood || isRequesting}
						>
							{isRequesting && <Spinner />}
							Request account deletion
						</Button>
					</>
				)}
			</main>
		</div>
	);
}
