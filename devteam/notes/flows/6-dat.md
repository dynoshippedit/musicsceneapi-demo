# Flow 6 (DAT): GDPR export / deletion

Role: Data & Integrations Specialist. Scope: data coverage of deletion and export —
what rows/fields survive, where personal data lives. Endpoint auth is SEC's lane;
test coverage is TST's (overlap with TST-003 noted).

## 6.1 Current behavior (verified in code)

- **No GDPR/data export endpoint found.** No route assembles a per-user data export
  (CSV/JSON of all personal data).
- `DELETE /v3/auth/me` destroys **only the `User` row**. The source code says it
  outright (paraphrase): *"In production, also cascade delete related data or
  anonymize logs."*
- Admin user deletion likewise destroys only the User.

## 6.2 Personal data that survives user deletion (DAT-011)

No FK cascades exist anywhere in the schema, so deletion orphans rather than cleans:

| Table | Surviving fields |
|---|---|
| `Campaign` | `userId` (plain string, no FK) |
| `RoomVote` | `userId` (plain string, no FK) |
| `AuditEvent` | `actorId`, `actorEmail` |
| Financial rows | `enteredBy`, `reviewedBy`, `importedBy`, `triggeredBy` (email strings on statements, lines, settlements, adjustments) |
| Generated artifacts | PDF/CSV monthly reports containing names/emails; application logs |

## 6.3 What's needed (recommendation, not a finding of law)

1. A deletion routine that walks the owned/attributed tables above (delete or anonymize),
   ideally in one transaction.
2. An export endpoint (`GET /v3/auth/me/export`) assembling the user's rows across tables.
3. FK or application-level cleanup so future tables can't silently reintroduce the gap.
4. Log/report retention policy for generated artifacts.

Severity rationale: the deletion flow is **explicitly incomplete by its own code comment**,
so this is S3 (correctness gap, known) rather than a hidden defect. Escalates if the
product is offered to EU/UK users where export/erasure are rights, not nice-to-haves.
