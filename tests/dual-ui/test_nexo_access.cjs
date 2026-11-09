// H7c: phone read-only mode, responsive chrome, axe and keyboard-only access in Chromium and WebKit (mock build).
// node tests/dual-ui/test_nexo_access.cjs   (screenshots in /tmp/nexo-h7c/)
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const shots = '/tmp/nexo-h7c';
const axePath = path.join(nexo, 'node_modules/axe-core/axe.min.js');
const checkpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id;
const banner = 'View only on this device. Open Nexo on a computer to edit.';
const mockStore = 'nexo-mock-checkpoints-v1';
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
const nodes = page => page.evaluate(() => window.__nexo.store.get().nodes);
const camera = page => page.$eval('#world', el => el.style.transform);
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
async function open(context, query = '') {
  const page = await context.newPage(), errors = [], writes = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`); });
  await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}${query}`);
  await page.waitForSelector('.card');
  await page.waitForFunction(() => document.querySelectorAll('.card .body > *').length >= 2);
  return { page, errors, writes };
}

// axe: serious/critical must be 0; moderate and minor are printed for the log.
async function axe(page, browser, label, findings) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map(n => n.target.join(' ')) })));
  for (const v of violations) {
    const line = `${browser} ${label} ${v.impact} ${v.id}: ${v.help} [${v.nodes.join(' | ')}]`;
    findings.push(line);
    if (v.impact !== 'serious' && v.impact !== 'critical') console.log(`NOTE axe ${line}`);
  }
  const serious = violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  // H8b: the canvas area is a labelled region, so no content sits outside a landmark.
  assert.deepEqual(violations.filter(v => v.id === 'region').map(v => v.nodes.join(' | ')), [], `axe ${label}: region`);
  assert.deepEqual(serious, [], `axe ${label}: ${serious.map(v => `${v.impact} ${v.id} ${v.nodes.join(' | ')}`).join('; ')}`);
}

// H9 (review R04): AAA text contrast (axe color-contrast-enhanced, 7:1 / 4.5:1 large) has no violations.
async function aaa(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: axePath });
  const bad = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['color-contrast-enhanced'], resultTypes: ['violations'] })).violations
    .flatMap(v => v.nodes.map(n => `${n.target.join(' ')} ${n.any[0]?.data?.fgColor}/${n.any[0]?.data?.bgColor} ${n.any[0]?.data?.contrastRatio}`)));
  assert.deepEqual(bad, [], `AAA contrast ${label}: ${bad.length}`);
  console.log(`PASS H9 ${label} aaa-text-contrast`);
}

// Shell chrome boxes: inside the viewport and pairwise disjoint (the HUD is reported when hidden).
async function layout(page, label, { phone = false } = {}) {
  const report = await page.evaluate(phone => {
    const parts = { topbar: '.topbar', tabs: '.tabsbar', toolbar: '.toolbar', banner: '.readonly-banner', zoom: '.zoom-pill', minimap: '#minimap', hud: '#hud', inspector: '.inspector-column' };
    const shown = el => { if (!el) return null; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' ? r : null; };
    const boxes = {}, missing = [];
    for (const [name, selector] of Object.entries(parts)) { const r = shown(document.querySelector(selector)); if (r) boxes[name] = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; else missing.push(name); }
    const out = [], overlaps = [], small = [];
    for (const [name, b] of Object.entries(boxes)) if (b.left < -0.5 || b.top < -0.5 || b.right > innerWidth + 0.5 || b.bottom > innerHeight + 0.5) out.push(`${name} ${JSON.stringify(b)}`);
    const names = Object.keys(boxes);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const a = boxes[names[i]], b = boxes[names[j]];
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) overlaps.push(`${names[i]}×${names[j]}`);
    }
    const controls = [...document.querySelectorAll('.topbar,.rail,.canvas-header,.status-band,.readonly-banner,.zoom-pill,.inspector-column')]
      .flatMap(el => [...el.querySelectorAll('button,a[href],select,input,textarea,summary,[tabindex="0"]')]);
    for (const el of controls) {
      const r = shown(el); if (!r || el.closest('[hidden]')) continue;
      if (r.left < -0.5 || r.right > innerWidth + 0.5) out.push(`control ${el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20)}`);
      if (phone && !el.matches(':disabled') && (r.width < 32 || r.height < 32)) small.push(`${el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20) || el.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    if (document.documentElement.scrollWidth > innerWidth) out.push(`page scrolls sideways ${document.documentElement.scrollWidth}`);
    return { names, missing, out, overlaps, small };
  }, phone);
  assert.deepEqual(report.out, [], `${label}: outside the viewport ${report.out.join('; ')}`);
  assert.deepEqual(report.overlaps, [], `${label}: overlapping chrome ${report.overlaps.join('; ')}`);
  assert.deepEqual(report.small, [], `${label}: touch targets under 32 px ${report.small.join('; ')}`);
  return report;
}

async function phoneReadOnly(pw, name, findings) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, acceptDownloads: true });
    const { page, errors, writes } = await open(context);
    const stored = await page.evaluate(key => sessionStorage.getItem(key), mockStore), original = await nodes(page);
    assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
    assert.equal((await page.locator('.save-pill').textContent()).trim(), 'View only');
    assert(await page.locator('.save-pill').isVisible(), 'save pill hidden on the phone');
    assert.equal((await page.locator('.readonly-banner p').textContent()).trim(), banner);
    // H8 journeys 9.2: on a phone the banner stays compact (at most two short lines).
    assert((await page.locator('.readonly-banner').boundingBox()).height <= 44, 'view-only banner too tall on a phone');
    for (const label of ['+ Add plot', 'Tidy up', '↶ Undo', '↷ Redo', 'Add canvas tab', 'Tab actions', 'Plots', 'Illustrations'])
      assert.equal(await button(page, label).count(), 0, `${label} visible in view-only mode`);
    assert(await page.locator('.library-panel').isHidden(), 'library open in view-only mode');
    await button(page, 'Canvas tools').tap();
    for (const label of ['Paste plot', 'Remove all', 'Save checkpoint…', 'Download ZIP']) assert.equal(await button(page, label).count(), 0, `${label} in the menu`);
    assert.equal(await button(page, 'Canvas help').count(), 1);
    await page.keyboard.press('Escape');
    // Pilot simulation, step 13 (Steph on a phone): chrome text (badges, counts, captions) is at least 12 px there;
    // plots, SVG and canvas drawings are the figure, not chrome.
    const tiny = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => {
      if (el.closest('svg,.js-plotly-plot,canvas,[hidden],[aria-hidden="true"]')) return false;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return false;
      const r = el.getBoundingClientRect(), st = getComputedStyle(el);
      return r.width && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && st.visibility !== 'hidden' && parseFloat(st.fontSize) < 12;
    }).map(el => `${el.className || el.tagName} "${el.textContent.trim().slice(0, 20)}" ${getComputedStyle(el).fontSize}`));
    assert.deepEqual(tiny, [], 'chrome text under 12 px on a phone');
    console.log(`PASS H7c ${name} phone-view-only-chrome`);
    // H8: on a phone the canvas opens fitted: every card inside the viewport, each showing content.
    await page.waitForFunction(() => { const v = document.querySelector('#viewport').getBoundingClientRect(), cards = [...document.querySelectorAll('.card')];
      return cards.length > 0 && cards.every(c => { const r = c.getBoundingClientRect(); return r.left >= v.left - 1 && r.right <= v.right + 1 && r.top >= v.top - 1 && r.bottom <= v.bottom + 1 && c.querySelector('.body img, .body .js-plotly-plot'); }); }, null, { timeout: 30000 });
    console.log(`PASS H8 ${name} phone-opens-fitted-with-content`);
    await layout(page, `${name} 390 closed`, { phone: true });

    // Pan (one finger on empty canvas), pinch and wheel move the camera without selecting or editing.
    const empty = await page.evaluate(() => {
      const vp = document.querySelector('#viewport'), r = vp.getBoundingClientRect();
      for (let y = r.bottom - 20; y > r.top; y -= 15) for (let x = r.right - 20; x > r.left; x -= 15) if (document.elementFromPoint(x, y) === vp) return { x, y };
      return null;
    });
    assert(empty, 'no empty canvas point');
    const touch = (pointers, phase) => page.evaluate(({ pointers, phase }) => {
      const vp = document.querySelector('#viewport'); vp.setPointerCapture = () => {};
      for (const p of pointers) vp.dispatchEvent(new PointerEvent(`pointer${phase}`, { pointerId: p.id, pointerType: 'touch', isPrimary: p.id === 11, clientX: p.x, clientY: p.y, button: phase === 'move' ? -1 : 0, buttons: phase === 'up' ? 0 : 1, bubbles: true, cancelable: true }));
    }, { pointers, phase });
    let before = await camera(page);
    await touch([{ id: 11, ...empty }], 'down'); await touch([{ id: 11, x: empty.x - 60, y: empty.y - 40 }], 'move'); await touch([{ id: 11, x: empty.x - 60, y: empty.y - 40 }], 'up');
    assert.notEqual(await camera(page), before, 'one-finger pan did not move the camera');
    assert.equal(await page.locator('.card.selected').count(), 0, 'pan selected cards');
    const scale = () => page.evaluate(() => Number(document.querySelector('#zoom').value));
    const s0 = await scale(), a = { id: 11, x: empty.x - 40, y: empty.y - 40 }, b = { id: 12, x: empty.x - 10, y: empty.y - 10 };
    await touch([a, b], 'down'); await touch([{ ...a, x: a.x - 30, y: a.y - 30 }, b], 'move'); await touch([a, b], 'up');
    assert(await scale() > s0, 'pinch did not zoom');
    before = await camera(page); await page.mouse.move(empty.x, empty.y); await page.mouse.wheel(0, 120);
    await page.waitForFunction(b => document.querySelector('#world').style.transform !== b, before);
    await button(page, 'Zoom in').tap();
    console.log(`PASS H7c ${name} phone-pan-pinch-wheel-zoom`);

    // Select and inspect: the sheet shows the settings with every input disabled; Export still downloads.
    const plot = page.locator('.card[data-id="results_dashboard-plot_pca"]');
    await page.evaluate(() => window.__nexo.handle.fit());
    await plot.locator('.body').tap();
    await page.waitForSelector('.inspector-column #inspector[data-open="true"]');
    assert.equal(await plot.evaluate(el => el.classList.contains('selected')), true);
    await layout(page, `${name} 390 inspector`, { phone: true });
    const enabled = () => page.$$eval('#inspector [role=tabpanel] :is(input,select,textarea,button)', els => [els.length, els.filter(e => !e.disabled && !e.matches(':disabled')).map(e => e.getAttribute('aria-label') || e.textContent.trim() || e.id)]);
    let controls = 0;
    for (const tab of ['Data', 'Appearance', 'Statistics']) {
      await page.locator('#inspector').getByRole('tab', { name: tab, exact: true }).tap();
      await page.waitForTimeout(300);
      const [count, active] = await enabled();
      controls += count;
      assert.deepEqual(active, [], `${tab} tab has enabled inputs`);
    }
    assert(controls > 0, 'the inspector showed no settings');
    assert.equal(await page.locator('#inspector').getByRole('button', { name: 'Finish plot', exact: true }).count(), 0);
    await page.locator('#inspector').getByRole('tab', { name: 'Export', exact: true }).tap();
    const download = page.waitForEvent('download');
    await button(page.locator('#inspector'), 'Plot data (CSV)').tap();
    assert.match((await download).suggestedFilename(), /\.csv$/);
    console.log(`PASS H7c ${name} phone-inspector-read-only-export-works`);

    // Card menu keeps only non-editing items; keyboard edit shortcuts do nothing.
    await plot.locator('button[aria-label="More card actions"]').tap();
    const items = await plot.locator('.card-menu button:visible').allTextContents();
    assert.deepEqual(items, ['Data & settings']);
    assert.equal(await plot.locator('.card-footer').count(), 0, 'the card carries no action bar');
    // Rows 15/16: on a phone every visible card-menu item is a view action; tool buttons carry no key letters and no tooltip on a touch-only pointer.
    const viewActions = ['Data & settings', 'Export plot…'];
    for (const item of items) assert(viewActions.includes(item), `${item} is not a view action`);
    const rail = await page.$$eval('.rail button', els => els.map(el => ({ name: el.getAttribute('aria-label'), text: el.textContent.trim(), after: getComputedStyle(el, '::after').content })));
    assert(rail.length >= 3, 'rail buttons');
    for (const b of rail) { assert.doesNotMatch(`${b.name} ${b.text}`, /\b[VHIL]\b|\(.\)/, `${b.name}: key letter shown on a phone`); assert.equal(b.after, 'none', `${b.name}: tooltip on a touch-only device`); }
    console.log(`PASS R15 ${name} phone-view-actions-no-key-letters-no-tooltips`);
    await page.keyboard.press('Escape');
    await plot.focus();
    for (const key of ['Delete', 'Backspace', 'Control+d', 'Meta+d', 'ArrowRight', 'Shift+ArrowDown', 'Control+z', 'Control+Shift+m', 'Control+v']) await page.keyboard.press(key);
    await page.waitForTimeout(300);
    assert.deepEqual(await nodes(page), original, 'view-only keyboard changed the canvas');
    console.log(`PASS H7c ${name} phone-card-menu-and-shortcuts-inert`);

    await button(page, 'Close inspector').tap();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.inspector-column')).display === 'none');
    await page.waitForTimeout(2500);
    assert.deepEqual(writes, [], 'view-only mode sent a write request');
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), mockStore), stored, 'mock checkpoint store changed');
    assert.equal(await page.evaluate(() => window.__nexo.autosave), undefined, 'autosave created');
    console.log(`PASS H7c ${name} phone-no-autosave-no-checkpoint-post`);

    await axe(page, name, 'phone-view-only', findings);
    await aaa(page, `${name} phone-view-only`);
    await page.screenshot({ path: `${shots}/${name}-390.png` });
    await button(page, 'Dismiss view-only notice').tap();
    assert.equal(await page.locator('.readonly-banner').count(), 0);
    await page.reload(); await page.waitForSelector('.card');
    assert.equal(await page.locator('.readonly-banner').count(), 0, 'dismissed banner came back after a reload');
    console.log(`PASS H7c ${name} phone-axe-banner-dismiss`);
    console.log(`PASS H8 ${name} phone-banner-compact-and-stays-dismissed`);

    // Figure page opens read-only.
    await button(page, 'Figure page →').tap();
    await page.waitForSelector('.figure-panel');
    assert.equal(await button(page, 'Add text').count(), 0);
    assert.deepEqual(await page.$$eval('.figure-panel :is(input,select,textarea)', els => els.filter(e => !e.matches(':disabled')).length), 0);
    assert.equal(await page.locator('.figure-panel').getByRole('button', { name: 'Export SVG', exact: true }).isEnabled(), true);
    await layout(page, `${name} 390 figure`, { phone: true });
    console.log(`PASS H7c ${name} phone-figure-page-read-only`);
    assert.deepEqual(errors, []); console.log(`PASS H7c ${name} phone-no-console-errors`);
    await context.close();

    // ?mode=edit forces editing on the phone; ?mode=view forces view on a computer.
    const forced = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const edit = await open(forced, '&mode=edit');
    assert.equal(await button(edit.page, '+ Add plot').count() + await button(edit.page, 'Canvas tools').count() > 0, true);
    assert.equal(await edit.page.locator('.readonly-banner').count(), 0);
    await edit.page.getByRole('button', { name: 'Canvas tools', exact: true }).tap();
    assert.equal(await button(edit.page, 'Remove all').count(), 1);
    await forced.close();
    const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const view = await open(desk, '&mode=view');
    assert.equal((await view.page.locator('.save-pill').textContent()).trim(), 'View only');
    assert.equal(await button(view.page, '+ Add plot').count(), 0);
    await desk.close();
    console.log(`PASS H7c ${name} mode-param-overrides`);
  } finally { await browser.close(); }
}

async function tablets(pw, name) {
  const browser = await pw[name].launch();
  try {
    for (const [width, height] of [[768, 1024], [1024, 768]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      const { page, errors } = await open(context);
      await layout(page, `${name} ${width}x${height} closed`);
      await page.locator('.card').first().locator('header').click();
      await page.waitForSelector('#inspector[data-open="true"]');
      await layout(page, `${name} ${width}x${height} inspector`);
      if (width === 1024) await page.screenshot({ path: `${shots}/${name}-1024.png` });
      await button(page, 'Close inspector').click();
      await page.waitForSelector('#inspector[data-open="false"]', { state: 'attached' });
      assert.deepEqual(errors, []);
      console.log(`PASS H7c ${name} layout-${width}x${height}`);
      await context.close();
    }
  } finally { await browser.close(); }
}

async function desktop(pw, name, findings) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const { page, errors } = await open(context);
    await axe(page, name, 'canvas', findings);
    await aaa(page, `${name} canvas`);
    await page.locator('.card[data-id="results_dashboard-plot_pca"] header').click();
    await page.waitForSelector('#inspector[data-open="true"]');
    await page.waitForTimeout(300);
    await axe(page, name, 'inspector', findings);
    await aaa(page, `${name} inspector`);
    await button(page, 'Export figure ▾').click(); await button(page, 'Publication export…').click();
    await page.waitForSelector('dialog[open]');
    await axe(page, name, 'export-dialog', findings);
    await aaa(page, `${name} export-dialog`);
    await page.keyboard.press('Escape'); await page.waitForSelector('dialog[open]', { state: 'detached' });
    await page.screenshot({ path: `${shots}/${name}-1440.png` });

    // H6 leftover: the inspector status of a finished plot matches its badge.
    const id = 'results_dashboard-plot_violin', card = page.locator(`.card[data-id="${id}"]`);
    await card.locator('button[aria-label="More card actions"]').click();
    await card.getByRole('button', { name: 'Finish plot', exact: true }).click();
    await page.waitForSelector(`.card[data-id="${id}"] .card-status[data-state="finished"]`, { timeout: 20000 });
    await card.locator('header').click();
    await page.waitForFunction(() => document.querySelector('#inspector p[role=status]')?.textContent === 'Finished');
    await page.evaluate(id => window.__nexo.store.set(d => ({ ...d, nodes: d.nodes.map(n => n.id === id ? { ...n, finished: { ...n.finished, stale: true } } : n) })), id);
    await page.waitForSelector(`.card[data-id="${id}"] .card-status[data-state="finished-stale"]`);
    await page.waitForFunction(() => document.querySelector('#inspector p[role=status]')?.textContent === 'Finished · out of date');
    console.log(`PASS H7c ${name} finished-inspector-status-matches-badge`);

    await button(page, 'Figure page →').click();
    await page.waitForSelector('.figure-panel');
    await page.waitForTimeout(300);
    await axe(page, name, 'figure-page', findings);
    await aaa(page, `${name} figure-page`);
    assert.deepEqual(errors, []);
    console.log(`PASS H7c ${name} desktop-axe-canvas-inspector-export-figure`);

    // H8b: an empty tab shows a non-blocking hint whose Add plot button opens the library.
    await button(page, '← Draft').click();
    await button(page, 'Add canvas tab').click();
    await page.locator('.canvas-empty').getByText('This canvas is empty. Add a plot from the library or drag an illustration here.', { exact: true }).waitFor();
    await axe(page, name, 'empty-canvas', findings);
    if (await page.locator('.library-panel').isVisible()) await button(page, 'Close library').click();
    await page.locator('.library-panel').waitFor({ state: 'hidden' });
    await button(page, 'Add plot').click();
    await page.locator('.library-panel').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
    console.log(`PASS H8b ${name} empty-canvas-hint-add-plot`);
    await context.close();
  } finally { await browser.close(); }
}

// Keyboard only: Tab order, Enter selects, arrows move, Esc cascade, visible focus rings.
async function keyboard(pw, name) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const { page, errors } = await open(context);
    const tab = name === 'webkit' ? 'Alt+Tab' : 'Tab'; // Safari moves to buttons and links with Option+Tab.
    const cards = await page.$$eval('.card:not([hidden])', els => els.map(el => el.dataset.id));
    // The library opens closed (wave 1); open it so its controls are part of the order checked here.
    await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click(); await page.locator('.library-panel').waitFor();
    const seen = [], missingRing = [];
    // The canvas takes focus when it opens (P3 journey 1.3); the page's tab order starts from the document.
    await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); document.body.removeAttribute('tabindex'); });
    for (let i = 0; i < 200 && !cards.every(id => seen.includes(`card:${id}`)); i++) {
      await page.keyboard.press(tab);
      const info = await page.evaluate(() => {
        const el = document.activeElement, cs = getComputedStyle(el);
        const region = el.closest('.topbar') ? 'topbar' : el.closest('.library-panel') ? 'library' : el.id === 'viewport' ? 'viewport'
          : el.classList.contains('card') ? `card:${el.dataset.id}` : el.closest('.card') ? 'in-card' : el.closest('.rail') ? 'rail' : el.tagName.toLowerCase();
        const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || cs.boxShadow !== 'none';
        return { region, ring, label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 24) };
      });
      seen.push(info.region);
      if (!info.ring && info.region !== 'body') missingRing.push(`${info.region} ${info.label}`);
    }
    const first = region => seen.findIndex(r => r === region || r.startsWith(region));
    assert(first('topbar') >= 0 && first('topbar') < first('library') && first('library') < first('viewport') && first('viewport') < first('card:'), `tab order ${seen.join(' > ')}`);
    for (const id of cards) assert(seen.includes(`card:${id}`), `card ${id} not reachable`);
    assert.deepEqual(missingRing, [], 'focus without a visible ring');
    console.log(`PASS H7c ${name} keyboard-tab-order-focus-rings`);

    const id = await page.evaluate(() => document.activeElement.dataset.id);
    await page.keyboard.press('Enter');
    await page.waitForSelector(`.card.selected[data-id="${id}"]`);
    await page.waitForSelector('#inspector[data-open="true"]');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.id), id, 'Enter moved focus off the card');
    const x = (await nodes(page)).find(n => n.id === id).x;
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(([id, x]) => window.__nexo.store.get().nodes.find(n => n.id === id).x > x, [id, x]);
    console.log(`PASS H7c ${name} keyboard-enter-selects-arrow-moves`);

    for (let i = 0; i < 6 && await page.evaluate(() => document.activeElement.getAttribute('aria-label')) !== 'More card actions'; i++) await page.keyboard.press(tab);
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'More card actions');
    await page.keyboard.press('Enter');
    await page.waitForSelector(`.card[data-id="${id}"] .card-menu:not([hidden])`);
    await page.keyboard.press('Escape');
    await page.waitForSelector(`.card[data-id="${id}"] .card-menu`, { state: 'hidden' });
    assert.equal(await page.locator('#inspector[data-open="true"]').count(), 1, 'Esc closed the inspector with the menu');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#inspector[data-open="false"]', { state: 'attached' });
    assert.equal(await page.locator('.card.selected').count(), 1, 'Esc cleared the selection with the inspector');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.card.selected'));
    console.log(`PASS H7c ${name} keyboard-escape-cascade`);
    // H8b: ? outside a field and the toolbar menu open a labelled shortcuts dialog; Esc closes it and focus returns.
    await page.locator('#viewport').focus();
    await page.keyboard.press('Shift+Slash');
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
    await help.waitFor();
    assert.match(await help.textContent(), /Undo, redo/);
    await axe(page, name, 'shortcuts-dialog', []);
    await page.keyboard.press('Escape'); await help.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'viewport');
    await button(page, 'Canvas tools').click(); await button(page, 'Keyboard shortcuts').click();
    await help.waitFor();
    await page.keyboard.press('Escape'); await help.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Canvas tools');
    console.log(`PASS H8b ${name} keyboard-shortcuts-dialog`);
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
}

// Row 17: hover/chips 120 ms, panels 180 ms, camera 280 ms, minimap 220 ms, hint 200 ms, one easing; reduced motion makes every duration 0.
async function motion(pw, name) {
  const browser = await pw[name].launch();
  const names = ['--motion-hover', '--motion-panel', '--motion-camera', '--motion-minimap', '--motion-hint', '--motion-skeleton', '--motion', '--ease'];
  // The production build minifies units (120ms -> .12s): read every duration back as whole milliseconds, the easing without spaces.
  const read = page => page.evaluate(names => { const cs = getComputedStyle(document.documentElement);
    const norm = v => { const m = v.match(/^(\d*\.?\d+)(ms|s)$/); return m ? `${Math.round(parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1))}ms` : v.replace(/\s+/g, '').replace(/\b0\./g, '.'); };
    return Object.fromEntries(names.map(k => [k, norm(cs.getPropertyValue(k).trim())])); }, names);
  try {
    const normal = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    const { page, errors } = await open(normal);
    assert.deepEqual(await read(page), { '--motion-hover': '120ms', '--motion-panel': '180ms', '--motion-camera': '280ms', '--motion-minimap': '220ms', '--motion-hint': '200ms', '--motion-skeleton': '1400ms', '--motion': '120ms', '--ease': 'cubic-bezier(.2,.7,.2,1)' });
    const ease = /^cubic-bezier\(0\.2, 0\.7, 0\.2, 1\)(, cubic-bezier\(0\.2, 0\.7, 0\.2, 1\))*$/;
    const timing = sel => page.$eval(sel, el => { const cs = getComputedStyle(el); return { d: cs.transitionDuration, f: cs.transitionTimingFunction }; });
    const card = await timing('.card'); assert.match(card.d, /^0\.12s(, 0\.12s)*$/, `card hover ${card.d}`); assert.match(card.f, ease, `card easing ${card.f}`);
    const action = await timing('.card .card-actions > button'); assert.match(action.d, /^0\.12s(, 0\.12s)*$/, `card action ${action.d}`); assert.match(action.f, ease, `card action easing ${action.f}`);
    const minimap = await timing('#minimap'); assert.equal(minimap.d, '0.22s'); assert.match(minimap.f, ease, `minimap easing ${minimap.f}`);
    // tidy() moves only cards off the tidy grid: nudge one first so the slide is observable on any fixture.
    const nudge = p => p.evaluate(() => window.__nexo.store.set(d => ({ ...d, nodes: d.nodes.map((n, i) => i === 0 ? { ...n, x: n.x + 97, y: n.y + 53 } : n) })));
    await nudge(page);
    // Read the inline transition in the same evaluate as tidy(): it is cleared after one panel duration (180 ms), sooner than a WebKit round trip under load.
    const inline = await page.evaluate(() => { window.__nexo.handle.tidy(); return [...new Set([...document.querySelectorAll('.card')].map(el => el.style.transition).filter(Boolean))]; });
    assert.deepEqual(inline, ['left var(--motion-panel) var(--ease), top var(--motion-panel) var(--ease)'], `tidy transition ${inline}`);
    assert.deepEqual(errors, []);
    await normal.close();
    const reduced = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const r = await open(reduced);
    const zero = await read(r.page);
    for (const k of names) if (k !== '--ease') assert.equal(zero[k], '0ms', `${k} under reduced motion`);
    const moving = await r.page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => !el.closest('svg,.js-plotly-plot,canvas')).flatMap(el => {
      const out = []; for (const pseudo of [null, '::before', '::after']) { const cs = getComputedStyle(el, pseudo);
        if (cs.transitionDuration.split(',').some(v => parseFloat(v) > 0)) out.push(`${el.className || el.tagName}${pseudo || ''} transition ${cs.transitionDuration}`);
        if (cs.animationName !== 'none' && cs.animationDuration.split(',').some(v => parseFloat(v) > 0)) out.push(`${el.className || el.tagName}${pseudo || ''} animation ${cs.animationName} ${cs.animationDuration}`); }
      return out; }));
    assert.deepEqual(moving, [], 'reduced motion leaves a duration');
    await nudge(r.page);
    assert.deepEqual(await r.page.evaluate(() => { window.__nexo.handle.tidy(); return [...document.querySelectorAll('.card')].map(el => el.style.transition).filter(Boolean); }), [], 'tidy animates under reduced motion');
    assert.deepEqual(r.errors, []);
    await reduced.close();
    console.log(`PASS R17 ${name} motion-tokens-easing-reduced-motion-zero`);
  } finally { await browser.close(); }
}

let base;
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP H7c Playwright: ${e.message}`); return; } throw e; }
  fs.mkdirSync(shots, { recursive: true });
  assert(fs.existsSync(axePath), 'axe-core is missing: run npm ci in frontends/nexo');
  run('sh', ['scripts/vendor-plotly.sh']);
  run('npm', ['run', 'build'], { VITE_API_MOCK: '1' });
  const pw = require(require.resolve('@playwright/test', { paths: [ci] }));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(p), '--strictPort'], { cwd: nexo, stdio: 'ignore' });
  base = `http://127.0.0.1:${p}`;
  const deadline = Date.now() + 30000;
  while (true) {
    try { const r = await fetch(`${base}/nexo/`); if (r.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('preview server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
  const findings = [];
  for (const name of (process.env.NEXO_BROWSERS || 'chromium,webkit').split(',')) {
    await phoneReadOnly(pw, name, findings);
    await tablets(pw, name);
    await desktop(pw, name, findings);
    await keyboard(pw, name);
    await motion(pw, name);
  }
  console.log(`axe moderate/minor findings: ${findings.length}`);
  console.log('H7c OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
