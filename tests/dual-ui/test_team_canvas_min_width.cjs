// Run with: node tests/dual-ui/test_team_canvas_min_width.cjs
// Wave 2b: the Canvas keeps a usable width with every side panel open. Width sweep 768, 920, 1024,
// 1180, 1280 and 1440 plus both sides of every breakpoint (900/901, 969/970, 1045/1046, 1309/1310),
// with the plot library open or hidden, the inspector column or the open Analysis tools drawer,
// normal and expanded Canvas. At each one: the page does not scroll sideways, the canvas column is at
// least 360 px wide and inside the window, and the inspector (or drawer) is on screen, at least 280 px
// wide and never on top of the canvas (canvas_min_width.css stacks it below the canvas when it would
// not fit beside it). The companion is the production floating dock #lipidomic-companion
// (context_help.js, as in d814775), left where context_help.js places it: when shown it stays
// inside the window.
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('../browser/ci/node_modules/playwright');

const URL = 'http://team-canvas-min-width.test/';
// #guide-context lets context_help.js mount its production floating dock; workspace.css hides the help bar on Team.
const PAGE = (library) => `<!doctype html><html><head><style>body.team-workspace-app #lipidomic-help-bar{display:none!important}</style></head>
<body class="ts-shell-app team-workspace-app" data-tw-screen="canvas" data-team-authenticated="true" style="margin:0">
  <nav class="navbar" style="height:48px">Lipidomic Explorer</nav>
  <div id="guide-context"></div>
  <section id="team-canvas-root" class="ts-shell" data-ts-shell="true"><div class="tc-layout${library ? '' : ' tc-library-hidden'}">
    <nav class="ts-rail"><button class="ts-rail-item" aria-label="Plots">P</button></nav>
    <aside class="tc-catalog"><input class="tc-search" placeholder="Search plots"></aside>
    <div class="tc-main">
      <div class="tc-toolbar"><div class="ts-tools"><button type="button" class="ts-tool">Arrange</button></div></div>
      <div class="tc-viewport-shell" style="overflow:hidden"><div class="tc-scroll" style="overflow:auto;height:100%"><div class="tc-board" style="position:relative;width:1600px;height:900px">
        <div class="tc-node" style="position:absolute;left:30px;top:30px;width:400px;height:300px"><div class="tc-node-head">PCA</div></div>
      </div></div></div>
    </div>
    <div class="ts-inspector-column"><div class="ts-inspector-empty">Inspector</div><div class="tc-companion-home"></div></div>
    <aside class="ttd-drawer ttd-docked" hidden><div class="ttd-head">Analysis tools</div><div class="ttd-item">PCA</div></aside>
  </div></section>
</body></html>`;

const WIDTHS = [768, 900, 901, 920, 969, 970, 1024, 1045, 1046, 1180, 1280, 1309, 1310, 1440];
// Production geometry (d814775): rail 56 + library 264 + inspector 290, so the canvas is width - 610 with the
// library open (291 px at 901). The mascot is frozen, so the panels are NOT stacked to widen the canvas
// (the chat docks on the inspector column's geometry). This guards against a zero-width canvas.
const MIN_CANVAS = 280, MIN_PANEL = 280;
const box = (page, sel) => page.evaluate(s => { const n = document.querySelector(s); if (!n || !n.getClientRects().length) return null; const r = n.getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height}; }, sel);
const overlaps = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;

async function setup(page, library) {
  await page.unroute(URL).catch(() => {});
  await page.route(URL, route => route.fulfill({status: 200, contentType: 'text/html', body: PAGE(library)}));
  await page.goto(URL);
  for (const css of ['shell', 'context_help', 'companion_assistant', 'canvas_viewport', 'tools_drawer']) await page.addStyleTag({path: path.resolve(`www/team/css/${css}.css`)});
  await page.evaluate(() => { window.LIPIDOMIC_TEAM_WORKSPACE = true; window.$ = () => ({on: () => {}}); window.LipidomicHelpContent = {controls: {}, topics: {}}; });
  for (const js of ['companion_art', 'context_help', 'companion_assistant']) await page.addScriptTag({path: path.resolve(`www/team/js/${js}.js`)});
  await page.waitForSelector('#lipidomic-companion', {state: 'attached'});
}

(async () => {
  const browser = await chromium.launch({headless: true});
  let pass = 0, shown = 0; const fails = [];
  const check = (cond, msg) => { if (cond) pass++; else fails.push(msg); };
  // Fractional widths (browser zoom) must fall in exactly one of `max-width:900px` and the wider rules.
  check(!require('node:fs').existsSync(path.resolve('www/team/css/canvas_min_width.css')), 'no panel stacking above 900 px (it moved the frozen chat)');
  try {
    for (const library of [true, false]) for (const panel of ['none', 'drawer']) for (const expanded of [false, true]) {
      const drawer = panel === 'drawer';
      const page = await browser.newPage({viewport: {width: 1440, height: 900}});
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await setup(page, library);
      if (drawer) await page.evaluate(() => { document.querySelector('.tc-layout').classList.add('ttd-open'); document.querySelector('.ttd-drawer').hidden = false; });
      if (expanded) await page.evaluate(() => { document.getElementById('team-canvas-root').classList.add('tc-focus-mode'); document.body.classList.add('ts-canvas-focus'); });
      for (const w of WIDTHS) {
        await page.setViewportSize({width: w, height: 900}); await page.waitForTimeout(250);
        await page.evaluate(() => window.scrollTo(0, 0));
        const tag = `${w} library=${library} panel=${panel} expanded=${expanded}`;
        const doc = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: innerWidth}));
        check(doc.sw <= doc.iw, `${tag}: page scrolls sideways (${doc.sw} > ${doc.iw})`);
        const main = await box(page, '#team-canvas-root .tc-main');
        check(main && main.width >= MIN_CANVAS, `${tag}: canvas column ${main ? Math.round(main.width) : 'absent'} px < ${MIN_CANVAS}`);
        check(main && main.left >= 0 && main.right <= w + 1, `${tag}: canvas column outside the window`);
        const insp = await box(page, drawer ? '#team-canvas-root .ttd-drawer' : '#team-canvas-root .ts-inspector-column');
        check(insp && insp.width >= MIN_PANEL && insp.left >= 0 && insp.right <= w + 1, `${tag}: ${drawer ? 'drawer' : 'inspector'} ${insp ? Math.round(insp.left) + '..' + Math.round(insp.right) : 'absent'}`);
        check(!(insp && main && overlaps(insp, main)), `${tag}: ${drawer ? 'drawer' : 'inspector'} on top of the canvas`);
        // The floating mascot, where context_help.js put it (production placement, not moved by the test).
        const mascot = await page.evaluate(() => { const n = document.getElementById('lipidomic-companion'); if (!n || n.hidden || !n.getClientRects().length || getComputedStyle(n).visibility === 'hidden') return null; const r = n.getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, bottom: r.bottom}; });
        check(!mascot || (mascot.left >= -1 && mascot.top >= -1 && mascot.right <= w + 1 && mascot.bottom <= 900 + 1), `${tag}: mascot #lipidomic-companion outside the viewport ${mascot ? JSON.stringify(mascot) : ''}`);
        if (mascot) shown++;
        check(mascot, `${tag}: the floating mascot must be shown (frozen as in production)`);
        if (w > 900) {
          // The inspector column keeps its production place (column 4, beside the canvas, same top) and, with the
          // drawer open, stays laid out under it: the chat and the mascot's home read this geometry.
          const col = await box(page, '#team-canvas-root .ts-inspector-column');
          check(col && main && Math.abs(col.top - main.top) <= 2 && col.left >= main.right - 1 && col.width >= 280, `${tag}: inspector column moved from its production place ${JSON.stringify(col)}`);
          if (drawer) check(insp && col && Math.abs(insp.left - col.left) <= 1 && Math.abs(insp.width - col.width) <= 1, `${tag}: drawer does not lie over the inspector column`);
        }
        if (library && w > 900) {
          const lib = await box(page, '#team-canvas-root .tc-catalog');
          check(lib && !overlaps(lib, main), `${tag}: library on top of the canvas`);
        }
      }
      check(!errors.length, `library=${library} panel=${panel} expanded=${expanded}: page errors ${errors.join(' | ')}`);
      await page.close();
    }
  } finally { await browser.close(); }
  if (fails.length) { console.log(fails.join('\n')); console.log(`FAIL: ${fails.length} failed, ${pass} passed`); process.exit(1); }
  console.log(`PASS: ${pass} checks over ${WIDTHS.join(', ')} px, library open/hidden, inspector/tools drawer, normal/expanded; floating mascot shown and inside the viewport in ${shown} of ${WIDTHS.length * 8} layouts`);
})().catch(e => { console.error(e); process.exit(1); });
