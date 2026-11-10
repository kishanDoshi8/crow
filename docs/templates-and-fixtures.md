# Templates and fixtures: design notes

Status: proposal, nothing here is built yet. It builds on what shipped with
bulk create and close (Nov 2026): a set of predictions can share an **event**
(`prediction_events`, e.g. "Arsenal vs Chelsea"), is created by one call
(`create_predictions`) and closed by one call (`resolve_predictions`), with
one push each.

## The idea in one line

A template is a reusable list of questions with blanks. Filling the blanks
for one event gives a ready-made set, which the organizer checks and
submits through the set form that already exists.

## Why this works for any kind of room

A template knows nothing about football, cricket or TV. It only has:

- **Slots**: the blanks, each with a label. A match has two ("Home",
  "Away"); an episode has none; a race has one ("Grand Prix").
- **Questions**: title, options and details, any of which can use a slot.
  `Who wins: {home} vs {away}?` with options `{home}` / `Draw` / `{away}`.
- **Timing**: when the set goes live and locks, relative to when the event
  starts ("live 24h before, locks at the start").

So "which kind of room" is just "which templates it has", from three places:

1. **Starters** that come with the app: Match (with a draw), Match (no
   draw), Yes/No round, Pick the winner (race, award, elimination).
2. **Room templates**: any past event saved as a template ("Save as
   template" on a set, or "Repeat this event" which fills the form from the
   last one). Most organizers never author a template; they reuse what they
   already ran.
3. **A series default**: a series can name its template and its **cast**
   (the teams, drivers or contestants in it). Then slots are tapped from
   the cast instead of typed, and "pick one of the cast" questions fill
   their own options.

## Data

- `prediction_templates`: `room_id` (null for starters), `name`, `slots`
  (json), `questions` (json: title, options, details, each option with an
  optional `key`), `timing` (json).
- `prediction_events` gains `starts_at`, `template_id`, `slot_values`, and
  later `external_ref` for a fixture from a feed.
- `prediction_options.key` (optional, e.g. `home`, `draw`, `away`, `yes`,
  `over`): what an option means, independent of its label. Not needed to
  play; it is what lets a score entry or a results feed pick winners.

## Phases

1. **Starters and "Repeat this event"** (small, no new tables): the set
   form gets a "Start from" row; picking Match asks for the two names and
   fills the questions. Repeat copies the last event's questions.
2. **Room templates, series default and cast** (medium): the tables above,
   "Save as template", the cast list on a series.
3. **A whole round at once**: a grid of rows (home, away, start time) times
   one template makes several events in one submit.
4. **Result entry**: on Close several, an event made from a keyed template
   takes a score ("2-1") and picks the winners for every keyed question;
   the organizer still confirms.

## Decisions needed

- Should members see the event name on each prediction (a small line above
  the question, grouping on Home)? Today it shows to staff and in pushes
  only, so questions must still read on their own.
- Options are capped at 6. "Pick one of the cast" (20 drivers) needs a
  higher cap, or "top 5 + anyone else". Ties in with roadmap item 6.
- Can a resolver use templates, or organizers only?
- One go-live time for a round, or each match live N hours before its own
  start (one push per match)?

## Fixtures and results from a feed (roadmap item 10)

Templates are the bridge: a feed supplies the slots and the start time, a
template supplies the questions.

- **Link a series to a competition** (e.g. Premier League 2026/27) and a
  template. A scheduled edge function pulls fixtures into
  `prediction_events` with `external_ref`.
- **Fixtures arrive as suggestions** in Needs you ("5 fixtures this
  weekend: add all"). A series can opt into adding them automatically.
- **Results arrive as proposals**: Close several opens with winners
  already picked from the score, for the organizer to confirm. Auto-close
  after a grace period is a per-series opt-in. Postponed or abandoned
  fixtures propose "call off".
- **Custom questions stay first class**: an event can mix keyed questions
  (settled by the feed) and the organizer's own ("Will the manager get
  booked?"), which stay manual. The feed never touches a question without
  keys.
- To settle before building: which sports first, the provider (cost,
  licence terms for a free app, rate limits), and what happens when a feed
  and an organizer disagree (the organizer wins; corrections already
  exist).
