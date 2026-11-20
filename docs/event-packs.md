# Event packs: research and design

Status: **proposal**, November 2026. Nothing here is built yet. Decisions
still open are marked ⚑.

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

**Yes, but not a separate app.** The jobs above need a person for:

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

## 10. Open decisions ⚑

1. Launch competitions: Premier League + Champions League only, or the free-tier set (adds La Liga, Serie A, Bundesliga, Ligue 1...)?
2. Picks close at kickoff, or 5 minutes before?
3. A host edits a pack question: detach it, or only allow wording changes?
4. Auto-reveal for soccer from day one (phase 2), or admin-confirmed for the first month?
5. Who is a platform admin: just you, or a small team?
