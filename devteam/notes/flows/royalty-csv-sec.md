<!-- Security flow note — SEC, 2026-09-29. Companion to authz-matrix.md and findings/sec.md. -->
# Flow security note — CSV import to export (flow 2, money path)

**Path:** `POST /v3/royalties/import` / `/v3/royalties/import/atvenu`
(src/routes/royalties.js:307, 693) -> RoyaltyLine/DirectSale ->
`GET /v3/financials/export` (src/routes/directsales.js:586).

**Security-relevant hops:**
1. Upload: multer memory storage, 5 MiB / 1 file cap; admin-only. Filename
   never persisted (safeFilename allowlist if used).
2. Import parsing: header-alias map, strict numeric validation; atVenu venue
   stored VERBATIM (royalties.js:639-681). Stripe `charge.description` stored
   verbatim on the sync path (src/payments/providers/stripe.js:192) ->
   DirectSale.description.
3. Export: csvCell (directsales.js:113-117) quotes commas/quotes/CR/LF per
   RFC 4180 but does NOT neutralize leading `= + - @` -> **CSV formula
   injection** (SEC-001). Attacker-influenced cells: Stripe charge
   descriptions (external), atVenu venue names (CSV import), any
   user-editable note/description field that reaches the export.
4. Money math: amounts stay integer cents / exact decimals end-to-end; the
   export path does not do float arithmetic (per MUS findings).

**Fix direction:** prefix formula-like cells with a leading apostrophe (or
use a spreadsheet-safe CSV encoder) while retaining RFC-4180 quoting —
defense belongs in csvCell itself since all export rows flow through it.
