'use strict';
// Live journeys: Paula's canvas work against the real API, not the mock (the mock has hidden real-API bugs three
// times: H6, the H8 null label, and statistics on added violins). Opt-in, because it needs a running API:
//   NEXO_LIVE_BASE=http://localhost:5173 node tests/dual-ui/test_nexo_live_journeys.cjs
// NEXO_LIVE_BASE serves the app at /nexo/ and the API at /api/v1 (Vite dev with the API proxy, or the deployed
// build with NEXO_LIVE_USER/NEXO_LIVE_PASS for nginx). It only opens synthetic checkpoints: it adds cards,
// confirms the study design and saves a named checkpoint, which it deletes again at the end.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const base = process.env.NEXO_LIVE_BASE;
const checkpoint = process.env.NEXO_LIVE_CHECKPOINT || 'classic-seed7-synthetic';
const engines = (process.env.NEXO_LIVE_ENGINES || 'chromium,webkit').split(',');
const T = 180000; // a cold render on the real API can take tens of seconds
if (!base) { console.log('SKIP live journeys: set NEXO_LIVE_BASE to an app + API to test against'); process.exit(0); }
if (!/synthetic/.test(checkpoint)) { console.error('Refusing: live journeys write to the checkpoint workspace; use a synthetic checkpoint'); process.exit(2); }
const pw = require(require.resolve('playwright', { paths: [path.join(root, 'tests/browser/ci')] }));
const api = `${base}/api/v1`;

const cardFor = (page, id) => page.locator(`.card[data-id="${id}"]`);
const ids = page => page.locator('#world .card').evaluateAll(cs => cs.map(c => c.dataset.id));
const state = (page, id) => cardFor(page, id).locator('.card-status').getAttribute('data-state');
async function settled(page, id, states = ['current']) {
  await page.waitForFunction(([sel, ok]) => ok.includes(document.querySelector(sel + ' .card-status')?.dataset.state), [`.card[data-id="${id}"]`, states], { timeout: T });
}
// Bring a card into view (Fit, as a user would) and select it.
async function select(page, id) {
  const box = await cardFor(page, id).boundingBox(), view = page.viewportSize();
  if (!box || box.x < 0 || box.y < 0 || box.x + 80 > view.width || box.y + 40 > view.height)
    await page.locator('.zoom-pill').getByRole('button', { name: 'Fit', exact: true }).click();
  await cardFor(page, id).locator('header').click();
}
// A card shows something real: a decoded image, a Plotly graph with traces (group comparison too), or a network.
async function drawn(page, id) {
  await select(page, id);
  await page.waitForFunction(sel => {
    const c = document.querySelector(sel); if (!c) return false;
    const img = [...c.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0);
    const plot = [...c.querySelectorAll('.js-plotly-plot')].some(p => (p.data?.length ?? 0) > 0);
    const network = [...c.querySelectorAll('.network canvas')].some(n => n.width > 0);
    return img || plot || network;
  }, `.card[data-id="${id}"]`, { timeout: T });
}
async function openLibrary(page) {
  if (!(await page.locator('.library-panel:not([hidden])').count())) await page.getByRole('button', { name: /^Plots/ }).first().click();
  await page.locator('button.library-add').first().waitFor({ state: 'attached', timeout: T });
  await page.evaluate(() => document.querySelectorAll('.library-panel details').forEach(d => { d.open = true; }));
}
async function add(page, label) {
  await openLibrary(page);
  const before = await ids(page);
  await page.locator(`button.library-add[aria-label="Add ${label}"]`).first().click();
  await page.waitForFunction(n => document.querySelectorAll('#world .card').length > n, before.length, { timeout: T });
  const id = (await ids(page)).find(x => !before.includes(x));
  assert.ok(id, `no new card for ${label}`);
  return id;
}
async function download(page, click) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: T }), click()]);
  return { name: d.suggestedFilename(), bytes: fs.readFileSync(await d.path()) };
}

async function journeys(name) {
  const browser = await pw[name].launch();
  const auth = process.env.NEXO_LIVE_USER ? { httpCredentials: { username: process.env.NEXO_LIVE_USER, password: process.env.NEXO_LIVE_PASS ?? '' } } : {};
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, ...auth });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  let saved = null;
  const failures = [];
  try {
    // L1 Open: every card the checkpoint carries settles, none fails (the synthetic one opens an empty canvas).
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.getByRole('button', { name: 'Export figure ▾', exact: true }).waitFor({ timeout: T });
    await page.waitForTimeout(3000); // let the session's canvas arrive (the synthetic checkpoint has none)
    const initial = await ids(page);
    for (const id of initial) await settled(page, id, ['current', 'finished', 'finished-stale']);
    console.log(`PASS L1 ${name} open-${initial.length}-cards-settle`);

    // L2 Study design, as Team's Review step (the gated rows unlock).
    await openLibrary(page);
    const gated = page.locator('.library-row', { has: page.locator('strong', { hasText: /^Differential volcano$/ }) });
    await gated.getByRole('button', { name: 'Confirm study design… (Differential volcano)', exact: true }).first().click();
    const design = page.getByRole('dialog', { name: 'Confirm study design', exact: true }); await design.waitFor();
    await design.getByLabel('Experimental unit').selectOption('Animal');
    await design.getByLabel('Sample relationship').selectOption('independent');
    await design.getByRole('button', { name: 'Confirm study design', exact: true }).click();
    await design.waitFor({ state: 'hidden', timeout: T });
    await page.waitForFunction(() => !/Requires configuration/.test([...document.querySelectorAll('.library-row')].find(r => /^Differential volcano/.test(r.textContent))?.textContent ?? 'Requires configuration'), null, { timeout: T });
    console.log(`PASS L2 ${name} confirm-study-design-unlocks-gated-rows`);

    // L3 One card of each kind the engine draws: ggplot PNG, Plotly, visNetwork, a design-gated PNG, group comparison.
    const added = {};
    for (const [key, label] of [['png', 'Normalized signal boxplots'], ['plotly', 'Guided quality check'], ['network', 'Interactive pathway network'], ['volcano', 'Differential volcano'], ['violin', 'Feature distributions']]) {
      added[key] = await add(page, label);
      try { await settled(page, added[key]); await drawn(page, added[key]); console.log(`PASS L3 ${name} add-and-draw ${key} (${label})`); }
      catch (e) { // keep going: one card kind failing should not hide the other journeys
        const why = (await cardFor(page, added[key]).locator('.card-status').getAttribute('aria-label')) + ': ' + (await cardFor(page, added[key]).innerText()).replace(/\s+/g, ' ').slice(0, 160);
        failures.push(`L3 ${key} (${label}) ${why}`); console.log(`FAIL L3 ${name} add-and-draw ${key} (${label}) ${why}`); delete added[key];
      }
    }
    added.gc = await add(page, 'Lipid class comparison');
    const prompt = cardFor(page, added.gc).locator('.gc-confirm');
    await prompt.getByRole('button', { name: 'Confirm reference group', exact: true }).click({ timeout: T });
    await drawn(page, added.gc);
    console.log(`PASS L3 ${name} add-confirm-and-draw group comparison`);

    // L4 Data change and Undo on a ggplot card: a new image, then the old inputs and image back.
    const inspector = page.locator('#inspector');
    await select(page, added.png);
    await inspector.getByRole('tab', { name: 'Data', exact: true }).click();
    const choice = await inspector.locator('.schema-form select').evaluateAll(ss => {
      const s = ss.find(x => !x.disabled && x.options.length > 1); if (!s) return null;
      return { id: s.id, from: s.value, to: [...s.options].find(o => o.value !== s.value && !o.disabled)?.value };
    });
    assert.ok(choice?.id && choice.to != null, 'no Data select to change on the ggplot card');
    const src = () => cardFor(page, added.png).locator('img').first().getAttribute('src');
    const src0 = await src();
    await inspector.locator(`select#${choice.id}`).selectOption(choice.to);
    await page.waitForFunction(([sel, s0]) => { const i = document.querySelector(sel + ' img'); return i && i.getAttribute('src') !== s0 && i.complete && i.naturalWidth > 0; }, [`.card[data-id="${added.png}"]`, src0], { timeout: T });
    await page.locator('#viewport').focus(); await page.keyboard.press('Control+z');
    await page.waitForFunction(([id, v]) => document.querySelector(`#inspector select#${id}`)?.value === v, [choice.id, choice.from], { timeout: T });
    await settled(page, added.png); await drawn(page, added.png);
    console.log(`PASS L4 ${name} data-change-and-undo ${choice.id}`);

    // L5 Statistics on the added violin: describe, confirm, marker; a Data change marks them out of date; Undo restores.
    await select(page, added.violin);
    await inspector.getByRole('tab', { name: 'Statistics', exact: true }).click();
    await inspector.getByRole('button', { name: 'Review and confirm…', exact: true }).click({ timeout: T });
    await inspector.getByRole('button', { name: 'Confirm and compute', exact: true }).click({ timeout: T });
    const marker = cardFor(page, added.violin).locator('header .card-stats');
    await marker.filter({ hasText: /^Statistics$/ }).waitFor({ timeout: T });
    await inspector.getByRole('tab', { name: 'Data', exact: true }).click();
    const lipid = inspector.locator('#violin_lipid[role=listbox]');
    const lipid0 = await lipid.getAttribute('data-value');
    await lipid.locator('[role=option][aria-selected=false]').first().click();
    await marker.filter({ hasText: 'Statistics out of date' }).waitFor({ timeout: T });
    await page.locator('#viewport').focus(); await page.keyboard.press('Control+z');
    await page.waitForFunction(v => document.querySelector('#inspector #violin_lipid[role=listbox]')?.dataset.value === v, lipid0, { timeout: T });
    await marker.filter({ hasText: /^Statistics$/ }).waitFor({ timeout: T });
    console.log(`PASS L5 ${name} statistics-confirm-stale-undo`);

    // L6 Finish the ggplot card and the violin; the Figure page counts what is left.
    for (const id of [added.png, added.violin]) {
      await select(page, id);
      await inspector.getByRole('button', { name: 'Finish plot', exact: true }).click({ timeout: T });
      await settled(page, id, ['finished']);
    }
    await page.getByRole('button', { name: 'Figure page →', exact: true }).click();
    await page.locator('#world #figure-layer .figure-sheet').waitFor({ timeout: T });
    await page.getByRole('tab', { name: /^Plots · / }).click();
    const pending = await page.locator('.figure-pending').textContent();
    const [done, total] = pending.match(/^(\d+) of (\d+) plots finished$/)?.slice(1).map(Number) ?? [];
    assert.ok(done >= 2 && total >= done, `pending count: ${pending}`);
    await page.getByRole('button', { name: '← Draft', exact: true }).click();
    await page.locator('#world #figure-layer .figure-sheet').waitFor({ state: 'detached', timeout: T }).catch(() => {});
    console.log(`PASS L6 ${name} finish-two-figure-page-${pending.replace(/ /g, '-')}`);

    // L7 Export through the real API: the module's own downloads, a selected-plot PNG, a publication bundle.
    // The volcano offers Team's two buttons (results table CSV, plot PDF) under "More downloads from this analysis".
    await select(page, added.volcano);
    await inspector.getByRole('tab', { name: 'Export', exact: true }).click();
    const more = inspector.getByRole('group', { name: 'More downloads from this analysis', exact: true });
    await more.waitFor({ timeout: T });
    assert.deepEqual(await more.getByRole('button').allTextContents(), ['CSV', 'PDF']);
    const table = await download(page, () => more.getByRole('button', { name: 'CSV', exact: true }).click());
    assert.match(table.name, /\.csv$/); assert.ok(table.bytes.length > 200 && /,/.test(table.bytes.toString('utf8').split('\n')[0]), 'volcano table has no header');
    const plotPdf = await download(page, () => more.getByRole('button', { name: 'PDF', exact: true }).click());
    assert.match(plotPdf.name, /\.pdf$/); assert.equal(plotPdf.bytes.subarray(0, 4).toString('latin1'), '%PDF');
    // The violin was finished in L6: as in Team, a finished figure offers its snapshot only, not the analysis downloads.
    await select(page, added.violin);
    await inspector.getByRole('tab', { name: 'Export', exact: true }).click();
    await inspector.getByRole('button', { name: 'Download PNG', exact: true }).waitFor({ timeout: T });
    assert.equal(await inspector.getByRole('group', { name: 'More downloads from this analysis', exact: true }).count(), 0);
    await select(page, added.volcano);
    await inspector.getByRole('tab', { name: 'Export', exact: true }).click();
    await inspector.getByRole('button', { name: 'More export options…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export', exact: true }); await dialog.waitFor();
    const png = await download(page, () => dialog.getByRole('button', { name: 'Download PNG', exact: true }).click());
    assert.equal(png.bytes.subarray(1, 4).toString(), 'PNG');
    await dialog.getByRole('radio', { name: 'Publication figure', exact: true }).check();
    for (const f of ['TIFF', 'PDF']) { const box = dialog.getByLabel(f, { exact: true }); if (await box.isChecked()) await box.uncheck(); }
    const zip = await download(page, () => dialog.getByRole('button', { name: 'Download bundle', exact: true }).click());
    assert.equal(zip.bytes.subarray(0, 2).toString(), 'PK');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    console.log(`PASS L7 ${name} export volcano csv ${table.bytes.length} B + pdf ${plotPdf.bytes.length} B, finished violin snapshot only, png ${png.bytes.length} B, bundle ${zip.bytes.length} B`);

    // L8 Save a named checkpoint, reopen it: same cards, finished plots and statistics come back.
    const label = `live-suite-${name}-${Date.now().toString(36)}`;
    const before = await ids(page);
    await page.getByRole('button', { name: 'Export figure ▾', exact: true }).click();
    await page.getByRole('button', { name: 'Save checkpoint…', exact: true }).click();
    const cps = page.getByRole('dialog', { name: 'Checkpoints', exact: true });
    await cps.getByRole('textbox', { name: 'New checkpoint name' }).fill(label);
    await cps.getByRole('button', { name: 'Save current analysis', exact: true }).click();
    await page.locator('.toast', { hasText: `Saved checkpoint ${label}` }).waitFor({ timeout: T });
    saved = new URL(page.url()).searchParams.get('checkpoint');
    assert.match(saved, /^[a-f0-9]{64}$/);
    await page.reload();
    await page.getByRole('button', { name: 'Export figure ▾', exact: true }).waitFor({ timeout: T });
    await page.waitForFunction(n => document.querySelectorAll('#world .card').length === n, before.length, { timeout: T });
    assert.deepEqual((await ids(page)).sort(), before.sort());
    for (const id of [added.png, added.violin]) assert.equal(await state(page, id), 'finished');
    await cardFor(page, added.violin).locator('header .card-stats', { hasText: /^Statistics$/ }).waitFor({ timeout: T });
    for (const id of [added.plotly, added.network, added.volcano].filter(Boolean)) { await settled(page, id); await drawn(page, id); }
    console.log(`PASS L8 ${name} named-save-reopen-same-cards-finished-statistics`);

    assert.deepEqual(errors.filter(e => !failures.length || !/status of 422/.test(e)), []);
    console.log(`PASS L9 ${name} no-console-errors${failures.length ? ' (besides the failed renders above)' : ''}`);
    assert.deepEqual(failures, []);
  } finally {
    // Leave the shared workspace as it was: remove the named checkpoint this run created.
    if (saved) {
      const status = await page.evaluate(async u => (await fetch(u, { method: 'DELETE' })).status, `${api}/checkpoints/${saved}`).catch(e => String(e));
      console.log(`cleanup: deleted ${saved.slice(0, 12)}… (${status})`);
    }
    await browser.close();
  }
}

(async () => {
  for (const name of engines) await journeys(name);
  console.log('LIVE OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
