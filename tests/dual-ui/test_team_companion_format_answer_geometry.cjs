// Run with: node tests/dual-ui/test_team_companion_format_answer_geometry.cjs
// The frozen companion_assistant.js may change only formatAnswer (message text formatting).
// A plain-text answer must leave the chat panel and the launcher exactly where the 71dc349 file put them,
// with the same message markup; a knowledge-base answer gets bold section titles and an italic Source line
// without moving the panel or the launcher either.
const { chromium } = require('../browser/ci/node_modules/playwright');
const assert = require('node:assert/strict'), path = require('node:path'), { execFileSync } = require('node:child_process');

const current = require('node:fs').readFileSync(path.resolve('www/team/js/companion_assistant.js'), 'utf8');
let baseline = null;
try { baseline = execFileSync('git', ['show', '71dc349:www/team/js/companion_assistant.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { baseline = null; }

const PLAIN = 'Median normalization uses the log scale; PQN uses the linear scale.\nChoose based on assay controls.';
const KB = 'Good one! Here is what I found:\n\nDefinition\nA line of a source.\n\nStructure\nAnother line.\n\nSource: notebook.md/Libreros_lab';
// Passage-style and "Explain this step" answers cite each passage with an em-dash line (kb_citation in R/frontends/team/companion_kb.R).
const PASSAGES = 'Happy to walk you through this step:\n\nIn Review, inspect detection.\n— Source: app_guidance_team.md\n\nA second passage.\n— Source: lab_steps.md · p. 2';

async function measure(browser, script, text, viewport) {
  const p = await browser.newPage({ viewport });
  await p.setContent(`<body class="team-workspace-app"><div id="lipidomic-help-bar"></div><div id="lipidomic-companion"><span class="help-companion" data-kind="neutrophil"></span><div class="companion-actions"></div></div></body>`);
  await p.addStyleTag({ path: path.resolve('www/team/css/companion_assistant.css') });
  await p.evaluate(() => {
    window.LIPIDOMIC_TEAM_WORKSPACE = true; window.$ = () => ({ on: () => {} }); window.LipidomicCompanionArt = () => '<svg></svg>';
    window.__handlers = {}; window.Shiny = { addCustomMessageHandler: (n, f) => { window.__handlers[n] = f; }, setInputValue: () => {} };
  });
  await p.addScriptTag({ content: script });
  await p.evaluate(() => LipidomicAssistant.open(document.querySelector('.assistant-launcher')));
  await p.waitForTimeout(50);
  const box = () => p.evaluate(() => {
    const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().toJSON() : null; };
    return { panel: r('.assistant-panel'), launcher: r('.assistant-launcher'), character: r('.assistant-character') };
  });
  const before = await box();
  await p.evaluate(t => window.__handlers.assistant_reply({ text: t, source: 'Local guide · reviewed application methods', revision: 1, actions: [] }), text);
  await p.waitForTimeout(50);
  const after = await box();
  const message = await p.evaluate(() => { const m = [...document.querySelectorAll('.assistant-message-assistant')].pop(); return { html: m.innerHTML, text: m.querySelector('.assistant-message-text').textContent, box: m.getBoundingClientRect().toJSON(),
    strong: [...m.querySelectorAll('strong')].map(e => e.textContent), em: [...m.querySelectorAll('em')].map(e => e.textContent) }; });
  await p.close();
  return { before, after, message };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1000, height: 700 }, { width: 390, height: 700 }]) {
      const now = await measure(browser, current, PLAIN, viewport);
      assert.deepEqual(now.after.launcher, now.before.launcher, 'plain answer: launcher box unchanged by the answer');
      assert.equal(now.message.text, PLAIN); assert.deepEqual(now.message.strong, []); assert.deepEqual(now.message.em, []);
      const kb = await measure(browser, current, KB, viewport);
      assert.deepEqual(kb.message.strong, ['Definition', 'Structure'], 'section titles in bold');
      assert.deepEqual(kb.message.em, ['Source: notebook.md/Libreros_lab'], 'source line in italics');
      assert.equal(kb.message.text, KB, 'formatting adds no text');
      const passages = await measure(browser, current, PASSAGES, viewport);
      assert.deepEqual(passages.message.em, ['— Source: app_guidance_team.md', '— Source: lab_steps.md · p. 2'], 'em-dash source lines in italics too');
      assert.deepEqual(passages.message.strong, []); assert.equal(passages.message.text, PASSAGES, 'formatting adds no text');
      assert.ok(!/<(?!\/?(em|span)\b)/.test(passages.message.html), 'only em and the existing spans are created');
      const hostileSource = await measure(browser, current, '— Source: <img src=x onerror="window.__pwned=1">', viewport);
      assert.deepEqual(hostileSource.message.em, ['— Source: <img src=x onerror="window.__pwned=1">'], 'a hostile source line stays text inside em');
      assert.ok(!/<img/.test(hostileSource.message.html.replace(/&lt;img/g, '')), 'source line text is never parsed as HTML');
      if (baseline) {
        const then = await measure(browser, baseline, PLAIN, viewport);
        assert.deepEqual(now.before, then.before, 'panel/launcher/mascot boxes equal to 71dc349 before the answer');
        assert.deepEqual(now.after, then.after, 'plain answer: panel/launcher/mascot boxes equal to 71dc349');
        assert.deepEqual(now.message.box, then.message.box, 'plain answer bubble box equal to 71dc349');
        assert.equal(now.message.html, then.message.html, 'plain answer markup equal to 71dc349');
        const kbThen = await measure(browser, baseline, KB, viewport);
        assert.deepEqual(kb.after, kbThen.after, 'knowledge-base answer: panel/launcher/mascot boxes equal to 71dc349');
      }
      const hostile = await measure(browser, current, 'Definition\n<img src=x onerror="window.__pwned=1">', viewport);
      assert.ok(!/<img/.test(hostile.message.html.replace(/&lt;img/g, '')), 'answer text is never parsed as HTML');
    }
    console.log(`PASS: formatAnswer keeps chat panel and launcher boxes${baseline ? ' (equal to 71dc349)' : ''}; bold titles, italic source, no HTML parsing`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
