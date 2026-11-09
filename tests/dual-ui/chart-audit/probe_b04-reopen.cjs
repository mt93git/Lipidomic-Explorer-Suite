'use strict';
// b04 probe for check 10 (barPlotUnfiltered): where does barValueMode get lost between save and reopen?
// Logs the saved canvas node's instance inputs (POST …/checkpoints body), the reopened session's canvas node, and every
// card schema / PATCH the reopened page exchanges. Synthetic checkpoint only; deletes audit-b04-composition-synthetic.
const path = require('node:path');
const root = path.resolve(__dirname, '../..', '..');
const pw = require(require.resolve('playwright', { paths: [path.join(root, 'tests/browser/ci')] }));
const base = process.env.NEXO_AUDIT_BASE || 'http://127.0.0.1:5184', T = 180000, SAVE = 'audit-b04-composition-synthetic';
const pick = v => v && typeof v === 'object' ? { barValueMode: v.barValueMode, barOrientation: v.barOrientation, keys: Object.keys(v).length } : v;
function watch(page, tag) {
  page.on('request', r => {
    const u = r.url().replace(/^https?:\/\/[^/]+/, '').replace(/sessions\/[^/]+/, 'sessions/…');
    if (r.method() === 'POST' && /\/checkpoints$/.test(u)) { const b = JSON.parse(r.postData() || '{}'); const nodes = b.canvas?.state?.nodes || b.canvas?.state?.canvas?.nodes || [];
      console.log(tag, 'SAVE nodes', JSON.stringify((Array.isArray(nodes) ? nodes : Object.values(nodes)).map(n => ({ id: n.id, instance: n.instance && { id: n.instance.id, instanceId: n.instance.instanceId, inputs: pick(n.instance.inputs) } }))));
      console.log(tag, 'SAVE nexo inputs', JSON.stringify(Object.fromEntries(Object.entries(b.nexo?.nodes || {}).map(([k, v]) => [k, pick(v.inputs)])))); }
    if (/\/cards\//.test(u) && r.method() === 'PATCH') console.log(tag, 'PATCH', u, (r.postData() || '').slice(0, 200));
  });
  page.on('response', async r => {
    const u = r.url().replace(/^https?:\/\/[^/]+/, '').replace(/sessions\/[^/]+/, 'sessions/…');
    try {
      if (/\/cards\/[^/]+\/schema$/.test(u)) { const j = await r.json(); const c = (j.controls || j.inputs || []).find?.(x => x.id === 'barValueMode'); console.log(tag, 'SCHEMA', u, r.status(), JSON.stringify(c ? { value: c.value, default: c.default } : Object.keys(j)).slice(0, 200), 'values:', JSON.stringify(pick(j.values || j.inputs))); }
      if (r.request().method() === 'POST' && /\/sessions$/.test(u)) { const j = await r.json(); const st = j.canvas?.state || j.canvas; const nodes = st?.nodes || [];
        console.log(tag, 'OPEN canvas nodes', JSON.stringify((Array.isArray(nodes) ? nodes : Object.values(nodes)).map(n => ({ id: n.id, instance: n.instance && { id: n.instance.id, inputs: pick(n.instance.inputs) } }))).slice(0, 600), 'session inputs', JSON.stringify(pick(j.inputs))); }
      if (/\/cards\//.test(u) && r.request().method() === 'PATCH') console.log(tag, 'PATCH reply', r.status(), JSON.stringify(pick((await r.json()).inputs)));
    } catch (e) { console.log(tag, 'parse', u, String(e.message).slice(0, 80)); }
  });
}
(async () => {
  const browser = await pw.chromium.launch(); let saved = null, page;
  try {
    page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(page, 'A');
    await page.goto(`${base}/nexo/?checkpoint=nexo-complete-synthetic`);
    await page.getByRole('button', { name: 'Export figure ▾', exact: true }).waitFor({ timeout: T });
    await page.waitForTimeout(2500);
    if (!(await page.locator('#library-panel-plots').waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false))) await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click();
    await page.locator('#library-panel-plots button.library-add').first().waitFor({ state: 'visible', timeout: T });
    await page.evaluate(() => document.querySelectorAll('#library-panel-plots details').forEach(d => { d.open = true; }));
    await page.locator('#library-panel-plots button.library-add[aria-label="Add Composition · unfiltered"]').click();
    await page.waitForFunction(() => document.querySelector('#world .card .card-status')?.dataset.state === 'current', null, { timeout: T });
    await page.getByRole('button', { name: /^(Close library|Hide library)$/ }).first().click();
    await page.locator('#world .card header').first().click();
    await page.locator('#inspector').getByRole('radio', { name: 'Absolute (%)', exact: true }).check();
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => document.querySelector('#world .card .card-status')?.dataset.state === 'current', null, { timeout: T });
    await page.getByRole('button', { name: 'Export figure ▾', exact: true }).click();
    await page.getByRole('button', { name: 'Save checkpoint…', exact: true }).click();
    const cps = page.getByRole('dialog', { name: 'Checkpoints', exact: true });
    await cps.getByRole('textbox', { name: 'New checkpoint name' }).fill(SAVE);
    await cps.getByRole('button', { name: 'Save current analysis', exact: true }).click();
    await page.locator('.toast', { hasText: `Saved checkpoint ${SAVE}` }).waitFor({ timeout: T });
    saved = new URL(page.url()).searchParams.get('checkpoint');
    await page.context().close();
    page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); watch(page, 'B');
    await page.goto(`${base}/nexo/?checkpoint=${saved}`);
    await page.getByRole('button', { name: 'Export figure ▾', exact: true }).waitFor({ timeout: T });
    await page.waitForFunction(() => document.querySelector('#world .card .card-status')?.dataset.state === 'current', null, { timeout: T });
    await page.waitForTimeout(4000);
    await page.locator('#world .card header').first().click(); await page.waitForTimeout(2500);
    console.log('B inspector Absolute (%) checked:', await page.locator('#inspector').getByRole('radio', { name: 'Absolute (%)', exact: true }).isChecked());
  } finally {
    if (saved && page) console.log('cleanup', saved.slice(0, 12), await page.evaluate(async u => (await fetch(u, { method: 'DELETE' })).status, `/api/v1/checkpoints/${saved}`).catch(e => String(e)));
    await browser.close();
  }
})().catch(e => { console.error(String(e.message).split('\n').slice(0, 3).join(' ')); process.exitCode = 1; });
