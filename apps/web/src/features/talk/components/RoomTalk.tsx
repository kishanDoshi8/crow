import { useState } from "react";
import { CheckIcon, LockIcon, MinusCircleIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { REACTIONS, type ReactionKey } from "../reactions";
import type { PredictionTalk, TalkPost } from "../types";

// How many entries show before "Show all".
const COLLAPSED_COUNT = 6;

type PredictionMoments = {
	status: "draft" | "locked" | "revealed" | "cancelled" | "no_result";
	deadline: string;
	resolvedAt: string | null;
	winnerLabel: string | null;
};

type Props = {
	talk: PredictionTalk | undefined;
	moments: PredictionMoments;
	viewerId: string | null;
	onReact: (reaction: ReactionKey | null) => void;
	// Offline: reactions show but can't be changed.
	readOnly?: boolean;
};

type Entry =
	| { type: "post"; at: string; post: TalkPost }
	| { type: "moment"; at: string; kind: "closed" | "revealed" | "no_result" | "cancelled"; label: string };

// Reactions and preset phrases on a prediction. The six reactions sit on top
// (one each, tap again to take it back); below, what people said, newest
// first, with the prediction's own moments (betting closing, the result)
// between them so it reads as one story.
export function RoomTalk({ talk, moments, viewerId, onReact, readOnly = false }: Readonly<Props>) {
	const [expanded, setExpanded] = useState(false);
	const counts = new Map(talk?.reactions.map((r) => [r.reaction, r.count]) ?? []);
	const totalReactions = talk?.reactions.reduce((sum, r) => sum + r.count, 0) ?? 0;
	const posts = talk?.posts ?? [];

	const entries: Entry[] = posts.map((post) => ({ type: "post", at: post.created_at, post }));
	if (posts.length > 0) {
		const cancelledEarly =
			moments.status === "cancelled" &&
			!!moments.resolvedAt &&
			Date.parse(moments.resolvedAt) < Date.parse(moments.deadline);
		if (moments.status !== "draft" && !cancelledEarly) {
			entries.push({ type: "moment", at: moments.deadline, kind: "closed", label: "Betting closed" });
		}
		if (moments.resolvedAt && moments.status !== "draft" && moments.status !== "locked") {
			const kind = moments.status === "revealed" ? "revealed" : moments.status;
			const label =
				moments.status === "revealed"
					? `${moments.winnerLabel ?? "Result"} won`
					: moments.status === "cancelled"
						? "Cancelled"
						: "No result";
			entries.push({ type: "moment", at: moments.resolvedAt, kind, label });
		}
	}
	entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
	const visible = expanded ? entries : entries.slice(0, COLLAPSED_COUNT);
	const hidden = entries.length - visible.length;

	const summary = [
		posts.length ? `${posts.length} ${posts.length === 1 ? "phrase" : "phrases"}` : null,
		totalReactions ? `${totalReactions} ${totalReactions === 1 ? "reaction" : "reactions"}` : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<section aria-labelledby='room-talk-heading'>
			<h2
				id='room-talk-heading'
				className='mb-2.5 flex items-baseline justify-between gap-3 text-sm font-semibold'
			>
				Room talk
				<span className='text-xs font-normal text-muted-foreground'>{summary}</span>
			</h2>

			<div className='flex gap-1.5' role='group' aria-label='Reactions'>
				{REACTIONS.map(({ key, emoji, label }) => {
					const count = counts.get(key) ?? 0;
					const mine = talk?.my_reaction === key;
					return (
						<button
							key={key}
							type='button'
							aria-pressed={mine}
							aria-label={`${label}${count ? `, ${count}` : ""}${mine ? ", yours" : ""}`}
							disabled={!talk || readOnly}
							onClick={() => onReact(mine ? null : key)}
							className={cn(
								"flex h-10 flex-1 items-center justify-center gap-1 rounded-full border bg-card text-[13px] tabular-nums transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
								mine && "border-2 border-primary bg-primary/10",
							)}
						>
							<span className={cn("text-base leading-none", !count && !mine && "opacity-60 grayscale")} aria-hidden>
								{emoji}
							</span>
							{count ? <span>{count}</span> : null}
						</button>
					);
				})}
			</div>

			{entries.length === 0 ? (
				<p className='mt-3 text-xs text-muted-foreground'>Nobody has said anything yet.</p>
			) : (
				<ol className='mt-4 flex flex-col gap-3'>
					{visible.map((entry) =>
						entry.type === "post" ? (
							<PostRow key={entry.post.id} post={entry.post} isMe={entry.post.player_id === viewerId} />
						) : (
							<MomentRow key={`${entry.kind}-${entry.at}`} entry={entry} />
						),
					)}
					{hidden > 0 ? (
						<li>
							<button
								type='button'
								className='text-xs font-medium text-accent hover:underline'
								onClick={() => setExpanded(true)}
							>
								Show {hidden} more
							</button>
						</li>
					) : null}
				</ol>
			)}
		</section>
	);
}

function PostRow({ post, isMe }: Readonly<{ post: TalkPost; isMe: boolean }>) {
	return (
		<li className='flex items-start gap-2.5'>
			<span className='flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold'>
				{post.username.slice(0, 2).toUpperCase()}
			</span>
			<div className='min-w-0'>
				<p className='text-xs text-muted-foreground'>
					<span className='text-foreground'>{isMe ? "You" : post.username}</span> · {timeAgo(post.created_at)}
				</p>
				<p
					className={cn(
						"mt-1 inline-block rounded-[4px_14px_14px_14px] px-3 py-1.5 text-sm font-semibold",
						isMe ? "bg-primary/15 text-primary" : "bg-secondary",
					)}
				>
					{post.text}
				</p>
			</div>
		</li>
	);
}

function MomentRow({ entry }: Readonly<{ entry: Extract<Entry, { type: "moment" }> }>) {
	const Icon =
		entry.kind === "closed" ? LockIcon : entry.kind === "revealed" ? CheckIcon : MinusCircleIcon;
	return (
		<li className='flex items-center gap-2 pl-1 text-xs text-muted-foreground'>
			<Icon
				className={cn(
					"size-3",
					entry.kind === "closed" && "text-accent",
					entry.kind === "revealed" && "text-win",
				)}
				strokeWidth={entry.kind === "revealed" ? 3 : 2.4}
				aria-hidden
			/>
			<span>
				{entry.label} · {timeAgo(entry.at)}
			</span>
			<span className='h-px flex-1 bg-border' aria-hidden />
		</li>
	);
}

// "just now", "5m", "3h", "2d": compact enough for a chat line.
function timeAgo(iso: string) {
	const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.floor(hours / 24)}d`;
}
