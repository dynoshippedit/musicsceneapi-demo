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
