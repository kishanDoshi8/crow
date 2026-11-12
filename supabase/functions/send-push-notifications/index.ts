import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import webpush from "npm:web-push@3.6.7";

type NotificationEventType =
	| "prediction_live"
	| "prediction_locked"
	| "deadline_1h"
	| "result_revealed"
	| "weekly_points_claim"
	| "result_needed"
	| "join_request"
	| "member_joined"
	| "join_accepted";

const EVENT_TO_COLUMN: Record<NotificationEventType, string> = {
	prediction_live: "prediction_live",
	prediction_locked: "prediction_locked",
	deadline_1h: "deadline_1h",
	result_revealed: "result_revealed",
	weekly_points_claim: "weekly_points_claim",
	result_needed: "result_needed",
	// Staff alerts share the "Result needed" setting; a "you're in" follows
	// the room's general new-activity setting.
	join_request: "result_needed",
	member_joined: "result_needed",
	join_accepted: "prediction_live",
};

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type, x-notification-secret",
};
// How long a push service keeps trying a phone that is asleep or offline.
// A minute (the old value) dropped most pushes to idle phones.
const DELIVERY: Record<
	NotificationEventType,
	{ ttl: number; urgency: "normal" | "high" }
> = {
	prediction_live: { ttl: 6 * 3600, urgency: "normal" },
	prediction_locked: { ttl: 2 * 3600, urgency: "normal" },
	deadline_1h: { ttl: 3600, urgency: "high" },
	result_revealed: { ttl: 12 * 3600, urgency: "normal" },
	weekly_points_claim: { ttl: 24 * 3600, urgency: "normal" },
	result_needed: { ttl: 12 * 3600, urgency: "high" },
	join_request: { ttl: 24 * 3600, urgency: "normal" },
	member_joined: { ttl: 24 * 3600, urgency: "normal" },
	join_accepted: { ttl: 24 * 3600, urgency: "normal" },
};
// Keeps .in() filters well under URL length limits in big rooms.
const ID_BATCH_SIZE = 150;
// Endpoints that will never work again: gone, or made for another VAPID key.
const DEAD_ENDPOINT_STATUSES = new Set([403, 404, 410]);

function chunk<T>(items: T[], size: number) {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}

type RequestBody = {
	event_type: NotificationEventType;
	/**
	 * When provided by a privileged backend call, limits the broadcast to
	 * players who are members of this room (and have the preference enabled).
	 */
	room_id?: string;
	payload?: {
		title?: string;
		body?: string;
		url?: string;
		/** With room_id: only members with one of these roles, e.g. staff. */
		roles?: string[];
		/** With room_id, privileged only: just this player (a member of it). */
		target_player_id?: string;
		[key: string]: unknown;
	};
	target_player_token?: string;
};

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}

function getStatusCode(error: unknown) {
	if (typeof error !== "object" || error === null) return undefined;
	if (!("statusCode" in error)) return undefined;

	const value = (error as { statusCode?: number }).statusCode;
	return typeof value === "number" ? value : undefined;
}

function getBearerToken(req: Request) {
	const authorization = req.headers.get("authorization")?.trim();
	if (!authorization) return null;

	const match = authorization.match(/^Bearer\s+(.+)$/i);
	const token = match?.[1]?.trim();
	return token || null;
}

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") {
		return new Response("ok", { headers: corsHeaders });
	}
	if (req.method !== "POST") {
		return jsonResponse({ error: "Method not allowed." }, 405);
	}

	const supabaseUrl = Deno.env.get("SUPABASE_URL");
	const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	const vapidPublicKey = Deno.env.get("WEB_PUSH_PUBLIC_KEY");
	const vapidPrivateKey = Deno.env.get("WEB_PUSH_PRIVATE_KEY");
	const vapidSubject = Deno.env.get("WEB_PUSH_SUBJECT");

	if (
		!supabaseUrl ||
		!serviceRoleKey ||
		!vapidPublicKey ||
		!vapidPrivateKey ||
		!vapidSubject
	) {
		return jsonResponse(
			{ error: "Missing required environment variables." },
			500,
		);
	}

	const supabase = createClient(supabaseUrl, serviceRoleKey);

	webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

	let body: RequestBody;
	try {
		body = (await req.json()) as RequestBody;
	} catch {
		return jsonResponse({ error: "Invalid JSON body." }, 400);
	}

	const eventType = body.event_type;
	const preferenceColumn = EVENT_TO_COLUMN[eventType];
	if (!preferenceColumn) {
		return jsonResponse({ error: "Invalid event_type." }, 400);
	}

	const configuredSecret = Deno.env.get("NOTIFICATION_FUNCTION_SECRET");
	const providedSecret = req.headers.get("x-notification-secret");
	const isPrivilegedRequest =
		!!configuredSecret && providedSecret === configuredSecret;

	let targetPlayerId: string | null = null;
	if (body.target_player_token) {
		const { data: player, error: playerError } = await supabase
			.from("players")
			.select("id")
			.eq("player_token", body.target_player_token)
			.maybeSingle();

		if (playerError) {
			return jsonResponse(
				{ error: "Failed to resolve target user.", detail: playerError.message },
				500,
			);
		}

		if (!player) {
			return jsonResponse({ error: "Invalid target player token." }, 401);
		}

		targetPlayerId = player.id;
	}

	if (!isPrivilegedRequest && !targetPlayerId) {
		const bearerToken = getBearerToken(req);
		if (!bearerToken) {
			return jsonResponse(
				{
					error:
						"Unauthorized. Use x-notification-secret for broadcast calls or authenticate for self-test.",
				},
				401,
			);
		}

		const {
			data: { user },
			error: authError,
		} = await supabase.auth.getUser(bearerToken);
		if (authError) {
			return jsonResponse({ error: "Unauthorized. Invalid auth token." }, 401);
		}

		if (!user) {
			return jsonResponse({ error: "Unauthorized. User not found." }, 401);
		}

		const { data: player, error: playerError } = await supabase
			.from("players")
			.select("id")
			.eq("user_id", user.id)
			.maybeSingle();

		if (playerError) {
			return jsonResponse(
				{
					error: "Failed to retrieve player profile.",
					detail: playerError.message,
				},
				500,
			);
		}

		if (!player) {
			return jsonResponse({ error: "Player profile not found." }, 404);
		}

		targetPlayerId = player.id;
	}

	// Who could get this push: one player, a room's members, or (for a
	// privileged broadcast with no room) every player with preferences.
	let candidateIds: string[] | null = null;
	let overrideRoomId: string | null = null;

	if (targetPlayerId) {
		candidateIds = [targetPlayerId];
	} else if (isPrivilegedRequest && body.room_id) {
		let memberQuery = supabase
			.from("room_members")
			.select("player_id")
			.eq("room_id", body.room_id);
		const onlyPlayer = body.payload?.target_player_id;
		if (typeof onlyPlayer === "string" && onlyPlayer) {
			memberQuery = memberQuery.eq("player_id", onlyPlayer);
		}
		const roles = body.payload?.roles;
		if (Array.isArray(roles) && roles.length > 0) {
			memberQuery = memberQuery.in("role", roles);
		}
		const { data: memberRows, error: memberError } = await memberQuery;

		if (memberError) {
			return jsonResponse(
				{
					error: "Failed to fetch room members.",
					detail: memberError.message,
				},
				500,
			);
		}

		candidateIds = [
			...new Set(
				(memberRows ?? [])
					.map((r) => r.player_id)
					.filter((id): id is string => id != null),
			),
		];
		overrideRoomId = body.room_id;
	}

	if (candidateIds?.length === 0) {
		return jsonResponse({
			sent_count: 0,
			failed_count: 0,
			pruned_count: 0,
			target_count: 0,
		});
	}

	// The selected column is only known at runtime, so the rows are untyped.
	type PreferenceRow = { player_id: string } & Record<string, unknown>;

	// Each player's default for this event. A player with no preferences row
	// gets the defaults (every event on) instead of nothing.
	const defaults = new Map<string, boolean>();
	const preferenceBatches = candidateIds ? chunk(candidateIds, ID_BATCH_SIZE) : [null];
	for (const ids of preferenceBatches) {
		let query = supabase
			.from("player_preferences")
			.select(`player_id, ${preferenceColumn}`);
		if (ids) query = query.in("player_id", ids);
		const { data, error } = await query;

		if (error) {
			return jsonResponse(
				{
					error: "Failed to fetch notification preferences.",
					detail: error.message,
				},
				500,
			);
		}

		for (const row of (data ?? []) as unknown as PreferenceRow[]) {
			defaults.set(row.player_id, row[preferenceColumn] !== false);
		}
	}

	// A room's own setting (Notifications > This room) wins over the default.
	const roomOverrides = new Map<string, boolean | null>();
	if (overrideRoomId && candidateIds) {
		for (const ids of chunk(candidateIds, ID_BATCH_SIZE)) {
			const { data, error } = await supabase
				.from("room_preferences")
				.select(`player_id, ${preferenceColumn}`)
				.eq("room_id", overrideRoomId)
				.in("player_id", ids);

			if (error) {
				return jsonResponse(
					{
						error: "Failed to fetch room notification preferences.",
						detail: error.message,
					},
					500,
				);
			}

			for (const row of (data ?? []) as unknown as PreferenceRow[]) {
				const value = row[preferenceColumn];
				roomOverrides.set(row.player_id, typeof value === "boolean" ? value : null);
			}
		}
	}

	const playerIds = (candidateIds ?? [...defaults.keys()]).filter((id) => {
		const override = roomOverrides.get(id) ?? null;
		return override ?? defaults.get(id) ?? true;
	});
	if (playerIds.length === 0) {
		return jsonResponse({
			sent_count: 0,
			failed_count: 0,
			pruned_count: 0,
			target_count: 0,
		});
	}

	const subscriptions: Array<{ id: string; user_id: string; subscription: unknown }> = [];
	for (const ids of chunk(playerIds, ID_BATCH_SIZE)) {
		const { data, error } = await supabase
			.from("user_push_subscriptions")
			.select("id, user_id, subscription")
			.in("user_id", ids);

		if (error) {
			return jsonResponse(
				{
					error: "Failed to fetch push subscriptions.",
					detail: error.message,
				},
				500,
			);
		}

		subscriptions.push(...(data ?? []));
	}

	const payload = {
		title: body.payload?.title ?? "Crow",
		body: body.payload?.body ?? "You have a new update.",
		data: {
			event_type: eventType,
			url: body.payload?.url ?? "/",
			...body.payload,
		},
	};

	let sentCount = 0;
	let failedCount = 0;
	const staleSubscriptionIds: string[] = [];

	const delivery = DELIVERY[eventType];

	await Promise.all(
		subscriptions.map(async (row) => {
			try {
				await webpush.sendNotification(
					row.subscription as unknown as Record<string, unknown>,
					JSON.stringify(payload),
					{
						TTL: delivery.ttl,
						urgency: delivery.urgency,
					},
				);
				sentCount += 1;
			} catch (error) {
				failedCount += 1;
				const statusCode = getStatusCode(error);

				const endpoint = (row.subscription as { endpoint?: string })?.endpoint;
				console.error("Push failed", {
					event_type: eventType,
					status: statusCode ?? null,
					host: endpoint ? new URL(endpoint).host : null,
					user_id: row.user_id,
				});

				if (statusCode !== undefined && DEAD_ENDPOINT_STATUSES.has(statusCode)) {
					staleSubscriptionIds.push(row.id);
				}
			}
		}),
	);

	let prunedCount = 0;
	if (staleSubscriptionIds.length > 0) {
		const { error: deleteError, count } = await supabase
			.from("user_push_subscriptions")
			.delete({ count: "exact" })
			.in("id", staleSubscriptionIds);

		if (deleteError) {
			console.error("Failed to prune dead push subscriptions", deleteError.message);
		} else {
			prunedCount = count ?? 0;
		}
	}

	return jsonResponse({
		sent_count: sentCount,
		failed_count: failedCount,
		pruned_count: prunedCount,
		target_count: subscriptions.length,
	});
});
