// ux18: the Canvas zoom pill, the minimap and the companion. At 1280, 1440 and 1512 px on the Team workspace
// fixture (real Team assets as R/frontends/team wires them): the slim zoom pill [grip | − | % | + | Fit] stays one
// 32 px line ("Fit" never wraps), the grip is its own segment (over no button), the zoom/minimap cluster sits
// bottom-left and never under the companion, which is small (80 px) at the foot of its home, bottom-right of the page, on Canvas. The
// Plot library starts collapsed, no automatic companion tip opens on Canvas, and + / − / Shift+1 work.
const assert = require('node:assert/strict');
const {chromium} = require('../browser/ci/node_modules/playwright');
const F = require('./fixture_team_overlay_pages.cjs');
const APP_LIKE = '#team-canvas-root.ts-shell .tc-layout{height:calc(100dvh - 108px)!important;min-height:0!important}';
const meets = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const measure = page => page.evaluate(() => {
  const box = n => { if (!n || !n.getClientRects().length || getComputedStyle(n).visibility === 'hidden') return null; const r = n.getBoundingClientRect(); return {left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height}; };
  const nav = document.querySelector('#team-canvas-root .tc-navigation'), pill = nav.querySelector('.tc-zoom-controls');
  const fit = pill.querySelector('.tc-zoom-fit'), grip = pill.querySelector('.tc-map-grip');
  // Lines the Fit label takes: distinct line boxes of its text.
  const range = document.createRange(); range.selectNodeContents(fit.querySelector('.tc-zoom-fit-label'));
  const lines = new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
  const buttons = [...pill.querySelectorAll('button')].filter(b => b !== grip).map(box);
  const shell = box(document.querySelector('#team-canvas-root .tc-viewport-shell'));
  return {nav: box(nav), map: box(nav.querySelector('.tc-map')), pill: box(pill), fit: box(fit), fitLines: lines, fitName: fit.getAttribute('aria-label'),
    grip: box(grip), buttons, shell, dock: box(document.getElementById('lipidomic-companion')),
    speech: !!document.querySelector('.companion-speech'), libraryHidden: document.querySelector('#team-canvas-root .tc-layout').classList.contains('tc-library-hidden'),
    zoom: document.querySelector('#team-canvas-root .tc-zoom-reset').textContent, scale: window.TeamCanvasViewport.scale,
    gate: !!(window.LipidomicAssistant && window.LipidomicAssistant.isNudgeBlocked())};
});

(async () => {
  const browser = await chromium.launch({headless: true});
  const out = [];
  try {
    for (const [width, height] of [[1280, 800], [1440, 900], [1512, 860]]) {
      const page = await browser.newPage({viewport: {width, height}});
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await F.install(page);
      await F.setupWorkspace(page, {companion: 'default'});
      await page.addStyleTag({content: APP_LIKE}); await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await F.settle(page);
      const tag = `@${width}`;
      let m = await measure(page);
      assert.equal(m.libraryHidden, true, `${tag}: the Plot library starts collapsed`);
      assert.equal(m.gate, true, `${tag}: no automatic companion tip on Canvas`);
      // A context change would open the screen tip elsewhere; on Canvas it stays closed.
      await page.evaluate(() => window.LipidomicHelp && window.LipidomicHelp.setContext({step: 4, tool: ''}));
      await page.evaluate(() => window.LipidomicHelp && window.LipidomicHelp.setContext({step: 5, tool: ''}));
      await page.waitForTimeout(400); m = await measure(page);
      assert.equal(m.speech, false, `${tag}: no companion tip opened over the canvas`);
      // Zoomed out on figures larger than the view: the minimap shows above the pill.
      await page.evaluate(() => window.TeamCanvasViewport.setScale(.45)); await F.settle(page);
      m = await measure(page);
      assert.ok(m.map, `${tag}: the minimap is shown when zoomed out on overflowing figures`);
      assert.ok(m.dock && Math.round(m.dock.width) === 80, `${tag}: the companion is the small 80 px dock on Canvas ${JSON.stringify(m.dock)}`);
      // ux27: the companion is anchored to the canvas viewport's bottom-right corner (inside it, not in a strip beside it).
      assert.ok(m.dock.right <= m.shell.right + 1 && m.shell.right - m.dock.right <= 48 && m.dock.bottom >= height - 24, `${tag}: the companion rests at the canvas viewport's bottom-right ${JSON.stringify([m.dock, m.shell])}`);
      for (const part of ['nav', 'map', 'pill']) assert.equal(meets(m[part], m.dock), false, `${tag}: ${part} is not under the companion ${JSON.stringify([m[part], m.dock])}`);
      assert.ok(m.nav.left - m.shell.left <= 24 && m.shell.bottom - m.nav.bottom <= 24, `${tag}: the zoom/minimap cluster is docked bottom-left ${JSON.stringify([m.nav, m.shell])}`);
      assert.ok(m.pill.height <= 34, `${tag}: the zoom pill is one slim line (${m.pill.height}px)`);
      assert.equal(m.fitLines, 1, `${tag}: "Fit" stays on one line`);
      assert.ok(m.fit.height <= 32, `${tag}: the Fit button is not wrapped (${m.fit.height}px)`);
      assert.equal(m.fitName, 'Fit all', `${tag}: Fit keeps its accessible name`);
      for (const b of m.buttons) assert.equal(meets(m.grip, b), false, `${tag}: the grip is over no button ${JSON.stringify([m.grip, b])}`);
      assert.ok(m.buttons.every(b => Math.abs(b.top - m.buttons[0].top) < 1 && Math.abs(b.height - m.buttons[0].height) < 1), `${tag}: the pill's buttons share one row and height`);
      // Fit all frames the figures; + / − and Shift+1 work while focus is not in a field.
      await page.locator('#team-canvas-root .tc-zoom-fit').click(); await F.settle(page);
      const fitted = (await measure(page)).scale;
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press('+'); await F.frames(page);
      assert.ok((await measure(page)).scale > fitted, `${tag}: + zooms in`);
      await page.keyboard.press('Shift+Digit1'); await F.frames(page);
      assert.ok(Math.abs((await measure(page)).scale - fitted) < 1e-6, `${tag}: Shift+1 fits all`);
      await page.keyboard.press('-'); await F.frames(page);
      assert.ok((await measure(page)).scale < fitted, `${tag}: − zooms out`);
      await page.evaluate(() => { const i = document.createElement('input'); i.id = 'ux18-field'; i.setAttribute('aria-label', 'Field'); i.style.cssText = 'position:fixed;left:300px;top:300px;z-index:99999'; document.body.appendChild(i); i.focus(); });
      assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'ux18-field', `${tag}: fixture field focused`);
      const typing = (await measure(page)).scale; await page.keyboard.press('+'); await F.frames(page);
      assert.equal((await measure(page)).scale, typing, `${tag}: + typed in a field does not zoom`);
      // Once the screen is no longer Canvas the companion's own gate is back (the tip can open on Review).
      assert.deepEqual(errors, [], `${tag}: no page errors`);
      out.push(`${tag} nav ${JSON.stringify([m.nav.left, m.nav.top, m.nav.width, m.nav.height].map(Math.round))} dock ${JSON.stringify([m.dock.left, m.dock.top, m.dock.width, m.dock.height].map(Math.round))} fit ${Math.round(m.fit.width)}x${Math.round(m.fit.height)}`);
      await page.close();
    }
  } finally { await browser.close(); }
  out.forEach(l => console.log('  ' + l));
  console.log('PASS canvas zoom pill one line, grip clear, cluster bottom-left and clear of the small bottom-right companion; library collapsed; no auto tip; shortcuts');
})().catch(e => { console.error(e); process.exit(1); });
