// ux25: the lipid scene in the Team busy dialog (busy_presentation.js + busy_presentation.css).
// No server: a page loads foreground.js, busy_phrases.js and busy_presentation.js with their CSS.
// node tests/team-ux/test_busy_lipid_scene.cjs   (SHOTS=<dir> also saves screenshots and frames)
// Checks: the scene shows in the Team shell only, its animations run (transform/opacity only),
// micelle while preparing and bilayer once Review is reached, nothing runs while the dialog is closed
// or under reduced motion, phrases and the live region are unchanged, no console errors, and the
// open-to-close time of a busy operation with main-thread work is not slower with the scene.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || '../browser/ci/node_modules/playwright');
const ROOT = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SHOTS = process.env.SHOTS || '';
const html = shell => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${read('www/team/css/foreground.css')}${read('www/team/css/busy_presentation.css')}</style></head>
<body class="${shell ? 'ts-shell-app' : ''}" data-team-stage="data"><div id="team-workspace"><h1>Workspace</h1></div>
<script>${read('www/team/js/foreground.js')}</script><script>${read('www/team/js/busy_phrases.js')}</script>
<script>${read('www/team/js/busy_presentation.js')}</script></body></html>`;

const state = () => {
  const s = document.querySelector('#team-foreground .tbp-scene');
  const anims = s ? s.getAnimations({subtree: true}) : [];
  const props = new Set();
  anims.forEach(a => a.effect.getKeyframes().forEach(k => Object.keys(k).forEach(p => { if (!['offset', 'easing', 'composite', 'computedOffset'].includes(p)) props.add(p); })));
  const r = s && s.getBoundingClientRect();
  return {scene: s ? s.dataset.scene : null, shown: !!r && r.width > 0, w: r ? r.width : 0,
    running: anims.filter(a => a.playState === 'running').length, props: [...props].sort(),
    spinner: getComputedStyle(document.querySelector('.team-foreground-spinner')).display,
    hidden: s ? s.getAttribute('aria-hidden') : null, live: document.querySelector('.tbp-live').getAttribute('aria-live'),
    phrase: document.querySelector('.tbp-phrase').textContent, open: document.getElementById('team-foreground').open};
};

async function page(browser, opts) {
  const p = await browser.newPage({viewport: opts.viewport || {width: 1280, height: 800}, reducedMotion: opts.reduced ? 'reduce' : 'no-preference'});
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.setContent(html(opts.shell !== false));
  return {p, errors};
}

// Open-to-close of one busy operation that runs 40 x 25 ms of main-thread work (Shiny-like) and
// closes when it is done; also counts long tasks (>50 ms) and the frames painted meanwhile.
const timed = () => new Promise(resolve => {
  const longs = []; const po = new PerformanceObserver(l => l.getEntries().forEach(e => longs.push(e.duration))); po.observe({entryTypes: ['longtask']});
  let frames = 0, on = true; (function f() { if (on) { frames++; requestAnimationFrame(f); } })();
  const t0 = performance.now(), id = TeamBusy.begin('Preparing data…');
  let n = 0;
  (function chunk() {
    const end = performance.now() + 25; let x = 0; while (performance.now() < end) x += Math.sqrt(x + 1);
    if (++n < 40) return setTimeout(chunk, 0);
    TeamBusy.end(id);
    requestAnimationFrame(() => { on = false; po.disconnect(); resolve({ms: performance.now() - t0, longs: longs.length, frames, closed: !document.getElementById('team-foreground').open}); });
  })();
});

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    // Team shell, desktop: micelle while preparing.
    const {p, errors} = await page(browser, {});
    await p.evaluate(() => { window.__op = TeamBusy.begin('Preparing data…'); });
    await p.waitForTimeout(1200);
    let s = await p.evaluate(state);
    assert.equal(s.scene, 'micelle'); assert.ok(s.shown, 'scene shown'); assert.equal(s.hidden, 'true'); assert.equal(s.live, 'polite');
    assert.ok(s.running >= 10, 'animations running: ' + s.running);
    assert.deepEqual(s.props.filter(x => x !== 'transform' && x !== 'opacity'), [], 'only transform/opacity: ' + s.props);
    assert.equal(s.spinner, 'none', 'the scene replaces the spinner');
    if (SHOTS) {
      fs.mkdirSync(SHOTS, {recursive: true});
      const dlg = p.locator('#team-foreground');
      await dlg.screenshot({path: path.join(SHOTS, 'desktop-micelle.png')});
      for (let i = 0; i < 12; i++) { await p.locator('.tbp-scene').screenshot({path: path.join(SHOTS, 'frames-micelle-' + String(i).padStart(2, '0') + '.png')}); await p.waitForTimeout(220); }
    }
    // Phrases rotate as before.
    const ph1 = s.phrase; await p.waitForTimeout(2700); assert.notEqual((await p.evaluate(state)).phrase, ph1, 'phrases rotate');
    // Review reached: bilayer with the flip-flopping lipid.
    await p.evaluate(() => { document.body.dataset.teamStage = 'review'; });
    await p.waitForTimeout(1500);
    s = await p.evaluate(state);
    assert.equal(s.scene, 'bilayer'); assert.ok(s.running >= 25, 'bilayer animations: ' + s.running);
    if (SHOTS) {
      await p.locator('#team-foreground').screenshot({path: path.join(SHOTS, 'desktop-bilayer.png')});
      for (let i = 0; i < 24; i++) { await p.locator('.tbp-scene').screenshot({path: path.join(SHOTS, 'frames-bilayer-' + String(i).padStart(2, '0') + '.png')}); await p.waitForTimeout(400); }
    }
    // Closed: nothing renders or runs.
    await p.evaluate(() => TeamBusy.end(window.__op));
    await p.waitForTimeout(100);
    s = await p.evaluate(state);
    assert.equal(s.open, false); assert.equal(s.shown, false); assert.equal(s.running, 0, 'no animation while closed');
    // Error state: the scene goes with the presentation.
    await p.evaluate(() => { const id = TeamBusy.begin('Preparing data…'); TeamBusy.fail(id, 'x'); });
    await p.waitForTimeout(100);
    s = await p.evaluate(state); assert.equal(s.shown, false); assert.equal(s.running, 0);
    assert.deepEqual(errors, []);
    await p.close();

    // 375 px phone.
    const phone = await page(browser, {viewport: {width: 375, height: 740}});
    await phone.p.evaluate(() => TeamBusy.begin('Preparing data…'));
    await phone.p.waitForTimeout(1500);
    s = await phone.p.evaluate(state);
    const fit = await phone.p.evaluate(() => { const d = document.getElementById('team-foreground').getBoundingClientRect(); return {left: d.left, right: d.right, sw: document.documentElement.scrollWidth}; });
    assert.ok(s.shown && fit.left >= 0 && fit.right <= 375 && fit.sw <= 375, 'fits 375 px: ' + JSON.stringify(fit));
    if (SHOTS) await phone.p.screenshot({path: path.join(SHOTS, 'phone-375.png')});
    assert.deepEqual(phone.errors, []);
    await phone.p.close();

    // Reduced motion: a static pose, phrase as before (one, not rotating).
    const rm = await page(browser, {reduced: true});
    await rm.p.evaluate(() => TeamBusy.begin('Preparing data…'));
    await rm.p.waitForTimeout(300);
    s = await rm.p.evaluate(state);
    assert.ok(s.shown); assert.equal(s.running, 0, 'static under reduced motion');
    const op = await rm.p.evaluate(() => [...document.querySelectorAll('.tbp-scene .tbl')].every(n => getComputedStyle(n.firstChild).opacity === '1'));
    assert.ok(op, 'static pose fully assembled');
    if (SHOTS) await rm.p.locator('#team-foreground').screenshot({path: path.join(SHOTS, 'reduced-motion.png')});
    assert.deepEqual(rm.errors, []);
    await rm.p.close();

    // Classic-like page (no Team shell class): never shown, spinner kept.
    const cl = await page(browser, {shell: false});
    await cl.p.evaluate(() => TeamBusy.begin('Preparing data…'));
    await cl.p.waitForTimeout(300);
    s = await cl.p.evaluate(state);
    assert.equal(s.shown, false); assert.equal(s.running, 0); assert.notEqual(s.spinner, 'none');
    await cl.p.close();

    // Timing: open-to-close with 1 s of chunked main-thread work, scene vs no scene, interleaved.
    const runs = {scene: [], none: []};
    for (let i = 0; i < 6; i++) for (const shell of [true, false]) {
      const t = await page(browser, {shell});
      await t.p.waitForTimeout(200);
      runs[shell ? 'scene' : 'none'].push(await t.p.evaluate(timed));
      await t.p.close();
    }
    const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
    const sum = k => ({ms: Math.round(med(runs[k].map(r => r.ms))), longTasks: runs[k].reduce((a, r) => a + r.longs, 0), frames: med(runs[k].map(r => r.frames))});
    const T = {scene: sum('scene'), none: sum('none')};
    assert.ok(runs.scene.every(r => r.closed));
    // Medians of interleaved runs, with room for host noise (GC, scheduling): a real regression from
    // per-frame main-thread work would show far beyond it.
    assert.ok(T.scene.longTasks <= T.none.longTasks + 2, 'no added long tasks: ' + JSON.stringify(T));
    assert.ok(T.scene.ms <= T.none.ms * 1.15 + 50, 'no open-to-close regression: ' + JSON.stringify(T));
    console.log('PASS busy lipid scene: micelle/bilayer, ' + s.running + ' running in Classic, timing ' + JSON.stringify(T));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
