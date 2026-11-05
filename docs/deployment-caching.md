# Deploying without stale versions

How the app makes sure phones open the latest build, and the one-time server
change it needs.

## Why some phones kept showing an old version

nginx serves the built files with a `Last-Modified` date but no
`Cache-Control` header. Without that header, browsers guess how long a file
stays fresh: about 10% of its age. A build from three days ago could be reused
for roughly seven hours without asking the server, so opening the installed
app showed the old page and old bundles. A manual refresh always asks the
server, which is why refreshing fixed it every time.

Uninstalling the app or clearing its data on Android doesn't help, because the
installed app is a thin shell around Chrome. The cached files live in Chrome's
storage for the site.

## What the app does now

- **The service worker** (`apps/web/public/sw.js`) checks the page with the
  server every time the app opens. Unchanged pages cost a tiny "not modified"
  reply.
- **Each build has an ID.** It's the git commit plus the build time,
  published as `/version.json` and baked into the bundle (`apps/web/vite.config.ts`).
- **The app compares the two** (`apps/web/src/shared/lib/appUpdate.ts`): on start, whenever it comes
  back into view, and every 10 minutes while open.
  - **Just opened** (first 10 seconds, nothing tapped yet): it reloads into the
    new version silently, at most once per version.
  - **Already in use:** it shows "A new version of Verdict is ready" with a
    **Refresh** button.
- **If a deploy removed a code chunk** the open app still needed, the app
  reloads instead of showing an error.

## Server caching rules (nginx)

The steps above work on their own, but the headers stop the browser guessing
in the first place. They're part of the site config in
[`deploy/nginx/sites-available/kishandoshi.me`](../deploy/nginx/sites-available/kishandoshi.me):

- `index.html`, `sw.js`, `manifest.json` and `version.json`: `Cache-Control: no-cache`
  (always revalidate; a tiny 304 when unchanged).
- `/assets/` (hashed bundles): `public, max-age=31536000, immutable`.
- Other files from `public/` (icons, images): one day.

Setup and deploys: [server-setup.md](server-setup.md).

## Phones that already have an old copy

Once the new build is live, opening the app (or one refresh) picks up the new
page, and from then on it updates itself. If a phone still shows an old
version after that, clear Chrome's data for the site:

Chrome → Settings → Site settings → All sites → kishandoshi.me →
**Delete data & reset permissions**, then open the app again.

This also turns off push notifications on that phone; switch them back on from
the room menu.

## Rich invite links (`/i/<code>`)

Pasting `https://kishandoshi.me/i/F4C36D` into WhatsApp or iMessage shows
"Join Friday Crew on Verdict" and "5 friends playing · 2 predictions live ·
World Cup 2026" under the ticket image. Tapping it opens the room's join page.
Only the room's name and counts are shown, never member names or questions.

Chat apps don't run the app's JavaScript, so a small Supabase function
(`supabase/functions/invite-preview`) writes the preview. nginx sends only
link-preview crawlers (WhatsApp, iMessage, Telegram, ...) to it; people who tap
the link are redirected straight to the join page. All of this is free on the
current plans.

People are never shown the function's page: Supabase serves HTML from
functions with a strict security header (`Content-Security-Policy: default-src
'none'; sandbox`) that blocks its styles and its redirect, which showed up as a
white page with a single link.

1. **Apply the migration and deploy the function** (from the repo root on
   your computer or the server, logged in with the Supabase CLI):

   ```bash
   npm run db:migrate
   npx supabase functions deploy invite-preview --no-verify-jwt
   npx supabase secrets set APP_URL=https://kishandoshi.me
   ```

2. **The nginx rules** are already in the site config
   ([`deploy/nginx/sites-available/kishandoshi.me`](../deploy/nginx/sites-available/kishandoshi.me),
   the `location ^~ /i/` block) together with
   [`deploy/nginx/conf.d/verdict-invite-map.conf`](../deploy/nginx/conf.d/verdict-invite-map.conf),
   which tells crawlers apart from people. See [server-setup.md](server-setup.md).

3. **Check it** (use your room code):

   ```bash
   # People: an instant redirect to the join page
   curl -sI https://kishandoshi.me/i/F4C36D | grep -i -E "^HTTP|^location"
   # Chat apps: the room's preview
   curl -s -A "WhatsApp/2.24" https://kishandoshi.me/i/F4C36D | grep og:description
   ```

   The first should show `302` and `Location: .../rooms/F4C36D/join`; the
   second, the room's counts.

4. **Switch the app to short links.** Set the repository variable
   `VITE_SHORT_INVITE_LINKS` to `true` (GitHub → Settings → Secrets and
   variables → Actions → Variables), then deploy a new tag.

   Until this is set, invites and shared cards keep using the longer
   `/rooms/<code>/join` links, which work without the steps above.

The ticket image in the preview is `apps/web/public/og-image.jpg`. Its
source is `apps/web/og/invite-card.html`; regenerate it with
`node og/render.mjs` from `apps/web`.
