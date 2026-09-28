#!/usr/bin/env bash
#
# scripts/deploy-client.sh — one-command per-client deployment for Pulsegrid.
#
# Usage:
#   scripts/deploy-client.sh <client-slug>            # deploy a new client, or update an existing one
#   scripts/deploy-client.sh --destroy <client-slug>  # tear a client down (asks for confirmation)
#
# What a deploy does:
#   1. Validates the slug; creates $PULSEGRID_BASE/<slug>/ (default ~/pulsegrid/clients/<slug>/).
#   2. Generates .env with per-client defaults: a unique PORT/WEB_PORT pair from a small
#      allocator, a unique SQLite file, LABEL_PROFILE=<slug>, a generated JWT_SECRET and
#      a generated environment-level admin password.
#   3. Copies the app code (git archive of committed HEAD), installs backend deps,
#      builds the frontend (vite -> web/dist).
#   4. Installs and starts two systemd user services:
#        pulsegrid-<slug>      the Express API (node app/server.js)
#        pulsegrid-<slug>-web  the built frontend + a same-origin gateway for /health and /v3/*
#      (see "Service management" in DEPLOY.md for why systemd user units were chosen).
#   5. Waits for GET /health, then prints the URL and next steps (DNS, reverse proxy, Stripe).
#
# Guarantees:
#   - IDEMPOTENT: re-running is safe. Ports, secrets and data/ are preserved; app code is
#     refreshed from HEAD (the old tree is kept as app.prev-<timestamp> for rollback) and
#     the services are restarted.
#   - NEVER deletes an existing client's data without --destroy, which requires typing the
#     slug to confirm. Without --destroy the script only adds/refreshes; it never rm -rf's
#     the client directory.
#
# Environment overrides:
#   PULSEGRID_BASE   base directory for clients (default: $HOME/pulsegrid/clients)
#   PORT_MIN/PORT_MAX allocator range (defaults 3100/3299; each client takes a pair API=p, WEB=p+1)

set -euo pipefail

PROG="$(basename "$0")"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${PULSEGRID_BASE:-$HOME/pulsegrid/clients}"
UNIT_DIR="$HOME/.config/systemd/user"
PORT_MIN="${PORT_MIN:-3100}"
PORT_MAX="${PORT_MAX:-3299}"

log() { printf '[deploy] %s\n' "$*"; }
err() { printf '[deploy:ERROR] %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

usage() {
    cat <<EOF
Usage:
  $PROG <client-slug>             deploy a new client, or update an existing one
  $PROG --destroy <client-slug>   tear a client down (confirmation required)

Examples:
  $PROG acme-records
  $PROG --destroy acme-records

Env overrides: PULSEGRID_BASE (default \$HOME/pulsegrid/clients), PORT_MIN/PORT_MAX.
EOF
}

valid_slug() { [[ "$1" =~ ^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$ ]]; }

rand_hex() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
    else
        node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
    fi
}

port_listening() { ss -tln 2>/dev/null | grep -qE ":${1}([^0-9]|$)"; }

allocated_ports() {
    # Ports already assigned to clients, from their .env files.
    # (|| true: empty matches must not fail under set -e + pipefail.)
    grep -h -s '^PORT=' "$BASE"/*/.env 2>/dev/null | cut -d= -f2 || true
    grep -h -s '^WEB_PORT=' "$BASE"/*/.env 2>/dev/null | cut -d= -f2 || true
}

pick_ports() {
    # Echo "API_PORT WEB_PORT": first free pair (API=p, WEB=p+1), skipping ports
    # already allocated to other clients and ports already listening.
    local taken p web
    taken="$(allocated_ports | sort -n | uniq)"
    for ((p = PORT_MIN; p <= PORT_MAX - 1; p += 2)); do
        web=$((p + 1))
        if ! grep -qx "$p" <<<"$taken" && ! grep -qx "$web" <<<"$taken" \
            && ! port_listening "$p" && ! port_listening "$web"; then
            echo "$p $web"
            return 0
        fi
    done
    return 1
}

read_env() { # read_env <file> <key>
    grep -E "^${2}=" "$1" 2>/dev/null | tail -n 1 | cut -d= -f2- || true
}

ensure_env_key() { # ensure_env_key <file> <key> <value> — add only if missing (never overwrite)
    grep -qE "^${2}=" "$1" || printf '%s=%s\n' "$2" "$3" >> "$1"
}

wait_for_health() { # wait_for_health <port>
    local port="$1" i
    for i in $(seq 1 60); do
        if curl -fsS -o /dev/null "http://127.0.0.1:${port}/health" 2>/dev/null; then
            return 0
        fi
        sleep 1
    done
    return 1
}

systemd_user() {
    # systemctl --user needs XDG_RUNTIME_DIR; plain ssh sessions often lack it.
    if [[ -z "${XDG_RUNTIME_DIR:-}" ]]; then
        export XDG_RUNTIME_DIR="/run/user/$(id -u)"
    fi
    systemctl --user "$@"
}

check_linger() {
    if ! loginctl show-user "$USER" -p Linger 2>/dev/null | grep -q 'yes'; then
        err "lingering is not enabled for $USER — services will stop at logout."
        err "Enable with: loginctl enable-linger $USER   (needs sudo/polkit once)"
    fi
}

# ---------------------------------------------------------------- destroy ---

cmd_destroy() {
    local slug="$1"
    local dir="$BASE/$slug"
    [[ -d "$dir" ]] || die "no such client: '$slug' ($dir does not exist)"
    printf 'This will PERMANENTLY delete client "%s":\n  %s\n' "$slug" "$dir"
    printf 'Everything — code, database, backups, logs, units — goes away.\n'
    printf 'Type the client slug to confirm: '
    local answer
    read -r answer
    [[ "$answer" == "$slug" ]] || die "confirmation did not match; aborting (nothing was deleted)"
    local unit
    for unit in "pulsegrid-${slug}" "pulsegrid-${slug}-web"; do
        systemd_user stop "$unit" 2>/dev/null || true
        systemd_user disable "$unit" 2>/dev/null || true
        rm -f "$UNIT_DIR/${unit}.service"
    done
    systemd_user daemon-reload
    rm -rf "$dir"
    log "client '$slug' destroyed"
}

# ---------------------------------------------------------------- deploy ----

cmd_deploy() {
    local slug="$1"
    valid_slug "$slug" || die "invalid slug '$slug' (1-32 chars: lowercase letters, digits, hyphens)"
    local dir="$BASE/$slug"
    local env_file="$dir/.env"
    local fresh=0

    check_linger
    mkdir -p "$dir" "$dir/data" "$dir/backups" "$UNIT_DIR"

    local api_port web_port jwt_secret admin_email admin_pass
    if [[ -f "$env_file" ]]; then
        log "existing client '$slug' — reusing ports and secrets from .env"
        api_port="$(read_env "$env_file" PORT)"
        web_port="$(read_env "$env_file" WEB_PORT)"
        jwt_secret="$(read_env "$env_file" JWT_SECRET)"
        admin_email="$(read_env "$env_file" ADMIN_EMAIL)"
        admin_pass="$(read_env "$env_file" ADMIN_PASS)"
        [[ -n "$api_port" && -n "$web_port" && -n "$jwt_secret" ]] \
            || die ".env is missing PORT/WEB_PORT/JWT_SECRET; repair it or --destroy and redeploy"
    else
        fresh=1
        read -r api_port web_port < <(pick_ports) \
            || die "no free port pair left in range $PORT_MIN-$PORT_MAX"
        jwt_secret="$(rand_hex)"
        admin_email="admin@${slug}.local"
        admin_pass="$(rand_hex | head -c 24)"
        log "new client '$slug': API port $api_port, web port $web_port"
    fi

    # --- .env -----------------------------------------------------------------
    # Fresh deploy: write the full template. Re-run: only fill in keys that are
    # missing, so operator edits (Stripe keys, origins, …) are never clobbered.
    if [[ "$fresh" -eq 1 ]]; then
        cat > "$env_file" <<EOF
# Generated by scripts/deploy-client.sh for client '$slug'.
# Per-client Pulsegrid deployment. KEEP PRIVATE (chmod 600).
# Re-running deploy-client.sh preserves these values; edit freely.

NODE_ENV=production
PORT=$api_port
WEB_PORT=$web_port
LABEL_PROFILE=$slug

# REQUIRED — generated. The server refuses to start without a 16+ char secret.
JWT_SECRET=$jwt_secret

# Environment-level admin login (first access / smoke tests).
ADMIN_EMAIL=$admin_email
ADMIN_PASS=$admin_pass

DB_DIALECT=sqlite
DB_STORAGE=$dir/data/$slug.sqlite
USE_REAL_DATA=false
GROQ_API_KEY=

EMAIL_FROM=notify@pulsegrid.fm
# PLACEHOLDER — set the real public domain once DNS exists, then restart.
RESET_LINK_BASE=https://$slug.pulsegrid.fm/reset-password
ALLOWED_ORIGINS=https://$slug.pulsegrid.fm

# Scheduled jobs (monthly reports etc.) stay off until the client is real.
SCHEDULE_JOBS=false

# --- Stripe -------------------------------------------------------------------
# Variable names below match the billing workstream (src/routes/billing.js).
# Fill in TEST-mode values before selling; see DEPLOY.md.
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=
# STRIPE_SETUP_PRICE_ID=
# STRIPE_SUBSCRIPTION_PRICE_ID=
# STRIPE_SUCCESS_URL=
# STRIPE_CANCEL_URL=
# STRIPE_STUB=   # stub mode (dev/test) — see billing docs before enabling
EOF
        chmod 600 "$env_file"
    else
        ensure_env_key "$env_file" NODE_ENV production
        ensure_env_key "$env_file" PORT "$api_port"
        ensure_env_key "$env_file" WEB_PORT "$web_port"
        ensure_env_key "$env_file" LABEL_PROFILE "$slug"
        ensure_env_key "$env_file" JWT_SECRET "$jwt_secret"
        ensure_env_key "$env_file" ADMIN_EMAIL "$admin_email"
        ensure_env_key "$env_file" ADMIN_PASS "$admin_pass"
        ensure_env_key "$env_file" DB_DIALECT sqlite
        ensure_env_key "$env_file" DB_STORAGE "$dir/data/$slug.sqlite"
        ensure_env_key "$env_file" USE_REAL_DATA false
        ensure_env_key "$env_file" EMAIL_FROM notify@pulsegrid.fm
        ensure_env_key "$env_file" SCHEDULE_JOBS false
        chmod 600 "$env_file"
    fi

    # --- app code ---------------------------------------------------------------
    if [[ -n "$(git -C "$REPO_DIR" status --porcelain)" ]]; then
        log "WARNING: working tree is dirty — deploying committed HEAD only; uncommitted changes are NOT deployed"
    fi
    if [[ -d "$dir/app" ]]; then
        local ts rollback
        ts="$(date +%Y%m%d-%H%M%S)"
        rollback="$dir/app.prev-$ts"
        mv "$dir/app" "$rollback"
        log "previous code tree kept as app.prev-${ts} (rollback: swap it back, restart)"
        # Keep only the 3 newest rollback copies (code only — data/ is never touched).
        # (|| true: no previous copies on a first deploy must not fail under set -e + pipefail.)
        ls -dt "$dir"/app.prev-* 2>/dev/null | tail -n +4 | xargs -r rm -rf || true
    fi
    mkdir -p "$dir/app"
    git -C "$REPO_DIR" archive HEAD | tar -x -C "$dir/app"
    log "app code deployed from $(git -C "$REPO_DIR" rev-parse --short HEAD)"
    # Deployment tooling ships with the app tree but is not necessarily committed
    # yet (this script itself is uncommitted by design). Copy it explicitly from
    # the working tree so the deployed client is self-contained.
    if [[ -f "$REPO_DIR/scripts/serve-static.js" ]]; then
        cp "$REPO_DIR/scripts/serve-static.js" "$dir/app/scripts/serve-static.js"
        log "deployment tooling staged: scripts/serve-static.js"
    fi

    # --- deps + frontend build ----------------------------------------------------
    local node_bin
    node_bin="$(command -v node)" || die "node not found in PATH"
    log "installing backend deps (npm ci)…"
    (cd "$dir/app" && npm ci --no-audit --no-fund)
    log "installing frontend deps and building (npm ci && npm run build)…"
    # VITE_API_BASE_URL empty => the frontend calls /v3/... relative to its own
    # origin, which the -web service (or the reverse proxy) serves.
    (cd "$dir/app/web" && npm ci --no-audit --no-fund && VITE_API_BASE_URL= npm run build)
    [[ -f "$dir/app/web/dist/index.html" ]] || die "frontend build did not produce web/dist/index.html"

    # --- systemd user units ---------------------------------------------------------
    local api_unit="pulsegrid-${slug}" web_unit="pulsegrid-${slug}-web"
    cat > "$UNIT_DIR/${api_unit}.service" <<EOF
[Unit]
Description=Pulsegrid API — client ${slug}
After=network.target

[Service]
Type=simple
WorkingDirectory=${dir}
EnvironmentFile=${env_file}
ExecStart=${node_bin} app/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
    cat > "$UNIT_DIR/${web_unit}.service" <<EOF
[Unit]
Description=Pulsegrid web frontend — client ${slug}
After=network.target
BindsTo=${api_unit}.service

[Service]
Type=simple
WorkingDirectory=${dir}
Environment=PROXY_API_PORT=${api_port}
ExecStart=${node_bin} app/scripts/serve-static.js app/web/dist ${web_port}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

    systemd_user daemon-reload
    systemd_user enable --now "$api_unit"
    systemd_user enable --now "$web_unit"

    # --- verify ---------------------------------------------------------------------
    log "waiting for API health on 127.0.0.1:$api_port …"
    if ! wait_for_health "$api_port"; then
        err "API did not become healthy within 60s. Last log lines:"
        systemd_user status "$api_unit" --no-pager -n 30 >&2 || true
        die "deploy failed at the health check (client dir kept at $dir for inspection)"
    fi
    # The -web service proxies /health and /v3/* to the API, so this proves the
    # whole same-origin stack answers.
    curl -fsS -o /dev/null "http://127.0.0.1:${web_port}/health" \
        || die "frontend gateway did not proxy /health (API is up; check the -web unit)"
    curl -fsS "http://127.0.0.1:${web_port}/" | grep -q '<div id="root"' \
        || die "frontend did not serve the app shell"
    log "health checks passed"

    # --- summary ----------------------------------------------------------------------
    cat <<EOF

==============================================================
 Pulsegrid client '$slug' is up
--------------------------------------------------------------
 API:   http://127.0.0.1:$api_port        (GET /health)
 Web:   http://127.0.0.1:$web_port        (frontend; /health and /v3/* proxied to the API)
 Data:  $dir/data/$slug.sqlite
 Units: $api_unit / $web_unit   (systemctl --user)
 Logs:  journalctl --user -u $api_unit -f
EOF
    if [[ "$fresh" -eq 1 ]]; then
        cat <<EOF
 Admin: $admin_email
 Pass:  $admin_pass   (shown once — also stored in $env_file)
EOF
    fi
    cat <<EOF
--------------------------------------------------------------
 NEXT STEPS (details in DEPLOY.md):
  1. Point DNS $slug.pulsegrid.fm at this host.
  2. Put Caddy/nginx in front:  / -> 127.0.0.1:$web_port,
     /v3/* and /health -> 127.0.0.1:$api_port   (snippet in DEPLOY.md).
  3. Set the real RESET_LINK_BASE + ALLOWED_ORIGINS in .env, then:
       systemctl --user restart $api_unit
  4. Add Stripe TEST keys to .env (names owned by the billing workstream).
  5. Change the seeded label passwords; SCHEDULE_JOBS is off until needed.
==============================================================
EOF
}

# ---------------------------------------------------------------- main ------

DESTROY=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        --destroy) DESTROY=1; shift ;;
        -h | --help) usage; exit 0 ;;
        -*) die "unknown option: $1" ;;
        *) break ;;
    esac
done
[[ $# -eq 1 ]] || { usage; exit 1; }

if [[ "$DESTROY" -eq 1 ]]; then
    cmd_destroy "$1"
else
    cmd_deploy "$1"
fi
