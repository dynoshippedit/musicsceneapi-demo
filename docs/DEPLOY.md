# DEPLOY.md — one-command per-client deployment

Pulsegrid ships as **one dedicated deployment per label**: one process, one
database, one active label profile. There is deliberately no shared
multi-tenancy — the profile (`src/profile/`) is the ownership root, not a
tenant registry.

## The one command

On the host (the Threadripper today; any Linux host tomorrow):

```bash
scripts/deploy-client.sh <client-slug>
# e.g.
scripts/deploy-client.sh acme-records
```

That single invocation:

1. Validates the slug (`1–32` chars, lowercase letters/digits/hyphens) and
   creates `~/pulsegrid/clients/<slug>/` (override with `PULSEGRID_BASE`).
2. Generates `.env` with per-client defaults: a unique **PORT/WEB_PORT** pair
   from a small allocator (default range `3100–3299`), a unique SQLite file,
   `LABEL_PROFILE=<slug>`, a generated `JWT_SECRET`, and a generated
   environment-level admin password (printed once).
3. Copies the app code (`git archive` of committed `HEAD`), runs `npm ci`,
   builds the frontend (`web/` → `web/dist`).
4. Installs and starts two **systemd user services**:
   `pulsegrid-<slug>` (the Express API) and `pulsegrid-<slug>-web`
   (the built frontend, also proxying `/health` and `/v3/*` to the API so the
   stack works standalone on localhost).
5. Waits for `GET /health`, then prints the URL and next steps.

Re-running the command on an existing client is the **update path**: ports,
secrets and `data/` are preserved, code is refreshed from `HEAD` (the old tree
is kept as `app.prev-<timestamp>` for rollback), and the services restart.

```bash
scripts/deploy-client.sh --destroy <client-slug>   # tear down (asks you to type the slug)
```

The script **never deletes client data without `--destroy`**. Without that
flag it only adds/refreshes; it never `rm -rf`s the client directory.

## Prerequisites

- **Node ≥ 18** (verified on 22.x; `engines` in `package.json`).
- **Linux with a systemd user manager** and lingering enabled, so services
  survive logout: `loginctl enable-linger <user>` (one-time; needs sudo/polkit).
  Verified working on the Threadripper (Nobara, user `dino`).
- The repo cloned with its git history (the deploy copies `git archive HEAD`).
- Outbound network for `npm ci` (registry access) on first deploy.
- No root needed: everything lives under the deploying user's home.

## Per-client isolation model

| Concern | How it's isolated |
|---|---|
| Network | Unique port pair per client: API `p`, web `p+1`, allocated from `3100–3299` (override `PORT_MIN`/`PORT_MAX`). Both bind `127.0.0.1` only — the public face is always the reverse proxy. |
| Database | One SQLite file per client: `<base>/<slug>/data/<slug>.sqlite` (`DB_STORAGE`). Created/migrated/seeded at boot by the app's `initializeDatabase()` (idempotent). |
| Config | One `.env` per client (`chmod 600`), loaded via systemd `EnvironmentFile` and by dotenv for manual runs. |
| Code | One `app/` copy per client, from committed `HEAD`. |
| Profile | `LABEL_PROFILE=<slug>` selects `src/profile/labels/<slug>.js`; unknown slugs fall back to the `pulsegrid` reference profile (never to the retired trademarked brand). |
| Processes | Two systemd user units per client: `pulsegrid-<slug>`, `pulsegrid-<slug>-web`. `Restart=on-failure`. |
| Secrets | `JWT_SECRET` (64 hex chars) and the env-admin password are generated per client at first deploy and never regenerated on re-runs. |

Directory layout per client (`~/pulsegrid/clients/<slug>/`):

```
.env                  # generated, chmod 600 — ports, secrets, DB path
app/                  # code copy (git archive of HEAD)
app.prev-<ts>/        # previous code trees, newest 3 kept (rollback)
data/<slug>.sqlite    # the database (plus -wal/-shm while running)
backups/              # for your SQLite backups
```

Why not `/srv/pulsegrid`? `/srv` is root-owned on a default install; the
user-home base needs no privileges and matches systemd user services. If you
prefer `/srv/pulsegrid`, create it as root once and set
`PULSEGRID_BASE=/srv/pulsegrid/clients`.

## Service management: why systemd user services

Verified on the host: the user manager runs, `Linger=yes` is set, and
`systemctl --user` works over ssh. User units give us restart-on-failure,
`journalctl` logs, and enable-at-boot — with no root and no extra daemon.

Alternatives considered: **pm2** (not installed; another moving part),
**system-wide units** (need root for `/etc/systemd/system`), and
**nohup + pidfiles** (no supervision, no logs, fragile). If a future host has
no systemd, the fallback is a `nohup` wrapper plus a `@reboot` cron entry —
documented here when/if that host exists.

## Environment reference (generated `.env`)

| Key | Default | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` / `WEB_PORT` | allocator pair | API / frontend ports |
| `LABEL_PROFILE` | `<slug>` | Falls back to `pulsegrid` if no `src/profile/labels/<slug>.js` exists. **To white-label a client**, add that profile module, commit, and re-run the deploy. |
| `JWT_SECRET` | generated | 16+ chars required; server refuses to start without it |
| `ADMIN_EMAIL` / `ADMIN_PASS` | `admin@<slug>.local` / generated | Environment-level admin login (first access) |
| `DB_STORAGE` | `<base>/<slug>/data/<slug>.sqlite` | Absolute path — required for services |
| `USE_REAL_DATA` | `false` | Keep `false` until provider credentials are configured |
| `EMAIL_FROM` | `notify@pulsegrid.fm` | Used when SMTP is configured; otherwise mail is simulated |
| `RESET_LINK_BASE` | `https://<slug>.pulsegrid.fm/reset-password` | **Placeholder — set the real domain after DNS, then restart** |
| `ALLOWED_ORIGINS` | `https://<slug>.pulsegrid.fm` | **Placeholder — same** |
| `SCHEDULE_JOBS` | `false` | Monthly-report cron etc.; enable once the client is real |
| `GROQ_API_KEY` | empty | AI features stay off until set |

Secrets live **only** in the client's `.env` (and the process environment).
Never in git, chat, or logs.

## Stripe test keys

Add to the client's `.env`, then restart the API unit. Variable names match
the billing workstream (`src/routes/billing.js`):

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SETUP_PRICE_ID=price_...
STRIPE_SUBSCRIPTION_PRICE_ID=price_...
STRIPE_SUCCESS_URL=https://<domain>/billing/success
STRIPE_CANCEL_URL=https://<domain>/billing/cancel
# STRIPE_STUB=...   # stub mode for dev/test — see billing docs before enabling
```

Use **test-mode** keys until a real customer is invoicing; live keys go
through the same variables.

## Reverse proxy (public traffic)

Both units bind `127.0.0.1`. The proxy serves the frontend and forwards API
paths. With the placeholder domain `acme-records.pulsegrid.fm` on ports
`3100` (API) / `3101` (web):

**Caddy** (simplest — automatic TLS):

```caddy
acme-records.pulsegrid.fm {
    handle /v3/* {
        reverse_proxy 127.0.0.1:3100
    }
    handle /health {
        reverse_proxy 127.0.0.1:3100
    }
    handle {
        reverse_proxy 127.0.0.1:3101
    }
}
```

**nginx**:

```nginx
server {
    listen 443 ssl;
    server_name acme-records.pulsegrid.fm;
    # ... ssl_certificate / ssl_certificate_key ...

    location /v3/  { proxy_pass http://127.0.0.1:3100; }
    location /health { proxy_pass http://127.0.0.1:3100; }
    location / {
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
    }
}
```

After DNS + proxy are live: set the real `RESET_LINK_BASE` and
`ALLOWED_ORIGINS` in the client's `.env` and
`systemctl --user restart pulsegrid-<slug>`.

## Updating a client

```bash
git pull            # or finish the feature branch and merge
scripts/deploy-client.sh <client-slug>
```

This refreshes `app/` from the new `HEAD`, rebuilds the frontend,
re-installs deps, and restarts the units. `.env`, `data/` and allocated ports
are untouched. The previous code tree is kept as `app.prev-<timestamp>`
(newest 3). The working tree must be **committed** first — the deploy ships
`HEAD` only and warns if the tree is dirty.

## Logs

```bash
journalctl --user -u pulsegrid-acme-records -f      # API, follow
journalctl --user -u pulsegrid-acme-records-web -f  # frontend gateway
systemctl --user status pulsegrid-acme-records      # state + recent lines
```

## Backup

The database is a single SQLite file: `<base>/<slug>/data/<slug>.sqlite`.
Back it up with the service **stopped**, or take a hot copy:

```bash
systemctl --user stop pulsegrid-<slug>
cp ~/pulsegrid/clients/<slug>/data/<slug>.sqlite \
   ~/pulsegrid/clients/<slug>/backups/<slug>-$(date +%Y%m%d).sqlite
systemctl --user start pulsegrid-<slug>
```

Hot-copy alternative (no downtime), from any sqlite3 client:

```sql
VACUUM INTO '/path/to/backups/<slug>-<date>.sqlite';
```

Back up the client's `.env` alongside the database (it holds the JWT secret —
without it, existing sessions/tokens are invalid after a restore). The
`app/` tree is reproducible from git and needs no backup.

## Rollback

If a deploy misbehaves, swap the previous code tree back and restart
(data is untouched by this):

```bash
cd ~/pulsegrid/clients/<slug>
mv app app.bad-$(date +%Y%m%d-%H%M%S)
mv app.prev-<timestamp> app
systemctl --user restart pulsegrid-<slug> pulsegrid-<slug>-web
```

## Destroying a client

```bash
scripts/deploy-client.sh --destroy <client-slug>
# asks you to TYPE the slug — no flag bypasses this
```

Stops and disables both units, removes the unit files, and deletes the whole
client directory (code, database, backups). There is no undo; take a backup
first if there's any doubt.

## Troubleshooting

- **"no free port pair"** — the `3100–3299` range is full; raise `PORT_MAX`
  (even numbers pair as API=p/WEB=p+1) or retire a client.
- **API fails the health check** — `journalctl --user -u pulsegrid-<slug> -n 50`;
  the usual cause is a bad `.env` edit (the server refuses to start with a
  missing/short `JWT_SECRET`).
- **Dirty-tree warning** — commit first; the deploy intentionally ships only
  committed `HEAD` so deployments are reproducible.
- **Services die at logout** — `loginctl enable-linger <user>` (the deploy
  warns if lingering is off).
- **Frontend shows the app shell but API calls fail** — the `-web` unit proxies
  `/health` and `/v3/*`; check it's running, and in production check the
  reverse-proxy rules above.
