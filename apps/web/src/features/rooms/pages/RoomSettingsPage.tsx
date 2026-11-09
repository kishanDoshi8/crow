import { useRoomContext } from "@/shared/lib/roomContext";
import { useAppNavigation } from "@/shared/lib/navigation";
import { useUpdateRoom } from "@/features/rooms/hooks/staff";
import { useRoomRole } from "@/features/rooms/hooks/useRoomRole";
import { Button, Input, Spinner } from "@/shared/ui";
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
