// Static brand-portability checks — PHASE_4A_HANDOFF.md §15 [grep] boxes as amended pre-4C
// (Decision 3, 2026-09-17). Pure Node: no servers, no browser, and NOTHING is imported from web/src —
// source files are read as text and matched with path/scope-aware rules.
//
//   node web/validation/static-checks.mjs               run against this repo's web/src (exit 1 on any FAIL)
//   node web/validation/static-checks.mjs --root DIR    run against another src tree (a copy of web/src)
//   node web/validation/static-checks.mjs --self-test   prove every rule FAILS on a synthetic leak injected
//                                                       into a temp copy of web/src AND PASSES on the real
//                                                       tree; the temp copy is deleted afterwards
//   node web/validation/gate.mjs --static-only          the same checks through the gate's reporter
//
// Why scope-aware rules instead of the original blanket greps (PHASE_4B_STATIC_AUDIT.md F-11):
//   (a) tokens.css is mandated byte-for-byte (§15 L481) and its COMMENTS name mau5trap / mau5-head /
//       Mau5Head / mau5trap-console / "INTELLIGENCE PLATFORM"; identity in a comment there is allowed,
//       identity in a declaration or selector is not → CSS comments are stripped before matching.
//   (b) `ri-headphone-line` is the prescribed A&R Room nav icon (architecture §5) in layout/nav.js; the
//       leak the grep is after is a Remixicon standing in for the brand mark → allowed on that one nav
//       entry only, forbidden everywhere else.
//   (c) `@mau5trap.com` is the schema-required contact/email data of the mau5trap profile (architecture
//       §14.2) → label email domains are allowed under brand/profiles/** only.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SRC = path.resolve(HERE, '../src');
const SOURCE_EXT = new Set(['.js', '.jsx', '.css', '.html', '.json', '.svg', '.mjs']);

// ---------- scope helpers (paths are POSIX-style, relative to web/src) ----------
const under = (prefix) => (rel) => rel === prefix || rel.startsWith(`${prefix}/`);
const inBrand = under('brand');
const inProfiles = under('brand/profiles');
const inThemes = under('brand/themes');
const isRegistry = (rel) => rel === 'brand/registry.js';
const isTokens = (rel) => rel === 'styles/tokens.css';
const isGlobalCss = (rel) => rel === 'styles/global.css';
const isNav = (rel) => rel === 'layout/nav.js';

/** Blank out `/* … *\/` comments while preserving line numbers (only applied to tokens.css). */
export function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}
const tokensCommentStripped = (rel, text) => (isTokens(rel) ? stripCssComments(text) : text);

const LABEL_IDENTITY = /mau5trap|deadmau5|rezz|mau5/i;

/**
 * Each rule: id, name, scope(rel) → in scope?, pattern (RegExp, tested per line), optional
 * prepare(rel, text) → text to match, optional allow(rel, line, lineNo) → hit is legitimate,
 * boundary (prose: where the string IS allowed), catches (prose: what a hit means).
 */
export const RULES = [
  {
    id: 'S01', name: 'label identity in generic runtime code (web/src outside brand/; tokens.css comments stripped)',
    scope: (rel) => !inBrand(rel), pattern: LABEL_IDENTITY, prepare: tokensCommentStripped,
    boundary: 'nowhere in generic code — including comments, class names and storage keys — except inside tokens.css /* */ comments (the byte-for-byte contract blocks)',
    catches: 'mau5trap / mau5 / deadmau5 / rezz typed into a component, hook, page, copy.js, module.css, or a tokens.css declaration/selector',
    grep: '§15 L497 (first grep) + L495 slug rule',
  },
  {
    id: 'S02', name: 'label identity in brand core (brand/ outside profiles/ and themes/) → only registry.js',
    scope: (rel) => inBrand(rel) && !inProfiles(rel) && !inThemes(rel), pattern: LABEL_IDENTITY, allow: (rel) => isRegistry(rel),
    boundary: 'brand/registry.js only (composition root, architecture §14.3)',
    catches: 'a profile identity hardcoded in BrandContext / BrandMark / BrandLoader / schema / defaults',
    grep: '§15 L497 (second grep)',
  },
  {
    id: 'S03', name: 'brand strings ("INTELLIGENCE PLATFORM", "mau5trap Intelligence Platform", mau5trap.com) outside brand/profiles/mau5trap/ (tokens.css comments stripped)',
    scope: (rel) => !under('brand/profiles/mau5trap')(rel), pattern: /INTELLIGENCE PLATFORM|mau5trap Intelligence Platform|mau5trap\.com/i, prepare: tokensCommentStripped,
    boundary: 'brand/profiles/mau5trap/** and tokens.css /* */ comments',
    catches: 'the label tagline, document title or domain rendered or declared by platform code',
    grep: '§15 L494',
  },
  {
    id: 'S04', name: 'label email domains (@mau5trap.com / @rezz.com) outside brand/profiles/',
    scope: () => true, pattern: /@(?:mau5trap|rezz)\.com/i, allow: (rel) => inProfiles(rel),
    boundary: 'brand/profiles/** only (profile contact/email data, architecture §14.2)',
    catches: 'seed credentials, a prefilled login, or a label contact address in generic code or brand core',
    grep: '§15 L498 (second grep) / architecture §14.5 seed-credentials row',
  },
  {
    id: 'S05', name: 'raw colour literals (#hex / rgb() / hsl()) outside tokens.css, global.css, chartDefaults.js, brand/themes/, brand/profiles/',
    scope: (rel) => !isTokens(rel) && !isGlobalCss(rel) && !inThemes(rel) && !inProfiles(rel) && path.posix.basename(rel) !== 'chartDefaults.js' && /\.(?:jsx?|css|mjs)$/.test(rel),
    pattern: /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\brgba?\(|\bhsla?\(/i,
    boundary: 'styles/tokens.css, styles/global.css, **/chartDefaults.js, brand/themes/**, brand/profiles/**',
    catches: 'the brand accent (#00FF5F / rgb(0, 255, 95)) or any colour bypassing the token/theme layer',
    grep: '§15 L482 (contract §5 raw hex/rgb grep)',
  },
  {
    id: 'S06', name: 'profile / theme imports outside brand/registry.js',
    scope: () => true, pattern: /(?:\bimport\b|\bfrom\b|\brequire\b)[^'"]*['"][^'"]*(?:^|\/)(?:profiles|themes)\/[^'"]*['"]/, allow: (rel) => isRegistry(rel),
    boundary: 'brand/registry.js only (architecture §14.6: marks and loaders are looked up in the registry, never imported)',
    catches: 'Sidebar / LoadingScreen / LoginPage / any component importing Mau5Head, a profile, or a theme file directly',
    grep: '§15 L506-L507',
  },
  {
    id: 'S07', name: 'Remixicon used as a brand mark (ri-headphone / ri-music / ri-disc) — allowed only as the A&R entry icon in layout/nav.js',
    scope: () => true, pattern: /ri-(?:headphone|music|disc)[\w-]*/,
    allow: (rel, line) => isNav(rel) && /\bid:\s*'anr'/.test(line) && /\bicon:\s*'ri-headphone-line'/.test(line),
    boundary: "layout/nav.js, the `{ id: 'anr', …, icon: 'ri-headphone-line', … }` entry only (architecture §5 A&R Room icon)",
    catches: 'a headphone/music/disc glyph standing in for BrandMark in the sidebar brand block, login card, loader, or any component',
    grep: '§15 L508',
  },
  {
    id: 'S08', name: 'artist ids (art_*) in frontend source',
    scope: () => true, pattern: /\bart_[a-z0-9]+/,
    boundary: 'nowhere in web/src (artist identities are runtime data — architecture §14.5)',
    catches: 'fixture artist ids as constants, defaults, placeholders or test ids',
    grep: '§15 L498 (first grep)',
  },
  {
    id: 'S09', name: 'seed credential passwords (admin123 / rezz123) in frontend source',
    scope: () => true, pattern: /admin123|rezz123/,
    boundary: 'nowhere in web/src (fixtures live in the §15 gate text and web/README.md only — architecture §14.5)',
    catches: 'a prefilled login or dev shortcut carrying the seeded fixture passwords',
    grep: 'architecture §14.5 seed-credentials row',
  },
];

// ---------- file walk ----------
export function listSourceFiles(root) {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); }
      else if (SOURCE_EXT.has(path.extname(entry.name))) out.push(full);
    }
  })(root);
  return out;
}

/** Run one rule over a tree. Returns { rule, scanned, hits: [{ rel, lineNo, line }] }. */
export function runRule(rule, root, files = listSourceFiles(root)) {
  const hits = []; let scanned = 0;
  for (const full of files) {
    const rel = path.relative(root, full).split(path.sep).join('/');
    if (!rule.scope(rel)) continue;
    scanned++;
    const raw = fs.readFileSync(full, 'utf8');
    const text = rule.prepare ? rule.prepare(rel, raw) : raw;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!rule.pattern.test(lines[i])) continue;
      if (rule.allow && rule.allow(rel, lines[i], i + 1)) continue;
      hits.push({ rel, lineNo: i + 1, line: lines[i].trim() });
    }
  }
  return { rule, scanned, hits };
}

/**
 * Run every rule. `report(id, name, pass, observed)` receives one call per rule (the gate passes its
 * own check()); returns the raw results so callers can aggregate.
 */
export function runStaticChecks(root = DEFAULT_SRC, report = defaultReport) {
  const files = listSourceFiles(root);
  const results = RULES.map((rule) => runRule(rule, root, files));
  for (const r of results) {
    const observed = r.hits.length
      ? `${r.hits.length} hit(s): ${r.hits.slice(0, 6).map((h) => `${h.rel}:${h.lineNo} ${h.line.slice(0, 80)}`).join(' | ')}${r.hits.length > 6 ? ' | …' : ''}`
      : `clean over ${r.scanned} file(s) — allowed boundary: ${r.rule.boundary}`;
    report(r.rule.id, r.rule.name, r.hits.length === 0, observed);
  }
  return results;
}

function defaultReport(id, name, pass, observed) {
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${id} ${name} | ${String(observed).replace(/\s+/g, ' ').slice(0, 400)}`);
}

// ---------- self-test: one synthetic leak per rule, injected into a temp copy of the tree ----------
// Each leak is placed where the ORIGINAL grep would also have flagged it, but in a location the amended
// rule must still reject (i.e. outside the allowed boundary), so the test proves the rules did not go soft.
export const SELF_TEST_LEAKS = [
  { id: 'S01', file: 'components/primitives/StatCard.jsx', append: "\n// leak: this is the mau5trap console\n", why: 'identity in a comment in a generic component' },
  { id: 'S01', file: 'styles/tokens.css', append: '\n.mau5trap-console-badge { color: red; }\n', why: 'identity in a tokens.css SELECTOR (not a comment) — the comment-strip must not hide it' },
  { id: 'S02', file: 'brand/BrandMark.jsx', append: "\nconst fallbackSlug = 'mau5trap';\n", why: 'profile identity in brand core outside registry.js' },
  { id: 'S03', file: 'layout/Header.jsx', append: "\nconst subtitle = 'INTELLIGENCE PLATFORM';\n", why: 'brand tagline in a platform component' },
  { id: 'S04', file: 'pages/LoginPage/LoginPage.jsx', append: "\nconst devLogin = 'admin@mau5trap.com';\n", why: 'label email in generic code (a prefilled login)' },
  { id: 'S04', file: 'brand/schema.js', append: "\nexport const DEFAULT_SUPPORT = 'admin@mau5trap.com';\n", why: 'label email in brand core (outside profiles/)' },
  { id: 'S05', file: 'layout/Sidebar.module.css', append: '\n.leak { color: #00FF5F; }\n', why: 'raw brand hex in a component stylesheet' },
  { id: 'S05', file: 'components/primitives/Panel.jsx', append: "\nconst tint = 'rgba(0, 255, 95, 0.1)';\n", why: 'raw brand rgba in a component' },
  { id: 'S06', file: 'layout/Sidebar.jsx', append: "\nimport { Mau5Head } from '../brand/profiles/mau5trap/Mau5Head.jsx';\n", why: 'profile component imported outside registry.js' },
  { id: 'S06', file: 'brand/BrandContext.jsx', append: "\nimport './themes/mau5trap-console.css';\n", why: 'theme imported outside registry.js' },
  { id: 'S07', file: 'layout/Sidebar.jsx', append: '\nconst brandGlyph = <i className="ri-headphone-line" />;\n', why: 'headphone glyph in the sidebar (brand block) instead of BrandMark' },
  { id: 'S07', file: 'layout/nav.js', append: "\nexport const NAV_EXTRA = [{ id: 'catalog', label: 'Catalog', icon: 'ri-disc-line', perm: 'roster', to: '/catalog' }];\n", why: 'a disc glyph on a NON-A&R nav entry in nav.js — the allowance is that one entry, not the file' },
  { id: 'S08', file: 'hooks/useApiQuery.js', append: "\nconst DEFAULT_ARTIST = 'art_rezz';\n", why: 'fixture artist id as a default' },
  { id: 'S09', file: 'pages/LoginPage/LoginPage.jsx', append: "\nconst devPassword = 'admin123';\n", why: 'seed password as a dev shortcut' },
];

function copyTree(src, dest) { fs.cpSync(src, dest, { recursive: true }); }

export function selfTest(root = DEFAULT_SRC) {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-static-selftest-'));
  const outcomes = [];
  try {
    // 1. real tree must be clean for every rule
    const realFiles = listSourceFiles(root);
    for (const rule of RULES) {
      const r = runRule(rule, root, realFiles);
      outcomes.push({ kind: 'real-tree', id: rule.id, pass: r.hits.length === 0, detail: r.hits.length ? r.hits.map((h) => `${h.rel}:${h.lineNo}`).join(', ') : `clean (${r.scanned} files)` });
    }
    // 2. each synthetic leak must be caught by its rule (and by no unintended change to the real tree)
    SELF_TEST_LEAKS.forEach((leak, i) => {
      const dest = path.join(tmpBase, `leak-${i}`);
      copyTree(root, dest);
      const target = path.join(dest, ...leak.file.split('/'));
      const before = fs.readFileSync(target, 'utf8');
      fs.writeFileSync(target, before + leak.append);
      const rule = RULES.find((x) => x.id === leak.id);
      const r = runRule(rule, dest);
      const flagged = r.hits.filter((h) => h.rel === leak.file);
      outcomes.push({ kind: 'fake-leak', id: leak.id, pass: flagged.length > 0, detail: `${leak.file} (+${JSON.stringify(leak.append.trim().slice(0, 60))}) — ${leak.why}: ${flagged.length ? `FLAGGED at ${flagged.map((h) => `L${h.lineNo}`).join(',')}` : 'NOT flagged'}` });
    });
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
  return { outcomes, tmpBase, cleaned: !fs.existsSync(tmpBase) };
}

// ---------- CLI ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rootArg = args.indexOf('--root');
  const root = rootArg >= 0 ? path.resolve(args[rootArg + 1]) : DEFAULT_SRC;
  if (args.includes('--self-test')) {
    console.log(`static-checks self-test — real tree ${root}; synthetic leaks in a temp copy under ${os.tmpdir()}`);
    const { outcomes, cleaned } = selfTest(root);
    for (const o of outcomes) console.log(`${o.pass ? 'PASS' : 'FAIL'} | ${o.kind.padEnd(9)} | ${o.id} | ${o.detail}`);
    const fail = outcomes.filter((o) => !o.pass).length;
    console.log(`SELF-TEST SUMMARY: ${outcomes.length - fail} pass, ${fail} fail, ${outcomes.length} assertions (${RULES.length} rules × real tree + ${SELF_TEST_LEAKS.length} synthetic leaks); temp copy removed=${cleaned}`);
    process.exit(fail ? 1 : 0);
  }
  console.log(`static brand-portability checks — root ${root}`);
  const results = runStaticChecks(root);
  const fail = results.filter((r) => r.hits.length).length;
  console.log(`STATIC SUMMARY: ${results.length - fail} pass, ${fail} fail, ${results.length} checks`);
  process.exit(fail ? 1 : 0);
}
