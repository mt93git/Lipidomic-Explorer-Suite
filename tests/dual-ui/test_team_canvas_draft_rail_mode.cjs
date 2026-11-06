// ux27: in the Draft, no button of the Canvas left rail (or the Draft toolbar) changes mode. Each shown rail
// button names its action in a tooltip; clicking it leaves the Draft as it is (no Figure page). Text and
// shapes, which exist only on the Figure page, are not offered in the Draft (they used to open the Figure page).
const assert = require('node:assert/strict');
const {chromium} = require('../browser/ci/node_modules/playwright');
const F = require('./fixture_team_overlay_pages.cjs');

const mode = page => page.evaluate(() => {
  const root = document.getElementById('team-canvas-root'), panel = document.getElementById('tc-preview-panel');
  return {figure: root.classList.contains('tc-figure-mode') || !!(panel && !panel.hidden && panel.getClientRects().length)};
});
const shown = n => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await F.install(page);
    await F.setupWorkspace(page, {companion: 'default'});
    assert.equal((await mode(page)).figure, false, 'fixture: Draft');
    const rail = await page.evaluate(() => [...document.querySelectorAll('#team-canvas-root .ts-rail button')]
      .filter(b => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden')
      .map((b, i) => ({i, label: b.getAttribute('aria-label') || b.textContent.trim(), title: b.title || ''})));
    assert.ok(rail.length >= 4, `rail buttons shown ${JSON.stringify(rail)}`);
    // The fixture does not load the Figure page's compose code, so the old jump cannot happen here; what is
    // checked is that the Draft offers no text/shape tool at all (rail or toolbar).
    assert.equal(rail.filter(b => /text|shape/i.test(b.label)).length, 0, `no text/shape tool on the Draft rail ${JSON.stringify(rail)}`);
    const toolbarText = await page.evaluate(() => [...document.querySelectorAll('#team-canvas-root .ts-tools > button')].filter(b => b.getClientRects().length && /^(text|shapes)$/i.test(b.textContent.trim())).map(b => b.textContent.trim()));
    assert.deepEqual(toolbarText, [], 'no Text / Shapes in the Draft toolbar');
    // The toolbar's overflow menu (⋯) items of the same tools are figure-only as well (shown when compact).
    const menuText = await page.evaluate(() => [...document.querySelectorAll('#team-canvas-root .ts-menu-item')].filter(b => /^(text|shapes)$/i.test(b.textContent.trim())).map(b => [b.textContent.trim(), b.dataset.figureOnly === 'true', getComputedStyle(b).display]));
    assert.ok(menuText.length === 2 && menuText.every(([, f, d]) => f && d === 'none'), `no Text / Shapes in the Draft overflow menu ${JSON.stringify(menuText)}`);
    const results = [];
    for (const b of rail) {
      assert.ok(b.title.trim().length > 0, `rail button "${b.label}" has a tooltip`);
      await page.evaluate(i => [...document.querySelectorAll('#team-canvas-root .ts-rail button')].filter(b => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden')[i].click(), b.i);
      await F.settle(page);
      const m = await mode(page); results.push(`${b.label}: ${m.figure ? 'FIGURE PAGE' : 'Draft'}`);
      assert.equal(m.figure, false, `rail "${b.label}" keeps the Draft`);
      // Close whatever it opened (Esc), so the next button starts from the same Draft.
      await page.keyboard.press('Escape'); await F.settle(page);
    }
    // Draft toolbar: no Text / Shapes (Figure page tools) offered.
    const figureOnly = await page.evaluate(() => [...document.querySelectorAll('#team-canvas-root [data-figure-only=true]')].filter(n => n.getClientRects().length).map(n => n.textContent.trim() || n.getAttribute('aria-label')));
    assert.deepEqual(figureOnly, [], `figure-page-only tools shown in the Draft: ${figureOnly}`);
    // The explicit control still opens the Figure page (that is the only way in).
    await F.figurePage(page);
    assert.equal((await mode(page)).figure, true, 'the Figure page still opens from its own control');
    // (The fixture hides the Draft panel that holds the rail; the app's embedInShell keeps the rail. The
    // rule itself is what is checked: on the Figure page it no longer removes the button.)
    const t = await page.evaluate(() => { const b = document.querySelector('#team-canvas-root .ts-rail [data-figure-only=true]'); return !!b && getComputedStyle(b).display !== 'none'; });
    assert.equal(t, true, 'on the Figure page the rail offers Text & shapes');
    assert.deepEqual(errors, []);
    results.forEach(r => console.log('  ' + r));
    console.log('PASS Draft rail: every button has a tooltip and keeps the Draft; text/shapes only on the Figure page');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
