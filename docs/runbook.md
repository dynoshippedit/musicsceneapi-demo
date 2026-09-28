# The Music Scene — Operations Runbook

**Demo deployment · September 2026**

---

## 1. Launch

```bash
cd /home/dino/mau5trap-repo
./scripts/run-demo.sh
```

The script:
1. Starts the API (`node server.js`) on port 4000 (or `$API_PORT`).
2. Starts the frontend (`npm run dev` in `web/`) on port 5173 (or `$WEB_PORT`).
3. Writes PID files to `logs/*.pid`.
4. Health-checks both before returning.

Verify:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/health   # expect 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5173/          # expect 200
```

## 2. Stop

```bash
./scripts/stop-demo.sh
```

Reads the PID files and terminates exactly those PIDs. Never uses broad `pkill`.

## 3. Logs

- API: `logs/api.log`
- Web: `logs/web.log`

## 4. Backup

The demo database is SQLite. Stop the API first for a cold copy:

```bash
./scripts/stop-demo.sh
cp .demo-data/demo.sqlite backups/demo-$(date +%F).sqlite
./scripts/run-demo.sh
```

For a hot copy without stopping: `sqlite3 .demo-data/demo.sqlite "VACUUM INTO 'backups/hot.sqlite'"`.

## 5. Restore

```bash
./scripts/stop-demo.sh
cp backups/demo-2026-09-28.sqlite .demo-data/demo.sqlite
./scripts/run-demo.sh
```

Migrations run automatically on startup and back up the DB before destructive repairs.

## 6. Rollback (code)

```bash
git log --oneline -5
git revert <commit>        # or: git reset --hard <known-good>
git push demo main
./scripts/stop-demo.sh && ./scripts/run-demo.sh
```

Known-good commits:
- `37035f3` — one-command launch scripts
- `ca71369` — zero-compromise financial fixes

## 7. Demo accounts

| Role | Email | Password | Scope |
|------|-------|----------|-------|
| Admin | admin@pulsegrid.fm | admin123 | everything |
| Artist | tours@novakin.band | novakin123 | own artist only |

## 8. Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_PORT` | 4000 | API listen port |
| `WEB_PORT` | 5173 | Frontend port |
| `JWT_SECRET` | (required) | Token signing — no fallback |
| `DB_DIALECT` | sqlite | sqlite \| postgres |
| `SCHEDULE_JOBS` | true | set false to disable cron jobs |

## 9. Troubleshooting

| Symptom | Check |
|---------|-------|
| API 401 on all routes | Login first; pass `Authorization: Bearer <token>` |
| Import rejects rows | `unmatched_catalog` = ISRC/UPC not in catalog; check the per-row report |
| Port in use | `stop-demo.sh` first; check `logs/*.pid` for stale PIDs |
| Blank frontend | Check `logs/web.log`; verify API is up (frontend proxies `/v3` to it) |
| 500 on matches | Payout/deposit IDs must exist; invalid IDs are a known validation gap — use real IDs from the list endpoints |
