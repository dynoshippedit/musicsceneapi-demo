import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const dir = process.env.WORKFLOW_OUTPUT || sourceDir;
fs.mkdirSync(dir, { recursive: true });
const require = createRequire(path.resolve(sourceDir, '../../web/package.json'));
const { chromium } = require('playwright');
const UI = process.env.WORKFLOW_UI || 'http://127.0.0.1:4174';
const API = process.env.WORKFLOW_API || 'http://127.0.0.1:4011';
if (new URL(API).port === '3000') throw new Error('Workflow writes must never target the operator API');
const result = { tileMode: process.env.WORKFLOW_OFFLINE ? 'fixture' : 'live', checks: [], pageErrors: [], pages: [], tiles: [] };
const browser = await chromium.launch({ headless: true });
if (process.argv.includes('--operator-smoke')) {
  const smoke = { routes: [], pageErrors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => smoke.pageErrors.push(error.message));
    // This branch reads the actual operator app; it never submits product forms.
    smoke.apiHealth = (await fetch('http://127.0.0.1:3000/health')).status;
    assert.equal(smoke.apiHealth, 200);
    await page.goto('http://127.0.0.1:5173/login');
    await page.locator('#access-id').fill('admin@mau5trap.com');
    await page.locator('#passphrase').fill('admin123');
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/dashboard');
    await page.locator('.kpi').first().waitFor();
    for (const route of ['/dashboard', '/anr', '/intelligence', '/marketing', '/settings/ai']) {
      await page.goto('http://127.0.0.1:5173' + route);
      await page.locator('main').waitFor();
      if (route === '/intelligence') {
        await page.locator('svg a').first().waitFor();
        smoke.graphArtists = await page.locator('svg a').count();
      }
      smoke.routes.push(route);
    }
    assert.deepEqual(smoke.pageErrors, []);
    console.log('Operator application read-only smoke passed', JSON.stringify(smoke));
  } catch (error) { smoke.failure = error.stack; process.exitCode = 1; console.error(error); }
  finally { fs.writeFileSync(path.join(dir, 'operator-smoke.json'), JSON.stringify(smoke, null, 2) + '\n'); await browser.close(); }
  process.exit(process.exitCode || 0);
}
let token;
async function api(route, method = 'GET', body) {
  const response = await fetch(API + route, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function check(name, fn) {
  await fn(); result.checks.push({ name, pass: true }); console.log('PASS', name);
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => result.pageErrors.push(error.message));
  if (process.env.WORKFLOW_OFFLINE) await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT3sAAAAASUVORK5CYII=', 'base64') }));
  // A short local audio fixture checks actual playback without contacting a media provider.
  const wave = Buffer.alloc(44 + 16000);
  wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
  wave.write('data', 36); wave.writeUInt32LE(16000, 40);
  await page.route('https://example.com/browser-demo.mp3', route => route.fulfill({ contentType: 'audio/wav', body: wave }));

  page.on('response', res => { if (res.url().includes('tile.openstreetmap.org')) result.tiles.push({ url: res.url(), status: res.status() }); });
  await page.goto(UI + '/login');
  await page.locator('#access-id').fill('admin@mau5trap.com');
  await page.locator('#passphrase').fill('admin123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/dashboard');
  token = await page.evaluate(() => localStorage.getItem('authToken'));
  await check('map uses attributed basemap and regional markers', async () => {
    await page.locator('.leaflet-container').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.leaflet-tile')].some(tile => tile.complete && tile.naturalWidth > 0));
    assert.ok(await page.getByRole('link', { name: 'OpenStreetMap' }).count() > 0);
    const regions = (await api('/v3/analytics/geography')).body.regions;
    const count = await page.locator('.leaflet-interactive').count();
    assert.ok(count > 0 && count <= regions.length, `markers ${count}, regions ${regions.length}`);
    await page.screenshot({ path: path.join(dir, 'dashboard-map.png'), fullPage: true });
  });
  // Remaining checks do not need network map tiles. Avoid repeated public tile requests.
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT3sAAAAASUVORK5CYII=', 'base64') }));
  await check('AI sends chosen artist context and visibly reports unavailable provider', async () => {
    await page.getByLabel('Artist context').selectOption('art_rezz');
    await page.locator('input[placeholder]').fill('Summarize the selected artist');
    const request = page.waitForRequest(r => r.url().endsWith('/v3/ai/query') && r.method() === 'POST');
    await page.getByRole('button', { name: /^RUN$/ }).click();
    assert.equal((await request).postDataJSON().artistId, 'art_rezz');
    await page.getByRole('log').getByText(/unavailable/).waitFor();
    assert.match(await page.locator('main').innerText(), /UNCONFIGURED/i);
  });
  await check('room demo, player, vote, whiteboard and listening persist after reload', async () => {
    await page.goto(UI + '/anr');
    const form = page.locator('form').filter({ has: page.locator('input[required]') }).filter({ has: page.locator('input:not([type=url])') });
    await form.locator('input').nth(0).fill('Browser Repair Artist');
    await form.locator('input').nth(1).fill('Browser Durable Track');
    await form.locator('input').nth(2).fill('Electronic');
    await form.locator('input').nth(3).fill('https://example.com/browser-demo.mp3');
    await form.locator('button[type=submit]').click();
    const row = page.locator('li').filter({ hasText: 'Browser Durable Track' }).first();
    await row.waitFor(); assert.equal(await row.locator('audio[controls]').count(), 1);
    await row.locator('audio').evaluate(async audio => { await audio.play(); if (audio.paused) throw new Error('Audio did not start'); audio.pause(); });
    await row.getByRole('button', { name: 'RATE', exact: true }).click();
    await page.getByLabel('Whiteboard', { exact: true }).fill('Browser saved whiteboard');
    await page.getByRole('button', { name: 'Save Whiteboard', exact: true }).click();
    await page.getByLabel('Listening URL', { exact: true }).fill('https://example.com/listen.mp3');
    const savedListening = page.waitForResponse(r => r.url().endsWith('/v3/anr/listening') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save Listening URL', exact: true }).click();
    assert.equal((await savedListening).status(), 200);
    await page.reload(); await page.getByText('Browser Durable Track', { exact: true }).first().waitFor();
    assert.equal(await page.getByLabel('Whiteboard', { exact: true }).inputValue(), 'Browser saved whiteboard');
    assert.equal(await page.getByLabel('Listening URL', { exact: true }).inputValue(), 'https://example.com/listen.mp3');
    const state = (await api('/v3/anr/state')).body;
    assert.ok(state.demos.some(d => d.title === 'Browser Durable Track' && d.hasVoted));
    await page.screenshot({ path: path.join(dir, 'anr-room.png'), fullPage: true });
  });
  await check('campaign errors are visible at step 2 and successful plans can be reopened after reload', async () => {
    await page.goto(UI + '/marketing'); await page.locator('main input').first().fill('Browser Durable Plan');
    await page.getByRole('button', { name: /next/i }).click();
    await page.route('**/v3/marketing/campaigns', route => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Injected visible campaign failure' }) }) : route.continue());
    await page.getByRole('button', { name: 'GENERATE PLAN', exact: true }).click();
    await page.getByText('Injected visible campaign failure', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(dir, 'campaign-error.png'), fullPage: true });
    await page.unroute('**/v3/marketing/campaigns');
    await page.getByRole('button', { name: 'GENERATE PLAN', exact: true }).click();
    await page.getByText('SAVED DRAFT', { exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Browser Durable Plan', exact: true }).first().click();
    await page.getByText('SAVED DRAFT', { exact: true }).waitFor();
    await page.getByText('Submit to editorial playlists', { exact: true }).waitFor();
  });
  await check('graph labels select artists and links open the profile', async () => {
    await page.goto(UI + '/intelligence');
    await page.locator('svg[aria-label="Artist collaboration network"]').waitFor();
    assert.equal(await page.locator('svg a').count(), 29);
    await page.locator('svg a').filter({ hasText: /deadmau5/ }).click();
    const profile = page.locator('main a').filter({ hasText: /open artist profile/i });
    await profile.waitFor();
    await page.screenshot({ path: path.join(dir, 'intelligence-graph.png'), fullPage: true });
    await profile.click(); await page.waitForURL('**/artists/art_deadmau5?tab=network');
  });
  await check('sales form accepts multiple months and another artist in the same month', async () => {
    await page.goto(UI + '/dashboard');
    const form = page.locator('form').filter({ has: page.locator('input[type=month]') });
    for (const [id, month, amount] of [['art_attlas','2026-06','100'], ['art_attlas','2026-07','200'], ['art_attlas','2026-08','300'], ['art_rezz','2026-08','0']]) {
      await form.locator('select').selectOption(id); await form.locator('input[type=month]').fill(month); await form.locator('input[type=number]').fill(amount);
      const response = page.waitForResponse(r => r.url().endsWith('/v3/analytics/sales') && r.request().method() === 'POST');
      await form.locator('button[type=submit]').click(); assert.equal((await response).status(), 200);
      await page.waitForFunction(() => document.querySelector('input[type=number]')?.value === '');
    }
    const data = (await api('/v3/analytics/projections?artistId=art_attlas&months=1')).body;
    assert.ok(data.chartData.datasets[0].data.filter(v => v !== null).length >= 3);
  });
  for (const route of ['/dashboard','/artists','/artists/art_deadmau5?tab=entity','/anr','/anr/scouting','/intelligence','/marketing','/fans','/operations','/settings/integrations','/settings/ai','/admin']) {
    await page.goto(UI + route); await page.waitForTimeout(500);
    const metrics = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(metrics.scroll <= metrics.width + 2, `${route} overflow ${JSON.stringify(metrics)}`);
    result.pages.push({ route, ...metrics });
  }
  await check('mobile graph remains within the viewport with internal scrolling', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(UI + '/intelligence');
    await page.locator('svg[aria-label="Artist collaboration network"]').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await page.screenshot({ path: path.join(dir, 'intelligence-mobile.png'), fullPage: true });
  });
  await check('stored admin claims cannot mount restricted UI before session verification', async () => {
    const artistLogin = await api('/v3/auth/login', 'POST', { email: 'tours@rezz.com', password: 'rezz123' });
    let adminRequests = 0;
    page.on('request', req => { if (req.url().endsWith('/v3/users')) adminRequests++; });
    await page.evaluate(token => {
      localStorage.setItem('authToken', token);
      localStorage.setItem('userData', JSON.stringify({ role: 'admin', pageAccess: ['all'] }));
    }, artistLogin.body.token);
    await page.route('**/v3/auth/me', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Injected auth outage' }) }));
    await page.goto(UI + '/admin');
    await page.getByText('Unable to verify your session. Please retry.', { exact: true }).waitFor();
    assert.equal(adminRequests, 0);
    await page.unroute('**/v3/auth/me');
    await page.getByRole('button', { name: /retry/i }).click();
    await page.getByText('ACCESS DENIED', { exact: true }).waitFor();
    assert.equal(adminRequests, 0);
  });
  assert.deepEqual(result.pageErrors, []);
} catch (error) { result.failure = error.stack; process.exitCode = 1; console.error(error); }
finally { fs.writeFileSync(path.join(dir, 'workflow-results.json'), JSON.stringify(result, null, 2) + '\n'); await browser.close(); }
