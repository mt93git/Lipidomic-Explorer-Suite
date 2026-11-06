// Run with: node tests/dual-ui/test_team_canvas_gesture.cjs
// ux40 gesture mode (canvas_viewport.js, card_figure.js, canvas_viewport.css), real wheel and real clicks, Chromium + WebKit,
// Canvas zoom 50 %, 100 % and 150 %:
// - from the first wheel until ~150 ms after the last, the root carries .tc-gesturing: the plot shows its cached
//   bitmap (made once by Plotly.toImage, again only after it re-renders) instead of its live DOM, card toolbars hide
//   and are not re-placed; afterwards the live plot is back, pixel-identical and untouched;
// - a click on an unselected card opens the inspector and glides the camera to centre/fit the card left of the
//   inspector; a click on the selected card, a drag or a card control does nothing; Esc, a click on empty canvas and
//   Hide inspector restore the previous view. ⋯ → Remove itself is test_team_canvas_remove_zoom.cjs (needs canvas.js);
// - zoom buttons, + key, Fit and the minimap stop a glide: the camera stays where the person put it;
// - a cached bitmap's blob URL is revoked when its decode fails and when its card leaves the board.
'use strict';
const assert = require('node:assert/strict');
const pw = require('../browser/ci/node_modules/playwright');
const F = require('./fixture_team_overlay_pages.cjs');

const ROOT = '#team-canvas-root';
// p1 becomes a mock Plotly plot: a drawn SVG, gd.on/emit, and a counting Plotly.toImage.
async function mockPlot(page) {
  await page.evaluate(() => {
    const gd = document.getElementById('p1'); gd.classList.add('js-plotly-plot'); gd.style.background = '';
    gd.innerHTML = '<div class="plot-container plotly"><div class="svg-container" style="position:relative;width:400px;height:200px"><svg class="main-svg" xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#fff"/><circle cx="110" cy="100" r="50" fill="#315c89"/><rect x="220" y="50" width="120" height="100" fill="#c0392b"/></svg></div></div>';
    gd._fullLayout = {width: 400, height: 200}; const on = {};
    gd.on = (n, f) => { (on[n] = on[n] || []).push(f); }; gd.emit = n => (on[n] || []).forEach(f => f());
    window.toImageCalls = 0;
    window.Plotly = {toImage: async (g, o) => { window.toImageCalls++; return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}"><rect width="100%" height="100%" fill="#fff"/><circle cx="110" cy="100" r="50" fill="#315c89"/></svg>`); }};
    TeamCanvasViewport.refresh();
  });
  await page.waitForFunction(() => document.getElementById('p1').classList.contains('tc-has-bitmap'), null, {timeout: 5000});
}
const view = page => page.evaluate(() => { const s = document.querySelector('#team-canvas-root .tc-scroll'); return {scale: TeamCanvasViewport.scale, x: s.scrollLeft, y: s.scrollTop}; });
const ended = page => page.waitForFunction(() => !document.getElementById('team-canvas-root').classList.contains('tc-gesturing'), null, {timeout: 3000});
const near = (a, b, msg) => { assert(Math.abs(a.scale - b.scale) < 1e-6 && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1, `${msg}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); };
// The camera put back where it was (the glide ends in ~200 ms; the gesture class ~150 ms after).
const settled = async page => { await page.waitForTimeout(260); await ended(page); await F.frames(page); };

async function gestureCase(page, type, z) {
  const tag = `${type} @${z * 100}%`;
  await page.evaluate(z => { TeamCanvasViewport.setScale(z); const s = document.querySelector('#team-canvas-root .tc-scroll'); s.scrollLeft = 0; s.scrollTop = 0; }, z);
  await ended(page); await F.frames(page);
  const calls = await page.evaluate(() => window.toImageCalls);
  const plot = page.locator('#p1'), box = await plot.boundingBox();
  // The pointer rests on the plot for both pictures (hover shows the card toolbar).
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await F.frames(page);
  // The hover toolbar overlaps the plot's foot and is left out of both pictures: WebKit re-rasterizes it (and its
  // shadow) after the gesture's visibility toggle with 1-2/255 differences at its edges.
  const shoot = clip => page.screenshot({clip, style: `${ROOT} .tc-card-actions,body.ts-shell-app ${ROOT} .tc-node.tc-card-framed>.tc-node-head>.tc-card-actions.tc-card-docked{visibility:hidden!important}`});
  const before = {html: await page.evaluate(() => document.getElementById('p1').innerHTML), shot: await shoot(box)};
  // Toolbar placements made while the gesture runs (card_figure.js must not re-place them per frame).
  await page.evaluate(() => { window.barWrites = 0; window.barObserver = new MutationObserver(r => { if (document.getElementById('team-canvas-root').classList.contains('tc-gesturing')) window.barWrites += r.length; });
    document.querySelectorAll('#team-canvas-root .tc-card-actions').forEach(b => window.barObserver.observe(b, {attributes: true, attributeFilter: ['style', 'class']})); });
  // Chromium's mouse.wheel resolves before the page receives the event: the state is read as the wheel event ends
  // its dispatch (window, bubble phase: after the canvas's own listener), not on a timer the 150 ms gesture may outrun.
  await page.evaluate(() => { window.during = new Promise(res => window.addEventListener('wheel', () => {
    const root = document.getElementById('team-canvas-root'), gd = document.getElementById('p1'), bar = root.querySelector('.tc-card-actions');
    res({on: root.classList.contains('tc-gesturing'), plot: getComputedStyle(gd).visibility, bitmap: getComputedStyle(gd, '::before').backgroundImage,
      bitmapShown: getComputedStyle(gd, '::before').visibility, bar: bar ? getComputedStyle(bar).visibility : 'hidden',
      willChange: getComputedStyle(root.querySelector('.tc-board')).willChange});
  }, {once: true, passive: true})); });
  await page.mouse.wheel(0, 120);
  const during = await page.evaluate(() => window.during);
  assert.equal(during.on, true, `${tag}: wheel starts the gesture`);
  assert.equal(during.plot, 'hidden', `${tag}: live plot hidden during the gesture`);
  assert.match(during.bitmap, /url\("?blob:/, `${tag}: cached bitmap shown during the gesture`);
  assert.equal(during.bitmapShown, 'visible', `${tag}: bitmap visible`);
  assert.equal(during.bar, 'hidden', `${tag}: card toolbar hidden during the gesture`);
  assert.equal(during.willChange, 'transform', `${tag}: will-change only during the gesture`);
  await page.evaluate(() => { window.wheeled = new Promise(res => window.addEventListener('wheel', () => res(), {once: true, passive: true})); });
  await page.mouse.wheel(0, -120); await page.evaluate(() => window.wheeled);
  await ended(page); await F.frames(page);
  const after = await page.evaluate(() => { const gd = document.getElementById('p1'), b = document.querySelector('#team-canvas-root .tc-board'); window.barObserver.disconnect();
    return {html: gd.innerHTML, plot: getComputedStyle(gd).visibility, willChange: getComputedStyle(b).willChange, writes: window.barWrites, calls: window.toImageCalls}; });
  assert.equal(after.plot, 'visible', `${tag}: live plot back after the gesture`);
  assert.equal(after.html, before.html, `${tag}: live plot DOM untouched`);
  assert.equal(after.willChange, 'auto', `${tag}: will-change dropped after the gesture`);
  assert.equal(after.writes, 0, `${tag}: toolbars not re-placed during the gesture`);
  assert.equal(after.calls, calls, `${tag}: no new bitmap for a gesture`);
  assert(Buffer.compare(await shoot(await plot.boundingBox()), before.shot) === 0, `${tag}: chart identical after the gesture`);
}

// p2 sits far from the world's origin, so the camera can centre it. Each case starts from a view with p2 near the
// view's top-left corner, nothing selected and the inspector hidden. The fixture's 3200 × 2000 board ends just past
// p2, so at 50% the scroll clamps p2 to the view's right edge, under the inspector that Esc leaves open (empty):
// the board gets room beyond p2 so that view exists at every zoom.
async function startView(page, z) {
  await page.evaluate(() => { const b = document.querySelector('#team-canvas-root .tc-board'); if (b.offsetWidth < 6400) { b.style.width = '6400px'; b.style.height = '4000px'; TeamCanvasViewport.refresh(); } });
  // The first Esc may only close an open ⋯ menu; the second deselects.
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.evaluate(z => {
    const l = document.querySelector('#team-canvas-root .tc-layout'); if (!l.classList.contains('ts-inspector-collapsed')) document.querySelector('#team-canvas-root .ts-inspector-toggle').click();
    TeamCanvasViewport.setScale(z); const s = document.querySelector('#team-canvas-root .tc-scroll'), n = document.querySelector('#team-canvas-root .tc-node[data-plot-id="p2"]');
    s.scrollLeft = n.offsetLeft * z - 40; s.scrollTop = n.offsetTop * z - 40;
  }, z);
  await settled(page);
  return view(page);
}
const cardPoint = async page => { const b = await page.locator(`${ROOT} .tc-node[data-plot-id="p2"]`).boundingBox(); return [b.x + Math.min(b.width / 2, 160), b.y + Math.min(b.height * 0.6, 220)]; };
const clickCard = async page => { const [x, y] = await cardPoint(page); await page.mouse.click(x, y); await settled(page); };

async function focusCase(page, type, z) {
  const tag = `${type} @${z * 100}%`;
  const card = page.locator(`${ROOT} .tc-node[data-plot-id="p2"]`);
  let start = await startView(page, z);
  // Drag on an unselected card: the camera stays.
  const head = await card.locator('.tc-node-head strong').boundingBox();
  await page.mouse.move(head.x + 4, head.y + 4); await page.mouse.down(); await page.mouse.move(head.x + 30, head.y + 14, {steps: 5}); await page.mouse.up(); await settled(page);
  near(await view(page), start, `${tag}: a drag does not move the camera`);
  start = await startView(page, z);
  // A card control (⋯ or a toolbar button) on an unselected card: the camera stays.
  const [hx, hy] = await cardPoint(page); await page.mouse.move(hx, hy); await F.frames(page);
  const cb = await card.locator('.tc-card-more, .tc-card-actions > button').first().boundingBox();
  await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2); await settled(page);
  near(await view(page), start, `${tag}: a card control does not move the camera`);
  start = await startView(page, z);
  // Click: inspector open, card centred and fitted left of it.
  await clickCard(page);
  const fit = await page.evaluate(() => {
    const root = document.getElementById('team-canvas-root'), s = root.querySelector('.tc-scroll'), n = root.querySelector('.tc-node[data-plot-id="p2"]');
    const sr = s.getBoundingClientRect(), nr = n.getBoundingClientRect(), left = sr.left + s.clientLeft, top = sr.top + s.clientTop, bottom = top + s.clientHeight; let right = left + s.clientWidth;
    root.querySelectorAll('.tc-layout>.ts-inspector-column,#tc-selection-inspector').forEach(p => { if (p.hidden || p.inert || !p.getClientRects().length || getComputedStyle(p).visibility === 'hidden') return; const r = p.getBoundingClientRect(); if (r.left > left + 120 && r.left < right && r.top < bottom && r.bottom > top) right = r.left; });
    return {selected: n.classList.contains('is-selected'), open: !root.querySelector('.tc-layout').classList.contains('ts-inspector-collapsed'),
      dx: (nr.left + nr.right) / 2 - (left + right) / 2, dy: (nr.top + nr.bottom) / 2 - (top + bottom) / 2, inside: nr.left >= left - 1 && nr.right <= right + 1 && nr.top >= top - 1 && nr.bottom <= bottom + 1};
  });
  assert.equal(fit.selected && fit.open, true, `${tag}: click selects the card and opens the inspector`);
  assert(Math.abs(fit.dx) <= 2 && Math.abs(fit.dy) <= 2 && fit.inside, `${tag}: card centred and fitted left of the inspector ${JSON.stringify(fit)}`);
  const focused = await view(page);
  assert.notDeepEqual(focused, start, `${tag}: the camera moved to the card`);
  // Click on the selected card: nothing.
  await clickCard(page); near(await view(page), focused, `${tag}: a click on the selected card does nothing`);
  // Esc restores the previous view.
  await page.keyboard.press('Escape'); await settled(page); near(await view(page), start, `${tag}: Esc restores the view`);
  // A click on empty canvas restores it.
  await clickCard(page); near(await view(page), focused, `${tag}: focused again`);
  const spot = await page.evaluate(() => {
    const s = document.querySelector('#team-canvas-root .tc-scroll'), r = s.getBoundingClientRect();
    for (let fy = 0.1; fy < 1; fy += 0.1) for (let fx = 0.05; fx < 1; fx += 0.1) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy, t = document.elementFromPoint(x, y);
      if (t && s.contains(t) && !t.closest('.tc-node,button,.tc-card-actions')) return {x, y};
    }
    return null;
  });
  assert(spot, `${tag}: an empty spot on the canvas`);
  await page.mouse.click(spot.x, spot.y); await settled(page); near(await view(page), start, `${tag}: empty canvas click restores the view`);
  // Closing the inspector (Hide inspector) restores it. With a card selected the column's "Hide inspector" text
  // button is not shown (inspector_toggle.css): the rail's inspector toggle is the same Hide.
  await page.keyboard.press('Escape'); await settled(page);
  await clickCard(page); near(await view(page), focused, `${tag}: focused once more`);
  const hide = await page.locator(`${ROOT} .ts-inspector-toggle`).boundingBox();
  await page.mouse.click(hide.x + hide.width / 2, hide.y + hide.height / 2); await settled(page);
  near(await view(page), start, `${tag}: closing the inspector restores the view`);
  // Reduced motion: the camera is at the card right after the click, without animation.
  await page.emulateMedia({reducedMotion: 'reduce'});
  start = await startView(page, z);
  const [rx, ry] = await cardPoint(page); await page.mouse.click(rx, ry);
  near(await view(page), focused, `${tag}: reduced motion frames the card at once`);
  await settled(page);
  await page.emulateMedia({reducedMotion: 'no-preference'});
}

// A manual camera change during the glide wins: the glide stops and the view stays the person's.
async function glideCancelCase(page, type, z) {
  const tag = `${type} @${z * 100}%`;
  const controls = {
    'zoom button': () => page.locator(`${ROOT} .tc-zoom-in`).click(),
    '+ key': () => page.keyboard.press('+'),
    'Fit': () => page.locator(`${ROOT} .tc-zoom-fit`).click(),
    'minimap': async () => { const m = await page.locator(`${ROOT} .tc-map svg`).boundingBox(); await page.mouse.click(m.x + m.width * 0.2, m.y + m.height * 0.2); },
  };
  await page.evaluate(() => { window.slowGlide = [window.requestAnimationFrame, window.cancelAnimationFrame]; });
  for (const [name, act] of Object.entries(controls)) {
    await startView(page, z);
    // A slow glide (frames 40 ms apart), so the control lands while it runs in both engines.
    await page.evaluate(() => { window.requestAnimationFrame = f => setTimeout(() => f(performance.now()), 40); window.cancelAnimationFrame = id => clearTimeout(id); });
    const [x, y] = await cardPoint(page); await page.mouse.click(x, y);
    assert.equal(await page.evaluate(() => TeamCanvasViewport.gliding()), true, `${tag}: the card click glides (${name})`);
    await act();
    const after = await page.evaluate(() => { [window.requestAnimationFrame, window.cancelAnimationFrame] = window.slowGlide; const s = document.querySelector('#team-canvas-root .tc-scroll'); return {gliding: TeamCanvasViewport.gliding(), scale: TeamCanvasViewport.scale, x: s.scrollLeft, y: s.scrollTop}; });
    assert.equal(after.gliding, false, `${tag}: ${name} stops the glide`);
    await settled(page);
    near(await view(page), after, `${tag}: ${name} keeps its camera after the glide would have ended`);
  }
}
// Blob URLs of cached bitmaps, tracked: each one made must be revoked once it can no longer be shown.
async function bitmapRevokeCase(page, type, z) {
  const tag = `${type} @${z * 100}%`;
  await page.evaluate(() => {
    window.blobs = {made: [], revoked: new Set()}; const make = URL.createObjectURL, drop = URL.revokeObjectURL;
    URL.createObjectURL = b => { const u = make.call(URL, b); if (b && b.type === 'image/svg+xml' || b && b.type === 'image/png') blobs.made.push(u); return u; };
    URL.revokeObjectURL = u => { blobs.revoked.add(u); return drop.call(URL, u); };
    window.goodImage = Plotly.toImage; Plotly.toImage = async () => 'data:image/png;base64,AAAA';
    document.getElementById('p1').emit('plotly_afterplot');
  });
  await page.waitForFunction(() => blobs.made.length === 1 && blobs.revoked.has(blobs.made[0]), null, {timeout: 5000}).catch(() => assert.fail(`${tag}: a bitmap that fails to decode has its URL revoked`));
  await page.evaluate(() => { Plotly.toImage = window.goodImage; document.getElementById('p1').emit('plotly_afterplot'); });
  await page.waitForFunction(() => document.getElementById('p1').classList.contains('tc-has-bitmap'), null, {timeout: 5000});
  const url = await page.evaluate(() => blobs.made[blobs.made.length - 1]);
  assert.equal(await page.evaluate(u => blobs.revoked.has(u), url), false, `${tag}: the shown bitmap is kept`);
  await page.evaluate(() => document.querySelector('#team-canvas-root .tc-node[data-plot-id="p1"]').remove());
  await page.waitForFunction(u => blobs.revoked.has(u) && TeamCanvasViewport.bitmapCount() === 0, url, {timeout: 3000}).catch(() => assert.fail(`${tag}: a removed card's bitmap URL is revoked`));
  assert.equal(await page.evaluate(() => blobs.made.every(u => blobs.revoked.has(u))), true, `${tag}: no cached bitmap URL left`);
  // A cached card redrawn and removed before its queued capture runs: the capture is skipped without an error and
  // later captures still run (the next new plot card is captured).
  const addPlot = (id, left) => page.evaluate(([id, left]) => { const c = document.createElement('article');
    c.className = 'tc-node'; c.dataset.plotId = id; c.style.cssText = `position:absolute;left:${left}px;top:90px;width:420px;height:300px`;
    c.innerHTML = `<div class="tc-content"><div id="${id}" class="js-plotly-plot" style="height:220px"></div></div>`; document.querySelector('#team-canvas-root .tc-board').appendChild(c);
    const gd = c.querySelector('#' + id), on = {}; gd._fullLayout = {width: 200, height: 100}; gd.on = (k, f) => { (on[k] = on[k] || []).push(f); }; gd.emit = k => (on[k] || []).forEach(f => f());
    TeamCanvasViewport.refresh(); return window.toImageCalls; }, [id, left]);
  await addPlot('p2', 60);
  await page.waitForFunction(() => document.getElementById('p2').classList.contains('tc-has-bitmap'), null, {timeout: 5000});
  await page.evaluate(() => { const gd = document.getElementById('p2'); gd.emit('plotly_afterplot'); gd.closest('.tc-node').remove(); });
  await page.waitForTimeout(400);
  const p3 = await addPlot('p3', 600);
  await page.waitForFunction(() => document.getElementById('p3').classList.contains('tc-has-bitmap'), null, {timeout: 5000}).catch(() => assert.fail(`${tag}: captures continue after a card is removed with a capture queued`));
  assert(await page.evaluate(() => window.toImageCalls) > p3, `${tag}: the next card is captured`);
}

async function run(type) {
  let browser; try { browser = await pw[type].launch({headless: true}); } catch (e) { if (type === 'chromium') throw e; console.log('SKIP ' + type + ': not installed'); return; }
  try {
    for (const z of [0.5, 1, 1.5]) {
      const page = await browser.newPage({viewport: {width: 1440, height: 900}}), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await F.install(page); await F.setupWorkspace(page, {companion: 'closed'}); await mockPlot(page);
      await gestureCase(page, type, z);
      // Re-render: the bitmap is stale until it is made again (once).
      const calls = await page.evaluate(() => window.toImageCalls);
      await page.evaluate(() => document.getElementById('p1').emit('plotly_afterplot'));
      assert.equal(await page.evaluate(() => document.getElementById('p1').classList.contains('tc-has-bitmap')), false, `${type} @${z * 100}%: a re-render drops the stale bitmap`);
      await page.waitForFunction(() => document.getElementById('p1').classList.contains('tc-has-bitmap'), null, {timeout: 5000});
      assert.equal(await page.evaluate(() => window.toImageCalls), calls + 1, `${type} @${z * 100}%: one new bitmap per re-render`);
      // Plotly.purge + newPlot (a data/settings redraw) drops every listener and gives the plot a new emitter;
      // the afterplot of that redraw fires before the canvas can listen again. The next prime (a gesture's end)
      // listens again and recaptures, and later re-renders keep recapturing.
      const rev = await page.evaluate(() => { const gd = document.getElementById('p1'), on = {}; delete gd.on; delete gd.emit;
        gd.on = (n, f) => { (on[n] = on[n] || []).push(f); }; gd.emit = n => (on[n] || []).forEach(f => f()); gd.emit('plotly_afterplot'); return gd._tcBitmapRev; });
      await page.evaluate(() => { window.__p1During = null; document.addEventListener('wheel', () => requestAnimationFrame(() => { if (window.__p1During === null) window.__p1During = document.getElementById('p1').classList.contains('tc-has-bitmap') && document.getElementById('team-canvas-root').classList.contains('tc-gesturing'); }), {capture: true, once: true}); });
      await page.mouse.wheel(0, 120); await page.waitForFunction(() => window.__p1During !== null, null, {timeout: 3000});
      assert.equal(await page.evaluate(() => window.__p1During), false, `${type} @${z * 100}%: the first gesture after a purge/redraw never shows the old bitmap`);
      await ended(page);
      await page.waitForFunction(r => { const gd = document.getElementById('p1'); return gd._tcBitmapRev > r && gd.classList.contains('tc-has-bitmap'); }, rev, {timeout: 5000}).catch(() => assert.fail(`${type} @${z * 100}%: a purge/redraw is recaptured`));
      assert.equal(await page.evaluate(() => window.toImageCalls), calls + 2, `${type} @${z * 100}%: one new bitmap after the purge/redraw`);
      await page.evaluate(() => document.getElementById('p1').emit('plotly_afterplot'));
      await page.waitForFunction(() => document.getElementById('p1').classList.contains('tc-has-bitmap'), null, {timeout: 5000});
      assert.equal(await page.evaluate(() => window.toImageCalls), calls + 3, `${type} @${z * 100}%: re-renders after the purge recapture`);
      await focusCase(page, type, z);
      await glideCancelCase(page, type, z);
      await bitmapRevokeCase(page, type, z);
      assert.deepEqual(errors, [], `${type} @${z * 100}%: no page errors`);
      await page.close();
    }
    console.log('PASS ' + type + ': gesture mode shows cached bitmaps, hides toolbars and leaves charts identical; click-to-focus glides and restores; manual zoom/Fit/minimap stop the glide; bitmap URLs revoked on decode failure and card removal (50/100/150%)');
  } finally { await browser.close(); }
}
(async () => { for (const t of ['chromium', 'webkit']) await run(t); })().catch(e => { console.error(e); process.exitCode = 1; });
