# The Music Scene — Label Intelligence Platform

A Node.js/Express label-management API with a React/Vite frontend: royalty
ingestion and reconciliation, catalog, A&R, campaigns, scheduled PDF
reporting, RBAC authentication, and opt-in AI insights.

**The Music Scene** is the product. **Pulsegrid** is the fictional demo label
used by the demo dataset — any resemblance to real artists, labels, or
companies is coincidental. Nothing in this repository is affiliated with or
endorsed by any real-world artist or management company.

Each deployment is a **dedicated instance** with its own database. There is
no shared multi-tenant service here: you run one instance per label, with
that label's own data.

## Quick start

Prerequisites: Node.js 18+, npm.

```bash
# Backend dependencies
npm install

# Frontend dependencies
cd web && npm install && cd ..
```

### One-command demo

```bash
./scripts/run-demo.sh     # API on :4000, frontend on :5173 (backgrounded)
./scripts/stop-demo.sh    # stop both
```

`run-demo.sh` boots the API with `DEMO_MODE=true` against a throwaway SQLite
database (`.demo-data/demo.sqlite`) and seeds the fictional Pulsegrid demo
dataset. Demo logins (demo mode only):

- Admin: `admin@pulsegrid.fm` / `admin123`
- Artist (Novakin): `tours@novakin.band` / `novakin123`

### Customer mode (no demo data)

Without `DEMO_MODE`, a fresh database boots **empty**: no fictional users,
artists, catalog, or royalty rows, and no known demo logins. The operator
bootstraps the first administrator via environment variables — the first
login with these credentials creates the admin account:

```bash
JWT_SECRET=<redacted>   # required, ≥ 16 chars; server refuses to start without it
ADMIN_EMAIL=you@example.com
ADMIN_PASS=<redacted>
DEMO_MODE=false                               # the default; demo seeding is opt-in
node server.js
```

See `.env.example` for the full documented variable list.

## What the platform does

- **Financial ingestion** — import royalty statements (CSV) keyed by
  ISRC/UPC/catalog key, with import history, row-level provenance, dedup
  hashing, and rejected-row reporting. Amounts are stored as integer cents
  with decimal audit fields; the pipeline never double-counts deposits or
  payouts as income.
- **Reconciliation & monthly close** — cash-evidence vs. income comparison,
  unmatched/difference review states, and a guarded month-close workflow
  (`docs/audit/05-reconciliation-provenance.md`).
- **Catalog** — recordings, releases, and works with ISRC/UPC keys and
  writer/producer credits; import-matching against statement rows.
- **A&R** — submissions with voting, and a listening-room whiteboard.
- **Campaigns & direct sales** — campaign manager; optional Stripe Connect
  (test mode) for the label's own sales, attributed per artist. The platform
  is a lens on the label's sales, not a financial custodian.
- **Reporting** — scheduled monthly PDF reports per artist
  (`src/jobs/monthlyReportJob.js`), generated with `execFile` (no shell)
  and hardened filename handling.
- **Auth & permissions** — JWT auth, role-based access control
  (admin / artist / A&R), per-artist data grants, page-level nav visibility.
  Every request is authorized server-side.
- **AI insights (opt-in)** — strategic Q&A and entity health analysis only
  when `GROQ_API_KEY` is set. AI analysis is user-initiated; a provider
  failure returns an explicit `unavailable`/`not_configured` state, never a
  canned answer.
- **Integrations** — Spotify OAuth connection + token storage; AtVenu and
  direct-sale importers. Live provider calls require real credentials (see
  below); without them the relevant paths are disabled or fixture-backed.

## Honest integration status

| Integration | Without credentials | With credentials |
|---|---|---|
| Spotify | connection UI present; sync runs are fixture-labeled, no live calls | OAuth flow + token refresh; sync adapters wired |
| Stripe | direct-sales paths inert | Connect test-mode sales attributed per artist |
| Groq (AI) | AI endpoints return `not_configured` | user-initiated insights; failures are explicit `unavailable` |
| Wikipedia (artist bios) | fixture-backed (`FIXTURE_WIKIPEDIA=1`); non-music matches rejected | live lookup with music-relevance gating |

There is no live-provider success to report beyond what your own credentials
enable. Test suites never touch the network: they inject fixtures and assert
retry, failure-visibility, and idempotency behavior deterministically.

## Tests

```bash
npm test                          # backend regression suite (node:test)
node scripts/run-visual-gate.js   # Phase 4B visual gate, self-hosted stack
```

`npm test` runs `tests/regression/*.test.js`. The visual gate spins up its
own scratch API + Vite on ephemeral ports with a throwaway database, so it
never depends on (or disturbs) a running demo instance.

## Project layout

```
server.js                 Express entrypoint (delegates to production-api.js)
production-api.js         app wiring, DB init, route mounting
src/
  config/                 env-driven configuration (DEMO_MODE, JWT, limits)
  routes/                 /v3 API routes (auth, artists, royalties, A&R, …)
  models/                 Sequelize models + initDB (demo seeding is opt-in)
  repositories/           DB-first data access (artist hybrid read, …)
  services/               ingestion, reconciliation, close, export, …
  jobs/                   scheduled jobs (monthly PDF reports, provider sync)
  ai/                     opt-in AI service (fail-closed without a provider)
  utils/                  safeFilename, money math, csv parsing, …
web/                      React/Vite frontend (index.html, src/, validation/)
tests/regression/         node:test suites; snapshots/ holds API contracts
docs/audit/               design & audit notes (01–07) for changed behavior
scripts/                  run-demo.sh, stop-demo.sh, run-visual-gate.js, …
demo/dataset-v1/          versioned deterministic demo dataset + loader
```

## Docs

- `docs/audit/01-two-repo-audit.md` — repo lineage and audit scope
- `docs/audit/02-domain-auth-persistence.md` — domain model, auth, persistence
- `docs/audit/03-financial-ingestion.md` — ingestion pipeline and money rules
- `docs/audit/04-react-workflows.md` — frontend workflows
- `docs/audit/05-reconciliation-provenance.md` — reconciliation & provenance
- `docs/audit/06-ai-analytics-automation-billing.md` — AI, automation, billing

Behavior changes land with their audit notes: if a fix changes behavior,
its note is updated in `docs/audit/` in the same commit.
