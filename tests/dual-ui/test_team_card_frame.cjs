// RC4 wave 2: a clean card and a tabbed inspector. A real composition card (canvas.js, plot_exports.js,
// card_figure.js, card_status.js, canvas_inspector.js + canvas_inspector_export.js, card_frame.js and their
// stylesheets) in the shell: the card shows only its title with the status badge, the plot and a footer
// with Edit, Duplicate and ⋯, at most 380 px tall; the inspector has the tabs Data, Appearance, Statistics
// and Export (role=tablist, arrow keys) and every chip and download of the card is reachable from it,
// live and finished. Nothing is cloned: the same elements move and come back.
const { chromium } = require('../browser/ci/node_modules/playwright');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const ID = 'results_dashboard-plot_comp';
(async () => {
  const jquery = execFileSync('Rscript', ['--vanilla', '-e', 'cat(system.file("www/shared/jquery.min.js",package="shiny"))'], { encoding: 'utf8' }).trim();
  const plotly = execFileSync('Rscript', ['--vanilla', '-e', 'cat(system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js",package="plotly"))'], { encoding: 'utf8' }).trim();
  const browser = await chromium.launch({ headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.setContent(`<body class="ts-shell-app" style="margin:0">
      <div class="rd-dashboard"><div class="rd-card"><div class="rd-card-head"><h3>Composition overview</h3>
        <label>Level <select id="results_dashboard-comp_level"><option>Class</option><option>Species</option></select></label>
        <a id="results_dashboard-dl_comp" class="shiny-download-link" href="data:text/csv,a" download="comp.csv">CSV</a></div>
        <span class="rd-chip">3 groups</span>
        <div id="${ID}" class="plotly html-widget-output" style="height:420px"></div></div></div>
      <section id="team-canvas-root"><div class="tc-layout tc-library-hidden"><aside class="tc-catalog"><button class="tc-library-toggle">Library</button><input class="tc-search"><div class="tc-list"></div></aside>
        <div class="tc-main"><div class="tc-toolbar"><button class="tc-reset">Return all</button><button class="tc-arrange">Arrange</button></div>
        <div class="tc-scroll" style="height:760px"><div class="tc-board"><div class="tc-empty"></div></div></div><div class="tc-status"></div></div></div></section></body>`);
    for (const css of ['canvas.css', 'canvas_viewport.css', 'canvas_inspector.css', 'card_figure.css', 'card_status.css', 'card_frame.css']) await p.addStyleTag({ path: path.resolve('www/team/css/' + css) });
    await p.addScriptTag({ path: jquery }); await p.addScriptTag({ path: plotly });
    const data = [{ type: 'bar', x: ['A', 'B', 'C'], y: [3, 2, 4] }], layout = { margin: { t: 10 } };
    await p.evaluate(([d, l, id]) => Plotly.newPlot(id, d, l), [data, layout, ID]);
    for (const js of ['canvas_viewport.js', 'plot_exports.js', 'canvas.js', 'canvas_inspector_export.js', 'canvas_inspector.js', 'card_figure.js', 'card_status.js', 'card_frame.js']) await p.addScriptTag({ path: path.resolve('www/team/js/' + js) });
    // Originals, kept to prove they move and come back instead of being cloned.
    await p.evaluate(() => { window.orig = { select: document.getElementById('results_dashboard-comp_level'), csv: document.getElementById('results_dashboard-dl_comp'), chip: document.querySelector('.rd-chip'), bar: document.querySelector('.plot-export-bar') }; });
    assert.ok(await p.evaluate(() => !!orig.bar), 'plot_exports.js mounted the download row');
    await p.evaluate(id => TeamCanvas.addPlot(id), ID);
    await p.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state', { detail: { ready: true, pending: false, running: false, revision: 1 } })));
    await p.evaluate(async ([d, l, id]) => { const gd = document.getElementById(id); jQuery(gd).trigger({ type: 'shiny:value', value: { x: { data: d, layout: l } } }); await Plotly.react(gd, d, l); }, [data, layout, ID]);
    const until = (fn, arg) => p.waitForFunction(fn, arg, { timeout: 10000 });
    await until(() => { const n = document.querySelector('.tc-node'); return n && n.classList.contains('tc-card-framed') && n.classList.contains('tc-figure-card') && n.querySelector('.tc-card-status[data-state]'); });

    // Card face: title + status badge, the plot, the footer. Everything else parked off the card.
    const face = async () => p.evaluate(id => {
      const r = el => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
      const node = document.querySelector('.tc-node'), head = node.querySelector(':scope > .tc-node-head'), foot = node.querySelector(':scope > .tc-card-foot');
      const bar = head.querySelector(':scope > .tc-card-actions'), content = node.querySelector(':scope > .tc-content'), plot = document.getElementById(id);
      const actions = [...bar.querySelectorAll(':scope > button, :scope > .tc-card-more-wrap > .tc-card-more')].filter(b => b.getClientRects().length);
      return {
        node: r(node), head: r(head), foot: r(foot), bar: r(bar), plot: r(plot), styleHeight: node.style.height, docked: bar.classList.contains('tc-card-docked'),
        zoom: node.currentCSSZoom, framed: node.classList.contains('tc-card-framed'),
        chip: r(head.querySelector(':scope > .tc-card-status')), title: r(head.querySelector(':scope > strong')),
        names: actions.map(b => b.getAttribute('aria-label') || b.textContent),
        uncovered: actions.every(b => { const x = b.getBoundingClientRect(); return document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2) === b; }),
        parked: [orig.select, orig.csv, orig.chip, orig.bar].map(el => el.getBoundingClientRect().right < node.getBoundingClientRect().left),
        contentScrolls: content.scrollHeight > content.clientHeight + 1,
        headButtons: [...head.children].filter(c => c.tagName === 'BUTTON').length
      };
    }, ID);
    for (const width of [1440, 1280]) {
      await p.setViewportSize({ width, height: 900 });
      // "At 100 %" is this block's premise: set it (the camera may have framed the new card at another zoom)
      // and bring the card into view, as the zoom sweep below does.
      await p.evaluate(() => {
        TeamCanvasViewport.setScale(1);
        const s = document.querySelector('.tc-scroll'), n = document.querySelector('.tc-node');
        s.scrollLeft = Math.max(0, n.offsetLeft - 16); s.scrollTop = Math.max(0, n.offsetTop - 16);
      });
      await until(() => { const n = document.querySelector('.tc-node'), f = n.querySelector('.tc-card-foot'), pl = n.querySelector('.js-plotly-plot'); return f && pl && pl.getBoundingClientRect().bottom <= f.getBoundingClientRect().top + 1; });
      // card_figure.js re-places the bar on the frame after a zoom or scroll.
      await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const f = await face();
      assert.equal(f.styleHeight, '380px', 'a new composition card opens compact in the shell');
      assert.ok(f.node.height <= 380, `${width}: composition card is ${f.node.height}px tall (max 380)`);
      assert.ok(f.plot.height >= 220, `${width}: the compact card gives its plot ${f.plot.height}px (min 220)`);
      assert.ok(f.docked, `${width}: at 100% the action bar is docked in the footer (Canvas zoom ${f.zoom}, card ${Math.round(f.node.width)}px wide, framed ${f.framed})`);
      assert.deepEqual(f.parked, [true, true, true, true], `${width}: module controls, chip and downloads are not on the card face`);
      assert.ok(f.plot.top >= f.head.bottom - 1 && f.plot.bottom <= f.foot.top + 1, `${width}: the plot sits between the header and the footer`);
      assert.equal(f.contentScrolls, false, `${width}: the plot fits its card (no inner scroll)`);
      assert.ok(f.bar.top >= f.foot.top - 1 && f.bar.bottom <= f.node.bottom + 1 && f.bar.left >= f.node.left && f.bar.right <= f.node.right, `${width}: the action bar is the card's footer`);
      assert.deepEqual(f.names, ['Edit', 'Duplicate', 'More card actions'], `${width}: footer actions are Edit, Duplicate and ⋯`);
      assert.ok(f.uncovered, `${width}: each footer action is what sits under its centre`);
      assert.ok(f.chip.top >= f.head.top && f.chip.bottom <= f.head.bottom && f.chip.left >= f.title.right - 1, `${width}: the status badge keeps its slot in the header`);
      assert.equal(f.headButtons, 0, 'no loose buttons left in the header');
    }

    // ⋯: every other original header button, moved; Escape folds it back without deselecting the card.
    const more = p.locator('.tc-node .tc-card-more');
    await more.click();
    assert.equal(await more.getAttribute('aria-expanded'), 'true');
    const menu = p.locator('.tc-node .tc-card-menu');
    const items = await menu.locator('button').evaluateAll(bs => bs.filter(b => b.getClientRects().length).map(b => b.textContent));
    for (const name of ['Copy', 'Finish plot', 'Return']) assert.ok(items.includes(name), `⋯ offers ${name} (${items.join(', ')})`);
    assert.equal(await p.evaluate(() => document.activeElement.closest('.tc-card-menu') !== null), true, 'opening ⋯ focuses its first action');
    const inCard = await p.evaluate(() => { const m = document.querySelector('.tc-card-menu').getBoundingClientRect(), n = document.querySelector('.tc-node').getBoundingClientRect(); return m.top >= n.top && m.bottom <= n.bottom && m.left >= n.left && m.right <= n.right; });
    assert.ok(inCard, 'the ⋯ menu opens inside the card, above its footer');
    await p.keyboard.press('Escape');
    assert.equal(await menu.isHidden(), true, 'Escape closes ⋯');
    assert.equal(await p.evaluate(() => document.activeElement.classList.contains('tc-card-more')), true, 'focus returns to ⋯');
    assert.equal(await p.evaluate(() => document.querySelector('.tc-node').classList.contains('is-selected')), true, 'Escape in ⋯ does not deselect the card');

    // Edit opens the inspector on its tabs. Tabs: role=tablist, arrows, Home/End, roving tabindex.
    await p.locator('.tc-node .tc-card-edit').click();
    const inspector = p.locator('#tc-selection-inspector');
    await until(() => document.activeElement && document.activeElement.getAttribute('role') === 'tab');
    assert.equal(await inspector.isVisible(), true);
    assert.equal(await inspector.locator('[role=tablist]').count(), 1);
    const tabNames = await inspector.getByRole('tab').allTextContents();
    assert.deepEqual(tabNames, ['Data', 'Appearance', 'Statistics', 'Export']);
    const tabState = () => p.evaluate(() => [...document.querySelectorAll('#tc-selection-inspector [role=tab]')].map(t => [t.textContent, t.getAttribute('aria-selected'), t.tabIndex, !document.getElementById(t.getAttribute('aria-controls')).hidden]));
    await p.keyboard.press('End');
    assert.deepEqual((await tabState()).map(t => t[1]), ['false', 'false', 'false', 'true'], 'End selects Export');
    assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Export');
    await p.keyboard.press('ArrowRight');
    assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Data', 'ArrowRight wraps to Data');
    await p.keyboard.press('ArrowLeft'); await p.keyboard.press('Home');
    const home = await tabState();
    assert.deepEqual(home.map(t => [t[1], t[2], t[3]]), [['true', 0, true], ['false', -1, false], ['false', -1, false], ['false', -1, false]], 'one selected tab, one tab stop, one panel');
    for (const width of [1440, 390]) {
      await p.setViewportSize({ width, height: 900 });
      const fit = await p.evaluate(() => { const list = document.querySelector('#tc-selection-inspector [role=tablist]'), l = list.getBoundingClientRect(); return [...list.children].every(t => { const b = t.getBoundingClientRect(); return b.left >= l.left - 0.5 && b.right <= l.right + 0.5; }) && list.scrollWidth <= list.clientWidth + 1; });
      assert.ok(fit, `${width}: the four tabs fit the inspector`);
    }
    await p.setViewportSize({ width: 1440, height: 900 });

    // Reachability: every chip and download of the card, as real elements or mirrors, from the inspector.
    const reach = await p.evaluate(() => {
      const ins = document.getElementById('tc-selection-inspector'), data = document.getElementById('tc-inspector-panel-data'), exp = document.getElementById('tc-inspector-panel-export');
      const mirrors = [...exp.querySelectorAll('.tc-export-mirror')].map(b => b.textContent);
      const status = ins.querySelector('.tc-inspector-status strong'), chip = document.querySelector('.tc-node .tc-card-status-text');
      return {
        select: data.contains(orig.select), chip: data.contains(orig.chip), csvInData: data.contains(orig.csv), csvMirrored: mirrors.includes('CSV'),
        bar: exp.contains(orig.bar), barButtons: [...orig.bar.querySelectorAll('button')].map(b => b.textContent),
        status: status && status.textContent, chipText: chip && chip.textContent, single: document.querySelectorAll('#results_dashboard-comp_level').length
      };
    });
    assert.ok(reach.select && reach.chip, 'Data holds the module controls and the chip (moved, same elements)');
    assert.ok(reach.csvInData && reach.csvMirrored, 'the CSV link moves with its row to Data and is mirrored in Export');
    assert.ok(reach.bar, 'Export holds the plot download row (moved, same element)');
    assert.deepEqual(reach.barButtons.sort(), ['JPG', 'PDF', 'PNG', 'SVG']);
    assert.equal(reach.status, reach.chipText, 'the status badge is mirrored above the tabs');
    assert.equal(reach.single, 1, 'no control is cloned');
    await inspector.getByRole('tab', { name: 'Export' }).click();
    await p.evaluate(() => { window.csvClicks = 0; orig.csv.addEventListener('click', e => { e.preventDefault(); csvClicks++; }); });
    await inspector.getByRole('button', { name: 'CSV', exact: true }).click();
    assert.equal(await p.evaluate(() => csvClicks), 1, 'the Export mirror clicks the original download link');
    assert.equal(await inspector.locator('.plot-export-bar').getByRole('button', { name: /^Download PNG/ }).isVisible(), true, 'plot image downloads are usable in Export');

    // Close: everything goes home.
    await p.keyboard.press('Escape');
    await until(() => document.getElementById('tc-selection-inspector').hidden);
    assert.deepEqual(await p.evaluate(() => [orig.select, orig.csv, orig.chip, orig.bar].map(el => !!el.closest('.tc-node') && !el.closest('#tc-selection-inspector'))), [true, true, true, true], 'closing the inspector returns every moved control to its card');

    // Finished figure: the downloads leave the card face for Export; the footer's Edit unfreezes.
    await more.click(); await menu.getByRole('button', { name: 'Finish plot' }).click();
    await p.waitForSelector('.tc-node .tc-snapshot img', { timeout: 20000 });
    await until(() => document.querySelector('.tc-node .tc-card-status[data-state^=finished]'));
    assert.equal(await p.locator('.tc-node .tc-snapshot-exports').isVisible(), false, 'snapshot downloads are not on the card face');
    assert.equal(await p.locator('.tc-node').getByRole('button', { name: 'Edit', exact: true }).count(), 1, 'one Edit on a finished card');
    await more.click();
    assert.equal(await menu.getByRole('button', { name: /^(Edit|Finish plot)$/ }).count(), 0, '⋯ has no second Edit or Finish');
    await p.keyboard.press('Escape');
    await p.locator('.tc-node .tc-node-head strong').click();
    await until(() => !document.getElementById('tc-selection-inspector').hidden);
    const finished = await p.evaluate(() => [...document.querySelectorAll('#tc-selection-inspector [role=tab]')].filter(t => !t.hidden).map(t => [t.textContent, t.getAttribute('aria-selected')]));
    assert.deepEqual(finished, [['Export', 'true']], 'a finished figure offers its Export tab');
    await p.evaluate(() => { window.pngClicks = 0; [...document.querySelectorAll('.tc-node .tc-snapshot-exports button')].find(b => b.textContent === 'PNG').addEventListener('click', () => pngClicks++); });
    for (const format of ['PNG', 'SVG', 'PDF']) assert.equal(await inspector.getByRole('button', { name: 'Download ' + format, exact: true }).isVisible(), true, `Export offers the finished ${format}`);
    // A frozen figure that is not exportable (stale) has its buttons disabled by canvas.js: the mirror follows.
    const pngOff = await p.evaluate(() => [...document.querySelectorAll('.tc-node .tc-snapshot-exports button')].find(b => b.textContent === 'PNG').disabled);
    const pngMirror = inspector.getByRole('button', { name: 'Download PNG', exact: true });
    assert.equal(await pngMirror.isDisabled(), pngOff, 'the mirror is disabled exactly when the card\'s PNG button is');
    if (!pngOff) { await pngMirror.click(); assert.equal(await p.evaluate(() => pngClicks), 1, 'the mirror runs the card\'s own PNG export'); }
    await p.locator('.tc-node .tc-card-edit').click();
    await until(() => !document.querySelector('.tc-node .tc-snapshot') && !document.querySelector('.tc-node').classList.contains('tc-finished'));

    // ⋯ after an action: the menu folds and focus returns to the visible ⋯ (FIXR1B item 3); an action
    // that moves focus on purpose keeps it there.
    await p.keyboard.press('Escape');
    await p.evaluate(() => {
      const menu = document.querySelector('.tc-node .tc-card-menu');
      const quiet = document.createElement('button'); quiet.type = 'button'; quiet.className = 'tc-test-quiet'; quiet.textContent = 'Quiet action';
      const away = document.createElement('button'); away.type = 'button'; away.className = 'tc-test-away'; away.textContent = 'Focus elsewhere';
      away.addEventListener('click', () => document.querySelector('.tc-reset').focus());
      menu.append(quiet, away);
    });
    await more.click(); await menu.locator('.tc-test-quiet').click();
    await until(() => document.activeElement && document.activeElement.classList.contains('tc-card-more'));
    assert.equal(await menu.isHidden(), true, 'the menu folds after an action');
    assert.equal(await more.getAttribute('aria-expanded'), 'false');
    assert.equal(await p.evaluate(() => document.querySelector('.tc-node').classList.contains('tc-card-menu-open')), false, 'the card clips again once the menu is closed');
    await more.click(); await menu.locator('.tc-test-away').click();
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.equal(await p.evaluate(() => document.activeElement.classList.contains('tc-reset')), true, 'an action that moved focus keeps it');
    await p.evaluate(() => document.querySelectorAll('.tc-test-quiet,.tc-test-away').forEach(b => b.remove()));

    // Canvas zoom 10–200 % (the viewport's range is 5–200 %): the footer actions stay screen-size
    // (13 px text, 30 px targets), uncovered and clickable, and ⋯ opens its menu (FIXR1B item 1).
    // Docked in the footer from 90 %, floating over the card's lower edge below that.
    for (const z of [0.1, 0.29, 0.5, 0.74, 0.9, 1, 1.5, 2]) {
      await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
      await p.evaluate(zoom => {
        TeamCanvasViewport.setScale(zoom);
        const s = document.querySelector('.tc-scroll'), n = document.querySelector('.tc-node');
        s.scrollLeft = Math.max(0, n.offsetLeft * zoom - 40);
        s.scrollTop = Math.max(0, (n.offsetTop + n.offsetHeight) * zoom - s.clientHeight + 60);
      }, z);
      await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const c = await p.evaluate(() => { const b = document.querySelector('.tc-node').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + Math.min(12, b.height / 4) }; });
      await p.mouse.move(c.x, c.y);
      await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const m = await p.evaluate(() => {
        const node = document.querySelector('.tc-node'), bar = node.querySelector(':scope > .tc-node-head > .tc-card-actions');
        const actions = [...bar.querySelectorAll(':scope > .tc-card-edit, :scope > button, :scope > .tc-card-more-wrap > .tc-card-more')].filter(b => b.getClientRects().length);
        return {
          scale: TeamCanvasViewport.scale, docked: bar.classList.contains('tc-card-docked'),
          footerInView: (() => { const n = node.getBoundingClientRect(), v = node.closest('.tc-scroll').getBoundingClientRect(); return n.bottom <= Math.min(innerHeight, v.bottom) + 0.5 && n.bottom - 40 >= Math.max(0, v.top); })(),
          inCard: (() => { const b = bar.getBoundingClientRect(), n = node.getBoundingClientRect(); return b.left >= n.left - 0.5 && b.right <= n.right + 0.5 && b.bottom <= n.bottom + 0.5; })(),
          actions: actions.map(b => { const r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { name: b.getAttribute('aria-label') || b.textContent, w: r.width, h: r.height, text: parseFloat(getComputedStyle(b).fontSize) * (b.currentCSSZoom || 1), hit: !!hit && (hit === b || b.contains(hit)) }; })
        };
      });
      const label = `zoom ${Math.round(m.scale * 100)}%`;
      assert.deepEqual(m.actions.map(a => a.name), ['Edit', 'Duplicate', 'More card actions'], `${label}: Edit, Duplicate and ⋯ are shown`);
      for (const a of m.actions) {
        assert.ok(a.h >= 29.5 && a.w >= 29.5, `${label}: ${a.name} is a ${a.w.toFixed(1)}x${a.h.toFixed(1)} px target (min 30)`);
        assert.ok(a.text >= 12.95, `${label}: ${a.name} text is ${a.text.toFixed(2)} px on screen (min 13)`);
        assert.ok(a.hit, `${label}: ${a.name} is what sits under its centre`);
      }
      assert.equal(m.docked, m.scale >= 0.9 && m.footerInView, `${label}: docked in the footer only from 90% and while the footer is in view`);
      if (m.docked) assert.ok(m.inCard, `${label}: the docked bar stays inside the card`);
      await more.click();
      assert.equal(await more.getAttribute('aria-expanded'), 'true', `${label}: ⋯ opens its menu`);
      // Opening ⋯ selects the card: the inspector opens, the view narrows and the bar is re-placed on the next frames.
      await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 250)))));
      // (Opening ⋯ also selects the card, so the inspector may now sit beside it: only size and place here.)
      const shown = await p.evaluate(() => { const b = [...document.querySelectorAll('.tc-node .tc-card-menu > button')].find(x => x.getClientRects().length); if (!b) return null; const r = b.getBoundingClientRect(); return { h: r.height, inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }; });
      assert.ok(shown && shown.h >= 29.5 && shown.inView, `${label}: the menu's items are screen-size and on screen ${JSON.stringify(shown)}`);
    }
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
    await p.evaluate(() => TeamCanvasViewport.setScale(1));
    assert.deepEqual(errors, []);
    console.log('PASS clean card (≤380 px composition, title/badge + plot + footer Edit/Duplicate/⋯) and tabbed inspector (Data/Appearance/Statistics/Export, keyboard, every chip and download reachable, live and finished)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
