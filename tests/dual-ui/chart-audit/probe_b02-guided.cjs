#!/usr/bin/env node
// Chart audit b02 rework 1, item (b): where the module's guided_qc_sample select ("Choose a sample (keyboard
// accessible)", renderUI guided_qc_select_ui, R/modules/2_qc_boxplot_module.R:1351) appears in Nexo for an
// Outlier screening card, and what choosing a sample does. Read-only: no checkpoint is saved.
//   NEXO_AUDIT_BASE=http://127.0.0.1:5182 node tests/dual-ui/chart-audit/probe_b02-guided.cjs
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..', '..');
const pw = require(require.resolve('playwright', { paths: [path.join(root, 'tests/browser/ci')] }));
const base = process.env.NEXO_AUDIT_BASE || 'http://127.0.0.1:5182';
const shots = path.join(root, 'docs/integration/chart-audit/b02-qc-a');
const T = 180000;

let PAGE = null;
(async () => {
  const browser = await pw.chromium.launch();
  const out = {};
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); PAGE = page;
    let cardPath = null;
    page.on('request', r => { const m = r.url().match(/\/api\/v1(\/sessions\/[^/]+\/cards\/[^/]+)\/render/); if (m) cardPath = m[1]; });
    await page.goto(`${base}/nexo/?checkpoint=nexo-complete-synthetic`);
    await page.getByRole('button', { name: 'Export figure ▾', exact: true }).waitFor({ timeout: T });
    out.step = 'open library'; await page.getByRole('button', { name: '+ Add plot', exact: true }).click(); // wave 2: the toolbar opens the Library (Toolbar.tsx:47)
    await page.locator('button.library-add').first().waitFor({ state: 'attached', timeout: T });
    await page.evaluate(() => document.querySelectorAll('.library-panel details').forEach(d => { d.open = true; }));
    out.step = 'add card'; await page.getByPlaceholder('Search plots').fill('Outlier screening'); await page.waitForTimeout(600); await page.locator('button.library-add[aria-label="Add Outlier screening"]').first().click();
    await page.waitForFunction(() => document.querySelector('#world .card .card-status')?.dataset.state === 'current', null, { timeout: T });
    if (await page.getByRole('complementary', { name: 'Library' }).isVisible().catch(() => false)) await page.getByRole('button', { name: 'Close library', exact: true }).click();
    const id = await page.locator('#world .card').first().getAttribute('data-id');
    out.step = 'fit'; await page.locator('.zoom-pill').getByRole('button', { name: 'Fit', exact: true }).click(); await page.waitForTimeout(900);
    out.step = 'select card'; await page.locator(`#world .card[data-id="${id}"] header`).click(); await page.waitForTimeout(900); out.step = 'probe';
    // 1 the card's live schema from the API: does it carry guided_qc_sample?
    const schema = await page.evaluate(async p => { const r = await fetch(`/api/v1${p}/schema`); return r.ok ? r.json() : { status: r.status }; }, cardPath);
    const all = JSON.stringify(schema);
    out.schemaHasGuided = all.includes('guided_qc_sample');
    out.schemaGuided = (schema.controls || schema.inputs || []).filter?.(c => /guided/.test(c.id)).map(c => ({ id: c.id, type: c.type, label: c.label, options: (c.options || []).length, group: c.group }));
    // 2 every Inspector tab: is a "Choose a sample" control shown?
    out.tabs = {};
    for (const t of ['Data', 'Appearance', 'Statistics', 'Export']) {
      const tab = page.locator('#inspector').getByRole('tab', { name: t, exact: true });
      if (!(await tab.count())) continue;
      await tab.click(); await page.waitForTimeout(600);
      out.tabs[t] = await page.locator('#inspector').evaluate(el => /Choose a sample/i.test(el.innerText) || !!el.querySelector('[id="guided_qc_sample"],[name="guided_qc_sample"]'));
    }
    const where = Object.entries(out.tabs).find(([, v]) => v)?.[0];
    if (where) {
      await page.locator('#inspector').getByRole('tab', { name: where, exact: true }).click();
      const sel = page.locator('#inspector [id="guided_qc_sample"], #inspector [name="guided_qc_sample"]').first();
      const opts = await sel.locator('option').evaluateAll(os => os.map(o => o.value)).catch(() => []);
      out.options = opts.length;
      const pick = opts.find(v => v);
      if (pick) {
        const before = await page.locator(`#world .card[data-id="${id}"]`).innerText();
        const src = () => page.locator(`#world .card[data-id="${id}"] .body img`).first().getAttribute('src').catch(() => null);
        const src0 = await src(); const hash = () => page.locator(`#world .card[data-id="${id}"] .body img`).first().evaluate(async i => { const b = await (await fetch(i.src)).arrayBuffer(); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join(''); }).catch(() => null); const h0 = await hash(); let posts = 0; const count = r => { if (r.method() !== 'GET' && /\/api\/v1\/sessions\//.test(r.url())) { posts++; (out.requestsAfterPick ||= []).push(r.method() + ' ' + r.url().replace(/^.*\/api\/v1/, '') + ' ' + (r.postData() || '').slice(0, 160)); } };
        page.on('request', count);
        await sel.selectOption(pick); await page.waitForTimeout(6000);
        page.off('request', count);
        out.requestsAfterPickCount = posts; out.imageChanged = src0 !== await src(); out.imageBytesChanged = h0 !== await hash(); out.hashBefore = h0 && h0.slice(0, 12);
        out.picked = pick;
        out.inspectorAfter = (await page.locator('#inspector').innerText()).replace(/\s+/g, ' ').match(/.{0,80}(Exclude|Remove sample|Review exclusion|Reason).{0,80}/)?.[0] || null;
        out.cardChanged = before !== await page.locator(`#world .card[data-id="${id}"]`).innerText();
      }
    }
    await page.screenshot({ path: path.join(shots, 'outlierPlot-r2-guided-probe.png') });
    out.shot = 'docs/integration/chart-audit/b02-qc-a/outlierPlot-r2-guided-probe.png';
    await page.context().close();
  } catch (e) { out.error = String(e.message || e).split('\n')[0]; if (PAGE) await PAGE.screenshot({ path: path.join(shots, 'outlierPlot-r2-guided-probe-fail.png') }).catch(() => {}); }
  finally { await browser.close(); }
  fs.writeFileSync(path.join(shots, 'results-round2-guided-probe.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out));
})();
