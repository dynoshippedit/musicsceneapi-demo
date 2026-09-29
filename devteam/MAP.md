# MAP — as-is codebase map
Owner: Cartographer (MAP) · Last updated: 2026-09-29 (Phase 1 — pending)

## 1. Summary
(pending Phase 1)

## 2. Stack & versions
(pending Phase 1)

## 3. Directory tree (annotated)
(pending Phase 1)

## 4. Entry points & processes
- server.js — canonical entrypoint (secret guard -> DB init -> listen); requires ./production-api
- production-api.js — Express app module (82 lines), exports app, binds no port
- src/routes/*.js — route modules; src/jobs — node-cron jobs (monthlyReportJob, providerSync)
- scripts/run-demo.sh — demo boot (API :4000 + frontend :5173, DEMO_MODE=true)

## 5. Module map (Mermaid)
(pending Phase 1)

## 6. Data stores & models
(pending Phase 1)

## 7. External services
(pending Phase 1)

## 8. Inputs (sources) & outputs (sinks)
(pending Phase 1)

## 9. Config & env
Summary only — full inventory in notes/env-inventory.md (BLD, Phase 1).

## 10. Critical flows
(pending Phase 1 — links to notes/flows/*)

## 11. Oddities
(pending Phase 1)
