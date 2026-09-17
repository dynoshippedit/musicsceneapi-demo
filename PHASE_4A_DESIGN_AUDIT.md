# PHASE_4A_DESIGN_AUDIT.md

Read-only audit of the Phase 4A visual specification.
Auditor: independent pass against the live frontend as source of truth.
No Phase 4A source documents were modified. No code was written.

Source of truth for identity:
- Primary: `mau5trap-frontend-connected.html` (the shipping workstation)
- Secondary: `mau5trap-terminal-dashboard.html` (executive companion)
- Spec under audit: `MAU5TRAP_VISUAL_DESIGN_CONTRACT.md` (authoritative visual file),
  `PHASE_4A_HANDOFF.md` §14–§16 (gate + file order), `FRONTEND_ARCHITECTURE.md` §1/§4
- Screenshots in repo (`final.jpeg`, `unreal.jpeg`, `G6lxjgsWYAA_9GA.jpeg`, `nope.jpeg`)
  are marketing/prototype captures, not the live app. They were inspected and then
  discounted where they contradict the HTML. See §0.

Question this audit answers: could a cheaper implementation model follow the
Phase 4A documents literally and still ship a generic dark SaaS / crypto-admin
dashboard instead of the mau5trap Label Intelligence operations console?

---

## 0. Screenshot vs HTML (do not mix them)

The four JPEGs are not screenshots of `mau5trap-frontend-connected.html`:

| File | What it actually is | Conflict with live HTML |
|---|---|---|
| `final.jpeg` | CRT-scanline mock: 0-radius neon-bordered cards, all-mono, horizontal nav, 🔥 emoji | Live app is a 260px left sidebar, 16px glass panels, Inter chrome, no full-screen scanlines |
| `unreal.jpeg` | "Who Uses What?" role marketing slide | Not an app screen |
| `G6lxjgsWYAA_9GA.jpeg` | A&R prototype inside a web-builder chrome (blue INBOX tags, star ratings) | Live A&R is `DemoRow` + vote buttons, no star ratings |
| `nope.jpeg` | Landing ("A Label Operations Weapon") | Not the authenticated app |

Fable correctly treated the HTML as primary. The product-requirement language
("terminal / ops-console") is closer to `final.jpeg` than to the 16px Inter
workstation; the contract already splits that difference (HTML structure +
terminal mono labels + 4px radius). This audit does **not** ask Fable to
redesign toward the JPEGs. It only flags where the **HTML's** distinctive
rules are missing from the spec.

---

## Findings

### B1 — BLOCKER — Login copy is not locked

Affected: contract §3.13–3.14; handoff §15 visual gate (login checkbox);
architecture has no login copy section.

Deficiency: The live login is the strongest identity surface in the product.
Its words, not its colors, are what stop it looking like "Sign in to continue":

```
mau5trap                         (32px Inter 700, letter-spacing -1px, lowercase)
INTELLIGENCE PLATFORM            (12px, tracking 2px)
ACCESS ID                        (not "Email")
PASSPHRASE                       (not "Password")
Forgot Password?
INITIALIZE SESSION               (loading: AUTHENTICATING...)
RESTRICTED ACCESS. UNAUTHORIZED CONNECTIONS WILL BE TERMINATED.
Authorized personnel only.
```

Evidence: `mau5trap-frontend-connected.html` L3034–3128.

The contract locks only `INITIALIZE SESSION` (in the button-verb list) and
"login card 420px / mono inputs / black-on-green". `.label` is prescribed as
the label style but **the strings are not**. Handoff visual gate checkbox:

> login card 420px, hairline border with accent tint, mono inputs, primary
> button black-on-green "INITIALIZE SESSION"

A literal implementation can ship `Email` / `Password` / `Sign in` on a 420px
green-tinted card with mono inputs and still tick that box.

Misinterpretation: DeepSeek's training prior for "dark login" is Email /
Password / Continue. Nothing in the gate fails that.

Smallest correction: add a COPY CANON block (see Minimum Required Patches #1)
and extend the gate checkbox to require ACCESS ID, PASSPHRASE, INITIALIZE
SESSION / AUTHENTICATING..., and the RESTRICTED ACCESS footer verbatim.
Forbid `Email`, `Password`, `Sign in`, `Log in`, `Continue`.

---

### B2 — BLOCKER — Brand mark is described, not specified

Affected: contract §2 (`.mau5-head` CSS loader), §3.7 ("mau5-head SVG logo
(green fill)"), §3.17; handoff §15 "sidebar ≤240px with mau5-head logo";
no SVG appears in any Phase 4A file (confirmed by search).

Deficiency: There are **two different marks** in the live file, and only one
is specified.

1. Full-page loader (L200–227): 80px CSS circle + two `::before/::after` ear
   circles. Contract §2 transcribes this. Good.
2. Sidebar logo (L3429–3443): an SVG with left/right ear circles, head circle,
   white rotated ellipses for eyes, and a white mouth path. This is the
   actual brand mark the authenticated app shows on every screen. **The SVG
   markup is not in the spec.**

The gate says "mau5-head logo" without defining which mark, viewBox, fills,
or file path. Remixicon has no mau5-head. The implementation model will
substitute `ri-headphone-line`, a green circle, or an inline "M".

Misinterpretation: "logo" → generic icon in the accent color.

Smallest correction: paste the live SVG (night-mode fills only: ears/head
`#00FF5F` or `var(--color-accent)`, eyes/mouth `#fff`) into the contract as
the canonical `Mau5Head` mark, state it is a committed asset
(`web/src/assets/mau5head.svg` or a 15-line component), and add a gate
checkbox: sidebar contains that SVG, not a Remixicon placeholder.

---

### B3 — BLOCKER — Phase 4B slice can pass as a 4-KPI crypto-admin template

Affected: handoff §15 scope ("ONE real widget: 4 StatCards") and visual gate
last checkbox ("logo-cropped screenshot still reads as the mau5trap console");
architecture §4 (full dashboard = StatCards + chart + map + table + console);
contract §3.4 / §3.10.

Deficiency: The live dashboard identity is a **composition**, not four cards:

```
[ Total Revenue ] [ Total Streams ] [ Active Artists ] [ Avg ROI ]
[ ForecastChart          ] [ FanHeatmap              ]
[ Top Performers table (2fr)     ] [ AI console (1fr) ]
```

Evidence: L3537–3656 and L3726–3796. The right-rail console (scanline well,
`// System ready.`, mono input, `ri-brain-line`) is what makes the screen a
workstation rather than a KPI row. The 4B slice explicitly builds **only**
the four StatCards. The rest of `<main>` is unspecified: empty black void,
or free for the model to "fill nicely".

The only identity stop in the gate is a subjective `[judge]` screenshot
line. A cheaper model and a cheaper reviewer will pass: black page, Inter
sidebar titled "Dashboard", four green-left-rule metric cards, "Welcome
back". That is indistinguishable from a crypto-admin / Mixpanel-dark
template, and it still satisfies every mechanical grep in contract §5.

The user-requested slice (login → shell → nav → one real widget) is the
right *functional* gate. It is not a sufficient *visual* gate unless the
slice also locks copy, logo, login ceremony, the four exact KPI labels, and
a ban on invented chrome.

Misinterpretation: "one dashboard widget" → four shadcn-like StatCards and
an empty content well; identity deferred to 4C; 4C then copies the generic
language established in 4B.

Smallest correction (does **not** expand slice into charts/maps/AI):
1. Lock the four KPI labels/values format to the live strings
   (`Total Revenue` `$X.XM`, `Total Streams` `$X.XM`, `Active Artists`,
   `Avg ROI` `Nx`) and the 4-column grid.
2. State: the remainder of `/dashboard` in Phase 4B is empty black canvas.
   Do not invent Welcome banners, date pickers, filters, extra cards, or
   placeholder charts.
3. Replace the subjective screenshot checkbox with the copy/logo/login
   mechanical checks in B1/B2 plus "no extra widgets on /dashboard".
4. Keep the `[judge]` line as a secondary FAIL, not the primary one.

---

### M1 — MAJOR — Login geometry conflicts with the panel-padding rule

Affected: contract §3.1 ("padding `--panel-pad` (16px), max 20px") vs live
login (L3040: `padding: '48px'`, `maxWidth: '420px'`) vs §4 anti-pattern
("any `.panel` with padding > 20px" is a FAIL).

Deficiency: The login card **is** a `.glass-panel` / `.panel`. Followed
literally, §3.1 + §4 force the ceremonial login down to 16–20px padding,
which destroys the centered access-terminal look. Followed against the
HTML, the implementer violates their own FAIL list. Either path is drift.

Also omitted from the contract (present in HTML L3038): the login's own
`radial-gradient(circle at 50% 50%, rgba(0, 255, 0, 0.05) 0%, transparent 50%)`.
§4 claims this "is folded into `--gradient-decoration`". It is not:
`--gradient-decoration` is a top-down linear wash, not a centered radial.
Literal implementation loses the login glow.

Misinterpretation: cramped 16px-pad login card on a flat `#0A0A0A` page,
or a second invented gradient to "make it feel special".

Smallest correction: add an explicit **Login exception** — card max-width
420px, padding 48px, radius `--radius-panel`, border
`--border-panel-accent`; page background may use a single centered radial
`rgba(0,255,95,0.05)` in addition to `--gradient-decoration`; this card is
exempt from the 20px panel-pad FAIL. Do not change the token scale.

---

### M2 — MAJOR — Distinctive chrome copy is scattered, not canonical

Affected: contract §3.7, §3.8, §3.17–3.19, §3.21; handoff §15; no COPY CANON.

Deficiency: Live strings that carry identity, currently only partly locked:

| Live string | Locked? |
|---|---|
| `Terminate Session` | yes, §3.7 |
| `INTELLIGENCE PLATFORM` | yes, §3.7 |
| `INITIALIZE SESSION` / `AUTHENTICATING...` | half (button list; loading string omitted) |
| `ACCESS ID` / `PASSPHRASE` | **no** |
| `RESTRICTED ACCESS. UNAUTHORIZED CONNECTIONS WILL BE TERMINATED.` | **no** |
| `// System ready.` / `// Waiting for input...` / `// Analyzing neural patterns...` | yes, §3.17/3.21 |
| `CONNECTION FAILURE` / `RETRY CONNECTION` | yes, §3.18 (legacy title case "Connection Failure" — contract uppercases it; fine) |
| `INITIALIZING NEURAL LINK...` (L3411) | **no** |
| Header subtitle `Real-time label performance metrics` (L3526) | **no** |
| Console title live: `Groq Intelligence` (L3729) | correctly retired (vendor-neutral). Replacement title **not given**. §3.21 says `"Intelligence"` — too generic; live-without-vendor would be `COMMAND CENTER` / `AI CONSOLE`. Unspecified. |
| Wordmark `mau5trap` (all lowercase, never "Mau5trap" / "MAU5TRAP") | implied, not FAIL-listed |

Misinterpretation: "Dashboard" / "Overview of your workspace" / "Sign out" /
"Email" / console titled "Assistant".

Smallest correction: one COPY CANON appendix in the contract, and a grep
FAIL for `Sign in|Log in|Email|Password|Sign out|Welcome back` in `web/src`.

---

### M3 — MAJOR — `/dashboard` layout for the slice is not drawn

Affected: architecture §4 (full composition); handoff §15 (4 StatCards only);
contract §3.4 (4 across, ≤120px, 16px gaps) — no ASCII wireframe of the
slice screen at 1440×900.

Deficiency: Implementer must decide header subtitle, whether the 2fr/1fr
grid exists empty, whether a page title of `"dashboard"` (legacy L3524
capitalizes the tab id → "Dashboard") is acceptable, and how much
whitespace sits under four 120px cards on a 900px-tall viewport. Four short
cards on a black field with large leftover whitespace **is** the
excessive-whitespace anti-pattern the contract is trying to prevent, and
the density rule ("at least as many data points above the fold as legacy")
cannot be met by four cards alone. The slice as scoped will fail its own
density rule if that rule is applied to `/dashboard`.

Misinterpretation: either (a) stretch/enlarge StatCards to fill the void
(violates ≤120px) or (b) invent more widgets to fill it (violates slice
scope) or (c) leave a sparse page and hope the `[judge]` line is lenient.

Smallest correction: state in §15 that the density rule is **waived for
the 4B slice only** because charts/table/console are 4C; the slice is
allowed to look sparse below the KPI row; inventing fillers is a FAIL.
Do not change the 4C density rule.

---

### M4 — MAJOR — AI settings still has a chatbot-shaped hole

Affected: contract §3.21 (console — good); handoff §12 ASCII settings
wireframe; architecture §8.5; contract §4 vendor-name grep.

Deficiency: The console is specified tightly (well, scanline, `//` idle,
mono input, no vendor logo). `/settings/ai` is an ASCII box of labels.
Missing mechanical FAIL rules that stop a ChatGPT/Claude settings page:

- no chat bubbles / user–assistant message rows / three-dot typing
- no vendor logos, model marketplace cards, pricing tiers, "Try GPT-4o"
- no rounded composer bar, avatar stack, or conversation history pane
- selectors are native `<select>` or a compact `.panel` list, 32px tall,
  not 72px image-cards
- BYOK placeholder is one muted `//` line, not a "Add your API key" form

Phase 4B does not build this page, so this is not a 4B gate blocker. It
will derail 4C the moment Settings › AI is reached.

Misinterpretation: shadcn "AI playground" template with provider cards.

Smallest correction: add the bullet list above to contract §3.21 and a
`[grep]/[judge]` FAIL in §4. Do not redesign the settings IA.

---

### M5 — MAJOR — Error/loading full-page vs in-panel is ambiguous

Affected: contract §3.17–3.18; handoff §15 ("LoadingScreen during fetch;
ErrorState with RETRY"; visual: "danger-tinted panel").

Evidence: live dashboard fetch failure is a **full viewport**
`.loading-screen` with 48px `ri-error-warning-line`, title
"Connection Failure", solid `#ff3333` `RETRY CONNECTION` (L3394–3408).
Live loading is the full-viewport mau5-head (L3388–3391).

Contract §3.18 describes an in-place panel. The gate says "danger-tinted
panel". Slice fetch of `/v3/label/overview` is the equivalent of the live
full-page path. Implementer must choose.

Misinterpretation: a small red alert under the header while the rest of
the shell renders empty, or a toast (forbidden, but the vacuum invites it).

Smallest correction: one sentence — initial shell data load uses the
full-viewport `LoadingScreen` / full-viewport error (legacy L3388–3409);
in-panel `ErrorState` is for subsequent widget fetches only. Do not change
colors or copy.

---

### M6 — MAJOR — 16px HTML radius vs 4px contract is an undocumented deviation

Affected: contract §1 (`--radius-panel: 4px`, comment "16px glass card
radius … RETIRED"); live `.glass-panel` L129 `border-radius: 16px`;
login inputs L3088 `borderRadius: '6px'`; nav items L3467 `8px`.

Deficiency: This audit's source of truth is the HTML. The contract
intentionally redesigns geometry. That is allowed by the product
requirement ("sharp panel geometry", "avoid giant rounded cards") but it
is **not labeled as a signed deviation**. A later model told "preserve
the existing frontend" will "fix" 4px back to 16px by reading the HTML
(handoff line-refs invite spot-checks).

Not asking Fable to revert to 16px. Asking Fable to write one sentence:
"4/2px radii are an intentional tightening versus the live 16/8/6px;
do not restore 16px from the HTML."

Misinterpretation: HTML spot-check → 16px glass cards → generic SaaS
exactly as Fable feared.

Smallest correction: that one sentence in contract §1 geometry, plus
"do not copy radius values from the HTML".

---

### M7 — MAJOR — Console title and dashboard right-rail are unspecified for 4C

Affected: architecture §4 (CommandConsole on dashboard right rail);
contract §3.21 title `"Intelligence"`; live L3729 `"Groq Intelligence"`.

Deficiency: Vendor-neutrality correctly kills "Groq". The replacement is
the generic word "Intelligence", which is also the page name and the nav
item. Live console is a **named terminal**, not a page title. Terminal
dashboard uses `grok-intelligence — v3.0` mac-traffic-light chrome
(L237–244) — contract correctly does **not** port traffic lights (those
are generic). What 4C should put in the title row is unset.

Misinterpretation: a chat panel titled "Assistant" or "AI".

Smallest correction: lock the title row copy to `COMMAND CONSOLE` (or
`AI CONSOLE`) as `.label--accent`, icon `ri-brain-line`. One string. No
layout change.

---

### N1 — MINOR — KPI `sub` line font not specified

Affected: contract §3.10 "optional 12px green delta line"; live L257
`fontSize: '12px', color: var(--primary)` (inherits Inter).

Smallest correction: `12px --font-mono` (or `--font-ui`) — pick one.
Recommend mono to match `.kpi`.

---

### N2 — MINOR — No global anti-emoji rule

Affected: contract §3.19 (empty states: no emoji); terminal dashboard
KPI cards L163/170/177 use 👥💰⚡ watermarks; `final.jpeg` uses 🔥.

Architecture consolidates the terminal dashboard into `/dashboard`.
Nothing forbids porting those emoji.

Smallest correction: §4 FAIL — no emoji as decoration, watermarks, or
status (text labels only). Do not port terminal-dashboard emoji.

---

### N3 — MINOR — `--glass` / `--primary-glow` / `--bg-dark` are undefined in the live CSS

Affected: none of the Phase 4A files (they already dropped these).
Note only: live HTML references `var(--glass)`, `var(--primary-glow)`,
`var(--bg-dark)` which are **not in `:root`**. The contract correctly
does not carry them. Do not "restore" them from the HTML.

---

### N4 — MINOR — Sidebar item radius 8px in HTML vs `--radius-control` 2px

Covered by M6. Nav pills at 2px will look sharper than live; that is
the intended tightening. Mention in the deviation sentence, no extra work.

---

### N5 — MINOR — Gate lists seeded passwords

Affected: handoff §15 functional checkbox (`admin@mau5trap.com / admin123`,
`tours@rezz.com / rezz123`).

These are already in `src/models/index.js`. Not a visual defect. No
correction required for identity. Do not spread them further.

---

## Area-by-area verdicts

### 1. Visual identity
Black hierarchy is locked (`#0A0A0A` / `#050505` / `#111` / `#161616` /
panel rgba). Green hierarchy L1–L4 is locked and grep-able. Glow is
correctly restricted. Contrast tokens are explicit.

What is **not** locked is the *character*: the ceremonial login copy,
the SVG mark, and the console-in-the-rail composition. Tokens alone
produce "dark green analytics". The character lives in those three
surfaces. **FAIL pending B1–B3.**

### 2. Geometry and layout
Radius/border/spacing tokens are concrete. Sidebar width, gutter, row
height, KPI height are concrete. The 16→4px change is a real deviation
from HTML (M6) but it is specified, not vague.

Slice dashboard layout is not drawn (M3). Login padding fights the
panel rule (M1). **FAIL pending M1/M3.**

### 3. Typography
Mono-for-numbers is locked and grep-able. `.label` as the identity move
is correct (and actually *stricter* than the workstation HTML, which
used Inter for StatCard labels — this is a good steal from the terminal
dashboard). Login/header/console title strings are not locked (B1, M2,
M7). **PASS on scale; FAIL on copy.**

### 4. Components
StatCard anatomy (2px left rule, 32px mono value) is locked — this is
the best-specified component. Tables, buttons, badges, maps, charts are
specific enough to implement without invention.

Login, brand mark, full-page vs in-panel error, and the dashboard
composition are not. **FAIL for the 4B set (login/shell/nav/KPI).**

### 5. Multi-provider AI UI
Console: specified in the ops-console language (scanline, `//` idle,
mono). Good. Settings › AI: ASCII only; chatbot FAIL rules missing (M4).
Vendor names correctly forbidden as literals. Not in the 4B slice.
**PASS for 4B; FAIL for 4C until M4/M7 patched.**

### 6. Design tokens
Sufficient to constrain backgrounds, surfaces, greens, text, borders,
radii, spacing, type scale, glow, status colors. Insufficient to
constrain **copy, mark, and composition** — which is where identity
actually lives. Tokens will not save a generic login.

### 7. Anti-SaaS constraints
Mechanical greps (no blue/purple hex, no Tailwind/MUI, no `alert()`, no
raw hex outside tokens) will stop Linear/Vercel/purple-SaaS.

They will **not** stop:
- crypto-admin (neon green + black + mono KPIs + left bars) — this is
  the residual look of a spec-compliant 4-StatCard slice
- dark analytics template — same
- consumer AI settings page — later, M4

The `[judge]` "logo-cropped, is this mau5trap?" line is the right
question and the wrong gate: it is not mechanical, and it is the only
thing standing in front of those three lookalikes.

### 8. Phase 4B vertical-slice gate
Functional checks are concrete enough (auth, 4 real numbers, role-filtered
nav, 401, build). Visual checks are 80% mechanical and 20% the one
subjective line that has to do all the identity work. Missing from the
gate: login copy, SVG mark, ban on extra widgets, login padding exception.
**Not safe to begin.**

---

## DESIGN CONTRACT VERDICT: FAIL

The token sheet and most component rules are good. They constrain *how
to color a dashboard*. They do not constrain *which dashboard this is*.
A competent cheaper model can comply with every `[grep]` in §4–§5 and
still ship Email/Password login, a Remixicon sidebar, four generic KPI
cards, and a "Welcome back" header — i.e. a dark SaaS admin with a green
accent.

## PHASE 4B SAFE TO BEGIN: NO

## MINIMUM REQUIRED PATCHES

Fable patches `MAU5TRAP_VISUAL_DESIGN_CONTRACT.md` and the §15 gate in
`PHASE_4A_HANDOFF.md` only. No new palette, type scale, routes, or
component architecture. No HTML edits.

1. **COPY CANON** (new contract appendix, ~20 lines). Verbatim:
   - Wordmark: `mau5trap` (all lowercase). Sublabel: `INTELLIGENCE PLATFORM`.
   - Login labels: `ACCESS ID`, `PASSPHRASE`. Submit: `INITIALIZE SESSION`.
     Loading: `AUTHENTICATING...`. Footer: `RESTRICTED ACCESS. UNAUTHORIZED CONNECTIONS WILL BE TERMINATED.`
   - Logout: `Terminate Session`.
   - KPI labels: `TOTAL REVENUE`, `TOTAL STREAMS`, `ACTIVE ARTISTS`, `AVG ROI`.
   - Console title: `COMMAND CONSOLE`. Idle: `// System ready.` / `// Waiting for input...`.
   - Error: `CONNECTION FAILURE` + `RETRY CONNECTION`.
   - Grep FAIL: `Sign in|Log in|Email|Password|Sign out|Welcome back`.

2. **Paste the live sidebar SVG** into the contract (L3429–3443, night
   fills only) as `Mau5Head`. Gate: sidebar uses that mark, not Remixicon.

3. **Login exception** in §3.1/§4: 420px card, 48px padding, accent
   hairline, optional centered radial `rgba(0,255,95,0.05)`; exempt from
   the 20px panel-pad FAIL.

4. **Slice composition** in handoff §15: four StatCards, those four
   labels, 4-col grid, remainder of `/dashboard` empty. No invented
   widgets. Density rule waived for 4B only.

5. **Gate checkboxes** added (mechanical):
   - login shows ACCESS ID, PASSPHRASE, INITIALIZE SESSION, RESTRICTED ACCESS footer
   - sidebar contains the specified SVG
   - `/dashboard` has exactly four StatCards and no other widgets
   - no `Email`/`Password`/`Sign in`/`Welcome back` strings

6. **One-sentence radius deviation** (contract §1): 4/2px is intentional
   vs live 16/8/6; do not restore HTML radii.

7. **Error scope** one sentence: initial shell fetch = full-viewport
   loader/error; in-panel ErrorState is for later widget fetches.

8. **AI settings anti-chatbot FAIL list** (contract §4; for 4C, cheap
   to add now): no bubbles, no vendor logos, no model cards, no composer
   bar; selectors 32px; BYOK is one `//` line.

Patches 1–5 are required before Phase 4B. Patches 6–8 are required
before 4B if they can be done in the same edit; they are not optional
for 4C.
