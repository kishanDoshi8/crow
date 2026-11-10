# Crow roadmap

Working list for planning sessions. Newest decisions win; update this file
when priorities change. Last updated 2026-11-10.

Notes for whoever picks this up: the member cap is `rooms.member_limit`
(default 50), changed only in the database. Monday job progress is in
`private.weekly_job_runs`; run `select private.run_weekly_jobs()` to retry by
hand.

## Now

**Bulk create and close** is built, waiting to be released: write a set of
predictions in one form and close several at once, each with its own
outcome. A set can share an event (e.g. the match). One push per room for a
set, and now also when several lock together or hit the 1-hour reminder.
Release: apply migration `20261119090000_bulk_predictions.sql` first (it
works with the previous frontend), then tag.

## Next

4. **Templates** (low/medium, in phases). Design and open decisions in
   [templates-and-fixtures.md](templates-and-fixtures.md). First: starter
   templates ("Match: A vs B", A / Draw / B) and "Repeat this event" on the
   set form. Then saved room templates, a series default with its cast,
   a whole round at once, and score entry when closing.
5. **Profile page** (medium). Stats across rooms, titles, account
   settings and deletion. Later: add friends and view their profiles.

## Later (in this order)

6. **New prediction types**: closest number wins, exact score. Needs
   design and decisions first.
7. **Free-text comments** with report, hide and mute.
8. **Chat**, then **members suggesting predictions** through it.
9. **Collectible phrases and titles** (e.g. a title unlocks a bragging
   phrase, possibly with an expiry).
10. **Automatic fixtures and results** from a sports data feed, as an
    option alongside custom questions. Builds on templates (a feed fills a
    template's blanks and start time) and on events and bulk close
    (results arrive as proposed outcomes to confirm). Needs template
    phases 1, 2 and 4 first; provider, cost and licence to settle. Notes
    in [templates-and-fixtures.md](templates-and-fixtures.md).
11. **Play Store listing** (Android app wrapping the PWA, Google TWA).

Groundwork to lay alongside 7–8: **reporting rooms and members**.

## Done or dropped

- Done: fairness fixes, join confirmation, member removal and return,
  account deletion request, error reporting, performance pass, schema
  folders, Terms and Privacy, prediction page redesign, room talk
  (reactions and phrases), What's Hot cleanup, share nudge for staff,
  offline mode, scheduled predictions, copy/duplicate predictions, no open
  predictions limit, desktop layout, 1-hour closing reminder (scheduled
  by hand in production), Explore with public/private rooms, join
  requests and a 50-member cap (operator-set), account sheet on the home
  screen, Monday job split per series with logged, hourly retries.
- Dropped: targeted "nudge people who haven't picked" push; room vs room
  challenges.

## Positioning (from a look at similar apps, Nov 2026)

- Rivals are either sports-fixture predictors (Superbru, World Cup 2026
  apps: invite-code groups, live leaderboards, last-man-standing modes)
  or market-style play-money apps (Manifold, Called It, Auracle).
- Sleeper's engagement comes from chat on almost every screen.
- Crow's angle: any question a friend group cares about, with seasons,
  titles, room talk and organizer tools, and no money. Biggest gaps vs
  rivals: organizer effort (items 4, 10) and in-app conversation (7, 8).
