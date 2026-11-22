// Syncs fixtures for every active competition in catalog.competitions from
// its provider (docs/event-packs.md), or only one provider's when the body
// is {"provider": "football-data"}. Called by the sync-fixtures cron job
// (private.request_fixture_sync) with the service key and x-sync-secret.
// To run it by hand:
//   curl -X POST "$SUPABASE_URL/functions/v1/sync-fixtures" \
//     -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "x-sync-secret: $SECRET"
//
// Secrets: FIXTURE_SYNC_SECRET, FOOTBALL_DATA_API_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { footballData } from "./providers/football-data.ts";
import type { ProviderAdapter } from "./types.ts";

// One adapter per provider; catalog.competitions.provider picks it.
const ADAPTERS: Record<string, ProviderAdapter> = {
	"football-data": footballData,
};

type Target = { provider: string; provider_ref: string; name: string };

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});

Deno.serve(async (req) => {
	if (req.method !== "POST") {
		return json({ error: "Method not allowed" }, 405);
	}

	const secret = Deno.env.get("FIXTURE_SYNC_SECRET");
	if (!secret || req.headers.get("x-sync-secret") !== secret) {
		return json({ error: "Unauthorized" }, 401);
	}

	const supabaseUrl = Deno.env.get("SUPABASE_URL");
	const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	if (!supabaseUrl || !serviceRoleKey) {
		return json({ error: "Missing Supabase configuration" }, 500);
	}
	const supabase = createClient(supabaseUrl, serviceRoleKey);

	const { data: targets, error } = await supabase.rpc(
		"get_fixture_sync_targets",
	);
	if (error) {
		return json({ error: error.message }, 500);
	}

	// Optional: only this provider's competitions (Sync in /admin).
	let onlyProvider: string | null = null;
	try {
		const body = (await req.json()) as { provider?: unknown };
		if (typeof body?.provider === "string") onlyProvider = body.provider;
	} catch {
		// No body: sync everything.
	}

	const results: unknown[] = [];
	let failed = 0;

	// One competition at a time: free tiers limit calls per minute.
	const chosen = ((targets ?? []) as Target[]).filter(
		(target) => !onlyProvider || target.provider === onlyProvider,
	);
	for (const target of chosen) {
		const adapter = ADAPTERS[target.provider];
		if (!adapter) {
			failed++;
			results.push({ competition: target.name, error: `No adapter for ${target.provider}` });
			continue;
		}

		try {
			const { season, fixtures } = await adapter.fetchFixtures(target.provider_ref);
			const { data, error: syncError } = await supabase.rpc(
				"sync_competition_fixtures",
				{
					p_provider: target.provider,
					p_provider_ref: target.provider_ref,
					p_season: season,
					p_fixtures: fixtures,
				},
			);
			if (syncError) throw new Error(syncError.message);
			results.push(data);
		} catch (cause) {
			failed++;
			const message = cause instanceof Error ? cause.message : String(cause);
			console.error(`sync-fixtures ${target.name}: ${message}`);
			results.push({ competition: target.name, error: message });
			// Shown in /admin until a sync of it works again.
			await supabase.rpc("record_fixture_sync_error", {
				p_provider: target.provider,
				p_provider_ref: target.provider_ref,
				p_message: message,
			});
		}
	}

	return json({ results }, failed > 0 ? 502 : 200);
});
