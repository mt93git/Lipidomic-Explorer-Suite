// Run with: node tests/dual-ui/test_team_figure_review.cjs
// FigA review round 1 (4170260), on the integrated Figure page (fixture_team_figure_page.cjs):
//  1. Toolbar Undo/Redo drive the figure document's history, never a Draft plot editor's (a real
//     TeamPlotEditor is mounted in the Draft, first in DOM order, with its own Undo enabled).
//  2. Add text with the column hidden: the column is shown, Object opens, the Text field has focus;
//     typing (spaces included) replaces the placeholder and is saved; Space never adds another object.
//  3. ⋯ Page setup opens the Page tab (column shown) and focuses its Layout select; the unfinished-plots
//     chip opens Plots. The panels are checked open, not only the request.
//  4. The old shape entry points (rail Text & shapes, TeamCanvasCompose.openShapes, the empty page's
//     Choose a shape) open the visible Add shape menu; cancelling Publication layout returns focus to a
//     visible control.
//  5. Double click on the already selected text while Page is shown: Object, column shown, Text focused.
//  6. Move (H or held Space): arrow keys on a focused page object do not move it; Select still does.
//  7. Header at 901, 1024 and 1200 px (library closed, inspector shown): the toolbar wraps inside the
//     panel, overlaps neither the page strip title nor the hint line, and nothing is clipped.
'use strict';
const assert = require('node:assert/strict');
const {chromium} = require('../browser/ci/node_modules/playwright');
const {open, toFigure, toDraft, aim, fixture} = require('./fixture_team_figure_page.cjs');

const col = page => page.evaluate(() => {
  const root = document.getElementById('team-canvas-root'), layout = root.querySelector('.tc-layout'), c = root.querySelector('.ts-inspector-column');
  const sel = Array.from(root.querySelectorAll('#tc-figure-column [role=tab]')).find(t => t.getAttribute('aria-selected') === 'true');
  return {hidden: layout.classList.contains('ts-inspector-collapsed'), inert: !!c.inert, tab: sel ? sel.textContent.replace(/ ·.*/, '') : null};
});
const panelShown = (page, name) => page.evaluate(n => { const p = document.getElementById('tc-fc-panel-' + n); return !!p && !p.hidden && p.getClientRects().length > 0 && !p.closest('[inert]'); }, name);
const lastDoc = page => page.evaluate(() => structuredClone(savedDocuments[savedDocuments.length - 1] || {items: []}));
const hideColumn = async page => { if (!(await col(page)).hidden) { await page.locator('#team-canvas-root .ts-rail>.ts-inspector-toggle').click(); await fixture.settle(page); } assert.ok((await col(page)).hidden && (await col(page)).inert, 'column hidden'); };
const tool = (page, name) => page.locator('#tc-figure-toolbar-slot .tc-figure-tools').getByRole('button', {name, exact: true});

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    // ----------------------------------------------------------------------------------------------------
    {
      const {page, errors} = await open(browser, {width: 1200, height: 900});
      // 1. A real Draft plot editor, before the figure inspector in DOM order, with Undo enabled.
      // plot_editor.js is wired for the workspace, but this harness's safe asset list leaves it out (it needs
      // Plotly for the live canvas); the editor itself mounts without it.
      await page.addScriptTag({path: require('node:path').resolve('www/team/js/plot_editor.js')});
      await page.evaluate(() => {
        const host = document.createElement('div'); host.id = 'draft-editor';
        document.querySelector('#team-canvas-root .tc-layout>.tc-main').prepend(host);
        const gd = document.createElement('div'); gd.className = 'js-plotly-plot'; host.appendChild(gd); gd.data = [{type: 'scatter', x: [1, 2], y: [1, 2], name: 'A'}]; gd.layout = {title: {text: 'T'}};
        window.editorState = {};
        window.draftEditor = TeamPlotEditor.mount({container: host, getPlot: () => gd, getState: () => window.editorState, onChange: n => { window.editorState = n; }});
        const undo = host.querySelector('[data-history="undo"]');
        window.draftUndoClicks = 0;
        if (undo) { undo.disabled = false; undo.addEventListener('click', () => window.draftUndoClicks++, true); }
      });
      assert.ok(await page.evaluate(() => { const first = document.querySelector('#team-canvas-root [data-history="undo"]'); return !!first && document.getElementById('draft-editor').contains(first) && !first.disabled; }),
        'the first [data-history=undo] in the canvas is the Draft plot editor\'s, enabled');
      await toFigure(page);

      // 4a. The empty page's Choose a shape opens the visible menu.
      const choose = page.locator('.tc-compose-empty-hint button', {hasText: 'Choose a shape'});
      assert.equal(await choose.count(), 1, 'the empty page offers Choose a shape');
      await choose.evaluate(b => b.click()); await fixture.settle(page);
      const shapesOpen = () => page.evaluate(() => { const t = Array.from(document.querySelectorAll('#tc-figure-toolbar-slot .tc-figure-menu>button')).find(b => b.textContent === 'Add shape ▾'), body = t && document.getElementById(t.getAttribute('aria-controls'));
        return {expanded: t && t.getAttribute('aria-expanded'), visible: !!body && !body.hidden && body.getClientRects().length > 0, focusIn: !!body && body.contains(document.activeElement), original: document.querySelector('#team-canvas-root .tc-shape-menu').open}; });
      assert.deepEqual(await shapesOpen(), {expanded: 'true', visible: true, focusIn: true, original: false}, 'Choose a shape opens the visible Add shape menu');
      await page.keyboard.press('Escape'); await fixture.settle(page);

      // 2. Add text with the column hidden.
      await hideColumn(page);
      const before = (await lastDoc(page)).items.length;
      await tool(page, 'Add text').click();
      await page.waitForFunction(n => { const d = savedDocuments[savedDocuments.length - 1]; return d && d.items.length > n; }, before);
      await fixture.settle(page);
      const c2 = await col(page);
      assert.ok(!c2.hidden && !c2.inert && c2.tab === 'Object', `Add text shows the column on Object ${JSON.stringify(c2)}`);
      assert.ok(await page.evaluate(() => { const a = document.activeElement; return !!a && a.matches('[data-item-key="text"]') && a.getClientRects().length > 0; }), 'the new text\'s Text field has focus');
      await page.keyboard.type('Hello figure world');
      await page.evaluate(() => document.activeElement.blur()); await fixture.settle(page);
      const d2 = await lastDoc(page), texts = d2.items.filter(i => i.type === 'text');
      assert.equal(d2.items.length, before + 1, 'Space typed spaces: no other object was added');
      assert.equal(texts.length, 1);
      assert.equal(texts[0].text, 'Hello figure world', 'typing replaced the placeholder and was saved');

      // 1. Toolbar Undo reverts the figure document, and never presses the Draft editor's Undo.
      assert.equal(await tool(page, 'Undo').isEnabled(), true, 'Undo enabled by the figure history');
      await tool(page, 'Undo').click(); await fixture.settle(page);
      assert.equal(await page.evaluate(() => window.draftUndoClicks), 0, 'the Draft plot editor\'s Undo was not pressed');
      const undone = (await lastDoc(page)).items.find(i => i.type === 'text');
      assert.ok(!undone || undone.text !== 'Hello figure world', 'figure Undo reverted the text edit');
      assert.equal(await tool(page, 'Redo').isEnabled(), true, 'Redo enabled by the figure history');
      await tool(page, 'Redo').click(); await fixture.settle(page);
      assert.equal((await lastDoc(page)).items.find(i => i.type === 'text').text, 'Hello figure world', 'figure Redo restores it');
      assert.equal(await page.evaluate(() => window.draftUndoClicks), 0);

      // 3. ⋯ Page setup, from Object with the column hidden.
      await hideColumn(page);
      await page.locator('#tc-figure-toolbar-slot').getByRole('button', {name: 'More figure options'}).click();
      await tool(page, 'Page setup').click(); await fixture.settle(page);
      const c3 = await col(page);
      assert.ok(!c3.hidden && !c3.inert && c3.tab === 'Page', `Page setup opens Page in a shown column ${JSON.stringify(c3)}`);
      assert.ok(await panelShown(page, 'page'), 'the Page panel is open and visible');
      assert.ok(await page.evaluate(() => { const a = document.activeElement; return !!a && a.matches('.tc-preview-layout') && a.getClientRects().length > 0; }), 'focus on the Layout select');

      // 5. Double click on the already selected text while Page is shown, column hidden.
      const text = page.locator('#tc-preview-panel .tc-free-item:has(.tc-paper-text)').first();
      let p = await aim(page, text);
      await page.mouse.click(p.x, p.y); await fixture.settle(page);
      await page.locator('#tc-figure-column [role=tab]', {hasText: 'Page'}).click();
      await hideColumn(page);
      p = await aim(page, text);
      await page.mouse.dblclick(p.x, p.y); await fixture.settle(page);
      const c5 = await col(page);
      assert.ok(!c5.hidden && !c5.inert && c5.tab === 'Object', `double click on the selected text opens Object ${JSON.stringify(c5)}`);
      assert.ok(await page.evaluate(() => { const a = document.activeElement; return !!a && a.matches('[data-item-key="text"]') && a.getClientRects().length > 0; }), 'Text field focused');
      await page.keyboard.press('Escape');
      await page.evaluate(() => document.activeElement && document.activeElement.blur());

      // 6. Move: arrows on a focused page object do nothing; Space + arrow neither; Select nudges.
      const geometry = () => page.evaluate(() => { const d = savedDocuments[savedDocuments.length - 1]; return JSON.stringify(d.items.map(i => [i.id, i.x, i.y])); });
      await text.focus(); await fixture.settle(page);
      const g0 = await geometry(), saves0 = await page.evaluate(() => savedDocuments.length);
      await page.keyboard.press('h');
      assert.equal(await page.evaluate(() => TeamCanvasPointerMode.mode), 'hand', 'H on a focused object: Move');
      await text.focus();
      for (const k of ['ArrowRight', 'ArrowDown', 'Shift+ArrowLeft', 'ArrowUp']) await page.keyboard.press(k);
      await fixture.settle(page);
      assert.equal(await geometry(), g0, 'arrows in Move do not move the object');
      assert.equal(await page.evaluate(() => savedDocuments.length), saves0, 'nothing saved');
      await page.keyboard.press('v'); await text.focus();
      await page.keyboard.down(' '); assert.equal(await page.evaluate(() => TeamCanvasPointerMode.mode), 'hand', 'held Space is Move');
      await page.keyboard.press('ArrowRight'); await page.keyboard.up(' '); await fixture.settle(page);
      assert.equal(await geometry(), g0, 'Space + arrow does not move the object');
      await text.focus(); await page.keyboard.press('ArrowRight'); await fixture.settle(page);
      assert.notEqual(await geometry(), g0, 'Select: the arrow still nudges (control)');

      // 4b. Publication layout: Cancel returns focus to a visible control of the toolbar.
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      const pubVisible = await tool(page, 'Publication layout').isVisible();
      if (pubVisible) await tool(page, 'Publication layout').click();
      else { await page.locator('#tc-figure-toolbar-slot').getByRole('button', {name: 'More figure options'}).click(); await tool(page, 'Publication layout').click(); }
      const dialog = page.getByRole('alertdialog', {name: 'Arrange this page for publication?'});
      await dialog.waitFor();
      await dialog.getByRole('button', {name: 'Cancel', exact: true}).click(); await fixture.settle(page);
      assert.ok(await page.evaluate(() => { const a = document.activeElement; return !!a && a !== document.body && a.closest('#tc-figure-toolbar-slot') && a.getClientRects().length > 0; }), 'Cancel leaves focus on a visible toolbar control');

      // 3b. The unfinished-plots chip opens Plots (and shows a hidden column).
      await page.evaluate(() => { window.fixtureState.state.nodes.push({id: 'plot1', label: 'Plot 1', x: 500, y: 0, width: 400, height: 300}); window.dispatchEvent(new Event('team-canvas-changed')); document.querySelector('.tc-preview-layout').dispatchEvent(new Event('change', {bubbles: true})); });
      await fixture.settle(page);
      await page.locator('#tc-figure-column [role=tab]', {hasText: 'Object'}).click();
      await hideColumn(page);
      const chip = page.locator('#tc-figure-toolbar-slot .tc-figure-excluded-chip');
      await chip.waitFor({state: 'visible', timeout: 5000});
      await chip.click(); await fixture.settle(page);
      const c3b = await col(page);
      assert.ok(!c3b.hidden && !c3b.inert && c3b.tab === 'Plots', `the chip opens Plots in a shown column ${JSON.stringify(c3b)}`);
      assert.ok(await panelShown(page, 'plots'), 'the Plots panel is open and visible');

      // 4c. Rail Text & shapes and TeamCanvasCompose.openShapes, from the Draft.
      for (const how of ['rail', 'api']) {
        await toDraft(page);
        if (how === 'rail') await page.locator('#team-canvas-root .ts-rail').getByRole('button', {name: 'Text & shapes'}).click();
        else await page.evaluate(() => TeamCanvasCompose.openShapes());
        await page.locator('#tc-preview-panel .tc-paper').first().waitFor(); await fixture.settle(page);
        assert.deepEqual(await shapesOpen(), {expanded: 'true', visible: true, focusIn: true, original: false}, `${how}: opens the visible Add shape menu`);
        await page.keyboard.press('Escape'); await fixture.settle(page);
      }
      assert.deepEqual(errors, [], 'no page errors');
      await page.close();
      console.log('PASS figure review 1-6: scoped Undo/Redo, Add text reveal + typing, Page setup / Plots receivers, shape entry points and confirmation focus, double click on selected text, arrow keys in Move');
    }
    // ------------------------ 9. Drag across a re-render; camera kept on release ------------------------
    {
      const {page, errors} = await open(browser, {width: 1440, height: 900});
      await toFigure(page);
      for (let i = 0; i < 4; i++) await page.getByRole('button', {name: 'Zoom in print preview', exact: true}).click();
      await fixture.settle(page);
      const desk = page.locator('#tc-preview-panel .tc-preview-pages'), item = page.locator('#tc-preview-panel .tc-free-item').first();
      await page.evaluate(() => { const d = document.querySelector('#tc-preview-panel .tc-preview-pages'), it = d.querySelector('.tc-free-item'), a = d.getBoundingClientRect(), b = it.getBoundingClientRect();
        d.scrollLeft = Math.max(120, d.scrollLeft + (b.left + b.width / 2) - (a.left + a.width / 2)); d.scrollTop = Math.max(120, d.scrollTop + (b.top + b.height / 2) - (a.top + a.height / 2)); });
      await fixture.settle(page);
      const cam = () => desk.evaluate(d => ({x: Math.round(d.scrollLeft), y: Math.round(d.scrollTop)}));
      const pos = () => page.evaluate(() => { const d = savedDocuments[savedDocuments.length - 1]; const f = d && d.items.find(i => i.type === 'figure'); return f ? [Math.round(f.x), Math.round(f.y)] : null; });
      const c0 = await cam();
      assert.ok(c0.x > 40 && c0.y > 40, `the camera is away from the corner ${JSON.stringify(c0)}`);
      // A plain Select drag: on release the page re-renders, the camera stays.
      let p = await aim(page, item);
      await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 30, p.y + 20, {steps: 4}); await page.mouse.up();
      await fixture.settle(page);
      const c1 = await cam();
      assert.ok(Math.abs(c1.x - c0.x) <= 2 && Math.abs(c1.y - c0.y) <= 2, `the camera survives the re-render on release ${JSON.stringify([c0, c1])}`);
      // A re-render in the middle of a drag (a page setting changes): the release still saves the move.
      const start = await pos();
      p = await aim(page, item);
      await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 40, p.y + 30, {steps: 4});
      // The canvas changes under the drag (as a Shiny update does): the preview invalidates and re-renders.
      const renders = await page.evaluate(() => { window.paperNodes = document.querySelectorAll('#tc-preview-panel .tc-free-item'); window.fixtureState.state.nodes[0].label = 'Plot 0 (updated)'; window.dispatchEvent(new Event('team-canvas-changed')); return true; });
      await page.waitForTimeout(300);
      assert.ok(renders && await page.evaluate(() => Array.from(window.paperNodes).every(n => !n.isConnected)), 'the page re-rendered during the drag');
      await fixture.settle(page);
      await page.mouse.move(p.x + 50, p.y + 40, {steps: 2}); await page.mouse.up();
      await fixture.settle(page);
      const end = await pos();
      assert.ok(start && end && (end[0] !== start[0] || end[1] !== start[1]), `the move made before the re-render is saved ${JSON.stringify([start, end])}`);
      assert.equal(await page.evaluate(() => JSON.stringify((window.TeamCanvas.getDocument() || {}).items.find(i => i.type === 'figure'))), await page.evaluate(() => JSON.stringify(savedDocuments[savedDocuments.length - 1].items.find(i => i.type === 'figure'))));
      assert.deepEqual(errors, []);
      await page.close();
      console.log('PASS figure review 9: camera kept on release; a drag across a re-render is saved');
    }
    // ------------- 10. A second pointer's release does not end the first pointer's drag -------------
    {
      const {page, errors} = await open(browser, {width: 1440, height: 900});
      await toFigure(page);
      const pos = () => page.evaluate(() => { const d = savedDocuments[savedDocuments.length - 1]; const f = d && d.items.find(i => i.type === 'figure'); return f ? [f.x, f.y] : null; });
      const item = page.locator('#tc-preview-panel .tc-free-item').first();
      const p = await aim(page, item), start = await pos(), saves0 = await page.evaluate(() => savedDocuments.length);
      // Two real touch pointers through the DevTools protocol (synthetic PointerEvents cannot take pointer
      // capture): finger 1 drags the object, finger 2 goes down and up elsewhere on the page mid-drag.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});
      const desk = await page.locator('#tc-preview-panel .tc-preview-pages').boundingBox();
      const other = {x: desk.x + 12, y: desk.y + 12, id: 2};
      const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: points.map(t => ({x: t.x, y: t.y, id: t.id}))});
      await page.evaluate(() => { window.figStyle = () => { const f = document.querySelector('#tc-preview-panel .tc-free-item'); return f && f.getAttribute('style'); }; });
      await touch('touchStart', [{x: p.x, y: p.y, id: 1}]);
      for (let i = 1; i <= 3; i++) await touch('touchMove', [{x: p.x + 7 * i, y: p.y + 4 * i, id: 1}]);
      const mid = await page.evaluate(() => figStyle());
      await touch('touchStart', [{x: p.x + 21, y: p.y + 12, id: 1}, other]);
      // CDP touchEnd lists the points that are released.
      await touch('touchEnd', [other]);
      const savesAfterOther = await page.evaluate(() => savedDocuments.length);
      for (let i = 4; i <= 8; i++) await touch('touchMove', [{x: p.x + 7 * i, y: p.y + 4 * i, id: 1}]);
      const moved = (await page.evaluate(() => figStyle())) !== mid;
      await touch('touchEnd', []);
      const result = {savesAfterOther, moved};
      await fixture.settle(page);
      assert.equal(result.savesAfterOther, saves0, 'the second pointer\'s release did not end (save) the first drag');
      assert.ok(result.moved, 'the first pointer keeps dragging after the second is released');
      const end = await pos();
      assert.ok(start && end && end[0] > start[0] && end[1] > start[1], `the first pointer's whole move is saved on its own release ${JSON.stringify([start, end])}`);
      assert.deepEqual(errors, []);
      await page.close();
      console.log('PASS figure review 10: a second pointer cannot end the first pointer\'s drag');
    }
    // ------------------ 11. Toolbar Undo / Redo outside Free layout, and after Free ------------------
    {
      const {page, errors} = await open(browser, {width: 1440, height: 900});
      await toFigure(page);
      const paperNow = () => page.evaluate(() => document.querySelector('.tc-preview-paper').value);
      const setSelect = (sel, v) => page.evaluate(a => { const e = document.querySelector(a[0]); e.value = a[1]; e.dispatchEvent(new Event('change', {bubbles: true})); }, [sel, v]);
      const undoOn = () => tool(page, 'Undo').isEnabled(), redoOn = () => tool(page, 'Redo').isEnabled();
      for (const round of ['first visit', 'after Free']) {
        if (round === 'after Free') { await setSelect('.tc-preview-layout', 'free'); await fixture.settle(page); await setSelect('.tc-preview-layout', 'pages'); await fixture.settle(page); }
        else { await setSelect('.tc-preview-layout', 'pages'); await fixture.settle(page); }
        assert.equal(await page.evaluate(() => document.querySelector('.tc-preview-layout').value), 'pages', `${round}: One plot per page`);
        const before = await paperNow(), next = before === 'a4' ? 'letter' : 'a4';
        await setSelect('.tc-preview-paper', next); await fixture.settle(page);
        assert.equal(await paperNow(), next);
        assert.equal(await undoOn(), true, `${round}: toolbar Undo enabled after a paper change in One plot per page`);
        await tool(page, 'Undo').click(); await fixture.settle(page);
        assert.equal(await paperNow(), before, `${round}: toolbar Undo reverts the paper size`);
        assert.equal(await page.evaluate(() => document.querySelector('.tc-preview-layout').value), 'pages', `${round}: still One plot per page`);
        assert.equal(await redoOn(), true, `${round}: Redo enabled`);
        await tool(page, 'Redo').click(); await fixture.settle(page);
        assert.equal(await paperNow(), next, `${round}: toolbar Redo re-applies it`);
      }
      assert.deepEqual(errors, []);
      await page.close();
      console.log('PASS figure review 11: toolbar Undo / Redo follow the document history in One plot per page, first and after Free');
    }
    // ---------------------------------------------- 7. Header ----------------------------------------------
    for (const width of [901, 1024, 1200]) {
      const {page, errors} = await open(browser, {width, height: 800});
      await toFigure(page);
      if ((await col(page)).hidden) { await page.locator('#team-canvas-root .ts-rail>.ts-inspector-toggle').click(); await fixture.settle(page); }
      const state = await page.evaluate(() => ({library: !document.querySelector('#team-canvas-root .tc-layout').classList.contains('tc-library-hidden'), col: !document.querySelector('#team-canvas-root .tc-layout').classList.contains('ts-inspector-collapsed')}));
      assert.deepEqual(state, {library: false, col: true}, `${width}: library closed, inspector shown`);
      const m = await page.evaluate(() => {
        const r = n => { const b = n.getBoundingClientRect(); return {l: b.left, t: b.top, r: b.right, b: b.bottom}; };
        const panel = document.getElementById('tc-preview-panel'), bar = panel.querySelector('.tc-figure-tools-bar'), title = panel.querySelector('.tc-figure-strip-title'), hint = panel.querySelector('.tc-figure-hint');
        const kids = Array.from(bar.children).filter(c => c.getClientRects().length).map(r);
        return {panel: r(panel), bar: r(bar), title: r(title), hint: r(hint), kids, over: bar.scrollWidth - bar.clientWidth, titleW: title.getBoundingClientRect().width};
      });
      const inside = (a, b) => a.l >= b.l - 0.5 && a.r <= b.r + 0.5 && a.t >= b.t - 0.5 && a.b <= b.b + 0.5;
      const overlap = (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
      assert.ok(m.over <= 1, `${width}: the bar does not overflow (${m.over}px)`);
      assert.ok(inside(m.bar, m.panel), `${width}: the bar is inside the panel ${JSON.stringify([m.bar, m.panel])}`);
      m.kids.forEach((k, i) => assert.ok(inside(k, m.bar) && inside(k, m.panel), `${width}: toolbar control ${i} not clipped ${JSON.stringify([k, m.bar])}`));
      assert.ok(!overlap(m.bar, m.title), `${width}: the bar does not cover the strip title ${JSON.stringify([m.bar, m.title])}`);
      assert.ok(!overlap(m.bar, m.hint), `${width}: the bar does not cover the hint line`);
      assert.ok(m.titleW >= 100, `${width}: the strip title keeps room (${m.titleW}px)`);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS figure review 7: header wraps without overlap or clipping at 901, 1024, 1200 px');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
