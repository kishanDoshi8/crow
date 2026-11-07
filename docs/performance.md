# Performance

How the web app stays quick to open and smooth to use, and what to keep in
mind when changing it.

## Opening the app

- **Saved query cache** (`shared/lib/queryPersistence.ts`). The TanStack
  Query cache is saved to `localStorage`, so reopening the app shows the last
  rooms, standings and predictions immediately while fresh data loads. It's
  restored during auth start-up, before any page renders, and only for the
  same signed-in user (`crow.queryCacheOwner`); a different user starts
  empty. It expires after a day and on every deploy (`buster` is the build
  id), so a change in data shape never meets old data.
- **Data stays fresh for 30 seconds** (`staleTime` in `AppProviders`).
  Realtime events and mutations invalidate what changes, so moving between
  pages doesn't refetch everything.

## Downloads

- **Vendor chunks** (`manualChunks` in `vite.config.ts`): React and the
  router, Supabase, TanStack Query and the UI libraries each get a chunk that
  rarely changes, so after a deploy returning players only download the
  app's own code (~110 KB gzipped instead of ~345 KB).
- **Animation features load later**: elements use `m.*` inside
  `<LazyMotion strict>`; the features (`shared/lib/motionFeatures.ts`) arrive
  as their own chunk after start-up. Use `m.div`, never `motion.div`
  (strict mode throws), and don't add framer-motion to `manualChunks`.
- **On-demand libraries**: `html-to-image` loads when a share sheet opens;
  date-fns only ships with the prediction form's date picker. Deadlines are
  formatted with `Intl` (`shared/lib/deadline.ts`).
- **Room pages prefetch**: once a room is open, the code for its other pages
  (new prediction, members, settings, series) downloads in idle time
  (`app/router/roomPages.ts`), skipped when the browser asks to save data.

Check sizes with `ANALYZE=true npm run build` (writes `dist/stats.html`).

## Realtime

`useRoomRealtime` listens to `predictions`, `room_members` and
`room_activities` for the open room. A result touches many rows at once, so
events are batched: each kind of refresh runs once, 250 ms after the first
event. After a reconnect everything catches up, since events sent while the
socket was down are lost.

Only publish a table for realtime (`supabase/schemas/_final/publications.sql`)
when a client subscribes to it: every published change costs the database
work, delivered or not.

## Database

Scheduled jobs that look across all rooms (auto-lock every minute, reminders)
use `idx_predictions_open_deadline`, a partial index on `deadline` for draft
and locked predictions.
