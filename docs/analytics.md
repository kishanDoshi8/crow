# Analytics: how to check how Crow is doing

Phase 0: the minimum to answer "are rooms working?" before and around
launch. Everything lives in our own Supabase database. There are no
third-party trackers and no dashboards to log into: you read it with SQL in
the Supabase SQL editor.

## Where to look

1. Open the Supabase dashboard → the Crow project → **SQL editor**.
2. Paste a query from below and run it. Save the ones you use often with
   **Save** (they show under "Private" in the sidebar).

The views live in the `analytics` schema. The app and the API can't read
them; only the dashboard (and anyone with the database password) can.

## The five numbers that matter

| Number | Where | Healthy early on |
|---|---|---|
| **Room activation**: rooms with 4+ players and a revealed result within 7 days | `analytics.room_cohorts` → `activated_pct` | 40%+ |
| **Week-4 rooms**: rooms still picking in days 22-28 | `analytics.room_cohorts` → `playing_week_4_pct` | 40%+ (below this, fix retention before promoting) |
| **First pick**: new players who pick within a day | `analytics.first_picks` → `picked_day_1_pct` | 60%+ (most arrive through an invite to a room with open questions) |
| **Weekly active players**: anyone who picked that week | `analytics.weekly` → `active_players` | Going up, week on week |
| **Landing conversion**: visitors who tap Start a room or Join | `analytics.landing_funnel` → `clicked / visitors` | 10%+ |

The "healthy" column is a starting guess for a friend-group game, not a
benchmark. What matters most is the trend.

## Daily: a quick look (1 minute)

```sql
select * from analytics.daily limit 14;
```

One row per day for the last 90 days, newest first:

| Column | Meaning |
|---|---|
| `landing_visitors` | Distinct visitors to the landing page (`/welcome`, and `/` when signed out) |
| `landing_clicks` | Of those, how many tapped Start a room or Join with a code |
| `new_players` | Accounts that picked a username |
| `new_rooms` | Rooms created (Crow team rooms left out) |
| `new_questions` | Questions that went live |
| `picks` / `pickers` | Picks made, and how many different players made them |
| `results_revealed` | Questions revealed with a winner |

## Weekly: the review (10 minutes, Mondays)

```sql
-- Who's playing
select * from analytics.weekly limit 8;

-- Did the rooms created each week take off?
select * from analytics.room_cohorts limit 8;

-- Do new players make a first pick?
select * from analytics.first_picks limit 8;

-- Where landing visitors come from, and whether they sign up
select * from analytics.landing_funnel limit 20;
```

`room_cohorts.playing_week_4_pct` stays empty until a cohort's week 4 has
passed, so the latest four weeks show blanks. That's expected.

## Looking at rooms one by one

```sql
-- Newest rooms and how their first week went
select name, created_at::date, players_now, players_day_7, picks_day_7,
       results_day_7, activated, playing_week_4, last_pick_at::date
from analytics.room_health
order by created_at desc
limit 30;

-- Rooms that stalled: created a week+ ago, never activated
select name, created_at::date, players_day_7, picks_day_7, results_day_7
from analytics.room_health
where not activated and created_at < now() - interval '7 days'
order by created_at desc;

-- Rooms that went quiet: played before, no pick in 14 days
select name, players_now, last_pick_at::date
from analytics.room_health
where last_pick_at < now() - interval '14 days'
order by last_pick_at desc;
```

The stalled list is the most useful one before launch. For each room, ask
what went wrong: too few friends joined (`players_day_7`), the host never
posted (`picks_day_7` = 0), or nobody revealed a result (`results_day_7` = 0).

## Tracking where visitors come from

Add `?ref=` to any link you post, and the landing funnel groups visitors by
it:

| Posting on | Use |
|---|---|
| Reddit | `https://playcrow.app/?ref=reddit` |
| Discord | `https://playcrow.app/?ref=discord` |
| X / Threads | `https://playcrow.app/?ref=x` |
| A specific post or partner | `https://playcrow.app/?ref=r-soccer-nov` |

`?utm_source=` works too. Keep values short, lowercase, letters and dashes.
A visitor keeps their first source, even if they come back later from
somewhere else.

Joins from invites and share cards are tracked separately, on the
membership. See [sharing-stats.md](sharing-stats.md).

## What's recorded, exactly

Most numbers come straight from the app's own tables (players, rooms, room
members, questions, picks), so nothing extra is collected for them. The only
new data is `public.app_events`, written through `public.log_app_event`:

| Event | When |
|---|---|
| `landing_view` | The landing page opens (once per visitor per 30 minutes) |
| `landing_start_room` | A signed-out visitor taps Start a room |
| `landing_join` | A signed-out visitor taps Join with a code |
| `landing_video_sound` | A visitor turns on the sound of the launch video in the hero (once per 10 seconds) |
| `landing_demo_pick` | A visitor picked an option in the example question. The question was replaced by the launch video in November 2026; the name stays accepted so old rows still count |
| `account_created` | Someone picks their username (creates their player) |

Each row has a random `visitor_id` from the browser's local storage, the
`player_id` if signed in, the `source` (`?ref=`/`?utm_source=`) and the
`path`. There are no IP addresses, no cookies and no third parties, and
browsers that send "Do Not Track" are skipped. The privacy policy describes
this under "Visits".

`log_app_event` is the only database function signed-out visitors can call
(`supabase/tests/security_hardening.sql` checks this). It accepts only the
six names above, caps text length, drops repeats and never raises an error.

### Raw events, if you need them

```sql
select name, count(*), count(distinct visitor_id) as visitors, max(created_at)
from public.app_events
where created_at > now() - interval '7 days'
group by name
order by 2 desc;
```

## Leaving out the Crow team

Rooms owned by anyone in `public.platform_admins` are left out of the room
numbers, so test rooms don't skew them. Add yourself (and anyone testing):

```sql
insert into public.platform_admins (player_id, note)
select id, 'me' from public.players where username = 'your-username';
```

Players and picks from team members still count in `daily`, `weekly` and
`first_picks`. That's fine at small scale; filter them out if it starts to
matter.

## Adding a metric later

- If the data is already in a table (a new feature's rows), add a view in
  `supabase/schemas/analytics/views/metrics.sql` and a migration. No app change.
- If it only happens in the browser (a tap, a page view), add a name to the
  list in `app_events` and `log_app_event`, to `AppEvent` in
  `apps/web/src/shared/lib/analytics.ts`, and call `track()`. Update the
  table above and the privacy policy if it's a new kind of data.
- Prefer measuring from tables. Every browser event is one more thing to
  keep honest in the privacy policy.
