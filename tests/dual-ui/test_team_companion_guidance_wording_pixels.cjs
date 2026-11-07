// Run with: node tests/dual-ui/test_team_companion_guidance_wording_pixels.cjs
// Item 11 (2026-11-04): the frozen companion_assistant.js may take its header label and welcome/disclosure text from two
// getters so grounded knowledge-base mode can say nothing leaves the server. The look may not change. At 1440 px this
// renders the closed mascot and the opened chat with the current file and with the eed4451 file, in both server states:
//  (a) grounded (ai_enabled + kb_grounded): only the header label and the welcome text pixels may differ, and every box
//      (launcher, mascot, panel, header, welcome bubble) must be identical;
//  (b) an outside AI configured (ai_enabled only): every pixel identical to eed4451.
// The closed mascot must be pixel-identical in both states.
const { chromium } = require('../browser/ci/node_modules/playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const FILE = 'www/team/js/companion_assistant.js', BASE = 'eed4451';
const current = fs.readFileSync(path.resolve(FILE), 'utf8');
const baseline = execFileSync('git', ['show', `${BASE}:${FILE}`], { encoding: 'utf8' });
const css = ['context_help.css', 'companion_guidance.css', 'companion_assistant.css', 'mascot_refine.css'].map(f => path.resolve('www/team/css', f));
const art = fs.readFileSync(path.resolve('www/team/js/companion_art.js'), 'utf8');
const VIEW = { width: 1440, height: 900 };
const BOXES = ['.assistant-launcher', '.assistant-character', '.assistant-panel', '.assistant-panel-head', '.assistant-eyebrow', '.assistant-message', '.assistant-chat-input', '.assistant-send'];

async function render(browser, script, state, extra = {}) {
  const p = await browser.newPage({ viewport: VIEW });
  await p.setContent(`<body class="team-workspace-app"><div id="lipidomic-help-bar"></div><div id="lipidomic-companion"><span class="help-companion" data-kind="neutrophil"></span><div class="companion-actions"></div></div></body>`);
  for (const f of css) await p.addStyleTag({ path: f });
  await p.addStyleTag({ content: '*{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  await p.evaluate(() => { window.LIPIDOMIC_TEAM_WORKSPACE = true; window.$ = () => ({ on: () => {} }); window.__handlers = {};
    window.Shiny = { addCustomMessageHandler: (n, f) => { window.__handlers[n] = f; }, setInputValue: () => {} }; });
  await p.addScriptTag({ content: art });
  for (const g of extra.guidance || []) await p.addScriptTag({ content: g });
  await p.addScriptTag({ content: script });
  await p.evaluate(s => window.__handlers.assistant_state(s), state);
  await p.waitForTimeout(100);
  const closed = await p.screenshot();
  await p.evaluate(() => LipidomicAssistant.open(document.querySelector('.assistant-launcher')));
  await p.waitForTimeout(150);
  if (extra.ask) { await p.fill('.assistant-chat-input', extra.ask); await p.click('.assistant-send'); await p.waitForSelector('.cg-answer'); await p.waitForTimeout(150); }
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  const opened = await p.screenshot();
  const info = await p.evaluate(sel => {
    const r = e => e ? e.getBoundingClientRect().toJSON() : null;
    const t = document.querySelector('.assistant-message-text'), range = document.createRange(); range.selectNodeContents(t);
    return { boxes: Object.fromEntries(sel.map(s => [s, r(document.querySelector(s))])), welcomeText: r(t), welcomeLines: range.getClientRects().length,
      header: document.querySelector('.assistant-eyebrow').textContent, welcome: t.textContent };
  }, BOXES);
  await p.close();
  return { closed, opened, info };
}

// Pixel diff in a page canvas; returns the bounding box of differing pixels outside the masks, and the count.
async function diff(browser, a, b, masks) {
  const p = await browser.newPage();
  const res = await p.evaluate(async ([a, b, masks]) => {
    const load = async s => { const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob()); const c = new OffscreenCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height); };
    const A = await load(a), B = await load(b); if (A.width !== B.width || A.height !== B.height) return { size: true };
    let outside = 0, inside = 0; const inMask = (x, y) => masks.some(m => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height);
    for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) { const i = (y * A.width + x) * 4;
      if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2] || A.data[i + 3] !== B.data[i + 3]) { if (inMask(x, y)) inside++; else outside++; } }
    return { outside, inside };
  }, [a.toString('base64'), b.toString('base64'), masks]);
  await p.close();
  return res;
}
const pad = r => ({ x: Math.floor(r.x) - 1, y: Math.floor(r.y) - 1, width: Math.ceil(r.width) + 3, height: Math.ceil(r.height) + 3 });

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, state, grounded] of [['(a) grounded', { ai_enabled: true, kb_grounded: true, kb_terms: ['cardiolipin', 'pc'] }, true], ['(b) outside AI', { ai_enabled: true }, false]]) {
      const now = await render(browser, current, state), then = await render(browser, baseline, state);
      const closed = await diff(browser, now.closed, then.closed, []);
      assert.deepEqual(closed, { outside: 0, inside: 0 }, `${name}: closed mascot pixel-identical to ${BASE}`);
      assert.deepEqual(now.info.boxes, then.info.boxes, `${name}: launcher, mascot, panel, header, welcome bubble and input boxes identical to ${BASE}`);
      if (grounded) {
        assert.match(now.info.header, /^NEUTROPHIL · KNOWLEDGE BASE$/); assert.match(now.info.welcome, /not sent to any outside AI service/);
        assert.equal(now.info.welcomeLines, then.info.welcomeLines, `${name}: the welcome wraps to the same number of lines`);
        const masks = [now.info.boxes['.assistant-eyebrow'], then.info.boxes['.assistant-eyebrow'], now.info.welcomeText, then.info.welcomeText].map(pad);
        const opened = await diff(browser, now.opened, then.opened, masks);
        assert.equal(opened.outside, 0, `${name}: opened chat differs from ${BASE} only inside the header label and welcome text regions`);
        assert.ok(opened.inside > 0, `${name}: the wording did change`);
        console.log(`${name}: closed 0 px differ; opened ${opened.inside} px differ, all inside the text regions; header ${JSON.stringify(now.info.header)}; welcome ${now.info.welcomeLines} lines`);
      } else {
        assert.equal(now.info.header, then.info.header); assert.equal(now.info.welcome, then.info.welcome);
        const opened = await diff(browser, now.opened, then.opened, []);
        assert.deepEqual(opened, { outside: 0, inside: 0 }, `${name}: opened chat pixel-identical to ${BASE}`);
        console.log(`${name}: closed and opened chat 0 px differ; header ${JSON.stringify(now.info.header)}`);
      }
    }
    // Item 18: with the real local guide loaded (current vs eed4451 companion_guidance.js and data), an app-help
    // question in grounded mode is still answered locally, and the opened chat with that answer looks the same.
    const guide = rev => ['www/team/js/companion_guidance_data.js', 'www/team/js/companion_guidance.js'].map(f => rev ? execFileSync('git', ['show', `${rev}:${f}`], { encoding: 'utf8' }) : fs.readFileSync(path.resolve(f), 'utf8'));
    for (const [name, state, grounded] of [['(a) grounded + local answer', { ai_enabled: true, kb_grounded: true, kb_terms: ['cardiolipin', 'pc'] }, true], ['(b) outside AI + local answer', { ai_enabled: true }, false]]) {
      const ask = 'how do I add a figure to the canvas';
      const now = await render(browser, current, state, { guidance: guide(null), ask }), then = await render(browser, baseline, state, { guidance: guide(BASE), ask });
      assert.deepEqual(await diff(browser, now.closed, then.closed, []), { outside: 0, inside: 0 }, `${name}: closed mascot pixel-identical`);
      assert.deepEqual(now.info.boxes, then.info.boxes, `${name}: boxes identical`);
      const masks = grounded ? [now.info.boxes['.assistant-eyebrow'], then.info.boxes['.assistant-eyebrow'], now.info.welcomeText, then.info.welcomeText].map(pad) : [];
      const opened = await diff(browser, now.opened, then.opened, masks);
      assert.equal(opened.outside, 0, `${name}: opened chat with the local answer differs from ${BASE} only inside the text regions`);
      console.log(`${name}: closed 0 px; opened ${opened.inside} px differ inside the text regions, 0 outside`);
    }
    console.log(`PASS: at 1440 px the mascot and chat look identical to ${BASE}; in grounded mode only the header label and welcome text pixels differ`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
