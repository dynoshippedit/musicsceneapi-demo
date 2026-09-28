# PULSEGRID VISUAL DESIGN CONTRACT

Authoritative visual specification for the pulsegrid Label Intelligence
frontend. `FRONTEND_ARCHITECTURE.md` and `PHASE_4A_HANDOFF.md` reference this
file; they do not restate it. When the two disagree, THIS file wins.

This is a contract, not a mood board. Every rule is written so the
implementation model (or a reviewer) can check compliance mechanically —
by grep, by measuring a CSS value, or by answering a yes/no question.

---

## 0. Identity statement

The product is an **operations console for a music label** — a dark
intelligence workstation, not a marketing dashboard. It reads like a
terminal that grew a data layer: black environment, one neon green doing all
the signalling, monospace for anything that is a number or an identifier,
tight sharp panels packed with information.

Reference artifacts (read-only, do not edit): `pulsegrid-frontend-connected.html`
(the `:root` block at L30-52 and the sidebar/console at L3416-3796) and
`pulsegrid-terminal-dashboard.html` (the Tailwind theme at L24-46 and the
terminal at L233-267). The contract below is those two files' shared
identity, normalized and tightened — it is NOT a new design.

---

## 1. Tokens — `web/src/styles/tokens.css`

Copy this block verbatim. Component CSS reads ONLY these variables; no
component file may declare a raw hex/rgb color, font-family, or radius.

```css
:root {
  /* ============ NEUTRAL ENVIRONMENT ============ */
  --color-bg:            #0A0A0A;   /* page background. "Charcoal black". */
  --color-bg-deep:       #050505;   /* console output wells, input troughs, code blocks */
  --color-surface-1:     #111111;   /* solid panel alternative, skeleton blocks, table header bg */
  --color-surface-2:     #161616;   /* hover row, nested panel inside a panel */
  --color-panel:         rgba(20, 20, 20, 0.75);   /* standard panel fill (over the body gradient) */
  --color-input-bg:      rgba(0, 0, 0, 0.30);

  /* ============ GREEN — THE ONLY SIGNAL COLOR ============ */
  --green-500:           #00FF5F;   /* pulsegrid neon. Level-1 accent. */
  --green-300:           #66FF9F;   /* hover/lift of level-1 text only */
  --green-700:           #00A63E;   /* pressed state of primary button */
  --green-a20:           rgba(0, 255, 95, 0.20);
  --green-a10:           rgba(0, 255, 95, 0.10);   /* "primary-dim": active nav, badge fills, hover fills */
  --green-a05:           rgba(0, 255, 95, 0.05);   /* whisper tint: highlighted rows, shortlist bg */
  --color-accent:        var(--green-500);         /* components use --color-accent, never --green-500 directly,
                                                      so a future alternate theme swaps ONE line */
  --color-accent-dim:    var(--green-a10);
  --color-accent-faint:  var(--green-a05);

  /* ============ TEXT ============ */
  --color-text:          #F5F5F5;   /* primary */
  --color-text-muted:    #B5B5B5;   /* secondary labels, table body secondary cells */
  --color-text-dim:      #666666;   /* chart ticks, placeholders, "// system ready" console idle text */
  --color-text-faint:    #444444;   /* disabled icons, inactive vote buttons */
  --color-text-on-accent:#000000;   /* text on a solid green fill is ALWAYS black */

  /* ============ STATUS (semantic; each pairs with a text label, never color-alone) ============ */
  --color-success:       var(--green-500);
  --color-warning:       #FFA500;
  --color-warning-dim:   rgba(255, 165, 0, 0.12);
  --color-danger:        #FF4444;
  --color-danger-dim:    rgba(255, 50, 50, 0.10);
  --color-danger-border: rgba(255, 50, 50, 0.30);
  --color-info:          #00E5FF;   /* RESTRICTED: tier "core" in NetworkGraph legend + info badges only */
  --color-tier-dev:      #D500F9;   /* RESTRICTED: tier "developing" in NetworkGraph legend ONLY.
                                       Never a button, link, nav, heading, or general accent. */

  /* ============ BORDERS ============ */
  --border-color:        rgba(255, 255, 255, 0.10);
  --border-color-strong: rgba(255, 255, 255, 0.18);
  --border-color-accent: rgba(0, 255, 95, 0.35);
  --border-panel:        1px solid var(--border-color);
  --border-panel-accent: 1px solid var(--border-color-accent);

  /* ============ GEOMETRY ============ */
  --radius-control:      2px;    /* buttons, inputs, selects, badges (square-ish) */
  --radius-panel:        4px;    /* panels, cards, modals, chart/map containers */
  --radius-pill:         999px;  /* ONLY: status pills <= 22px tall, avatar circles, the legacy mark loader */
  /* No other radius values exist. 16px "glass card" radius from the legacy file is
     deliberately RETIRED — it is the single biggest source of generic-SaaS drift. */

  /* ============ GLOW / SHADOW ============ */
  --glow-accent:         0 0 10px rgba(0, 255, 95, 0.50);   /* status dots, focus ring, console cursor */
  --glow-accent-soft:    0 0 6px  rgba(0, 255, 95, 0.35);
  --glow-danger:         0 0 10px rgba(255, 68, 68, 0.50);
  --shadow-overlay:      0 0 50px rgba(0, 0, 0, 0.60);      /* modals / lightbox ONLY */
  /* Panels at rest have NO box-shadow. Text has NO text-shadow except .text-neon on <= 4 words. */

  /* ============ TYPOGRAPHY ============ */
  --font-ui:             'Inter', system-ui, sans-serif;
  --font-mono:           'JetBrains Mono', 'Space Mono', ui-monospace, monospace;
  --text-2xs:  10px;   /* legend labels, badge text */
  --text-xs:   11px;   /* table headers, form labels, metadata */
  --text-sm:   12px;   /* secondary body, nav sublabels, console output */
  --text-md:   13px;   /* dense table body */
  --text-base: 14px;   /* body, inputs, buttons */
  --text-lg:   16px;   /* panel titles */
  --text-xl:   20px;   /* page section titles */
  --text-2xl:  28px;   /* page H1 */
  --text-3xl:  32px;   /* KPI values, artist detail H2 */
  --tracking-label:      0.08em;   /* uppercase labels */
  --tracking-wide:       0.12em;   /* "INTELLIGENCE PLATFORM" wordmark sublabel */
  --leading-tight:       1.2;
  --leading-body:        1.5;
  --leading-console:     1.6;

  /* ============ SPACING (4px grid) ============ */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;  --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-7: 32px;  --space-8: 40px;

  /* ============ LAYOUT ============ */
  --sidebar-width:       224px;   /* legacy 260px -> tightened. MAX 240px. */
  --sidebar-rail-width:  56px;    /* collapsed icon rail (responsive) */
  --page-gutter:         var(--space-6);   /* legacy 40px -> 24px. MAX 32px. */
  --panel-pad:           var(--space-4);   /* legacy 24px -> 16px. MAX 20px. */
  --panel-pad-lg:        var(--space-5);
  --table-cell-y:        10px;    /* legacy 16px -> 10px. MAX 12px. */
  --table-cell-x:        12px;
  --row-height-max:      44px;
  --header-height:       56px;

  /* ============ MOTION ============ */
  --dur-fast:   120ms;
  --dur-base:   200ms;
  --ease:       cubic-bezier(0.2, 0, 0, 1);

  /* ============ DECORATION (the ONLY permitted gradients) ============ */
  --gradient-decoration: linear-gradient(to bottom, rgba(0, 255, 95, 0.10), rgba(0, 255, 95, 0));
  /* used on: body background (fixed), sidebar background. Nowhere else. */
  --gradient-scanline:   linear-gradient(to bottom, transparent, var(--green-a10) 50%, transparent);
  /* used on: the AI console output well overlay ONLY. */
}
```

### Alternate theme policy

The legacy file has a red-on-white "day mode" that AUTO-ACTIVATES between
06:00 and 18:00 (`isDayMode` initial state, L3148-3151). That behavior is
**retired**: the black/neon-green theme is the product identity and is the
only theme built in Phase 4B/4C. The token architecture above (`--color-accent`
indirection, `body[data-theme]` swap point) keeps an alternate theme
POSSIBLE later without touching components, but shipping one is a product
decision recorded as open in `PHASE_4A_HANDOFF.md` §20. No time-of-day
theme switching, ever.

---

## 2. Global identity classes — `web/src/styles/global.css`

Small, deliberate, reused everywhere. They exist so the implementation model
reaches for a known-good class instead of improvising a style.

```css
/* reset: box-sizing, margin 0; DO NOT globally set outline:none (legacy did; it kills focus) */
body { background: var(--color-bg) var(--gradient-decoration) fixed no-repeat;
       background-size: 100% 100vh; color: var(--color-text);
       font: var(--text-base)/var(--leading-body) var(--font-ui); }

.panel { background: var(--color-panel); border: var(--border-panel);
         border-radius: var(--radius-panel); padding: var(--panel-pad); }
.panel--accent { border: var(--border-panel-accent); background: var(--color-accent-faint); }
.panel--well   { background: var(--color-bg-deep); border: var(--border-panel); border-radius: var(--radius-panel); }

.mono   { font-family: var(--font-mono); }
.label  { font: 700 var(--text-xs)/1 var(--font-mono); letter-spacing: var(--tracking-label);
          text-transform: uppercase; color: var(--color-text-muted); }
.label--accent { color: var(--color-accent); }
.kpi    { font: 700 var(--text-3xl)/var(--leading-tight) var(--font-mono); color: var(--color-text); }
.value  { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.text-neon { color: var(--color-accent); text-shadow: var(--glow-accent); }   /* <= 4 words */

.status-dot { width: 8px; height: 8px; border-radius: var(--radius-pill); display: inline-block; }
.status-dot--on   { background: var(--color-success); box-shadow: var(--glow-accent); }
.status-dot--warn { background: var(--color-warning); }
.status-dot--off  { background: var(--color-danger);  box-shadow: var(--glow-danger); }

:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; box-shadow: var(--glow-accent-soft); }

/* scrollbar: 8px; track var(--color-bg-deep); thumb #333; thumb:hover var(--color-accent) */
/* animations: @keyframes pulse (legacy mark), scanline, blink (█ cursor), fadeIn (10px rise, 400ms) */
@media (prefers-reduced-motion: reduce) { .scanline, .terminal-cursor::after, .legacy-mark { animation: none; } }
```

---

## 3. Component rules

Each rule is a REQUIREMENT. "Legacy" cites where the rule comes from.

### 3.1 Backgrounds and surfaces
- Page background is `--color-bg` with `--gradient-decoration` fixed at the top. Nothing else is gradient-filled.
- Panels: `.panel`. Padding `--panel-pad` (16px), max 20px. Radius `--radius-panel` (4px). Border `--border-panel`. No shadow at rest.
- Nested emphasis inside a panel uses `--color-surface-2` or `.panel--well`, never a second bordered card with its own padding stack (no "card inside card inside card").
- `backdrop-filter: blur()` is permitted on the sidebar and modals only. Not on every panel.

### 3.2 Green accent hierarchy (strict)
| Level | Usage | Allowed on |
|---|---|---|
| L1 solid fill `--color-accent` | the strongest signal | primary buttons (black text), active status dots, the wordmark sublabel, KPI delta text, `.text-neon` (≤4 words), progress bar fills |
| L2 green text | `color: var(--color-accent)` on dark | links, `.label--accent` section labels, active tab text, ROI/positive numbers, console prompt `>` |
| L3 tint `--color-accent-dim` | selection/hover fills | active nav item bg, tier badge "flagship" bg, hover fill on rows/buttons, outline-button hover |
| L4 glow | pulse/focus only | status dots, focus ring, console cursor, legacy mark loader ring |

- Green must remain the ONLY hue used for signalling. `--color-info` (cyan) and `--color-tier-dev` (purple) exist because the legacy NetworkGraph tier legend uses them; they are confined to that legend and to explicitly-labelled tier badges. **A page with no NetworkGraph on it has zero cyan/purple pixels.**
- Active nav item text is `--color-text` (white) on `--color-accent-dim` — NOT green text on green tint (legacy L3469-3470).

### 3.3 Typography and monospace
- UI prose, nav labels, button labels, paragraph text: `--font-ui`.
- **Everything that is a number, identifier, code, timestamp, currency, percentage, or console text is `--font-mono`** with `tabular-nums`: KPI values, every numeric table cell, artist IDs (`art_lumenveil`), dates, badges, `.label` headers, form labels, the AI console (input and output), the login inputs (legacy L3089/L3106 use mono for credentials — keep).
- Section/panel/KPI labels are `.label`: 11px mono, bold, uppercase, `--tracking-label`, muted. This is the single most recognizable typographic move in the legacy UI ("TOTAL REVENUE", "PREDICTIVE ANALYTICS", "COMMAND CENTER // v3.1", "NOW PLAYING") — it must appear on every panel header and every KPI.
- Hierarchy: page H1 28px/700 ui → section 20px/600 ui → panel title 16px/600 ui (often paired with a `.label` kicker above it) → body 14px → dense table 13px → labels 11px mono → legend 10px mono.
- Console/terminal copy convention: idle text begins with `// `, system lines with `> ` or `[SYSTEM]`, all mono, `--leading-console`.

### 3.4 Density
- Page gutter `--page-gutter` 24px (max 32). Sidebar `--sidebar-width` 224px (max 240).
- Grid gaps: 16px between panels (legacy 24 → tightened). 12px inside panels between blocks.
- Table rows ≤ `--row-height-max` 44px; cell padding `--table-cell-y`/`--table-cell-x`. A 600px-tall roster panel must show ≥ 10 rows.
- KPI grid: 4 across at ≥1280px, cards ≤ 120px tall.
- **Density rule of thumb: any screen in the new app must show at least as many data points above the fold as the corresponding legacy screen at the same viewport.** If a migration makes a screen show less, it fails.

### 3.5 Panel geometry, borders, radius
- Radii: controls 2px, panels 4px, pills 999px (≤22px tall only). Nothing else.
- Borders: 1px hairline `--border-color`. Accent border `--border-color-accent` only for: connected integration cards, the login card, the `.panel--accent` label-identity banner, high-priority demo rows (left 3px rule).
- Left-edge rules (3px vertical bar) are a legacy motif (StatCard L250, DemoRow L522, Top Movers L1252) — keep them; they replace, not add to, full accent borders.
- No 2px+ decorative borders, no double borders, no inset "glass" highlight lines.

### 3.6 Shadows and glow
- Panels: none. Modals/lightbox: `--shadow-overlay`.
- Glow only per §3.2 L4. Never on panels, never on body text, never on buttons at rest. Primary button hover may lift to `--green-300` fill; no glow.
- The scanline overlay (`--gradient-scanline`, 4s linear loop) is permitted ONLY on the AI console output well. It is a signature; do not spread it.

### 3.7 Navigation (sidebar)
- Fixed left, `--sidebar-width`, `--color-panel` + `--gradient-decoration`, right hairline border, `backdrop-filter: blur(20px)`.
- Top: legacy mark SVG logo (green fill) + wordmark "pulsegrid" 20px/800 ui + `.label--accent` sublabel "INTELLIGENCE PLATFORM" `--tracking-wide`.
- Items: 40px tall, 12px/16px padding, `--radius-control`, icon (Remixicon `ri-*`, 18px) + label 14px. Inactive `--color-text-muted`; hover `--color-text`; active white text on `--color-accent-dim`, 600 weight.
- Bottom group (pinned with `margin-top:auto`): Settings (gear), then a hairline, then "Terminate Session" (logout) in muted text with `ri-logout-box-line`. Keep the legacy copy "Terminate Session".
- Collapsed rail (≤1279px): `--sidebar-rail-width`, icons only, tooltips on hover.

### 3.8 Header
- `--header-height`. Left: page title 28px/700 + one-line muted 14px subtitle. Right: user chip = `.panel` at 8px/16px padding, 24px circular avatar, name 14px/500. Keep the chip; drop the `ui-avatars.com` third-party call in favor of an initials circle in `--color-surface-1` with `--color-accent` text (privacy + offline).

### 3.9 Tables
- Header row: `.label` cells (11px mono uppercase muted), bottom hairline `--border-color`, `--color-surface-1` background optional.
- Body: 13px; text cells `--font-ui`; numeric cells `--font-mono` right-aligned `tabular-nums`; row bottom hairline `rgba(255,255,255,0.05)`; hover `--color-surface-2`.
- Sortable header: clickable, shows `↑`/`↓` after the label on the active column (legacy L3635). No icon fonts for sort.
- Rank/index bubble (legacy L286-293): 28px circle `--color-surface-1`, muted mono index. Keep.
- No zebra striping. No card-per-row layouts for tabular data. Row actions are 10px mono uppercase buttons (`VIEW`, `ARCHIVE`), right-aligned.

### 3.10 Metrics / KPIs (StatCard)
- `.panel` with a 2px `--color-accent` left rule at 50% opacity (legacy L250).
- Stack: `.label` (13px→11px, uppercase) / `.kpi` value 32px mono bold / optional 12px green delta line.
- Max height 120px. Four across at desktop.

### 3.11 Charts (Chart.js via react-chartjs-2)
- One shared `chartDefaults.js` applies: legend labels `#bbb` ui font; title white 14px/700; tooltip bg `rgba(0,0,0,0.8)`, title `--green-500`, body white, border `#333`; axis ticks `--color-text-dim` in `--font-mono`; grid `rgba(255,255,255,0.05)`; `interaction.mode='nearest', axis='x'`.
- Dataset palette: primary series `--green-500`; historical/secondary `#666666` with `rgba(255,255,255,0.1)` fill; projection dashed `[5,5]` green (matches `/v3/analytics/projections` payload L157-168); bars solid `--green-500` with `borderRadius: 2` (legacy terminal chart used 4 → tightened).
- No pastel multi-hue palettes. A chart with more than 2 series uses green opacity steps (`--green-500`, `--green-700`, `--green-a20`) before any other hue.

### 3.12 Maps (Leaflet via react-leaflet)
- Tiles: CartoDB `dark_all` (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`), `noWrap`, `zoomControl:false`, `attributionControl:false` (legacy L945-960). Attribution text rendered as a 10px mono muted caption under the map instead (license compliance without the Leaflet control chrome).
- Points: `L.circleMarker` radius 3–6, fill `--green-500` at 0.6 opacity, stroke none; scatter jitter per legacy L1028-1039.
- Container: `.panel--well`, 4px radius, fixed height (Dashboard 320px; Artist Geography tab 400px).

### 3.13 Forms and inputs
- Inputs/selects/textareas: `--color-input-bg`, `--border-panel`, `--radius-control`, 10px/12px padding, 14px, `--color-text`; credential and ID fields in `--font-mono`; placeholder `--color-text-dim`.
- Labels: `.label` above the field, 6px gap. Errors: 12px `--color-danger` under the field.
- Focus: the global `:focus-visible` ring. Never remove it.
- Checkboxes: native, accent-color `--color-accent`. Select chevron: `ri-arrow-down-s-line` muted.
- Inline confirm pattern (legacy DemoRow L614-618, EntityAuditTab L1786-1797): destructive/expensive actions expand inline to `CONFIRM` / `CANCEL` 10px mono buttons — no browser `confirm()`/`alert()` dialogs anywhere in the new app.

### 3.14 Buttons
| Variant | Fill | Text | Border | Use |
|---|---|---|---|---|
| primary | `--color-accent` (hover `--green-300`, active `--green-700`) | `--color-text-on-accent` black, 700 | none | one per panel max |
| outline | transparent (hover `--color-accent-dim`) | `--color-text-muted` → hover `--color-text` | `--border-panel` | default secondary |
| accent-outline | `--color-accent-dim` | `--color-accent` | `--border-color-accent` | "LOG REAL SALES", "CONNECT" |
| danger | `--color-danger-dim` (hover 0.2) | `--color-danger` | `--color-danger-border` | ARCHIVE, DISCONNECT, REMOVE |
| ghost/icon | none | muted → hover text | none | icon-only actions, needs `aria-label` |
- Sizes: default 32px tall, 12px/16px pad, 12–14px; compact 24px tall, 6px/12px, 10px mono UPPERCASE (row actions). Radius `--radius-control`.
- Labels on compact/action buttons are UPPERCASE mono (legacy: VIEW, ARCHIVE, RESTORE, SIGN ARTIST, INITIALIZE SESSION). Keep the legacy verbs.

### 3.15 Badges / status
- Tier badge: 10–11px mono uppercase 600, 4px/10px pad, `--radius-pill`; flagship = `--color-accent-dim` bg + `--color-accent` text + accent border; others = `--color-surface-1` bg + muted text + hairline.
- Role badge (admin table): admin = solid accent bg + black text; others = `#333` bg + white — legacy L912-916; keep.
- Connection status: `.status-dot` + mono text `● CONNECTED` / `○ DISCONNECTED` (legacy L1604). Text is mandatory; the dot alone is not a state.
- Data-provenance badge (legacy L2072-2082 "SOURCE: MOCK / UPDATED: …"): 11px, `--color-surface-1`, hairline, `.label` key + mono value. Use it wherever the backend serves mock/fixture data (see handoff matrix "provenance" notes).

### 3.16 Hover / focus / active
- Hover: rows `--color-surface-2`; nav/buttons per variant; links `--green-300`. Transition `--dur-base` `--ease`.
- Focus: global ring. Active/pressed: buttons darken one step. Selected (tab, nav): `--color-accent-dim` bg + 2px `--color-accent` bottom border for tabs (legacy L2097).

### 3.17 Loading
- Full-page: the pulsing **legacy mark** loader (legacy L200-227: 80px ring + two ear circles, `pulse 2s infinite`). This is brand; never replace with a generic spinner.
- In-panel / inline: mono muted text with a blinking block cursor: `// loading roster data█` (terminal dashboard `.terminal-cursor`). Optional flat skeleton bars (`--color-surface-1`, `--radius-control`, heights matching the text they replace) for tables/charts. **No shimmer/sweep gradient animations.**
- Long operations (PDF report generation, AI query): mono status lines `// analyzing neural patterns...` in `--color-accent` (legacy L3756).

### 3.18 Errors
- Panel: `--color-danger-dim` bg, `--color-danger-border`, `--radius-panel`, 12–16px pad; `.label` kicker `ERR` or `CONNECTION FAILURE` in `--color-danger`; message 14px; a `danger` or `outline` button `RETRY CONNECTION` (legacy L3394-3409 copy).
- Field-level: 12px danger text under the field.
- 403 on a scoped resource: same panel, kicker `ACCESS DENIED`, no retry button.
- Never `alert()`. Never a toast library. Errors live where the data would have been.

### 3.19 Empty states
- Centered inside the panel: `// no submissions in the queue` style mono muted 12–13px, optional one `outline` action below. No illustrations, no emoji, no oversized icons. (Legacy L2566, L703.)

### 3.20 Modals / overlays
- Backdrop `rgba(0,0,0,0.90)`; panel `.panel` at `--panel-pad-lg`, `--shadow-overlay`, max-width per use (artist detail 1000×800 on desktop, login 420px); close = ghost icon `ri-close-line` 24px top-right. Radius 4px (legacy 16 → tightened). Escape closes; focus trapped.

### 3.21 AI console (signature component)
- `.panel` → title row `ri-brain-line` accent icon + "Intelligence" 16px/600 → output well `.panel--well` mono 13px `--leading-console` muted, min-height 200px, scanline overlay, idle text `// System ready.` / `// Waiting for input...` in `--color-text-dim` → input row: mono 14px input in `--color-input-bg`, ghost send icon `ri-send-plane-fill` (accent when non-empty, faint when empty).
- Provider/model chip (see handoff §12): 11px `.label` row under the title — `PROVIDER GROQ · MODEL GPT-OSS-20B · ● READY` — mono, muted, dot per status. Never a vendor logo.
- Response text may type-write (legacy 10–15ms/char). Respect `prefers-reduced-motion` (render instantly).

### 3.22 Responsive behavior (additive — legacy has none)
| Viewport | Sidebar | Grids | Tables |
|---|---|---|---|
| ≥ 1280 | full 224px | as designed (4-col KPIs, 2fr/1fr splits) | full |
| 1024–1279 | icon rail 56px | KPIs 2×2; 2fr/1fr → stacked | full |
| < 1024 | hidden, hamburger in header | single column | horizontal scroll inside `.panel`, never hidden columns |
- Phase 4B target is ≥1280 fully correct and 1024–1279 not broken. `<1024` is best-effort. Use `rem`/`%`/grid; no fixed widths except `--sidebar-width`.

### 3.23 Accessibility baseline
- Every icon-only control has `aria-label`. Every input has a `<label>`.
- Color is never the sole state carrier (pair with text/glyph; §3.15).
- Contrast: `--color-text-muted` on `--color-bg` ≈ 9.7:1; `--color-text-dim` (#666) ≈ 3.6:1 — restricted to placeholders, ticks, idle console text; never for information a user must read.
- Global `:focus-visible` ring (legacy's `* { outline: none }` is FORBIDDEN).
- `prefers-reduced-motion`: disable pulse/scanline/blink/typewriter.
- Nav is `<nav aria-label="Primary">` with `aria-current="page"`; tables use `<th scope="col">`; modals trap focus and set `aria-modal`.

---

## 4. Visual anti-patterns — FAIL conditions

The implementation FAILS review if ANY of the following is true. Items marked
`[grep]` are mechanically checkable from the source; `[measure]` from the
rendered page; `[judge]` is a yes/no a reviewer answers from a screenshot.

**Palette / identity**
- `[grep]` Any color literal (`#…`, `rgb(`, `hsl(`) appears in a `*.module.css` or `*.jsx` file other than `tokens.css`, `global.css`, and `chartDefaults.js`.
- `[grep]` Any hex in the blue/indigo/violet families (`#3B82F6`, `#6366F1`, `#8B5CF6`, `#7C3AED`, `#2563EB`, `#4F46E5`, or any `hsl` with hue 200–290) appears anywhere in `web/`.
- `[measure]` Default page background lighter than `#141414`.
- `[judge]` Green is a minor accent (e.g. only the logo) rather than the dominant signal color on the screen.
- `[judge]` Cyan or purple is visible on a screen that does not contain the NetworkGraph or an explicitly labelled tier badge.
- `[grep]` `tailwindcss`, `bootstrap`, `@mui/*`, `@chakra-ui/*`, `antd`, `@radix-ui/themes`, `shadcn`, `daisyui`, `@mantine/*` in `web/package.json`.

**Geometry / density**
- `[grep]` Any `border-radius` value other than `var(--radius-control|--radius-panel|--radius-pill)` in component CSS; or a pill radius on an element taller than 22px (excluding avatars/loader).
- `[measure]` Any `.panel` with padding > 20px; page gutter > 32px; sidebar > 240px; table row > 44px.
- `[measure]` Fewer data points above the fold than the legacy screen at 1440×900 for Dashboard, Artists, A&R, Admin.
- `[grep]` `box-shadow` on `.panel` at rest, or any `text-shadow` outside `.text-neon`.
- `[grep]` A `linear-gradient`/`radial-gradient` other than `--gradient-decoration` and `--gradient-scanline` (the legacy login radial glow L3038 is folded into `--gradient-decoration`; do not add more).

**Typography**
- `[grep]` A numeric KPI, table numeric cell, ID, timestamp, or console element rendered without `--font-mono`/`.mono`/`.value`/`.kpi`.
- `[judge]` Panel headers/KPI labels are not uppercase tracked mono `.label`s (the "TOTAL REVENUE" look is gone).
- `[grep]` A third font family imported beyond Inter + JetBrains Mono (Space Mono as mono fallback only).

**Components / behavior**
- `[grep]` `alert(`, `confirm(`, `prompt(` in `web/src`.
- `[grep]` A toast/snackbar library in `web/package.json`.
- `[grep]` `outline: none` / `outline: 0` without an accompanying `:focus-visible` rule in the same file.
- `[judge]` Loading uses a generic circular spinner instead of the legacy mark (full page) or mono cursor/skeleton (inline).
- `[judge]` Empty states use an illustration, emoji, or oversized icon.
- `[grep]` A vendor name (`Groq`, `OpenAI`, `Anthropic`, `Gemini`, `xAI`, `OpenRouter`) hardcoded in a component label/JSX string, as opposed to rendered from provider metadata returned by the API.
- `[grep]` `localhost:3000` anywhere in `web/src`.

**The final judgment**
- `[judge]` Shown a screenshot with the logo cropped out, could this UI plausibly belong to a random analytics startup? If yes → FAIL.
- `[judge]` Does it read as a terminal that grew a data layer (mono labels, hairline panels, one neon signal color on black)? If no → FAIL.

---

## 5. Visual acceptance checklist (paste into the Phase 4B PR / report)

```
[ ] tokens.css matches §1 verbatim (diff is empty)
[ ] global.css defines .panel .label .kpi .value .status-dot :focus-visible per §2
[ ] grep -rn "#[0-9a-fA-F]\{3,8\}\|rgb(" web/src --include=*.jsx --include=*.module.css  -> only tokens.css/global.css/chartDefaults.js
[ ] grep -rn "border-radius" web/src --include=*.module.css | grep -v "var(--radius-"  -> no results
[ ] grep -rn "box-shadow\|text-shadow" web/src --include=*.module.css  -> only .text-neon, .status-dot--*, :focus-visible, modal
[ ] grep -rn "alert(\|confirm(\|prompt(" web/src  -> no results
[ ] grep -rn "localhost:3000" web/src  -> no results
[ ] grep -rn "outline: *none\|outline: *0" web/src  -> no results (or paired with :focus-visible)
[ ] grep -rni "groq\|openai\|anthropic\|gemini\|xai\|openrouter" web/src --include=*.jsx | grep -v "provider\.\(id\|name\)"  -> no hardcoded vendor labels
[ ] package.json has no CSS framework / toast lib (see §4 list)
[ ] Screenshot @1440x900: sidebar <=240px, gutter <=32px, KPI cards <=120px tall, >=10 roster rows visible
[ ] Screenshot: every panel title / KPI label is uppercase mono .label
[ ] Screenshot: all numbers are mono tabular
[ ] Screenshot: no cyan/purple on Dashboard, Artists, Login
[ ] Screenshot: background is #0A0A0A-family; the only hue present is green (+ red for danger/error states if shown)
[ ] Full-page loader is the legacy mark; inline loading is mono cursor or flat skeleton
[ ] Keyboard: Tab shows the green focus ring on every interactive element
[ ] Logo-cropped screenshot: a reviewer says "this is the pulsegrid console", not "an analytics dashboard"
```
