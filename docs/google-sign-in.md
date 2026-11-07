# Google Sign-in Setup

The app already has "Continue with Google", "Connect Google" and the `/auth/callback` page. They work once Google and Supabase are configured as below. Nothing here goes into the repo except the optional local config.

Replace `<prod>` with the app's production URL (for example `https://playcrow.app`) and `<ref>` with the Supabase project ref (Supabase → Project Settings → General).

## 1. Google Cloud Console

1. Go to <https://console.cloud.google.com/>, create a project (for example "Crow").
2. **APIs & Services → OAuth consent screen** (called "Google Auth Platform → Branding / Audience" in newer consoles):
   - User type: **External**.
   - App name: Crow. User support email and developer contact: your email.
   - Authorized domains: your app's domain (for example `playcrow.app`) and `supabase.co`.
   - Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. These are basic scopes, so Google doesn't need to review the app.
   - **Publish the app** (Audience → Publish). While it's in "Testing", only accounts listed as test users can sign in. With 5 friends you can also stay in Testing and add their Gmail addresses as test users.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized JavaScript origins: `<prod>` and `http://localhost:5173`.
   - Authorized redirect URIs: `https://<ref>.supabase.co/auth/v1/callback` (Supabase shows this exact URL on its Google provider page).
   - Save, then copy the **Client ID** and **Client secret**.

## 2. Supabase dashboard

1. **Authentication → Sign In / Providers → Google**: enable it, paste the Client ID and Client secret, save.
2. **Authentication → URL Configuration**:
   - Site URL: `<prod>`.
   - Redirect URLs: add `<prod>/**` and `http://localhost:5173/**`.
3. **Authentication → Sign In / Providers → User Signups**: turn on **Allow manual linking**. "Connect Google" in the room menu needs it.

## 3. Existing accounts keep their player

Signing in with Google never creates a new player for someone who already has one, as long as Google lands on the same Supabase user:

- **Same email:** Supabase links a Google sign-in to an existing email/password user automatically when the emails match and the existing email is confirmed. Same user id, so same player, rooms and points.
- **Different email** (or an unconfirmed one): the friend signs in with email as usual, opens the room menu (⋯) → **Connect Google**, and picks their Google account. From then on Google opens their existing account.

Before announcing Google sign-in, run this in the SQL editor:

```sql
select email, email_confirmed_at, raw_app_meta_data->'providers' as providers
from auth.users
order by created_at;
```

Anyone with an empty `email_confirmed_at`, or whose Gmail differs from the email listed, should use **Connect Google** first.

If someone does end up with a second, empty account (they picked a name on a fresh account), delete that extra user in **Authentication → Users**, then have them sign in with email and use Connect Google.

## 4. Test before telling everyone

1. In a private window, open an invite link (`<prod>/rooms/<CODE>/join`) and continue with a Google account that has never used the app. You should land on "Pick a name", then the room's join screen.
2. Sign in with Google as an existing member whose Gmail matches their account. Their points and rooms should be unchanged.
3. On an iPhone, try it from the home-screen app too. iOS can finish the Google step in Safari instead of the app; if that happens, email sign-in still works there.

## Local development (optional)

Uncomment `[auth.external.google]` in `supabase/config.toml`. Then set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in your shell before `supabase start`. Add `http://127.0.0.1:54321/auth/v1/callback` as an extra redirect URI on the Google client. Never commit the secret.
