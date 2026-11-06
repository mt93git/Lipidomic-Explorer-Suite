// Run with: node tests/dual-ui/test_team_figure_hand_mode.cjs
// FigA on the Wave 4 shell: the integrated Figure page (canvas_preview.js embedInShell) offers the same
// Select / Move pair (pointer_mode.js) and the same hideable inspector (inspector_toggle.js) as the Draft,
// with the same controls in the same rail.
// Hand mode: the pair stays in the rail on the Figure page (same node); H, V, the buttons and held Space
// switch there; a drag on the desk pans it 1:1 (scroll only) and never selects, focuses, moves or resizes a
// page object, never deselects, never writes the figure document; the click that ends a pan is swallowed;
// the middle button pans in Select; wheel scrolling stays; typing keeps its letters; Select still drags
// objects; the mode carries across Draft <-> Figure.
// Inspector toggle: the rail button and I hide the Figure page's right column (Object / Plots / Page) as
// they hide the card inspector: same rect for the canvas cell, same companion home, inert while hidden; a
// double click on a text object shows a hidden column (as Edit on a card does) except in Move.
// The real Canvas markup (R/frontends/team/canvas.R) with the Team workspace assets as wired
// (fixture_team_overlay_pages.cjs), as test_team_figure_shell.cjs does. Synthetic fixture only.
'use strict';
const assert = require('node:assert/strict');
const {chromium} = require('../browser/ci/node_modules/playwright');
const {open, toFigure, toDraft, aim, near, fixture} = require('./fixture_team_figure_page.cjs');

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    // ===================================== Hand mode on the Figure page =====================================
    {
      const {page, errors} = await open(browser, {width: 1440, height: 900});
      const group = page.getByRole('group', {name: 'Pointer mode'});
      const selectBtn = group.getByRole('button', {name: 'Select', exact: true}), moveBtn = group.getByRole('button', {name: 'Move', exact: true});
      const state = () => page.evaluate(() => {
        const g = document.querySelector('#team-canvas-root .tc-pointer-mode'), desk = document.querySelector('#tc-preview-panel .tc-preview-pages'), scroll = document.querySelector('#team-canvas-root .tc-scroll');
        return {select: g.querySelector('.tc-pointer-select').getAttribute('aria-pressed'), move: g.querySelector('.tc-pointer-hand').getAttribute('aria-pressed'), label: g.dataset.mode,
          desk: desk.classList.contains('is-hand'), draft: scroll.classList.contains('is-hand')};
      });
      assert.equal(await group.count(), 1, 'one pointer-mode pair');
      const pairNode = await page.evaluate(() => { window.pairNode = document.querySelector('#team-canvas-root .ts-rail>.tc-pointer-mode'); return !!window.pairNode; });
      assert.ok(pairNode && await group.isVisible(), 'pair visible in the Draft rail');
      const pairDraft = await group.boundingBox();

      await toFigure(page);
      assert.ok(await group.isVisible(), 'pair visible on the Figure page');
      assert.ok(await page.evaluate(() => document.querySelector('#team-canvas-root .ts-rail>.tc-pointer-mode') === window.pairNode), 'same pair node, in the same rail');
      const pairFigure = await group.boundingBox();
      for (const k of ['x', 'y', 'width', 'height']) assert.ok(near(pairDraft[k], pairFigure[k], 0.5), `pair ${k} unchanged on the Figure page`);
      assert.deepEqual(await state(), {select: 'true', move: 'false', label: 'select', desk: false, draft: false});

      // A page object to aim at (a text object next to the placed plot), and a desk larger than its view.
      const tools = page.locator('#tc-figure-toolbar-slot .tc-figure-tools');
      await tools.getByRole('button', {name: 'Add text', exact: true}).click();
      await page.waitForFunction(() => { const d = savedDocuments[savedDocuments.length - 1]; return d && d.items.some(i => i.type === 'text'); });
      await fixture.settle(page);
      for (let i = 0; i < 4; i++) await page.getByRole('button', {name: 'Zoom in print preview', exact: true}).click();
      await fixture.settle(page);
      const desk = page.locator('#tc-preview-panel .tc-preview-pages');
      const deskBox = await desk.evaluate(d => ({sw: d.scrollWidth, cw: d.clientWidth, sh: d.scrollHeight, ch: d.clientHeight}));
      assert.ok(deskBox.sw > deskBox.cw + 200 && deskBox.sh > deskBox.ch + 200, `desk scrolls both ways at this zoom ${JSON.stringify(deskBox)}`);
      const deskPos = () => desk.evaluate(d => ({x: d.scrollLeft, y: d.scrollTop}));
      const setDesk = (x, y) => desk.evaluate((d, p) => { d.scrollLeft = p[0]; d.scrollTop = p[1]; }, [x, y]);
      // Bring the first page object into view, centred, so drags can start on it.
      await page.evaluate(() => { const d = document.querySelector('#tc-preview-panel .tc-preview-pages'), it = d.querySelector('.tc-free-item'), a = d.getBoundingClientRect(), b = it.getBoundingClientRect();
        d.scrollLeft += (b.left + b.width / 2) - (a.left + a.width / 2); d.scrollTop += (b.top + b.height / 2) - (a.top + a.height / 2); });
      await fixture.settle(page);
      const items = page.locator('#tc-preview-panel .tc-free-item');
      assert.ok(await items.count() >= 2, 'the plot and the text object are on the page');
      await page.evaluate(() => {
        window.itemEvents = 0;
        document.querySelectorAll('#tc-preview-panel .tc-free-item').forEach(n => ['pointerdown', 'mousedown', 'click', 'dblclick', 'focus'].forEach(t => n.addEventListener(t, () => window.itemEvents++)));
        document.activeElement && document.activeElement.blur();
      });
      // Select an object first (the plain Select gesture): Move must keep that selection as it is.
      await items.first().click();
      await fixture.settle(page);
      const selectedBefore = await page.evaluate(() => Array.from(document.querySelectorAll('#tc-preview-panel .tc-free-item')).map(n => n.classList.contains('selected')));
      assert.ok(selectedBefore[0], 'a click in Select selects the object (control)');
      await page.evaluate(() => { window.itemEvents = 0; document.activeElement && document.activeElement.blur(); });

      // H from the body: Move, said in the Figure page's own status line.
      await page.keyboard.press('h');
      assert.deepEqual(await state(), {select: 'false', move: 'true', label: 'hand', desk: true, draft: true});
      assert.match(await page.locator('#tc-preview-panel .tc-preview-status').textContent(), /^Move mode: drag anywhere to pan the page/);
      const look = await items.first().evaluate(n => ({cursor: getComputedStyle(n).cursor, select: getComputedStyle(n).userSelect, desk: getComputedStyle(n.closest('.tc-preview-pages')).cursor, touch: getComputedStyle(n.closest('.tc-preview-pages')).touchAction}));
      assert.deepEqual(look, {cursor: 'grab', select: 'none', desk: 'grab', touch: 'pinch-zoom'}, 'page objects are grab surfaces without text selection');

      // Drag starting on a page object: the desk pans 1:1, the object is untouched.
      const docsBefore = await page.evaluate(() => JSON.stringify(savedDocuments));
      const styleOf = () => items.evaluateAll(ns => ns.map(n => n.getAttribute('style') + '|' + n.className));
      const styles0 = await styleOf(), d0 = await deskPos();
      const {x: sx, y: sy} = await aim(page, items.nth(1));
      await page.mouse.move(sx, sy); await page.mouse.down();
      assert.ok(await desk.evaluate(d => d.classList.contains('is-panning')), 'grabbing while dragging the desk');
      await page.mouse.move(sx - 120, sy - 70, {steps: 6}); await page.mouse.up();
      await fixture.settle(page);
      const d1 = await deskPos();
      assert.ok(near(d1.x - d0.x, 120) && near(d1.y - d0.y, 70), `desk pans 1:1 (${JSON.stringify([d0, d1])})`);
      assert.equal(await desk.evaluate(d => d.classList.contains('is-panning')), false);
      assert.equal(await page.evaluate(() => window.itemEvents), 0, 'no page object saw the press, the click or a focus');
      assert.deepEqual(await styleOf(), styles0, 'no object moved, resized or changed selection');
      assert.equal(await page.evaluate(() => JSON.stringify(savedDocuments)), docsBefore, 'a pan never writes the figure document');
      assert.ok(await page.evaluate(() => !document.activeElement || !document.activeElement.closest('.tc-free-item')), 'no object took focus');
      // The resize handle is not a resize in Move either.
      const handle = await page.evaluate(() => { const h = document.querySelector('#tc-preview-panel .tc-free-item.selected .tc-free-resize'); if (!h) return null; const r = h.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
      if (handle) {
        const before = await deskPos();
        await page.mouse.move(handle.x, handle.y); await page.mouse.down(); await page.mouse.move(handle.x + 40, handle.y + 30, {steps: 4}); await page.mouse.up();
        await fixture.settle(page);
        assert.deepEqual(await styleOf(), styles0, 'a drag on the resize handle does not resize in Move');
        const after = await deskPos();
        assert.ok(near(before.x - after.x, 40) && near(before.y - after.y, 30), 'it pans instead');
      }
      // A click on the empty desk in Move does not deselect (it would in Select: canvas_preview.js).
      const blank = await page.evaluate(() => { const d = document.querySelector('#tc-preview-panel .tc-preview-pages'), r = d.getBoundingClientRect(); return {x: r.left + 8, y: r.top + 8}; });
      assert.ok(await page.evaluate(p => { const e = document.elementFromPoint(p.x, p.y); return !!e && !e.closest('.tc-free-item'); }, blank), 'blank spot of the desk');
      await page.mouse.click(blank.x, blank.y); await fixture.settle(page);
      assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll('#tc-preview-panel .tc-free-item')).map(n => n.classList.contains('selected'))), selectedBefore, 'Move keeps the selection');
      // A double click on the text object in Move: no edit, no focus.
      const tb = await aim(page, items.nth(1));
      await page.mouse.dblclick(tb.x, tb.y); await fixture.settle(page);
      assert.equal(await page.evaluate(() => window.itemEvents), 0, 'double click in Move never reaches the object');
      assert.ok(await page.evaluate(() => !document.activeElement || !document.activeElement.matches('[data-item-key="text"]')), 'double click in Move opens no text edit');

      // Typing in a real, visible text field (the text object's Text in the Object tab) keeps its letters and
      // its spaces in Move: H, V and Space type, the mode does not change, and the text is saved.
      await page.evaluate(() => TeamCanvasPointerMode.setMode('select'));
      const tp = await aim(page, items.nth(1));
      await page.mouse.click(tp.x, tp.y); await fixture.settle(page);
      await page.evaluate(() => TeamCanvasPointerMode.setMode('hand'));
      const textField = page.locator('#tc-figure-column [data-item-key="text"]');
      assert.equal(await textField.count(), 1, 'the text object has its Text field');
      assert.ok(await textField.isVisible() && await textField.isEditable(), 'the Text field is visible and editable');
      await textField.focus(); await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('Hv h v');
      assert.equal((await state()).label, 'hand', 'H, V and Space in the Text field type and leave Move as it is');
      assert.equal(await textField.inputValue(), 'Hv h v', 'every letter and space reached the field');
      await page.keyboard.down(' '); assert.equal((await state()).label, 'hand', 'Space held in the field is no pan'); await page.keyboard.up(' ');
      await page.keyboard.press('Backspace');
      await page.evaluate(() => document.activeElement.blur()); await fixture.settle(page);
      assert.equal(await page.evaluate(() => { const d = savedDocuments[savedDocuments.length - 1]; const t = d.items.find(i => i.type === 'text'); return t && t.text; }), 'Hv h v', 'the typed text is saved');
      // Back to the plot selected, as before the typing.
      await page.evaluate(() => TeamCanvasPointerMode.setMode('select'));
      const pp = await aim(page, items.first());
      await page.mouse.click(pp.x, pp.y); await fixture.settle(page);
      await page.evaluate(() => { TeamCanvasPointerMode.setMode('hand'); document.activeElement && document.activeElement.blur(); });
      // The edits re-rendered the page (canvas_preview.js render() can clamp the camera): zoom in and centre
      // the text object, so the Space pan below has room both ways.
      for (let i = 0; i < 2; i++) await page.getByRole('button', {name: 'Zoom in print preview', exact: true}).click();
      await fixture.settle(page);
      await page.evaluate(() => { const d = document.querySelector('#tc-preview-panel .tc-preview-pages'), it = d.querySelectorAll('.tc-free-item')[1], a = d.getBoundingClientRect(), b = it.getBoundingClientRect();
        d.scrollLeft += (b.left + b.width / 2) - (a.left + a.width / 2); d.scrollTop += (b.top + b.height / 2) - (a.top + a.height / 2); });
      await fixture.settle(page);
      // The object sits near the top of the page: keep some room above it too.
      await desk.evaluate(d => { if (d.scrollTop < 100) d.scrollTop = 100; if (d.scrollLeft < 100) d.scrollLeft = 100; });
      await fixture.settle(page);
      const styles0b = await styleOf();
      assert.ok(await desk.evaluate(d => d.scrollLeft >= 60 && d.scrollTop >= 60), 'room to pan back');
      // Buttons and V.
      await selectBtn.click(); assert.equal((await state()).label, 'select', 'Select button on the Figure page');
      await moveBtn.click(); assert.equal((await state()).label, 'hand', 'Move button on the Figure page');
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press('v');
      assert.deepEqual(await state(), {select: 'true', move: 'false', label: 'select', desk: false, draft: false});
      assert.match(await page.locator('#tc-preview-panel .tc-preview-status').textContent(), /^Select mode: click an object on the page/);

      // Held Space: temporary Move, the window does not scroll, release returns to Select.
      await page.evaluate(() => { window.scrollTo(0, 0); window.itemEvents = 0; });
      const winY = await page.evaluate(() => window.scrollY);
      await page.keyboard.down(' ');
      assert.deepEqual(await state(), {select: 'false', move: 'true', label: 'space', desk: true, draft: true});
      const s2 = await deskPos(), ib2 = await aim(page, items.nth(1));
      await page.mouse.move(ib2.x, ib2.y); await page.mouse.down();
      await page.mouse.move(ib2.x + 50, ib2.y + 40, {steps: 4});
      await page.keyboard.up(' '); // released before the button: the ending click is still swallowed
      await page.mouse.up(); await fixture.settle(page);
      const s3 = await deskPos();
      assert.ok(near(s2.x - s3.x, 50) && near(s2.y - s3.y, 40), `Space pans the desk ${JSON.stringify([s2, s3])}`);
      assert.equal((await state()).label, 'select');
      assert.equal(await page.evaluate(() => window.itemEvents), 0, 'the Space pan never reaches the object');
      assert.equal(await page.evaluate(() => window.scrollY), winY, 'Space did not scroll the window');
      assert.deepEqual(await styleOf(), styles0b, 'the Space pan moved nothing');
      // Space on a button presses it and leaves the mode alone.
      await page.getByRole('button', {name: 'Fit page width', exact: true}).focus();
      await page.keyboard.down(' '); assert.equal((await state()).label, 'select', 'Space on a button is the button'); await page.keyboard.up(' ');
      for (let i = 0; i < 4; i++) await page.getByRole('button', {name: 'Zoom in print preview', exact: true}).click();
      await fixture.settle(page);
      await page.evaluate(() => { const d = document.querySelector('#tc-preview-panel .tc-preview-pages'), it = d.querySelector('.tc-free-item'), a = d.getBoundingClientRect(), b = it.getBoundingClientRect();
        d.scrollLeft += (b.left + b.width / 2) - (a.left + a.width / 2); d.scrollTop += (b.top + b.height / 2) - (a.top + a.height / 2); document.activeElement && document.activeElement.blur(); });
      await fixture.settle(page);
      // Modifiers are not the shortcut.
      for (const mod of ['Control', 'Meta', 'Alt', 'Shift']) { await page.keyboard.press(mod + '+h'); assert.equal((await state()).label, 'select', `${mod}+H is not the shortcut on the Figure page`); }

      // Middle button pans in Select without touching the object.
      const styles1 = await styleOf();
      await page.evaluate(() => { window.itemEvents = 0; });
      const m0 = await deskPos(), mb = await aim(page, items.first());
      await page.mouse.move(mb.x, mb.y); await page.mouse.down({button: 'middle'});
      await page.mouse.move(mb.x - 30, mb.y - 20, {steps: 3}); await page.mouse.up({button: 'middle'});
      const m1 = await deskPos();
      assert.ok(near(m1.x - m0.x, 30) && near(m1.y - m0.y, 20), `middle button pans the desk ${JSON.stringify([m0, m1])}`);
      assert.equal(await page.evaluate(() => window.itemEvents), 0, 'middle button never reaches the object');
      // Wheel still scrolls the desk in Move.
      await page.keyboard.press('h');
      const w0 = await deskPos(); await page.mouse.wheel(0, 120); await page.waitForTimeout(150);
      assert.ok((await deskPos()).y > w0.y, 'wheel scrolls the desk in Move');
      await page.keyboard.press('v');
      // Select keeps today's drag: the object moves and the document is saved, the view stays.
      const pb = await aim(page, items.nth(1)), pv = await deskPos(), saves = await page.evaluate(() => savedDocuments.length);
      await page.mouse.move(pb.x, pb.y); await page.mouse.down();
      await page.mouse.move(pb.x - 60, pb.y + 30, {steps: 5});
      // Read before the release: the release re-renders the page (canvas_preview.js render() empties the desk
      // first, which can clamp its scroll); the claim here is that the gesture itself is not a pan.
      assert.deepEqual(await deskPos(), pv, 'the view did not pan during a Select drag');
      assert.equal(await desk.evaluate(d => d.classList.contains('is-panning')), false, 'no pan in Select');
      await page.mouse.up();
      await fixture.settle(page);
      assert.notDeepEqual(await styleOf(), styles1, 'Select still drags the object');
      assert.ok(await page.evaluate(n => savedDocuments.length > n, saves), 'and saves the document');

      // One mode across both pages: Move set on the Figure page is Move on the Draft, and back.
      await page.keyboard.press('h');
      await toDraft(page);
      assert.deepEqual(await state(), {select: 'false', move: 'true', label: 'hand', desk: true, draft: true}, 'Move carries to the Draft');
      assert.match(await page.locator('#team-canvas-root .tc-status').textContent() || '', /Move mode|^$/, 'Draft status not overwritten with Figure words');
      await page.keyboard.press('v');
      assert.equal((await state()).label, 'select', 'V on the Draft');
      assert.match(await page.locator('#team-canvas-root .tc-status').textContent(), /^Select mode: click a plot/, 'Draft words on the Draft');
      await toFigure(page);
      assert.equal((await state()).label, 'select', 'Select carries to the Figure page');
      assert.deepEqual(errors, [], 'no page errors');
      await page.close();
      console.log('PASS figure hand mode: pair in the rail on both pages, H/V/buttons/Space, 1:1 pan on the desk that never reaches a page object, middle button, wheel, Select drag, one mode across pages');
    }

    // ================================== Inspector toggle on the Figure page ==================================
    {
      const {page, errors} = await open(browser, {width: 1440, height: 900});
      const rect = sel => page.evaluate(s => { const n = document.querySelector(s); if (!n || !n.getClientRects().length) return null; const r = n.getBoundingClientRect(); return {left: r.left, top: r.top, width: r.width, height: r.height}; }, sel);
      const st = () => page.evaluate(() => {
        const root = document.getElementById('team-canvas-root'), t = root.querySelector('.ts-rail>.ts-inspector-toggle'), col = root.querySelector('.ts-inspector-column'), layout = root.querySelector('.tc-layout');
        return {hidden: layout.classList.contains('ts-inspector-collapsed'), extended: layout.classList.contains('ts-inspector-extended'), inert: !!col.inert, expanded: t.getAttribute('aria-expanded'),
          label: t.getAttribute('aria-label'), opacity: getComputedStyle(col).opacity, visible: !!t.getClientRects().length};
      });
      const same = (a, b, what, tol = 1) => { assert.ok(a && b, what + ' measured'); for (const k of ['left', 'top', 'width', 'height']) assert.ok(Math.abs(a[k] - b[k]) <= tol, `${what} ${k}: ${a[k]} vs ${b[k]}`); };
      // Draft, shown then hidden: the reference rects.
      const draftShown = {cell: await rect('#team-canvas-root .tc-layout>.tc-main'), home: await rect('#team-canvas-root .tc-companion-home'), column: await rect('#team-canvas-root .ts-inspector-column')};
      assert.equal((await st()).hidden, false, 'shown at 1440 px by default');
      await page.locator('#team-canvas-root .ts-rail>.ts-inspector-toggle').click(); await fixture.settle(page);
      const draftHiddenState = await st();
      assert.ok(draftHiddenState.hidden && draftHiddenState.inert, 'Draft: hidden and inert');
      const draftHidden = {cell: await rect('#team-canvas-root .tc-layout>.tc-main'), home: await rect('#team-canvas-root .tc-companion-home'), column: await rect('#team-canvas-root .ts-inspector-column')};
      await page.locator('#team-canvas-root .ts-rail>.ts-inspector-toggle').click(); await fixture.settle(page);

      // Figure page, shown: the same toggle, the figure column visible.
      await toFigure(page);
      const figShownState = await st();
      assert.ok(figShownState.visible && !figShownState.hidden && !figShownState.inert && figShownState.expanded === 'true' && figShownState.label === 'Hide inspector', `Figure: toggle shown and pressed ${JSON.stringify(figShownState)}`);
      assert.ok(await page.locator('#team-canvas-root .ts-inspector-column>#tc-figure-column').isVisible(), 'figure column visible');
      same(draftShown.cell, await rect('#team-canvas-root .tc-layout>#tc-preview-panel'), 'shown: Figure page cell = Draft cell');
      same(draftShown.home, await rect('#team-canvas-root .tc-companion-home'), 'shown: companion home', 0.5);
      // Hide with the rail button: the same layout as the Draft with the column hidden.
      await page.locator('#team-canvas-root .ts-rail>.ts-inspector-toggle').click(); await fixture.settle(page);
      const figHiddenState = await st();
      assert.ok(figHiddenState.hidden && figHiddenState.inert && figHiddenState.expanded === 'false' && figHiddenState.label === 'Show inspector' && figHiddenState.opacity === '0', `Figure: hidden, inert ${JSON.stringify(figHiddenState)}`);
      assert.equal(figHiddenState.extended, draftHiddenState.extended, 'the canvas-cell extension decides the same on both pages');
      same(draftHidden.cell, await rect('#team-canvas-root .tc-layout>#tc-preview-panel'), 'hidden: Figure page cell = Draft cell');
      same(draftHidden.home, await rect('#team-canvas-root .tc-companion-home'), 'hidden: companion home', 0.5);
      same(draftHidden.column, await rect('#team-canvas-root .ts-inspector-column'), 'hidden: column stays laid out');
      // The desk refits to its wider cell (Fit page stays a fit).
      assert.ok(await page.evaluate(() => { const v = document.querySelector('#tc-preview-panel .tc-preview-pages'), s = v.querySelector('.tc-paper'); return s.offsetHeight <= v.clientHeight + 1 && s.offsetWidth <= v.clientWidth + 1; }), 'desk still fits after hiding');
      // I shows it again (from the body), I hides it.
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press('i'); await fixture.settle(page);
      assert.ok(!(await st()).hidden && !(await st()).inert, 'I shows the column on the Figure page');
      assert.ok(await page.locator('#team-canvas-root .ts-inspector-column>#tc-figure-column').isVisible(), 'figure column back');
      await page.keyboard.press('i'); await fixture.settle(page);
      assert.ok((await st()).hidden, 'I hides it again');
      // I in a field types.
      await page.evaluate(() => { const i = document.createElement('input'); i.id = 'fh-field'; document.querySelector('#tc-preview-panel').appendChild(i); });
      await page.locator('#fh-field').focus(); await page.keyboard.press('i');
      assert.ok((await st()).hidden && await page.locator('#fh-field').inputValue() === 'i', 'I in a field types');
      await page.evaluate(() => { document.getElementById('fh-field').remove(); });

      // Add a text object, then double click it with the column hidden: in Move nothing opens; in Select the
      // column is shown (not saved) and its text field takes focus, as Edit on a card does on the Draft.
      await page.locator('#team-canvas-root .ts-rail>.ts-inspector-toggle').click(); await fixture.settle(page);
      await page.locator('#tc-figure-toolbar-slot .tc-figure-tools').getByRole('button', {name: 'Add text', exact: true}).click();
      await page.waitForFunction(() => { const d = savedDocuments[savedDocuments.length - 1]; return d && d.items.some(i => i.type === 'text'); });
      await fixture.settle(page);
      await page.locator('#team-canvas-root .ts-rail>.ts-inspector-toggle').click(); await fixture.settle(page);
      assert.ok((await st()).hidden, 'hidden before the double click');
      const text = page.locator('#tc-preview-panel .tc-free-item:has(.tc-paper-text)').first();
      await text.scrollIntoViewIfNeeded();
      await page.evaluate(() => TeamCanvasPointerMode.setMode('hand'));
      let tb = await aim(page, text);
      await page.mouse.dblclick(tb.x, tb.y); await fixture.settle(page);
      assert.ok((await st()).hidden, 'Move: a double click opens nothing');
      await page.evaluate(() => TeamCanvasPointerMode.setMode('select'));
      tb = await aim(page, text);
      await page.mouse.dblclick(tb.x, tb.y); await fixture.settle(page);
      const after = await st();
      assert.ok(!after.hidden && !after.inert && after.expanded === 'true', `Select: double click on text shows the column ${JSON.stringify(after)}`);
      assert.ok(await page.evaluate(() => { const a = document.activeElement; return !!a && a.matches('[data-item-key="text"]') && !a.closest('[inert]'); }), 'the text field has focus, outside any inert box');
      assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('team-canvas-inspector-hidden:') && localStorage.getItem(k) === '0').length), 0, 'showing it for the edit is not saved as a choice');
      // Back to the Draft keeps the column state.
      await page.keyboard.press('Escape');
      await toDraft(page);
      assert.ok(!(await st()).hidden, 'Draft keeps the shown column');
      assert.deepEqual(errors, [], 'no page errors');
      await page.close();
      console.log('PASS figure inspector toggle: rail button and I hide/show the Figure column like the card inspector; same cell, home and column rects; double click on text shows it in Select only');
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
