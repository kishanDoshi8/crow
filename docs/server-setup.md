# Server setup

How the production server (DigitalOcean droplet, Ubuntu, nginx) is organised,
how a release gets there, and the one-time steps to set it up.

## The big picture

```
git tag v0.5.0 && git push origin v0.5.0
        │
        ▼
GitHub Actions (.github/workflows/release.yml)
  1. check the tag is on master, run CI
  2. build the app (npm ci && npm run build), gzip the text files
  3. rsync the build to the droplet as a new folder
  4. point the "current" symlink at it, check /version.json
        │
        ▼
Droplet: /var/www/predikt/
  releases/
    20261104T153000Z-v0.5.0/   ← one folder per deploy, last 5 kept
    20261101T090000Z-v0.4.2/
  current  -> releases/20261104T153000Z-v0.5.0     ← nginx serves this
  previous -> releases/20261101T090000Z-v0.4.2     ← old bundles still reachable
```

Why it's built this way:

- **The droplet only serves files.** Building needs more memory than a 1 GB
  droplet has (Vite peaks above 480 MB, Node's limit there), so GitHub builds
  it. The server needs no Node, no `npm ci`, no git checkout.
- **Switching a symlink is instant and atomic.** nginx never sees a
  half-copied release. Rolling back is pointing `current` at an older folder.
- **A dedicated `deploy` user** owns `/var/www/predikt` and nothing else. The
  key GitHub holds can't run sudo or touch your home folder.
- **Files live in `/var/www`, not your home folder.** Serving from
  `/home/kishan/...` means nginx (user `www-data`) must be able to read into
  your home directory.

## How nginx configuration is organised

Everything lives under `/etc/nginx/`:

| Path | What it's for |
|---|---|
| `nginx.conf` | The main file. Its `http { }` block sets server-wide defaults and loads the two folders below. You rarely edit it. |
| `conf.d/*.conf` | Loaded inside `http { }`: settings for **every** site, like `map`s and `server_tokens`. |
| `sites-available/` | One file per site (`server { }` blocks). Not loaded by itself. |
| `sites-enabled/` | Symlinks to the files in `sites-available/` that should be live. Enabling or disabling a site is adding or removing a symlink, without deleting its config. |
| `snippets/` | Reusable fragments, pulled in with `include snippets/<name>.conf;`. |

Today everything sits in `sites-available/default`. After the setup below it's
one file per site: `kishandoshi.me` for this app, `default-deny` as the
catch-all, and a new file for any future app.

### Reading a site file

The repo's copy, [`deploy/nginx/sites-available/kishandoshi.me`](../deploy/nginx/sites-available/kishandoshi.me),
is commented line by line. The concepts behind it:

- **`server { }`**: one virtual host. nginx picks the server block by the port
  (`listen`) and then by the `Host` the browser asked for (`server_name`).
  If nothing matches, the block marked `default_server` answers (here:
  `default-deny`, which answers nothing).
- **`location { }`**: rules for a group of URLs inside a server. Exact (`=`)
  matches win first, then prefixes marked `^~`, then the first matching regex
  (`~`) in file order, then the longest plain prefix. `location /` matches
  everything, so it's the fallback.
- **`root` + `try_files`**: `root /var/www/predikt/current` maps
  `/assets/x.js` to `/var/www/predikt/current/assets/x.js`. `try_files $uri
  /index.html` serves the file if it exists, otherwise `index.html`. That's how
  `/rooms/F4C36D`, which isn't a file, reaches the React app.
- **`add_header` inheritance**: a location inherits the server's `add_header`
  lines **only if it sets none of its own**. Every location here sets
  `Cache-Control`, so each one includes `snippets/security-headers.conf`
  again. Forgetting this silently drops the security headers.
- **`return 301`** sends a redirect. **`proxy_pass`** forwards the request to
  another server (the `/i/` invite previews go to Supabase).

### Testing and applying a change

```bash
sudo nginx -t
```

This checks the syntax and every referenced file without touching the running
server. Only if it says `test is successful`:

```bash
sudo systemctl reload nginx
```

A reload is graceful: new workers start with the new config, and old ones
finish their open requests first. Nothing is dropped. If `nginx -t` fails, the
running server keeps the old config.

Logs for this site:

```bash
sudo tail -f /var/log/nginx/kishandoshi.me.error.log
```

## What's in the repo, and where it goes

| Repo file | Server path | Purpose |
|---|---|---|
| `deploy/nginx/sites-available/kishandoshi.me` | `/etc/nginx/sites-available/kishandoshi.me` | The app: HTTPS, caching, compression, invite links |
| `deploy/nginx/sites-available/default-deny` | `/etc/nginx/sites-available/default-deny` | Ignores requests for unknown hosts (bots scanning the IP) |
| `deploy/nginx/snippets/security-headers.conf` | `/etc/nginx/snippets/security-headers.conf` | HSTS, nosniff, no framing, referrer policy |
| `deploy/nginx/conf.d/verdict-invite-map.conf` | `/etc/nginx/conf.d/verdict-invite-map.conf` | Tells link-preview bots from people (`/i/` links) |
| `deploy/nginx/conf.d/server-tokens.conf` | `/etc/nginx/conf.d/server-tokens.conf` | Hides the nginx version |

The repo is the source of truth: change the file here (in a PR), then copy it
to the server and reload.

## One-time setup

Run these on the droplet as `kishan` unless a step says otherwise. Your site
keeps running on the old config until step 6.

### 1. Check versions and back up

```bash
nginx -v
```

```bash
sudo cp -a /etc/nginx /etc/nginx.backup-$(date +%F)
```

`default-deny` needs nginx 1.19.4 or newer (Ubuntu 22.04 and later have it).
On older versions, skip it in step 5.

### 2. Create the deploy user and its SSH key

On **your computer**, create a key just for GitHub Actions:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/predikt_deploy -C "predikt github deploy" -N ""
```

On the **droplet**, create the user (no password: key login only):

```bash
sudo adduser --disabled-password --gecos "" deploy
```

```bash
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
```

Paste the **public** key (`cat ~/.ssh/predikt_deploy.pub` on your computer)
into this command, keeping the word `restrict` in front of it. `restrict` turns
off port forwarding and terminals for this key; running rsync and commands
still works.

```bash
echo 'restrict ssh-ed25519 AAAA...your-key... predikt github deploy' | sudo tee /home/deploy/.ssh/authorized_keys
```

```bash
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys && sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

Test from **your computer**:

```bash
ssh -i ~/.ssh/predikt_deploy deploy@kishandoshi.me 'whoami'
```

It should print `deploy`.

### 3. Create the web folder, starting with today's build

The current build moves over as the first release, so the site looks exactly
the same after the switch:

```bash
sudo install -d -o deploy -g deploy -m 755 /var/www/predikt /var/www/predikt/releases
```

```bash
sudo cp -r /home/kishan/predict/apps/web/dist /var/www/predikt/releases/00000000T000000Z-initial
```

```bash
sudo chown -R deploy:deploy /var/www/predikt/releases && sudo -u deploy ln -sfn releases/00000000T000000Z-initial /var/www/predikt/current
```

### 4. Copy the nginx files

Get the repo's latest files onto the server:

```bash
cd ~/predict && git fetch origin && git checkout --detach origin/master
```

```bash
sudo cp deploy/nginx/conf.d/*.conf /etc/nginx/conf.d/
```

```bash
sudo cp deploy/nginx/snippets/security-headers.conf /etc/nginx/snippets/
```

```bash
sudo cp deploy/nginx/sites-available/kishandoshi.me deploy/nginx/sites-available/default-deny /etc/nginx/sites-available/
```

The new site file redirects `www.kishandoshi.me` with its own HTTPS block,
so the certificate must cover `www`. Check:

```bash
sudo certbot certificates
```

`Domains:` should list `kishandoshi.me www.kishandoshi.me`, and the
certificate path should be `/etc/letsencrypt/live/kishandoshi.me/`. If either
differs, fix the `ssl_certificate` lines in the site file to match.

### 5. Switch nginx over

Enable the new files and disable the old `default` (the file itself stays in
`sites-available` and in the backup):

```bash
sudo ln -s /etc/nginx/sites-available/kishandoshi.me /etc/nginx/sites-enabled/
```

```bash
sudo ln -s /etc/nginx/sites-available/default-deny /etc/nginx/sites-enabled/
```

```bash
sudo rm /etc/nginx/sites-enabled/default
```

### 6. Test, then reload

```bash
sudo nginx -t
```

If it reports an error, fix it before reloading; the live site is unaffected
until you do. Once it's successful:

```bash
sudo systemctl reload nginx
```

**To undo** at any point: remove the two new links, re-link `default`
(`sudo ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/`),
then test and reload again.

### 7. Check it from your computer

```bash
curl -sI https://kishandoshi.me/rooms/TEST | grep -i -E "^HTTP|cache-control|strict-transport"
```

Expect `200`, `cache-control: no-cache` and a `strict-transport-security` line.

```bash
curl -sI https://www.kishandoshi.me/login | grep -i -E "^HTTP|^location"
```

Expect `301` to `https://kishandoshi.me/login`.

```bash
curl -s https://kishandoshi.me/version.json
```

Expect the version that was live before.

### 8. Point GitHub at the new setup

**Repository variables** (Settings → Secrets and variables → Actions →
Variables tab, *not* the production environment): copy the values from the
server's env file (`cat ~/predict/apps/web/.env*`). They're baked into the
public JavaScript, so they're variables, not secrets.

| Variable | Example |
|---|---|
| `VITE_SUPABASE_URL` | `https://kizogptkryjjxzlixtqp.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_...` |
| `VITE_WEB_PUSH_PUBLIC_KEY` | your public VAPID key |
| `VITE_SHORT_INVITE_LINKS` | `true` or `false` |

**`production` environment** (Settings → Environments → production):

| Name | Kind | Value |
|---|---|---|
| `DEPLOY_USER` | secret | `deploy` |
| `DEPLOY_SSH_KEY` | secret | contents of `~/.ssh/predikt_deploy` (the private key, no `.pub`) |
| `DEPLOY_HOST` | secret | unchanged |
| `DEPLOY_KNOWN_HOSTS` | secret | unchanged, or `ssh-keyscan <DEPLOY_HOST value>` |
| `DEPLOY_PATH` | variable | delete it if it says `predict`; the default is `/var/www/predikt` |
| `APP_URL` | variable | `https://kishandoshi.me` |

### 9. Deploy

Actions → Release → **Run workflow** → enter the tag that failed. It builds on
GitHub, uploads, switches `current`, and checks `/version.json`.

### 10. Clean up (after a successful deploy)

- The old key GitHub used to log in as `kishan` can come out of
  `~/.ssh/authorized_keys` on the droplet.
- `~/predict` on the server is no longer used for deploys. Keep it if you run
  `supabase` commands from there; otherwise delete it.
- If you ever opened up your home folder so nginx could read it, close it
  again with `chmod 750 ~`.
- Keep the 2 GB swap: it helps a 1 GB droplet in general.

## Everyday operations

**Deploy**: push a tag. Watch it under Actions → Release.

**Roll back**: Actions → Release → Run workflow with the older tag (rebuilds
it, about two minutes). Faster, straight on the server:

```bash
ls /var/www/predikt/releases
```

```bash
cd /var/www/predikt && sudo -u deploy ln -sfn releases/<folder> current.tmp && sudo -u deploy mv -Tf current.tmp current
```

The app notices the different version and offers a refresh, even going
backwards. If a deploy's live check fails, the workflow rolls back by itself.

**Change the nginx config**: edit `deploy/nginx/...` in a PR, merge, then on
the server copy the file to `/etc/nginx/...`, `sudo nginx -t`, and
`sudo systemctl reload nginx`.

**Certificates**: certbot renews them automatically. To check:

```bash
sudo certbot renew --dry-run
```

## Later

- **Content-Security-Policy header**: the strongest protection against
  injected scripts, but it has to list Supabase, Google sign-in and push.
  Worth its own PR, tried with `Content-Security-Policy-Report-Only` first.
- **Firewall**: `sudo ufw status`. Only SSH and `Nginx Full` (80, 443)
  should be allowed.
- **SSH**: once key login works for everyone, set `PasswordAuthentication no`
  in `/etc/ssh/sshd_config`.
