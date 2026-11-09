// H2 F: mock canvas editing using real pointers in Chromium and WebKit.
// node tests/dual-ui/test_nexo_canvas_edit.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const checkpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id;
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
// The world point at the centre of the viewport and the scale, rounded: the overview a focus returns to.
const viewCentre = page => page.evaluate(() => { const v = document.querySelector('#viewport'), m = document.querySelector('#world').style.transform.match(/translate\(([-\d.e]+)px, ?([-\d.e]+)px\) scale\(([\d.e]+)\)/);
  const [x, y, s] = m.slice(1).map(Number); return `${Math.round((v.clientWidth / 2 - x) / s)},${Math.round((v.clientHeight / 2 - y) / s)}@${s.toFixed(4)}`; });
const percent = page => page.$eval('#hud', el => el.textContent.split('|')[1].trim());
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
async function focus(page) { await page.locator('#viewport').focus(); }
async function undo(page) { await focus(page); await page.keyboard.press('Control+z'); }
async function drag(page, id, dx, dy, resize = false) {
  const box = await card(page, id).locator(resize ? '.resize-handle' : 'header').boundingBox();
  assert(box, 'missing drag target');
  const x = box.x + (resize ? box.width / 2 : 40), y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up();
}
async function browserTests(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');
    const original = await nodes(page), id = original[0].id, neighbour = original[1].id;
    const initialCamera = await camera(page), initialPercent = await percent(page);
    assert.equal(initialPercent, '100%');
    await drag(page, id, 200, 0);
    const dropped = await nodes(page), a = dropped.find(n => n.id === id), b = dropped.find(n => n.id === neighbour);
    assert.equal(a.x, original[0].x + 200);
    assert.equal(a.y, original[0].y);
    assert(b.x >= a.x + a.width + 20 || a.x >= b.x + b.width + 20 || b.y >= a.y + a.height + 20 || a.y >= b.y + b.height + 20, 'neighbour did not settle with a 20 px gap');
    assert.equal(await camera(page), initialCamera); assert.equal(await percent(page), initialPercent);
    await undo(page); assert.deepEqual(await nodes(page), original);
    console.log(`PASS H2F ${name} header-drag-store-settle-single-undo-camera`);
    // Inspector Size: an exact width in px resizes the card (canvas v1 w/h) as one undo step.
    await card(page, id).locator('header').click();
    await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
    const widthField = page.getByRole('spinbutton', { name: 'Width (px)', exact: true });
    await widthField.fill('640'); await widthField.press('Enter');
    await page.waitForFunction(nodeId => window.__nexo.store.get().nodes.find(n => n.id === nodeId).width === 640, id);
    assert.equal(Math.round(await card(page, id).evaluate(el => parseFloat(el.style.width))), 640);
    await undo(page); assert.deepEqual(await nodes(page), original);
    console.log(`PASS H2F ${name} inspector-size-width-single-undo`);
    // F1/F2 Size & position: a width typed in mm (96 px/in) resizes the card, one undo; exact X moves it, one undo.
    await card(page, id).locator('header').click();
    await page.getByRole('group', { name: 'Units', exact: true }).getByRole('button', { name: 'mm', exact: true }).click();
    const mmField = page.getByRole('spinbutton', { name: 'Width (mm)', exact: true });
    await mmField.fill('120'); await mmField.press('Enter');
    await page.waitForFunction(nodeId => window.__nexo.store.get().nodes.find(n => n.id === nodeId).width === 454, id);
    await undo(page); assert.deepEqual(await nodes(page), original);
    await page.getByRole('group', { name: 'Units', exact: true }).getByRole('button', { name: 'px', exact: true }).click();
    const xField = page.getByRole('spinbutton', { name: 'X (px)', exact: true });
    await xField.fill(String(original[0].x + 5)); await xField.press('ArrowUp'); await xField.press('Enter');
    await page.waitForFunction(([nodeId, x]) => window.__nexo.store.get().nodes.find(n => n.id === nodeId).x === x, [id, original[0].x + 6]);
    await undo(page); assert.deepEqual(await nodes(page), original);
    console.log(`PASS H2F ${name} inspector-size-mm-and-position-single-undo`);

    await card(page, id).locator('header').click();
    await page.keyboard.press('Shift+ArrowRight');
    assert.equal((await nodes(page)).find(n => n.id === id).width, original[0].width + 10);
    await undo(page);
    await drag(page, id, 30, 20, true);
    const resized = (await nodes(page)).find(n => n.id === id);
    assert.equal(resized.width, original[0].width + 30); assert.equal(resized.height, original[0].height + 20);
    await undo(page);
    console.log(`PASS H2F ${name} keyboard-and-corner-resize`);

    await card(page, id).locator('header').click(); await page.keyboard.press('Delete');
    assert(!(await nodes(page)).some(n => n.id === id));
    assert.equal(await card(page, id).count(), 0);
    await undo(page); assert.deepEqual(await nodes(page), original);
    assert.equal(await camera(page), initialCamera); assert.equal(await percent(page), initialPercent);
    console.log(`PASS H2F ${name} delete-undo`);

    await card(page, id).locator('header').click(); await page.keyboard.press('Control+d');
    await page.waitForFunction(n => window.__nexo.store.get().nodes.length === n + 1, original.length);
    const copy = (await nodes(page)).find(n => !original.some(o => o.id === n.id));
    assert.match(copy.instance.instanceId, /^tcinstance_[0-9a-f]{12}$/);
    assert.equal(copy.instance.source, id); assert.equal(copy.x, original[0].x + 24); assert.equal(copy.y, original[0].y + 24);
    await undo(page); assert.deepEqual(await nodes(page), original);
    console.log(`PASS H2F ${name} duplicate-undo`);

    // H8d: Paste plot is disabled until a card's settings are copied; Ctrl+C then the toolbar Paste adds one card with the same source.
    await page.getByRole('button', { name: 'Canvas tools', exact: true }).click();
    assert(await page.getByRole('button', { name: 'Paste plot', exact: true }).isDisabled());
    await page.keyboard.press('Escape');
    await card(page, id).locator('header').click(); await page.keyboard.press('Control+c');
    await page.getByRole('button', { name: 'Canvas tools', exact: true }).click();
    await page.getByRole('button', { name: 'Paste plot', exact: true }).click();
    await page.waitForFunction(n => window.__nexo.store.get().nodes.length === n + 1, original.length);
    const pasted = (await nodes(page)).find(n => !original.some(o => o.id === n.id));
    assert.equal(pasted.instance.source, original[0].instance?.source ?? id);
    await page.locator('.toast', { hasText: 'Pasted as a new card' }).waitFor({ timeout: 3000 });
    await undo(page); assert.deepEqual(await nodes(page), original);
    console.log(`PASS H8d ${name} copy-paste-plot`);

    // Add at 25% also catches the former add-card minimum zoom/recentering. The library opens closed (wave 1).
    if (await page.locator('.library-panel').isHidden()) await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click();
    await page.evaluate(() => { const z = document.querySelector('#zoom'); z.value = '0.25'; z.dispatchEvent(new Event('change')); });
    // The canvas opens fitted, so the free slot may lie outside the view: adding may pan to it (reveal) but
    // never zooms, and the new card lands clear of the floating library. Undo leaves the camera where it is.
    await page.getByRole('button', { name: 'Add Principal components', exact: true }).click();
    await page.waitForFunction(n => window.__nexo.store.get().nodes.length === n + 1, original.length);
    await page.waitForTimeout(400); assert.equal(await percent(page), '25%');
    { const added = (await nodes(page)).find(n => !original.some(o => o.id === n.id));
      const [box, lib, vp] = await Promise.all([card(page, added.id).boundingBox(), page.locator('.library-panel').boundingBox(), page.locator('#viewport').boundingBox()]);
      assert(box.x >= lib.x + lib.width && box.x + box.width <= vp.x + vp.width && box.y >= vp.y && box.y + box.height <= vp.y + vp.height, 'new card in view, clear of the library'); }
    const lowCamera = await camera(page);
    await undo(page); assert.equal(await percent(page), '25%'); assert.equal(await camera(page), lowCamera);
    console.log(`PASS H2F ${name} library-add-undo-preserves-camera`);

    // H8d: Shift+0 and the zoom bar "100%" reset to 100 %; Shift+1 fits.
    await focus(page); await page.keyboard.press('Shift+Digit0'); assert.equal(await percent(page), '100%');
    await page.evaluate(() => { const z = document.querySelector('#zoom'); z.value = '0.5'; z.dispatchEvent(new Event('change')); });
    await page.locator('.zoom-pill').getByRole('button', { name: '100%', exact: true }).click(); assert.equal(await percent(page), '100%');
    await focus(page); await page.keyboard.press('Shift+Digit1');
    const fitted = await camera(page); await page.locator('.zoom-pill').getByRole('button', { name: 'Fit', exact: true }).click();
    assert.equal(await camera(page), fitted);
    await focus(page); await page.keyboard.press('Shift+Digit0'); assert.equal(await percent(page), '100%');
    console.log(`PASS H8d ${name} zoom-shortcuts`);

    // H8 add feedback: a placeholder holds the slot while the API answers; the new card ends in view,
    // highlighted, marked on the minimap; the library's "on canvas" link brings it back after panning away.
    await page.evaluate(() => { window.__ghost = false; new MutationObserver(m => { if (m.some(r => [...r.addedNodes].some(n => n.classList?.contains('card-ghost')))) window.__ghost = true; }).observe(document.querySelector('#world'), { childList: true }); });
    await page.evaluate(() => window.__nexo.handle.zoomTo(1.6));
    const beforeAdd = (await nodes(page)).map(n => n.id);
    await page.getByRole('button', { name: 'Add Signal distribution', exact: true }).click();
    await page.waitForFunction(n => window.__nexo.store.get().nodes.length === n + 1, beforeAdd.length);
    const added = (await nodes(page)).find(n => !beforeAdd.includes(n.id)); await page.waitForTimeout(400); // the pan animates for 260 ms
    assert.equal(await page.evaluate(() => window.__ghost), true, 'a placeholder appeared while adding');
    assert.equal(await page.locator('.card-ghost').count(), 0, 'the placeholder is gone once the card exists');
    const inView = async nodeId => page.evaluate(nodeId => { const v = document.querySelector('#viewport').getBoundingClientRect(), h = document.querySelector(`.card[data-id="${nodeId}"] header`).getBoundingClientRect();
      return h.left >= v.left && h.right <= v.right && h.top >= v.top && h.bottom <= v.bottom; }, nodeId);
    assert.equal(await inView(added.id), true, 'the new card header is inside the viewport');
    assert.equal(await card(page, added.id).evaluate(el => el.classList.contains('just-added')), true);
    assert.equal(await page.locator('#minimap rect.node.selected').count(), 1);
    await page.evaluate(() => window.__nexo.handle.zoomTo(4));
    await page.evaluate(() => window.__nexo.handle.zoomTo(4));
    await page.getByRole('button', { name: 'Added · 1 on canvas: Show Signal distribution on the canvas', exact: true }).click(); await page.waitForTimeout(400);
    assert.equal(await inView(added.id), true, 'the library link brings the card into view');
    assert.equal(await card(page, added.id).evaluate(el => el.classList.contains('selected')), true);
    await undo(page);
    await page.evaluate(nodeId => window.__nexo.handle.focusNode(nodeId), id); await page.waitForTimeout(400);
    console.log(`PASS H8 ${name} add-placeholder-reveal-highlight-minimap-locate`);

    // H8d, pilot F1: rail Palettes opens Team's session palette (every group-coloured card), pressed while open, and
    // closes it again; Text & shapes focuses the Figure page add controls.
    await card(page, id).locator('header').click();
    const palettesButton = page.locator('nav.rail').getByRole('button', { name: 'Palettes', exact: true });
    await palettesButton.click();
    const sessionPalette = page.getByRole('dialog', { name: 'Colors & palettes', exact: true });
    await sessionPalette.getByRole('group', { name: 'Choose a palette', exact: true }).getByRole('button', { name: /^Default/ }).waitFor();
    assert.equal(await palettesButton.getAttribute('aria-pressed'), 'true');
    await palettesButton.click(); await sessionPalette.waitFor({ state: 'detached' });
    await page.locator('nav.rail').getByRole('button', { name: 'Text & shapes', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.textContent === 'Add text');
    await page.getByRole('button', { name: '← Draft', exact: true }).click();
    console.log(`PASS H8d ${name} rail-palettes-text`);
    await page.getByRole('button', { name: 'Tidy up', exact: true }).click();
    assert.notDeepEqual(await nodes(page), original); await undo(page); assert.deepEqual(await nodes(page), original);
    // H8 journeys 5.4: align and distribute the selected cards from Canvas tools; one undo step.
    await page.evaluate(() => window.__nexo.handle.fit());
    const [first, second] = original.filter(n => n.kind !== 'illustration');
    await card(page, first.id).locator('header').click(); await card(page, second.id).locator('header').click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: 'Canvas tools', exact: true }).click();
    const arrange = page.getByRole('group', { name: 'Arrange selected cards', exact: true });
    assert.equal(await arrange.getByRole('button', { name: 'Distribute horizontally', exact: true }).isDisabled(), true);
    await arrange.getByRole('button', { name: 'Align top edges', exact: true }).click();
    await page.waitForFunction(([x, y]) => { const n = window.__nexo.store.get().nodes; return n.find(v => v.id === x).y === n.find(v => v.id === y).y; }, [first.id, second.id]);
    assert.equal((await nodes(page)).find(n => n.id === first.id).y, Math.min(first.y, second.y));
    await undo(page); assert.deepEqual(await nodes(page), original);
    console.log(`PASS H8 ${name} align-distribute-selected-from-canvas-tools`);
    await page.getByRole('button', { name: 'Canvas tools', exact: true }).click();
    await page.getByRole('button', { name: 'Remove all', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    assert.equal((await nodes(page)).length, 0); await undo(page); assert.deepEqual(await nodes(page), original);
    console.log(`PASS H2F ${name} toolbar-tidy-remove-all-undo`);
    // H8 journeys 2.2/2.3: gated library rows say why inline and how to unlock them.
    if (await page.locator('.library-panel').isHidden()) await page.locator('.rail').getByRole('button', { name: 'Plots', exact: true }).click(); // a canvas click closed it (wave 1)
    await page.evaluate(() => document.querySelectorAll('#library-panel-plots details').forEach(d => { d.open = true; }));
    const gatedRow = page.locator('#library-panel-plots .library-row', { has: page.locator('strong', { hasText: /^Differential volcano$/ }) });
    assert.match(await gatedRow.locator('small').textContent(), /^Requires configuration · Confirm study design…$/);
    const timeRow = page.locator('#library-panel-plots .library-row', { has: page.locator('strong', { hasText: /^Time course · main class$/ }) });
    assert.match(await timeRow.locator('small').textContent(), /^Unavailable · needs two or more time points$/);
    await gatedRow.getByRole('button', { name: 'Confirm study design… (Differential volcano)', exact: true }).click();
    const design = page.getByRole('dialog', { name: 'Confirm study design', exact: true }); await design.waitFor();
    await page.keyboard.press('Escape'); await design.waitFor({ state: 'hidden' });
    console.log(`PASS H8 ${name} library-gated-rows-inline-reason-and-link`);
    // Click to focus: below 50 % (live threshold) a plain click on a card brings it up to work on; "Back to overview" returns.
    await page.evaluate(() => window.__nexo.handle.zoomTo(0.25));
    const centre = await viewCentre(page), target = (await nodes(page))[0].id;
    await card(page, target).locator('.body').click();
    await page.waitForFunction(() => parseInt(document.querySelector('#hud').textContent.split('|')[1]) > 40);
    await page.waitForTimeout(400);
    { const box = await card(page, target).boundingBox(), view = await page.locator('#viewport').boundingBox();
      assert.ok(box.x >= view.x - 1 && box.y >= view.y - 1 && box.x + box.width <= view.x + view.width + 1 && box.y + box.height <= view.y + view.height + 1, 'the focused card fits the view'); }
    const back = page.getByRole('button', { name: 'Back to overview', exact: true });
    await back.click();
    await page.waitForTimeout(400);
    assert.equal(await viewCentre(page), centre, 'back to the same overview');
    assert.equal(await back.isVisible(), false);
    const overviewBack = await camera(page);
    // Shift+click selects without moving the camera.
    await card(page, target).locator('.body').click({ modifiers: ['Shift'] });
    await page.waitForTimeout(300);
    assert.equal(await camera(page), overviewBack, 'Shift+click keeps the camera');
    // Esc after a focus: first clears the selection, then goes back to the overview.
    await card(page, target).locator('.body').click();
    await page.waitForFunction(() => parseInt(document.querySelector('#hud').textContent.split('|')[1]) > 40);
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    assert.equal(await viewCentre(page), centre, 'Esc returns to the overview');
    assert.equal(await back.isVisible(), false);
    console.log(`PASS H9 ${name} click-to-focus-low-zoom-back-to-overview`);
    // Review R03: focus starts where plots stop being live (50 %), and Enter on a focused card does the same.
    await page.evaluate(() => window.__nexo.handle.zoomTo(0.45));
    const centre45 = await viewCentre(page);
    await card(page, target).locator('.body').click();
    await back.waitFor(); await page.waitForTimeout(400);
    assert.ok(parseInt(await page.locator('#hud').textContent().then(t => t.split('|')[1])) > 45, 'a click at 45 % focuses the card');
    await back.click(); await page.waitForTimeout(400);
    assert.equal(await viewCentre(page), centre45, 'back from 45 %');
    await page.evaluate(() => window.__nexo.handle.zoomTo(0.25));
    const centreKey = await viewCentre(page);
    await card(page, target).focus(); await page.keyboard.press('Enter');
    await back.waitFor(); await page.waitForTimeout(400);
    assert.equal(await card(page, target).getAttribute('class').then(c => c.includes('selected')), true, 'Enter selects the card');
    assert.ok(parseInt(await page.locator('#hud').textContent().then(t => t.split('|')[1])) > 40, 'Enter focuses the card');
    await back.click(); await page.waitForTimeout(400);
    assert.equal(await viewCentre(page), centreKey, 'back after Enter');
    console.log(`PASS H9 ${name} focus-threshold-50-and-enter`);
    assert.deepEqual(errors, []); console.log(`PASS H2F ${name} no-console-errors`);
    await context.close();
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP H2F Playwright: ${e.message}`); return; } throw e; }
  run('sh', ['scripts/vendor-plotly.sh']);
  run('npm', ['run', 'build'], { VITE_API_MOCK: '1' });
  const pw = require(require.resolve('@playwright/test', { paths: [ci] }));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(p), '--strictPort'], { cwd: nexo, stdio: 'ignore' });
  const base = `http://127.0.0.1:${p}`;
  const deadline = Date.now() + 30000;
  while (true) {
    try { const r = await fetch(`${base}/nexo/`); if (r.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('preview server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
  for (const name of ['chromium', 'webkit']) await browserTests(pw, name, base);
  console.log('H2F OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
