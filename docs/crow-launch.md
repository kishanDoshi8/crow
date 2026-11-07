# Crow launch checklist

Moving the app from Verdict at kishandoshi.me to Crow at playcrow.app. The
code is ready; this is everything outside it, in order. Supabase stays the
same project, so no data moves.

kishandoshi.me keeps serving the old Verdict build from the old droplet until
that droplet is shut down. Nothing is deployed there again.

## 1. Domain and server

- [ ] Buy `playcrow.app` (Cloudflare Registrar: at-cost renewals, DNS included).
- [ ] New Ubuntu 24.04 droplet, DNS records, certificate, deploy user and nginx:
      [server-setup.md](server-setup.md), steps 1 to 9.
- [ ] Rename the GitHub repository to `crow` (Settings → General → Repository
      name). GitHub redirects the old URLs; update your local clone with
      `git remote set-url origin git@github.com:kishanDoshi8/crow.git`.

## 2. Supabase

- [ ] **Auth → URL Configuration**: set **Site URL** to `https://playcrow.app`
      and add `https://playcrow.app/**` to **Redirect URLs**. Keep the
      kishandoshi.me entries while the old site is still up, so its sign-ins
      keep working; remove them when the old droplet goes.
- [ ] **Edge Function secrets** (Project Settings → Edge Functions, or the CLI):

      ```bash
      npx supabase secrets set APP_URL=https://playcrow.app
      ```

      If `WEB_PUSH_SUBJECT` is a `https://kishandoshi.me` address, change it too
      (a `mailto:` address can stay):

      ```bash
      npx supabase secrets set WEB_PUSH_SUBJECT=https://playcrow.app
      ```

- [ ] **Links in push notifications** (SQL editor):

      ```sql
      update private.notification_config set value = 'https://playcrow.app' where key = 'app_url';
      ```

      From then on, notification taps open playcrow.app, including for players
      still on the old site.
- [ ] **Redeploy both functions**, which now say Crow:

      ```bash
      npx supabase functions deploy invite-preview --no-verify-jwt
      ```

      ```bash
      npx supabase functions deploy send-push-notifications
      ```

- [ ] **Auth email templates** (Authentication → Emails): replace any
      "Verdict" in subjects and bodies with "Crow".

## 3. Google sign-in

In Google Cloud Console → APIs & Services (see [google-sign-in.md](google-sign-in.md)):

- [ ] **OAuth consent screen / Branding**: app name **Crow**, logo
      `apps/web/public/pwa-512x512.png`, add `playcrow.app` to authorized
      domains. Changing the name or logo can send the app back through
      Google's brand verification, which takes a few days; do it early.
- [ ] **Branding → App domain**: application home page
      `https://playcrow.app` (signed out it shows what Crow is, with links to
      both pages below), privacy policy `https://playcrow.app/privacy`, terms
      of service `https://playcrow.app/terms`. Support email
      `hello@playcrow.app`, so set up that mailbox or forwarding first.
- [ ] **Credentials → OAuth client**: add `https://playcrow.app` to authorized
      JavaScript origins. The redirect URI (Supabase's callback) doesn't change.

## 4. GitHub

- [ ] Repository variables and `production` environment values from
      [server-setup.md](server-setup.md), step 9. `APP_URL` becomes
      `https://playcrow.app`.

## 5. Launch

- [ ] Set `CROW_LAUNCH_DATE` in
      `apps/web/src/features/onboarding/components/RebrandWelcomeDialog.tsx`
      to the launch day and merge. Accounts created before it see the one-time
      "Verdict is now Crow" note: reinstall the home-screen app, turn
      notifications back on.
- [ ] Push the release tag. The workflow builds, deploys to the new droplet,
      and checks `https://playcrow.app/version.json`.
- [ ] Check on a phone: sign in (email and Google), open a room, add to home
      screen, turn on notifications, share a result card, open an invite link
      (`https://playcrow.app/i/<code>`) in WhatsApp to see the preview.
- [ ] Tell your players the new address. Everyone signs in again on
      playcrow.app: sign-ins, the installed app and notification permissions
      belong to an address and don't carry over.

## 6. Later

- [ ] When nobody uses kishandoshi.me any more: snapshot the old droplet,
      destroy it, remove the kishandoshi.me redirect URLs from Supabase and
      Google, and reuse the domain for your personal site.
