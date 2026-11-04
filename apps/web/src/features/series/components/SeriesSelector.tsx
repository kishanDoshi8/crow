import { useCallback, useEffect, useMemo } from "react";
import { cn } from "@/shared/lib/utils";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/ui";
import type { SeriesSelectorMode } from "@/shared/lib/api";
import { useSeriesSelector } from "@/features/series/hooks/series";

const ALL_SERIES_VALUE = "__all_series__";

type SeriesSelectorItem = {
	value: string;
	label: string;
};

type SeriesSelectorProps = {
	roomId?: string;
	mode: SeriesSelectorMode;
	value?: string | null;
	onValueChange: (value: string | null) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	optional?: boolean;
	autoSelect?: boolean;
	allLabel?: string;
	emptyMessage?: string;
};

export function SeriesSelector({
	roomId,
	mode,
	value,
	onValueChange,
	placeholder = "Select series",
	className,
	disabled = false,
	optional = false,
	autoSelect = false,
	allLabel = "All series",
	emptyMessage = "No series found.",
}: Readonly<SeriesSelectorProps>) {
	const { data, isPending } = useSeriesSelector(roomId, mode, value);

	const items = useMemo<SeriesSelectorItem[]>(
		() => [
			...(optional ? [{ value: ALL_SERIES_VALUE, label: allLabel }] : []),
			...(data?.series ?? []).map((series) => ({
				value: series.id,
				label: series.title,
			})),
		],
		[allLabel, data?.series, optional],
	);

	const selectedValue = useMemo(() => {
		if (!value && optional) {
			return ALL_SERIES_VALUE;
		}

		return value ?? undefined;
	}, [optional, value]);

	const handleValueChange = useCallback(
		(nextValue: string) => {
			onValueChange(
				nextValue === ALL_SERIES_VALUE ? null : (nextValue ?? null),
			);
		},
		[onValueChange],
	);

	useEffect(() => {
		if (!autoSelect || value || items.length === 0) {
			return;
		}

		// Prefer the series the server picked (e.g. the latest active one).
		if (data?.selected_series_id) {
			onValueChange(data.selected_series_id);
			return;
		}

		const firstSeriesItem =
			items.find((item) => item.value !== ALL_SERIES_VALUE) ?? items[0];
		if (!firstSeriesItem) {
			return;
		}

		onValueChange(
			firstSeriesItem.value === ALL_SERIES_VALUE
				? null
				: firstSeriesItem.value,
		);
	}, [autoSelect, data?.selected_series_id, items, onValueChange, value]);

	return (
		<Select value={selectedValue} onValueChange={handleValueChange}>
			<SelectTrigger
				className={cn("w-full", className)}
				disabled={disabled || isPending}
			>
				<SelectValue
					placeholder={isPending ? "Loading series..." : placeholder}
				/>
			</SelectTrigger>
			<SelectContent>
				{items.length > 0 ? (
					items.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))
				) : (
					<SelectItem value='__empty_series__' disabled>
						{emptyMessage}
					</SelectItem>
				)}
			</SelectContent>
		</Select>
	);
}
