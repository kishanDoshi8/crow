import { useRoomContext } from "@/shared/lib/roomContext";
import { useAppNavigation } from "@/shared/lib/navigation";
import { useUpdateRoom } from "@/features/rooms/hooks/staff";
import { useRoomRole } from "@/features/rooms/hooks/useRoomRole";
import { Button, Input, RadioGroup, RadioGroupItem, Spinner } from "@/shared/ui";
import { Switch } from "@/shared/ui/switch";
import type { JoinPolicy } from "@/features/rooms/types/types";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/shared/ui/field";
import { Textarea } from "@/shared/ui/textarea";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

const NAME_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 240;

function wholeNumberBetween(value: string, min: number, max: number) {
	const number = Number(value);
	return Number.isInteger(number) && number >= min && number <= max;
}

// Owner only: room details and the settings that shape staff work.
export default function RoomSettingsPage() {
	const { room } = useRoomContext();
	const { can } = useRoomRole(room);
	const { back } = useAppNavigation();
	const { mutate: updateRoom, isPending } = useUpdateRoom(room.id);
	const [form, setForm] = useState({
		name: room.name,
		description: room.description ?? "",
		resultReminderHours: String(room.result_reminder_hours ?? 3),
	});
	const [listed, setListed] = useState(room.listed ?? false);
	const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>(room.join_policy ?? "open");
	const memberCount = room.members.length;

	if (!can.own) {
		return <Navigate to={`/rooms/${room.code}`} replace />;
	}

	const nameError = form.name.trim() ? "" : "Name is required.";
	const reminderError = wholeNumberBetween(form.resultReminderHours, 1, 48)
		? ""
		: "Use a whole number of hours from 1 to 48.";
	const canSave = !isPending && !nameError && !reminderError;

	const update =
		(field: keyof typeof form) =>
		(value: string) =>
			setForm((current) => ({ ...current, [field]: value }));

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSave) {
			toast(nameError || reminderError);
			return;
		}
		updateRoom(
			{
				name: form.name.trim(),
				description: form.description.trim(),
				resultReminderHours: Number(form.resultReminderHours),
				listed,
				joinPolicy,
			},
			{
				onSuccess: () => {
					toast.success("Room settings saved.", { position: "top-center" });
					back(`/rooms/${room.code}`);
				},
				onError: (error) => {
					toast.error("Couldn't save room settings.", {
						description: error.message,
						position: "top-center",
					});
				},
			},
		);
	};

	return (
		<div className='mx-auto w-full max-w-md p-4'>
			<form
				className='space-y-4 rounded-2xl border p-4'
				onSubmit={handleSubmit}
			>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor='room-name'>Name</FieldLabel>
						<Input
							id='room-name'
							value={form.name}
							maxLength={NAME_MAX_LENGTH}
							onChange={(event) => update("name")(event.target.value)}
							disabled={isPending}
							required
						/>
					</Field>

					<Field>
						<FieldLabel htmlFor='room-description'>Description</FieldLabel>
						<Textarea
							id='room-description'
							placeholder='What does this room play?'
							value={form.description}
							maxLength={DESCRIPTION_MAX_LENGTH}
							onChange={(event) =>
								update("description")(event.target.value)
							}
							disabled={isPending}
						/>
						<FieldDescription>
							Optional. {form.description.length}/{DESCRIPTION_MAX_LENGTH}
						</FieldDescription>
					</Field>

					<Field>
						<FieldLabel htmlFor='room-result-reminder'>
							Result reminder (hours)
						</FieldLabel>
						<Input
							id='room-result-reminder'
							type='number'
							min={1}
							max={48}
							step={1}
							value={form.resultReminderHours}
							onChange={(event) =>
								update("resultReminderHours")(event.target.value)
							}
							disabled={isPending}
						/>
						<FieldDescription>
							{reminderError ||
								"Staff get a push when a result is still missing this long after picks close."}
						</FieldDescription>
					</Field>
				</FieldGroup>

				<section aria-labelledby='room-access-heading' className='flex flex-col gap-3'>
					<h2
						id='room-access-heading'
						className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'
					>
						Who can find and join
					</h2>
					<label
						htmlFor='room-listed'
						className='flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3.5'
					>
						<span className='flex-1'>
							<span className='block font-medium'>Show in Explore</span>
							<span className='mt-0.5 block text-xs text-muted-foreground'>
								Anyone on Crow can find this room. Off: only people with your
								invite link or code.
							</span>
						</span>
						<Switch
							id='room-listed'
							checked={listed}
							onCheckedChange={setListed}
							disabled={isPending}
						/>
					</label>
					<fieldset className='rounded-xl border bg-card p-3.5'>
						<legend className='px-1 font-medium'>Who can join</legend>
						<RadioGroup
							value={joinPolicy}
							onValueChange={(value) => setJoinPolicy(value as JoinPolicy)}
							disabled={isPending}
							className='mt-1'
						>
							<label htmlFor='join-open' className='flex cursor-pointer items-start gap-3'>
								<RadioGroupItem id='join-open' value='open' className='mt-0.5' />
								<span>
									<span className='block'>Anyone with the link or code</span>
									<span className='block text-xs text-muted-foreground'>
										They join straight away.
									</span>
								</span>
							</label>
							<label htmlFor='join-request' className='flex cursor-pointer items-start gap-3'>
								<RadioGroupItem id='join-request' value='request' className='mt-0.5' />
								<span>
									<span className='block'>Request to join</span>
									<span className='block text-xs text-muted-foreground'>
										You or an organizer lets each person in, from Members &amp;
										roles.
									</span>
								</span>
							</label>
						</RadioGroup>
					</fieldset>
					<p className='flex justify-between px-1 text-sm text-muted-foreground'>
						<span>Members</span>
						<span className='tabular-nums'>
							<span className='font-semibold text-foreground'>{memberCount}</span>
							{room.member_limit ? ` / ${room.member_limit}` : ""}
						</span>
					</p>
				</section>

				<div className='flex justify-end gap-2'>
					<Button
						type='button'
						variant='outline'
						onClick={() => back(`/rooms/${room.code}`)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button type='submit' disabled={!canSave}>
						{isPending && <Spinner />}
						Save
					</Button>
				</div>
			</form>
		</div>
	);
}
