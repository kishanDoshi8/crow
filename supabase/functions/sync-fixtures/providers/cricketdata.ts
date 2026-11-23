// CricketData.org (CricAPI v1, https://cricketdata.org). Free plan: 100
// calls a day, counted per request. A series' list (series_info) carries its
// matches but not their results, so results come from match_info, one call
// per played match, only for matches rooms have questions on (the database
// decides which: get_fixture_result_targets). Key: CRICKETDATA_API_KEY.
//
// Field names follow CricAPI v1 as documented in 2024-26 (series, series_info,
// match_info). Check them against a real response when the key is set up:
// everything read from the API goes through the helpers below.
import type { CatalogFixture, CricketResult, FixtureStatus, ProviderAdapter } from "../types.ts";

const API = "https://api.cricapi.com/v1";
// Calls kept back each day, so a manual Sync or search still works.
const RESERVE = 5;

type TeamInfo = { name?: string; shortname?: string };

export type CricMatch = {
	id: string;
	name?: string;
	matchType?: string;
	status?: string;
	venue?: string;
	date?: string;
	dateTimeGMT?: string;
	teams?: string[];
	teamInfo?: TeamInfo[];
	score?: { r?: number; w?: number; o?: number; inning?: string }[];
	tossWinner?: string;
	tossChoice?: string;
	matchWinner?: string;
	matchStarted?: boolean;
	matchEnded?: boolean;
};

export type CricSeries = {
	id: string;
	name: string;
	startDate?: string;
	endDate?: string;
	startdate?: string;
	enddate?: string;
	odi?: number;
	t20?: number;
	test?: number;
	matches?: number;
};

type Envelope<T> = {
	status?: string;
	reason?: string;
	data?: T;
	info?: { hitsToday?: number; hitsLimit?: number };
};

// The key travels in the query string (CricAPI's only option), so it must
// never reach an error message: those are shown in /admin and logged.
function redact(text: string, key: string) {
	return text.replaceAll(key, "***").replace(/apikey=[^&\s)"']+/gi, "apikey=***");
}

// Why a connection failed, in a few words and without the request's URL.
function connectionReason(cause: unknown) {
	const text = cause instanceof Error ? cause.message : String(cause);
	if (/reset by peer|os error 104/i.test(text)) return "the connection was reset by CricketData.org";
	if (/timed? ?out/i.test(text)) return "the request timed out";
	if (/dns|lookup|not known/i.test(text)) return "its address couldn't be found";
	if (/certificate|tls|ssl|handshake/i.test(text)) return "the secure connection failed";
	return "the connection failed";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// CricketData.org resets connections from the edge runtime's TLS client but
// answers the database's (pg_net). With a service-role client set here,
// requests go through the database: provider_http_get queues one,
// provider_http_response reads (and deletes) the reply.
type RpcClient = {
	rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
let relay: RpcClient | null = null;

export function relayThroughDatabase(client: RpcClient) {
	relay = client;
}

type Reply = { status: number; body: string };

async function getThroughDatabase(client: RpcClient, url: string): Promise<Reply> {
	const { data: requestId, error } = await client.rpc("provider_http_get", { p_url: url });
	if (error) throw new Error(`relay: ${error.message}`);
	// pg_net sends it within a second or so; its own timeout is 15 seconds.
	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline) {
		await sleep(400);
		const { data, error: readError } = await client.rpc("provider_http_response", { p_request_id: requestId });
		if (readError) throw new Error(`relay: ${readError.message}`);
		const reply = data as { done: boolean; status: number | null; body: string | null; error: string | null; timed_out: boolean };
		if (!reply.done) continue;
		if (reply.timed_out) throw new Error("timed out");
		if (reply.error || reply.status === null) throw new Error(reply.error ?? "no reply");
		return { status: reply.status, body: reply.body ?? "" };
	}
	throw new Error("timed out");
}

async function getDirect(url: string): Promise<Reply> {
	const response = await fetch(url, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(15_000),
	});
	return { status: response.status, body: await response.text() };
}

export async function cricApi<T>(path: string, params: Record<string, string>) {
	const key = Deno.env.get("CRICKETDATA_API_KEY");
	if (!key) throw new Error("CRICKETDATA_API_KEY is not set");
	const url = `${API}/${path}?${new URLSearchParams({ apikey: key, ...params })}`;

	// A dropped connection is retried twice, a second apart then two. A
	// connection that fails before any reply costs no call.
	let response: Reply | null = null;
	let lastError: unknown = null;
	for (let attempt = 0; attempt < 3 && !response; attempt++) {
		if (attempt > 0) await sleep(1000 * attempt);
		try {
			response = relay ? await getThroughDatabase(relay, url) : await getDirect(url);
		} catch (cause) {
			lastError = cause;
			console.error(`CricketData.org ${path}, attempt ${attempt + 1}: ${redact(String(cause), key)}`);
		}
	}
	if (!response) {
		throw new Error(`Couldn't reach CricketData.org (${path}): ${connectionReason(lastError)}. Try again in a minute.`);
	}

	if (response.status < 200 || response.status >= 300) {
		const text = redact(response.body, key).slice(0, 200);
		throw new Error(`CricketData.org ${path}: ${response.status} ${text}`);
	}
	let body: Envelope<T>;
	try {
		body = JSON.parse(response.body) as Envelope<T>;
	} catch {
		throw new Error(`CricketData.org ${path}: the reply wasn't JSON`);
	}
	if (body.status && body.status !== "success") {
		throw new Error(`CricketData.org ${path}: ${redact(String(body.reason ?? body.status), key)}`);
	}
	return { data: body.data as T, hitsToday: body.info?.hitsToday, hitsLimit: body.info?.hitsLimit };
}

const FORMATS: Record<string, "test" | "odi" | "t20"> = { test: "test", odi: "odi", t20: "t20", t20i: "t20" };

// "2026-12-02T22:00:00" (no zone, but GMT) → ISO in UTC.
function kickoff(match: CricMatch) {
	const raw = match.dateTimeGMT ?? match.date;
	if (!raw) return null;
	return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`).toISOString();
}

// A long name ("Royal Challengers Bengaluru") reads better as its short one.
function shortName(name: string, info?: TeamInfo) {
	return name.length > 16 && info?.shortname ? info.shortname : name;
}

const isUnknownTeam = (name?: string) => !name || /^tb[ac]$/i.test(name.trim());

function statusOf(match: CricMatch): FixtureStatus {
	const text = match.status ?? "";
	if (match.matchEnded) {
		return /no result|abandon/i.test(text) ? "abandoned" : "finished";
	}
	if (/abandon/i.test(text)) return "abandoned";
	if (/postpone/i.test(text)) return "postponed";
	if (/cancel/i.test(text)) return "cancelled";
	return match.matchStarted ? "live" : "scheduled";
}

function resultOf(match: CricMatch, detailed: boolean): CricketResult | null {
	const teams = match.teams ?? [];
	const text = match.status ?? "";
	const side = (name?: string) => {
		if (!name) return null;
		const n = name.trim().toLowerCase();
		if (teams[0]?.trim().toLowerCase() === n) return "home" as const;
		if (teams[1]?.trim().toLowerCase() === n) return "away" as const;
		return null;
	};
	const noResult = /no result|abandon/i.test(text);
	if (!match.matchEnded && !noResult && !match.tossWinner) return null;

	const winner: CricketResult["winner"] = noResult
		? "no_result"
		: /drawn/i.test(text)
			? "draw"
			: side(match.matchWinner) ??
				// "India won by 5 wkts" when matchWinner is missing.
				side(/^(.*?) won\b/i.exec(text)?.[1]) ??
				(/tied/i.test(text) ? "tie" : null);

	const choice = (match.tossChoice ?? "").toLowerCase();
	return {
		winner: match.matchEnded || noResult ? winner : null,
		toss_winner: side(match.tossWinner),
		toss_choice: /bat/.test(choice) ? "bat" : /bowl|field/.test(choice) ? "bowl" : null,
		innings: (match.score ?? []).map((inning) => ({
			team: side(teams.find((t) => inning.inning?.toLowerCase().startsWith(t.toLowerCase()))),
			runs: inning.r ?? 0,
			wickets: inning.w ?? 0,
			overs: inning.o ?? 0,
		})),
		status_text: text,
		detailed,
	};
}

// The match's own name from the provider's long one, which comes in two
// shapes: "1st Test, India tour of New Zealand, 2026" and "Afghanistan A vs
// Hong Kong, China, 9th Match, Group A, ACC Mens Asia Cup Rising Stars 2026"
// (team names can hold commas). → "1st Test", "9th Match, Group A".
const MATCH_NAME =
	/^(\d+(st|nd|rd|th)\s+(match|test|odi|t20i?|unofficial test)|final|semi[- ]?final.*|quarter[- ]?final.*|qualifier.*|eliminator|play-?off.*|super (four|six|eight|8|6|4).*)$/i;

export function matchLabel(name?: string) {
	const parts = (name ?? "").split(",").map((part) => part.trim());
	const index = parts.findIndex((part) => MATCH_NAME.test(part));
	if (index < 0) return null;
	const group = /^group\s+\w+$/i.test(parts[index + 1] ?? "") ? `, ${parts[index + 1]}` : "";
	return `${parts[index]}${group}`;
}

// One provider match in the catalog's shape, or null for a format Crow has
// no questions for (T10, first-class...).
// `detailed`: from match_info, which carries the toss and innings (a series
// list carries only the status).
export function toCatalogFixture(match: CricMatch, season: string, detailed = false): CatalogFixture | null {
	const format = FORMATS[(match.matchType ?? "").toLowerCase()];
	const at = kickoff(match);
	if (!format || !at) return null;
	const [home, away] = match.teams ?? [];
	// Team info is matched by name: its order isn't guaranteed to follow teams.
	const team = (name: string | undefined) =>
		isUnknownTeam(name)
			? null
			: {
					provider_ref: name!.trim(),
					name: name!.trim(),
					short_name: shortName(name!.trim(), match.teamInfo?.find((t) => t.name?.trim() === name!.trim())),
				};
	const roundLabel =
		format === "test" ? "Tests" : format === "odi" ? "ODIs" : /t20i/i.test(match.name ?? "") ? "T20Is" : "T20s";
	const status = statusOf(match);

	return {
		provider_ref: match.id,
		kickoff_at: at,
		status,
		season,
		matchday: null,
		round_label: roundLabel,
		stage_kind: "league",
		match_format: format,
		label: matchLabel(match.name),
		venue: match.venue?.trim() || null,
		home: team(home),
		away: team(away),
		result: status === "scheduled" ? null : resultOf(match, detailed),
	};
}

// "2026-12-02" and "2027-01-20" → "2026/27"; one year → "2026".
function seasonOf(start?: string, end?: string) {
	const a = /^\d{4}/.exec(start ?? "")?.[0];
	const b = /^\d{4}/.exec(end ?? "")?.[0];
	if (!a) return "";
	return b && b !== a ? `${a}/${b.slice(2)}` : a;
}

function checkBudget(hitsToday?: number, hitsLimit?: number) {
	if (hitsToday !== undefined && hitsLimit !== undefined && hitsToday >= hitsLimit - RESERVE) {
		throw new Error(`CricketData.org daily limit nearly used (${hitsToday} of ${hitsLimit})`);
	}
}

export const cricketData: ProviderAdapter = {
	// A series list costs a call: twice a day is plenty for fixtures.
	minHoursBetweenSyncs: 12,

	async fetchFixtures(seriesId) {
		const { data, hitsToday, hitsLimit } = await cricApi<{ info?: CricSeries; matchList?: CricMatch[] }>(
			"series_info",
			{ id: seriesId },
		);
		checkBudget(hitsToday, hitsLimit);
		const info = data?.info;
		const season = seasonOf(info?.startdate ?? info?.startDate, info?.enddate ?? info?.endDate);
		const fixtures = (data?.matchList ?? [])
			.map((match) => toCatalogFixture(match, season))
			.filter((fixture): fixture is CatalogFixture => fixture !== null);
		return { season, fixtures };
	},

	async fetchResults(_seriesId, matchIds) {
		const fixtures: CatalogFixture[] = [];
		for (const id of matchIds) {
			const { data, hitsToday, hitsLimit } = await cricApi<CricMatch>("match_info", { id });
			const fixture = data ? toCatalogFixture(data, "", true) : null;
			if (fixture) fixtures.push(fixture);
			// Stop before the day's calls run out; the rest wait for tomorrow.
			if (hitsToday !== undefined && hitsLimit !== undefined && hitsToday >= hitsLimit - RESERVE) break;
		}
		return fixtures;
	},
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// The series list gives "2026-10-24" as a start but "Nov 10" as an end: the
// end takes the start's year, or the next one when it's an earlier month
// (a tour from December to January).
export function isoDate(value?: string, after?: string | null): string | null {
	if (!value) return null;
	if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
	const match = /^([a-z]{3})[a-z]*\s+(\d{1,2})$/i.exec(value.trim());
	if (!match || !after) return null;
	const month = MONTHS.indexOf(match[1].toLowerCase());
	if (month < 0) return null;
	let year = Number(after.slice(0, 4));
	if (month + 1 < Number(after.slice(5, 7))) year += 1;
	return `${year}-${String(month + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

// For the /admin search: the provider's series matching a name, with a
// guess at how Browse should group each one.
export async function searchSeries(query: string) {
	const { data } = await cricApi<CricSeries[]>("series", { offset: "0", search: query });
	return (data ?? []).map((series) => {
		const tour = /^(.+?) tour of (.+?)(?:,|\s\d{4}|$)/i.exec(series.name);
		const kind = tour
			? "tour"
			: /league|ipl|big bash|bbl|psl|cpl|sa20|the hundred|ilt20|mlc/i.test(series.name)
				? "league"
				: /cup|trophy|championship|world/i.test(series.name)
					? "cup"
					: "tour";
		const startsOn = isoDate(series.startDate ?? series.startdate);
		return {
			provider: "cricketdata",
			provider_ref: series.id,
			name: series.name,
			kind,
			region: tour ? `${tour[2].trim()} and ${tour[1].trim()}` : null,
			starts_on: startsOn,
			ends_on: isoDate(series.endDate ?? series.enddate, startsOn),
			tests: series.test ?? 0,
			odis: series.odi ?? 0,
			t20s: series.t20 ?? 0,
			matches: series.matches ?? 0,
		};
	});
}
