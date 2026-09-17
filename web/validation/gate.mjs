// Phase 4B acceptance gate (PHASE_4A_HANDOFF.md §15 functional + mechanical + portability boxes).
// Runs headless against ALREADY-RUNNING servers and prints one line per check.
//
//   cd web && npm run gate
//
// Env:
//   BASE_URL         frontend origin              (default http://127.0.0.1:5173, Vite dev — the
//                    localStorage['platform.brandProfile'] portability hook is DEV-only)
//   API_URL          backend origin for Node-side expected values (default http://localhost:3000)
//   ADMIN_EMAIL / ADMIN_PASSWORD / ARTIST_EMAIL / ARTIST_PASSWORD
//                    seeded fixture accounts (defaults = src/models/index.js seeds; 4A §22 N5)
//   HEADLESS         "false" to watch the run
//   SCREENSHOT_DIR   where the phase4b-*.png set is (over)written (default: this directory)
//
// Exit code: 0 when every check passes, 1 otherwise. No source file is imported from web/src —
// expected values are derived from the live API + Node's Intl, and from the 4A/contract spec.

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseColor, sameColor, fmt, KPI_ORDER } from './lib.mjs';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const API = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@mau5trap.com', password: process.env.ADMIN_PASSWORD || 'admin123' };
const ARTIST = { email: process.env.ARTIST_EMAIL || 'tours@rezz.com', password: process.env.ARTIST_PASSWORD || 'rezz123' };
const HEADLESS = process.env.HEADLESS !== 'false';
const SHOTS = process.env.SCREENSHOT_DIR || path.dirname(fileURLToPath(import.meta.url));
const VIEWPORT = { width: 1440, height: 900 };
const T = 15000;

// Spec constants (PHASE_4A_HANDOFF.md §15 / FRONTEND_ARCHITECTURE.md §13-§14). Not read from src.
const SPEC = {
  mau5trap: {
    title: 'mau5trap Intelligence Platform', favicon: '/brands/mau5trap/favicon.svg', theme: 'mau5trap-console',
    wordmark: 'mau5trap', tagline: 'INTELLIGENCE PLATFORM', placeholder: 'user@mau5trap.com',
    accent: 'rgb(0, 255, 95)', accent35: 'rgba(0, 255, 95, 0.35)', accent10: 'rgba(0, 255, 95, 0.1)',
    locale: 'en-US', currency: 'USD', footerLines: 2,
  },
  example: {
    title: 'Example Records — Label Operations', favicon: '/brands/example-records/favicon.svg', theme: 'example-records-magenta',
    wordmark: 'Example Records', tagline: 'LABEL OPERATIONS', placeholder: 'user@example-records.test',
    footer3: '© Example Records — portability test profile',
    accent: 'rgb(255, 45, 149)', accent35: 'rgba(255, 45, 149, 0.35)', accent10: 'rgba(255, 45, 149, 0.1)',
    locale: 'en-GB', currency: 'GBP', footerLines: 3,
  },
  voice: ['ACCESS ID', 'PASSPHRASE', 'INITIALIZE SESSION', 'RESTRICTED ACCESS. UNAUTHORIZED CONNECTIONS WILL BE TERMINATED.', 'Authorized personnel only.', 'Forgot Password?'],
  navAll: ['Dashboard', 'Artists', 'A&R Room', 'Intelligence', 'Marketing', 'Fans', 'Operations', 'Admin'],
  navArtist: ['Dashboard', 'Artists'],
  text: 'rgb(245, 245, 245)', muted: 'rgb(181, 181, 181)', bg: 'rgb(10, 10, 10)', onAccent: 'rgb(0, 0, 0)',
  danger: 'rgb(255, 68, 68)', dangerDim: 'rgba(255, 50, 50, 0.1)', dangerBorder: 'rgba(255, 50, 50, 0.3)', hairline: 'rgba(255, 255, 255, 0.1)',
  mau5HeadPath: 'M 30 70 Q 50 90 70 70 Q 50 82 30 70',
};

// ---------- reporting ----------
const results = [];
function check(id, name, pass, observed) {
  results.push({ id, name, pass: !!pass, observed: String(observed) });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${id} ${name} | ${String(observed).replace(/\s+/g, ' ').slice(0, 400)}`);
}
async function step(id, name, fn) {
  try { await fn(); } catch (error) { check(id, name, false, `threw: ${error.message.split('\n')[0]}`); }
}

// ---------- console / error capture ----------
const consoleErrors = [];   // unexpected console.error messages
const expectedResourceErrors = [];  // Chromium "Failed to load resource" lines during phases that provoke HTTP errors
const pageErrors = [];
const consoleWarnings = [];
let phase = { name: 'boot', expectsHttpErrors: false };
function setPhase(name, expectsHttpErrors = false) { phase = { name, expectsHttpErrors }; }

// ---------- Node-side expected values (live API + Intl) ----------
async function apiLogin(creds) {
  const res = await fetch(`${API}/v3/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(creds) });
  const body = await res.json();
  return { status: res.status, body };
}
async function apiOverview(token) {
  const res = await fetch(`${API}/v3/label/overview`, { headers: { authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
}
function expectedKpis(overview, locale, currency) {
  const f = fmt(locale, currency);
  return [f.money(overview.monthlyRevenue), f.money(overview.quarterlyProjection), f.money(overview.annualProjection), f.integer(overview.activeArtists)];
}

// ---------- browser helpers ----------
const browser = await chromium.launch({ headless: HEADLESS });
const context = await browser.newContext({ viewport: VIEWPORT });
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') {
    if (/^Failed to load resource/.test(m.text()) && phase.expectsHttpErrors) expectedResourceErrors.push(`[${phase.name}] ${m.text()}`);
    else consoleErrors.push(`[${phase.name}] ${m.text()}`);
  } else if (m.type() === 'warning') consoleWarnings.push(`[${phase.name}] ${m.text().slice(0, 160)}`);
});
page.on('pageerror', (e) => pageErrors.push(`[${phase.name}] ${e.message}`));

const clearSession = () => page.evaluate(() => { localStorage.removeItem('authToken'); localStorage.removeItem('userData'); });
const readSession = () => page.evaluate(() => ({ authToken: localStorage.getItem('authToken'), userData: localStorage.getItem('userData'), keys: Object.keys(localStorage) }));
async function gotoLogin() { await page.goto(`${BASE}/login`); await page.waitForSelector('#access-id', { timeout: T }); }
async function uiLogin(creds) {
  await gotoLogin();
  await page.fill('#access-id', creds.email);
  await page.fill('#passphrase', creds.password);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard', { timeout: T });
  await page.waitForSelector('.kpi', { timeout: T });
}
const kpiTexts = () => page.$$eval('.kpi', (els) => els.map((e) => e.textContent));
const kpiLabels = () => page.$$eval('.kpi', (els) => els.map((e) => e.closest('section').querySelector('.label').textContent));
const navState = () => page.evaluate(() => ({
  primary: [...document.querySelectorAll('nav[aria-label=Primary] a')].map((a) => a.textContent),
  secondary: [...document.querySelectorAll('nav[aria-label=Secondary] a')].map((a) => a.textContent),
  logout: document.querySelector('aside button')?.textContent ?? null,
  header: document.querySelector('header')?.innerText.replace(/\s+/g, ' ').trim(),
}));
const brandState = () => page.evaluate(() => ({
  title: document.title,
  favicon: document.getElementById('brand-favicon')?.getAttribute('href') ?? document.querySelector('link[rel=icon]')?.getAttribute('href'),
  bodyTheme: document.body.dataset.theme, htmlTheme: document.documentElement.dataset.theme,
}));
const bodyText = () => page.evaluate(() => document.body.innerText);
const hasBadTokens = (text) => /\bNaN\b|\bundefined\b|\bnull\b/.test(text);
const shot = (name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: false });

// =====================================================================================
console.log(`Phase 4B gate — BASE_URL=${BASE} API_URL=${API} viewport=${VIEWPORT.width}x${VIEWPORT.height} headless=${HEADLESS}`);
console.log(`node ${process.version} icu ${process.versions.icu} chromium ${browser.version()} playwright ${JSON.parse(fs.readFileSync(new URL('../node_modules/playwright/package.json', import.meta.url))).version}`);

// ---------- G: preconditions ----------
await step('G01', 'frontend reachable', async () => {
  const r = await fetch(`${BASE}/login`); check('G01', 'frontend reachable', r.status === 200, `GET ${BASE}/login -> ${r.status}`);
});
await step('G02', 'backend health', async () => {
  const r = await fetch(`${API}/health`); check('G02', 'backend health', r.status === 200, `GET ${API}/health -> ${r.status}`);
});
let adminApi, artistApi, adminOverview, artistOverview;
await step('G03', 'live API overview (admin)', async () => {
  adminApi = await apiLogin(ADMIN);
  adminOverview = await apiOverview(adminApi.body.token);
  const o = adminOverview.body;
  check('G03', 'live API overview (admin)', adminApi.status === 200 && adminOverview.status === 200,
    `login ${adminApi.status} pageAccess-in-payload=${'pageAccess' in (adminApi.body.user || {})}; overview ${adminOverview.status} monthlyRevenue=${o.monthlyRevenue} quarterlyProjection=${o.quarterlyProjection} annualProjection=${o.annualProjection} activeArtists=${o.activeArtists}`);
});
await step('G04', 'live API overview (artist)', async () => {
  artistApi = await apiLogin(ARTIST);
  artistOverview = await apiOverview(artistApi.body.token);
  const o = artistOverview.body;
  check('G04', 'live API overview (artist)', artistApi.status === 200 && artistOverview.status === 200,
    `login ${artistApi.status} role=${artistApi.body.user?.role} pageAccess-in-payload=${'pageAccess' in (artistApi.body.user || {})}; overview ${artistOverview.status} monthlyRevenue=${o.monthlyRevenue} quarterlyProjection=${o.quarterlyProjection} annualProjection=${o.annualProjection} activeArtists=${o.activeArtists}`);
});
const expAdminUsd = expectedKpis(adminOverview.body, SPEC.mau5trap.locale, SPEC.mau5trap.currency);
const expAdminGbp = expectedKpis(adminOverview.body, SPEC.example.locale, SPEC.example.currency);
const expArtistUsd = expectedKpis(artistOverview.body, SPEC.mau5trap.locale, SPEC.mau5trap.currency);
console.log(`INFO | expected (Node Intl) admin en-US/USD: ${expAdminUsd.join(' · ')} | admin en-GB/GBP: ${expAdminGbp.join(' · ')} | artist en-US/USD: ${expArtistUsd.join(' · ')}`);

// ---------- F: functional — mau5trap profile ----------
setPhase('unauth');
await page.goto(`${BASE}/login`);
await page.evaluate(() => localStorage.clear());
await step('F01', 'unauthenticated / -> /login', async () => {
  await page.goto(`${BASE}/`); await page.waitForURL('**/login', { timeout: T });
  check('F01', 'unauthenticated / -> /login', new URL(page.url()).pathname === '/login', page.url());
});
await step('F02', 'unauthenticated /dashboard -> /login', async () => {
  await page.goto(`${BASE}/dashboard`); await page.waitForURL('**/login', { timeout: T });
  check('F02', 'unauthenticated /dashboard -> /login', new URL(page.url()).pathname === '/login', page.url());
});

setPhase('login-page');
await gotoLogin();
await shot('phase4b-mau5trap-login.png');
let loginMau5;
await step('V01', 'mau5trap identity (title/favicon/theme) on /login', async () => {
  const b = await brandState();
  check('V01', 'mau5trap identity (title/favicon/theme) on /login', b.title === SPEC.mau5trap.title && b.favicon?.endsWith(SPEC.mau5trap.favicon) && b.bodyTheme === SPEC.mau5trap.theme && b.htmlTheme === SPEC.mau5trap.theme, JSON.stringify(b));
});
await step('V02', 'login card geometry (420/48/1px accent .35/4px/no shadow/centered)', async () => {
  loginMau5 = await page.evaluate(() => {
    const card = document.querySelector('form'); const cs = getComputedStyle(card); const r = card.getBoundingClientRect();
    const h1 = card.querySelector('h1'); const tag = card.querySelector('p'); const input = document.getElementById('access-id');
    const buttons = [...card.querySelectorAll('button')].map((b) => ({ text: b.textContent, disabled: b.disabled, color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor, h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width, fontSize: getComputedStyle(b).fontSize, fontWeight: getComputedStyle(b).fontWeight, fontFamily: getComputedStyle(b).fontFamily, transform: getComputedStyle(b).textTransform }));
    return {
      width: r.width, centerDx: (r.left + r.right) / 2 - innerWidth / 2, centerDy: (r.top + r.bottom) / 2 - innerHeight / 2,
      padding: cs.padding, borderWidth: cs.borderTopWidth, borderStyle: cs.borderTopStyle, borderColor: cs.borderTopColor, radius: cs.borderRadius, shadow: cs.boxShadow,
      innerWidth: r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2,
      wordmark: h1.textContent, wordmarkSize: getComputedStyle(h1).fontSize, wordmarkWeight: getComputedStyle(h1).fontWeight, wordmarkLs: getComputedStyle(h1).letterSpacing, wordmarkFamily: getComputedStyle(h1).fontFamily,
      tagline: tag.textContent, taglineSize: getComputedStyle(tag).fontSize, taglineColor: getComputedStyle(tag).color, taglineFamily: getComputedStyle(tag).fontFamily, taglineTransform: getComputedStyle(tag).textTransform,
      placeholder: input.placeholder, inputSize: getComputedStyle(input).fontSize, inputFamily: getComputedStyle(input).fontFamily, inputRadius: getComputedStyle(input).borderRadius, inputBg: getComputedStyle(input).backgroundColor,
      labels: [...card.querySelectorAll('label')].map((l) => ({ text: l.textContent, size: getComputedStyle(l).fontSize, weight: getComputedStyle(l).fontWeight, color: getComputedStyle(l).color, family: getComputedStyle(l).fontFamily })),
      buttons, footer: [...card.querySelectorAll('footer p')].map((p) => p.textContent), footerBorderTop: getComputedStyle(card.querySelector('footer')).borderTopWidth, footerSize: getComputedStyle(card.querySelector('footer')).fontSize, footerColor: getComputedStyle(card.querySelector('footer')).color,
      loginBg: getComputedStyle(card.parentElement).backgroundImage, bodyBg: getComputedStyle(document.body).backgroundColor, bodyBgImage: getComputedStyle(document.body).backgroundImage,
      hasAsideOrHeader: !!document.querySelector('aside, header'), images: card.querySelectorAll('img, svg').length,
    };
  });
  const l = loginMau5;
  check('V02', 'login card geometry (420/48/1px accent .35/4px/no shadow/centered)',
    l.width === 420 && l.padding === '48px' && l.borderWidth === '1px' && l.borderStyle === 'solid' && sameColor(l.borderColor, SPEC.mau5trap.accent35) && l.radius === '4px' && l.shadow === 'none' && Math.abs(l.centerDx) < 1 && Math.abs(l.centerDy) < 1 && !l.hasAsideOrHeader && l.images === 0,
    `width=${l.width} padding=${l.padding} border=${l.borderWidth} ${l.borderStyle} ${l.borderColor} radius=${l.radius} shadow=${l.shadow} centerOffset=(${l.centerDx.toFixed(2)},${l.centerDy.toFixed(2)}) sidebar/header=${l.hasAsideOrHeader} logo/img=${l.images}`);
  check('V03', 'login wordmark lowercase 32px/700 -1px Inter; tagline 12px mono muted (not green)',
    l.wordmark === SPEC.mau5trap.wordmark && l.wordmarkSize === '32px' && l.wordmarkWeight === '700' && l.wordmarkLs === '-1px' && /Inter/.test(l.wordmarkFamily) && l.tagline === SPEC.mau5trap.tagline && l.taglineSize === '12px' && sameColor(l.taglineColor, SPEC.muted) && /JetBrains Mono/.test(l.taglineFamily),
    `wordmark="${l.wordmark}" ${l.wordmarkSize}/${l.wordmarkWeight} ls=${l.wordmarkLs} ${l.wordmarkFamily.split(',')[0]}; tagline="${l.tagline}" ${l.taglineSize} ${l.taglineColor} ${l.taglineFamily.split(',')[0]}`);
  const submit = l.buttons.find((b) => b.text === 'INITIALIZE SESSION'); const forgot = l.buttons.find((b) => b.text === 'Forgot Password?');
  check('V04', 'login button full-width 48px accent fill, black 14px/700 mono uppercase',
    submit && Math.abs(submit.w - l.innerWidth) < 1 && submit.h === 48 && sameColor(submit.bg, SPEC.mau5trap.accent) && sameColor(submit.color, SPEC.onAccent) && submit.fontSize === '14px' && submit.fontWeight === '700' && /JetBrains Mono/.test(submit.fontFamily) && submit.transform === 'uppercase',
    submit ? `w=${submit.w} (card inner ${l.innerWidth}) h=${submit.h} bg=${submit.bg} color=${submit.color} ${submit.fontSize}/${submit.fontWeight} ${submit.fontFamily.split(',')[0]} ${submit.transform}` : 'submit button not found');
  check('F16', 'Forgot Password? present, disabled, 11px accent',
    forgot && forgot.disabled && forgot.fontSize === '11px' && sameColor(forgot.color, SPEC.mau5trap.accent),
    forgot ? `text="${forgot.text}" disabled=${forgot.disabled} ${forgot.fontSize} ${forgot.color}` : 'not found');
  check('V05', 'login labels 11px/700 mono muted; inputs 14px mono radius 2px bg rgba(0,0,0,.3); placeholder from profile',
    l.labels.length === 2 && l.labels.every((x) => x.size === '11px' && x.weight === '700' && sameColor(x.color, SPEC.muted) && /JetBrains Mono/.test(x.family)) && l.labels.map((x) => x.text).join('|') === 'ACCESS ID|PASSPHRASE' && l.inputSize === '14px' && /JetBrains Mono/.test(l.inputFamily) && l.inputRadius === '2px' && sameColor(l.inputBg, 'rgba(0, 0, 0, 0.3)') && l.placeholder === SPEC.mau5trap.placeholder,
    `labels=${l.labels.map((x) => `${x.text} ${x.size}/${x.weight} ${x.color}`).join('; ')} input=${l.inputSize} ${l.inputFamily.split(',')[0]} r=${l.inputRadius} bg=${l.inputBg} placeholder=${l.placeholder}`);
  check('V06', 'login footer: hairline top, two 11px mono muted lines (mau5trap has no legal line); body bg #0A0A0A + decoration gradient; login radial gradient',
    l.footer.length === SPEC.mau5trap.footerLines && l.footer[0] === SPEC.voice[3] && l.footer[1] === SPEC.voice[4] && l.footerBorderTop === '1px' && l.footerSize === '11px' && sameColor(l.footerColor, SPEC.muted) && sameColor(l.bodyBg, SPEC.bg) && /linear-gradient/.test(l.bodyBgImage) && /radial-gradient/.test(l.loginBg),
    `footer=${JSON.stringify(l.footer)} borderTop=${l.footerBorderTop} ${l.footerSize} ${l.footerColor}; bodyBg=${l.bodyBg} bodyImg=${l.bodyBgImage.slice(0, 40)}… loginImg=${l.loginBg.slice(0, 40)}…`);
});
await step('V15', 'keyboard focus ring (2px accent outline) on login controls', async () => {
  await page.mouse.click(5, 5);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { el: a.id || a.textContent?.trim().slice(0, 20), outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, shadow: cs.boxShadow }; }));
  }
  const focusable = seen.filter((s) => s.outline.startsWith('2px solid'));
  check('V15', 'keyboard focus ring (2px accent outline) on login controls', focusable.length >= 3 && focusable.every((s) => sameColor(s.outline.replace(/^2px solid /, ''), SPEC.mau5trap.accent) && s.shadow !== 'none'), seen.map((s) => `${s.el}: ${s.outline}${s.shadow !== 'none' ? ' +glow' : ''}`).join('; '));
});

setPhase('wrong-password', true);
await step('F03', 'wrong password -> inline server error, button restored, still /login', async () => {
  await gotoLogin();
  await page.fill('#access-id', ADMIN.email); await page.fill('#passphrase', 'definitely-wrong');
  await page.click('button[type=submit]');
  await page.waitForSelector('form [role=alert]', { timeout: T });
  const a = await page.evaluate(() => { const el = document.querySelector('form [role=alert]'); const cs = getComputedStyle(el); const p = el.querySelector('p'); return { text: el.textContent, bg: cs.backgroundColor, border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`, radius: cs.borderRadius, padding: cs.padding, msgSize: getComputedStyle(p).fontSize, align: getComputedStyle(p).textAlign, submit: document.querySelector('button[type=submit]').textContent, disabled: document.querySelector('button[type=submit]').disabled, path: location.pathname }; });
  check('F03', 'wrong password -> inline server error, button restored, still /login', a.text === 'Invalid credentials' && a.submit === 'INITIALIZE SESSION' && !a.disabled && a.path === '/login', `alert="${a.text}" submit="${a.submit}" disabled=${a.disabled} path=${a.path}`);
  check('V07', 'login error = panel variant (danger-dim bg, danger border, 4px, 12px pad, 13px centered)', sameColor(a.bg, SPEC.dangerDim) && a.border === `1px solid ${SPEC.dangerBorder}` && a.radius === '4px' && a.padding === '12px' && a.msgSize === '13px' && a.align === 'center', `bg=${a.bg} border=${a.border} radius=${a.radius} pad=${a.padding} msg=${a.msgSize} ${a.align}`);
});

setPhase('admin-login');
let adminNav, dash;
await step('F04', 'seeded admin login -> /dashboard', async () => {
  await uiLogin(ADMIN);
  check('F04', 'seeded admin login -> /dashboard', new URL(page.url()).pathname === '/dashboard', page.url());
});
await step('F05', 'admin KPI row === live API formatted en-US/USD', async () => {
  const labels = await kpiLabels(); const values = await kpiTexts();
  check('F05', 'admin KPI row === live API formatted en-US/USD', labels.join('|') === KPI_ORDER.join('|') && values.join('|') === expAdminUsd.join('|'), labels.map((l, i) => `${l} ${values[i]}`).join(' · ') + ` (expected ${expAdminUsd.join(' · ')})`);
});
await step('F06', 'no NaN/undefined/null on /dashboard', async () => {
  const t = await bodyText(); check('F06', 'no NaN/undefined/null on /dashboard', !hasBadTokens(t), `body text ${t.length} chars, tokens absent=${!hasBadTokens(t)}`);
});
await step('F07', 'admin nav: 8 primary + Settings + Terminate Session', async () => {
  adminNav = await navState();
  check('F07', 'admin nav: 8 primary + Settings + Terminate Session', adminNav.primary.join('|') === SPEC.navAll.join('|') && adminNav.secondary.join('|') === 'Settings' && adminNav.logout === 'Terminate Session', `primary=[${adminNav.primary.join(', ')}] secondary=[${adminNav.secondary.join(', ')}] bottom="${adminNav.logout}" header="${adminNav.header}"`);
});
await step('V08', 'shell geometry: sidebar 224 / 24px 16px / hairline / blur(20px); main 24px; header 56 + 24mb', async () => {
  dash = await page.evaluate(() => {
    const aside = document.querySelector('aside'); const acs = getComputedStyle(aside); const main = document.querySelector('main'); const header = document.querySelector('header');
    const links = [...document.querySelectorAll('nav[aria-label=Primary] a')]; const active = links.find((a) => a.getAttribute('aria-current') === 'page') || links[0]; const inactive = links[1];
    const sub = aside.querySelector('.label--accent'); const strong = aside.querySelector('strong'); const svgs = [...aside.querySelectorAll('svg')];
    const grid = document.querySelector('.kpi').closest('section').parentElement; const cards = [...grid.children];
    const logout = aside.querySelector('button'); const divider = logout.previousElementSibling;
    return {
      sidebarWidth: aside.getBoundingClientRect().width, sidebarPadding: acs.padding, sidebarBorderRight: `${acs.borderRightWidth} ${acs.borderRightStyle} ${acs.borderRightColor}`, blur: acs.backdropFilter, sidebarBgImage: acs.backgroundImage, sidebarPosition: acs.position,
      mainPadding: getComputedStyle(main).padding, mainMarginLeft: getComputedStyle(main).marginLeft,
      headerHeight: header.getBoundingClientRect().height, headerMb: getComputedStyle(header).marginBottom, h1: header.querySelector('h1').textContent, h1Size: getComputedStyle(header.querySelector('h1')).fontSize, h1Weight: getComputedStyle(header.querySelector('h1')).fontWeight, subtitle: header.querySelector('p')?.textContent, subtitleSize: header.querySelector('p') ? getComputedStyle(header.querySelector('p')).fontSize : null, headerInputs: header.querySelectorAll('input, select, a').length, chip: header.innerText.split('\n').filter(Boolean).slice(-2),
      active: { text: active.textContent, bg: getComputedStyle(active).backgroundColor, color: getComputedStyle(active).color, weight: getComputedStyle(active).fontWeight, h: active.getBoundingClientRect().height, radius: getComputedStyle(active).borderRadius, iconSize: getComputedStyle(active.querySelector('i')).fontSize, labelSize: getComputedStyle(active.querySelector('span')).fontSize },
      inactive: { text: inactive.textContent, bg: getComputedStyle(inactive).backgroundColor, color: getComputedStyle(inactive).color, weight: getComputedStyle(inactive).fontWeight },
      mark: svgs.length ? { w: svgs[0].getBoundingClientRect().width, h: svgs[0].getBoundingClientRect().height, circles: svgs[0].querySelectorAll('circle').length, ellipses: svgs[0].querySelectorAll('ellipse').length, paths: svgs[0].querySelectorAll('path').length, pathD: svgs[0].querySelector('path')?.getAttribute('d'), fill: getComputedStyle(svgs[0].querySelector('g')).fill, eyeFill: getComputedStyle(svgs[0].querySelector('ellipse')).fill, count: svgs.length, visible: svgs.map((s) => s.getBoundingClientRect().width) } : null,
      brandChildren: aside.firstElementChild.children.length, brandText: aside.firstElementChild.innerText.split('\n').filter(Boolean),
      wordmark: strong.textContent, wordmarkSize: getComputedStyle(strong).fontSize, wordmarkWeight: getComputedStyle(strong).fontWeight,
      sub: sub.textContent, subSize: getComputedStyle(sub).fontSize, subColor: getComputedStyle(sub).color, subFamily: getComputedStyle(sub).fontFamily, subTransform: getComputedStyle(sub).textTransform,
      logout: { text: logout.textContent, size: getComputedStyle(logout).fontSize, color: getComputedStyle(logout).color, bg: getComputedStyle(logout).backgroundColor, icon: logout.querySelector('i').className, bottomGap: innerHeight - logout.getBoundingClientRect().bottom }, dividerTop: getComputedStyle(divider).borderTopWidth,
      gridCols: getComputedStyle(grid).gridTemplateColumns.split(' ').length, gridGap: getComputedStyle(grid).gap, gridAlign: getComputedStyle(grid).alignItems, cardCount: cards.length,
      cards: cards.map((c) => { const cs = getComputedStyle(c); const b = getComputedStyle(c, '::before'); const k = c.querySelector('.kpi'); const kcs = getComputedStyle(k); const lb = getComputedStyle(c.querySelector('.label')); return { h: c.getBoundingClientRect().height, pad: cs.padding, radius: cs.borderRadius, border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`, shadow: cs.boxShadow, ruleW: b.width, ruleBg: b.backgroundColor, ruleOp: b.opacity, ruleH: b.height, clientH: c.clientHeight, kpiSize: kcs.fontSize, kpiWeight: kcs.fontWeight, kpiFamily: kcs.fontFamily, kpiColor: kcs.color, kpiNum: kcs.fontVariantNumeric, labelSize: lb.fontSize, labelColor: lb.color, labelTransform: lb.textTransform, children: c.children.length, icons: c.querySelectorAll('i, svg, a').length }; }),
      mainChildren: [...main.children].map((c) => c.tagName), overlay: !!document.querySelector('vite-error-overlay'),
    };
  });
  const d = dash;
  check('V08', 'shell geometry: sidebar 224 / 24px 16px / hairline / blur(20px); main 24px; header 56 + 24mb',
    d.sidebarWidth === 224 && d.sidebarPadding === '24px 16px' && d.sidebarBorderRight === `1px solid ${SPEC.hairline}` && d.blur === 'blur(20px)' && /linear-gradient/.test(d.sidebarBgImage) && d.sidebarPosition === 'fixed' && d.mainPadding === '24px' && d.mainMarginLeft === '224px' && d.headerHeight === 56 && d.headerMb === '24px',
    `sidebar=${d.sidebarWidth}px pad=${d.sidebarPadding} border-right=${d.sidebarBorderRight} ${d.blur} ${d.sidebarPosition}; main pad=${d.mainPadding} ml=${d.mainMarginLeft}; header=${d.headerHeight}px mb=${d.headerMb}`);
  check('V09', 'header: h1 28px/700 "Dashboard", 14px subtitle, user chip; no input/select/a',
    d.h1 === 'Dashboard' && d.h1Size === '28px' && d.h1Weight === '700' && d.subtitle === 'Real-time label performance metrics' && d.subtitleSize === '14px' && d.headerInputs === 0 && d.chip.length === 2,
    `h1="${d.h1}" ${d.h1Size}/${d.h1Weight}; subtitle="${d.subtitle}" ${d.subtitleSize}; chip=${JSON.stringify(d.chip)}; input/select/a=${d.headerInputs}`);
  check('V10', 'nav items 40px, 2px radius, 18px icon, 14px label; inactive muted; active text 600 on accent .1',
    d.active.h === 40 && d.active.radius === '2px' && d.active.iconSize === '18px' && d.active.labelSize === '14px' && sameColor(d.active.bg, SPEC.mau5trap.accent10) && sameColor(d.active.color, SPEC.text) && d.active.weight === '600' && sameColor(d.inactive.color, SPEC.muted) && d.inactive.weight === '400' && sameColor(d.inactive.bg, 'rgba(0, 0, 0, 0)'),
    `active "${d.active.text}" h=${d.active.h} r=${d.active.radius} icon=${d.active.iconSize} label=${d.active.labelSize} bg=${d.active.bg} color=${d.active.color} w=${d.active.weight}; inactive "${d.inactive.text}" color=${d.inactive.color} w=${d.inactive.weight} bg=${d.inactive.bg}`);
  check('V11', 'bottom group: Settings -> hairline -> Terminate Session (ri-logout-box-line, 14px muted, no fill) pinned bottom',
    d.logout.text === 'Terminate Session' && /ri-logout-box-line/.test(d.logout.icon) && d.logout.size === '14px' && sameColor(d.logout.color, SPEC.muted) && sameColor(d.logout.bg, 'rgba(0, 0, 0, 0)') && d.dividerTop === '1px' && d.logout.bottomGap >= 0 && d.logout.bottomGap <= 40,
    `"${d.logout.text}" icon=${d.logout.icon.split(' ')[0]} ${d.logout.size} ${d.logout.color} bg=${d.logout.bg} divider=${d.dividerTop} gap-to-viewport-bottom=${d.logout.bottomGap}px`);
  check('V12', 'brand block: Mau5Head SVG 40x40 (3 circle/2 ellipse/1 path, accent+text fills), wordmark 20px/800 lowercase, sublabel 11px mono accent uppercase; nothing else',
    d.mark && d.mark.w === 40 && d.mark.h === 40 && d.mark.circles === 3 && d.mark.ellipses === 2 && d.mark.paths === 1 && d.mark.pathD === SPEC.mau5HeadPath && sameColor(d.mark.fill, SPEC.mau5trap.accent) && sameColor(d.mark.eyeFill, SPEC.text) && d.wordmark === SPEC.mau5trap.wordmark && d.wordmarkSize === '20px' && d.wordmarkWeight === '800' && d.sub === SPEC.mau5trap.tagline && d.subSize === '11px' && sameColor(d.subColor, SPEC.mau5trap.accent) && /JetBrains Mono/.test(d.subFamily) && d.subTransform === 'uppercase' && d.brandText.join('|') === `${SPEC.mau5trap.wordmark}|${SPEC.mau5trap.tagline}`,
    d.mark ? `svg ${d.mark.w}x${d.mark.h} circles=${d.mark.circles} ellipses=${d.mark.ellipses} paths=${d.mark.paths} d="${d.mark.pathD}" fill=${d.mark.fill} eyes=${d.mark.eyeFill} (rail copy width=${d.mark.visible[1]}); wordmark="${d.wordmark}" ${d.wordmarkSize}/${d.wordmarkWeight}; sub="${d.sub}" ${d.subSize} ${d.subColor} ${d.subTransform}; block text=${JSON.stringify(d.brandText)}` : 'no svg in sidebar');
  const c0 = d.cards[0];
  check('V13', 'KPI row: 4 cards, 4 columns, gap 16, align start, 88-112px, pad 16, 4px, hairline, no shadow, no icons',
    d.cardCount === 4 && d.gridCols === 4 && d.gridGap === '16px' && d.gridAlign === 'start' && d.cards.every((c) => c.h >= 88 && c.h <= 112 && c.pad === '16px' && c.radius === '4px' && c.border === `1px solid ${SPEC.hairline}` && c.shadow === 'none' && c.children === 2 && c.icons === 0),
    `cards=${d.cardCount} cols=${d.gridCols} gap=${d.gridGap} align=${d.gridAlign}; heights=[${d.cards.map((c) => c.h.toFixed(1)).join(',')}] pad=${c0.pad} r=${c0.radius} border=${c0.border} shadow=${c0.shadow}`);
  check('V14', 'KPI anatomy: 2px accent left rule @.5 full height; .label 11px mono muted uppercase; .kpi 32px/700 mono text tabular-nums',
    d.cards.every((c) => c.ruleW === '2px' && sameColor(c.ruleBg, SPEC.mau5trap.accent) && c.ruleOp === '0.5' && Math.abs(parseFloat(c.ruleH) - c.clientH) < 1 && c.labelSize === '11px' && sameColor(c.labelColor, SPEC.muted) && c.labelTransform === 'uppercase' && c.kpiSize === '32px' && c.kpiWeight === '700' && /JetBrains Mono/.test(c.kpiFamily) && sameColor(c.kpiColor, SPEC.text) && c.kpiNum === 'tabular-nums'),
    `rule=${c0.ruleW} ${c0.ruleBg} op=${c0.ruleOp} h=${c0.ruleH} (card inner ${c0.clientH}px); label ${c0.labelSize} ${c0.labelColor} ${c0.labelTransform}; kpi ${c0.kpiSize}/${c0.kpiWeight} ${c0.kpiFamily.split(',')[0]} ${c0.kpiColor} ${c0.kpiNum}`);
  check('V16', 'nothing below the KPI row (main = header + grid), no Vite error overlay', d.mainChildren.join('|') === 'HEADER|DIV' && !d.overlay, `main children=[${d.mainChildren.join(', ')}] overlay=${d.overlay}`);
});
await shot('phase4b-mau5trap-dashboard.png');

await step('F08', 'persisted session survives reload; userData reconciled with /v3/auth/me', async () => {
  const before = await readSession();
  await page.reload(); await page.waitForSelector('.kpi', { timeout: T });
  const after = await readSession(); const u = JSON.parse(after.userData);
  check('F08', 'persisted session survives reload; userData reconciled with /v3/auth/me', new URL(page.url()).pathname === '/dashboard' && after.authToken === before.authToken && u.email === ADMIN.email && u.role === 'admin' && typeof u.name === 'string', `path=${new URL(page.url()).pathname} token-unchanged=${after.authToken === before.authToken} userData=${JSON.stringify({ ...u, id: u.id })}`);
});
await step('F15', 'unbuilt routes redirect to /dashboard (nav click + direct)', async () => {
  const errBefore = consoleErrors.length + pageErrors.length;
  await page.click('nav[aria-label=Primary] a:has-text("Artists")'); await page.waitForURL('**/dashboard', { timeout: T }); const p1 = new URL(page.url()).pathname;
  await page.click('nav[aria-label=Secondary] a:has-text("Settings")'); await page.waitForURL('**/dashboard', { timeout: T }); const p2 = new URL(page.url()).pathname;
  await page.goto(`${BASE}/anr`); await page.waitForURL('**/dashboard', { timeout: T }); const p3 = new URL(page.url()).pathname;
  await page.goto(`${BASE}/does-not-exist`); await page.waitForURL('**/dashboard', { timeout: T }); const p4 = new URL(page.url()).pathname;
  await page.waitForSelector('.kpi', { timeout: T });
  const notFound = await page.evaluate(() => /404|not found/i.test(document.body.innerText));
  check('F15', 'unbuilt routes redirect to /dashboard (nav click + direct)', [p1, p2, p3, p4].every((p) => p === '/dashboard') && !notFound && consoleErrors.length + pageErrors.length === errBefore, `Artists->${p1} Settings->${p2} /anr->${p3} /does-not-exist->${p4} 404text=${notFound} newErrors=${consoleErrors.length + pageErrors.length - errBefore}`);
});
await step('F17', 'localStorage keys ⊆ {authToken,userData,platform.brandProfile}', async () => {
  const s = await readSession(); const allowed = ['authToken', 'userData', 'platform.brandProfile'];
  check('F17', 'localStorage keys ⊆ {authToken,userData,platform.brandProfile}', s.keys.every((k) => allowed.includes(k)) && !s.keys.some((k) => k.startsWith('mau5trap.')), `keys=[${s.keys.join(', ')}]`);
});

setPhase('loader');
await step('V17', 'full-page loader is the mau5-head (80px ring + 2 ears, pulse) on #0A0A0A, no spinner text', async () => {
  await context.route('**/v3/label/overview', (route) => setTimeout(() => route.continue().catch(() => {}), 1500));
  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector('[role=status]', { timeout: T });
  const l = await page.evaluate(() => { const s = document.querySelector('[role=status]'); const cs = getComputedStyle(s); const head = s.firstElementChild; const hcs = getComputedStyle(head); const b = getComputedStyle(head, '::before'); const a = getComputedStyle(head, '::after'); return { pos: cs.position, inset: `${cs.top} ${cs.right} ${cs.bottom} ${cs.left}`, bg: cs.backgroundColor, text: s.innerText.trim(), w: head.getBoundingClientRect().width, h: head.getBoundingClientRect().height, border: `${hcs.borderTopWidth} ${hcs.borderTopStyle} ${hcs.borderTopColor}`, radius: hcs.borderRadius, anim: hcs.animationName, running: head.getAnimations().length, earW: b.width, earH: b.height, earBorder: `${b.borderTopWidth} ${b.borderTopColor}`, earBefore: `${b.width}x${b.height} ${b.borderTopWidth} ${b.borderTopColor} top=${b.top} left=${b.left}`, earAfter: `${a.width}x${a.height} right=${a.right}`, earCount: (b.content !== 'none' ? 1 : 0) + (a.content !== 'none' ? 1 : 0), svgOrImg: s.querySelectorAll('svg, img').length }; });
  await context.unroute('**/v3/label/overview');
  await page.waitForSelector('.kpi', { timeout: T });
  check('V17', 'full-page loader is the mau5-head (80px ring + 2 ears, pulse) on #0A0A0A, no spinner text', l.pos === 'fixed' && sameColor(l.bg, SPEC.bg) && l.w === 80 && l.h === 80 && l.border === `4px solid ${SPEC.mau5trap.accent}` && l.anim === 'pulse' && l.running >= 1 && l.earCount === 2 && l.earW === '50px' && l.earH === '50px' && l.earBorder === `4px ${SPEC.mau5trap.accent}` && l.text === '', `fixed=${l.pos === 'fixed'} bg=${l.bg} ring=${l.w}x${l.h} border=${l.border} anim=${l.anim} running=${l.running} ears=${l.earCount} (${l.earBefore}; ${l.earAfter}) text="${l.text}" svg/img=${l.svgOrImg}`);
});

setPhase('logout');
await step('F09', 'Terminate Session -> /login, authToken/userData cleared', async () => {
  await page.click('aside button:has-text("Terminate Session")'); await page.waitForURL('**/login', { timeout: T });
  const s = await readSession();
  check('F09', 'Terminate Session -> /login, authToken/userData cleared', new URL(page.url()).pathname === '/login' && s.authToken === null && s.userData === null, `path=${new URL(page.url()).pathname} authToken=${s.authToken} userData=${s.userData}`);
});

setPhase('artist-login');
await step('F10', 'seeded artist: nav ONLY Dashboard+Artists, Settings+Terminate Session; KPI === live artist API en-US/USD; no NaN', async () => {
  await uiLogin(ARTIST);
  const n = await navState(); const values = await kpiTexts(); const t = await bodyText();
  check('F10', 'seeded artist: nav ONLY Dashboard+Artists, Settings+Terminate Session; KPI === live artist API en-US/USD; no NaN', n.primary.join('|') === SPEC.navArtist.join('|') && n.secondary.join('|') === 'Settings' && n.logout === 'Terminate Session' && values.join('|') === expArtistUsd.join('|') && !hasBadTokens(t), `primary=[${n.primary.join(', ')}] secondary=[${n.secondary.join(', ')}] bottom="${n.logout}" kpi=${values.join(' · ')} (expected ${expArtistUsd.join(' · ')}) header="${n.header}"`);
  await page.click('aside button:has-text("Terminate Session")'); await page.waitForURL('**/login', { timeout: T });
});

setPhase('garbage-token', true);
await step('F11', 'garbage authToken + reload -> back to /login, session cleared (records backend status)', async () => {
  await uiLogin(ADMIN);
  const statuses = []; const onResp = (r) => { if (/\/v3\//.test(r.url())) statuses.push(`${new URL(r.url()).pathname}:${r.status()}`); }; page.on('response', onResp);
  await page.evaluate(() => localStorage.setItem('authToken', 'garbage.token.value'));
  await page.reload(); await page.waitForURL('**/login', { timeout: T }); page.off('response', onResp);
  const s = await readSession();
  check('F11', 'garbage authToken + reload -> back to /login, session cleared (records backend status)', new URL(page.url()).pathname === '/login' && s.authToken === null && s.userData === null, `path=${new URL(page.url()).pathname} authToken=${s.authToken} userData=${s.userData} backend=[${[...new Set(statuses)].join(', ')}]`);
});
setPhase('intercepted-401', true);
await step('F12', 'intercepted 401 on overview -> session cleared -> /login', async () => {
  await uiLogin(ADMIN);
  await context.route('**/v3/label/overview', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Authentication required' }) }));
  await page.reload(); await page.waitForURL('**/login', { timeout: T });
  await context.unroute('**/v3/label/overview');
  const s = await readSession();
  check('F12', 'intercepted 401 on overview -> session cleared -> /login', new URL(page.url()).pathname === '/login' && s.authToken === null && s.userData === null, `path=${new URL(page.url()).pathname} authToken=${s.authToken} userData=${s.userData}`);
});
setPhase('intercepted-403', true);
await step('F13', 'intercepted 403 on overview -> fullscreen ACCESS DENIED, no retry, session kept', async () => {
  await uiLogin(ADMIN);
  await context.route('**/v3/label/overview', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Access denied: insufficient permissions' }) }));
  await page.reload(); await page.waitForSelector('[role=alert]', { timeout: T });
  await page.waitForTimeout(300);
  const a = await page.evaluate(() => { const el = document.querySelector('[role=alert]'); return { kicker: el.querySelector('.label')?.textContent, message: el.querySelector('p')?.textContent, buttons: [...el.querySelectorAll('button')].map((b) => b.textContent), pos: getComputedStyle(el).position, path: location.pathname, kpis: document.querySelectorAll('.kpi').length }; });
  const s = await readSession();
  await context.unroute('**/v3/label/overview');
  check('F13', 'intercepted 403 on overview -> fullscreen ACCESS DENIED, no retry, session kept', a.kicker === 'ACCESS DENIED' && a.buttons.length === 0 && a.pos === 'fixed' && a.path === '/dashboard' && a.kpis === 0 && s.authToken !== null, `kicker="${a.kicker}" message="${a.message}" buttons=${JSON.stringify(a.buttons)} ${a.pos} path=${a.path} kpis=${a.kpis} token-kept=${s.authToken !== null}`);
});

setPhase('network-failure', true);
await step('F14', 'API unreachable on reload -> CONNECTION FAILURE fullscreen; RETRY CONNECTION renders KPIs without reload', async () => {
  await context.route('**/v3/**', (route) => route.abort('connectionrefused'));
  await page.reload(); await page.waitForSelector('[role=alert]', { timeout: T });
  await page.waitForTimeout(300);
  const e = await page.evaluate(() => { const el = document.querySelector('[role=alert]'); const cs = getComputedStyle(el); const icon = el.querySelector('i'); const k = el.querySelector('.label'); const p = el.querySelector('p'); const b = el.querySelector('button'); const bcs = b ? getComputedStyle(b) : null; window.__gateNoReload = 'kept'; return { pos: cs.position, inset: `${cs.top} ${cs.right} ${cs.bottom} ${cs.left}`, bg: cs.backgroundColor, icon: icon?.className, iconSize: icon ? getComputedStyle(icon).fontSize : null, iconColor: icon ? getComputedStyle(icon).color : null, kicker: k?.textContent, kickerSize: k ? getComputedStyle(k).fontSize : null, kickerColor: k ? getComputedStyle(k).color : null, kickerFamily: k ? getComputedStyle(k).fontFamily : null, message: p?.textContent, msgSize: p ? getComputedStyle(p).fontSize : null, msgColor: p ? getComputedStyle(p).color : null, button: b?.textContent, btnBg: bcs?.backgroundColor, btnColor: bcs?.color, btnRadius: bcs?.borderRadius, btnH: b?.getBoundingClientRect().height, btnFamily: bcs?.fontFamily, btnTransform: bcs?.textTransform, rootEmpty: document.getElementById('root').children.length === 0, overlay: !!document.querySelector('vite-error-overlay'), session: !!localStorage.getItem('authToken') }; });
  await shot('phase4b-error.png');
  await context.unroute('**/v3/**');
  setPhase('network-recovery');
  await page.click('[role=alert] button:has-text("RETRY CONNECTION")');
  await page.waitForSelector('.kpi', { timeout: T });
  const after = await page.evaluate(() => ({ marker: window.__gateNoReload, kpis: [...document.querySelectorAll('.kpi')].map((k) => k.textContent), alert: !!document.querySelector('[role=alert]') }));
  check('F14', 'API unreachable on reload -> CONNECTION FAILURE fullscreen; RETRY CONNECTION renders KPIs without reload', e.pos === 'fixed' && e.kicker === 'CONNECTION FAILURE' && e.button === 'RETRY CONNECTION' && !e.rootEmpty && !e.overlay && e.session && after.marker === 'kept' && after.kpis.join('|') === expAdminUsd.join('|') && !after.alert, `kicker="${e.kicker}" message="${e.message}" button="${e.button}" white-screen=${e.rootEmpty} overlay=${e.overlay} session-kept=${e.session}; after retry: reload=${after.marker !== 'kept'} kpi=${after.kpis.join(' · ')} alert=${after.alert}`);
  check('V18', 'fullscreen ErrorState anatomy: fixed inset 0 #0A0A0A; 48px danger icon; 16px mono danger kicker; 14px muted message; danger button (dim fill, danger text, 2px, 32px, mono uppercase)', e.pos === 'fixed' && e.inset === '0px 0px 0px 0px' && sameColor(e.bg, SPEC.bg) && /ri-error-warning-line/.test(e.icon) && e.iconSize === '48px' && sameColor(e.iconColor, SPEC.danger) && e.kickerSize === '16px' && sameColor(e.kickerColor, SPEC.danger) && /JetBrains Mono/.test(e.kickerFamily) && e.msgSize === '14px' && sameColor(e.msgColor, SPEC.muted) && sameColor(e.btnBg, SPEC.dangerDim) && sameColor(e.btnColor, SPEC.danger) && e.btnRadius === '2px' && e.btnH === 32 && /JetBrains Mono/.test(e.btnFamily) && e.btnTransform === 'uppercase', `inset=${e.inset} bg=${e.bg} icon=${e.icon?.split(' ')[0]} ${e.iconSize} ${e.iconColor}; kicker ${e.kickerSize} ${e.kickerColor}; msg ${e.msgSize} ${e.msgColor}; button bg=${e.btnBg} color=${e.btnColor} r=${e.btnRadius} h=${e.btnH} ${e.btnTransform}`);
});

// ---------- R: responsive (admin session still active) ----------
setPhase('responsive');
await step('R01', '1280x800: 4 KPI columns, full 224px sidebar', async () => {
  await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(200);
  const r = await page.evaluate(() => ({ cols: getComputedStyle(document.querySelector('.kpi').closest('section').parentElement).gridTemplateColumns.split(' ').length, sidebar: document.querySelector('aside').getBoundingClientRect().width, scrollW: document.documentElement.scrollWidth }));
  check('R01', '1280x800: 4 KPI columns, full 224px sidebar', r.cols === 4 && r.sidebar === 224 && r.scrollW <= 1280, `cols=${r.cols} sidebar=${r.sidebar} scrollWidth=${r.scrollW}`);
});
await step('R02', '1024x768: 56px icon rail (24px mark only), KPIs 2x2, no horizontal overflow', async () => {
  await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(200);
  const r = await page.evaluate(() => { const aside = document.querySelector('aside'); const svgs = [...aside.querySelectorAll('svg')].map((s) => s.getBoundingClientRect().width); return { cols: getComputedStyle(document.querySelector('.kpi').closest('section').parentElement).gridTemplateColumns.split(' ').length, sidebar: aside.getBoundingClientRect().width, marks: svgs, labelsVisible: [...aside.querySelectorAll('nav span')].filter((s) => s.getBoundingClientRect().width > 0).length, wordmarkVisible: aside.querySelector('strong').getBoundingClientRect().width > 0, mainMl: getComputedStyle(document.querySelector('main')).marginLeft, scrollW: document.documentElement.scrollWidth, cards: document.querySelectorAll('.kpi').length }; });
  check('R02', '1024x768: 56px icon rail (24px mark only), KPIs 2x2, no horizontal overflow', r.cols === 2 && r.sidebar === 56 && r.marks.filter((w) => w > 0).join('|') === '24' && r.labelsVisible === 0 && !r.wordmarkVisible && r.mainMl === '56px' && r.scrollW <= 1024 && r.cards === 4, `cols=${r.cols} sidebar=${r.sidebar} visibleMarks=[${r.marks.filter((w) => w > 0).join(',')}] navLabelsVisible=${r.labelsVisible} wordmarkVisible=${r.wordmarkVisible} main-ml=${r.mainMl} scrollWidth=${r.scrollW}`);
  await page.setViewportSize(VIEWPORT);
});

// ---------- P: portability — example-records (dev localStorage override; NO file edits) ----------
setPhase('example-records');
await step('P00', 'switch to example-records via localStorage override (dev hook), session cleared', async () => {
  await page.evaluate(() => { localStorage.setItem('platform.brandProfile', 'example-records'); localStorage.removeItem('authToken'); localStorage.removeItem('userData'); });
  await gotoLogin();
  check('P00', 'switch to example-records via localStorage override (dev hook), session cleared', (await readSession()).keys.includes('platform.brandProfile'), `keys=[${(await readSession()).keys.join(', ')}]`);
});
await shot('phase4b-example-login.png');
await step('P01', 'example-records identity (title/favicon/theme)', async () => {
  const b = await brandState();
  check('P01', 'example-records identity (title/favicon/theme)', b.title === SPEC.example.title && b.favicon?.endsWith(SPEC.example.favicon) && b.bodyTheme === SPEC.example.theme && b.htmlTheme === SPEC.example.theme, JSON.stringify(b));
});
await step('P02', 'example login: wordmark/sublabel/placeholder/3rd footer line; platform voice unchanged', async () => {
  const l = await page.evaluate(() => { const card = document.querySelector('form'); return { wordmark: card.querySelector('h1').textContent, tagline: card.querySelector('p').textContent, placeholder: document.getElementById('access-id').placeholder, footer: [...card.querySelectorAll('footer p')].map((p) => p.textContent), labels: [...card.querySelectorAll('label')].map((x) => x.textContent), buttons: [...card.querySelectorAll('button')].map((b) => b.textContent), text: document.body.innerText }; });
  const voiceOk = SPEC.voice.every((v) => l.text.includes(v));
  check('P02', 'example login: wordmark/sublabel/placeholder/3rd footer line; platform voice unchanged', l.wordmark === SPEC.example.wordmark && l.tagline === SPEC.example.tagline && l.placeholder === SPEC.example.placeholder && l.footer.length === 3 && l.footer[2] === SPEC.example.footer3 && voiceOk, `wordmark="${l.wordmark}" tagline="${l.tagline}" placeholder=${l.placeholder} footer=${JSON.stringify(l.footer)} voice-present=${voiceOk}`);
});
await step('P03', 'example login: card border, button fill, Forgot link are magenta; card geometry unchanged', async () => {
  const l = await page.evaluate(() => { const card = document.querySelector('form'); const cs = getComputedStyle(card); const b = [...card.querySelectorAll('button')]; const submit = b.find((x) => x.type === 'submit'); const forgot = b.find((x) => x.disabled); return { width: card.getBoundingClientRect().width, padding: cs.padding, border: cs.borderTopColor, btnBg: getComputedStyle(submit).backgroundColor, btnColor: getComputedStyle(submit).color, forgot: getComputedStyle(forgot).color, radial: getComputedStyle(card.parentElement).backgroundImage }; });
  check('P03', 'example login: card border, button fill, Forgot link are magenta; card geometry unchanged', l.width === 420 && l.padding === '48px' && sameColor(l.border, SPEC.example.accent35) && sameColor(l.btnBg, SPEC.example.accent) && sameColor(l.btnColor, SPEC.onAccent) && sameColor(l.forgot, SPEC.example.accent), `width=${l.width} pad=${l.padding} border=${l.border} button=${l.btnBg}/${l.btnColor} forgot=${l.forgot}`);
});
let exampleNav;
await step('P04', 'example dashboard: admin KPI === live API formatted en-GB/GBP (lowercase m)', async () => {
  await uiLogin(ADMIN);
  const labels = await kpiLabels(); const values = await kpiTexts();
  check('P04', 'example dashboard: admin KPI === live API formatted en-GB/GBP (lowercase m)', labels.join('|') === KPI_ORDER.join('|') && values.join('|') === expAdminGbp.join('|'), labels.map((l, i) => `${l} ${values[i]}`).join(' · ') + ` (expected ${expAdminGbp.join(' · ')})`);
});
await shot('phase4b-example-dashboard.png');
await step('P05', 'example shell: MonogramMark "E" 40x40 magenta mono (no svg), wordmark/sublabel from profile, sublabel magenta', async () => {
  const s = await page.evaluate(() => { const aside = document.querySelector('aside'); const block = aside.firstElementChild; const mono = [...block.querySelectorAll('span')].find((x) => x.children.length === 0 && x.getBoundingClientRect().width === 40 && x.getBoundingClientRect().height === 40 && x.textContent.trim().length === 1); const sub = aside.querySelector('.label--accent'); return { glyph: mono?.textContent, monoBg: mono ? getComputedStyle(mono).backgroundColor : null, monoColor: mono ? getComputedStyle(mono).color : null, monoFamily: mono ? getComputedStyle(mono).fontFamily : null, monoRadius: mono ? getComputedStyle(mono).borderRadius : null, svgs: block.querySelectorAll('svg').length, wordmark: aside.querySelector('strong').textContent, sub: sub.textContent, subColor: getComputedStyle(sub).color, blockText: block.innerText.split('\n').filter(Boolean) }; });
  check('P05', 'example shell: MonogramMark "E" 40x40 magenta mono (no svg), wordmark/sublabel from profile, sublabel magenta', s.glyph === 'E' && sameColor(s.monoBg, SPEC.example.accent) && sameColor(s.monoColor, SPEC.onAccent) && /JetBrains Mono/.test(s.monoFamily) && s.svgs === 0 && s.wordmark === SPEC.example.wordmark && s.sub === SPEC.example.tagline && sameColor(s.subColor, SPEC.example.accent), `glyph="${s.glyph}" bg=${s.monoBg} color=${s.monoColor} ${s.monoFamily?.split(',')[0]} r=${s.monoRadius} svgs=${s.svgs}; wordmark="${s.wordmark}" sub="${s.sub}" ${s.subColor}; block=${JSON.stringify(s.blockText)}`);
});
await step('P06', 'example shell: nav/header/Terminate Session identical to mau5trap run; active tint + StatCard rules magenta', async () => {
  exampleNav = await navState();
  const c = await page.evaluate(() => { const links = [...document.querySelectorAll('nav[aria-label=Primary] a')]; const active = links.find((a) => a.getAttribute('aria-current') === 'page'); const cards = [...document.querySelectorAll('.kpi')].map((k) => k.closest('section')); return { activeBg: getComputedStyle(active).backgroundColor, rules: cards.map((x) => getComputedStyle(x, '::before').backgroundColor) }; });
  check('P06', 'example shell: nav/header/Terminate Session identical to mau5trap run; active tint + StatCard rules magenta', JSON.stringify([exampleNav.primary, exampleNav.secondary, exampleNav.logout, exampleNav.header]) === JSON.stringify([adminNav.primary, adminNav.secondary, adminNav.logout, adminNav.header]) && sameColor(c.activeBg, SPEC.example.accent10) && c.rules.every((r) => sameColor(r, SPEC.example.accent)), `nav-identical=${JSON.stringify(exampleNav.primary) === JSON.stringify(adminNav.primary)} header="${exampleNav.header}" activeBg=${c.activeBg} rules=[${[...new Set(c.rules)].join(', ')}]`);
});
await step('P07', 'example: no "mau5trap" in body text (/login + /dashboard), no class containing "mau5", no green element colour', async () => {
  const scan = () => page.evaluate(() => { const els = [...document.querySelectorAll('body *')]; const green = []; for (const el of els) { const cs = getComputedStyle(el); for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'outlineColor', 'fill']) { const v = cs[prop]; if (/rgb\(0, 255, 95\)|srgb 0 1 0\.37/.test(v)) green.push(`${el.tagName}.${prop}`); } } return { text: document.body.innerText, mau5Class: els.filter((e) => /mau5/i.test(e.className?.baseVal ?? e.className ?? '')).length, green: [...new Set(green)] }; });
  const d = await scan();
  await page.click('aside button:has-text("Terminate Session")'); await page.waitForURL('**/login', { timeout: T });
  const l = await scan();
  check('P07', 'example: no "mau5trap" in body text (/login + /dashboard), no class containing "mau5", no green element colour', !/mau5trap/i.test(d.text) && !/mau5trap/i.test(l.text) && d.mau5Class === 0 && l.mau5Class === 0 && d.green.length === 0 && l.green.length === 0, `dashboard: mau5trap-in-text=${/mau5trap/i.test(d.text)} mau5-classes=${d.mau5Class} green-elements=${d.green.length}; login: mau5trap-in-text=${/mau5trap/i.test(l.text)} mau5-classes=${l.mau5Class} green-elements=${l.green.length}`);
});
await step('P08', 'example: full-page loader is the RingLoader (80px ring, pulse, no ears)', async () => {
  await uiLogin(ADMIN);
  await context.route('**/v3/label/overview', (route) => setTimeout(() => route.continue().catch(() => {}), 1500));
  await page.goto(`${BASE}/dashboard`); await page.waitForSelector('[role=status]', { timeout: T });
  const l = await page.evaluate(() => { const s = document.querySelector('[role=status]'); const ring = s.firstElementChild; const cs = getComputedStyle(ring); return { w: ring.getBoundingClientRect().width, h: ring.getBoundingClientRect().height, border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`, radius: cs.borderRadius, anim: cs.animationName, running: ring.getAnimations().length, ears: (getComputedStyle(ring, '::before').content !== 'none' ? 1 : 0) + (getComputedStyle(ring, '::after').content !== 'none' ? 1 : 0), bg: getComputedStyle(s).backgroundColor }; });
  await context.unroute('**/v3/label/overview'); await page.waitForSelector('.kpi', { timeout: T });
  check('P08', 'example: full-page loader is the RingLoader (80px ring, pulse, no ears)', l.w === 80 && l.h === 80 && sameColor(l.border.replace(/^4px solid /, ''), SPEC.example.accent) && l.border.startsWith('4px solid') && l.anim === 'pulse' && l.running >= 1 && l.ears === 0 && sameColor(l.bg, SPEC.bg), `ring=${l.w}x${l.h} border=${l.border} anim=${l.anim} running=${l.running} ears=${l.ears} bg=${l.bg}`);
});
await step('P09', 'example: fullscreen ErrorState unchanged except hue (kicker/button copy identical, button magenta-free danger)', async () => {
  setPhase('example-network-failure', true);
  await context.route('**/v3/**', (route) => route.abort('connectionrefused'));
  await page.reload(); await page.waitForSelector('[role=alert]', { timeout: T }); await page.waitForTimeout(200);
  const e = await page.evaluate(() => { const el = document.querySelector('[role=alert]'); const b = el.querySelector('button'); return { kicker: el.querySelector('.label')?.textContent, button: b?.textContent, btnBg: getComputedStyle(b).backgroundColor, btnColor: getComputedStyle(b).color, bg: getComputedStyle(el).backgroundColor }; });
  await context.unroute('**/v3/**'); setPhase('example-records');
  await page.click('[role=alert] button'); await page.waitForSelector('.kpi', { timeout: T });
  check('P09', 'example: fullscreen ErrorState unchanged except hue (kicker/button copy identical, button magenta-free danger)', e.kicker === 'CONNECTION FAILURE' && e.button === 'RETRY CONNECTION' && sameColor(e.btnBg, SPEC.dangerDim) && sameColor(e.btnColor, SPEC.danger) && sameColor(e.bg, SPEC.bg), `kicker="${e.kicker}" button="${e.button}" btn=${e.btnBg}/${e.btnColor} bg=${e.bg}`);
});

// ---------- back to mau5trap: remove the override, no edits ----------
setPhase('restore-mau5trap');
await step('P10', 'remove override -> mau5trap identity, accent, mark, wordmark and $ KPIs return with no edits', async () => {
  await page.evaluate(() => localStorage.removeItem('platform.brandProfile'));
  await page.reload(); await page.waitForSelector('.kpi', { timeout: T });
  const b = await brandState(); const values = await kpiTexts();
  const s = await page.evaluate(() => { const aside = document.querySelector('aside'); const sub = aside.querySelector('.label--accent'); const svg = aside.querySelector('svg'); return { wordmark: aside.querySelector('strong').textContent, sub: sub.textContent, subColor: getComputedStyle(sub).color, svg: svg ? `${svg.getBoundingClientRect().width}x${svg.getBoundingClientRect().height} circles=${svg.querySelectorAll('circle').length}` : null, keys: Object.keys(localStorage) }; });
  check('P10', 'remove override -> mau5trap identity, accent, mark, wordmark and $ KPIs return with no edits', b.title === SPEC.mau5trap.title && b.favicon?.endsWith(SPEC.mau5trap.favicon) && b.bodyTheme === SPEC.mau5trap.theme && s.wordmark === SPEC.mau5trap.wordmark && s.sub === SPEC.mau5trap.tagline && sameColor(s.subColor, SPEC.mau5trap.accent) && s.svg === '40x40 circles=3' && values.join('|') === expAdminUsd.join('|') && !s.keys.includes('platform.brandProfile'), `title="${b.title}" theme=${b.bodyTheme} favicon=${b.favicon} wordmark="${s.wordmark}" sub="${s.sub}" ${s.subColor} mark=${s.svg} kpi=${values.join(' · ')} keys=[${s.keys.join(', ')}]`);
  await page.click('aside button:has-text("Terminate Session")'); await page.waitForURL('**/login', { timeout: T });
});

// ---------- C: console hygiene ----------
setPhase('end');
check('C01', 'no uncaught page errors during the run', pageErrors.length === 0, pageErrors.length ? pageErrors.join(' || ') : 'none');
check('C02', 'no unexpected console.error during the run (resource errors during provoked 401/403/network phases are listed separately)', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.join(' || ') : `none; expected resource errors=${expectedResourceErrors.length} [${[...new Set(expectedResourceErrors.map((x) => x.replace(/^\[[^\]]+\] /, '')))].join(' | ')}]`);
console.log(`INFO | console warnings (${consoleWarnings.length}): ${[...new Set(consoleWarnings.map((x) => x.replace(/^\[[^\]]+\] /, '')))].join(' || ') || 'none'}`);
console.log(`INFO | screenshots written to ${SHOTS}: phase4b-mau5trap-login.png phase4b-mau5trap-dashboard.png phase4b-example-login.png phase4b-example-dashboard.png phase4b-error.png`);

await browser.close();
const pass = results.filter((r) => r.pass).length; const fail = results.length - pass;
console.log(`GATE SUMMARY: ${pass} pass, ${fail} fail, ${results.length} checks`);
process.exit(fail ? 1 : 0);
