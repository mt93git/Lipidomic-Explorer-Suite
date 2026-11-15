#!/usr/bin/env node
// Chart audit b02 rework 1 part 2: load2dPlot's Inspector reads pcaMode = class while the card draws individual
// lipids. Records, for a fresh PCA loadings · 2D card: the card-create / PATCH bodies and the /render bodies Nexo
// sends, the card's live schema value for pcaMode, the Inspector radios, and the analysis settings. Read-only: no
// checkpoint is saved.  NEXO_AUDIT_BASE=http://127.0.0.1:5182 node tests/dual-ui/chart-audit/probe_b02-pcamode.cjs
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..', '..');
const pw = require(require.resolve('playwright', { paths: [path.join(root, 'tests/browser/ci')] }));
const base = process.env.NEXO_AUDIT_BASE || 'http://127.0.0.1:5182';
const shots = path.join(root, 'docs/integration/chart-audit/b02-qc-a');
const T = 120000;
const IDS = ['pcaMode', 'smartLabelPCA2D', 'smartLabelLoad2D'];
// usage: probe_b02-pcamode.cjs ["Library label" tag]; default the PCA loadings · 2D card
const LABEL = process.argv[2] || 'PCA loadings · 2D', TAG = process.argv[3] || 'load2dPlot';
const pick = b => { try { const j = JSON.parse(b || '{}'); const i = j.inputs || {}; return { keys: Object.keys(j), sent: Object.fromEntries(IDS.filter(k => k in i).map(k => [k, i[k]])), inputCount: Object.keys(i).length, width: j.width, height: j.height, output: j.output }; } catch { return { raw: String(b).slice(0, 200) }; } };

(async () => {
  const browser = await pw.chromium.launch();
  const out = { requests: [] };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    let cardPath = null, sid = null;
    page.on('request', r => {
      const u = r.url(); if (!/\/api\/v1\/sessions\//.test(u) || r.method() === 'GET') return;
      const m = u.match(/\/api\/v1(\/sessions\/([^/]+)\/cards\/[^/]+)\/render/); if (m) { cardPath = m[1]; sid = m[2]; }
      out.requests.push({ method: r.method(), url: u.replace(/^.*\/api\/v1/, ''), body: pick(r.postData()) });
    });
    await page.goto(`${base}/nexo/?checkpoint=nexo-complete-synthetic`);
    await page.getByRole('button', { name: 'Export figure ▾', exact: true }).waitFor({ timeout: T });
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /^Plots/ }).first().click();
    await page.locator('button.library-add').first().waitFor({ state: 'attached', timeout: T });
    await page.evaluate(() => document.querySelectorAll('.library-panel details').forEach(d => { d.open = true; }));
    await page.locator('button.library-add[aria-label="Add ${LABEL}"]').first().click();
    await page.waitForFunction(() => ['current', 'error'].includes(document.querySelector('#world .card .card-status')?.dataset.state), null, { timeout: T });
    if (await page.getByRole('complementary', { name: 'Library' }).isVisible().catch(() => false)) await page.getByRole('button', { name: /^Plots/ }).first().click();
    const id = await page.locator('#world .card').first().getAttribute('data-id');
    await page.locator('.zoom-pill').getByRole('button', { name: 'Fit', exact: true }).click();
    await page.locator(`#world .card[data-id="${id}"] header`).click();
    await page.waitForTimeout(1500);
    await page.locator('#inspector').getByRole('tab', { name: 'Data', exact: true }).click();
    out.inspector = await page.locator('#inspector input[type=radio][name="pcaMode"]').evaluateAll(es => es.map(e => ({ label: e.closest('label')?.innerText.trim(), checked: e.checked })));
    out.inspectorChecks = await page.evaluate(() => Object.fromEntries(['smartLabelPCA2D', 'smartLabelLoad2D'].map(k => [k, document.querySelector(`#inspector [id="${k}"]`)?.checked ?? null])));
    out.radiosNamedPcaModeInDocument = await page.locator('input[type=radio][name="pcaMode"]').count();
    out.schema = await page.evaluate(async p => {
      const r = await fetch(`/api/v1${p}/schema`); if (!r.ok) return { status: r.status };
      const j = await r.json(); const list = j.controls || j.inputs || [];
      const by = k => { const c = Array.isArray(list) ? list.find(x => x.id === k) : null; return c ? { value: c.value, default: c.default } : null; };
      return { keys: Object.keys(j).slice(0, 10), pcaMode: by('pcaMode'), smartLabelPCA2D: by('smartLabelPCA2D'), smartLabelLoad2D: by('smartLabelLoad2D') };
    }, cardPath);
    out.card = await page.evaluate(async p => { const r = await fetch(`/api/v1${p}`); return r.ok ? (async () => { const j = await r.json(); return { keys: Object.keys(j).slice(0, 12), pcaMode: j.inputs?.pcaMode }; })() : { status: r.status }; }, cardPath);
    out.analysis = await page.evaluate(async s => { const r = await fetch(`/api/v1/sessions/${s}/analysis`); return r.ok ? (async () => { const j = await r.json(); return { pcaMode: (j.inputs || j).pcaMode, keys: Object.keys(j).slice(0, 8) }; })() : { status: r.status }; }, sid);
    out.cardText = (await page.locator(`#world .card[data-id="${id}"]`).innerText()).replace(/\s+/g, ' ').slice(0, 200);
    await page.screenshot({ path: path.join(shots, `${TAG}-r1-probe-inputs.png`) });
    out.shot = `${TAG}-r1-probe-inputs.png`;
    await page.context().close();
  } catch (e) { out.error = String(e.message || e).split('\n')[0]; }
  finally { await browser.close(); }
  const file = path.join(shots, `probe-inputs-${TAG}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1).slice(0, 4000));
})();
