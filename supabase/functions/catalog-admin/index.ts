// /admin's calls that need a provider's API, with the key kept here:
// searching CricketData.org for a series to add. Signed-in platform admins
// only (checked with their own session, like every admin RPC).
//
// Body: {"action": "search_series", "query": "India"}
// Secrets: CRICKETDATA_API_KEY. Requests go through the database
// (provider_http_get), which CricketData.org answers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { relayThroughDatabase, searchSeries } from "../sync-fixtures/providers/cricketdata.ts";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
	if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

	const supabaseUrl = Deno.env.get("SUPABASE_URL");
	const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
	const authorization = req.headers.get("Authorization");
	if (!supabaseUrl || !anonKey || !authorization) return json({ error: "Unauthorized" }, 401);

	// As the caller: the RPC answers from their own session.
	const supabase = createClient(supabaseUrl, anonKey, {
		global: { headers: { Authorization: authorization } },
	});
	const { data: isAdmin, error } = await supabase.rpc("get_my_platform_admin");
	if (error || isAdmin !== true) return json({ error: "Only platform admins can do this" }, 403);

	// CricketData.org only answers the database's HTTP client, which the
	// relay functions reach with the service key (never sent to the browser).
	const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	if (!serviceRoleKey) return json({ error: "Missing Supabase configuration" }, 500);
	relayThroughDatabase(createClient(supabaseUrl, serviceRoleKey));

	let body: { action?: string; query?: string };
	try {
		body = await req.json();
	} catch {
		return json({ error: "Send a JSON body" }, 400);
	}

	if (body.action === "search_series") {
		const query = (body.query ?? "").trim();
		if (query.length < 2) return json({ error: "Search for at least 2 letters" }, 400);
		try {
			return json({ series: await searchSeries(query) });
		} catch (cause) {
			return json({ error: cause instanceof Error ? cause.message : String(cause) }, 502);
		}
	}

	return json({ error: "Unknown action" }, 400);
});
