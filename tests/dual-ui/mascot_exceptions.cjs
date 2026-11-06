// Shared by test_team_visual_system.cjs, test_team_scope_guard.cjs and test_team_inspector_toggle.cjs.
// The mascot is frozen at production (d814775 = eed4451 = 84a24e5 for these files). Wave 5 has approved exceptions in
// exactly three files; each is taken back out here, and what is left must still be byte-identical to production.
// Every other frozen file must be byte-identical as it is. A one-character change outside the exceptions fails
// (negativeControl() proves it in each test that uses this helper).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');

// companion_guidance_data.js (coordinator for Gerardo, 2026-11-04, wave 5B): the two Data tips, the Save & export tip
// and the autosave topic may be worded for a local session (no project library) through read-time getters. With
// exactly those four getters put back to the production strings the file must be byte-identical to production.
function withoutApprovedSessionText(buf) {
  let text = buf.toString('utf8');
  const choice = /    \/\/ Read at display time: the session-only flag is set later in the page body\.\n(    'data-choice': \[\{id: 'data-choice-1', title: 'Choose how to begin', )get text\(\) \{ return window\.LIPIDOMIC_TEAM_SESSION_ONLY === true \? '[^'\n]*' : ('[^'\n]*'); \}\}\],\n/;
  const topic = /(\n      )get text\(\) \{ return window\.LIPIDOMIC_TEAM_SESSION_ONLY === true \? '[^'\n]*' : ('In Data you open a saved checkpoint[^'\n]*'); \}\},\n/;
  // Round 2 (coordinator, 2026-11-04): the Save & export tip and the autosave topic, same getter form.
  const save = /(    'save': \[\{id: 'save-1', title: 'Save a checkpoint', )get text\(\) \{ return window\.LIPIDOMIC_TEAM_SESSION_ONLY === true \? '[^'\n]*' : ('Name the checkpoint[^'\n]*'); \}\}\],\n/;
  const autosave = /(\n      )get text\(\) \{ return window\.LIPIDOMIC_TEAM_SESSION_ONLY === true \? '[^'\n]*' : ('With a private project, the workspace autosaves\.[^'\n]*'); \}\},\n/;
  if (!choice.test(text) || !topic.test(text) || !save.test(text) || !autosave.test(text)) return buf;
  text = text.replace(choice, (m, head, prod) => head + 'text: ' + prod + '}],\n').replace(topic, (m, lead, prod) => lead + 'text: ' + prod + '},\n')
    .replace(save, (m, head, prod) => head + 'text: ' + prod + '}],\n').replace(autosave, (m, lead, prod) => lead + 'text: ' + prod + '},\n');
  return Buffer.from(text, 'utf8');
}

// companion_assistant.js (Gerardo, 2026-11-04, Ana Pau's Mods-anapau 0bced6c): formatAnswer (bold section titles,
// italic Source line in message text), its constant, and its call from addMessage.
const APPROVED_FORMAT_ANSWER = [
  "  var SECTION_TITLES = ['Definition', 'Structure', 'Biological function', 'Interactions', 'Relevance', 'New insights'];\n" +
  "  // Section titles in bold, the source line in italics; built with DOM nodes so nothing from the text is parsed as HTML.\n" +
  "  function formatAnswer(span, text) {\n    span.textContent = '';\n    String(text).split('\\n').forEach(function (line, i) {\n" +
  "      if (i) span.appendChild(document.createTextNode('\\n'));\n" +
  "      var wrap = SECTION_TITLES.indexOf(line) >= 0 ? 'strong' : /^(— )?Source: /.test(line) ? 'em' : '';\n" +
  "      if (wrap) span.appendChild(node(wrap, '', line)); else span.appendChild(document.createTextNode(line));\n    });\n  }\n",
  "    if (kind === 'assistant') { var body = item.querySelector('.assistant-message-text'); body.style.whiteSpace = 'pre-wrap'; formatAnswer(body, text); }\n",
  "    if (kind === 'assistant') item.querySelector('.assistant-message-text').style.whiteSpace = 'pre-wrap';\n"];
// companion_assistant.js, round 3: the guidance WORDING of the header label and the welcome/disclosure text comes from two
// getters (guideLabel, welcomeText) plus the kbGrounded/kbTerms state; the look may not change. With the getters block taken
// out and its call sites put back to the production expressions, the file must be byte-identical to production.
const OPENAI_WELCOME = 'Ask about this workflow. AI matches your question to reviewed application guidance; it does not analyze your matrix. OpenAI receives your question and basic settings. Do not enter identifying or confidential details. Scientific changes always need your confirmation.';
const LOCAL_WELCOME = 'No AI model is connected. I can explain this step and guide actions. Scientific changes always need your confirmation.';
const APPROVED_GUIDANCE_WORDING = {
  block: /  \/\/ Guidance wording only \(approved extension of the mascot exception, 2026-11-04\)\.[^\n]*\n(  \/\/[^\n]*\n){2}  var kbGrounded = false, kbTerms = \[\];\n  function guideLabel\(\) \{ return kbGrounded \? ' · KNOWLEDGE BASE' : aiEnabled \? ' · AI GUIDE' : ' · LOCAL GUIDE'; \}\n  function welcomeText\(\) \{ return kbGrounded \? "[^"\n]*" : aiEnabled \? '([^'\n]*)' : '([^'\n]*)'; \}\n/,
  sites: [[".toUpperCase())+guideLabel();", ".toUpperCase())+(aiEnabled?' · AI GUIDE':' · LOCAL GUIDE');"],
    ["aiEnabled=!!msg.ai_enabled;kbGrounded=msg.kb_grounded===true;kbTerms=kbGrounded?(Array.isArray(msg.kb_terms)?msg.kb_terms:kbTerms):[];", "aiEnabled=!!msg.ai_enabled;"],
    // Item 18: the grounded flag and the library terms are passed to the local guide (see withoutApprovedGroundedYield).
    ["local.answer(text, {aiEnabled: aiEnabled, kbGrounded: kbGrounded, kbTerms: kbTerms})", "local.answer(text, {aiEnabled: aiEnabled})"],
    ["welcome.textContent=welcomeText();", "welcome.textContent=aiEnabled?'" + OPENAI_WELCOME + "':'" + LOCAL_WELCOME + "';"]]
};
function withoutApprovedGuidanceWording(text) {
  const m = APPROVED_GUIDANCE_WORDING.block.exec(text);
  // The non-grounded branches must return the production strings unchanged.
  if (!m || m[2] !== OPENAI_WELCOME || m[3] !== LOCAL_WELCOME) return text;
  const rest = text.replace(APPROVED_GUIDANCE_WORDING.block, '');
  if (APPROVED_GUIDANCE_WORDING.sites.some(([now]) => rest.split(now).length !== 2)) return text;
  text = rest;
  for (const [now, prod] of APPROVED_GUIDANCE_WORDING.sites) text = text.replace(now, prod);
  return text;
}
function withoutApprovedFormatAnswer(buf) {
  const [added, call, original] = APPROVED_FORMAT_ANSWER;
  const text = withoutApprovedGuidanceWording(buf.toString('utf8'));
  if (text.split(added).length !== 2 || text.split(call).length !== 2) return buf;
  return Buffer.from(text.replace(added, '').replace(call, original), 'utf8');
}

// companion_guidance.js, item 18 and round 5: in grounded mode only, the local matcher leaves questions naming a library
// term to the knowledge base: one predicate (namesLibraryTerm, fed by kb_terms from R), one kbYield flag computed
// before any shortcut, and `&& !kbYield` on the two selected-card early returns and on the search early return.
// Exactly those are taken back out; anything else must be byte-identical to production.
const APPROVED_GROUNDED_YIELD = {
  block: /  \/\/ Grounded mode only \(kb_grounded; approved extension of the mascot exception, 2026-11-04\)[^\n]*\n  \/\/[^\n]*\n  function namesLibraryTerm\(q, terms, top\) \{ [^\n]* \}\n/,
  sites: [
    ["    var kbYield = !!(opts && opts.kbGrounded === true && namesLibraryTerm(q, opts.kbTerms, search(q)[0]));\n", ""],
    ["    if (sel && aboutThis && !kbYield && /improv|", "    if (sel && aboutThis && /improv|"],
    ["    if (sel && aboutThis && !kbYield) { explain(sel.id); return true; }", "    if (sel && aboutThis) { explain(sel.id); return true; }"],
    ["    if (top && top.score >= 1.6 && top.coverage >= 0.34 && !kbYield) {", "    if (top && top.score >= 1.6 && top.coverage >= 0.34) {"]]
};
function withoutApprovedGroundedYield(buf) {
  let text = buf.toString('utf8');
  const m = APPROVED_GROUNDED_YIELD.block.exec(text);
  if (!m || text.split(m[0]).length !== 2) return buf;
  text = text.replace(m[0], '');
  if (APPROVED_GROUNDED_YIELD.sites.some(([now]) => text.split(now).length !== 2)) return buf;
  for (const [now, prod] of APPROVED_GROUNDED_YIELD.sites) text = text.replace(now, prod);
  return Buffer.from(text, 'utf8');
}

// context_help.js (Gerardo, 2026-11-05, performance only): positionDock/protectedEntries/positionSpeech measure boxes
// before styles (5989b54). Exactly that approved file (by SHA-256) stands for the production bytes; any other change fails.
const APPROVED_CONTEXT_HELP = {
  sha256: 'f577c612c9223e849f7a78869fafc1286c4d779461bd52dde06e4e9aa4b5746f',
  production: '7547c072fc6ebcfed60053f09fd94966be5fc9d2c2d432ffdac6e4419b825d2e',
  ref: '28b8365',
};
function withoutApprovedDockPerf(buf) {
  const sha = (b) => require('node:crypto').createHash('sha256').update(b).digest('hex');
  if (sha(buf) !== APPROVED_CONTEXT_HELP.sha256) return buf;
  const prod = production('www/team/js/context_help.js', APPROVED_CONTEXT_HELP.ref);
  return prod && sha(prod) === APPROVED_CONTEXT_HELP.production ? prod : buf;
}

// context_help.js (Gerardo, 2026-11-05, triage F-24/F-25, focus only): closing help focuses a visible control when its
// opener is hidden, and pointercancel clears the drag's click suppression. Exactly these two sites are taken back out.
const APPROVED_HELP_FOCUS = [
  ["if(restore&&prev.isConnected){if(prev.getClientRects().length)prev.focus();else{var alt=document.querySelector('.help-bar-settings');if(alt&&alt.getClientRects().length)alt.focus();}}}}",
    "if(restore&&prev.isConnected)prev.focus();}}"],
  ["target.onpointercancel=function(e){suppressClick=false;endDrag(e);};", "target.onpointercancel=endDrag;"]];
function withoutApprovedHelpFocus(buf) {
  let text = buf.toString('utf8');
  if (APPROVED_HELP_FOCUS.some(([now]) => text.split(now).length !== 2)) return buf;
  for (const [now, prod] of APPROVED_HELP_FOCUS) text = text.replace(now, prod);
  return Buffer.from(text, 'utf8');
}

const STRIP = {
  'www/team/js/context_help.js': buf => withoutApprovedDockPerf(withoutApprovedHelpFocus(buf)),
  'www/team/js/companion_assistant.js': withoutApprovedFormatAnswer,
  'www/team/js/companion_guidance.js': withoutApprovedGroundedYield,
  'www/team/js/companion_guidance_data.js': withoutApprovedSessionText,
};
const EXCEPTION_FILES = Object.keys(STRIP);
// The file with its approved exceptions taken back out (any other file is returned unchanged).
function withoutApprovedExceptions(file, buf) { return STRIP[file] ? STRIP[file](buf) : buf; }
function production(file, ref) {
  try { return execFileSync('git', ['show', `${ref}:${file}`], {cwd: ROOT, maxBuffer: 64 * 1024 * 1024}); } catch (e) { return null; }
}
// True when the file (its working-tree bytes, or `buf`) equals `ref` byte-for-byte once the approved exceptions are out.
function frozenMatches(file, ref, buf) {
  const prod = production(file, ref);
  if (buf === undefined) buf = fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file)) : null;
  if (prod === null || buf === null) return prod === buf;
  return prod.equals(withoutApprovedExceptions(file, buf));
}
// Negative control: a one-character change outside the exceptions (a character inserted at the start of the file, and
// one character changed in the middle) must make every exception file fail, as well as a plain frozen file.
// Returns the list of mutations that wrongly still matched (empty when the control holds).
function negativeControl(ref, plainFile = 'www/team/js/companion_workspace.js') {
  const leaks = [];
  for (const file of [...EXCEPTION_FILES, plainFile]) {
    const raw = fs.readFileSync(path.join(ROOT, file));
    if (!frozenMatches(file, ref, raw)) { leaks.push(`${file}: the unmodified file does not match ${ref}, so the control is void`); continue; }
    const mid = Math.floor(raw.length / 2), b = raw[mid] === 0x61 ? 0x62 : 0x61;
    const changed = Buffer.from(raw); changed[mid] = b;
    const mutations = {prefix: Buffer.concat([Buffer.from(' '), raw]), middle: changed};
    for (const [name, buf] of Object.entries(mutations)) if (frozenMatches(file, ref, buf)) leaks.push(`${file}: ${name} one-character change still matches ${ref}`);
  }
  return leaks;
}
module.exports = {EXCEPTION_FILES, withoutApprovedExceptions, frozenMatches, negativeControl};
