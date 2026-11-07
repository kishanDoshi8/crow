# Server setup

How the production server for playcrow.app (DigitalOcean droplet, Ubuntu
24.04, nginx) is organised,
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
Droplet: /var/www/crow/
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
- **A dedicated `deploy` user** owns `/var/www/crow` and nothing else. The
  key GitHub holds can't run sudo or touch your home folder.
- **Files live in `/var/www`, not a home folder**, so nginx (user
  `www-data`) never needs to read into anyone's home directory.

## How nginx configuration is organised

Everything lives under `/etc/nginx/`:

| Path | What it's for |
|---|---|
| `nginx.conf` | The main file. Its `http { }` block sets server-wide defaults and loads the two folders below. You rarely edit it. |
| `conf.d/*.conf` | Loaded inside `http { }`: settings for **every** site, like `map`s and `server_tokens`. |
| `sites-available/` | One file per site (`server { }` blocks). Not loaded by itself. |
| `sites-enabled/` | Symlinks to the files in `sites-available/` that should be live. Enabling or disabling a site is adding or removing a symlink, without deleting its config. |
| `snippets/` | Reusable fragments, pulled in with `include snippets/<name>.conf;`. |

This server has one file per site: `playcrow.app` for this app,
`default-deny` as the catch-all, and a new file for any future site.

### Reading a site file

The repo's copy, [`deploy/nginx/sites-available/playcrow.app`](../deploy/nginx/sites-available/playcrow.app),
is commented line by line. The concepts behind it:

- **`server { }`**: one virtual host. nginx picks the server block by the port
  (`listen`) and then by the `Host` the browser asked for (`server_name`).
  If nothing matches, the block marked `default_server` answers (here:
  `default-deny`, which answers nothing).
- **`location { }`**: rules for a group of URLs inside a server. Exact (`=`)
  matches win first, then prefixes marked `^~`, then the first matching regex
  (`~`) in file order, then the longest plain prefix. `location /` matches
  everything, so it's the fallback.
- **`root` + `try_files`**: `root /var/www/crow/current` maps
  `/assets/x.js` to `/var/www/crow/current/assets/x.js`. `try_files $uri
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
sudo tail -f /var/log/nginx/playcrow.app.error.log
```

## What's in the repo, and where it goes

| Repo file | Server path | Purpose |
|---|---|---|
| `deploy/nginx/sites-available/playcrow.app` | `/etc/nginx/sites-available/playcrow.app` | The app: HTTPS, caching, compression, invite links |
| `deploy/nginx/sites-available/default-deny` | `/etc/nginx/sites-available/default-deny` | Ignores requests for unknown hosts (bots scanning the IP) |
| `deploy/nginx/snippets/security-headers.conf` | `/etc/nginx/snippets/security-headers.conf` | HSTS, nosniff, no framing, referrer policy |
| `deploy/nginx/conf.d/link-preview-bots.conf` | `/etc/nginx/conf.d/link-preview-bots.conf` | Tells link-preview bots from people (`/i/` links) |
| `deploy/nginx/conf.d/server-tokens.conf` | `/etc/nginx/conf.d/server-tokens.conf` | Hides the nginx version |

The repo is the source of truth: change the file here (in a PR), then copy it
to the server and reload.

## One-time setup (new droplet)

For a fresh droplet. The app has no state on the server (accounts and data
live in Supabase), so a new server is just nginx, a certificate and an empty
folder that the first deploy fills.

### 1. Create the droplet

DigitalOcean → Create → Droplets: **Ubuntu 24.04 LTS**, the smallest regular
size (1 GB is plenty to serve files), the region nearest your players, your
SSH key, and **IPv6 enabled** (Advanced options).

Log in once as `root` and make your own sudo user, so `root` isn't used day to
day:

```bash
adduser kishan && usermod -aG sudo kishan && rsync --archive --chown=kishan:kishan ~/.ssh /home/kishan
```

From here on, log in as `kishan`. Update the system and turn on the firewall
(SSH plus web traffic only):

```bash
sudo apt update && sudo apt upgrade -y
```

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

`Nginx Full` exists once nginx is installed (step 3); if `ufw` complains, run
that line after step 3.

### 2. Point the domain at it (Cloudflare DNS)

In Cloudflare → playcrow.app → DNS, with the proxy **off** (grey cloud, "DNS
only") so nginx and certbot see visitors directly:

| Type | Name | Content |
|---|---|---|
| A | `playcrow.app` | droplet IPv4 |
| AAAA | `playcrow.app` | droplet IPv6 |
| A | `www` | droplet IPv4 |
| AAAA | `www` | droplet IPv6 |
| CAA | `playcrow.app` | `0 issue "letsencrypt.org"` (only Let's Encrypt may issue certificates) |
| TXT | `playcrow.app` | `v=spf1 -all` (nobody sends email as @playcrow.app) |
| TXT | `_dmarc` | `v=DMARC1; p=reject;` |

Drop the two TXT records later if the domain starts sending email (for
example Supabase auth emails from a custom sender).

`.app` domains are HTTPS-only in every browser, so the site isn't reachable
in a browser until step 4 gives it a certificate.

### 3. Install nginx and certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx rsync
```

```bash
nginx -v
```

Ubuntu 24.04 ships nginx 1.24, which supports everything in the config.

### 4. Get the certificate

Once `dig +short playcrow.app` (from any computer) shows the droplet's IP:

```bash
sudo certbot certonly --nginx -d playcrow.app -d www.playcrow.app
```

`certonly` only fetches the certificate, into
`/etc/letsencrypt/live/playcrow.app/`, without editing nginx files; the site
file below already points there. Renewal is automatic.

### 5. Create the deploy user and its SSH key

On **your computer**, create a key just for GitHub Actions:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/crow_deploy -C "crow github deploy" -N ""
```

On the **droplet**, create the user (no password: key login only):

```bash
sudo adduser --disabled-password --gecos "" deploy
```

```bash
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
```

Paste the **public** key (`cat ~/.ssh/crow_deploy.pub` on your computer)
into this command, keeping the word `restrict` in front of it. `restrict` turns
off port forwarding and terminals for this key; running rsync and commands
still works.

```bash
echo 'restrict ssh-ed25519 AAAA...your-key... crow github deploy' | sudo tee /home/deploy/.ssh/authorized_keys
```

```bash
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys && sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

Test from **your computer**; it should print `deploy`:

```bash
ssh -i ~/.ssh/crow_deploy deploy@playcrow.app 'whoami'
```

### 6. Create the web folder

```bash
sudo install -d -o deploy -g deploy -m 755 /var/www/crow /var/www/crow/releases
```

It stays empty until the first deploy, which creates `current`.

### 7. Copy the nginx files

From the repo on **your computer**:

```bash
scp -r deploy/nginx kishan@playcrow.app:~/nginx-config
```

Then on the **droplet**:

```bash
sudo cp ~/nginx-config/conf.d/*.conf /etc/nginx/conf.d/ && sudo cp ~/nginx-config/snippets/security-headers.conf /etc/nginx/snippets/
```

```bash
sudo cp ~/nginx-config/sites-available/playcrow.app ~/nginx-config/sites-available/default-deny /etc/nginx/sites-available/
```

### 8. Enable the site, test, reload

```bash
sudo ln -s /etc/nginx/sites-available/playcrow.app /etc/nginx/sites-enabled/ && sudo ln -s /etc/nginx/sites-available/default-deny /etc/nginx/sites-enabled/
```

```bash
sudo rm /etc/nginx/sites-enabled/default
```

```bash
sudo nginx -t
```

Only if it says `test is successful`:

```bash
sudo systemctl reload nginx
```

Until the first deploy, `https://playcrow.app` answers `404`: nginx is up,
the folder is just empty.

### 9. Point GitHub at the droplet

**Repository variables** (Settings → Secrets and variables → Actions →
Variables tab, *not* the production environment). They're baked into the
public JavaScript, so they're variables, not secrets:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://kizogptkryjjxzlixtqp.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the publishable key (`sb_publishable_...`) |
| `VITE_WEB_PUSH_PUBLIC_KEY` | your public VAPID key |
| `VITE_SHORT_INVITE_LINKS` | `true` or `false` |

**`production` environment** (Settings → Environments → production):

| Name | Kind | Value |
|---|---|---|
| `DEPLOY_HOST` | secret | `playcrow.app` (or the droplet IP) |
| `DEPLOY_USER` | secret | `deploy` |
| `DEPLOY_SSH_KEY` | secret | contents of `~/.ssh/crow_deploy` (the private key, no `.pub`) |
| `DEPLOY_KNOWN_HOSTS` | secret | output of `ssh-keyscan <the DEPLOY_HOST value>` |
| `APP_URL` | variable | `https://playcrow.app` |
| `DEPLOY_PATH` | variable | not needed: the default is `/var/www/crow` |

### 10. First deploy

Push a version tag, or Actions → Release → **Run workflow** with an existing
tag. It builds on GitHub, uploads, switches `current`, and checks
`/version.json`. Then follow [crow-launch.md](crow-launch.md) for the
Supabase and Google settings that go with the new address.

## Everyday operations

**Deploy**: push a tag. Watch it under Actions → Release.

**Roll back**: Actions → Release → Run workflow with the older tag (rebuilds
it, about two minutes). Faster, straight on the server:

```bash
ls /var/www/crow/releases
```

```bash
cd /var/www/crow && sudo -u deploy ln -sfn releases/<folder> current.tmp && sudo -u deploy mv -Tf current.tmp current
```

The app notices the different version and offers a refresh, even going
backwards. If a deploy's live check fails, the workflow rolls back by itself.

**Change the nginx config**: edit `deploy/nginx/...` in a PR, merge, copy the
file to the server (`scp`) and into `/etc/nginx/...`, then `sudo nginx -t`
and `sudo systemctl reload nginx`.

**Certificates**: certbot renews them automatically. To check:

```bash
sudo certbot renew --dry-run
```

## Later

- **Content-Security-Policy header**: the strongest protection against
  injected scripts, but it has to list Supabase, Google sign-in and push.
  Worth its own PR, tried with `Content-Security-Policy-Report-Only` first.
- **SSH**: once key login works, set `PasswordAuthentication no` in
  `/etc/ssh/sshd_config` (DigitalOcean droplets created with an SSH key
  usually have it already).
