import {
	Checkbox,
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
	FieldTitle,
	Input,
} from "@/shared/ui";
import { useId } from "react";

type SeriesGamesFieldProps = {
	openEnded: boolean;
	expectedGames: string;
	disabled?: boolean;
	// Shown under the number input, e.g. how many games are already resolved.
	hint?: string;
	onOpenEndedChange: (openEnded: boolean) => void;
	onExpectedGamesChange: (expectedGames: string) => void;
};

export function SeriesGamesField({
	openEnded,
	expectedGames,
	disabled = false,
	hint,
	onOpenEndedChange,
	onExpectedGamesChange,
}: Readonly<SeriesGamesFieldProps>) {
	const id = useId();

	return (
		<div className='space-y-2'>
			<FieldLabel htmlFor={`${id}-open-ended`}>
				<Field orientation='horizontal'>
					<Checkbox
						id={`${id}-open-ended`}
						checked={openEnded}
						onCheckedChange={(checked) =>
							onOpenEndedChange(checked === true)
						}
						disabled={disabled}
					/>
					<FieldContent>
						<FieldTitle>Open-ended</FieldTitle>
						<FieldDescription>
							No set number of questions. Good for league seasons
							where you pick matches as you go.
						</FieldDescription>
					</FieldContent>
				</Field>
			</FieldLabel>

			{openEnded ? null : (
				<Field>
					<FieldLabel htmlFor={`${id}-expected-games`}>
						Expected questions
					</FieldLabel>
					<Input
						id={`${id}-expected-games`}
						type='number'
						min={1}
						step={1}
						value={expectedGames}
						onChange={(event) =>
							onExpectedGamesChange(event.target.value)
						}
						disabled={disabled}
					/>
					<FieldDescription>
						{hint ?? "How many questions are planned in this series."}
					</FieldDescription>
				</Field>
			)}
		</div>
	);
}

// The number to save for expectedGames: 0 for open-ended, otherwise a whole
// number of at least 1. Returns null when the input isn't valid.
export function parseExpectedGames(
	openEnded: boolean,
	expectedGames: string,
): number | null {
	if (openEnded) {
		return 0;
	}
	const value = Number(expectedGames);
	return Number.isInteger(value) && value >= 1 ? value : null;
}
