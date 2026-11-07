// RC3 wave 2: Canvas action feedback and the global waiting strip live in the toolbar band's
// reserved status slot, not over the canvas. While a message and the strip show, a selected
// card's action bar is still what sits under each action's centre (1280, 1440 and 390 px), and
// neither toggling moves the canvas or a card. Static fixture with the real shell, card figure
// and status assets and a stubbed TeamCanvas: no Shiny, no data.
const { chromium } = require('../browser/ci/node_modules/playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
// Card header buttons as canvas.js renders them; card_figure.js moves them into the action bar.
const card = (id, left, top) => `<div class="tc-node is-selected" data-plot-id="${id}" style="position:absolute;left:${left}px;top:${top}px;width:400px;height:280px;background:#fff;border:1px solid #ccd">
  <div class="tc-node-head" tabindex="0" style="display:flex;align-items:center;gap:6px;padding:6px 8px"><strong>Figure ${id}</strong>
  <button type="button">Edit</button><button type="button">Finish plot</button><button type="button" data-canvas-data-settings>Data &amp; settings</button><button type="button">Remove</button></div>
  <div class="tc-content" style="height:220px"></div></div>`;
const LONG = 'Saved plots awaiting their analysis (source analysis replaced or not yet mounted): Figure a, Figure b. Open the relevant analysis to load them.';
(async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.setContent(`<body class="ts-shell-app" style="margin:0"><button data-tw-stage="review">Review</button>
      <section id="team-canvas-root" class="ts-shell"><div class="tc-main" style="height:820px">
      <div class="tc-toolbar"><div class="ts-tools"><button type="button" class="ts-tool">Add plot</button><button type="button" class="ts-tool">Arrange</button></div></div>
      <div class="tc-viewport-shell"><div class="tc-scroll" style="overflow:auto;position:relative"><div class="tc-board" style="position:relative;width:1600px;height:1400px">
      ${card('a', 16, 0)}${card('b', 460, 44)}</div></div></div>
      <div class="tc-status" role="status" aria-live="polite"></div></div></section>
      <script>window.states={a:'current',b:'current'};window.TeamCanvas={cardStatus:id=>states[id],catalogSource:id=>id};</script></body>`);
    // App order (R/frontends/team/ui.R registers card_status.css once, before canvas_band_status.css).
    for (const css of ['shell.css', 'card_figure.css', 'card_status.css', 'canvas_band_status.css']) await p.addStyleTag({ path: path.resolve('www/team/css/' + css) });
    for (const js of ['card_figure.js', 'canvas_band_status.js', 'card_status.js']) await p.addScriptTag({ path: path.resolve('www/team/js/' + js) });
    const until = (fn, arg) => p.waitForFunction(fn, arg, { timeout: 8000 });
    const set = (states, prep) => p.evaluate(([s, prep]) => { Object.assign(window.states, s); window.dispatchEvent(new CustomEvent('team-preparation-state', { detail: prep })); }, [states, prep]);
    const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const layout = () => p.evaluate(() => ({ scroll: document.querySelector('.tc-scroll').getBoundingClientRect().top, cards: [...document.querySelectorAll('.tc-node')].map(n => n.getBoundingClientRect().top) }));
    await until(() => document.querySelectorAll('.tc-card-actions').length === 2 && document.querySelector('.tc-band-status'));

    for (const width of [1280, 1440, 390]) {
      await p.setViewportSize({ width, height: 900 }); await frames();
      // Quiet canvas: no message, no strip.
      await set({ a: 'current', b: 'current' }, { ready: true, pending: false, running: false, revision: 1 });
      await p.evaluate(() => { document.querySelector('.tc-status').textContent = ''; });
      await until(() => document.querySelector('.tc-global-wait')?.hidden !== false && !document.querySelector('.tc-status').classList.contains('is-visible'));
      await frames(); const quiet = await layout();

      // An action message ("Added …", the restore list) and the strip, both showing.
      await p.evaluate(text => { document.querySelector('.tc-status').textContent = text; }, LONG);
      await until(() => document.querySelector('.tc-status').classList.contains('is-visible'));
      await frames(); assert.deepEqual(await layout(), quiet, width + ': a message never moves the canvas or a card');
      await set({ a: 'pending', b: 'pending' }, { ready: true, pending: true, running: false, revision: 2 });
      await until(() => document.querySelector('.tc-global-wait')?.hidden === false);
      await frames(); assert.deepEqual(await layout(), quiet, width + ': the strip never moves the canvas or a card');

      const probe = await p.evaluate(() => {
        const r = el => el.getBoundingClientRect(), band = r(document.querySelector('.tc-band-status')), scroll = r(document.querySelector('.tc-scroll'));
        const status = document.querySelector('.tc-status'), strip = document.querySelector('.tc-global-wait');
        const hits = [];
        document.querySelectorAll('.tc-node.is-selected').forEach(node => {
          const bar = node.querySelector('.tc-card-actions'); if (getComputedStyle(bar).visibility === 'hidden') return;
          bar.querySelectorAll('button').forEach(b => {
            const box = r(b), x = box.left + box.width / 2, y = box.top + box.height / 2;
            if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) return;
            const hit = document.elementFromPoint(x, y);
            hits.push({ card: node.dataset.plotId, label: b.textContent, ok: !!hit && hit.closest('.tc-node') === node && !!hit.closest('.tc-card-actions') });
          });
        });
        return { band, scroll, hits, status: r(status), strip: r(strip), statusShown: getComputedStyle(status).visibility === 'visible', role: status.getAttribute('role'), live: status.getAttribute('aria-live') };
      });
      assert.ok(probe.statusShown && probe.status.width > 0, width + ': the message shows');
      // Shown once: one visible element carries the text (the band slot only contains the notice line).
      const copies = await p.evaluate(text => Array.from(document.querySelectorAll('body *')).filter(n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden' &&
        Array.from(n.childNodes).some(c => c.nodeType === 3 && c.textContent.trim().length > 20 && text.includes(c.textContent.trim().slice(0, 40)))).map(n => n.className || n.tagName), LONG);
      assert.deepEqual(copies, ['tc-status is-visible'], `${width}: the message shows once (${JSON.stringify(copies)})`);
      assert.equal(probe.role, 'status'); assert.equal(probe.live, 'polite');
      assert.ok(probe.band.bottom <= probe.scroll.top, `${width}: the status slot (bottom ${probe.band.bottom}) ends above the canvas (top ${probe.scroll.top})`);
      for (const [name, box] of [['message', probe.status], ['strip', probe.strip]]) assert.ok(box.top >= probe.band.top && box.bottom <= probe.band.bottom, `${width}: the ${name} stays inside the slot`);
      assert.ok(probe.hits.some(h => h.card === 'a'), width + ': the selected card at the top edge was probed');
      for (const h of probe.hits) assert.ok(h.ok, `${width}: ${h.label} on card ${h.card} is what sits under its centre`);
      // The strip's action is still reachable while the message shows.
      assert.equal(await p.evaluate(() => { const b = document.querySelector('.tc-global-wait button'), x = b.getBoundingClientRect(); return document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2) === b; }), true, width + ': the strip action is not covered');

      // Both going away: still no shift.
      await set({ a: 'current', b: 'current' }, { ready: true, pending: false, running: false, revision: 3 });
      await until(() => document.querySelector('.tc-global-wait').hidden);
      await p.evaluate(() => { document.querySelector('.tc-status').textContent = ''; });
      await until(() => !document.querySelector('.tc-status').classList.contains('is-visible'));
      await frames(); assert.deepEqual(await layout(), quiet, width + ': the strip and the message going never move the canvas');
      console.log(`PASS ${width} px: status in the band slot, selected card actions uncovered (${probe.hits.length} probed), no layout shift`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
