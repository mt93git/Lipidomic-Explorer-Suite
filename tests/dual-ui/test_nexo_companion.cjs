// NEXO-COMPANION-A: Team's neutrophil companion on the mock (Vite dev server, VITE_API_MOCK=1), Chromium and WebKit:
// the first visit's entrance on Start, docked in the top bar left of the account menu once on the Canvas, a click brings it
// out with the Canvas tip and it flies back, and the chat answers. Chromium's screenshots go to docs/integration/nexo-companion/.
// node tests/dual-ui/test_nexo_companion.cjs
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const docs = path.join(root, 'docs/integration/nexo-companion');
let server;
function port() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  const shot = (page, scene) => page.screenshot({ path: name === 'chromium' ? path.join(docs, `${scene}.jpg`) : path.join(os.tmpdir(), `nexo-companion-${name}-${scene}.jpg`), type: 'jpeg', quality: 80 });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/`);
    await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
    // First visit: large on Start, waving, with the welcome bubble.
    await page.locator('.companion-fly[data-phase="entrance"]').waitFor();
    await page.getByRole('status').filter({ hasText: "Hi, I'm your lab guide" }).waitFor();
    assert.equal(Math.round((await page.locator('.companion-fly').boundingBox()).width), 150);
    await shot(page, 'entrance');
    console.log(`PASS COMPANION ${name} first-visit-entrance`);
    // Start → Prepare → Check → Canvas: it ends in the top bar, immediately left of the account menu.
    await button(page, 'Prepare ORD041 · v1').click();
    await button(page, 'Prepare and check').click();
    await page.getByRole('button', { name: /^Open the Canvas/ }).click();
    await page.waitForSelector('#viewport', { timeout: 30_000 });
    const dock = page.locator('header.topbar .companion-dock');
    await page.locator('.companion-fly').waitFor({ state: 'detached', timeout: 10_000 });
    await page.getByRole('status').filter({ hasText: 'Arrange your plots' }).waitFor(); // the Canvas tip, once, by itself
    const d = await dock.boundingBox(), account = await page.locator('header.topbar .account-menu').boundingBox();
    assert.equal(Math.round(d.width), 38);
    assert.ok(d.x + d.width <= account.x && account.x - (d.x + d.width) < 16, `dock ${JSON.stringify(d)} left of account ${JSON.stringify(account)}`);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('nexo.companion.seen.') && localStorage.getItem(k) === '1')), true, 'per-user entrance flag written');
    // The dock overlaps nothing else in the top bar, at the desktop and the small-laptop width.
    const overlaps = () => page.evaluate(() => { const d = document.querySelector('header.topbar .companion-slot').getBoundingClientRect();
      return [...document.querySelector('header.topbar').children].filter(el => !el.classList.contains('companion-slot') && el.getBoundingClientRect().width > 0)
        .filter(el => { const r = el.getBoundingClientRect(); return r.left < d.right - 1 && r.right > d.left + 1 && r.top < d.bottom - 1 && r.bottom > d.top + 1; }).map(el => el.className || el.tagName); });
    assert.deepEqual(await overlaps(), []);
    await page.setViewportSize({ width: 1024, height: 768 }); assert.deepEqual(await overlaps(), []); await page.setViewportSize({ width: 1440, height: 900 });
    await shot(page, 'docked');
    console.log(`PASS COMPANION ${name} docked-left-of-account-menu`);
    // Re-invoke: large on the canvas area with the Canvas tip, then back to the dock by itself.
    await page.getByRole('button', { name: 'Neutrophil guide: show a tip for this screen', exact: true }).click();
    await page.locator('.companion-fly[data-phase="out"]').waitFor();
    const tip = page.getByRole('dialog', { name: 'Arrange your plots', exact: true });
    await tip.waitFor();
    assert.equal(Math.round((await page.locator('.companion-fly').boundingBox()).width), 150);
    await shot(page, 'reinvoked');
    await tip.waitFor({ state: 'detached', timeout: 8_000 });
    await page.locator('.companion-fly').waitFor({ state: 'detached', timeout: 3_000 });
    assert.equal(await dock.isVisible(), true);
    console.log(`PASS COMPANION ${name} reinvoke-returns-to-dock`);
    // Chat from the tip: the mock answers "What does PCA show?" in the analyst's format (bold section titles) with its label.
    await dock.click();
    await button(page.getByRole('dialog', { name: 'Arrange your plots', exact: true }), 'Chat with the neutrophil guide').click();
    const panel = page.getByRole('region', { name: 'Chat with the neutrophil guide', exact: true });
    await panel.getByRole('heading', { name: 'How can I help?', exact: true }).waitFor();
    // Keys typed while it flies back stay in the question: landing does not move the focus to the dock.
    await page.locator('.companion-fly').waitFor({ state: 'detached', timeout: 3_000 });
    await page.waitForTimeout(100);
    const question = panel.getByRole('textbox', { name: 'Question for the guide' });
    assert.equal(await question.evaluate(el => el === document.activeElement), true, 'the question keeps the focus after the flight');
    await page.keyboard.type('What does PCA show?');
    assert.equal(await question.inputValue(), 'What does PCA show?');
    await button(panel, 'Send').click();
    await panel.locator('.companion-a strong', { hasText: 'Definition' }).waitFor();
    assert.equal(await panel.locator('.companion-label').last().textContent(), 'Knowledge base · 3 passages');
    await shot(page, 'chat');
    console.log(`PASS COMPANION ${name} chat-answers`);
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP COMPANION Playwright: ${e.message}`); return; } throw e; }
  const pw = require(require.resolve('@playwright/test', { paths: [ci] }));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(p), '--strictPort'],
    { cwd: nexo, stdio: 'ignore', env: { ...process.env, VITE_API_MOCK: '1', VITE_COLLAB_URL: '' } });
  const base = `http://127.0.0.1:${p}`;
  const deadline = Date.now() + 30000;
  while (true) {
    try { const r = await fetch(`${base}/nexo/`); if (r.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('dev server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
  fs.mkdirSync(docs, { recursive: true });
  for (const name of (process.env.NEXO_BROWSERS || 'chromium,webkit').split(',')) await browserTests(pw, name, base);
  console.log('COMPANION OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
