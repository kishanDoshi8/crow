# playcrow.app: the Crow web app.
#
# Installed as /etc/nginx/sites-available/playcrow.app and enabled with a
# symlink in /etc/nginx/sites-enabled/. Full walkthrough: docs/server-setup.md.
#
# Files are served from /var/www/crow/current, a symlink to the live
# release that the Release workflow switches on each deploy:
#
#   /var/www/crow/
#     releases/20261104T153000Z-v0.1.1/   one folder per deploy (last 5 kept)
#     current  -> releases/<live release>
#     previous -> releases/<release before it>

# --- Plain HTTP ------------------------------------------------------------
# Everyone is sent to HTTPS on the main domain, in one hop.
server {
    listen 80;
    listen [::]:80;
    server_name playcrow.app www.playcrow.app;

    return 301 https://playcrow.app$request_uri;
}

# --- www -> main domain ----------------------------------------------------
# One canonical address, so links, cookies and the installed app all agree.
# Needs www.playcrow.app on the certificate (check: sudo certbot certificates).
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.playcrow.app;

    ssl_certificate /etc/letsencrypt/live/playcrow.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/playcrow.app/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://playcrow.app$request_uri;
}

# --- The app -----------------------------------------------------------------
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name playcrow.app;

    ssl_certificate /etc/letsencrypt/live/playcrow.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/playcrow.app/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/crow/current;
    index index.html;

    # Logs per site, so this app's traffic isn't mixed with others'.
    access_log /var/log/nginx/playcrow.app.access.log;
    error_log /var/log/nginx/playcrow.app.error.log;

    # --- Compression ---
    # CI uploads a .gz next to each text file; gzip_static serves it as-is,
    # so the 1 vCPU droplet never compresses the bundles itself. Anything
    # without a .gz (small files, the invite preview) is compressed on the fly.
    gzip_static on;
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json
               application/manifest+json image/svg+xml;

    # --- Headers ---
    # nginx quirk: add_header lines are inherited from the server block ONLY by
    # locations that have no add_header of their own. Every location below
    # sets Cache-Control, so each one includes the security headers itself.
    include snippets/security-headers.conf;

    # How nginx picks a location, for reading the blocks below:
    #   1. "= /path"    exact match: used immediately.
    #   2. "^~ /path"   longest matching prefix with ^~: used, regexes skipped.
    #   3. "~ regex"    the first regex that matches, in file order.
    #   4. "/path"      otherwise, the longest plain prefix ("/" catches all).

    # Hashed bundles (index-3f9a1c.js) never change once built: cache for a
    # year. The file name changes when the content does.
    location ^~ /assets/ {
        include snippets/security-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri @previous_assets;
    }

    # A phone that loaded the page just before a deploy still asks for the
    # old bundles. They're gone from the new release, so look in the previous
    # one before giving up.
    location @previous_assets {
        root /var/www/crow/previous;
        include snippets/security-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # The page, service worker, manifest and version file must always be
    # checked with the server first, so phones never open an old build.
    # "no-cache" means "revalidate": a tiny 304 when nothing changed.
    location ~ ^/(index\.html|sw\.js|version\.json|manifest\.json|manifest\.webmanifest)$ {
        include snippets/security-headers.conf;
        add_header Cache-Control "no-cache";
        try_files $uri =404;
    }

    # Short invite links: https://playcrow.app/i/<code>
    # People are redirected to the room's join page. Link-preview crawlers
    # (WhatsApp, iMessage, ...) get the room's preview from the invite-preview
    # Supabase function. $is_link_preview_bot comes from
    # /etc/nginx/conf.d/link-preview-bots.conf.
    location ^~ /i/ {
        # People: /i/F4C36D?ref=invite-link -> /rooms/F4C36D/join?ref=invite-link
        # ("if" is only safe with return/rewrite inside, as here.)
        if ($is_link_preview_bot = 0) {
            rewrite ^/i/([A-Za-z0-9]+)/?$ /rooms/$1/join redirect;
        }

        # Crawlers: /i/F4C36D -> /functions/v1/invite-preview/F4C36D
        rewrite ^/i/(.*)$ /functions/v1/invite-preview/$1 break;
        proxy_pass https://kizogptkryjjxzlixtqp.supabase.co;
        proxy_ssl_server_name on;
        proxy_set_header Host kizogptkryjjxzlixtqp.supabase.co;

        # Lets the function build links back to this domain.
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Supabase labels function HTML with a sandboxing security policy (no
        # styles, no scripts, no redirects) and may call it plain text. The
        # page is ours, so serve it as normal HTML from this domain.
        proxy_hide_header Content-Security-Policy;
        proxy_hide_header Content-Type;
        proxy_hide_header Cache-Control;
        include snippets/security-headers.conf;
        add_header Content-Type "text/html; charset=utf-8" always;
        add_header Cache-Control "public, max-age=300" always;
    }

    # Never serve dotfiles (.env, .git, ...) if one ever lands in a release.
    # .well-known stays reachable for certificate checks.
    location ~ /\.(?!well-known/) {
        deny all;
    }

    # Everything else: files from public/ (icons, og-image.jpg) are served
    # directly and cached for a day; any other path is an app route
    # (/rooms/F4C36D, /login, ...) and gets index.html. That fallback is an
    # internal redirect to /index.html, so it picks up the no-cache rule above.
    location / {
        include snippets/security-headers.conf;
        add_header Cache-Control "public, max-age=86400";
        try_files $uri /index.html;
    }
}
