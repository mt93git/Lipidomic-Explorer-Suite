// Run with: node tests/dual-ui/test_team_inspector_autoopen.cjs
// ux35: in Draft, with the inspector hidden, a click on a card shows it and selects the card
// (inspector_toggle.js + canvas_inspector.js). Empty canvas, a drag, a card button and the Figure page do not.
'use strict';
const assert = require('node:assert/strict');
const {chromium} = require('../browser/ci/node_modules/playwright');
const F = require('./fixture_team_overlay_pages.cjs');

const state = page => page.evaluate(() => ({
  hidden: document.querySelector('#team-canvas-root .tc-layout').classList.contains('ts-inspector-collapsed'),
  selected: !!document.querySelector('#team-canvas-root .tc-node[data-plot-id="p1"].is-selected')
}));
const hide = async page => { if (!(await state(page)).hidden) await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page); };

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await F.install(page);
    await F.setupWorkspace(page, {companion: 'default'});
    assert.equal((await state(page)).hidden, true, 'starts hidden (ux27)');
    const card = page.locator('#team-canvas-root .tc-node[data-plot-id="p1"]');
    const plot = card.locator('#p1');

    // Empty canvas: stays hidden.
    const board = await page.locator('#team-canvas-root .tc-scroll').boundingBox();
    const box = await card.boundingBox();
    await page.mouse.click(box.x + box.width + 40, box.y + 20); await F.settle(page);
    assert.equal((await state(page)).hidden, true, 'empty canvas click keeps it hidden');
    assert.ok(board, 'canvas shown');

    // Drag (pointer moved between down and up on the card): stays hidden.
    const head = await card.locator('.tc-node-head strong').boundingBox();
    await page.mouse.move(head.x + 5, head.y + 5); await page.mouse.down();
    await page.mouse.move(head.x + 25, head.y + 15, {steps: 5}); await page.mouse.up(); await F.settle(page);
    assert.equal((await state(page)).hidden, true, 'a drag on the card keeps it hidden');

    // A card button: the click is not swallowed, the inspector stays as it was.
    let clicks = 0; await page.exposeFunction('countClick', () => { clicks++; });
    await page.evaluate(() => document.querySelector('#team-canvas-root .tc-node[data-plot-id="p1"] .tc-node-head button:nth-of-type(2)').addEventListener('click', () => window.countClick()));
    await card.locator('.tc-node-head button', {hasText: 'Duplicate'}).click(); await F.settle(page);
    assert.equal(clicks, 1, 'card button click delivered');
    assert.equal((await state(page)).hidden, true, 'card button does not open it');

    // A click inside the plot: opens and selects the card; no default prevented.
    const prevented = page.evaluate(() => new Promise(r => document.addEventListener('click', e => r(e.defaultPrevented), {once: true})));
    await plot.click(); await F.settle(page);
    assert.equal(await prevented, false, 'plot click not prevented');
    assert.deepEqual(await state(page), {hidden: false, selected: true}, 'card click shows the inspector with the card selected');

    // Hidden by hand: stays hidden until the next card click.
    await hide(page);
    await page.mouse.click(box.x + box.width + 40, box.y + 20); await F.settle(page);
    assert.equal((await state(page)).hidden, true, 'stays hidden after a manual hide');
    await plot.click(); await F.settle(page);
    assert.equal((await state(page)).hidden, false, 'next card click shows it again');

    // Hotfix 36: shown by a card click is not remembered: leaving Canvas and coming back starts hidden again.
    await page.evaluate(() => { document.body.dataset.teamStage = 'review'; }); await F.settle(page);
    await page.evaluate(() => { document.body.dataset.teamStage = 'canvas'; }); await F.settle(page);
    assert.equal((await state(page)).hidden, true, 'Canvas re-entry starts hidden after a card-click open');
    // ux39: even an explicit Show inspector is not carried over: every Canvas entry starts hidden.
    await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
    assert.equal((await state(page)).hidden, false, 'Show inspector shows it');
    await page.evaluate(() => { document.body.dataset.teamStage = 'review'; }); await F.settle(page);
    await page.evaluate(() => { document.body.dataset.teamStage = 'canvas'; }); await F.settle(page);
    assert.equal((await state(page)).hidden, true, 'Canvas re-entry starts hidden even after Show inspector');

    // Figure page (Preview): no effect. The Draft panel is hidden there, so the click is dispatched.
    await hide(page);
    await F.figurePage(page);
    assert.equal((await state(page)).hidden, true, 'hidden on the Figure page');
    await plot.dispatchEvent('click'); await F.settle(page);
    assert.equal((await state(page)).hidden, true, 'no effect on the Figure page');

    assert.deepEqual(errors, []);
    console.log('PASS inspector auto-open: card click opens (not carried over a Canvas re-entry); empty canvas, drag, card buttons and Figure page do not');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
