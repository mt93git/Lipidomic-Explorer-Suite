// Run with: node tests/dual-ui/test_team_mobile_steps.cjs
// R13 at 390x844: the guided seven-step bar and the workspace top bar collapse to one
// control (current step, "3 of 7", a list to jump between steps) that works by keyboard,
// closes on Escape / click outside and returns focus; tables scroll inside their own
// container with the Sample column fixed; nothing is wider than the viewport.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');

const W = 390, H = 844;
const css = f => path.resolve('www/team/css', f);
const js = f => path.resolve('www/team/js', f);

// Wiring: one head line registers the assets, after the workspace shell stylesheet.
const teamUi = fs.readFileSync('R/frontends/team/ui.R', 'utf8');
for (const asset of ['css/mobile_steps.css', 'js/mobile_steps.js', 'css/mobile_tables.css', 'js/mobile_tables.js'])
  assert.ok(teamUi.includes(`"www/team/${asset}"`), asset + ' is registered in the Team head');
assert.ok(teamUi.indexOf('"www/team/css/mobile_steps.css"') > teamUi.indexOf('"www/team/css/shell.css"'), 'mobile_steps.css loads after shell.css');
// Layer scale: the step list uses the popover layer with its fallback, no new z-index.
const stepsCss = fs.readFileSync(css('mobile_steps.css'), 'utf8'), tablesCss = fs.readFileSync(css('mobile_tables.css'), 'utf8');
assert.deepEqual(stepsCss.match(/z-index:[^;}]+/g), ['z-index:var(--z-popover,10200)']);
assert.equal(tablesCss.match(/z-index/g), null, 'the fixed column needs no z-index');

// The Team app loads Bootstrap 5 (bslib page_navbar), whose reboot makes every box border-box;
// without it guided.css's `.guide-page{width:100%}` plus its padding is 418 px wide here.
const REBOOT = '*,*::before,*::after{box-sizing:border-box}';
const LABELS = ['Experiment', 'Design', 'Quality', 'My question', 'Results', '3D Show', 'Share'];
const guidedHtml = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${REBOOT}</style></head>
<body class="guided-app" data-guide-step="3" style="margin:0">
  <div id="guide-navigation"><nav aria-label="Analysis workflow">${LABELS.map((l, i) =>
    `<button type="button" data-guide-step="${i + 1}" class="guide-step" aria-current="${i === 2 ? 'step' : 'false'}"><span>${i + 1}</span>${l}</button>`).join('')}</nav>
    <div class="guide-global-actions"><button type="button" class="guide-button" data-guide-step="5">All analysis tools</button><button type="button" class="guide-button" data-guide-tool="App Info">Help &amp; methods</button></div></div>
  <div class="guide-page" style="padding:22px 14px">
    <div class="guide-panel" id="filler" style="padding:16px"><h3>1. Review sample labels</h3><p>Plain text area used for the outside click.</p>
      <div class="dataTables_wrapper" id="dt"><div class="dataTables_scroll">
        <div class="dataTables_scrollHead" style="overflow:hidden;position:relative;border:0;width:100%"><div class="dataTables_scrollHeadInner" style="box-sizing:content-box;width:900px"><table style="width:900px;margin-left:0;border-collapse:collapse"><thead><tr>
          <th style="width:110px">Next run</th><th style="width:110px">Sample</th><th style="width:220px">Condition / cell type</th><th style="width:220px">Tissue / sample type</th><th style="width:240px">Animal / donor ID</th></tr></thead></table></div></div>
        <div class="dataTables_scrollBody" style="position:relative;overflow:auto;width:100%"><table style="width:900px;border-collapse:collapse"><tbody>${[1, 2, 3, 4, 5].map(i =>
          `<tr><td style="width:110px">Included</td><td style="width:110px">S0${i}</td><td>Control</td><td>Reference tissue</td><td>Animal ${i}</td></tr>`).join('')}</tbody></table></div>
      </div></div>
      <div class="shiny-html-output" id="plain"><table class="shiny-table table" style="width:100%"><thead><tr><th>Matrix_sample</th><th>Metadata_row</th><th>Condition / cell type</th><th>Tissue / sample type</th><th>Imported: Notes</th></tr></thead>
        <tbody><tr><td>S01</td><td>1</td><td>Control</td><td>Reference tissue</td><td>A&nbsp;long&nbsp;note&nbsp;that&nbsp;does&nbsp;not&nbsp;wrap&nbsp;at&nbsp;all</td></tr></tbody></table></div>
    </div>
  </div>
  <script>window.clicked=[];document.querySelectorAll('#guide-navigation nav [data-guide-step]').forEach(function(b){b.addEventListener('click',function(){
    window.clicked.push(Number(b.dataset.guideStep));document.querySelectorAll('#guide-navigation nav [data-guide-step]').forEach(function(o){o.setAttribute('aria-current',o===b?'step':'false');});});});</script>
</body></html>`;

// Elements wider than the viewport are allowed only inside a scroll container that fits.
async function overflowing(page) {
  return page.evaluate(vw => {
    const fits = r => r.left >= -0.5 && r.right <= vw + 0.5;
    const bad = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (!r.width || fits(r)) continue;
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o !== 'visible' && fits(p.getBoundingClientRect())) { clipped = true; break; } p = p.parentElement; }
      if (!clipped) bad.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + el.className) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
    }
    return { pageScroll: document.documentElement.scrollWidth, bad };
  }, W);
}
// Text that does not fit its own box (cut off or ellipsed).
async function clippedText(page, selector) {
  return page.$$eval(selector, els => els.filter(e => e.getClientRects().length && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)).map(e => e.textContent.trim()));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    // ---- Guided seven-step bar ------------------------------------------------------
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.setContent(guidedHtml);
    for (const f of ['guided.css', 'qw_a11y.css', 'qw_layers.css', 'mobile_steps.css', 'mobile_tables.css']) await page.addStyleTag({ path: css(f) });
    for (const f of ['mobile_steps.js', 'mobile_tables.js']) await page.addScriptTag({ path: js(f) });
    await page.waitForSelector('#guide-navigation .tw-compact-steps-trigger');
    const trigger = page.locator('#guide-navigation .tw-compact-steps-trigger');
    const list = page.locator('#guide-navigation .tw-compact-steps-menu');
    assert.equal(await page.locator('#guide-navigation > nav').isVisible(), false, 'the seven-button row is replaced on phones');
    assert.equal(await trigger.isVisible(), true);
    assert.equal(await page.getByRole('button', { name: 'Step 3 of 7 · Quality. Choose a step' }).count(), 1, 'current step and its position');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await trigger.getAttribute('aria-controls'), await list.getAttribute('id'));

    // Keyboard: Tab reaches the trigger, Enter opens on the current step, arrows move.
    await page.keyboard.press('Tab');
    assert.equal(await trigger.evaluate(t => t === document.activeElement), true, 'first stop in the bar');
    await page.keyboard.press('Enter');
    assert.equal(await list.isVisible(), true);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(await list.evaluate(l => getComputedStyle(l).zIndex), '10200', 'popover layer of qw_layers.css');
    const focused = () => page.evaluate(() => { const a = document.activeElement; return [a.querySelector('.tw-compact-steps-label') ? a.querySelector('.tw-compact-steps-label').textContent : a.textContent.trim(), a.getAttribute('aria-current')]; });
    assert.deepEqual(await focused(), ['Quality', 'step'], 'focus starts on the current step, which keeps aria-current');
    assert.equal(await list.locator('[aria-current="step"]').count(), 1);
    assert.deepEqual(await list.locator('.tw-compact-steps-label').allTextContents(), LABELS);
    // Every step in the open list reads at 4.5:1 or more, the current one and the others (the list sits
    // inside the dark step bar, whose light button text must not leak into it).
    const ratios = await list.evaluate(l => {
      const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
      const lum = c => { const [r, g, b] = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const bg = n => { for (let a = n; a; a = a.parentElement) { const c = rgb(getComputedStyle(a).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] > 0)) return c; } return [255, 255, 255]; };
      return Array.from(l.querySelectorAll('.tw-compact-steps-item')).map(b => {
        const fg = lum(rgb(getComputedStyle(b).color)), back = lum(bg(b)), opacity = Number(getComputedStyle(b).opacity);
        return {label: b.textContent.trim(), ratio: Math.round((Math.max(fg, back) + 0.05) / (Math.min(fg, back) + 0.05) * 10) / 10, opacity};
      });
    });
    for (const r of ratios) assert.ok(r.ratio >= 4.5 && r.opacity === 1, `step "${r.label}" reads at ${r.ratio}:1 (opacity ${r.opacity})`);
    await page.keyboard.press('ArrowDown'); assert.deepEqual((await focused())[0], 'My question');
    await page.keyboard.press('End'); assert.deepEqual((await focused())[0], 'Share');
    await page.keyboard.press('ArrowDown'); assert.deepEqual((await focused())[0], 'Experiment', 'arrows wrap');
    await page.keyboard.press('ArrowUp'); assert.deepEqual((await focused())[0], 'Share');
    await page.keyboard.press('Home'); assert.deepEqual((await focused())[0], 'Experiment');
    // The open list fits the phone and nothing in it is cut off.
    assert.deepEqual((await overflowing(page)).bad, []);
    assert.deepEqual(await clippedText(page, '#guide-navigation .tw-compact-steps-item, #guide-navigation .tw-compact-steps-trigger, #guide-navigation .guide-global-actions button'), []);

    // Escape closes and returns focus to the trigger.
    await page.keyboard.press('Escape');
    assert.equal(await list.isVisible(), false);
    assert.equal(await trigger.evaluate(t => t === document.activeElement), true, 'Escape returns focus');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');

    // ArrowDown on the trigger opens; Enter on a step activates the original button.
    await page.keyboard.press('ArrowDown');
    assert.equal(await list.isVisible(), true);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.clicked), [4], 'the original step 4 button handled the click');
    assert.equal(await list.isVisible(), false);
    assert.equal(await trigger.evaluate(t => t === document.activeElement), true, 'focus returns after choosing');
    await page.waitForFunction(() => document.querySelector('#guide-navigation .tw-compact-steps-name').textContent === 'My question');
    assert.equal(await page.locator('#guide-navigation .tw-compact-steps-pos').textContent(), '4 of 7');
    assert.equal(await list.locator('[aria-current="step"] .tw-compact-steps-label').textContent(), 'My question');

    // Click outside closes and hands focus back.
    await trigger.click();
    assert.equal(await list.isVisible(), true);
    const box = await page.locator('#filler p').boundingBox();
    await page.mouse.click(box.x + 4, box.y + box.height / 2);
    assert.equal(await list.isVisible(), false, 'click outside closes');
    assert.equal(await trigger.evaluate(t => t === document.activeElement), true, 'click outside returns focus');
    // Tabbing out of the list closes it.
    await page.keyboard.press('Enter'); await page.keyboard.press('End'); await page.keyboard.press('Tab');
    assert.equal(await list.isVisible(), false, 'Tab out closes');

    // ---- Tables: own scroller, fixed Sample column, edge cue ----------------------------
    await page.waitForFunction(() => document.getElementById('dt').dataset.twStickyCol === '2' && document.querySelector('#plain table').dataset.twStickyCol === '1');
    assert.equal(await page.locator('#dt .dataTables_scroll').evaluate(n => n.classList.contains('tw-scroll-right')), true, 'right-edge cue while columns are hidden');
    await page.evaluate(() => { const b = document.querySelector('#dt .dataTables_scrollBody'); b.scrollLeft = 320; document.querySelector('#dt .dataTables_scrollHead').scrollLeft = 320; b.dispatchEvent(new Event('scroll')); });
    const stick = await page.evaluate(() => {
      const box = document.querySelector('#dt .dataTables_scrollBody').getBoundingClientRect().left;
      const td = document.querySelector('#dt tbody tr td:nth-child(2)').getBoundingClientRect().left;
      const th = document.querySelector('#dt .dataTables_scrollHead th:nth-child(2)').getBoundingClientRect().left;
      const other = document.querySelector('#dt tbody tr td:nth-child(3)').getBoundingClientRect().left;
      return { box, td, th, other };
    });
    assert.ok(Math.abs(stick.td - stick.box) < 1.5, 'Sample cells stay at the left edge: ' + JSON.stringify(stick));
    assert.ok(Math.abs(stick.th - stick.box) < 1.5, 'the Sample header stays with them');
    assert.ok(stick.other < stick.box, 'the other columns scroll under it');
    await page.evaluate(() => { const t = document.querySelector('#plain table'); t.scrollLeft = 400; });
    await page.waitForTimeout(50);
    const plain = await page.evaluate(() => [document.querySelector('#plain table').getBoundingClientRect().left, document.querySelector('#plain td').getBoundingClientRect().left]);
    assert.ok(Math.abs(plain[0] - plain[1]) < 1.5, 'Matrix_sample stays fixed in a renderTable() table');
    const o = await overflowing(page);
    assert.ok(o.pageScroll <= W, 'no page-level horizontal scroll: ' + o.pageScroll);
    assert.deepEqual(o.bad, [], 'no element wider than the viewport');

    // Above 600 px the original bar is back and the compact control is gone.
    await page.setViewportSize({ width: 1280, height: 900 });
    assert.equal(await page.locator('#guide-navigation > nav').isVisible(), true);
    assert.equal(await trigger.isVisible(), false);
    await page.close();

    // ---- Workspace top bar (shell.js mirrors) ---------------------------------------------
    const ws = await browser.newPage({ viewport: { width: W, height: H } });
    const logo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="96"><rect width="240" height="96" fill="#fff"/></svg>');
    await ws.setContent(`<!doctype html><html lang="en"><head><style>${REBOOT}</style></head><body class="ts-shell-app guided-app" data-team-authenticated="true" style="margin:0">
      <nav class="navbar"><div class="container-fluid" style="display:flex;align-items:center"><a class="navbar-brand" href="#"><span class="guide-brand-lockup"><img id="navbar_brand_logo_img" alt="Libreros Lab" src="${logo}"><span class="guide-app-name">Lipidomic Explorer</span></span></a>
        <div class="ts-topbar-extras"><button type="button" class="ts-project">Project ▾</button>
          <nav class="ts-steps" aria-label="Analysis steps"><button type="button" class="ts-step"><em>1</em><span>Data</span></button><button type="button" class="ts-step is-current" aria-current="step"><em>2</em><span>Review</span></button><button type="button" class="ts-step" disabled><em>3</em><span>Canvas</span></button></nav>
          <div class="ts-topbar-right"><span class="ts-saved" role="status" aria-live="polite">Saved 2 minutes ago</span><button type="button" class="ts-signout">Sign out</button><span class="ts-avatar" aria-hidden="true">G</span></div></div></div></nav>
      <section id="team-workspace"><nav class="tw-steps" aria-label="Analysis steps">
        <button type="button" data-tw-stage="data" aria-current="false"><span>01</span><strong>Data</strong><small>Upload or resume</small></button>
        <button type="button" data-tw-stage="review" aria-current="step"><span>02</span><strong>Review</strong><small>Filter and inspect</small></button>
        <button type="button" data-tw-stage="canvas" aria-current="false" disabled><span>03</span><strong>Canvas</strong><small>Explore and build figures</small></button></nav></section>
      <script>window.LIPIDOMIC_TEAM_WORKSPACE=true;window.stages=[];document.querySelectorAll('[data-tw-stage]').forEach(function(b){b.addEventListener('click',function(){window.stages.push(b.dataset.twStage);});});</script>
    </body></html>`);
    for (const f of ['shell.css', 'qw_a11y.css', 'qw_layers.css', 'mobile_steps.css']) await ws.addStyleTag({ path: css(f) });
    await ws.addScriptTag({ path: js('mobile_steps.js') });
    await ws.waitForSelector('.navbar .tw-compact-workspace');
    const wTrigger = ws.locator('.navbar .tw-compact-steps-trigger'), wList = ws.locator('.navbar .tw-compact-steps-menu');
    assert.equal(await ws.locator('.navbar .ts-steps').isVisible(), false);
    assert.equal(await ws.getByRole('button', { name: 'Step 2 of 3 · Review. Choose a step' }).count(), 1, 'position stays in the accessible name');
    assert.equal(await ws.locator('.ts-saved').getAttribute('title'), 'Saved 2 minutes ago', 'the save text stays available');
    assert.equal(await ws.locator('.ts-signout').isVisible(), true, 'Sign out stays visible');
    let wo = await overflowing(ws);
    assert.ok(wo.pageScroll <= W, 'no page-level horizontal scroll in the workspace bar');
    assert.deepEqual(wo.bad, []);
    assert.deepEqual(await clippedText(ws, '.navbar .tw-compact-steps-trigger, .navbar .ts-signout'), []);
    await wTrigger.focus(); await ws.keyboard.press('Enter');
    assert.equal(await wList.isVisible(), true);
    assert.equal(await wList.evaluate(l => getComputedStyle(l).zIndex), '10200');
    assert.equal(await wList.locator('button').nth(2).isDisabled(), true, 'a locked stage stays disabled');
    wo = await overflowing(ws); assert.deepEqual(wo.bad, [], 'the open list fits the phone');
    await ws.keyboard.press('ArrowDown'); // skips the disabled Canvas stage and wraps to Data
    assert.equal(await ws.evaluate(() => document.activeElement.textContent), '1Data');
    await ws.keyboard.press('Enter');
    assert.deepEqual(await ws.evaluate(() => window.stages), ['data']);
    assert.equal(await wTrigger.evaluate(t => t === document.activeElement), true);
    await ws.close();

    // ---- Workspace tables (FIXR3B item 6, Sonnet M4) -----------------------------------------
    // The Team workspace's Data and Review content is not all under .guide-page: a Review pane's
    // renderTable() output and a DataTable in a dialog Shiny adds to <body>. At 390 they get the same
    // rule as the guided pages: their own scroller, the Sample column fixed, nothing wider than the
    // phone. A table on the Canvas is left alone.
    const wt = await browser.newPage({ viewport: { width: W, height: H } });
    const wide = (id, first) => `<table class="shiny-table table" style="width:100%"><thead><tr><th>${first}</th><th>Sample</th><th>Condition / cell type</th><th>Tissue / sample type</th><th>Imported: Notes</th></tr></thead>
      <tbody>${[1, 2, 3].map(i => `<tr><td>${i}</td><td>S0${i}</td><td>Control</td><td>Reference tissue</td><td>A&nbsp;long&nbsp;note&nbsp;that&nbsp;does&nbsp;not&nbsp;wrap&nbsp;at&nbsp;all&nbsp;${id}</td></tr>`).join('')}</tbody></table>`;
    await wt.setContent(`<!doctype html><html lang="en"><head><style>${REBOOT}</style></head><body class="team-workspace-app" data-tw-screen="review-prepare" data-team-authenticated="true" style="margin:0">
      <div class="tab-content"><div class="tab-pane active" data-value="Preparation"><div class="tw-review-panel" style="padding:12px">
        <h3>Samples in the next run</h3><div class="shiny-html-output" id="ws-review">${wide('review', 'Row')}</div></div></div></div>
      <div id="shiny-modal" class="modal show" style="display:block"><div class="modal-dialog"><div class="modal-content"><div class="modal-body">
        <div class="dataTables_wrapper" id="ws-dt"><div class="dataTables_scroll">
          <div class="dataTables_scrollHead" style="overflow:hidden;position:relative;border:0;width:100%"><div class="dataTables_scrollHeadInner" style="box-sizing:content-box;width:900px"><table style="width:900px;margin-left:0;border-collapse:collapse"><thead><tr>
            <th style="width:110px">Next run</th><th style="width:110px">Sample</th><th style="width:220px">Condition / cell type</th><th style="width:220px">Tissue / sample type</th><th style="width:240px">Animal / donor ID</th></tr></thead></table></div></div>
          <div class="dataTables_scrollBody" style="position:relative;overflow:auto;width:100%"><table style="width:900px;border-collapse:collapse"><tbody>${[1, 2, 3].map(i =>
            `<tr><td style="width:110px">Included</td><td style="width:110px">S0${i}</td><td>Control</td><td>Reference tissue</td><td>Animal ${i}</td></tr>`).join('')}</tbody></table></div>
        </div></div></div></div></div></div>
      <section id="team-canvas-root" style="max-width:100%;overflow:hidden"><div class="shiny-html-output" id="ws-canvas">${wide('canvas', 'Row')}</div></section>
    </body></html>`);
    await wt.addStyleTag({ path: css('mobile_tables.css') });
    await wt.addScriptTag({ path: js('mobile_tables.js') });
    await wt.waitForFunction(() => document.querySelector('#ws-review table').dataset.twStickyCol === '2' && document.getElementById('ws-dt').dataset.twStickyCol === '2');
    assert.equal(await wt.evaluate(() => document.querySelector('#ws-canvas table').dataset.twStickyCol), undefined, 'a Canvas table is not restyled');
    // renderTable() in a Review pane: its own scroller, Sample fixed.
    await wt.evaluate(() => { document.querySelector('#ws-review table').scrollLeft = 400; });
    await wt.waitForTimeout(50);
    const wr = await wt.evaluate(() => { const t = document.querySelector('#ws-review table'); return { scrolls: t.scrollWidth > t.clientWidth && t.scrollLeft > 0, box: t.getBoundingClientRect().left, sample: t.querySelector('tbody td:nth-child(2)').getBoundingClientRect().left, head: t.querySelector('thead th:nth-child(2)').getBoundingClientRect().left }; });
    assert.ok(wr.scrolls, 'the Review table scrolls inside itself: ' + JSON.stringify(wr));
    assert.ok(Math.abs(wr.sample - wr.box) < 1.5 && Math.abs(wr.head - wr.box) < 1.5, 'the Review table keeps Sample fixed: ' + JSON.stringify(wr));
    // A DataTable in a dialog: Sample (column 2) fixed while the body scrolls; the edge cue follows.
    assert.equal(await wt.locator('#ws-dt .dataTables_scroll').evaluate(n => n.classList.contains('tw-scroll-right')), true, 'right-edge cue in the dialog table');
    await wt.evaluate(() => { const b = document.querySelector('#ws-dt .dataTables_scrollBody'); b.scrollLeft = 320; document.querySelector('#ws-dt .dataTables_scrollHead').scrollLeft = 320; b.dispatchEvent(new Event('scroll')); });
    const wd = await wt.evaluate(() => ({ box: document.querySelector('#ws-dt .dataTables_scrollBody').getBoundingClientRect().left, td: document.querySelector('#ws-dt tbody tr td:nth-child(2)').getBoundingClientRect().left, th: document.querySelector('#ws-dt .dataTables_scrollHead th:nth-child(2)').getBoundingClientRect().left }));
    assert.ok(Math.abs(wd.td - wd.box) < 1.5 && Math.abs(wd.th - wd.box) < 1.5, 'the dialog table keeps Sample fixed: ' + JSON.stringify(wd));
    const wto = await overflowing(wt);
    assert.ok(wto.pageScroll <= W, 'no page-level horizontal scroll in the workspace: ' + wto.pageScroll);
    assert.deepEqual(wto.bad, [], 'no workspace element wider than the viewport');
    await wt.close();
  } finally {
    await browser.close();
  }
  console.log('PASS: Team mobile steps (compact step bars, keyboard menu, fixed Sample column, no overflow at 390)');
})().catch(err => { console.error(err); process.exit(1); });
