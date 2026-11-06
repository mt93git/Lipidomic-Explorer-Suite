// Card status badges sit in each card header with one action and a plain explanation;
// a single global strip shows only while the whole canvas waits; the strip and the notice
// line share the toolbar band's reserved status slot, so neither moves the canvas.
// Static fixture with a stubbed TeamCanvas: no Shiny, no data.
const { chromium } = require('../browser/ci/node_modules/playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const card = id => `<div class="tc-node" data-plot-id="${id}"><div class="tc-node-head" tabindex="0"><strong>Figure ${id}</strong><button type="button" data-canvas-data-settings onclick="window.settingsClicks=(window.settingsClicks||0)+1">Data &amp; settings</button></div></div>`;
(async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.setContent(`<button data-tw-stage="review" onclick="window.reviewClicks=(window.reviewClicks||0)+1">Review</button>
      <section id="team-canvas-root" class="ts-shell"><div class="tc-main" style="display:flex;flex-direction:column">
      <div class="tc-status" role="status" aria-live="polite"></div><div class="tc-scroll" style="order:2"><div class="tc-board">${card('a')}${card('b')}</div></div></div></section>
      <script>window.states={a:'current',b:'current'};window.TeamCanvas={cardStatus:id=>states[id],catalogSource:id=>id};</script>`);
    await p.addStyleTag({ path: path.resolve('www/team/css/canvas_band_status.css') });
    await p.addStyleTag({ path: path.resolve('www/team/css/card_status.css') });
    await p.addScriptTag({ path: path.resolve('www/team/js/canvas_band_status.js') });
    await p.addScriptTag({ path: path.resolve('www/team/js/card_status.js') });
    const set = (states, prep) => p.evaluate(([s, prep]) => { Object.assign(window.states, s); if (prep) window.dispatchEvent(new CustomEvent('team-preparation-state', { detail: prep })); else window.dispatchEvent(new Event('team-canvas-selection')); }, [states, prep]);
    const badge = id => p.evaluate(id => { const c = document.querySelector('.tc-node[data-plot-id="' + id + '"] .tc-card-status'); const b = c && c.querySelector('button'); return c && { state: c.dataset.state, text: c.querySelector('.tc-card-status-text').textContent, action: b ? b.textContent : null, desc: b ? document.getElementById(b.getAttribute('aria-describedby'))?.textContent : c.querySelector('.tc-card-status-desc').textContent, inHead: c.parentElement.classList.contains('tc-node-head') && c.previousElementSibling.tagName === 'STRONG' }; }, id);
    const strip = () => p.evaluate(() => { const s = document.querySelector('.tc-global-wait'); return s && !s.hidden ? { text: s.querySelector('.tc-global-wait-text').textContent, buttons: [...s.querySelectorAll('button')].map(b => b.textContent) } : null; });
    const until = (fn, arg) => p.waitForFunction(fn, arg, { timeout: 8000 });

    await until(() => document.querySelectorAll('.tc-card-status[data-state=current]').length === 2);
    const current = await badge('a');
    assert.equal(current.inHead, true); assert.equal(current.action, null);
    assert.equal(await p.evaluate(() => document.querySelector('.tc-card-status-text').getBoundingClientRect().width <= 1), true, 'Up to date stays quiet');
    assert.equal(await strip(), null);
    const idle = await p.evaluate(() => { const st = document.querySelector('.tc-status'), band = document.querySelector('.tc-band-status'); return { inBand: !!band && st.parentElement === band, width: st.offsetWidth, shown: getComputedStyle(st).visibility, reserved: band ? band.offsetHeight : 0 }; });
    assert.equal(idle.inBand, true, 'the notice line lives in the band status slot');
    assert.equal(idle.width, 0); assert.equal(idle.shown, 'hidden'); assert.ok(idle.reserved >= 30, 'the slot reserves its height while empty');
    console.log('PASS up-to-date cards show a quiet badge in the header; no strip, an empty reserved status slot');

    await set({ a: 'pending', b: 'pending' }, { ready: true, pending: true, running: false, revision: 2 });
    await until(() => !document.querySelector('.tc-global-wait')?.hidden);
    assert.equal(await p.evaluate(() => document.querySelector('.tc-global-wait').parentElement.className), 'tc-band-status', 'the strip lives in the band status slot');
    const pending = await badge('a'), global = await strip();
    assert.equal(pending.text, 'Changes pending'); assert.equal(pending.action, 'Review');
    assert.deepEqual(global.buttons, ['Review changes']); assert.doesNotMatch(global.text, /Figure a|Figure b/, 'never a per-card list');
    await p.click('.tc-global-wait button'); assert.equal(await p.evaluate(() => window.reviewClicks), 1);
    console.log('PASS data changes waiting: per-card "Changes pending" and one global sentence with one action');

    await set({}, { ready: false, pending: false, running: false, revision: 2 });
    await until(() => document.querySelector('.tc-card-status-text').textContent === 'Needs data');
    assert.deepEqual((await strip()).buttons, ['Open Review']);
    console.log('PASS no prepared data reads "Needs data"');

    // Cards kept from before, data loaded but never prepared: no "previous result" exists.
    await set({ a: 'pending', b: 'pending' }, { ready: false, pending: true, running: false, revision: 0, applied: false });
    await until(() => document.querySelector('.tc-card-status-text').textContent === 'Needs data');
    assert.deepEqual((await strip()).buttons, ['Open Review']); assert.doesNotMatch((await strip()).text, /previous result/);
    console.log('PASS never-prepared data reads "Needs data", not "Changes pending"');

    // A waiting card with its own requirement (time points, a comparison) still has one action.
    await p.evaluate(() => { window.TeamCanvasCatalog = { needs: () => ({ kind: 'time' }) }; });
    await set({ a: 'waiting', b: 'current' }, { ready: true, pending: false, running: false, revision: 2, applied: true });
    await until(() => document.querySelector('.tc-card-status').dataset.state === 'waiting');
    assert.equal((await badge('a')).action, 'Data & settings');
    await p.evaluate(() => { delete window.TeamCanvasCatalog; });
    console.log('PASS a waiting card with a requirement keeps Data & settings');

    await set({ a: 'error', b: 'current' }, { ready: true, pending: false, running: false, revision: 3 });
    await until(() => document.querySelector('.tc-card-status').dataset.state === 'error');
    await until(() => document.querySelector('.tc-global-wait').hidden);
    const error = await badge('a');
    assert.equal(error.text, 'Could not update'); assert.equal(error.action, 'Data & settings');
    assert.ok(error.desc.length > 20); assert.doesNotMatch(error.desc, /instance|payload|module/i);
    await p.focus('.tc-node[data-plot-id="a"] .tc-card-status button'); await p.keyboard.press('Enter');
    assert.equal(await p.evaluate(() => window.settingsClicks), 1);
    console.log('PASS an error badge offers Data & settings by keyboard and explains in plain language; strip gone');

    await set({ a: 'updating' });
    await until(() => document.querySelector('.tc-card-status').dataset.state === 'updating');
    assert.equal(await p.evaluate(() => document.querySelector('.tc-card-status-live').textContent), 'Updating figures…');
    assert.equal(await p.evaluate(() => document.querySelectorAll('[aria-live]').length), 3, 'one canvas live region, not one per card');
    console.log('PASS updating shows a blue badge and one polite announcement');

    await set({ a: 'waiting', b: 'finished-stale' });
    await until(() => document.querySelector('.tc-card-status').dataset.state === 'waiting');
    const ratios = await p.evaluate(() => {
      const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
      return [...document.querySelectorAll('.tc-card-status')].map(c => { const s = getComputedStyle(c), a = lum(s.color), b = lum(s.backgroundColor); return [c.dataset.state, (Math.max(a, b) + .05) / (Math.min(a, b) + .05)]; });
    });
    for (const [state, ratio] of ratios) assert.ok(ratio >= 4.5, state + ' contrast ' + ratio.toFixed(2));
    assert.equal((await badge('a')).text, 'Needs settings'); assert.equal((await badge('b')).text, 'Finished · out of date');
    console.log('PASS waiting (amber) and finished-stale (grey) badges keep >= 4.5:1 contrast');

    // The strip and the notice share the reserved slot under the toolbar: showing or hiding
    // either never moves the canvas, and neither reaches into it.
    await p.evaluate(() => { const bar = document.createElement('div'); bar.className = 'tc-toolbar'; bar.style.height = '40px'; document.querySelector('.tc-main').prepend(bar); });
    await set({ a: 'current', b: 'current' }, { ready: true, pending: false, running: false, revision: 3 });
    await until(() => document.querySelector('.tc-global-wait').hidden);
    const scrollTop = () => p.evaluate(() => document.querySelector('.tc-scroll').getBoundingClientRect().top);
    const before = await scrollTop();
    await p.evaluate(() => { document.querySelector('.tc-status').textContent = 'Added Figure a.'; });
    await until(() => document.querySelector('.tc-status').offsetWidth > 0);
    assert.equal(await scrollTop(), before, 'a notice never moves the canvas');
    assert.equal(await p.evaluate(() => document.querySelector('.tc-status').title), 'Added Figure a.');
    await set({ a: 'pending', b: 'pending' }, { ready: true, pending: true, running: false, revision: 4 });
    await until(() => !document.querySelector('.tc-global-wait').hidden);
    assert.equal(await scrollTop(), before, 'the strip appearing never moves the canvas');
    const geo = await p.evaluate(() => {
      const r = s => document.querySelector(s).getBoundingClientRect(), st = r('.tc-status'), w = r('.tc-global-wait'), band = r('.tc-band-status'), bar = r('.tc-toolbar'), scroll = r('.tc-scroll');
      const lum = c => { const [x, y, z] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * x + .7152 * y + .0722 * z; };
      const s = getComputedStyle(document.querySelector('.tc-status')), a = lum(s.color), b = lum(s.backgroundColor);
      return { band, bar, scroll, st, w, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
    assert.ok(geo.band.top >= geo.bar.bottom, 'the slot sits under the toolbar');
    assert.ok(geo.band.bottom <= geo.scroll.top, `the slot (bottom ${geo.band.bottom}) ends above the canvas (top ${geo.scroll.top})`);
    for (const [name, box] of [['notice', geo.st], ['strip', geo.w]]) assert.ok(box.width > 0 && box.top >= geo.band.top && box.bottom <= geo.band.bottom, name + ' stays inside the slot');
    assert.ok(geo.st.left >= geo.w.right || geo.st.right <= geo.w.left, 'the strip and the notice sit side by side');
    assert.ok(geo.ratio >= 4.5, 'notice contrast ' + geo.ratio.toFixed(2));
    await set({ a: 'current', b: 'current' }, { ready: true, pending: false, running: false, revision: 5 });
    await until(() => document.querySelector('.tc-global-wait').hidden);
    await p.evaluate(() => { document.querySelector('.tc-status').textContent = ''; });
    await until(() => !document.querySelector('.tc-status').classList.contains('is-visible'));
    assert.equal(await scrollTop(), before, 'the strip and the notice going never move the canvas');
    console.log('PASS the strip and the notice share the reserved band slot; toggling them never moves the canvas');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
