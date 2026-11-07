// FIXR3B item 3 (Opus M1): card action bars follow the navigation box's band. When no corner of the canvas is
// free, canvas_viewport.js reserves a band at the canvas bottom for the box (.tc-nav-inset): the view's lower
// edge moves up without a scroll, a resize or a board change. A framed card's floating Edit/Duplicate bar
// (card_figure.js, below 90 % zoom) sits along that edge: it must be re-placed above the band, and back down
// when the band goes. And a bar that is the only thing in a corner must not make the box hop in and out of
// the band (the bar follows the edge, so leaving the band would bring it back).
// Real canvas_viewport.js + card_figure.js and their stylesheets. card_figure.js is loaded first, so its
// board observer runs before the viewport's: a band toggled in the same frame as card_figure's own sweep
// would leave the bar where it was without the re-place hook.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');

const FIXTURE = '<body class="ts-shell-app" style="margin:0"><section id="team-canvas-root"><div class="tc-layout"><div class="tc-main" style="width:850px"><div class="tc-scroll" style="width:100%;height:500px"><div class="tc-board" style="width:3000px;height:2400px"></div></div></div></div></section></body>';

async function setup(browser) {
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.setContent(FIXTURE);
  for (const css of ['canvas.css', 'canvas_viewport.css', 'card_figure.css']) await p.addStyleTag({ path: path.resolve('www/team/css/' + css) });
  await p.addScriptTag({ path: path.resolve('www/team/js/card_figure.js') });
  await p.addScriptTag({ path: path.resolve('www/team/js/canvas_viewport.js') });
  await p.evaluate(() => {
    const root = document.getElementById('team-canvas-root'); TeamCanvasViewport.mount(root, root.querySelector('.tc-board')); TeamCanvasViewport.setScale(.5);
    const s = document.querySelector('.tc-scroll'); s.scrollLeft = 200; s.scrollTop = 200;
    window.insets = []; window.addEventListener('team-canvas-nav-inset', e => insets.push(e.detail.inset));
  });
  await frames(p);
  return { p, errors };
}
const frames = (p, n = 3) => p.evaluate(n => new Promise(r => { const step = k => k ? requestAnimationFrame(() => step(k - 1)) : r(); step(n); }), n);
// Cards in screen coordinates (x, y, width, height) at the current zoom and scroll. framed: RC4's framed card,
// whose bar floats along the card's lower edge, clamped to the view's lower edge.
const addCards = (p, cards) => p.evaluate(cards => {
  const sc = document.querySelector('.tc-scroll'), s = sc.getBoundingClientRect(), z = TeamCanvasViewport.scale, board = document.querySelector('.tc-board');
  for (const c of cards) {
    const n = document.createElement('div'); n.className = 'tc-node tc-test-card' + (c.framed ? ' tc-card-framed' : ''); n.id = c.id;
    n.style.cssText = `position:absolute;left:${(c.x - s.left + sc.scrollLeft) / z}px;top:${(c.y - s.top + sc.scrollTop) / z}px;width:${c.w / z}px;height:${c.h / z}px`;
    n.innerHTML = `<div class="tc-node-head"><strong>${c.id}</strong><div class="tc-card-actions" role="toolbar" aria-label="Card actions"><button type="button">Edit</button><button type="button">Duplicate</button></div></div>`;
    board.appendChild(n);
  }
}, cards);
// The shell, the nav box size and the corner boxes, measured with the box shown.
const geometry = p => p.evaluate(() => {
  const sh = document.querySelector('.tc-viewport-shell').getBoundingClientRect(), sc = document.querySelector('.tc-scroll'), s = sc.getBoundingClientRect(), nav = document.querySelector('.tc-navigation');
  return { sh: { left: sh.left, top: sh.top, right: sh.right, bottom: sh.bottom }, scrollRight: s.left + sc.clientWidth, w: nav.offsetWidth, h: nav.offsetHeight };
});
const bar = (p, id) => p.evaluate(id => {
  const b = document.querySelector('#' + id + ' .tc-card-actions').getBoundingClientRect(), s = document.querySelector('.tc-scroll').getBoundingClientRect(), n = document.querySelector('.tc-navigation').getBoundingClientRect();
  const viewBottom = Math.min(innerHeight, s.bottom), meets = b.left < n.right && b.right > n.left && b.top < n.bottom && b.bottom > n.top;
  return { top: b.top, bottom: b.bottom, viewBottom, underBox: meets, inset: document.querySelector('.tc-viewport-shell').classList.contains('tc-nav-inset'), visibility: getComputedStyle(document.querySelector('#' + id + ' .tc-card-actions')).visibility };
}, id);
const hideNav = (p, hide) => p.evaluate(hide => { document.querySelector('.tc-navigation').style.display = hide ? 'none' : ''; if (!hide) TeamCanvasViewport.refresh(); }, hide);
const corners = (g, which) => {
  const { sh, scrollRight, w, h } = g, out = [];
  if (which.includes('tl')) out.push({ id: 'tl', x: sh.left, y: sh.top + 12 + h / 2, w: w + 60, h: 240 });
  if (which.includes('tr')) out.push({ id: 'tr', x: scrollRight - w - 70, y: sh.top + 12 + h / 2, w: w + 60, h: 240 });
  if (which.includes('bl')) out.push({ id: 'bl', x: sh.left, y: sh.bottom - 12 - h / 2, w: w + 60, h: 240 });
  if (which.includes('br')) out.push({ id: 'br', x: scrollRight - w - 70, y: sh.bottom - 12 - h / 2, w: w + 60, h: 240 });
  return out;
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    // 1. A framed card taller than the view, mid-canvas: its bar floats along the view's lower edge. The four
    //    corners then fill up while the box is hidden (nothing to place yet), so card_figure.js has settled
    //    before the box comes back and finds no free corner: the band is the only change.
    {
      const { p, errors } = await setup(browser);
      const g = await geometry(p);
      await hideNav(p, true);
      await addCards(p, [{ id: 'tall', framed: true, x: g.sh.left + 300, /* mid-canvas, clear of the wider ux18 zoom pill's bottom-right corner */ y: g.sh.top + 300, w: 260, h: 1400 }, ...corners(g, ['tl', 'tr', 'bl', 'br'])]);
      await frames(p, 4);
      let b = await bar(p, 'tall');
      assert.equal(b.inset, false, 'fixture: no band while the box is hidden');
      assert.ok(Math.abs(b.bottom - (b.viewBottom - 4)) <= 1, `fixture: the bar floats along the view's lower edge ${JSON.stringify(b)}`);
      const before = b.bottom;
      await hideNav(p, false);
      await frames(p, 4);
      b = await bar(p, 'tall');
      assert.equal(b.inset, true, `no free corner: the band is reserved ${JSON.stringify(b)}`);
      assert.ok(b.viewBottom < before - 20, 'fixture: the band shortened the view');
      assert.ok(b.bottom <= b.viewBottom + 0.5, `the bar is re-placed above the band (bar bottom ${b.bottom}, view bottom ${b.viewBottom}, was ${before})`);
      assert.ok(Math.abs(b.bottom - (b.viewBottom - 4)) <= 1, `the bar follows the new lower edge ${JSON.stringify(b)}`);
      assert.equal(b.underBox, false, 'the bar is not under the navigation box');
      assert.equal(b.visibility, 'visible', 'the bar is still offered');
      // A corner frees up: the band goes and the bar goes back down to the view's lower edge.
      await p.evaluate(() => document.getElementById('br').remove());
      await frames(p, 4);
      b = await bar(p, 'tall');
      assert.equal(b.inset, false, `a free corner: the band goes ${JSON.stringify(b)}`);
      assert.ok(Math.abs(b.bottom - (b.viewBottom - 4)) <= 1, `the bar follows the lower edge back down ${JSON.stringify(b)}`);
      assert.deepEqual(await p.evaluate(() => insets.map(Boolean)), [true, false], 'one band on, one band off');
      assert.deepEqual(errors, []);
      await p.close();
    }
    // 2. Three corners hold cards; the fourth (bottom right) holds only a framed card's floating bar. The box
    //    takes the band once and keeps it: re-placed above the band the bar would leave that corner, but it
    //    would come straight back if the band went.
    {
      const { p, errors } = await setup(browser);
      const g = await geometry(p);
      await hideNav(p, true);
      await addCards(p, [...corners(g, ['tl', 'tr', 'bl']), { id: 'edge', framed: true, x: g.scrollRight - g.w - 22, y: g.sh.top + 300, w: 320, h: 1400 }]);
      await frames(p, 4);
      const pre = await bar(p, 'edge');
      assert.ok(Math.abs(pre.bottom - (pre.viewBottom - 4)) <= 1, `fixture: the edge card's bar floats along the view's lower edge ${JSON.stringify(pre)}`);
      await hideNav(p, false);
      await frames(p, 20);
      const b = await bar(p, 'edge');
      assert.equal(b.inset, true, `the bar in the last corner keeps the box in the band ${JSON.stringify(b)}`);
      assert.deepEqual(await p.evaluate(() => insets.map(Boolean)), [true], 'the box took the band once and did not hop back out');
      assert.ok(Math.abs(b.bottom - (b.viewBottom - 4)) <= 1 && !b.underBox, `the bar sits above the band, clear of the box ${JSON.stringify(b)}`);
      assert.deepEqual(errors, []);
      await p.close();
    }
    console.log('PASS card action bars follow the navigation band (re-placed above it and back down; no hopping)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
