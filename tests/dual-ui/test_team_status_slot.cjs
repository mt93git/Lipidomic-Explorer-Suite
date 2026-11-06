// Run with: node tests/dual-ui/test_team_status_slot.cjs
// The workspace status line (#tw-next) under "Choose how to begin" keeps a
// fixed slot: its height and the content below it never move while the text
// changes, appears or disappears, and the text never changes faster than ~1 s.
// Review (review-single) keeps production's behaviour on purpose: the empty line
// is removed (display:none) because the frozen mascot is placed from
// .ts-review-home, so the slot rule must not apply there.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');
const optional = file => fs.existsSync(path.resolve(file)) ? [file] : [];
const CSS = ['www/team/css/workspace.css', 'www/team/css/workspace_minimal.css', 'www/team/css/shell.css', ...optional('www/team/css/status_slot.css')];
const JS = [...optional('www/team/js/status_hold.js'), 'www/team/js/workspace.js'];
const HTML = `<!doctype html><body class="team-workspace-app" data-guide-step="1" data-guide-analysis="false">
  <section id="team-workspace">
    <div class="tw-top"><div><span class="tw-eyebrow">YOUR ANALYSIS WORKSPACE</span><h1>From samples to insight</h1></div><div class="tw-account-actions"><span id="team-autosave-status" role="status" aria-live="polite"></span><button type="button" class="tw-signout" data-tw-logout="true">Sign out</button></div></div>
    <nav class="tw-steps" aria-label="Analysis steps"><button type="button" data-tw-stage="data"><span>01</span><strong>Data</strong><small>Upload or resume</small></button><button type="button" data-tw-stage="review"><span>02</span><strong>Review</strong><small>Filter and inspect</small></button><button type="button" data-tw-stage="canvas"><span>03</span><strong>Canvas</strong><small>Explore and build figures</small></button></nav>
    <div class="tw-journey"><div class="tw-journey-copy"><span class="tw-progress" id="tw-progress"></span><h2 id="tw-screen-title" tabindex="-1">Choose how to begin</h2><p id="tw-screen-help">Select a saved analysis or start with a new matrix.</p></div>
      <div class="tw-journey-actions"><button type="button" class="tw-back" data-tw-back="true">← Back</button><button type="button" class="tw-next" data-tw-next="true">Next →</button></div></div>
    <div class="tw-choice-card"><button type="button" data-tw-choice="matrix">Upload a new matrix</button><p>Or choose a private saved checkpoint in the library below.</p></div>
    <p id="tw-next" role="status" aria-live="polite">Sign in to start an analysis.</p>
  </section>
  <div id="below" style="height:200px;background:#eef">Library and data panels</div>
  <script>window.sent=[];window.handlers={};window.jqueryEvents={};window.jQuery=function(){return {on:function(names,fn){names.split(' ').forEach(name=>jqueryEvents[name]=fn);return this;},trigger:function(){return this;}}};window.fire=name=>jqueryEvents[name]&&jqueryEvents[name]();window.Shiny={setInputValue:(id,value)=>sent.push([id,value]),addCustomMessageHandler:(name,fn)=>handlers[name]=fn,shinyapp:{isConnected:()=>true}};</script>
</body>`;

async function run(browser, width) {
  const page = await browser.newPage({viewport: {width, height: 900}});
  await page.setContent(HTML);
  for (const file of CSS) await page.addStyleTag({path: path.resolve(file)});
  for (const file of JS) await page.addScriptTag({path: path.resolve(file)});
  await page.evaluate(() => {
    window.samples = []; window.changes = [];
    const status = document.getElementById('tw-next'), below = document.getElementById('below');
    // The heading and help text differ per screen, so geometry is compared within one screen.
    // Rules from status_slot.css that target #tw-next: whether any of them matches right now.
    const slotRules = [];
    for (const sheet of document.styleSheets) { let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      const walk = list => { for (const r of list) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText && r.selectorText.includes('#tw-next') && /\bheight\s*:\s*(20|40)px/.test(r.cssText) && /data-tw-screen/.test(r.selectorText)) slotRules.push(r.selectorText); } };
      walk(rules); }
    window.slotRuleCount = slotRules.length;
    const slotApplies = () => slotRules.some(sel => status.matches(sel));
    const sample = label => { const r = status.getBoundingClientRect(); window.samples.push({label, screen: document.body.dataset.twScreen || '', height: r.height, display: getComputedStyle(status).display, statusTop: r.top, belowTop: below.getBoundingClientRect().top, text: status.textContent, slot: slotApplies()}); };
    window.sample = sample;
    new MutationObserver(() => { window.changes.push({t: performance.now(), text: status.textContent}); sample('mutation'); }).observe(status, {childList: true, characterData: true, subtree: true});
    // Layout shifts are summed only while busy/idle cycles run (not on screen changes).
    window.cls = 0; window.measuring = false; new PerformanceObserver(list => { for (const e of list.getEntries()) if (window.measuring && !e.hadRecentInput) window.cls += e.value; }).observe({type: 'layout-shift'});
    sample('signed-out');
  });
  const wait = ms => page.waitForTimeout(ms);
  // Each phase: settle, start measuring, run rapid busy/idle cycles, sample, settle again
  // (the held text lands up to 1 s later and must not move anything either).
  // measureCls=false on Review, where production's line (and thus the layout) may move by design.
  const cycle = async (label, n, gap, measureCls = true) => {
    await wait(250); await page.evaluate(([l, m]) => { sample(l + ':start'); window.measuring = m; }, [label, measureCls]);
    for (let i = 0; i < n; i++) { await page.evaluate(() => fire('shiny:busy')); await wait(gap); await page.evaluate(() => fire('shiny:idle')); await wait(gap); }
    await page.evaluate(l => sample(l), label); await wait(1100); await page.evaluate(l => { sample(l + ':held'); window.measuring = false; }, label);
  };

  await page.evaluate(() => handlers['team-auth-state']({authenticated: true}));
  await wait(1100); await page.evaluate(() => sample('choice-signed-in'));
  await cycle('choice-busy-cycles', 8, 60);                 // text changes
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state', {detail: {ready: true}})));
  await wait(1100); await page.evaluate(() => sample('choice-ready-empty'));
  await cycle('choice-ready-cycles', 8, 60);                // appears / disappears
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state', {detail: {ready: false, running: true}})));
  await page.evaluate(() => document.querySelector('[data-tw-choice="matrix"]').click());
  await cycle('matrix-cycles', 6, 60);                      // data step
  await page.evaluate(() => { document.body.dataset.guideStep = '3'; });
  await cycle('review-cycles', 6, 60, false);               // review step (production line)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('team-preparation-state', {detail: {ready: true}})));
  await cycle('review-ready-cycles', 6, 60, false);
  await wait(1200); await page.evaluate(() => sample('settled'));

  const {samples, changes, cls, live, settled, slotRuleCount} = await page.evaluate(() => ({samples: window.samples, changes: window.changes, cls: window.cls, slotRuleCount: window.slotRuleCount,
    live: [document.getElementById('tw-next').getAttribute('role'), document.getElementById('tw-next').getAttribute('aria-live')],
    settled: document.getElementById('tw-next').textContent}));
  await page.close();
  const signedIn = samples.filter(s => s.label !== 'signed-out');
  const uniq = xs => [...new Set(xs)];
  const byScreen = {};
  for (const s of signedIn) (byScreen[s.screen] = byScreen[s.screen] || []).push(s);
  const perScreen = Object.fromEntries(Object.entries(byScreen).map(([k, xs]) => [k, {heights: uniq(xs.map(s => s.height)), statusTops: uniq(xs.map(s => s.statusTop)), belowTops: uniq(xs.map(s => s.belowTop)), belowRange: Math.max(...xs.map(s => s.belowTop)) - Math.min(...xs.map(s => s.belowTop)), texts: uniq(xs.map(s => s.text)).length}]));
  const DATA = ['data-choice', 'data-matrix'];
  const dataSamples = signedIn.filter(s => DATA.includes(s.screen)), reviewSamples = signedIn.filter(s => s.screen === 'review-single');
  const heights = uniq(dataSamples.map(s => s.height));
  const reviewEmpty = reviewSamples.filter(s => s.text === ''), reviewText = reviewSamples.filter(s => s.text !== '');
  const gaps = changes.slice(1).map((c, i) => c.t - changes[i].t), minGap = gaps.length ? Math.min(...gaps) : Infinity;
  const texts = new Set(signedIn.map(s => s.text));
  console.log(JSON.stringify({width, dataStatusHeights: heights, slotRuleCount, reviewEmpty: reviewEmpty.length, reviewWithText: reviewText.length, perScreen, displays: uniq(signedIn.map(s => s.display)), textChanges: changes.length, minChangeGapMs: Math.round(minGap), cls: Number(cls.toFixed(4)), emptySeen: texts.has(''), settled}));
  assert.deepEqual(live, ['status', 'polite'], 'the status line stays a polite live region');
  assert.ok(texts.has('') && texts.size > 2, 'the fixture really makes the text change, appear and disappear');
  assert.deepEqual(Object.keys(perScreen).sort(), ['data-choice', 'data-matrix', 'review-single'], 'all three early screens were exercised');
  assert.ok(slotRuleCount >= 2, `status_slot.css slot rules were found (${slotRuleCount})`);
  // Data screens: fixed slot, empty or not.
  assert.equal(heights.length, 1, `status height stays constant on the data screens at ${width}px: ${heights}`);
  assert.equal(heights[0], width > 900 ? 20 : 40, 'the slot is reserved (20 px, 40 px ≤900) on the data screens');
  assert.ok(dataSamples.some(s => s.text === '') && dataSamples.some(s => s.text !== ''), 'data screens were seen both empty and with text');
  assert.ok(dataSamples.every(s => s.slot && s.display !== 'none'), 'the slot rule applies on every data-screen sample and the line is never removed');
  // Review: production behaviour, no reserved row.
  assert.ok(reviewEmpty.length > 0 && reviewText.length > 0, 'Review was seen both empty and with text');
  assert.ok(reviewSamples.every(s => !s.slot), 'the slot rule never applies on review-single');
  for (const s of reviewEmpty) { assert.equal(s.display, 'none', `empty #tw-next is removed on Review (${s.label})`); assert.equal(s.height, 0, 'no reserved row on Review'); }
  for (const s of reviewText) assert.notEqual(s.display, 'none', 'Review shows the line when it has text');
  for (const [screen, m] of Object.entries(perScreen).filter(([k]) => DATA.includes(k))) {
    assert.equal(m.statusTops.length, 1, `status line never moves on ${screen} at ${width}px: ${m.statusTops}`);
    assert.equal(m.belowTops.length, 1, `content below never moves on ${screen} at ${width}px: ${m.belowTops}`);
  }
  assert.ok(minGap >= 950, `status text never changes faster than ~1 s at ${width}px (min ${Math.round(minGap)} ms)`);
  assert.ok(cls < 0.001, `CLS ≈ 0 during data-screen cycles at ${width}px (${cls})`);
  assert.equal(settled, '', 'the latest status (empty when ready on Review) is applied after the hold');
}

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    for (const width of [1280, 390]) await run(browser, width);
    console.log('test_team_status_slot: ok');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exit(1); });
