// Run with: node tests/dual-ui/test_team_canvas_header.cjs
// RC1: the Canvas has one header under the step bar: the canvas tabs and one grouped toolbar
// (one row from 901 px), closed by the RC3 band status slot. "Your figure canvas" and the
// Workspace tab never render; "Analysis tools" opens the one tools drawer (tools_drawer.js), which
// lists 3D cell and every analysis tool; every control in the
// bar has one style; every toolbar action is reachable by keyboard; the first card starts above
// 160 px at 1440. Real shell.js, canvas_tabs.js, canvas_band_status.js and the Team stylesheets
// in their app order (canvas_header.css is registered before shell.css in R/frontends/team/ui.R).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');

const TOOLS = ['Quality Check', 'Heatmap', 'Volcano Plot', 'Violin Plots'];
const html = `<!doctype html><html lang="en"><head><style>*,::before,::after{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui}</style></head>
<body class="team-workspace-app" data-tw-screen="canvas" data-team-authenticated="true" data-team-stage="canvas" data-guide-step="5" data-guide-analysis="false">
  <nav class="navbar"><div class="container-fluid"><span class="navbar-brand"><span class="guide-brand-lockup"><span class="guide-app-name">LIPIDOMIC EXPLORER</span></span></span></div></nav>
  <section id="team-workspace">
    <div class="tw-top"><span id="team-autosave-status" role="status"></span><button type="button" class="tw-signout">Sign out</button></div>
    <nav class="tw-steps"><button type="button" data-tw-stage="data"><span>01</span><strong>Data</strong></button><button type="button" data-tw-stage="review"><span>02</span><strong>Review</strong></button><button type="button" data-tw-stage="canvas" aria-current="step"><span>03</span><strong>Canvas</strong></button></nav>
    <div class="tw-canvas-tabs"><button type="button" class="guide-button" data-guide-step="5">Figure canvas</button><button type="button" class="guide-button" data-guide-step="6">3D cell</button><button type="button" class="guide-button" data-guide-step="7">Save &amp; export</button>
      <details><summary>Analysis tools</summary><div class="tw-tools">${TOOLS.map(t => `<button type="button" class="guide-button" data-guide-tool="${t}">${t}</button>`).join('')}</div></details></div>
  </section>
  <section id="team-canvas-root" class="tc-workspace" aria-label="Figure canvas">
    <div class="tc-intro"><div><h2>Your figure canvas</h2><p>Add a plot. Make it yours. Finish when ready.</p></div><button type="button" class="tc-palette">Colors &amp; palettes</button></div>
    <div class="tc-mode-tabs" role="tablist" aria-label="Canvas view"><button id="tc-workspace-tab" type="button" role="tab" aria-selected="true" aria-controls="tc-workspace-panel" tabindex="0">Workspace</button><button id="tc-preview-tab" type="button" role="tab" aria-selected="false" aria-controls="tc-preview-panel" tabindex="-1">Print preview</button><button type="button" class="tc-focus-toggle">Expand canvas</button></div>
    <div id="tc-workspace-panel" role="tabpanel" aria-labelledby="tc-workspace-tab"><div class="tc-layout">
      <aside class="tc-catalog" aria-label="Plot catalog"><h3>Plot library</h3><input type="search" class="tc-search" aria-label="Search plots"><div class="tc-list"></div></aside>
      <div class="tc-main">
        <div class="tc-toolbar"><strong>Canvas</strong><button type="button" class="tc-library-toggle" aria-expanded="true">Hide library</button><span>Drag a header to move</span><button type="button" class="tc-arrange">Arrange</button><button type="button" class="tc-reset">Return all plots</button><button type="button" class="tc-paste-plot">Paste plot</button><button type="button" class="tc-draw-primitives">Shapes &amp; text</button>
          <details class="tc-save-help"><summary>Canvas help</summary><div class="tc-help-content"><p>Help</p></div></details></div>
        <div class="tc-viewport-shell"><div class="tc-scroll" style="overflow:auto"><div class="tc-board" style="position:relative;width:1600px;height:1200px">
          <div class="tc-node" data-canvas-order-id="p1" data-plot-id="p1" style="position:absolute;left:30px;top:30px;width:320px;height:240px;background:#fff;border:1px solid #ccd"><div class="tc-node-head"><strong>PCA</strong></div></div>
        </div></div></div>
        <div class="tc-status" role="status" aria-live="polite"></div>
      </div>
      <div class="tc-selection-inspector" hidden></div>
    </div></div>
    <section id="tc-preview-panel" class="tc-preview" role="tabpanel" aria-labelledby="tc-preview-tab" hidden><button type="button" class="tc-preview-add-text">Add text</button><button type="button" class="tc-preview-svg">Download SVG</button></section>
  </section>
  <script>window.LIPIDOMIC_TEAM_WORKSPACE=true;window.guideClicks=[];document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('.guide-button');if(b)guideClicks.push(b.dataset.guideTool||b.dataset.guideStep);});</script>
</body></html>`;

// What the page sees: visible, the rectangle, and a control's name.
const probe = `window.__v = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  window.__r = el => { const r = el.getBoundingClientRect(); return {left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height}; };
  window.__name = el => (el.getAttribute('aria-label') || Array.from(el.childNodes).filter(n => !(n.nodeType === 1 && n.getAttribute('aria-hidden') === 'true')).map(n => n.textContent).join('')).replace(/\\s+/g, ' ').trim();`;

async function open(browser, width, height) {
  const page = await browser.newPage({viewport: {width, height}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setContent(html);
  // canvas_header.css first, as registered in ui.R; canvas_tabs.css last (it ships with the canvas markup in <body>).
  for (const css of ['canvas_header', 'canvas', 'workspace_minimal', 'canvas_viewport', 'shell', 'card_status', 'canvas_band_status', 'canvas_tabs']) await page.addStyleTag({path: path.resolve(`www/team/css/${css}.css`)});
  await page.addStyleTag({path: path.resolve('www/team/css/tools_drawer.css')});
  // Bootstrap's own navbar rule (the app loads Bootstrap; this fixture does not): without it the brand and the shell's
  // top-bar extras stack in two lines and the second line overlaps the Canvas header.
  await page.addStyleTag({content: '.navbar>.container-fluid{display:flex;align-items:center;justify-content:space-between}'});
  for (const js of ['tools_drawer', 'canvas_band_status', 'shell', 'canvas_tabs_model', 'canvas_tabs']) await page.addScriptTag({path: path.resolve(`www/team/js/${js}.js`)});
  await page.addScriptTag({content: probe});
  await page.waitForSelector('#team-canvas-root .tc-main > .tc-tabbar .tc-canvas-tab');
  // The companion is the production floating dock (context_help.js), not a toolbar button: the bar has no Companion control.
  await page.waitForTimeout(150);
  return {page, errors};
}
const header = page => page.evaluate(() => {
  const q = s => document.querySelector(s), tabs = q('.tc-main > .tc-tabbar'), bar = q('.tc-main > .tc-toolbar'), band = q('.tc-main > .tc-band-status');
  return {nav: __r(q('.navbar')), tabs: __r(tabs), bar: __r(bar), band: __r(band), scroll: __r(q('.tc-scroll')), card: __r(q('.tc-node')), bandFirst: bar.nextElementSibling === band, order: Array.from(q('.tc-main').children).map(c => c.className.split(' ')[0])};
});
const controls = page => page.evaluate(() => Array.from(document.querySelectorAll('.tc-main > .tc-tabbar button, .tc-main > .tc-toolbar .ts-tools button, .tc-main > .tc-toolbar .ts-mode-option'))
  .filter(el => __v(el) && !el.closest('.ts-menu,.tc-canvas-tab-actions,.tc-tab-picker,.tc-canvas-tab-dialog'))
  .map(el => { const cs = getComputedStyle(el); return {name: __name(el), rect: __r(el), current: el.matches('[aria-selected=true],[aria-pressed=true],[aria-expanded=true],.is-current'),
    style: [cs.height, cs.fontSize, cs.fontWeight, cs.fontFamily, cs.borderTopLeftRadius, cs.borderTopWidth, cs.boxShadow].join(' | '), background: cs.backgroundColor}; }));
// The canvas Tab actions menu (canvas_tabs.js), opened from the keyboard: Enter opens it with focus on its
// first item; every enabled item is on screen and unobstructed at its centre (nothing — minimap, drawer,
// inspector, step bar — paints over it); Tab walks the items; Escape closes it and gives
// focus back to the trigger, and leaves the other panels as they were. This replaces the overlay matrix's
// tab-strip case (its stand-in Canvas mounts no tab strip; this fixture mounts the real one).
async function tabMenu(page, at) {
  const trigger = page.locator('.tc-main > .tc-tabbar .tc-canvas-tab-more');
  const panels = () => page.evaluate(() => ({inspector: !!document.querySelector('.tc-selection-inspector:not([hidden])'), drawer: !!document.querySelector('#team-tools-drawer:not([hidden])')}));
  const before = await panels();
  await trigger.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  const st = await page.evaluate(() => {
    const t = document.querySelector('.tc-main > .tc-tabbar .tc-canvas-tab-more'), m = document.getElementById(t.getAttribute('aria-controls'));
    const items = Array.from(m.querySelectorAll('button')).filter(b => !b.disabled).map(b => { const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, h = document.elementFromPoint(x, y);
      return {name: b.textContent.trim(), onScreen: r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, free: !!h && (h === b || b.contains(h)), hit: h ? h.tagName.toLowerCase() + '.' + String(h.className).trim().split(/\s+/).join('.') : null}; });
    return {open: !m.hidden, expanded: t.getAttribute('aria-expanded'), focus: document.activeElement.textContent.trim(), items};
  });
  assert.ok(st.open && st.expanded === 'true', `Enter opens Tab actions (${at})`);
  assert.equal(st.focus, 'Rename…', `focus moves to the first item (${at})`);
  assert.ok(st.items.length >= 2, `Tab actions offers its items (${at}): ${st.items.map(i => i.name).join(', ')}`);
  for (const i of st.items) { assert.ok(i.onScreen, `${i.name} is on screen (${at})`); assert.ok(i.free, `${i.name} is not covered (${at}; hit ${i.hit})`); }
  const walked = [st.focus];
  for (let k = 1; k < st.items.length; k++) { await page.keyboard.press('Tab'); walked.push(await page.evaluate(() => document.activeElement.textContent.trim())); }
  assert.deepEqual(walked, st.items.map(i => i.name), `Tab walks every Tab action in order (${at})`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.getElementById('tc-canvas-tab-actions').hidden), true, `Escape closes Tab actions (${at})`);
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('tc-canvas-tab-more')), true, `Escape gives focus back to Tab actions (${at})`);
  assert.deepEqual(await panels(), before, `Escape on Tab actions closes no other panel (${at})`);
}
const menuItems = (page, cls) => page.evaluate(cls => Array.from(document.querySelectorAll(`.${cls} > .ts-menu > .ts-menu-item`)).map(b => ({name: __name(b), shown: getComputedStyle(b).display !== 'none'})), cls);

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    // ---- 1440: one header, the first card above 160 px --------------------------------------
    const {page, errors} = await open(browser, 1440, 900);
    let h = await header(page);
    assert.deepEqual(h.order.slice(0, 4), ['tc-tabbar', 'tc-toolbar', 'tc-band-status', 'tc-viewport-shell'], 'the header zone is tabs, toolbar, band status slot, then the canvas');
    assert.ok(h.bandFirst, 'the RC3 status slot stays right after the toolbar');
    assert.ok(Math.abs(h.tabs.top - h.nav.bottom) <= 1, `the header sits right under the step bar (${h.tabs.top} vs ${h.nav.bottom})`);
    assert.ok(Math.abs(h.tabs.top - h.bar.top) <= 1 && Math.abs(h.tabs.bottom - h.bar.bottom) <= 1, `tabs and toolbar share one row at 1440 (${JSON.stringify([h.tabs, h.bar])})`);
    assert.ok(h.tabs.right <= h.bar.left + 1, 'the tabs sit left of the toolbar, without overlap');
    assert.equal(Math.round(h.bar.height), 42, 'one 42px header row');
    assert.ok(Math.abs(h.band.top - h.bar.bottom) <= 1 && Math.round(h.band.height) === 34, 'the band status slot closes the header with its reserved height');
    assert.ok(Math.abs(h.scroll.top - h.band.bottom) <= 1, 'the canvas starts right under the band');
    assert.ok(h.card.top < 160, `the first card is visible below 160 px at 1440 (top ${h.card.top})`);
    assert.ok(h.card.top >= h.scroll.top, 'the first card is inside the canvas, not under the header');

    // ---- Headings gone, proxies kept -----------------------------------------------------------
    const gone = await page.evaluate(() => ({
      intro: document.querySelector('.tc-intro').getClientRects().length, modeTabs: document.querySelector('#team-canvas-root > .tc-mode-tabs').getClientRects().length,
      shown: Array.from(document.querySelectorAll('h1,h2,h3,button,[role=tab]')).filter(__v).map(__name),
      proxies: ['#tc-workspace-tab', '#tc-preview-tab', '.tc-palette', '.tc-arrange', '.tc-reset', '.tc-paste-plot'].every(s => !!document.querySelector(s))}));
    assert.equal(gone.intro, 0, '"Your figure canvas" does not render'); assert.equal(gone.modeTabs, 0, 'the Workspace / Print preview tabs do not render');
    assert.ok(!gone.shown.includes('Your figure canvas') && !gone.shown.includes('Workspace'), 'no visible "Workspace" or "Your figure canvas" heading');
    assert.ok(gone.proxies, 'the hidden controls the toolbar proxies stay in the DOM');

    // ---- One menu for 3D cell and the analysis tools ------------------------------------------
    const rail = await page.evaluate(() => Array.from(document.querySelectorAll('.ts-rail .ts-rail-item')).map(__name));
    assert.deepEqual(rail, ['Plots', 'Text & shapes', 'Illustrations', 'Palettes'], '3D cell left the rail');
    const more = (await menuItems(page, 'ts-more')).map(i => i.name);
    assert.ok(!more.includes('Analysis tools') && !more.includes('3D cell'), 'the ⋯ menu no longer carries Analysis tools');
    for (const name of ['Paste plot', 'Return all plots', 'Expand canvas', 'Save & export…']) assert.ok(more.includes(name), `⋯ keeps ${name}`);
    // The phone copies of bar actions (canvas_header.css, <= 600 px) are not shown on wide screens.
    assert.deepEqual((await menuItems(page, 'ts-more')).filter(i => i.shown && /^(Undo|Redo|Analysis tools…|Export figure: |Print figure)/.test(i.name)), [], 'no phone-only ⋯ items at 1440');
    // INTFIX: one tools entry point. Analysis tools opens the R10 drawer (one right-side panel), which lists every tool and the 3D cell.
    assert.deepEqual(await page.evaluate(() => { const t = document.querySelector('.ts-analysis > .ts-analysis-trigger'); return [t.getAttribute('aria-haspopup'), t.getAttribute('aria-controls'), t.getAttribute('aria-expanded'), !!document.querySelector('.ts-analysis > .ts-menu')]; }),
      ['dialog', 'team-tools-drawer', 'false', false], 'Analysis tools is the drawer opener, not a second menu');

    // ---- One control style across the bar ------------------------------------------------------
    const list = await controls(page);
    for (const name of ['Canvas 1 (1 card)', 'Add canvas tab', 'Tab actions', '+ Add plot', 'Tidy up', 'Text', 'Shapes', 'Undo', 'Redo', 'Draft', 'Figure page (print preview)', 'Analysis tools', 'Export figure', 'More canvas actions'])
      assert.ok(list.some(c => c.name === name), `${name} is in the bar (${list.map(c => c.name).join(', ')})`);
    const styles = [...new Set(list.map(c => c.style))];
    assert.equal(styles.length, 1, `a single control style in the bar: ${styles.join('  //  ')}`);
    assert.match(styles[0], /^30px \| 13px \| 600 \| /, 'controls are 30px, 13px, 600');
    for (const c of list.filter(c => !c.current)) assert.equal(c.background, 'rgba(0, 0, 0, 0)', `${c.name} is a ghost control at rest`);
    for (const c of list.filter(c => c.current)) assert.equal(c.background, 'rgb(234, 241, 247)', `${c.name} shows the current state with the tint`);
    for (const c of list) assert.ok(c.rect.top >= h.bar.top - 1 && c.rect.bottom <= h.bar.bottom + 1, `${c.name} fits the header row`);

    // ---- Keyboard: every action in order, menus open and close from the keyboard -------------
    await page.focus('.tc-canvas-tab[aria-selected=true]');
    const order = [await page.evaluate(() => __name(document.activeElement))];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const here = await page.evaluate(() => document.activeElement.closest('.tc-tabbar,.tc-toolbar') ? __name(document.activeElement) : null);
      if (!here) break; order.push(here);
    }
    assert.deepEqual(order, ['Canvas 1 (1 card)', 'Add canvas tab', 'Tab actions', '+ Add plot', 'Tidy up', 'Text', 'Shapes', 'Undo', 'Redo', 'Figure page (print preview)', 'Analysis tools', 'Export figure', 'More canvas actions'], 'Tab walks every header action in visual order');
    const analysis = page.locator('.ts-analysis > .ts-analysis-trigger'), onTrigger = () => page.evaluate(() => document.activeElement.matches('.ts-analysis > .ts-analysis-trigger'));
    const openTool = async name => { await analysis.focus(); await page.keyboard.press('Enter'); await page.waitForSelector('#team-tools-drawer:not([hidden])'); await page.focus(`#team-tools-drawer .ttd-open[aria-label="Open ${name}"]`); await page.keyboard.press('Enter'); await page.waitForTimeout(50); };
    await analysis.focus(); await page.keyboard.press('Enter');
    assert.equal(await analysis.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'ttd-close', 'Enter opens the tools drawer, focus on its Close');
    assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll('#team-tools-drawer .ttd-name')).map(n => n.textContent)), [...TOOLS, '3D cell'], 'the drawer lists every analysis tool and the 3D cell');
    // Opus H1: on the normal Canvas the drawer takes the inspector's column at the inspector's width; the
    // canvas keeps its width, so the header keeps its one row and the drawer covers no header control.
    // shell.js re-fits the toolbar from a ResizeObserver: measure once that has run.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const docked = await page.evaluate(() => {
      const d = document.getElementById('team-tools-drawer'), layout = document.querySelector('#team-canvas-root .tc-layout'), main = document.querySelector('.tc-main').getBoundingClientRect(), dr = d.getBoundingClientRect();
      const tabs = __r(document.querySelector('.tc-main > .tc-tabbar')), bar = __r(document.querySelector('.tc-main > .tc-toolbar'));
      const at = s => { const n = document.querySelector(s), r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return {free: !!hit && n.contains(hit), hit: hit ? hit.tagName.toLowerCase() + '.' + String(hit.className).trim().split(/\s+/).join('.') : null}; };
      const header = ['.ts-analysis-trigger', '.ts-export > .ts-menu-trigger', '.ts-more > .ts-menu-trigger', '.tc-canvas-tab[aria-selected=true]'].map(at);
      return {inGrid: d.parentElement === layout && d.classList.contains('ttd-docked') && getComputedStyle(d).position !== 'fixed', inspectorShown: (n => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden')(document.querySelector('.ts-inspector-column .tc-selection-inspector, .ts-inspector-column .ts-inspector-empty')), // the column stays laid out (frozen mascot geometry); its content is hidden

        besideCanvas: dr.left >= main.right - 1, onScreen: dr.right <= innerWidth + 1, oneRow: Math.round(bar.height) === 42 && Math.abs(tabs.top - bar.top) <= 1,
        header: header.map(h => h.free), hits: header.map(h => h.hit)};
    });
    const hits = docked.hits; delete docked.hits;
    assert.deepEqual(docked, {inGrid: true, inspectorShown: false, besideCanvas: true, onScreen: true, oneRow: true, header: [true, true, true, true]}, 'the drawer docks in the inspector column, beside the canvas and its one-row header (hit at each centre: ' + JSON.stringify(hits) + ')');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.querySelector('.ts-inspector-column').getClientRects().length > 0 && !document.querySelector('#team-canvas-root .tc-layout').classList.contains('ttd-open')), true, 'closing the drawer brings the inspector column back');
    assert.equal(await analysis.getAttribute('aria-expanded'), 'false', 'Escape closes the drawer');
    assert.equal(await onTrigger(), true, 'Escape returns to the trigger');
    await openTool('3D cell');
    assert.deepEqual(await page.evaluate(() => guideClicks), ['6'], '3D cell opens the 3D cell step');
    assert.equal(await onTrigger(), true, 'focus returns to the trigger');
    assert.equal(await analysis.getAttribute('aria-expanded'), 'false');
    await openTool('Heatmap');
    assert.deepEqual(await page.evaluate(() => guideClicks), ['6', 'Heatmap'], 'an analysis tool opens from the same drawer');
    const moreTrigger = page.locator('.ts-more > .ts-menu-trigger');
    await moreTrigger.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => __name(document.activeElement)), 'Paste plot', '⋯ opens from the keyboard too');
    // Sol M5: an open toolbar menu owns Escape. Document handlers that close other things on an Escape nobody
    // handled (companion_assistant.js closes the chat, canvas_viewport.js leaves the expanded Canvas)
    // must not also run.
    await page.evaluate(() => { window.docEsc = 0; document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) window.docEsc++; }); });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.querySelector('.ts-more > .ts-menu').dataset.open), 'false', 'Escape closes ⋯');
    assert.equal(await page.evaluate(() => document.activeElement.matches('.ts-more > .ts-menu-trigger')), true, 'focus returns to ⋯');
    const exportTrigger = page.locator('.ts-export > .ts-menu-trigger');
    await exportTrigger.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('.ts-export > .ts-menu')), true, 'Export figure opens from the keyboard');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.querySelector('.ts-export > .ts-menu').dataset.open), 'false', 'Escape closes Export figure');
    assert.equal(await exportTrigger.evaluate(el => el === document.activeElement), true, 'focus returns to Export figure');
    assert.equal(await page.evaluate(() => window.docEsc), 0, 'the menus own their Escape: no document handler (companion, expanded Canvas) sees it');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.docEsc), 1, 'with no menu open, Escape reaches the document handlers again');

    // ---- Mode hint shares the band, never the band's height -----------------------------------
    const hint = () => page.evaluate(() => { const n = document.querySelector('.tc-band-status > .ts-mode-hint'); return {there: !!n, shown: __v(n), text: n && n.textContent, band: __r(document.querySelector('.tc-band-status')).height, scroll: __r(document.querySelector('.tc-scroll')).top}; });
    const idle = await hint();
    assert.ok(idle.there && idle.shown && /^Draft: edit live plots/.test(idle.text), 'the Draft hint shows in the idle band slot');
    await page.evaluate(() => { document.querySelector('.tc-status').textContent = 'Added Heatmap.'; });
    await page.waitForFunction(() => document.querySelector('.tc-band-status > .ts-mode-hint').hidden);
    const busy = await hint();
    assert.equal(busy.band, idle.band, 'the band keeps its height'); assert.equal(busy.scroll, idle.scroll, 'the canvas does not move');
    assert.equal(await page.evaluate(() => __v(document.querySelector('.tc-status'))), true, 'the notice takes the slot');
    await tabMenu(page, '1440');
    assert.deepEqual(errors, [], 'no page errors at 1440');
    await page.close();

    // ---- 1280: still one row, nothing overlaps ----------------------------------------------
    const p1280 = await open(browser, 1280, 800);
    h = await header(p1280.page);
    assert.ok(Math.abs(h.tabs.top - h.bar.top) <= 1 && Math.abs(h.tabs.bottom - h.bar.bottom) <= 1, 'one header row at 1280');
    assert.ok(h.card.top < 160, `first card above 160 px at 1280 (${h.card.top})`);
    await p1280.page.close();

    // ---- The inspector open, on the normal and on the expanded Canvas (RC1): the canvas column narrows;
    // the header stays one row because groups move into ⋯ when needed (shell.js fitTools levels), and
    // every action stays reachable exactly once. The companion is the floating dock: no column here.
    const ACTIONS = {'+ Add plot': ['+ Add plot'], 'Tidy up': ['Tidy up'], 'Text': ['Text'], 'Shapes': ['Shapes'], 'Undo': ['Undo'], 'Redo': ['Redo'],
      'Analysis tools': ['Analysis tools…'], 'Export figure': ['Export figure: SVG · vector', 'Export figure: PDF', 'Print figure']};
    for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) for (const expanded of [false, true]) {
      const {page: pg, errors: errs} = await open(browser, width, height);
      const full = (await controls(pg)).length;
      await pg.evaluate(expanded => {
        const layout = document.querySelector('#team-canvas-root .tc-layout'), inspector = document.querySelector('.tc-selection-inspector');
        inspector.hidden = false; layout.classList.add('tc-inspecting');
        if (expanded) { document.getElementById('team-canvas-root').classList.add('tc-focus-mode'); document.body.classList.add('ts-canvas-focus'); }
        window.dispatchEvent(new Event('resize'));
      }, expanded);
      await pg.waitForFunction(() => { const t = document.querySelector('.tc-main > .tc-tabbar').getBoundingClientRect(), b = document.querySelector('.tc-main > .tc-toolbar').getBoundingClientRect(); return Math.abs(t.top - b.top) <= 1 && Math.round(b.height) === 42; }, null, {timeout: 2000}).catch(() => {});
      await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const at = `${width} px, inspector open${expanded ? ', expanded canvas' : ''}`;
      const insp = await pg.evaluate(() => { const r = document.querySelector('.tc-selection-inspector').getBoundingClientRect(); return {width: r.width, main: document.querySelector('.tc-main').getBoundingClientRect().width}; });
      assert.ok(insp.width > 0 && insp.main < width, `the inspector is open beside the canvas (${at}: ${JSON.stringify(insp)})`);
      h = await header(pg);
      assert.ok(Math.abs(h.tabs.top - h.bar.top) <= 1 && Math.abs(h.tabs.bottom - h.bar.bottom) <= 1, `tabs and toolbar share one row (${at}): ${JSON.stringify([h.tabs, h.bar])}`);
      assert.equal(Math.round(h.bar.height), 42, `one 42px header row (${at})`);
      assert.ok(h.tabs.right <= h.bar.left + 1, `tabs and toolbar do not overlap (${at})`);
      const row = await controls(pg);
      for (const c of row) assert.ok(c.rect.top >= h.bar.top - 1 && c.rect.bottom <= h.bar.bottom + 1, `${c.name} stays in the header row (${at})`);
      for (const c of row) assert.ok(c.rect.left >= 0 && c.rect.right <= width + 1, `${c.name} stays on screen (${at})`);
      const inBar = row.map(c => c.name), inMore = (await menuItems(pg, 'ts-more')).filter(i => i.shown).map(i => i.name);
      for (const name of ['Figure page (print preview)', 'More canvas actions']) assert.ok(inBar.includes(name), `${name} stays in the row (${at}): ${inBar.join(', ')}`);
      for (const [action, items] of Object.entries(ACTIONS)) {
        const bar = inBar.includes(action), menu = items.every(i => inMore.includes(i));
        assert.ok(bar !== menu, `${action} is offered exactly once, in the row or in ⋯ (${at}; row: ${inBar.join(', ')}; ⋯: ${inMore.join(', ')})`);
      }
      if (width <= 1280) assert.ok(Object.keys(ACTIONS).some(k => !inBar.includes(k)), `some groups moved into ⋯ (${at}): ${inBar.join(', ')}`);
      console.log(`  ${at}: ${inBar.length}/${full} controls in the row, ⋯ carries ${inMore.filter(n => Object.values(ACTIONS).flat().includes(n)).join(', ') || 'no moved action'}`);
      // The moved actions still run from ⋯ (same proxies).
      if (inMore.includes('Undo')) {
        await pg.evaluate(() => { window.undoSeen = 0; document.querySelector('.ts-tools > .ts-tool[aria-label="Undo"]').addEventListener('keydown', e => { if (e.key === 'z') window.undoSeen++; }); });
        await pg.locator('.ts-more > .ts-menu-trigger').click();
        await pg.locator('.ts-more .ts-menu-item', {hasText: /^Undo$/}).click();
        assert.equal(await pg.evaluate(() => window.undoSeen), 1, `Undo in ⋯ runs the bar's Undo (${at})`);
      }
      await tabMenu(pg, at);
      // Closing the inspector gives the width back: the row fills again with no stale level.
      await pg.evaluate(() => { document.querySelector('#team-canvas-root .tc-layout').classList.remove('tc-inspecting'); document.querySelector('.tc-selection-inspector').hidden = true; window.dispatchEvent(new Event('resize')); });
      await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const wide = (await controls(pg)).map(c => c.name);
      assert.ok(wide.length >= inBar.length, `closing the inspector never moves more actions into ⋯ (${at}): ${wide.join(', ')}`);
      if (width >= 1280) for (const name of ['Undo', 'Redo', 'Analysis tools', 'Export figure', '+ Add plot']) assert.ok(wide.includes(name), `${name} is in the row when the inspector closes (${at}): ${wide.join(', ')}`);
      assert.deepEqual(errs, [], `no page errors (${at})`);
      await pg.close();
    }

    // ---- 390: tabs over the toolbar, every action on screen or in ⋯ ------------------------
    const p390 = await open(browser, 390, 844), m = p390.page;
    h = await header(m);
    assert.ok(h.bar.top >= h.tabs.bottom - 1, 'phones stack the toolbar under the tabs');
    assert.ok(Math.abs(h.band.top - h.bar.bottom) <= 1 && Math.abs(h.scroll.top - h.band.bottom) <= 1, 'band and canvas follow the header without a gap');
    const small = await controls(m);
    for (const c of small) assert.ok(c.rect.left >= 0 && c.rect.right <= 390, `${c.name} stays on screen at 390 (${c.rect.left}–${c.rect.right})`);
    for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) {
      const a = small[i].rect, b = small[j].rect;
      assert.ok(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5, `${small[i].name} and ${small[j].name} do not overlap at 390`);
    }
    const names = small.map(c => c.name), compact = (await menuItems(m, 'ts-more')).filter(i => i.shown).map(i => i.name);
    // At most two header rows: the tabs, then one toolbar row (Haiku M4: four rows at 390 before).
    const rows = [...new Set(small.filter(c => c.rect.top >= h.bar.top - 1).map(c => Math.round(c.rect.top)))];
    assert.equal(rows.length, 1, `one toolbar row at 390 (control tops ${rows.join(', ')})`);
    assert.ok(h.bar.height <= 44, `the toolbar is one row high at 390 (${h.bar.height})`);
    for (const name of ['Tidy up', 'Text', 'Shapes']) assert.ok(names.includes(name) || compact.includes(name), `${name} is reachable at 390`);
    for (const name of ['+ Add plot', 'Figure page (print preview)', 'More canvas actions']) assert.ok(names.includes(name), `${name} is in the bar at 390`);
    // The rest of the bar is offered in ⋯ (the same actions).
    for (const name of ['Undo', 'Redo', 'Analysis tools…', 'Export figure: SVG · vector', 'Export figure: PDF', 'Print figure']) assert.ok(compact.includes(name), `${name} is in ⋯ at 390 (${compact.join(', ')})`);
    await m.locator('.ts-more > .ts-menu-trigger').click();
    await m.locator('.ts-more .ts-menu-item', {hasText: 'Analysis tools…'}).click();
    await m.waitForSelector('#team-tools-drawer:not([hidden])');
    const menuRect = await m.evaluate(() => __r(document.getElementById('team-tools-drawer')));
    assert.ok(menuRect.left >= 0 && menuRect.right <= 390, `the Analysis tools drawer opens on screen at 390 (${menuRect.left}–${menuRect.right})`);
    assert.equal(await m.evaluate(() => document.activeElement.className), 'ttd-close', 'focus moves into the drawer');
    await m.keyboard.press('Escape');
    assert.equal(await m.evaluate(() => document.activeElement.matches('.ts-more > .ts-menu-trigger')), true, 'closing returns focus to ⋯ (the visible opener)');
    await tabMenu(m, '390');
    assert.deepEqual(p390.errors, [], 'no page errors at 390');
    await m.close();
    console.log('PASS: one Canvas header (tabs + grouped toolbar + band slot), first card above 160 px at 1440, one control style, 3D cell and analysis tools in the one tools drawer, every action keyboard-reachable');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
