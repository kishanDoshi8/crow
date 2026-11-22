// Syncs fixtures for every active competition in catalog.competitions from
// its provider (docs/event-packs.md), or only one provider's when the body
// is {"provider": "football-data"} (Sync in /admin, which also skips the
// provider's pacing). Then, for providers whose season list carries no
// results (CricketData.org), fetches the played matches the database says
// are due, one by one. Called by the sync-fixtures cron job
// (private.request_fixture_sync) with the service key and x-sync-secret.
// To run it by hand:
//   curl -X POST "$SUPABASE_URL/functions/v1/sync-fixtures" \
//     -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "x-sync-secret: $SECRET"
//
// Secrets: FIXTURE_SYNC_SECRET, FOOTBALL_DATA_API_KEY, CRICKETDATA_API_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { cricketData } from "./providers/cricketdata.ts";
import { footballData } from "./providers/football-data.ts";
import type { ProviderAdapter } from "./types.ts";

// One adapter per provider; catalog.competitions.provider picks it.
const ADAPTERS: Record<string, ProviderAdapter> = {
	"football-data": footballData,
	cricketdata: cricketData,
};

type Target = { provider: string; provider_ref: string; name: string; synced_at: string | null };
type ResultTarget = { competition_ref: string; provider_ref: string };

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

		// Paced providers (call limits) sync their lists only every few hours,
		// unless an admin asked for this provider.
		const hours = adapter.minHoursBetweenSyncs;
		if (
			hours &&
			!onlyProvider &&
			target.synced_at &&
			Date.now() - new Date(target.synced_at).getTime() < hours * 3_600_000
		) {
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

	// Results, match by match, for providers that need it.
	const providers = [...new Set(chosen.map((target) => target.provider))];
	for (const provider of providers) {
		const adapter = ADAPTERS[provider];
		if (!adapter?.fetchResults) continue;
		const { data: due, error: dueError } = await supabase.rpc("get_fixture_result_targets", {
			p_provider: provider,
		});
		if (dueError) {
			failed++;
			results.push({ provider, error: dueError.message });
			continue;
		}
		const byCompetition = new Map<string, string[]>();
		for (const row of (due ?? []) as ResultTarget[]) {
			byCompetition.set(row.competition_ref, [...(byCompetition.get(row.competition_ref) ?? []), row.provider_ref]);
		}
		for (const [competitionRef, matchRefs] of byCompetition) {
			try {
				const fixtures = await adapter.fetchResults(competitionRef, matchRefs);
				const { data, error: syncError } = await supabase.rpc("sync_competition_fixtures", {
					p_provider: provider,
					p_provider_ref: competitionRef,
					p_season: "",
					p_fixtures: fixtures,
					p_partial: true,
				});
				if (syncError) throw new Error(syncError.message);
				results.push({ results: data });
			} catch (cause) {
				failed++;
				const message = cause instanceof Error ? cause.message : String(cause);
				console.error(`sync-fixtures results ${provider} ${competitionRef}: ${message}`);
				results.push({ provider, competition: competitionRef, error: message });
				await supabase.rpc("record_fixture_sync_error", {
					p_provider: provider,
					p_provider_ref: competitionRef,
					p_message: `Results: ${message}`,
				});
			}
		}
	}

	return json({ results }, failed > 0 ? 502 : 200);
});
