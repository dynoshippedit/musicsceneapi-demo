// Phase 4C visual capture: 1440x900 screenshots of the migrated surfaces, both profiles.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const OUT = path.dirname(fileURLToPath(import.meta.url));
const ADMIN = { email: 'admin@mau5trap.com', password: 'admin123' };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#access-id', ADMIN.email);
  await page.fill('#passphrase', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  await page.waitForSelector('.kpi');
}

await login();
for (const [route, name] of [
  ['/dashboard', 'dashboard'], ['/artists', 'artists'], ['/anr', 'anr'], ['/anr/scouting', 'anr-scouting'],
  ['/intelligence', 'intelligence'], ['/marketing', 'marketing'], ['/fans', 'fans'],
  ['/operations', 'operations'], ['/settings/integrations', 'settings'], ['/admin', 'admin'],
]) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('main h1');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `phase4c-${name}.png`) });
}
await page.goto(`${BASE}/artists/art_rezz`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, 'phase4c-artist-detail.png') });

// Example Records: same surfaces, test profile, zero generic-source edits.
await page.evaluate(() => localStorage.setItem('platform.brandProfile', 'example-records'));
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
await page.waitForSelector('.kpi');
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(OUT, 'phase4c-example-dashboard.png') });
await page.goto(`${BASE}/artists`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(OUT, 'phase4c-example-artists.png') });
await page.evaluate(() => localStorage.removeItem('platform.brandProfile'));

console.log('screenshots written to', OUT);
await browser.close();
