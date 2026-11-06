// Run with: node tests/dual-ui/test_team_tools_drawer.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const catalog = JSON.stringify({groups:[{title:'Big picture',tools:['Quality Check','Heatmap']},{title:'Compare conditions',tools:['Volcano Plot']},{title:'Over time',tools:['Longitudinal']}],
      descriptions:{'Quality Check':'Inspect distributions.','Heatmap':'Explore abundance patterns.','Volcano Plot':'Find lipid differences.','Lexicon':'Look up terms.'}});
    await page.setContent(`<!doctype html><body style="margin:0">
      <div id="guide-navigation"><nav><button type="button" class="guide-step" data-guide-step="5">Results</button></nav>
        <div class="guide-global-actions"><button type="button" class="guide-button" data-guide-step="5">All analysis tools</button><button type="button" class="guide-button" data-guide-tool="App Info">Help & methods</button></div></div>
      <div id="tw-pending-bar"></div>
      <div class="guide-page"><div class="guide-panel"><div class="guide-tool-grid"><button type="button" data-guide-tool="Heatmap">Heatmap (recommended)</button></div></div>
        <details id="results-tools"><summary>All analysis tools (advanced)</summary><div class="guide-tool-grid">
          <button type="button" class="guide-button" data-guide-tool="Quality Check">Quality Check</button>
          <button type="button" class="guide-button" data-guide-tool="Heatmap">Heatmap</button>
          <button type="button" class="guide-button" data-guide-tool="Volcano Plot">Volcano Plot</button>
          <button type="button" class="guide-button" data-guide-tool="Lexicon">Lexicon</button></div></details>
        <div id="guide_quality_next"><button type="button" class="guide-button" id="continue">Continue to My question →</button><span id="tw-continue-reason">Update prepared data first.</span></div></div>
      <div class="tw-canvas-tabs"><details id="canvas-tools"><summary>Analysis tools</summary><div class="tw-tools"><button type="button" class="guide-button" data-guide-tool="Heatmap">Heatmap</button></div></details></div>
      <button id="outside">Outside</button>
      <script type="application/json" id="team-tools-drawer-catalog">${catalog}</script>
      <script>window.escSeen=0;document.addEventListener('keydown',e=>{if(e.key==='Escape')escSeen++;});</script>
      <script>window.sent=[];document.addEventListener('click',e=>{const b=e.target.closest('button[data-guide-step],button[data-guide-tool]');if(b)sent.push(b.dataset.guideStep?['guide_step',Number(b.dataset.guideStep)]:['guide_open_tool',b.dataset.guideTool]);});</script>
    </body>`);
    await page.addStyleTag({path:path.resolve('www/team/css/tools_drawer.css')});
    await page.addScriptTag({path:path.resolve('www/team/js/tools_drawer.js')});

    const trigger = page.locator('#guide-navigation .guide-global-actions button[data-guide-step="5"]');
    const drawer = page.locator('#team-tools-drawer');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await trigger.getAttribute('aria-controls'), 'team-tools-drawer');
    assert.equal(await trigger.locator('.ttd-chevron').count(), 1, 'trigger shows a chevron');
    assert.equal((await trigger.textContent()).trim(), 'All analysis tools', 'chevron adds no text');
    assert.equal(await page.locator('.guide-step[data-guide-step="5"]').getAttribute('aria-expanded'), null, 'the Results step itself is not a drawer trigger');

    await trigger.click();
    assert.equal(await drawer.isVisible(), true, 'step-bar link opens the drawer');
    assert.deepEqual(await page.evaluate(() => sent), [], 'the old step-5 navigation is not sent');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(await drawer.getAttribute('role'), 'dialog');
    assert.equal(await drawer.getAttribute('aria-modal'), 'false');
    assert.equal(await page.locator('#team-tools-drawer-title').textContent(), 'All analysis tools');
    assert.deepEqual(await drawer.locator('.ttd-group-title').allTextContents(), ['Big picture','Compare conditions','Other tools'], 'groups follow the catalog; empty groups are skipped; unknown tools go to Other tools');
    assert.deepEqual(await drawer.locator('.ttd-name').allTextContents(), ['Quality Check','Heatmap','Volcano Plot','Lexicon']);
    assert.equal(await drawer.locator('.ttd-item', {hasText:'Volcano Plot'}).locator('.ttd-desc').textContent(), 'Find lipid differences.');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'ttd-close', 'focus moves into the drawer');
    const navBottom = await page.evaluate(() => document.getElementById('guide-navigation').getBoundingClientRect().bottom);
    // Guided pages, every width: in the page flow under the step bar and the "Changes pending" bar.
    assert.equal(await drawer.evaluate(el => el.classList.contains('ttd-inline') && getComputedStyle(el).position !== 'fixed'), true, 'in the page flow at 1440 px');
    assert.equal(await drawer.evaluate(el => el.previousElementSibling && el.previousElementSibling.id), 'tw-pending-bar', 'placed right after the pending bar');
    assert.ok(Math.round((await drawer.boundingBox()).y) >= Math.round(navBottom), 'drawer starts under the step bar when no changes are pending');

    await page.keyboard.press('Escape');
    assert.equal(await drawer.isVisible(), false, 'Escape closes');
    assert.equal(await page.evaluate(() => escSeen), 0, 'the drawer owns Escape: document Escape handlers (companion, expanded Canvas) do not run');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'focus returns to the trigger');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => escSeen), 1, 'with the drawer closed, Escape reaches the other handlers');

    // The "Changes pending" bar is a server render that can arrive after the drawer opened: open first,
    // then render the bar, grow it and remove it. The open drawer follows each time and never covers it.
    const BAR = '<div class="tw-pending-bar" data-tw-pending="true" style="padding:10px 24px"><p class="tw-pending-text">Changes pending</p><div class="tw-pending-actions"><button type="button" class="btn tw-pending-update" data-tw-pending-update="run">Update prepared data</button><button type="button" class="btn tw-pending-undo" data-tw-pending-undo="S1">Undo</button></div></div>';
    const drawerTop = async () => Math.round((await drawer.boundingBox()).y);
    const pendingBottom = () => page.evaluate(() => Math.round(document.getElementById('tw-pending-bar').getBoundingClientRect().bottom));
    // Update and Undo are the top element at their centres (nothing covers them).
    const barButtonsFree = () => page.evaluate(() => Array.from(document.querySelectorAll('#tw-pending-bar button')).map(b => { const r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && b.contains(hit); }));
    const below = () => page.waitForFunction(() => document.getElementById('team-tools-drawer').getBoundingClientRect().top >= document.getElementById('tw-pending-bar').getBoundingClientRect().bottom - 0.5);
    await trigger.click();
    assert.ok(await drawerTop() >= Math.round(navBottom), 'opened before the bar: drawer under the step bar');
    await page.evaluate(html => { document.getElementById('tw-pending-bar').innerHTML = html; }, BAR);
    await below();
    assert.ok(await pendingBottom() > Math.round(navBottom));
    assert.ok(await drawerTop() >= await pendingBottom(), 'the bar rendered after opening: the open drawer is below it');
    assert.deepEqual(await barButtonsFree(), [true, true], 'Update and Undo are not covered');
    const before = await drawerTop();
    await page.evaluate(() => { document.querySelector('#tw-pending-bar .tw-pending-bar').style.paddingBottom = '60px'; });
    await page.waitForFunction(b => Math.round(document.getElementById('team-tools-drawer').getBoundingClientRect().top) > b, before);
    assert.ok(await drawerTop() >= await pendingBottom(), 'the bar grew: the drawer follows');
    assert.deepEqual(await barButtonsFree(), [true, true]);
    await page.evaluate(() => { document.getElementById('tw-pending-bar').textContent = ''; });
    await page.waitForFunction(b => Math.round(document.getElementById('team-tools-drawer').getBoundingClientRect().top) < b, before);
    assert.ok(await drawerTop() >= Math.round(navBottom));
    assert.equal(await drawer.isVisible(), true, 'the drawer stays open while the bar changes');
    await page.keyboard.press('Escape');
    // The bar container itself appears later (it is not in the page when the drawer opens).
    await page.evaluate(() => document.getElementById('tw-pending-bar').remove());
    await trigger.click();
    assert.ok(await drawerTop() >= Math.round(navBottom));
    await page.evaluate(html => { const b = document.createElement('div'); b.id = 'tw-pending-bar'; b.innerHTML = html; document.getElementById('guide-navigation').after(b); }, BAR);
    await below();
    assert.equal(await drawer.evaluate(el => el.previousElementSibling && el.previousElementSibling.id), 'tw-pending-bar', 'the bar appeared after opening (MutationObserver): the drawer moves after it');
    assert.ok(await drawerTop() >= await pendingBottom());
    assert.deepEqual(await barButtonsFree(), [true, true]);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { document.getElementById('tw-pending-bar').textContent = ''; });

    await trigger.click();
    await page.locator('#outside').click();
    assert.equal(await drawer.isVisible(), false, 'outside click closes');

    await trigger.click();
    await drawer.locator('.ttd-close').click();
    assert.equal(await drawer.isVisible(), false, 'close button closes');
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);

    await trigger.click();
    await drawer.getByRole('button', {name:'Open Volcano Plot'}).click();
    assert.equal(await drawer.isVisible(), false, 'Open closes the drawer');
    assert.deepEqual(await page.evaluate(() => sent), [['guide_open_tool','Volcano Plot']], 'Open clicks the existing tool link and nothing else');

    // Canvas: the "Analysis tools" summary opens the same drawer and the details stays closed.
    const summary = page.locator('#canvas-tools > summary');
    await summary.click();
    assert.equal(await drawer.isVisible(), true);
    assert.equal(await page.locator('#canvas-tools').evaluate(el => el.open), false, 'the old popover does not open');
    assert.equal(await summary.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await summary.evaluate(el => el === document.activeElement), true);

    // API used by the Canvas ⋯ menu item.
    await page.evaluate(() => TeamToolsDrawer.open(document.getElementById('outside')));
    assert.equal(await drawer.isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#outside').evaluate(el => el === document.activeElement), true);

    // 390 px: full width, in the page flow under the step bar and the pending bar, so it covers
    // neither Update/Undo nor Continue and its note (they move down with the page).
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(html => { document.getElementById('tw-pending-bar').innerHTML = html; }, BAR);
    await trigger.click();
    const box = await drawer.boundingBox();
    assert.equal(Math.round(box.x), 0); assert.equal(Math.round(box.width), 390, 'full width at 390 px');
    assert.equal(await drawer.evaluate(el => el.classList.contains('ttd-inline')), true, 'in the page flow at 390 px');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'ttd-close', 'focus moves into the drawer at 390 px');
    assert.ok(Math.round(box.y) >= await pendingBottom(), 'the drawer starts below the pending bar at 390 px');
    assert.deepEqual(await barButtonsFree(), [true, true], 'Update and Undo are not covered at 390 px');
    const continueFree = sel => page.evaluate(s => { const n = document.querySelector(s); n.scrollIntoView({block: 'center'}); const r = n.getBoundingClientRect(), d = document.getElementById('team-tools-drawer').getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && n.contains(hit) && !(r.left < d.right && r.right > d.left && r.top < d.bottom && r.bottom > d.top); }, sel);
    assert.equal(await continueFree('#continue'), true, 'Continue is not covered at 390 px');
    assert.equal(await continueFree('#tw-continue-reason'), true, 'the Continue note is not covered at 390 px');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.keyboard.press('Escape');
    assert.equal(await drawer.isVisible(), false, 'Escape closes at 390 px');
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'focus returns to the trigger at 390 px');
    // Rendered after opening, the bar still pushes the drawer down at 390 px.
    await page.evaluate(() => { document.getElementById('tw-pending-bar').textContent = ''; });
    await trigger.click();
    await page.evaluate(html => { document.getElementById('tw-pending-bar').innerHTML = html; }, BAR);
    await page.waitForFunction(() => document.getElementById('team-tools-drawer').getBoundingClientRect().top >= document.getElementById('tw-pending-bar').getBoundingClientRect().bottom - 0.5);
    assert.deepEqual(await barButtonsFree(), [true, true]);
    await page.locator('#outside').click();
    assert.equal(await drawer.isVisible(), false, 'outside click closes at 390 px');
    // Wide screens (Sol 1, R13 481–600 px): the same in-flow placement, so the right-aligned Continue and its
    // note are never under a fixed panel.
    for (const [width, height] of [[1280, 800], [1440, 900], [540, 844]]) {
      await page.setViewportSize({width, height});
      await page.evaluate(() => { window.scrollTo(0, 0); const c = document.getElementById('guide_quality_next'); c.style.textAlign = 'right'; });
      await trigger.click();
      assert.equal(await drawer.evaluate(el => el.classList.contains('ttd-inline') && getComputedStyle(el).position !== 'fixed'), true, `in the page flow at ${width} px`);
      assert.ok(await drawerTop() >= await pendingBottom(), `below the pending bar at ${width} px`);
      assert.deepEqual(await barButtonsFree(), [true, true], `Update and Undo are not covered at ${width} px`);
      assert.equal(await continueFree('#continue'), true, `the right-aligned Continue is not covered at ${width} px`);
      assert.equal(await continueFree('#tw-continue-reason'), true, `the Continue note is not covered at ${width} px`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.keyboard.press('Escape');
      assert.equal(await drawer.isVisible(), false);
    }

    // One right-side panel at a time, with the real companion chat (companion_assistant.js).
    for (const [width, height] of [[1280, 800], [1440, 900], [390, 844]]) {
      const pc = await browser.newPage({viewport:{width, height}});
      await pc.setContent(`<!doctype html><body style="margin:0">
        <div id="guide-navigation"><div class="guide-global-actions"><button type="button" class="guide-button" data-guide-step="5">All analysis tools</button></div></div>
        <div id="tw-pending-bar">${BAR}</div>
        <details><summary>All analysis tools (advanced)</summary><div class="guide-tool-grid"><button type="button" class="guide-button" data-guide-tool="Heatmap">Heatmap</button></div></details>
        <script type="application/json" id="team-tools-drawer-catalog">{"groups":[],"descriptions":{}}</script>
      </body>`);
      await pc.addStyleTag({path:path.resolve('www/team/css/companion_assistant.css')});
      await pc.addStyleTag({path:path.resolve('www/team/css/tools_drawer.css')});
      await pc.addScriptTag({path:path.resolve('www/team/js/companion_assistant.js')});
      await pc.addScriptTag({path:path.resolve('www/team/js/tools_drawer.js')});
      const at = `${width} px`;
      const trig = pc.locator('#guide-navigation button[data-guide-step="5"]'), launcher = pc.locator('#lipidomic-assistant-root .assistant-launcher');
      const chat = pc.locator('#lipidomic-assistant-panel'), d = pc.locator('#team-tools-drawer');
      await launcher.click();
      await pc.waitForFunction(() => document.activeElement && document.activeElement.matches('#lipidomic-assistant-panel .assistant-chat-input'));
      // Drawer opened while the chat is open: the mascot and its chat are frozen as in production, so the
      // drawer leaves the chat open; the drawer holds focus. The user then closes the chat with its own button.
      await trig.click();
      await pc.waitForTimeout(50);
      assert.equal(await d.isVisible(), true, `drawer opens (${at})`);
      assert.equal(await chat.isVisible(), true, `opening the drawer leaves the companion chat open (${at})`);
      assert.equal(await launcher.getAttribute('aria-expanded'), 'true', `the chat launcher still reports open (${at})`);
      assert.equal(await pc.evaluate(() => document.activeElement.className), 'ttd-close', `focus is in the drawer (${at})`);
      await pc.locator('#lipidomic-assistant-panel .assistant-close').click();
      await pc.waitForTimeout(50);
      // That click is outside the drawer, which closes as on any outside click; open it again.
      if (!await d.isVisible()) { await trig.click(); await pc.waitForTimeout(50); }
      assert.equal(await d.isVisible(), true, `drawer open with the chat closed (${at})`);
      const free = await pc.evaluate(() => Array.from(document.querySelectorAll('#tw-pending-bar button')).map(b => { const r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && b.contains(hit); }));
      assert.deepEqual(free, [true, true], `Update and Undo stay uncovered with the drawer open (${at})`);
      // The chat opened while the drawer is open (any route, here its API): the drawer closes.
      await pc.evaluate(() => LipidomicAssistant.open(document.querySelector('#lipidomic-assistant-root .assistant-launcher')));
      await pc.waitForFunction(() => document.activeElement && document.activeElement.matches('#lipidomic-assistant-panel .assistant-chat-input'));
      assert.equal(await d.isVisible(), false, `opening the companion chat closes the drawer (${at})`);
      assert.equal(await trig.getAttribute('aria-expanded'), 'false', `the drawer trigger reports closed (${at})`);
      const chatFree = await pc.evaluate(() => ['.assistant-close', '.assistant-chat-input', '.assistant-send'].map(s => { const n = document.querySelector('#lipidomic-assistant-panel ' + s), r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && n.contains(hit); }));
      assert.deepEqual(chatFree, [true, true, true], `the chat's Close, input and Send are not covered (${at})`);
      // Escape in the chat belongs to the chat; then the drawer's Escape still works as in wave 1.
      await pc.keyboard.press('Escape');
      assert.equal(await chat.isVisible(), false, `Escape closes the chat (${at})`);
      await trig.click();
      await pc.keyboard.press('Escape');
      assert.equal(await d.isVisible(), false, `Escape closes the drawer (${at})`);
      assert.equal(await trig.evaluate(el => el === document.activeElement), true, `focus returns to the drawer trigger (${at})`);
      await pc.close();
    }
    // One Escape per layer (Astra M2, Sol M2, Opus M6): at 390 px the compact step menu opened by
    // keyboard while the drawer is open owns the first Escape; the drawer closes on the second.
    {
      const pm = await browser.newPage({viewport:{width:390,height:844}});
      await pm.setContent(`<!doctype html><body style="margin:0">
        <div id="guide-navigation"><nav><button type="button" class="guide-step" data-guide-step="1">1 Experiment</button><button type="button" class="guide-step" data-guide-step="2" aria-current="step">2 Design</button><button type="button" class="guide-step" data-guide-step="3">3 Quality</button></nav>
          <div class="guide-global-actions"><button type="button" class="guide-button" data-guide-step="5">All analysis tools</button></div></div>
        <div class="guide-page"><button type="button" id="plain">Plain control</button></div>
        <script type="application/json" id="team-tools-drawer-catalog">{"groups":[],"descriptions":{}}</script>
      </body>`);
      await pm.addStyleTag({path:path.resolve('www/team/css/mobile_steps.css')});
      await pm.addStyleTag({path:path.resolve('www/team/css/tools_drawer.css')});
      await pm.addScriptTag({path:path.resolve('www/team/js/mobile_steps.js')});
      await pm.addScriptTag({path:path.resolve('www/team/js/tools_drawer.js')});
      const dTrig = pm.locator('#guide-navigation .guide-global-actions button[data-guide-step="5"]');
      const dm = pm.locator('#team-tools-drawer'), stepTrig = pm.locator('.tw-compact-steps-trigger'), stepMenu = pm.locator('.tw-compact-steps-menu');
      await dTrig.click();
      assert.equal(await dm.isVisible(), true, 'drawer open at 390 px');
      await stepTrig.focus();
      await pm.keyboard.press('ArrowDown');
      assert.equal(await stepMenu.isVisible(), true, 'the step menu opens by keyboard while the drawer stays open');
      assert.equal(await pm.evaluate(() => !!document.activeElement.closest('.tw-compact-steps-menu')), true, 'focus is in the step menu');
      await pm.keyboard.press('Escape');
      assert.equal(await stepMenu.isVisible(), false, 'the first Escape closes the step menu');
      assert.equal(await dm.isVisible(), true, 'the first Escape does not also close the drawer');
      assert.equal(await stepTrig.evaluate(el => el === document.activeElement), true, 'focus returns to the step trigger');
      await pm.keyboard.press('Escape');
      assert.equal(await dm.isVisible(), false, 'the second Escape closes the drawer');
      assert.equal(await dTrig.evaluate(el => el === document.activeElement), true, 'focus returns to the drawer trigger');
      // A menu that is closed (or a plain control) does not hold Escape back.
      await dTrig.click();
      await pm.locator('#plain').focus();
      await pm.keyboard.press('Escape');
      assert.equal(await dm.isVisible(), false, 'Escape from an ordinary control still closes the drawer');
      // The shared Escape check stays exposed on the drawer API.
      assert.equal(await pm.evaluate(() => typeof TeamToolsDrawer.innerLayerOwnsEscape), 'function');
      await pm.close();
    }

    // Expanded Canvas (fixed, z-index 10000): the drawer opens above it and is usable.
    const page2 = await browser.newPage({viewport:{width:1440,height:900}});
    await page2.setContent(`<!doctype html><body>
      <div id="guide-navigation"><div class="guide-global-actions"><button type="button" class="guide-button" data-guide-step="5">All analysis tools</button></div></div>
      <details><summary>All analysis tools (advanced)</summary><div class="guide-tool-grid">
        <button type="button" class="guide-button" data-guide-tool="Quality Check">Quality Check</button>
        <button type="button" class="guide-button" data-guide-tool="Heatmap">Heatmap</button></div></details>
      <section id="team-canvas-root" class="tc-workspace tc-focus-mode"><button type="button" id="canvas-more">Analysis tools</button>
        <input id="chat" aria-label="Ask the companion a question"><button type="button" id="badge">Badge</button></section>
      <script type="application/json" id="team-tools-drawer-catalog">{"groups":[{"title":"Big picture","tools":["Quality Check","Heatmap"]}],"descriptions":{"Quality Check":[],"Heatmap":"  "}}</script>
      <script>window.escSeen=0;document.addEventListener('keydown',e=>{if(e.key==='Escape')escSeen++;});
        window.badgeClicks=0;document.getElementById('badge').addEventListener('click',e=>{e.stopPropagation();badgeClicks++;});</script>
    </body>`);
    await page2.addStyleTag({path:path.resolve('www/team/css/canvas_viewport.css')});
    await page2.addStyleTag({path:path.resolve('www/team/css/tools_drawer.css')});
    await page2.addScriptTag({path:path.resolve('www/team/js/tools_drawer.js')});
    const drawer2 = page2.locator('#team-tools-drawer');
    await page2.evaluate(() => TeamToolsDrawer.open(document.getElementById('canvas-more')));
    assert.equal(await drawer2.isVisible(), true);
    const topAt = sel => page2.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && document.querySelector(s).contains(hit); }, sel);
    assert.equal(await topAt('#team-tools-drawer'), true, 'the drawer is the top element at its centre over the expanded Canvas');
    assert.equal(Math.round((await drawer2.boundingBox()).y), 0, 'over the expanded Canvas the drawer starts at the top of the screen');
    assert.equal(await page2.evaluate(() => document.activeElement.className), 'ttd-close');
    assert.equal(await topAt('.ttd-close'), true, 'focus lands on a visible, unobscured Close button');
    assert.equal(await drawer2.locator('.ttd-desc').count(), 0, 'empty arrays and blank strings render no description paragraph');
    await drawer2.getByRole('button', {name:'Open Heatmap'}).focus();
    assert.equal(await drawer2.getByRole('button', {name:'Open Heatmap'}).evaluate(el => el === document.activeElement), true, 'drawer controls are reachable over the Canvas');

    // Escape in an unrelated input outside the drawer belongs to that input's owner.
    await page2.locator('#chat').focus();
    await page2.keyboard.press('Escape');
    assert.equal(await drawer2.isVisible(), true, 'Escape in an input outside the drawer does not close it');
    assert.equal(await page2.evaluate(() => escSeen), 1, 'that Escape still reaches document listeners');
    // An open native dialog (foreground progress) keeps its Escape too.
    await page2.evaluate(() => { const d = document.createElement('dialog'); d.id = 'fg'; d.setAttribute('open', ''); document.body.appendChild(d); document.body.focus(); document.activeElement.blur(); });
    await page2.keyboard.press('Escape');
    assert.equal(await drawer2.isVisible(), true, 'Escape with a dialog open does not close the drawer');
    await page2.evaluate(() => document.getElementById('fg').remove());
    // Escape inside the drawer closes it and returns focus to the trigger.
    await drawer2.locator('.ttd-close').focus();
    const seen = await page2.evaluate(() => escSeen);
    await page2.keyboard.press('Escape');
    assert.equal(await drawer2.isVisible(), false, 'Escape inside the drawer closes it');
    assert.equal(await page2.evaluate(() => escSeen), seen, 'that Escape does not also exit the expanded Canvas');
    assert.equal(await page2.locator('#canvas-more').evaluate(el => el === document.activeElement), true, 'focus returns to the trigger');

    // Outside click on a control that stops propagation still closes the drawer.
    await page2.evaluate(() => TeamToolsDrawer.open(document.getElementById('canvas-more')));
    await page2.locator('#badge').click();
    assert.equal(await page2.evaluate(() => badgeClicks), 1);
    assert.equal(await drawer2.isVisible(), false, 'a click on a stopPropagation control closes the drawer');

    assert.equal(await page2.locator('#badge').evaluate(el => el === document.activeElement), true, 'a click that moves focus to another control keeps it there');

    // Real expanded Canvas (canvas_viewport.js): Escape from an ordinary control closes only the drawer.
    const page3 = await browser.newPage({viewport:{width:1440,height:900}});
    await page3.setContent(`<!doctype html><body>
      <details><summary>All analysis tools (advanced)</summary><div class="guide-tool-grid"><button type="button" class="guide-button" data-guide-tool="Heatmap">Heatmap</button></div></details>
      <section id="team-canvas-root"><div class="tc-toolbar"><button type="button" id="canvas-more">Analysis tools</button><button type="button" id="tb-btn">Align</button></div>
        <div class="tc-scroll" style="width:1100px;height:700px"><div class="tc-board" style="width:2000px;height:1500px">
          <article class="tc-node" style="position:absolute;left:100px;top:100px;width:400px;height:300px"><header class="tc-node-head" tabindex="0">Heatmap card</header><p id="blank">Plain text</p></article></div></div>
        <aside class="assistant-panel"><button type="button" id="assistant-btn">Suggest</button></aside></section>
      <script type="application/json" id="team-tools-drawer-catalog">{"groups":[],"descriptions":{}}</script>
    </body>`);
    await page3.addStyleTag({path:path.resolve('www/team/css/canvas_viewport.css')});
    await page3.addStyleTag({path:path.resolve('www/team/css/tools_drawer.css')});
    await page3.addScriptTag({path:path.resolve('www/team/js/canvas_viewport.js')});
    await page3.addScriptTag({path:path.resolve('www/team/js/tools_drawer.js')});
    await page3.evaluate(() => TeamCanvasViewport.mount(document.getElementById('team-canvas-root'), document.querySelector('.tc-board')));
    await page3.locator('.tc-focus-toggle').click();
    const expanded = () => page3.evaluate(() => document.getElementById('team-canvas-root').classList.contains('tc-focus-mode'));
    assert.equal(await expanded(), true, 'Canvas is expanded by the real toggle');
    const drawer3 = page3.locator('#team-tools-drawer');
    // Over the expanded Canvas the drawer starts under the Canvas toolbar: its controls stay uncovered.
    await page3.evaluate(() => TeamToolsDrawer.open(document.getElementById('canvas-more')));
    const underToolbar = await page3.evaluate(() => {
      const d = document.getElementById('team-tools-drawer').getBoundingClientRect(), t = document.querySelector('.tc-toolbar').getBoundingClientRect();
      const free = id => { const n = document.getElementById(id), r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && n.contains(hit); };
      return {below: Math.round(d.top) >= Math.round(t.bottom), more: free('canvas-more'), align: free('tb-btn')};
    });
    assert.deepEqual(underToolbar, {below: true, more: true, align: true}, 'the drawer leaves the Canvas toolbar uncovered');
    await page3.keyboard.press('Escape');
    for (const sel of ['.tc-node-head', '#tb-btn']) {
      await page3.evaluate(() => TeamToolsDrawer.open(document.getElementById('canvas-more')));
      await page3.locator(sel).focus();
      await page3.keyboard.press('Escape');
      assert.equal(await drawer3.isVisible(), false, `Escape with focus on ${sel} closes the drawer`);
      assert.equal(await page3.locator('#canvas-more').evaluate(el => el === document.activeElement), true, `focus returns to the trigger (${sel})`);
      assert.equal(await expanded(), true, `the expanded Canvas stays expanded (${sel})`);
    }
    // Outside click on non-focusable text with focus in the drawer: focus goes back to the trigger.
    await page3.evaluate(() => TeamToolsDrawer.open(document.getElementById('canvas-more')));
    assert.equal(await page3.evaluate(() => document.activeElement.className), 'ttd-close');
    await page3.locator('#blank').click();
    assert.equal(await drawer3.isVisible(), false, 'a click on plain text closes the drawer');
    assert.equal(await page3.locator('#canvas-more').evaluate(el => el === document.activeElement), true, 'focus is not left on a hidden element or body');
    // The companion panel owns its Escape.
    await page3.evaluate(() => TeamToolsDrawer.open(document.getElementById('canvas-more')));
    await page3.locator('#assistant-btn').focus();
    await page3.keyboard.press('Escape');
    assert.equal(await drawer3.isVisible(), true, 'Escape inside the companion panel does not close the drawer');

    // Leaving / re-entering the expanded Canvas while the drawer is open re-places it.
    const over = () => drawer3.evaluate(el => el.classList.contains('ttd-over-canvas'));
    // The companion Escape above reached the viewport and collapsed the Canvas: the open drawer followed.
    assert.equal(await expanded(), false, 'the companion Escape collapsed the Canvas');
    assert.equal(await over(), false, 'drawer left the over-canvas layer with it');
    await page3.evaluate(() => document.getElementById('team-canvas-root').classList.add('tc-focus-mode'));
    await page3.waitForTimeout(50);
    assert.equal(await over(), true, 'drawer lifts over the Canvas when it expands');
    await page3.evaluate(() => document.getElementById('team-canvas-root').classList.remove('tc-focus-mode'));
    await page3.waitForTimeout(50);
    assert.equal(await over(), false, 'drawer drops the over-canvas layer when the Canvas collapses');
    await page3.evaluate(() => document.getElementById('team-canvas-root').classList.add('tc-focus-mode'));
    await page3.waitForTimeout(50);
    assert.equal(await over(), true, 'drawer lifts again when the Canvas expands');

    console.log('PASS: All analysis tools drawer opens from the step bar and Canvas, groups tools, reuses links, closes and restores focus, follows a later pending bar, sits in the page flow on guided pages at every width (Continue and its note uncovered at 1280, 1440, 540 and 390 px) and is the only right-side panel open (companion chat, Help panel)');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
