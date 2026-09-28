# Open-Core Recommendation — The Music Scene

**Status:** recommendation only. The `LICENSE` file is unchanged (MIT) and no
code has been moved. Final licensing decision is Dino's call.

## The question

Should this codebase split into an open core + commercial extensions, and if
so, where is the line?

## Recommendation: yes, open-core — but not yet

The split makes sense **once there is a second paying customer**, not before.
Right now there is one demo distribution and zero production deployments. A
premature split creates two things to maintain for an audience of one. The
right move today is to **draw the line on paper** (this document) so the code
stays splittable, and execute the split when customer #2 signs.

## Proposed line

### Open (MIT, public repo)

Everything a label's own engineers need to run, extend, and audit the
platform without us:

- Data schemas and migrations (`src/models/`, catalog/royalty shapes)
- The full OpenAPI contract (`openapi.json`) and route semantics
- Import-format specifications (royalty CSV, atVenu settlement CSV) and
  their per-row report contracts
- The provenance contract (`{source, observedAt, basis}` on every metric)
- Entity-audit provider interfaces and scoring weights
- The neutrality-promise architecture (one database per customer)
- Client SDK / type definitions (when built)
- Demo profile + fictional Pulsegrid roster (what's public today)

Rationale: openness here is the sales argument. A label trusting us with
royalty money wants to read the money code. The import formats and the
provenance contract are more valuable as standards than as secrets.

### Commercial (private repo, licensed per deployment)

Everything that costs us to operate or that is deployment-specific:

- Production connector operations: OAuth token management runbooks,
  credential rotation, provider quota management
- The one-command deployment tooling (`scripts/deploy-client.sh` evolution),
  monitoring, backup/restore automation
- Managed hosting itself (the per-customer instances)
- Reconciliation and recovery workflows (what happens when a distributor
  statement doesn't match the catalog — the judgment-heavy part)
- Priority support, SLAs, onboarding/migration services

Rationale: nobody self-hosts their royalty pipeline to save money; they pay
for "it works on settlement day and someone answers the phone." The
commercial layer sells outcomes, not code.

## What must NOT move

- Existing MIT releases stay MIT. You cannot retroactively close what is
  already public; the open core must remain genuinely useful or the split
  reads as a rug-pull.
- The fictional Pulsegrid demo data stays open (it's the evaluation path).
- The neutrality promise ("one customer, one database") is architectural and
  applies to both sides; it must never become a paid feature.

## Practical next steps (when customer #2 arrives)

1. Extract `dynoshippedit/musicsceneapi` (open core) from the current demo
   repo; the demo becomes a thin consumer.
2. Move `scripts/deploy-client.sh` + ops runbooks to the private repo.
3. Publish the import-format specs as versioned documents (they're already
   written; they just need version numbers).
4. Decide the commercial license then (per-label annual, per-artist-seat, or
   revenue-share — unknowable before the first negotiation).

## Open questions for Dino

- Price anchor: is the commercial offer priced per label, per artist, or as
  a share of recovered royalties? (Can't answer without a first customer
  conversation.)
- Trademark: "The Music Scene" as a product name — worth protecting before
  the open core ships under it?
- Contributor policy: accept outside PRs to the open core, or keep it
  read-only until there's a maintainer bench?
