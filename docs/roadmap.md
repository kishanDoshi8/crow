# Crow roadmap

Working list for planning sessions. Newest decisions win; update this file
when priorities change. Last updated 2026-11-10.

## Now

1. **Explore, public/private rooms, join requests** (designing)
   - Two room settings, owner-controlled:
     - **Listed in Explore** (public) or not (private). Private rooms never
       appear in Explore; they're reached by invite link or code only.
     - **Who can join**: anyone with the link/code joins straight away, or
       join requests need approval. Both apply to public and private rooms.
   - Owners and organizers accept or reject requests (Members & roles).
   - **Member cap on every room**: a hard limit, changeable only by the
     operator (database/codebase), never in the app. Default 50.
   - Explore lives on the home screen next to Your rooms / Join / Create,
     and in the room switcher.
   - Existing rooms start private, with instant joins (no change for them).
2. **Sign out / delete account from the home screen.** People with no
   rooms are stuck there today: add an account button with sign out and
   delete account (same as the room menu).
3. **Monday job: safe retry.** The weekly snapshot, top-ups and recap run
   as one batch, so one failure may skip every room's top-up. Make each
   room's work independent and idempotent, retry failures, and log them.

## Next

4. **Templates and bulk create** (low/medium). "Match: A vs B" template
   (A / Draw / B), add a whole round at once, with scheduling.
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
    option alongside custom questions.
11. **Play Store listing** (Android app wrapping the PWA, Google TWA).

Groundwork to lay alongside 7–8: **reporting rooms and members**.

## Done or dropped

- Done: fairness fixes, join confirmation, member removal and return,
  account deletion request, error reporting, performance pass, schema
  folders, Terms and Privacy, prediction page redesign, room talk
  (reactions and phrases), What's Hot cleanup, share nudge for staff,
  offline mode, scheduled predictions, copy/duplicate predictions, no open
  predictions limit, desktop layout, 1-hour closing reminder (scheduled
  by hand in production).
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
