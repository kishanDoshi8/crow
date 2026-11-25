# Event packs: research and design

Status: **phases 1 and 2 built**, November 2026 (see §11 and §12). Decisions are in §10;
⚑ marks where one was open.

Event packs let a host connect a room to a real competition (Premier League,
Champions League, IPL...) and add ready-made questions for each match in a
tap. Crow fills in the results from a sports data feed, or our team does it
by hand where no feed is good enough. The host's own questions stay
first-class: packs are a head start, not a replacement.

---

## 1. Goals and non-goals

**Goals**

- A host goes from "we're doing the Premier League" to a week of questions in
  under a minute, every week.
- Results reveal themselves for pack questions, so hosts stop chasing scores.
- Soccer first, cricket second (IPL and internationals).
- One wrong result from a feed can be fixed once, for every room.

**Non-goals (for now)**

- Live scores, in-play questions, player stats (scorers, cards, corners). They
  need expensive live feeds and add little to a pick-before-kickoff game.
- Odds or anything that looks like a bookmaker (see `apps/web/VOICE.md`).
- Templates the host customises (no draw option, custom thresholds). Later.

---

## 2. What data we actually need

Crow locks picks before kickoff and reveals after the final whistle, so we
need far less than a betting or live-score app:

| Need | When | Freshness |
|---|---|---|
| Competitions and teams | Once a season | Days |
| Fixtures: teams, kickoff time, stage (league / knockout round) | Daily | Hours |
| Kickoff changes and postponements | Daily, plus a check a few hours before | Hours |
| Final result: score, half-time score, winner incl. extra time / penalties; for cricket, winner, toss, "no result" | After the match | 15-60 min delay is fine |

No live feed is needed. Delayed scores on free tiers are fine for us. Our
call volume is tiny: a fixtures sync per competition per day, plus a few
result checks per match. That's tens of calls a day, not thousands.

---

## 3. Data providers

Researched November 2026 through public pages and reviews. The provider
sites were not reachable from the research session, so **check prices and
terms on each provider's own pages before signing up.**

### Soccer

| Provider | Free tier | Paid | Notes |
|---|---|---|---|
| **football-data.org** | 12 major competitions (top European leagues, Champions League, usually World Cup / Euros), 10 calls/min, delayed scores | From about €12/month for more competitions and faster scores | Simple, stable v4 REST API, built for hobby projects. Covers exactly the competitions we'd launch with. Commercial-use terms need checking (their general terms date from 2018). |
| **API-Football (api-sports)** | 100 calls/day, all endpoints | Pro about $19/month (7,500/day), Ultra about $29 (75,000/day) | 1,000+ leagues, so it's the step up for wider coverage (MLS, A-League, Indian Super League...). Unconfirmed whether the free plan includes the current season; check on the dashboard. |
| **Sportmonks** | 14-day trial, small free plan | From about €29/month for a handful of leagues; pricing is per league selected | High quality, the most expensive per league. Also sells cricket, so one vendor could cover both. |
| **TheSportsDB** | Free key, limited results per call, no live data | About $9/month (Patreon) | Community-maintained. Fine for logos/metadata, too loose for results we auto-reveal on. |

**Recommendation:** start on **football-data.org's free tier** for the
launch competitions (Premier League, Champions League, the big European
leagues, World Cup). Put every provider behind an adapter (§6), so moving to
API-Football later is a config change. Pay for a plan before Crow charges
money or once we need leagues outside the free list.

### Cricket

| Provider | Free tier | Paid | Notes |
|---|---|---|---|
| **CricketData.org (ex-CricAPI)** | 100 calls/day, all features | $5.99/month (2,000/day) up to $64.99 (unlimited) | Cheapest. Covers IPL, internationals and big leagues. Data quality is decent, not bulletproof. |
| **Sportmonks Cricket** | Trial | From about €29/month for the major leagues tier (includes IPL) | Better quality and the same vendor as soccer if we go that way. |
| **Roanuz, EntitySport, Sportradar** | No | Quote only / INR pricing | Enterprise, fantasy-league grade. Overkill for now. |

**Recommendation:** **CricketData.org** for fixtures, plus **a person
confirming every cricket result** in the admin screen until we trust the feed
(see §7). Cricket has rain, DLS (Duckworth-Lewis-Stern) targets, super overs
and abandoned matches. A wrong auto-reveal is worse than a late one.

### Rights and branding

- Fixture lists (dates, teams, kickoff) are facts. EU and UK courts held in
  *Football Dataco v Yahoo* (CJEU, 2012) that fixture lists aren't protected
  by database copyright, and Football DataCo stopped charging licence fees
  for them. The **provider's terms of service still bind us**, so read them
  for commercial use and attribution.
- **No club crests, league logos or official marks.** Team and competition
  names as plain text only ("Arsenal vs Spurs", "Premier League"). Crests are
  trademarks. The existing option colours do the visual work.
- Never say "official", and don't imitate a league's look.

---

## 4. How it works for a host

1. **Follow a competition.** In room settings (or from the empty "No
   questions yet" state): "Follow a competition" → Premier League 2026/27.
   A room can follow several.
2. **See what's coming up.** A new "Fixtures" view in Manage lists upcoming
   matches for the followed competitions, grouped by matchweek or day. Each
   match shows 3-5 suggested questions.
3. **Add the ones you want.** Tap to add one, or "Add all for this
   matchweek". They become normal questions in the active series, picks
   close at kickoff (or a few minutes before ⚑), and they go live now or on
   a schedule the host picks. This reuses the existing set flow and
   `prediction_events`, so players get one notification per match.
4. **Results arrive.** After the match, Crow reveals pack questions in every
   room that added them ("Revealed by Crow"). The host can still Fix result,
   as today.
5. **Later (phase 3): auto-add.** "Add *Who wins?* to every Premier League
   match automatically." This is the zero-effort room and probably the
   biggest win for retention. It's also the riskiest for spamming rooms, so
   it comes after the manual flow has proven itself.

### Why follow at the room level, not the series level

Rooms outlive series. A room that starts a new series each month (your
monthly-series example) or each matchweek keeps following the Premier League,
and the fixtures view always adds to whichever series is active. Linking per
series would make hosts re-link every month and break auto-add.

---

## 5. Question templates

Each sport has a small catalogue of templates. A template has wording, its
options, which stages it applies to, and a **resolver**: a function from the
fixture's final result to the winning option. Only templates the result data
can settle are allowed.

### Soccer (launch set)

| Template | Options | Resolver uses | Stages |
|---|---|---|---|
| Who wins {home} vs {away}? (90 minutes) | {home} / Draw / {away} | full-time score | league, group |
| Who goes through, {home} or {away}? | {home} / {away} | winner incl. extra time and penalties | knockout |
| Both teams to score? | Yes / No | full-time score | all |
| Three or more goals? | Yes / No | full-time score | all |
| Clean sheet for {home}? | Yes / No | full-time score | all |
| More goals in which half? | First / Second / Same | half-time and full-time score | all |
| Does it go to penalties? | Yes / No | duration | knockout |

- **Knockout matches never get a three-way "Who wins?" question.** "Who goes
  through?" replaces it. That's why the stage is part of the fixture, and
  why the draw question is handled now rather than waiting for templates.
- **Wording follows VOICE.md:** "Three or more goals?" not "Over 2.5 goals"
  (that's bookmaker language). "(90 minutes)" is spelled out because extra
  time is exactly where disputes start.
- **Exact score** is popular but has too many options for the current UI.
  Leave it for later, or offer score buckets.

### Cricket (launch set)

| Template | Options | Resolver uses |
|---|---|---|
| Who wins {home} vs {away}? | {home} / {away} | result winner (super over counts) |
| Who wins the toss? | {home} / {away} | toss winner |
| Does the team batting first win? | Yes / No | toss decision and winner |

A cricket "no result" or abandoned match → every pack question for it ends
with **No result** (everyone gets points back). That outcome already exists.

### Per-match extras by our team

The admin screen can add one-off questions to a fixture ("Will Haaland
score?", "Kohli fifty?"). These have no automatic resolver; our team sets
the result. This is how IPL nights get spicy questions without paying for a
player-stats feed.

---

## 6. Architecture

```
provider APIs ──► sync edge function (cron) ──► catalog.* tables ──► fixtures view (hosts)
                                                    │
                                admin screen ───────┤  (manual results, fixes, extras)
                                                    ▼
                                  resolve job ──► room predictions linked to catalog questions
```

### Tables (new `catalog` schema, readable by signed-in users, writable only by the server and platform admins)

- `catalog.competitions`: sport, name, season, format (league / knockout / mixed), provider + provider ref, `active`.
- `catalog.teams`: sport, name, short name, provider ref.
- `catalog.fixtures`: competition, home, away, stage, `kickoff_at`, status
  (`scheduled`, `postponed`, `live`, `finished`, `abandoned`, `cancelled`),
  `result jsonb` (scores, half-time, winner, decided_by, toss...),
  `result_source` (`provider` / `manual`), `result_confirmed_at`,
  `result_confirmed_by`.
- `catalog.question_templates`: sport, key, wording pattern, options
  pattern, stages, resolver key, default on/off, order.
- `catalog.fixture_questions`: one row per fixture × template, plus manual
  extras. Holds the outcome once known (winning option key, or no result).
  Rows exist up front so admins can edit or hide a question per match.
- `public.room_competitions`: room ↔ competition (follow).
- `predictions.fixture_question_id` (nullable) and
  `prediction_options.option_key`: the link back, so a resolved
  `fixture_question` can find every room question made from it and its
  winning option.

### Jobs

- **Fixture sync** (daily per active competition, plus once a few hours
  before each matchday). Upserts teams and fixtures by provider ref. When a
  kickoff time moves, it moves the deadline of linked room questions that
  are still open. Postponed with no new date → open questions stay open with
  a note, and an admin decides.
- **Result sync** (every 15 min, but only for fixtures between kickoff+100
  min and kickoff+6 h that aren't confirmed). Writes `result`, runs the
  resolvers into `fixture_questions`.
- **Confirmation step.** Soccer from a trusted provider: auto-confirm 30 min
  after full time, if status is final and the score hasn't changed between
  two reads. Cricket and manual extras: an admin confirms.
- **Resolve job.** For each newly confirmed `fixture_question`, reveal every
  linked room question that's locked, as the system (`resolved_by` null,
  shown as "Revealed by Crow"), reusing `resolve_predictions` so pushes stay
  one per room. If a room already revealed it by hand, leave it alone.
- **Global fix.** An admin correcting a confirmed result re-runs the resolve
  job through `correct_prediction_result`, so every room gets the same fix
  and the same Activity entry.

All of it runs on Supabase: pg_cron calls an edge function, and the provider
API key lives in edge-function secrets. Provider adapters are one file each
(`football-data`, `api-football`, `cricketdata`), mapping to the catalog
shape. Nothing provider-specific leaks into the tables beyond `provider_ref`.

---

## 7. Platform admin: do we need a management app?

**Yes, as `/admin` in the web app (built in phase 2, §12).** The jobs above need a person for:

- choosing which competitions are live,
- confirming cricket results and setting results for manual extras,
- fixing a feed mistake once for every room,
- hiding a bad suggested question or adding a per-match extra,
- seeing what's stuck ("12 fixtures finished, 3 unconfirmed").

Build it as an **`/admin` route in the existing web app**: lazy-loaded so
players never download it, and gated by a `platform_admins` table checked in
RLS and in every admin RPC, not just in the UI. A separate app means a second
deploy, auth setup and design system to maintain for a team of one or two.
Until the screen exists, Supabase Studio plus a few SQL functions cover it.

Minimum admin screens, in order:

1. **Results queue:** finished fixtures awaiting confirmation, with the
   feed's result, one-tap Confirm, or Edit then Confirm.
2. **Fixture editor:** fix teams or kickoff, mark postponed/abandoned, add an
   extra question, hide a suggested one.
3. **Competitions:** turn on or off, trigger a sync.

---

## 8. Risks and critique

- **A wrong auto-reveal hits every room at once.** This is the main risk.
  The mitigations: confirmation delay and stable-read check, admin
  confirmation for cricket, one global fix, and hosts can still Fix result.
  Start with auto-reveal **on for soccer, off for cricket**.
- **Rooms feel generic.** If every room asks the same three questions, the
  group in-jokes disappear. Keep the fixtures view as suggestions next to
  "Write your own", cap suggestions at 3-5 per match, and keep manual extras.
- **Hosts edit a pack question.** If a host changes the options, the link
  must break (the question becomes a normal one, revealed by hand), or Crow
  would reveal the wrong option. Allow wording tweaks only, or detach on
  edit ⚑.
- **Late kickoffs and stale times.** Lock picks a few minutes before the
  stored kickoff, and re-sync kickoff times on matchday. Otherwise someone
  picks after the first goal.
- **Feed outages.** Results arrive late, nothing breaks: questions stay
  locked and the existing "Result needed" reminder still nudges hosts, who
  can reveal by hand.
- **Free-tier terms.** Fine while Crow is free. Budget about €12-30/month per
  sport before charging money or running ads.
- **Scope creep into player stats.** Resist. Manual extras cover the fun
  ones for big nights.

---

## 9. Phases

| Phase | What | Rough size |
|---|---|---|
| 0 | Sign up and test football-data.org and CricketData.org keys; confirm terms; pick launch competitions | Small |
| 1 | Catalog tables, soccer adapter, fixture sync, follow a competition, fixtures view with add/add-all (manual reveal still) | Medium |
| 2 | Resolvers, result sync, confirmation, auto-reveal for soccer, minimal `/admin` results queue | Medium |
| 3 | Cricket adapter with admin-confirmed results, manual extras | Medium |
| 4 | Auto-add rules per room, host-customised templates (no draw, thresholds) | Medium |

Phase 1 is useful on its own: even with hosts revealing by hand, picking
matches from a list instead of typing them is most of the saving.

---

## 10. Decisions

1. **Launch competitions:** Premier League and Champions League only, from football-data.org.
2. **Picks close at kickoff** for now.
3. **A host edits a pack question:** it's detached. Changing the question or
   options clears `predictions.fixture_question_id` (and the options'
   `option_key`), so it becomes a normal question. Changing only the deadline
   keeps the link, but kickoff changes then leave that deadline alone.
4. **No auto-reveal.** An admin confirms every result in `/admin` before Crow
   reveals it. Confirming reveals straight away in every room; a room that
   already revealed by hand keeps its result. Auto-confirm can come later.
5. **Platform admins:** a small team (two people today), in the
   `public.platform_admins` table (added by hand in SQL). `/admin` stays a
   route in the web app, not a separate app.

---

## 11. Phase 1: what's built

- **Catalog** (`supabase/schemas/catalog`): `catalog.competitions`, `teams`,
  `fixtures`, `question_templates`, `fixture_questions`, plus
  `public.room_competitions`. App users can't read the catalog directly;
  everything goes through RPCs. Competitions and soccer templates are seeded
  by migration `20261125090000_event_packs.sql`.
- **Sync:** `supabase/functions/sync-fixtures` (adapter
  `providers/football-data.ts`) → `public.sync_competition_fixtures`. Runs every
  3 hours (cron `sync-fixtures`). Two-legged ties: the earlier game is a
  `first_leg` (three-way "Who wins?"), the later one asks "Who goes through?".
  When a kickoff moves, open room questions whose deadline was the old kickoff
  move with it. Finished scores are stored in `fixtures.result` but nothing
  reads them yet.
- **Rooms:** Manage → Fixtures (`/rooms/:code/manage/fixtures`), also linked
  from the empty Home card. Organizers follow competitions, tick questions for
  the next two weeks' matches and add them to an active series in one go
  (`add_fixture_questions`): one event per match, tagged with the competition,
  closing at kickoff, one push for the lot. Results are revealed by hand.
- **Not yet:** postponed matches with no new date just lock at the old
  kickoff (hosts mark them No result); "go live later" for fixture questions
  (the RPC takes `p_opens_at`, the page only adds live).

### Turning it on

1. Get a football-data.org key and set the edge function secrets:
   `FOOTBALL_DATA_API_KEY` and `FIXTURE_SYNC_SECRET` (any long random string).
2. Deploy: `supabase functions deploy sync-fixtures`.
3. Give the cron job the same secret:
   `insert into private.notification_config (key, value) values ('fixture_sync_secret', '<secret>');`
   (it reuses `supabase_url` and `service_role_key` from the push setup).
4. Run it once by hand instead of waiting up to 3 hours:
   `select private.request_fixture_sync();`

---

## 12. Phase 2: what's built

- **Platform admins:** `public.platform_admins` (player ids, added in SQL).
  Every admin RPC checks `private.is_platform_admin()`; the app shows "Crow
  admin" in the account and room menus only to admins.
- **Resolvers** (`private.fixture_question_outcome`): each template's
  `resolver` key turns the saved score into a suggested answer. "90 minutes"
  questions use the regular-time score; "Who goes through?" adds the first
  leg; finals and penalties use the shootout. Unclear cases suggest nothing.
- **Result sync:** every 15 minutes (`fixture-results` cron,
  `private.run_fixture_results`), while a match that rooms have questions on
  should be over but has no final score, it asks for a fixture sync.
- **`/admin` → Results:** played matches rooms have questions on. The admin
  checks the score (or types it, or marks the match called off), picks or
  accepts each answer and confirms (`admin_confirm_fixture`). Crow reveals
  every linked locked room question (`revealed_by_crow`, "Revealed by
  Crow"), one push per room. Questions that lock later (a host moved the
  deadline) are revealed by the 15-minute job.
- **Fix result:** confirming again with other answers fixes every room Crow
  revealed, through the same path as a host's Fix result. Rooms that
  revealed or fixed by hand, and finished series, are left alone.
- **`/admin` → Fixtures:** hide or show a match's question, reword it
  (`customized_at` keeps the wording through syncs), or reset it.
- **`/admin` → Competitions:** turn one on or off, and Sync now.
- **Not yet:** auto-confirm, cricket, one-off extra questions per match.
  (Cricket and extras came in phase 3; admin alerts in §15.)


---

## 13. Fixtures pages, reorganised (November 2026)

- **Hosts:** Manage → Fixtures lists the competitions the room follows (next
  match, this week's matches) and a search to follow more; Browse lists every
  competition by category; each competition has its own page with round chips
  (matchweeks, cup rounds), Hide added, open/close all, sticky day headers and
  matches that open and close (open by default while nothing is added).
- **Categories:** `catalog.competitions.kind` (league, cup, tour, season) and
  `region` drive Browse's groups: sport plus region, and "tours" per sport
  for competitions between two countries. Only football is live; cricket
  tours fit as they are (team against team, formats as rounds). Formula 1
  needs a field of participants per event instead of home and away: not
  designed yet.
- **Admin:** Results has a status strip and splits matches with no score
  yet from ones ready to confirm. Competitions are grouped by provider, each
  with its own Sync (`admin_request_fixture_sync(provider)`), and show the
  last failed sync (`last_sync_error`, reported by the edge function).
  Fixtures are per competition, laid out like the host page.

---

## 14. Phase 3: cricket (CricketData.org)

- **Adding a series:** /admin → Competitions → Add a cricket series searches
  CricketData.org through the `catalog-admin` edge function (it holds the
  key and checks the caller is a platform admin) and adds one with
  `admin_add_competition`: a tour (both countries as its region), a league or
  a cup, with its start and end dates. It leaves Browse the day after it ends
  and stops syncing a week later.
- **Matches:** each has a format (Test, ODI, T20), a label ("1st Test") and a
  venue. Round chips are the formats (Tests, ODIs, T20Is). Unknown teams
  ("Tbc") wait, like knockout draws.
- **Questions** (templates fit by `formats` as well as stage):
  Who wins (a draw only in Tests), who wins the toss and does the toss winner
  bat or bowl (both close 35 minutes before the start:
  `question_templates.close_minutes_before`), does the team batting first
  win (T20 and ODI), and a first-innings par score (160 in T20s, 300 in
  ODIs). Rain or an abandoned match suggests No result; a tie without a
  super over winner suggests nothing.
- **Extras:** admins write one-off questions per match (any sport) in /admin
  → Fixtures; their answers are picked when confirming.
- **Calls (free plan, 100 a day):** a series list syncs at most every 12
  hours (Sync in /admin forces it); results are fetched with one
  `match_info` call per played match that rooms have questions on, once it
  should be over, at most every 45 minutes for T20s, hourly for ODIs and
  every 6 hours for Tests (`private.fixture_result_due`). The adapter stops 5
  calls short of the day's limit.
- **To check once the key is live:** the adapter follows CricAPI v1's field
  names (`series_info.matchList`, `match_info.tossWinner`, `tossChoice`,
  `matchWinner`, `score[].inning`), which couldn't be verified from the
  build environment. Search for one series, add it, and compare a synced
  match with the API's own response.
- **Settling a match:** the series list carries the winner but not the toss
  or innings, so a cricket match counts as settled only once its own
  `match_info` (saved with `"detailed": true`) has been read after it ended;
  a later list sync never replaces that fuller result. Results are looked for
  up to three days after the start. Labels come from the match's own part of
  the provider's name ("9th Match"), and a long venue shortens to its city.
- **Score:** /admin shows it on one line like a football score, home side
  first as in the title ("72/3 (10.2) – 66/10 (21.3)", "312/10 & 245/6" in
  Tests), then the outcome and the toss
  (`apps/web/src/shared/lib/cricketScore.ts`).
- **For players (groundwork):** `get_prediction_match_result` returns a
  question's match and confirmed result (football score or cricket
  scoreboard) to anyone who can see the question; `getPredictionMatchResult`
  in `api.ts` calls it. Nothing shows it yet.
- **Not yet:** player questions from scorecards (paid data), auto-confirm.


---

## 15. What players see: tags and match results (November 2026)

- **Tags:** each question added from a pack is tagged with its
  competition's tag, so History can filter by it. A platform admin sets
  the tag in /admin → Competitions (Edit tag), or when adding a cricket
  series (suggested from the name: "Asia Cup 2026 (Sri Lanka and
  Pakistan)" → "Asia Cup 2026"). With no tag set it's the name when it fits
  24 characters, else the sport (`private.competition_tag`). Changing it
  retags the questions rooms already added that are still linked to the
  competition; a question a host edited keeps its tag.
- **Match result:** once an admin confirms a match, its questions show a
  Match result card under the result: the score (football: full time,
  half time, extra time and the shootout; cricket: each side's total and
  overs, the result in words and the toss), the round and the venue. A
  called-off match says so. The shared result card adds one line ("ARS
  2–2 CHE (2–4 pens)", "India won by 22 runs"). Nothing shows before the
  admin confirms, even if a host revealed earlier.
- **Archiving (/admin → Competitions):** the list shows current
  competitions first (leagues, then series newest first). Finished holds
  the ones that ended (their last day has passed) and the ones an admin
  archived. Archive switches a competition off and files it away; Restore
  brings it back, still off; turning one on, or adding it again, takes it
  out of the archive. Questions rooms already have still get their results.
  Fixtures in /admin lists only current ones.
- **Alerts for Crow admins:** the 15-minute results job
  (`private.send_admin_alerts`) pushes every platform admin when matches
  rooms have questions on are ready to confirm (a score is in, or the match
  was called off): one push per run, each match once, and one reminder if
  it's still waiting 6 hours later. A competition whose sync starts failing
  sends one push with the error (CricketData's daily limit shows up this
  way), and again only after a sync has worked. They open /admin, use the
  `admin_alert` push type, and follow each admin's "Result needed" setting,
  so an admin needs push turned on in the app to get them.
