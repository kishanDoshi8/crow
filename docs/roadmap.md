# Crow roadmap

Working list for planning sessions. Newest decisions win; update this file
when priorities change. Rewritten from scratch 2026-11-23. Items marked
**(proposed)** are suggestions still to be agreed.

Notes for whoever picks this up: the member cap is `rooms.member_limit`
(default 50), changed only in the database. Monday job progress is in
`private.weekly_job_runs`; run `select private.run_weekly_jobs()` to retry by
hand. How to read the numbers: [analytics.md](analytics.md).

## The goal right now: phase 0

**Get a few rooms running that aren't run by Crow admins.** Few people play
yet, so features that need a crowd (chat, comments, collectibles) wait.
Everything here is about a room owner who isn't us getting a room started,
keeping it going week to week, and us noticing when one gets stuck.

What counts as success **(proposed)**: 3 to 5 rooms owned by people outside
the Crow team, each with 4+ players and a revealed result every week for 4
weeks. That's the "week-4 rooms" number in `analytics.room_cohorts`.

## Now

**Bug fixes:**

1. When no series is running, a room showed its first series instead of
   the one that just finished. It now falls back to the series that
   finished most recently.
2. Series standings rank by net points (won minus put on settled picks),
   like the all-time table, with the wallet shown second. This also decides
   champions, podium trophies and the weekly "climbed N places" snapshots.
   Finished series keep their results.
3. The final standings share card shows each award as its own tile (icon,
   award, winner, value) instead of a row of hard-to-read pills. The podium
   and table show net points.

**Waiting to be released:**

- Room invites (#143): deploy the `send-push-notifications` edge function
  so invite pushes go out.
- Net points standings: migration `20261204090000_net_points_standings.sql`.

## Next: phase 0

1. **A walkthrough for room owners and hosts.** Today there's How to play
   for players and nothing for the person running a room. **(proposed)**
   A first-run checklist on the room's Home, for the owner and hosts only,
   that ticks itself off and goes away when done:
   - start a series
   - follow a competition and add the first questions (event packs)
   - invite at least 3 friends
   - turn on notifications

   Plus a short "How hosting works" guide next to How to play: what a
   series is, how results come in by themselves for event pack questions,
   and when you'd reveal a result yourself.
2. **Up next, reworked into a signal for the Crow team.** Built, waiting
   to be released (migration `20261206090000_up_next_rework.sql`). The room
   answers "What should we predict next?" like one of its questions: one
   pick each, from Crow's competitions (a few are suggested, the ones the
   room follows first) or something Crow doesn't have, typed in. It's asked
   near the top of Home while no series is running, and waits at the bottom
   while one is. Hosts see who picked what and start the next series from
   the favourite in one go (same points as the last series, following the
   competition, then on to its Fixtures). /admin → Up next lists what rooms
   ask for, things Crow doesn't have first. Later: drop the old
   `suggest_series` and `toggle_series_suggestion_vote` once every client
   has the new app.
3. **Alerts for Crow admins.** Built, waiting to be released (migration
   `20261208090000_admin_alerts.sql` and the `send-push-notifications`
   function). A push to every platform admin when match results are ready
   to confirm (one per 15-minute run, each match once, one reminder after 6
   hours), and when a competition starts failing to sync, which includes
   CricketData's daily limit running low.
4. **(proposed) Room health in /admin.** One page listing the rooms not run
   by Crow admins: players, last pick, open questions, results waiting on a
   host, and days since the last revealed result. The analytics views
   already have most of this, but only through the SQL editor. This is
   how the team notices a stuck room and reaches out.
5. **(proposed) A nudge for hosts of quiet rooms.** When a room has had no
   open questions for 5 days, one push to its hosts pointing to Fixtures.
   At most once a week, and hosts only. Players never get pushes about
   activity they haven't taken part in.

Not decided yet: how we find the first outside rooms (who we ask, and how
we hand a room over to its owner).

## Later (parked until the numbers say otherwise)

- **New question types:** closest number wins, exact score.
- **Collectible phrases and titles**, to be rethought. Current thinking:
  more phrases you can collect, earned through titles, instead of open
  comments. With free text, collectible phrases would lose their point.
- **Free-text comments and chat.** Not planned. Room talk (reactions and
  phrases) is barely used so far, which is expected with so few players.
  Look again when there's real use. Reporting rooms and members would have
  to come first.
- **Event packs phase 4:** rules that add questions automatically, and
  templates hosts can edit. Parked so hosts aren't buried in options; event
  packs as they are already do most of the work.
- **Profiles:** someone's public rooms on their profile.
- **Formula 1 and other sports** where each event has a field of entrants
  instead of a home and an away side.

## Done or dropped

- Done: fairness fixes, join confirmation, member removal and return,
  account deletion request, error reporting, performance pass, schema
  folders, Terms and Privacy, prediction page redesign, room talk
  (reactions and phrases), What's Hot cleanup, share nudge for staff,
  offline mode, scheduled predictions, copy/duplicate predictions, no open
  predictions limit, desktop layout, 1-hour closing reminder (scheduled
  by hand in production), Explore with public/private rooms, join
  requests and a 50-member cap (operator-set), account sheet on the home
  screen, Monday job split per series with logged, hourly retries, bulk
  create and close, event packs phases 1 to 3 (football with automatic
  results, cricket with admin-confirmed results, /admin), phase 0
  analytics, player profiles (yours with account settings and Delete
  account; others' over shared rooms with head to head; people you play
  with; room invites).
- Dropped: targeted "nudge people who haven't picked" push; room vs room
  challenges; **templates** (event packs run on templates and are enough;
  more options would overwhelm owners and hosts); **Play Store listing**
  (the PWA is enough for now).

## Positioning (from a look at similar apps, Nov 2026)

- Rivals are either sports-fixture predictors (Superbru, World Cup 2026
  apps: invite-code groups, live leaderboards, last-man-standing modes)
  or market-style play-money apps (Manifold, Called It, Auracle).
- Sleeper's engagement comes from chat on almost every screen.
- Crow's angle: any question a friend group cares about, with seasons,
  titles, room talk and organizer tools, and no money. Event packs closed
  most of the organizer-effort gap. In-app conversation is parked until
  there are enough players to need it.
