import { useRoomTags } from "@/features/predictions/hooks/prediction";
import { Input } from "@/shared/ui";
import { XIcon } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 24;

type Props = {
	roomId: string;
	value: string[];
	onChange: (tags: string[]) => void;
};

const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Short labels like T20 or Semi-final. Kept as typed; phone keyboards start
// in capitals, and tags used before in the room are offered.
export function TagInput({ roomId, value, onChange }: Readonly<Props>) {
	const [draft, setDraft] = useState("");
	const { data: roomTags = [] } = useRoomTags(roomId);
	const isFull = value.length >= MAX_TAGS;

	const add = (raw: string) => {
		const tag = raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
		setDraft("");
		if (!tag || isFull || value.some((t) => sameTag(t, tag))) return;
		onChange([...value, tag]);
	};

	const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter" || event.key === ",") {
			event.preventDefault();
			add(draft);
		} else if (event.key === "Backspace" && !draft && value.length > 0) {
			remove(value[value.length - 1]);
		}
	};

	const query = draft.trim().toLowerCase();
	const suggestions = roomTags
		.filter((tag) => !value.some((t) => sameTag(t, tag)))
		.filter((tag) => !query || tag.toLowerCase().includes(query))
		.slice(0, 8);

	return (
		<div className='flex flex-col gap-2'>
			{value.length > 0 ? (
				<ul aria-label='Tags' className='flex flex-wrap gap-1.5'>
					{value.map((tag) => (
						<li
							key={tag}
							className='flex items-center gap-1 rounded-full bg-secondary py-0.5 pl-2.5 pr-1 text-xs font-medium'
						>
							{tag}
							<button
								type='button'
								onClick={() => remove(tag)}
								aria-label={`Remove ${tag}`}
								className='flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground'
							>
								<XIcon className='size-3' />
							</button>
						</li>
					))}
				</ul>
			) : null}
			{isFull ? (
				<p className='text-xs text-muted-foreground'>Up to {MAX_TAGS} tags.</p>
			) : (
				<Input
					id='tags'
					value={draft}
					onChange={(event) => {
						const next = event.target.value;
						// A comma finishes a tag, which matters on phone keyboards.
						if (next.endsWith(",")) add(next.slice(0, -1));
						else setDraft(next.slice(0, MAX_TAG_LENGTH));
					}}
					onKeyDown={handleKeyDown}
					onBlur={() => add(draft)}
					placeholder='e.g. T20, Semi-final'
					autoCapitalize='characters'
					autoCorrect='off'
					spellCheck={false}
					enterKeyHint='done'
				/>
			)}
			{!isFull && suggestions.length > 0 ? (
				<div className='flex flex-wrap gap-1.5'>
					{suggestions.map((tag) => (
						<button
							key={tag}
							type='button'
							// Fires before the input's blur, so the tap isn't lost.
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => add(tag)}
							className='rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground'
						>
							+ {tag}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
