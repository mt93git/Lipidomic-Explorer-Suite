// Run with: node tests/dual-ui/test_team_companion_kb_routing.cjs
// Round 5 (items 3 and 4): grounded-mode routing of the local guide (companion_guidance.js) with the committed library's
// full routing vocabulary (companion_kb_terms, no 400-term cap). A question naming a library term goes to the knowledge
// base before ANY local shortcut: the selected-card explain/suggest returns and the prefix-matching topic search
// ("what is cardiomyopathy" would match the "card" topic). App help stays local, including "how do I interpret this
// PCA" with a PCA card selected. Without grounded mode the guide behaves as production.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require('../browser/ci/node_modules/playwright');
const ROOT = path.resolve(__dirname, '../..');
const LIBS = "local({u<-file.path(Sys.getenv('HOME'),'Library','R',Sys.info()[['machine']],paste(R.version$major,sub('[.].*','',R.version$minor),sep='.'),'library');if(dir.exists(u)).libPaths(unique(c(.libPaths(),u)))});";
const terms = JSON.parse(execFileSync('Rscript', ['-e', LIBS + "Sys.setenv(LIPIDOMIC_TEAM_WORKSPACE='1');source('R/frontends/team/companion_kb.R');cat(jsonlite::toJSON(companion_kb_terms()))"],
  {cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore']}));
const payload = Buffer.byteLength(JSON.stringify(terms));
assert.ok(terms.length > 400 && payload < 400 * 1024, `routing vocabulary: ${terms.length} terms, ${payload} bytes (no 400 cap, under 400 KB)`);
const PCA = 'results_dashboard-plot_pca';
const KB = [['what is cardiomyopathy', null], ['what is cardiolipin', null], ['how do I interpret cardiolipin synthesis', PCA],
  ['what does high lipid mean', null], ['what is a lipid table', null], ['where is cardiolipin synthesized', null], ['can I study PC', null], ['how is PC synthesized', null]];
// Interface phrases whose words the books also use: grounded mode must not change the guide's decision for them.
const APP_PHRASES = ['how do I export the figure in high resolution', 'how do I download the table', 'how do I change the colour of the bars', 'how do I sign out',
  'how do I export in low resolution', 'how do I export a low resolution figure', 'how do I export the figure as an image', 'how do I change the colour of a bar'];
const LOCAL = [['how to change the palette', null], ['how to select a plot', null], ['what is the minimum detection slider', null],
  ['how do I add a figure to the canvas', null], ['how do I interpret this PCA', PCA]];

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body><div id="team-canvas-root"></div><div id="lipidomic-assistant-panel"><div class="assistant-messages"></div></div></body></html>');
    await page.evaluate(() => { window.LIPIDOMIC_TEAM_WORKSPACE = true; });
    for (const f of ['www/team/js/companion_guidance_data.js', 'www/team/js/companion_guidance.js']) await page.addScriptTag({content: fs.readFileSync(path.join(ROOT, f), 'utf8')});
    await page.waitForFunction(() => window.LipidomicCompanionLocal && typeof LipidomicCompanionLocal.answer === 'function');
    const ask = (q, sel, grounded) => page.evaluate(({q, sel, grounded, terms}) => {
      window.dispatchEvent(new CustomEvent('team-workspace-state', {detail: {stage: 'canvas'}}));
      window.dispatchEvent(new CustomEvent('team-canvas-selection', {detail: sel ? {id: sel, title: 'PCA'} : null}));
      const before = document.querySelectorAll('.cg-answer').length;
      const local = LipidomicCompanionLocal.answer(q, grounded ? {aiEnabled: true, kbGrounded: true, kbTerms: terms} : {aiEnabled: false});
      const last = Array.from(document.querySelectorAll('.cg-answer')).slice(before).pop();
      return {local, kind: last ? last.dataset.cgKind : null};
    }, {q, sel, grounded, terms});
    for (const [q, sel] of KB) {
      const r = await ask(q, sel, true);
      assert.equal(r.local, false, `grounded: "${q}"${sel ? ' (PCA selected)' : ''} goes to the knowledge base`);
      const off = await ask(q, sel, false);
      if (sel) assert.ok(off.local && off.kind === "explain", JSON.stringify(off) + " " + `not grounded: "${q}" with a PCA selected explains the card as production`);
    }
    for (const [q, sel] of LOCAL) {
      const r = await ask(q, sel, true);
      assert.ok(r.local, `grounded: "${q}"${sel ? ' (PCA selected)' : ''} stays local`);
      if (sel) assert.equal(r.kind, "explain", `grounded: "${q}" explains the selected PCA card`);
    }
    for (const q of APP_PHRASES) {
      const g = await ask(q, null, true), a = await page.evaluate(q => LipidomicCompanionLocal.answer(q, {aiEnabled: true}), q);
      assert.equal(g.local, a, `grounded: "${q}" is routed exactly as without the knowledge base (no library-term yield)`);
    }
    console.log(`PASS: grounded routing with ${terms.length} library terms (${payload} bytes): cardiomyopathy, cardiolipin and "interpret cardiolipin synthesis" with a PCA selected, "where is cardiolipin synthesized", "can I study PC", "how is PC synthesized" and "high lipid" / "lipid table" go to the KB; interface questions (high/low resolution, export as an image, download the table, colour of the bar(s), sign out) are not yielded; palette, select a plot, minimum detection slider, add a figure, "interpret this PCA" with a PCA selected stay local`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
