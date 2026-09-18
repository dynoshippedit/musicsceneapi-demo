// Phase 4C working smoke check: drives the real UI against the real backend and prints one
// line per surface. This is a development aid — validation/gate.mjs remains the acceptance gate.
//   node validation/smoke.mjs [/route ...]
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const ADMIN = { email: 'admin@mau5trap.com', password: 'admin123' };
const ARTIST = { email: 'tours@rezz.com', password: 'rezz123' };
const T = 20000;

const routes = process.argv.slice(2).filter((a) => a.startsWith('/'));
const asArtist = process.argv.includes('--artist');
const who = asArtist ? ARTIST : ADMIN;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('#access-id', who.email);
await page.fill('#passphrase', who.password);
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: T });
console.log(`LOGIN ok as ${who.email}`);

for (const route of routes) {
  const before = pageErrors.length + consoleErrors.length;
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const h1 = await page.locator('main h1').first().textContent().catch(() => '?');
  const body = await page.locator('main').innerText().catch(() => '');
  const bad = /\bNaN\b|undefined|\[object Object\]|Infinity/.test(body);
  const denied = /ACCESS DENIED/.test(body);
  const errs = pageErrors.length + consoleErrors.length - before;
  const rows = await page.locator('main tbody tr').count().catch(() => 0);
  console.log(
    `${errs === 0 && !bad ? 'OK  ' : 'BAD '} | ${route.padEnd(26)} | h1="${(h1 || '').trim()}" rows=${rows}` +
    `${denied ? ' ACCESS-DENIED' : ''}${bad ? ' BAD-TOKEN-IN-BODY' : ''}${errs ? ` errors=${errs}` : ''}` +
    ` | ${body.replace(/\s+/g, ' ').slice(0, 110)}`,
  );
}

if (pageErrors.length) console.log('PAGE ERRORS:', [...new Set(pageErrors)].slice(0, 6));
if (consoleErrors.length) console.log('CONSOLE ERRORS:', [...new Set(consoleErrors)].slice(0, 6));
await browser.close();
process.exit(pageErrors.length + consoleErrors.length ? 1 : 0);
