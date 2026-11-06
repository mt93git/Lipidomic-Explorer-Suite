// Run with: node tests/dual-ui/test_team_companion_kb_browser.cjs
// The real browser path of the grounded companion. The Team app runs with a fed knowledge library
// (LIPIDOMIC_KB_DIR) on 127.0.0.1 with the project library's files backend (no sign-in). A question typed in the companion chat is first offered to
// the frozen local guide (companion_guidance.js); when it does not know the answer, companion_assistant.js forwards
// it to R only if the server said ai_enabled. R must therefore advertise that flag in grounded mode, so the
// question reaches the knowledge base and comes back with its source. No external AI is configured or called.
// Real lipid questions (item 18): with a fed library holding passages on cardiolipin and on PC synthesis, "what is
// cardiolipin" and "how is PC synthesized" get knowledge-base answers with their source, while "how do I add a figure
// to the canvas" still gets the local guide's answer. With grounded mode off all three are answered locally, as before.
// Item 14: a library fed while the page is open reaches the idle browser on the recheck timer. (Production's item 12,
// the library-less local session refusing proxied requests, is not ported: that session mode does not exist here.)
// The frozen client's header and welcome must tell the truth in each configuration (item 11, 2026-11-04):
//  (a) grounded, no outside AI configured: header "<MASCOT> · KNOWLEDGE BASE" (e.g. NEUTROPHIL) and the on-server welcome (kb_grounded);
//  (b) an outside AI configured, no knowledge base: header "· AI GUIDE" and the existing OpenAI disclosure unchanged;
//  (c) grounded AND an outside AI configured (round 4, item 19): the KB answers first, so the KB wording is shown.
// In (b) and (c) no question is sent; the fake key below is never used for a request.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require('../browser/ci/node_modules/playwright');
const ROOT = path.resolve(__dirname, '../..');
const LIBS = "local({u<-file.path(Sys.getenv('HOME'),'Library','R',Sys.info()[['machine']],paste(R.version$major,sub('[.].*','',R.version$minor),sep='.'),'library');" +
  "x<-c(strsplit(Sys.getenv('TEAM_TEST_EXTRA_R_LIBS'),':')[[1]],u);x<-x[nzchar(x)&dir.exists(x)];if(length(x)).libPaths(unique(c(.libPaths(),x)))});";
const freePort = () => new Promise((resolve, reject) => { const s = http.createServer(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

const GROUNDED_WELCOME = "Ask about this workflow. Answers come from the lab's library of reviewed sources, with the source shown. Your question stays on this server and is not sent to any outside AI service. Scientific changes always need your confirmation.";
const OPENAI_WELCOME = 'Ask about this workflow. AI matches your question to reviewed application guidance; it does not analyze your matrix. OpenAI receives your question and basic settings. Do not enter identifying or confidential details. Scientific changes always need your confirmation.';

async function startApp(tmp, name, extraEnv) {
  const port = await freePort(), log = path.join(tmp, name + '.log');
  const env = Object.assign({}, process.env);
  ['LIPIDOMIC_TEAM_WORKSPACE', 'LIPIDOMIC_TEAM_LOCAL_SESSION', 'LIPIDOMIC_PROJECT_LIBRARY', 'LIPIDOMIC_STORAGE', 'LIPIDOMIC_STORAGE_DIR', 'LIPIDOMIC_COMPANION_KB', 'LIPIDOMIC_KB_SEARCH_SEED', 'LIPIDOMIC_KB_STYLE', 'OPENAI_API_KEY', 'LIPIDOMIC_AI_PROVIDER', 'LIPIDOMIC_COMPANION_AI', 'LIPIDOMIC_KB_DIR'].forEach(k => delete env[k]);
  Object.assign(env, { LIPIDOMIC_INTERFACE: 'team', LIPIDOMIC_PROJECT_LIBRARY: '1', LIPIDOMIC_STORAGE: 'files', LIPIDOMIC_STORAGE_DIR: fs.mkdtempSync(path.join(tmp, name + '-store-')) }, extraEnv);
  const child = spawn('Rscript', ['-e', LIBS + `shiny::runApp('.',port=${port},host='127.0.0.1',launch.browser=FALSE)`], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = fs.createWriteStream(log); child.stdout.pipe(out); child.stderr.pipe(out);
  await new Promise((resolve, reject) => { let text = ''; const on = d => { text += d; if (/Listening on http/.test(text)) resolve(); if (/Execution halted/.test(text)) reject(new Error('app did not start; see ' + log)); };
    child.stdout.on('data', on); child.stderr.on('data', on); child.on('exit', c => reject(new Error('app exited ' + c + '; see ' + log))); setTimeout(() => reject(new Error('app start timed out; see ' + log)), 150000); });
  return { port, log, child };
}

async function openChat(browser, port, sent, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  if (sent) page.on('websocket', ws => ws.on('framesent', f => { if (/assistant_request/.test(String(f.payload))) sent.push(String(f.payload)); }));
  for (let i = 0; ; i++) { try { await page.goto(`http://127.0.0.1:${port}/`); break; } catch (e) { if (i > 20) throw e; await page.waitForTimeout(500); } }
  await page.waitForFunction(() => window.Shiny && Shiny.shinyapp && Shiny.shinyapp.isConnected(), null, { timeout: 120000 });
  await page.waitForFunction(() => document.body.dataset.teamAuthenticated === 'true', null, { timeout: 120000 });
  // The server's assistant_state has arrived once the header carries the expected guide label.
  const want = (opts.header || /AI GUIDE|KNOWLEDGE BASE/).source;
  await page.waitForFunction(w => new RegExp(w).test((document.querySelector('.assistant-eyebrow') || {}).textContent || '') && !/^COMPANION/.test(document.querySelector('.assistant-eyebrow').textContent), want, { timeout: 60000 });
  await page.waitForTimeout(500);
  const opener = page.locator('.assistant-launcher:visible, button:visible:has-text("Ask companion")').first();
  if (await opener.count()) await opener.click(); else await page.evaluate(() => LipidomicAssistant.open(document.querySelector('.assistant-launcher')));
  await page.locator('.assistant-chat-input').waitFor({ state: 'visible' });
  return { page, header: (await page.locator('.assistant-eyebrow').textContent()).trim(), welcome: (await page.locator('.assistant-message-text').first().textContent()).trim() };
}
// Ask one question; returns whether it was answered by the local guide (in the browser) or by R.
async function ask(page, sent, question, expect) {
  const before = sent.length, localBefore = await page.locator('.cg-answer').count();
  // Counted before sending: a fast reply (e.g. the fail-closed 'unavailable' one) must not be counted as already there.
  const kbCount = await page.evaluate(() => Array.from(document.querySelectorAll('.assistant-message-assistant .assistant-source')).filter(e => /^Knowledge base/.test(e.textContent)).length);
  await page.locator('.assistant-chat-input').fill(question);
  await page.locator('.assistant-send').click();
  if (expect.kb) {
    // A knowledge-base reply: its source label starts with "Knowledge base" (an answer, or "no matching source").
    const kbBefore = kbCount;
    await page.waitForFunction(n => Array.from(document.querySelectorAll('.assistant-message-assistant .assistant-source')).filter(e => /^Knowledge base/.test(e.textContent)).length > n, kbBefore, { timeout: 60000 });
    const r = page.locator('.assistant-message-assistant').filter({ has: page.locator('.assistant-source', { hasText: /^Knowledge base/ }) }).last();
    return { requested: sent.slice(before).some(f => f.includes(question)), local: false, text: await r.locator('.assistant-message-text').textContent(), source: await r.locator('.assistant-source').textContent(),
      em: await r.locator('em').allTextContents() };
  }
  await page.waitForFunction(n => document.querySelectorAll('.cg-answer').length > n, localBefore, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const r = page.locator('.cg-answer').last();
  return { requested: sent.slice(before).some(f => f.includes(question)), local: true, text: await r.textContent(), source: await r.locator('.assistant-source').textContent() };
}
const CARDIOLIPIN = /dimeric phospholipid with four acyl chains/, PC_SYNTH = /CDP-choline \(Kennedy\) pathway/;
const QUESTIONS = { cardiolipin: 'what is cardiolipin', pc: 'how is PC synthesized', figure: 'how do I add a figure to the canvas' };
// Item 20: routing in grounded mode is data-driven (kb_terms from the library).
const LOCAL_QUESTIONS = ['how to change the palette', 'how to select a plot', 'what is the minimum detection slider', 'how do I add a figure to the canvas'];
const KB_QUESTIONS = [['what is cardiolipin', CARDIOLIPIN], ['where is cardiolipin synthesized', /synthesized in the inner mitochondrial membrane/], ['how is PC synthesized', PC_SYNTH], ['can I study PC', null]];

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'team-kb-browser-')), lib = path.join(tmp, 'library'), note = path.join(tmp, 'lipid_notes.md'), empty = path.join(tmp, 'empty-library'), late = path.join(tmp, 'late-library');
  fs.mkdirSync(empty); fs.mkdirSync(late);
  fs.writeFileSync(note, ['# Lab notes on lipid classes', '', '## Cardiolipin',
    'Cardiolipin is a dimeric phospholipid with four acyl chains, found almost exclusively in the inner mitochondrial membrane.',
    'Cardiolipin is synthesized in the inner mitochondrial membrane from phosphatidylglycerol and CDP-diacylglycerol.', '',
    '## Phosphatidylcholine synthesis',
    'Phosphatidylcholine (PC) is synthesized mainly through the CDP-choline (Kennedy) pathway; in the liver PC is also synthesized by methylation of phosphatidylethanolamine.', ''].join('\n'));
  const feed = dir => execFileSync('Rscript', ['-e', LIBS + `source('R/frontends/team/companion_kb.R'); invisible(companion_kb_add(${JSON.stringify(note)}, dir = ${JSON.stringify(dir)}, quiet = TRUE))`], { cwd: ROOT, stdio: 'ignore' });
  feed(lib);
  assert.ok(fs.statSync(path.join(lib, 'index', 'chunks.jsonl')).size > 0, 'the fixture library is fed');
  const AI = { LIPIDOMIC_COMPANION_AI: '1', OPENAI_API_KEY: 'sk-test-not-a-real-key-never-used' };
  const browser = await chromium.launch({ headless: true });
  try {
    // (a) grounded, no outside AI: real lipid questions reach the knowledge base, app help stays local.
    let app = await startApp(tmp, 'grounded', { LIPIDOMIC_KB_DIR: lib });
    try {
      const sent = [], { page, header, welcome } = await openChat(browser, app.port, sent);
      assert.match(header, /^[A-Z]+ · KNOWLEDGE BASE$/, '(a) grounded header says knowledge base (the mascot name varies with the step)');
      assert.equal(welcome, GROUNDED_WELCOME, '(a) grounded welcome says nothing leaves the server');
      for (const [q, rx] of KB_QUESTIONS) {
        const r = await ask(page, sent, q, { kb: true });
        assert.ok(r.requested, `(a) "${q}" was sent to R`);
        assert.match(r.source, /^Knowledge base/, `(a) "${q}" is answered by the knowledge base`);
        if (rx) {
          assert.match(r.text, rx, `(a) "${q}" is answered from the fed library`);
          assert.match(r.text, /Source: lipid_notes\.md/, `(a) "${q}" cites its source file`);
          assert.ok(r.em.some(t => /Source: lipid_notes\.md/.test(t)), `(a) "${q}": formatAnswer italicises the source line`);
        }
      }
      for (const q of LOCAL_QUESTIONS) {
        const r = await ask(page, sent, q, {});
        assert.ok(r.local && !r.requested, `(a) "${q}" is still answered by the local guide, not sent to R`);
        assert.match(r.source, /^Local guide/, `(a) "${q}" shows the local guide label`);
      }
      assert.match((await page.locator('.assistant-eyebrow').textContent()).trim(), /^[A-Z]+ · KNOWLEDGE BASE$/, '(a) header unchanged after the answers');
      const appLog = fs.readFileSync(app.log, 'utf8');
      assert.doesNotMatch(appLog, /companion_ai_complete|OpenAI request/i, 'no external AI call');
      console.log('(a) grounded: header', JSON.stringify(header), '; KB answers for cardiolipin and PC synthesis; canvas question local');
    } finally { app.child.kill('SIGTERM'); }
    // (b) outside AI configured, no knowledge base (empty library dir).
    // Round 5b: the external AI is allowed only with LIPIDOMIC_COMPANION_KB=0 (fail closed by structure).
    app = await startApp(tmp, 'ai', Object.assign({ LIPIDOMIC_KB_DIR: empty, LIPIDOMIC_COMPANION_KB: '0' }, AI));
    try {
      const { header, welcome } = await openChat(browser, app.port);
      assert.match(header, /^[A-Z]+ · AI GUIDE$/, '(b) AI header unchanged');
      assert.equal(welcome, OPENAI_WELCOME, '(b) the OpenAI disclosure is unchanged');
      console.log('(b) AI, no KB: header', JSON.stringify(header));
    } finally { app.child.kill('SIGTERM'); }
    // (c) grounded and an outside AI configured (item 19): the grounded branch answers every free question before the AI
    // branch, so OpenAI is not reachable while the KB is on. The KB wording is shown, a lipid question gets a KB answer
    // and the (fake, never valid) AI key is never used.
    app = await startApp(tmp, 'both', Object.assign({ LIPIDOMIC_KB_DIR: lib }, AI));
    try {
      const sent = [], { page, header, welcome } = await openChat(browser, app.port, sent);
      assert.match(header, /^[A-Z]+ · KNOWLEDGE BASE$/, '(c) KB + AI: knowledge-base header');
      assert.equal(welcome, GROUNDED_WELCOME, '(c) KB + AI: the on-server welcome');
      const r = await ask(page, sent, QUESTIONS.cardiolipin, { kb: true });
      assert.ok(r.requested && /^Knowledge base/.test(r.source) && CARDIOLIPIN.test(r.text) && /Source: lipid_notes\.md/.test(r.text), '(c) KB + AI: "what is cardiolipin" gets a KB answer with its source');
      const local = await ask(page, sent, 'how to change the palette', {});
      assert.ok(local.local && !local.requested, '(c) KB + AI: app help stays local');
      await page.waitForTimeout(1000);
      assert.doesNotMatch(fs.readFileSync(app.log, 'utf8'), /openai|companion_ai_complete|AI guidance (failed|error)/i, '(c) KB + AI: no outside AI request');
      console.log('(c) KB + AI: header', JSON.stringify(header), '; KB answer; no AI call');
    } finally { app.child.kill('SIGTERM'); }
    // (d) LIPIDOMIC_COMPANION_KB=0, no AI: all three questions behave as today (local guide, nothing sent).
    app = await startApp(tmp, 'off', { LIPIDOMIC_KB_DIR: lib, LIPIDOMIC_COMPANION_KB: '0' });
    try {
      const sent = [], { page, header } = await openChat(browser, app.port, sent, { header: /LOCAL GUIDE/ });
      assert.match(header, /^[A-Z]+ · LOCAL GUIDE$/, '(d) KB=0, no AI: local header');
      for (const key of ['cardiolipin', 'pc', 'figure']) {
        const r = await ask(page, sent, QUESTIONS[key], {});
        assert.ok(r.local && !r.requested, `(d) KB=0: "${QUESTIONS[key]}" is answered by the local guide as today`);
      }
      console.log('(d) KB=0: all three local');
    } finally { app.child.kill('SIGTERM'); }
    // (e) an empty library with the switch not 0 (and an AI configured): grounded in the fail-closed state from the
    // start; the library is then fed while the page stays open and idle, and the same question gets an answer.
    app = await startApp(tmp, 'late', Object.assign({ LIPIDOMIC_KB_DIR: late, LIPIDOMIC_KB_RECHECK_SECONDS: '2' }, AI));
    try {
      const sent = [], { page, header } = await openChat(browser, app.port, sent);
      assert.match(header, /^[A-Z]+ · KNOWLEDGE BASE$/, '(e) empty library: knowledge-base header (fail closed), not the AI guide');
      // A question the local guide does not know (before feeding there are no library terms to route by).
      const before = await ask(page, sent, 'what is the capital of France', { kb: true });
      assert.ok(before.requested && /unavailable/.test(before.source), '(e) empty library: the question gets the unavailable reply, never the AI');
      feed(late);
      let r;
      for (let i = 0; i < 20; i++) { await page.waitForTimeout(1500); r = await ask(page, sent, QUESTIONS.cardiolipin, { kb: true }); if (/passage/.test(r.source)) break; }
      assert.ok(/^Knowledge base · \d+ passage/.test(r.source) && CARDIOLIPIN.test(r.text), '(e) after feeding while idle the same question is answered from the library');
      assert.doesNotMatch(fs.readFileSync(app.log, 'utf8'), /openai|companion_ai_complete|AI guidance (failed|error)/i, '(e) no outside AI request');
      console.log('(e) empty library: fail closed, then fed while idle: answered');
    } finally { app.child.kill('SIGTERM'); }
    // (f) The committed library (Paula's port, knowledge_base/library): real lipid questions are answered from her
    // sources and cited as she defined. Lab transcriptions (.md, from slide images) are cited "<file>/Libreros_lab";
    // published literature (.pdf) is cited in APA from knowledge_base/references.csv. App help stays local.
    app = await startApp(tmp, 'library', { LIPIDOMIC_KB_DIR: path.join(ROOT, 'knowledge_base', 'library') });
    try {
      const sent = [], { page, header } = await openChat(browser, app.port, sent);
      assert.match(header, /^[A-Z]+ · KNOWLEDGE BASE$/, '(f) committed library: knowledge-base header');
      const LAB = /Source: [^\n]*\.png\/Libreros_lab/;
      const cl = await ask(page, sent, QUESTIONS.cardiolipin, { kb: true });
      assert.ok(cl.requested && /^Knowledge base · \d+ passages/.test(cl.source), '(f) "what is cardiolipin" gets a KB answer from the committed library');
      assert.match(cl.text, /cardiolipin/i, '(f) "what is cardiolipin" quotes a cardiolipin passage');
      assert.match(cl.text, /Source: [^\n]*[Cc]ardiolipin[^\n]*\/Libreros_lab/, '(f) "what is cardiolipin" cites Paula\'s cardiolipin transcriptions');
      const pc = await ask(page, sent, QUESTIONS.pc, { kb: true });
      assert.ok(pc.requested && /^Knowledge base · \d+ passages/.test(pc.source), '(f) "how is PC synthesized" gets a KB answer from the committed library');
      assert.match(pc.text, /Kennedy pathway/, '(f) "how is PC synthesized" quotes the Kennedy pathway passage');
      assert.match(pc.text, /Source: [^\n]*PC [^\n]*\/Libreros_lab/, '(f) "how is PC synthesized" cites Paula\'s PC transcriptions');
      assert.match(cl.text + pc.text, LAB, '(f) lab transcriptions keep the <file>/Libreros_lab form');
      const lit = await ask(page, sent, 'what are eicosanoids', { kb: true });
      assert.match(lit.text, /Source: [^\n]*Dudzinski, D\. M\., & Serhan, C\. N\. \(n\.d\.\)\. Pharmacology of eicosanoids/, '(f) literature (.pdf) is cited in APA from references.csv');
      assert.doesNotMatch(lit.text, /\.pdf/, '(f) an APA-cited PDF never shows its file name');
      const fig = await ask(page, sent, QUESTIONS.figure, {});
      assert.ok(fig.local && !fig.requested, '(f) "how do I add a figure to the canvas" stays local with the committed library');
      assert.match(fig.source, /^Local guide/, '(f) the canvas question shows the local guide label');
      assert.doesNotMatch(fs.readFileSync(app.log, 'utf8'), /could not search|manifest|companion_ai_complete|OpenAI request/i, '(f) the committed library loads (integrity check passes) and no outside AI is called');
      console.log('(f) committed library: cardiolipin and PC cite lab sources, eicosanoids cites APA, canvas local');
    } finally { app.child.kill('SIGTERM'); }
    console.log('PASS: grounded chat answers cardiolipin and PC synthesis from the knowledge base with its source, keeps canvas help local and says so; grounded off behaves as before; a library fed while idle is picked up; with an outside AI configured and no KB the AI header and OpenAI disclosure are unchanged; KB + AI uses the KB');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
