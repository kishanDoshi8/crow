import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { UpNextCompetition } from "@/shared/lib/api";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	Input,
} from "@/shared/ui";

const TITLE_MAX = 60;
const SPORTS: Record<string, string> = { soccer: "Football", cricket: "Cricket" };

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	catalog: UpNextCompetition[];
	onPick: (pick: { competitionId: string } | { title: string }) => void;
};

// Everything Crow has, by sport, with a search; or, when it isn't here, ask
// for it by name. What rooms ask for tells the Crow team what to add.
export function SomethingElseSheet({ open, onOpenChange, catalog, onPick }: Readonly<Props>) {
	const [query, setQuery] = useState("");
	const typed = query.trim().replace(/\s+/g, " ");
	const needle = typed.toLowerCase();

	const groups = useMemo(() => {
		const found = catalog.filter(
			(c) => !needle || c.name.toLowerCase().includes(needle) || (c.region ?? "").toLowerCase().includes(needle),
		);
		const bySport = new Map<string, UpNextCompetition[]>();
		for (const competition of found) {
			const list = bySport.get(competition.sport) ?? [];
			list.push(competition);
			bySport.set(competition.sport, list);
		}
		return [...bySport.entries()];
	}, [catalog, needle]);

	const exact = catalog.some((c) => c.name.toLowerCase() === needle);
	const close = (next: boolean) => {
		if (!next) setQuery("");
		onOpenChange(next);
	};

	return (
		<Drawer open={open} onOpenChange={close}>
			<DrawerContent className='mx-auto max-h-[85dvh] max-w-md'>
				<DrawerHeader className='text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left'>
					<DrawerTitle>Something else</DrawerTitle>
					<DrawerDescription>
						Pick from what Crow has, or ask for something it doesn't.
					</DrawerDescription>
				</DrawerHeader>
				<div className='flex min-h-0 flex-col gap-3 px-4 pb-6'>
					<div className='relative'>
						<SearchIcon
							className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground'
							aria-hidden='true'
						/>
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value.slice(0, TITLE_MAX))}
							placeholder='e.g. Six Nations'
							aria-label='Search or name a competition'
							className='pl-9'
							maxLength={TITLE_MAX}
						/>
					</div>

					<div className='-mx-1 min-h-0 overflow-y-auto px-1'>
						{typed && !exact ? (
							<button
								type='button'
								onClick={() => onPick({ title: typed })}
								className='mb-3 flex w-full flex-col rounded-xl border border-dashed px-3.5 py-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
							>
								<span className='text-sm font-semibold wrap-anywhere'>Ask for “{typed}”</span>
								<span className='text-xs text-muted-foreground'>
									Not on Crow yet. It becomes your pick, and the Crow team sees what rooms ask for.
								</span>
							</button>
						) : null}

						{groups.length === 0 && !typed ? (
							<p className='text-sm text-muted-foreground'>Nothing on Crow right now. Type what you'd like.</p>
						) : null}

						{groups.map(([sport, competitions]) => (
							<section key={sport} className='mb-3 flex flex-col gap-1.5'>
								<h3 className='text-xs font-semibold text-muted-foreground'>{SPORTS[sport] ?? sport}</h3>
								<ul className='divide-y overflow-hidden rounded-xl border'>
									{competitions.map((competition) => (
										<li key={competition.id}>
											<button
												type='button'
												onClick={() => onPick({ competitionId: competition.id })}
												className='flex w-full flex-col px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
											>
												<span className='text-sm font-medium'>{competition.name}</span>
												{competition.region ? (
													<span className='text-xs text-muted-foreground'>{competition.region}</span>
												) : null}
											</button>
										</li>
									))}
								</ul>
							</section>
						))}
					</div>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
