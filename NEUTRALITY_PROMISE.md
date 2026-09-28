# Neutrality Promise

**One customer, one database. No exceptions.**

Every deployment of this platform serves exactly one label, and that label's
data lives in exactly one database that no other customer can reach.

## What this means in practice

- **SQLite (default):** each deployment points at its own database file via the
  `DB_STORAGE` environment variable (default: the active label profile's
  `sqliteFile`, e.g. `pulsegrid_v5.sqlite`). Two labels never share a file.
- **PostgreSQL (optional):** each deployment gets its own `DATABASE_URL`.
  Schemas are never shared between customers.
- There is no "label_id" column scoping trick and no multi-tenant query
  filtering to get wrong. Isolation is physical, not logical: a bug in a
  `WHERE` clause cannot leak one label's royalties, contracts, or A&R data
  into another's, because the other label's data is simply not in the database.
- Backups, exports, and deletion are per-customer operations. Deleting a
  customer's database deletes everything of theirs and nothing of anyone
  else's.

## What this does not promise

- This is not a multi-tenant SaaS: one running instance serves one label.
  Serving N labels means N instances and N databases (the one-command deploy
  script in `scripts/` makes that cheap).
- Application-level access control (admin vs. artist roles, per-artist
  scoping) still applies *within* a customer's database. The neutrality
  promise is about isolation *between* customers.
- **Not a financial custodian:** the platform is a lens on the label's own
  sales and statements, not a custodian of the label's funds. Payment
  integrations are read-only and opt-in; the label keeps its own source
  records. See [FINANCIAL_DATA_POLICY.md](FINANCIAL_DATA_POLICY.md).

## Governance: one database is necessary, not sufficient

Physical separation is the foundation. These controls sit on top of it —
without them, "one database per customer" is an incomplete promise.

### Access controls

- **Authentication on every route.** All API routes require a bearer token
  except a documented allowlist (health checks, login, OAuth callbacks —
  each pinned by the route-table test). There is no anonymous access to
  customer data.
- **Role separation.** `admin` vs `artist` roles; artists are scoped to
  their own grants via `hasArtistAccess` (fail-closed: no grants → 403).
  Financial imports, mapping management, and review transitions are
  admin-only.
- **No shared credentials.** Each deployment has its own secrets
  (`JWT_SECRET`, `OAUTH_TOKEN_KEY`, provider keys). Secrets are
  environment-provided, never committed, never shared between customers.

### Auditable support access

- Operator/support access to a customer's database is **never implicit**.
  It requires the customer's consent, is **time-boxed**, **read-only by
  default**, and every access is written to the append-only `AuditEvent`
  table (actor, action, resource, timestamp) the customer can export.
- There is no "god mode" query path: support tooling goes through the same
  API and the same access controls as everyone else, so the audit trail
  cannot be bypassed.

### Encryption

- **In transit:** TLS everywhere the deployment terminates HTTP. No
  plaintext credentials or financial data on the wire.
- **At rest:** SQLite database files live under the deployment's own
  filesystem permissions (0600); PostgreSQL deployments use
  provider-managed encryption at rest. Backup files are encrypted before
  they leave the host.
- **Key management:** encryption keys and API secrets are environment-held,
  rotated on compromise, and never embedded in code, logs, or exports.

### Deletion rules

- **Customer-initiated deletion is complete:** deleting the customer's
  database (SQLite file) or dropping their database (PostgreSQL) removes
  everything of theirs — financial records, catalog, credentials — and
  nothing of anyone else's, because no one else's data is in it.
- **Backups rotate:** encrypted backups age out on a documented schedule;
  a deletion request includes backup expiry, not just the live database.
- **Disconnect ≠ delete:** revoking an integration (e.g. Stripe Connect)
  destroys the stored credentials immediately; imported records remain
  because they are the label's own books, not the platform's property.

### Contract terms: no secondary use

The hosting agreement must prohibit secondary use of customer data
**without the customer's explicit written permission**:

- No training machine-learning models on customer data.
- No selling, renting, or sharing customer data with third parties.
- No cross-customer analytics or benchmarking except through the separate,
  opt-in benchmarking product described below (which has its own
  contractual permission, aggregation thresholds, and anonymization).
- Financial records are the label's records; the platform asserts no
  ownership interest in them.

## Benchmarking is not part of this promise

Cross-customer benchmarking (e.g. "labels like yours pay X") **conflicts** with
one-database-per-customer and is therefore **not offered by default** — there
is no query path from one customer's database into another's, and none will be
added implicitly.

If benchmarking is ever built, it will be a **separate, explicit opt-in
product**, not a default feature:

- Participation requires the customer's **written contractual permission**,
  separate from the hosting agreement.
- Published benchmarks are computed only from **aggregated, anonymized**
  contributions with a **minimum aggregation threshold** (no benchmark cell is
  computed from fewer than N contributors, so no single label's figures are
  identifiable or reverse-engineerable).
- A customer who does not opt in contributes nothing and sees nothing.

Until that product exists, the rule is simple: your data never leaves your
database for anyone else's benefit.

## Why it matters

Royalty statements, unreleased recordings, contract terms, and A&R
deliberations are the most sensitive data a label holds. Logical separation
("we filter by tenant in every query") has a long history of failing
silently. Physical separation fails loudly or not at all — which is the only
kind of promise worth making about money and unreleased music.

*Consistent with `BRAND_PORTABILITY_AUDIT_RECHECK.md` §15.3 (`db.sqliteFile`,
`DB_STORAGE` override): the deployment seam for one database per customer.*
