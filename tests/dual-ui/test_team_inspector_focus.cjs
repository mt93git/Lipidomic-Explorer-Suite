// Run with: node tests/dual-ui/test_team_inspector_focus.cjs
// W6a: the labelled "Hide inspector" / "Show inspector" controls (inspector_toggle.js) never leave focus
// on a hidden or inert node: after each click, a selected object, the Figure page, the tools drawer and
// a breakpoint change, focus is on a shown, enabled, non-inert control. The synthetic resize is sent
// only when a measured box moved. Real Team wiring (fixture_team_overlay_pages.cjs).
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || '../browser/ci/node_modules/playwright');
const F = require('./fixture_team_overlay_pages.cjs');

const usableFocus = page => page.evaluate(() => {
  const a = document.activeElement;
  const ok = !!a && a !== document.body && a.isConnected && !a.disabled && !a.closest('[hidden],[inert]') && a.getClientRects().length > 0 && getComputedStyle(a).visibility !== 'hidden';
  return {ok, at: a ? (a.className || a.tagName) + ':' + (a.textContent || '').trim().slice(0, 24) : null};
});
async function expectUsable(page, what) {
  await F.frames(page);
  const f = await usableFocus(page);
  assert.ok(f.ok, `${what}: focus must be on a usable control, is on ${f.at}`);
  return f.at;
}

(async () => {
  const browser = await chromium.launch({headless: true});
  let checks = 0; const notes = [];
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await F.install(page);
    await page.addInitScript(() => {
      // Every synthetic resize records the measured boxes; two in a row with the same boxes are a needless one.
      window.__resizes = [];
      const d = window.dispatchEvent.bind(window);
      window.dispatchEvent = e => {
        if (e && e.type === 'resize') {
          const root = document.getElementById('team-canvas-root');
          const key = root ? ['.tc-layout>.tc-main', '.tc-layout>.ts-inspector-column', '.tc-layout>#tc-preview-panel'].map(s => { const n = root.querySelector(s); if (!n) return '-'; const r = n.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].join(','); }).join('|') : '';
          window.__resizes.push({key, stack: (new Error().stack || '').includes('inspector_toggle')});
        }
        return d(e);
      };
    });
    await F.setupWorkspace(page, {companion: 'default'});
    const hide = page.locator('#team-canvas-root .ts-inspector-hide'), show = page.locator('#team-canvas-root .ts-inspector-show');
    // Start shown.
    await page.evaluate(() => { if (document.querySelector('#team-canvas-root .tc-layout').classList.contains('ts-inspector-collapsed')) document.querySelector('#team-canvas-root .ts-inspector-toggle').click(); });
    await F.settle(page);

    await hide.focus(); await hide.click(); await F.settle(page);
    assert.match(await expectUsable(page, 'after Hide inspector'), /ts-inspector-show/); checks++;
    await show.click(); await F.settle(page);
    assert.match(await expectUsable(page, 'after Show inspector'), /ts-inspector-hide/); checks++;

    // A selected object hides the labelled control (the inspector's own header takes its place).
    await hide.focus(); await F.selectCard(page);
    await expectUsable(page, 'object selected while Hide inspector had focus'); checks++;
    await page.evaluate(() => { const i = document.getElementById('tc-selection-inspector'); if (i) i.hidden = true; }); await F.settle(page);

    // The tools drawer docks over the column while Show inspector has focus.
    await hide.focus(); await hide.click(); await F.settle(page);
    await show.focus();
    await page.evaluate(() => document.querySelector('#team-canvas-root .tc-layout').classList.add('ttd-open')); await F.settle(page);
    await expectUsable(page, 'tools drawer opened while Show inspector had focus'); checks++;
    await page.evaluate(() => document.querySelector('#team-canvas-root .tc-layout').classList.remove('ttd-open')); await F.settle(page);

    // Focus inside the column when the drawer docks over it (the column turns inert).
    await show.click(); await F.settle(page); await hide.focus();
    await page.evaluate(() => document.querySelector('#team-canvas-root .tc-layout').classList.add('ttd-open')); await F.settle(page);
    await expectUsable(page, 'tools drawer made the column inert under the focus'); checks++;
    await page.evaluate(() => document.querySelector('#team-canvas-root .tc-layout').classList.remove('ttd-open')); await F.settle(page);

    // Breakpoint: the stacked layout offers no Show tab.
    await hide.click(); await F.settle(page); await show.focus();
    await page.setViewportSize({width: 800, height: 900}); await F.settle(page);
    await expectUsable(page, 'stacked breakpoint while Show inspector had focus'); checks++;
    await page.setViewportSize({width: 1440, height: 900}); await F.settle(page);

    // Figure page: the labelled Hide control is not offered there.
    await page.evaluate(() => { if (document.querySelector('#team-canvas-root .tc-layout').classList.contains('ts-inspector-collapsed')) document.querySelector('#team-canvas-root .ts-inspector-toggle').click(); });
    await F.settle(page); await hide.focus();
    await F.figurePage(page);
    await expectUsable(page, 'Figure page while Hide inspector had focus'); checks++;

    // Real pointer sequences (pointerdown, then click) while focus is inside the inspector.
    await page.evaluate(() => { document.querySelector('#tc-preview-panel').hidden = true; document.getElementById('tc-workspace-panel').hidden = false; document.getElementById('team-canvas-root').classList.remove('tc-figure-mode'); });
    await F.settle(page); await hide.focus();
    const rail = page.locator('#team-canvas-root .ts-inspector-toggle');
    let box = await rail.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await F.settle(page);
    await expectUsable(page, 'real pointer click on the rail toggle with focus in the column'); checks++;
    await rail.click(); await F.settle(page); // shown again
    const trigger = page.locator('#team-canvas-root [data-ttd-trigger]').first();
    if (await trigger.count() && await trigger.isVisible()) {
      await hide.focus(); box = await trigger.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await F.settle(page);
      await expectUsable(page, 'real pointer click on Analysis tools with focus in the column'); checks++;
      await page.keyboard.press('Escape'); await F.settle(page);
      await page.evaluate(() => document.querySelector('#team-canvas-root .tc-layout').classList.remove('ttd-open')); await F.settle(page);
    } else notes.push('no visible Analysis tools trigger in the fixture');
    // The busy dialog opens over a focused Show tab; the drawer hides the tab while busy; on close the
    // focus foreground.js gives back cannot land on it, and must not stay on the body.
    await page.addScriptTag({path: path.resolve('www/team/js/foreground.js')});
    for (const hideWhileBusy of ['drawer', 'figure', 'shown']) {
      await page.evaluate(() => { if (!document.querySelector('#team-canvas-root .tc-layout').classList.contains('ts-inspector-collapsed')) document.querySelector('#team-canvas-root .ts-inspector-toggle').click(); });
      await F.settle(page); await show.focus();
      assert.match((await usableFocus(page)).at, /ts-inspector-show/);
      await page.evaluate(() => { window.__busy = TeamBusy.begin('Saving your checkpoint\u2026'); });
      await page.waitForFunction(() => document.getElementById('team-foreground').open);
      if (hideWhileBusy === 'drawer') await page.evaluate(() => document.querySelector('#team-canvas-root .tc-layout').classList.add('ttd-open'));
      else if (hideWhileBusy === 'figure') await F.figurePage(page);
      else {
        // The inspector is shown again while busy (the Show tab is hidden), focus sits on the dialog
        // itself, and the dialog closes and reopens once (foreground.js, work still pending) first.
        await page.evaluate(async () => {
          document.querySelector('#team-canvas-root .tc-layout').classList.remove('ts-inspector-collapsed');
          const d = document.getElementById('team-foreground'); d.tabIndex = -1; d.focus();
          window.__busy2 = TeamBusy.begin('Saving your checkpoint\u2026'); d.close();
          await new Promise(r => setTimeout(r, 50)); d.focus(); TeamBusy.end(window.__busy2);
        });
        await F.settle(page);
      }
      await page.evaluate(() => TeamBusy.end(window.__busy));
      await page.waitForFunction(() => !document.getElementById('team-foreground').open); await F.settle(page);
      await expectUsable(page, `busy dialog closed after the ${hideWhileBusy} hid its opener`); checks++;
      await page.evaluate(() => { document.querySelector('#team-canvas-root .tc-layout').classList.remove('ttd-open'); document.querySelector('#tc-preview-panel').hidden = true; document.getElementById('tc-workspace-panel').hidden = false; document.getElementById('team-canvas-root').classList.remove('tc-figure-mode'); });
      await F.settle(page);
    }

    // Astra: busy opened from a focused Show tab; the tab is hidden while busy (inspector shown); a real
    // pointer click inside the dialog; an error focuses Dismiss; a real click on Dismiss closes it.
    await page.evaluate(() => { if (!document.querySelector('#team-canvas-root .tc-layout').classList.contains('ts-inspector-collapsed')) document.querySelector('#team-canvas-root .ts-inspector-toggle').click(); });
    await F.settle(page); await show.focus();
    assert.match((await usableFocus(page)).at, /ts-inspector-show/);
    await page.evaluate(() => { window.__busy = TeamBusy.begin('Saving your checkpoint\u2026'); });
    await page.waitForFunction(() => document.getElementById('team-foreground').open);
    await page.evaluate(() => document.querySelector('#team-canvas-root .tc-layout').classList.remove('ts-inspector-collapsed'));
    await F.settle(page);
    await page.locator('#team-foreground h2').click();
    await page.evaluate(() => TeamBusy.fail(window.__busy, 'Could not save.'));
    await page.waitForFunction(() => document.activeElement === document.querySelector('#team-foreground > button'));
    await page.locator('#team-foreground > button').click();
    await page.waitForFunction(() => !document.getElementById('team-foreground').open); await F.settle(page);
    await expectUsable(page, 'busy closed by Dismiss after a click inside and an error, its opener hidden'); checks++;

    // Busy opened with focus on the body ends with focus on the body (as production leaves it); then a
    // real keyboard check: I still toggles the inspector and Space activates no inspector button.
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    assert.equal(await page.evaluate(() => document.activeElement === document.body), true);
    await page.evaluate(() => { window.__busy = TeamBusy.begin('Saving your checkpoint\u2026'); });
    await page.waitForFunction(() => document.getElementById('team-foreground').open);
    await page.evaluate(() => TeamBusy.end(window.__busy));
    await page.waitForFunction(() => !document.getElementById('team-foreground').open); await F.settle(page);
    assert.equal(await page.evaluate(() => document.activeElement === document.body), true, 'busy opened from the body: focus stays on the body'); checks++;
    const collapsed = () => page.evaluate(() => document.querySelector('#team-canvas-root .tc-layout').classList.contains('ts-inspector-collapsed'));
    const c0 = await collapsed();
    await page.keyboard.press('i'); await F.settle(page);
    assert.equal(await collapsed(), !c0, 'I toggles the inspector after the busy close'); checks++;
    await page.evaluate(() => { window.__clicks = 0; document.querySelectorAll('#team-canvas-root .ts-inspector-toggle, #team-canvas-root .ts-inspector-show, #team-canvas-root .ts-inspector-hide').forEach(b => b.addEventListener('click', () => window.__clicks++)); });
    const c1 = await collapsed();
    await page.keyboard.press('Space'); await F.settle(page);
    assert.ok(await page.evaluate(() => window.__clicks === 0) && (await collapsed()) === c1, 'Space activates no inspector button'); checks++;
    await page.keyboard.press('i'); await F.settle(page);

    // Resizes: with the chat open the canvas keeps its track, so hiding or showing the column moves no
    // box (the column stays laid out) and no synthetic resize is sent; with the chat closed the canvas
    // extends and one is sent.
    await page.evaluate(() => { document.querySelector('#tc-preview-panel').hidden = true; document.getElementById('tc-workspace-panel').hidden = false; document.getElementById('team-canvas-root').classList.remove('tc-figure-mode'); });
    await F.settle(page);
    const count = () => page.evaluate(() => window.__resizes.filter(x => x.stack).length);
    await page.evaluate(() => document.body.classList.add('assistant-chat-open')); await F.settle(page);
    let before = await count();
    await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
    await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
    assert.equal(await count() - before, 0, 'no resize when hiding/showing moves no box'); checks++;
    await page.evaluate(() => document.body.classList.remove('assistant-chat-open')); await F.settle(page);
    before = await count();
    await page.locator('#team-canvas-root .ts-inspector-toggle').click(); await F.settle(page);
    const moved = await count() - before;
    assert.ok(moved >= 1, 'a resize when the canvas extends'); checks++;
    const own = await page.evaluate(() => window.__resizes.filter(x => x.stack));
    assert.deepEqual(errors, []); checks++;
    if (notes.length) console.log('NOTE', notes.join('; '));
    console.log(`PASS inspector focus: ${checks} checks (Hide/Show, selected object, drawer, inert column, 800 px breakpoint, Figure page, real pointer on rail/drawer, busy close with a hidden opener (drawer, Figure page, inspector shown again with focus on the dialog and a reopen; click inside, error, Dismiss; opened from the body stays on the body, then I toggles and Space activates nothing); resize only when a box moved: 0 with the chat open, ${moved} when the canvas extends)`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
