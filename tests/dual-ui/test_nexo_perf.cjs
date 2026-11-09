// H7b: canvas render performance, mock build only. Chromium measures; WebKit runs the functional assertions.
// node tests/dual-ui/test_nexo_perf.cjs
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const ci = path.join(root, 'tests/browser/ci');
const checkpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id;
const catalog = require(path.join(nexo, 'src/mock/catalog.json')).outputs;
const MAX_LIVE = 4, out = '/tmp/nexo-h7b';
let server;
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: nexo, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
}
function port() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
const stats = values => {
  const v = [...values].sort((a, b) => a - b), at = q => v[Math.min(v.length - 1, Math.floor(q * v.length))];
  return { median: v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2, p90: at(.9), max: v[v.length - 1] };
};
const fmt = s => `median ${s.median.toFixed(2)} ms · p90 ${s.p90.toFixed(2)} ms · max ${s.max.toFixed(2)} ms`;
// Plots in cards never exceed the cap. Plotly.toImage briefly draws a hidden clone in <body> (snapshot
// previews), so the whole-document count is checked once the canvas has settled.
async function assertCap(page, step, settledNow = true) {
  const [inCards, all] = await page.evaluate(() => [document.querySelectorAll('.card .js-plotly-plot').length, document.querySelectorAll('.js-plotly-plot').length]);
  assert(inCards <= MAX_LIVE, `${step}: ${inCards} live Plotly plots in cards (max ${MAX_LIVE})`);
  // Off-screen snapshots (Plotly's hidden toImage clone) may still be queued just after settling, more so on the
  // wider canvas the floating library leaves (wave 1); a leaked plot would stay, so allow them 5 s to finish.
  if (settledNow) { const left = await page.waitForFunction(max => document.querySelectorAll('.js-plotly-plot').length <= max, MAX_LIVE, { timeout: 5000 }).then(() => 0, () => all);
    assert(!left, `${step}: ${left} Plotly plots in the DOM after settling (max ${MAX_LIVE})`); }
  return inCards;
}
// WebGL contexts (Plotly 3D scenes) created on the page, counted by wrapping getContext. WebKit frees a dropped context
// only on GC (WEBGL_lose_context does not free its slot) and past 16 loses the oldest one, so panning must reuse contexts:
// the page never creates WEBKIT_GL_CAP of them (live 3D cards park their plot; Plotly's exports share one context).
const countWebgl = () => {
  const counted = new WeakSet(), getContext = HTMLCanvasElement.prototype.getContext, gl = window.__nexoWebgl = { created: 0, lost: 0, stacks: [] };
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = getContext.call(this, type, ...rest);
    if (ctx && /^(webgl2?|experimental-webgl)$/.test(type) && !counted.has(this)) {
      counted.add(this); gl.created++;
      // Plotly's own frames first, then the app's: the first 6 frames outside plotly.min.js name the creator.
      const limit = Error.stackTraceLimit; Error.stackTraceLimit = 60; const stack = new Error().stack; Error.stackTraceLimit = limit; // V8 keeps 10
      const frames = (stack ?? '').split('\n').map(l => l.trim()).filter(l => l && l !== 'Error' && !/countWebgl|getContext/.test(l));
      gl.stacks.push(frames.filter(l => !/plotly\.min\.js/.test(l)).slice(0, 6).map(l => l.replace(/^at /, '').replace(/https?:\/\/[^/]+/, '')).join(' < '));
      this.addEventListener('webglcontextlost', () => { gl.lost++; }, { once: true });
    }
    return ctx;
  };
};
const WEBKIT_GL_CAP = 16;
// The callers of getContext that created the most contexts (first frames of each creation's stack).
const glCreators = gl => Object.entries(gl.stacks.reduce((m, s) => ({ ...m, [s]: (m[s] ?? 0) + 1 }), {}))
  .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, n]) => `  ${n}× ${s}`).join('\n');
async function assertWebgl(page, step) {
  const gl = await page.evaluate(() => window.__nexoWebgl);
  assert(gl.created < WEBKIT_GL_CAP, `${step}: ${gl.created} WebGL contexts created on the page (WebKit loses the oldest past ${WEBKIT_GL_CAP}); top creators:\n${glCreators(gl)}`);
}
const frames = (page, n = 2) => page.evaluate(n => new Promise(resolve => { const tick = () => (n-- ? requestAnimationFrame(tick) : resolve()); tick(); }), n);
// Wait until the gesture is over and every card in view has drawn: the live set is full again.
async function settled(page) {
  await page.waitForFunction(max => {
    const cards = [...document.querySelectorAll('.card:not([hidden])')];
    const live = cards.filter(c => c.dataset.tier === 'live');
    return live.length >= 1 && !cards.some(c => c.querySelector('.body')?.textContent === 'Loading figure…') &&
      document.querySelectorAll('.js-plotly-plot').length === Math.min(max, live.length);
  }, MAX_LIVE, { timeout: 20000 });
  await frames(page);
}
async function grid(page, columns, width = 380, height = 300) {
  await page.evaluate(({ columns, width, height }) => window.__nexo.store.set(doc => ({ ...doc,
    nodes: doc.nodes.map((n, i) => ({ ...n, x: 20 + (i % columns) * (width + 20), y: 20 + Math.floor(i / columns) * (height + 20), width, height })) })),
  { columns, width, height });
}
async function addCards(page, render, count) {
  // Team's module refuses to draw these without configuration (validate()): the editable vector views, and the
  // BQC deviation plot until 2 BQC samples are chosen (its placeholder, honest exports). They never draw live here.
  const sources = catalog.filter(e => e.render === render && !/VectorPlot$|bqcDeviationPlot$/.test(e.id)).map(e => e.id);
  let added = 0;
  for (let i = 0; added < count && i < count * 4; i++) {
    const ok = await page.evaluate(source => window.__nexo.handle.addCard(source).then(() => true, () => false), sources[i % sources.length]);
    if (ok) added++;
  }
  assert.equal(added, count, `could only add ${added} ${render} cards`);
}
async function clearSelection(page) {
  await page.locator('#viewport').focus();
  for (let i = 0; i < 3 && (await page.evaluate(() => window.__nexo.handle.selection().length)); i++) await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__nexo.handle.selection().length), 0);
}

async function browserTests(pw, name, base) {
  const measure = name === 'chromium';
  const browser = await pw[name].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    await context.addInitScript(countWebgl);
    const errors = [];
    context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    context.on('weberror', e => errors.push(e.error().message));
    const page = await context.newPage();
    await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}`);
    await page.waitForSelector('.card');

    // Twelve fresh image cards: render the first screen, then warm the rest without a pan.
    await page.evaluate(() => { localStorage.setItem('nexo.prefetch','off'); window.__nexo.handle.removeAll(); window.__nexoPrefetchMock.requests.length=0; });
    await addCards(page, 'png', 12);
    await grid(page, 12, 390, 310);
    await page.evaluate(() => window.__nexo.handle.focusNode(window.__nexo.store.get().nodes[0].id));
    await page.waitForTimeout(1000);
    // Cards already drawn at the grid size (on screen while the grid was laid out) need no prefetch.
    const drawnAtGrid = () => window.__nexo.store.get().nodes.filter(n => window.__nexoPrefetchMock.requests.some(r => r.instance === (n.instance.instanceId ?? n.instance.id) && r.width === 390 && r.height === 310)).length;
    const beforePrefetch = await page.evaluate(d => ({renders:window.__nexoMock.renders, drawn:eval(d)()}), `(${drawnAtGrid})`);
    assert(beforePrefetch.drawn < 12, 'some cards must still be undrawn before prefetch');
    await page.evaluate(() => {
      window.__nexoPrefetchMock.delayMs=100;
      localStorage.removeItem('nexo.prefetch');
      window.__nexo.handle.zoomTo(1);
    });
    await page.waitForTimeout(5000);
    const warm=await page.evaluate(()=>window.__nexoMock.renders);
    assert(warm>beforePrefetch.renders, 'render count must grow beyond the first visible cards without panning');
    const drawnAfter = await page.evaluate(d => eval(d)(), `(${drawnAtGrid})`);
    assert.equal(drawnAfter, 12, `every off-screen card must be prefetched at its size (${beforePrefetch.drawn} drawn before, ${drawnAfter} after)`);
    assert(warm-beforePrefetch.renders>=12-beforePrefetch.drawn, 'one render per undrawn card');
    await page.evaluate(()=>window.__nexo.handle.fit());
    await page.waitForTimeout(1000);
    const fitRequests=await page.evaluate(()=>window.__nexoMock.renders);
    assert(fitRequests-warm<=2, `most fitted cards should draw from cache; ${fitRequests-warm} extra requests`);
    assert(await page.locator('.card .body img').count()>=10,'most fitted cards must actually draw');
    // Repeat with fresh sizes to hold a LOW in flight and test promotion independently.
    await page.evaluate(()=>{
      localStorage.setItem('nexo.prefetch','off');
      window.__nexo.handle.zoomTo(1);
      window.__nexo.handle.focusNode(window.__nexo.store.get().nodes[0].id);
      window.__nexo.store.set(doc=>({...doc,nodes:doc.nodes.map(n=>({...n,width:n.width+16,height:n.height+16}))}));
    });
    await page.waitForTimeout(1000);
    await page.evaluate(()=>{
      window.__nexoPrefetchMock.requests.length=0;
      localStorage.removeItem('nexo.prefetch');
      window.__nexo.handle.zoomTo(1);
    });
    await page.waitForFunction(() => window.__nexoPrefetchMock.requests.some(r=>r.priority==='LOW'));
    // Make the farthest queued card visible while a LOW render is in flight.
    const promoted = await page.evaluate(() => {
      const node=window.__nexo.store.get().nodes.at(-1);
      const offset=window.__nexoPrefetchMock.requests.length;
      window.__nexo.handle.focusNode(node.id);
      return {instance:node.instance.instanceId??node.instance.id,offset};
    });
    await page.waitForFunction(({instance,offset})=>window.__nexoPrefetchMock.requests.slice(offset).some(r=>r.instance===instance),promoted);
    const dispatch = await page.evaluate(({offset})=>window.__nexoPrefetchMock.requests.slice(offset),promoted);
    const promotedIndex=dispatch.findIndex(r=>r.instance===promoted.instance);
    assert(promotedIndex>=0 && dispatch.slice(0,promotedIndex).every(r=>r.priority==='HIGH'), 'visible render must precede all queued LOW renders');
    await page.waitForTimeout(2000);
    await page.evaluate(()=>{window.__nexoPrefetchMock.delayMs=0;});
    console.log(`PASS H7b ${name} prefetch warm ${warm-beforePrefetch.renders}, fit misses ${fitRequests-warm}, visible priority`);

    // Cold open: Plotly cards in view but frozen by the live cap draw off screen one at a time. Their figure requests
    // must all be queued at once (HIGH): fetching each only after the previous snapshot left gaps in the queue that
    // off-screen prefetch (LOW) filled, so one slow hidden card delayed what the user sees (real checkpoint: 29 s → 51 s).
    await page.evaluate(() => { localStorage.setItem('nexo.prefetch','off'); window.__nexo.handle.removeAll(); });
    await addCards(page, 'plotly', 16);
    await page.evaluate(() => window.__nexo.store.set(doc => ({ ...doc, nodes: doc.nodes.map((n, i) => ({ ...n, width: 380, height: 300,
      x: 20 + (i % 5) * 400, y: i < 10 ? 20 + Math.floor(i / 5) * 320 : 4000 + Math.floor((i - 10) / 5) * 320 })) })));
    await clearSelection(page);
    await page.evaluate(() => { window.__nexoPrefetchMock.requests.length = 0; window.__nexoPrefetchMock.asked.length = 0; window.__nexoPrefetchMock.delayMs = 800;
      localStorage.removeItem('nexo.prefetch'); window.__nexo.handle.zoomTo(0.55); window.__nexo.handle.focusNode(window.__nexo.store.get().nodes[2].id); });
    const shown = await page.evaluate(() => { const ids = new Map(window.__nexo.store.get().nodes.map(n => [n.id, n.instance.instanceId ?? n.instance.id]));
      return [...document.querySelectorAll('.card')].filter(c => c.dataset.tier && c.dataset.tier !== 'culled').map(c => ids.get(c.dataset.id)).filter(Boolean); });
    assert(shown.length > MAX_LIVE, `only ${shown.length} Plotly cards in view; none would be frozen by the cap`);
    // At 800 ms a request, ten served one by one take 8 s; 1.5 s in, every card in view must already be queued.
    await page.waitForTimeout(1500);
    const asked = await page.evaluate(ids => ids.filter(id => window.__nexoPrefetchMock.asked.includes(id)).length, shown);
    assert.equal(asked, shown.length, `only ${asked} of ${shown.length} cards in view had asked for their figure after 1.5 s`);
    await page.waitForFunction(ids => ids.every(id => window.__nexoPrefetchMock.requests.some(r => r.instance === id)), shown, { timeout: 60000 });
    await page.evaluate(() => { window.__nexoPrefetchMock.delayMs = 0; });
    console.log(`PASS H7b ${name} cold open: all ${shown.length} Plotly cards in view queued their figure at once`);

    // 20 Plotly cards in a 5-column grid at 100 %: more than four are in view, so the live set is full.
    await page.evaluate(() => window.__nexo.handle.removeAll());
    await addCards(page, 'plotly', 20);
    await grid(page, 5);
    await clearSelection(page);
    // Each addition now brings its card into view (H8 add feedback): look at the grid again before zooming.
    await page.evaluate(() => { window.__nexo.handle.fit(); window.__nexo.handle.zoomTo(1); });
    await settled(page);
    const inView = await page.$$eval('.card', els => els.filter(e => e.dataset.tier !== 'culled').length);
    assert(inView > MAX_LIVE, `only ${inView} cards in view; the live set would not be full`);
    assert.equal(await assertCap(page, 'grid at 100 %'), MAX_LIVE);
    assert.equal(await page.$$eval('.card[data-tier="live"]', els => els.length), MAX_LIVE);
    console.log(`PASS H7b ${name} live-cap ${inView} in view → ${MAX_LIVE} live`);

    // Ten Ctrl+wheel zoom steps around 100 %, each from a full live set.
    // Method (Chromium): the wheel is sent through the DevTools Protocol (Input.dispatchMouseEvent,
    // which resolves once the renderer has handled it). In the page, a capture listener on window marks
    // t0 when the wheel starts and a bubble listener marks t1 after the app's handler; a rAF registered
    // first in the next frame marks t2, and a MessageChannel message posted from it runs right after that
    // frame's rAF callbacks, style, layout and paint (t3). Step cost = (t1 − t0) + (t3 − t2): main-thread
    // time for the input and for the frame that shows it, without the idle wait for vsync.
    // Performance.getMetrics deltas (script, style, layout) over the ten steps are printed alongside.
    await page.evaluate(() => {
      const steps = window.__perfSteps = [];
      let t0 = 0, t1 = 0;
      window.addEventListener('wheel', () => { t0 = performance.now(); }, { capture: true, passive: true });
      window.addEventListener('wheel', () => {
        t1 = performance.now(); const input = t1 - t0;
        requestAnimationFrame(() => {
          const t2 = performance.now(), channel = new MessageChannel();
          channel.port1.onmessage = () => steps.push(input + performance.now() - t2);
          channel.port2.postMessage(0);
        });
      }, { passive: true });
    });
    const box = await page.locator('#viewport').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const cdp = measure ? await context.newCDPSession(page) : null;
    if (cdp) await cdp.send('Performance.enable');
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const before = cdp ? await metrics() : null;
    for (let i = 0; i < 10; i++) {
      const deltaY = i % 2 ? 30 : -30, scale = await page.evaluate(() => document.querySelector('#hud').textContent.split('|')[1].trim());
      if (cdp) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY, modifiers: 2 });
      else { await page.mouse.move(cx, cy); await page.keyboard.down('Control'); await page.mouse.wheel(0, deltaY); await page.keyboard.up('Control'); }
      await page.waitForFunction(s => document.querySelector('#hud').textContent.split('|')[1].trim() !== s, scale);
      await assertCap(page, `zoom step ${i + 1} (gesture)`, false);
      await settled(page);
      await assertCap(page, `zoom step ${i + 1}`);
    }
    if (measure) {
      const after = await metrics();
      const steps = await page.evaluate(() => window.__perfSteps);
      assert.equal(steps.length, 10, `expected 10 measured zoom steps, got ${steps.length}`);
      const s = stats(steps);
      const d = k => ((after[k] - before[k]) * 1000).toFixed(1);
      console.log(`INFO H7b ${name} zoom step ${fmt(s)} (whole run incl. live redraws: script ${d('ScriptDuration')} ms, style ${d('RecalcStyleDuration')} ms, layout ${d('LayoutDuration')} ms)`);
      assert(s.median < 16, `zoom step median ${s.median.toFixed(2)} ms ≥ 16 ms`);
    }
    console.log(`PASS H7b ${name} 10-zoom-steps cap-held${measure ? ' median<16ms' : ''}`);

    // 40 cards: time one full draw() (window.__nexo.perf.lastDrawMs, mock build only).
    await page.evaluate(() => localStorage.setItem('nexo.prefetch','off'));
    await addCards(page, 'png', 20);
    await grid(page, 8, 300, 240);
    await clearSelection(page);
    await page.evaluate(() => window.__nexo.handle.fit()); // additions brought each card into view; look at the grid
    assert.equal(await page.locator('.card').count(), 40);
    const draws = [];
    for (const z of [1, .9, 1, .9, 1]) {
      await page.evaluate(z => window.__nexo.handle.zoomTo(z), z);
      await frames(page);
      draws.push(await page.evaluate(() => window.__nexo.perf.lastDrawMs));
      await assertCap(page, `40 cards at ${z * 100} %`, false);
      await settled(page); await assertCap(page, `40 cards at ${z * 100} % settled`);
    }
    assert(draws.every(Number.isFinite), `lastDrawMs not exposed: ${draws}`);
    const ds = stats(draws);
    console.log(`INFO H7b ${name} draw() of 40 cards ${fmt(ds)}`);
    if (measure) assert(ds.median < 8, `draw() median ${ds.median.toFixed(2)} ms ≥ 8 ms`);
    console.log(`PASS H7b ${name} draw-40${measure ? ' median<8ms' : ''}`);

    // Pan across and back twice: the second pass fetches no new image renders. Prefetch is off since the
    // 40-card section so the first pass has something to fetch (with prefetch on, both passes fetch nothing).
    await page.evaluate(() => window.__nexo.handle.zoomTo(1));
    // Every card already drew at the overview; resize them here so cards out of view hold no current render
    // and the first pass has something to fetch (the floating library leaves a wider canvas, wave 1).
    await grid(page, 8, 310, 250);
    await settled(page);
    const pan = async () => {
      for (const dx of [500, 500, 500, -500, -500, -500]) {
        await page.mouse.move(cx, cy); await page.mouse.wheel(dx, 0);
        await page.waitForTimeout(250); await settled(page);
        await page.waitForFunction(() => [...document.querySelectorAll('.card[data-tier="live"] .body')].every(b => b.querySelector('img,.js-plotly-plot')), null, { timeout: 20000 });
        await assertCap(page, `pan ${dx}`); await assertWebgl(page, `pan ${dx}`);
      }
    };
    const first = await page.evaluate(() => window.__nexoMock.renders);
    await pan();
    const renders = await page.evaluate(() => window.__nexoMock.renders);
    assert(renders > first, 'the first pan pass fetched no image renders; nothing to cache');
    await pan();
    const extra = await page.evaluate(n => window.__nexoMock.renders - n, renders);
    assert.equal(extra, 0, `second pan pass fetched ${extra} new renders`);
    const gl = await page.evaluate(() => window.__nexoWebgl);
    console.log(`PASS H7b ${name} pan-back image-cache first pass ${renders - first} renders, second pass 0; WebGL contexts ${gl.created} created, ${gl.created - gl.lost} active`);
    console.log(`INFO H7b ${name} WebGL creators:\n${glCreators(gl)}`);
    await page.evaluate(() => localStorage.removeItem('nexo.prefetch'));

    // H8 live stress: a Plotly card the module refuses (Team's validate() message, 422), added while the
    // canvas is below 50 % (frozen, off-screen snapshot), shows the message instead of staying "Updating…".
    await page.evaluate(() => window.__nexo.handle.zoomTo(0.3));
    const refused = await page.evaluate(() => window.__nexo.handle.addCard('qc_pca_tab-pca2dVectorPlot').then(() => true, () => false));
    assert(refused, 'adding the vector PCA card failed');
    await page.evaluate(() => window.__nexo.handle.fit());
    await page.waitForFunction(() => { const c = [...document.querySelectorAll('.card')].find(c => /pca2dVectorPlot$/.test(c.dataset.id ?? ''));
      return c && c.dataset.tier === 'frozen' && c.querySelector('.card-status')?.dataset.state === 'error' && /Editable vector view unavailable/.test(c.querySelector('.body')?.textContent ?? ''); }, null, { timeout: 20000 })
      .catch(async e => { console.log('STATE', await page.evaluate(() => [...document.querySelectorAll('.card')].filter(c => /VectorPlot$/.test(c.dataset.id ?? '')).map(c => `${c.dataset.id} tier=${c.dataset.tier} hidden=${c.hidden} state=${c.querySelector('.card-status')?.dataset.state} body=${(c.querySelector('.body')?.textContent ?? '').slice(0, 90)}`))); throw e; });
    console.log(`PASS H8 ${name} refused-frozen-card-shows-module-message`);
    errors.splice(0, errors.length, ...errors.filter(e => !/Editable vector view unavailable/.test(e)));

    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: path.join(out, `${name}-1440.png`) });
    assert.deepEqual(errors, []);
    console.log(`PASS H7b ${name} screenshot-1440 no-console-errors`);
    await context.close();
  } finally { await browser.close(); }
}

(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP H7b Playwright: ${e.message}`); return; } throw e; }
  run('sh', ['scripts/vendor-plotly.sh']);
  run('npm', ['run', 'build'], { VITE_API_MOCK: '1' });
  const pw = require(require.resolve('@playwright/test', { paths: [ci] }));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(p), '--strictPort'], { cwd: nexo, stdio: 'ignore' });
  const base = `http://127.0.0.1:${p}`;
  const deadline = Date.now() + 30000;
  while (true) {
    try { const r = await fetch(`${base}/nexo/`); if (r.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('preview server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
  for (const name of ['chromium', 'webkit']) await browserTests(pw, name, base);
  // Plotly must not block first paint: no parser-blocking <script> for it in index.html.
  const html = fs.readFileSync(path.join(nexo, 'dist/index.html'), 'utf8');
  for (const tag of html.match(/<script\b[^>]*>/g) ?? []) assert(!/plotly/i.test(tag) || /\b(defer|async)\b/.test(tag), `blocking Plotly script: ${tag}`);
  console.log('PASS H7b index.html does not block on Plotly');
  console.log('H7b OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
