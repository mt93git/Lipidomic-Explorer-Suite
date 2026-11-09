// Evidence capture for the Nexo canvas UI batch (card states, save pill, phone, tooltips, motion): mock build, Chromium.
// NEXO_SHOTS=<dir> NEXO_SHOT_TAG=before|after node tests/dual-ui/capture_nexo_fable_ui.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const checkpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id;
const out = process.env.NEXO_SHOTS || path.join(root, 'docs/integration/nexo-phase1-evidence/h9/fable-ui');
const tag = process.env.NEXO_SHOT_TAG || 'after';
let server;
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: nexo, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
}
function port() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
(async () => {
  const p = await port();
  fs.mkdirSync(out, { recursive: true });
  run('sh', ['scripts/vendor-plotly.sh']);
  run('npm', ['run', 'build'], { VITE_API_MOCK: '1' });
  const pw = require(require.resolve('@playwright/test', { paths: [ci] }));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(p), '--strictPort'], { cwd: nexo, stdio: 'ignore' });
  const base = `http://127.0.0.1:${p}`;
  const deadline = Date.now() + 30000;
  while (true) { try { const r = await fetch(`${base}/nexo/`); if (r.ok) break; } catch {} if (Date.now() > deadline) throw new Error('preview server did not start'); await new Promise(r => setTimeout(r, 100)); }
  const browser = await pw.chromium.launch();
  try {
    for (const [width, height, phone] of [[1440, 900, false], [1024, 768, false], [390, 844, true]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone });
      await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
      const page = await context.newPage();
      await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
      await page.waitForSelector('.card');
      await page.waitForFunction(() => [...document.querySelectorAll('.card')].every(c => c.querySelector('.body img,.body .js-plotly-plot')), null, { timeout: 30000 });
      const ids = await page.evaluate(() => window.__nexo.store.get().nodes.map(n => n.id));
      if (!phone) {
        // Desktop: one card per state (error, needs settings, pending, finished-stale) with the first card inspected and hovered.
        const states = ['error', 'waiting', 'pending', 'finished-stale'];
        await page.evaluate(({ ids, states }) => states.forEach((state, i) => ids[i + 1] && window.__nexo.handle.setCardStatus(ids[i + 1], state)), { ids, states });
        await page.locator(`.card[data-id="${ids[0]}"] header`).click();
        await page.waitForSelector('#inspector[data-open="true"]');
        await page.locator(`.card[data-id="${ids[0]}"] .card-actions button`).first().focus();
        await page.evaluate(() => { const b = document.querySelector('.save-pill'); if (b) b.dataset.shot = '1'; });
        await page.waitForTimeout(400);
      } else {
        await page.locator(`.card[data-id="${ids[0]}"] .body`).tap();
        await page.waitForSelector('#inspector[data-open="true"]');
        await page.waitForTimeout(400);
      }
      await page.screenshot({ path: path.join(out, `${tag}-${width}.png`) });
      const size = fs.statSync(path.join(out, `${tag}-${width}.png`)).size;
      console.log(`${tag}-${width}.png ${Math.round(size / 1024)} KB`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
