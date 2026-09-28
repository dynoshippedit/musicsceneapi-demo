// Review harness: writes only to the explicitly isolated review server on :4011.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
const require = createRequire(path.join(root, 'web/package.json'));
const { chromium } = require('playwright');
const API = 'http://127.0.0.1:4011';
const UI = 'http://127.0.0.1:4174';
const focused = process.argv.includes('--focused');
const results = { pages: [], checks: [], pageErrors: [], failedResponses: [], requests: [] };
let token;
async function api(route, method = 'GET', body, bearer = token) {
  const response = await fetch(`${API}${route}`, {
    method, headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { data = raw.slice(0, 250); }
  return { status: response.status, data };
}
async function check(name, work) {
  try { const evidence = await work(); results.checks.push({ name, evidence }); console.log(name, JSON.stringify(evidence)); }
  catch (err) { results.checks.push({ name, harnessError: err.message }); console.log(name, 'HARNESS ERROR', err.message); }
}
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', err => results.pageErrors.push({ page: page.url(), error: err.message }));
  page.on('response', response => { if (response.status() >= 400) results.failedResponses.push({ url: response.url(), status: response.status() }); });
  page.on('request', request => {
    if (request.url().startsWith(API) && request.method() === 'POST' && !request.url().includes('/auth/'))
      results.requests.push({ url: request.url(), body: request.postDataJSON() });
  });
  await page.goto(`${UI}/login`);
  await page.locator('#access-id').fill('admin@mau5trap.com');
  await page.locator('#passphrase').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/dashboard');
  await page.locator('.kpi').first().waitFor();
  token = await page.evaluate(() => localStorage.getItem('authToken'));
  const routes = focused
    ? ['overview', 'revenue', 'geography', 'touring', 'merch', 'brand', 'network', 'sustainability', 'entity'].map(tab => `/artists/art_deadmau5?tab=${tab}`)
    : ['/dashboard', '/artists', '/artists/art_deadmau5', '/artists/art_rezz', '/anr', '/anr/scouting', '/intelligence', '/marketing', '/fans', '/operations', '/settings/integrations', '/settings/ai', '/admin'];
  for (const route of routes) {
    await page.goto(UI + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1300);
    await page.screenshot({ path: path.join(dir, route.replaceAll('/', '_') + '.png'), fullPage: true });
    results.pages.push({ route, ...(await page.evaluate(() => ({
      text: document.body.innerText, scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth,
      brokenImages: [...document.images].filter(img => img.complete && img.naturalWidth === 0).map(img => img.src),
      buttons: [...document.querySelectorAll('button')].map(button => ({ text: button.innerText, disabled: button.disabled })),
    }))) });
    console.log('CRAWLED', route);
  }
  if (!focused) {
  await check('graph-data-and-interaction', async () => {
    await page.goto(UI + '/intelligence');
    await page.locator('canvas').waitFor();
    const roster = (await api('/v3/artists')).data.artists;
    return { artists: roster.length, withCollaborations: roster.filter(a => a.collaborations?.length).length,
      canvas: await page.locator('canvas').getAttribute('aria-label'),
      artistLinks: await page.locator('main a[href^="/artists/"]').count(), text: await page.locator('main').innerText() };
  });
  await check('ai-console-no-key', async () => {
    await page.locator('form input').fill('Summarize deadmau5 revenue');
    await page.locator('form button[type=submit]').click();
    await page.waitForTimeout(1000);
    return { text: await page.locator('[role=log]').innerText(), provider: await api('/v3/ai/providers') };
  });
  await check('room-submit-readback', async () => {
    await page.goto(UI + '/anr');
    const form = page.locator('form'); await form.waitFor();
    const inputs = form.locator('input');
    await inputs.nth(0).fill('Review Artist'); await inputs.nth(1).fill('Review Track');
    await inputs.nth(2).fill('electronic'); await inputs.nth(3).fill('https://example.test/review-track');
    await form.locator('button[type=submit]').click(); await page.waitForTimeout(700);
    const room = await api('/v3/anr/state'); const scouting = await api('/v3/anr/submissions');
    return { roomContainsSubmission: JSON.stringify(room.data).includes('Review Track'), scoutingContainsSubmission: JSON.stringify(scouting.data).includes('Review Track'), visible: await page.locator('main').innerText() };
  });
  await check('sale-persistence', async () => {
    await page.goto(UI + '/dashboard'); await page.locator('.kpi').first().waitFor();
    const form = page.locator('form').filter({ has: page.locator('input[type=month]') });
    await form.locator('select').selectOption('art_attlas');
    await form.locator('input[type=month]').fill('2026-09');
    await form.locator('input[type=number]').fill('125');
    const responsePromise = page.waitForResponse(r => r.url().endsWith('/v3/analytics/sales') && r.request().method() === 'POST');
    await form.locator('button[type=submit]').click(); const response = await responsePromise;
    return { status: response.status(), body: await response.json(), overview: (await api('/v3/label/overview')).data };
  });
  }
  await check('marketing-error-visibility', async () => {
    await page.goto(UI + '/marketing'); await page.locator('input').first().waitFor();
    await page.locator('input').first().fill('Review campaign');
    await page.getByRole('button', { name: /next/i }).click();
    await page.route('**/v3/marketing/campaigns', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Review injected campaign failure' }) }));
    await page.getByRole('button', { name: 'GENERATE PLAN', exact: true }).click(); await page.waitForTimeout(400);
    const text = await page.locator('main').innerText();
    await page.screenshot({ path: path.join(dir, 'marketing-failure.png'), fullPage: true });
    await page.unroute('**/v3/marketing/campaigns');
    return { showsFailure: text.includes('Review injected campaign failure'), alertCount: await page.locator('[role=alert]').count(), text };
  });
  if (!focused) {
  await check('campaign-created-without-store', async () => ({ created: await api('/v3/marketing/campaigns', 'POST', { artistId: 'art_attlas', type: 'social-growth', platforms: ['instagram'] }), list: await api('/v3/marketing/campaigns') }));
  await check('integration-connect', async () => ({ connected: await api('/v3/integrations/auth/spotify'), status: await api('/v3/integrations/status') }));
  await check('rights-unknown-artist', async () => await api('/v3/rights/contracts?artistId=review-does-not-exist'));
  await check('restricted-artist-access', async () => {
    const artistToken = (await api('/v3/auth/login', 'POST', { email: 'tours@rezz.com', password: 'rezz123' }, null)).data.token;
    const requests = [
      ['/v3/artists/art_deadmau5'], ['/v3/artists/art_deadmau5/monthly-sales'], ['/v3/users'],
      ['/v3/royalties/calculate', 'POST', { artistId: 'art_deadmau5' }],
      ['/v3/artists/art_deadmau5/development'], ['/v3/campaigns/stats'], ['/v3/tours'], ['/v3/fans/demographics'],
    ];
    const evidence = [];
    for (const [route, method = 'GET', body] of requests) evidence.push({ route, ...(await api(route, method, body, artistToken)) });
    return evidence;
  });
  await check('responsive-graph', async () => {
    const evidence = [];
    for (const width of [1024, 390]) {
      await page.setViewportSize({ width, height: 844 }); await page.goto(UI + '/intelligence'); await page.locator('canvas').waitFor();
      await page.screenshot({ path: path.join(dir, `graph-${width}.png`), fullPage: true });
      evidence.push(await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, graphWidth: document.querySelector('canvas').getBoundingClientRect().width })));
    }
    return evidence;
  });
  } else {
    await check('real-sales-forecast-three-months-and-access', async () => {
      const artistToken = (await api('/v3/auth/login', 'POST', { email: 'tours@rezz.com', password: 'rezz123' }, null)).data.token;
      for (const [month, revenue] of [['2025-01', 100], ['2025-02', 200], ['2025-03', 300]]) {
        const written = await api('/v3/analytics/sales', 'POST', { artistId: 'art_deadmau5', month, revenue });
        if (written.status !== 200) throw new Error(JSON.stringify(written));
      }
      const forecast = await api('/v3/analytics/projections?artistId=art_deadmau5&months=2', 'GET', undefined, artistToken);
      return { status: forecast.status, data: forecast.data, expectedNextValue: 400 };
    });
    await check('room-rating-reveal-and-toggle', async () => {
      await page.goto(UI + '/anr');
      const tally = page.getByRole('button', { name: 'TALLY', exact: true }).first(); await tally.waitFor();
      await tally.click(); await page.waitForTimeout(300);
      const before = await page.locator('main').innerText();
      await page.getByRole('button', { name: 'RATE', exact: true }).first().click(); await page.waitForTimeout(300);
      return { before, after: await page.locator('main').innerText() };
    });
    await check('artist-pager-preserves-tab', async () => {
      await page.goto(UI + '/artists/art_deadmau5?tab=revenue');
      await page.getByRole('button', { name: '→', exact: true }).waitFor();
      await page.getByRole('button', { name: '→', exact: true }).click();
      await page.waitForTimeout(1000);
      return { url: page.url(), text: await page.locator('main').innerText() };
    });
    await check('restricted-pages', async () => {
      const auth = (await api('/v3/auth/login', 'POST', { email: 'tours@rezz.com', password: 'rezz123' }, null)).data;
      await page.evaluate(auth => { localStorage.setItem('authToken', auth.token); localStorage.setItem('userData', JSON.stringify(auth.user)); }, auth);
      const evidence = [];
      for (const route of ['/dashboard', '/artists/art_rezz', '/artists/art_deadmau5', '/admin']) {
        await page.goto(UI + route, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200);
        evidence.push({ route, text: await page.locator('main').innerText() });
      }
      return evidence;
    });
  }
  await context.close();
} finally {
  fs.writeFileSync(path.join(dir, focused ? 'focused-evidence.json' : 'browser-api-evidence.json'), JSON.stringify(results, null, 2) + '\n');
  await browser.close();
}
