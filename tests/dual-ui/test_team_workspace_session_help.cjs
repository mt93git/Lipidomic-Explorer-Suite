// Run with: node tests/dual-ui/test_team_workspace_session_help.cjs
// workspace.js is inlined in <head> (R/frontends/team/ui.R), before the body's #team-workspace marks a
// session-only workspace (window.LIPIDOMIC_TEAM_SESSION_ONLY / data-tw-session-only). The Data help line
// must be resolved when painted, so a local session never offers "a private saved checkpoint".
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('../browser/ci/node_modules/playwright');
const script = fs.readFileSync(path.resolve('www/team/js/workspace.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const stubs = "window.handlers={};window.jQuery=function(){return {on:function(){return this},trigger:function(){}}};window.Shiny={setInputValue:function(){},addCustomMessageHandler:function(n,f){handlers[n]=f},shinyapp:{isConnected:function(){return true}}};";
function page(mode) {
  const attr = mode === 'library' ? '' : ' data-tw-session-only="true"';
  const flag = mode === 'flag+attr' ? '<script>window.LIPIDOMIC_TEAM_SESSION_ONLY=true;</script>' : '';
  return `<!DOCTYPE html><html><head><script>${stubs}</script><script>${script}</script></head><body data-guide-step="1">` +
    `<section id="team-workspace"${attr}>${flag}<h2 id="tw-screen-title"></h2><p id="tw-screen-help">Select a saved analysis or start with a new matrix.</p>` +
    `<span id="tw-progress"></span><button data-tw-stage="data"></button><button data-tw-next></button><button data-tw-back></button>` +
    `<button data-tw-choice="matrix"></button><p id="tw-next"></p></section></body></html>`;
}
(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    for (const mode of ['flag+attr', 'attr-only', 'library']) {
      const p = await browser.newPage();
      await p.setContent(page(mode));
      await p.evaluate(() => handlers['team-auth-state']({authenticated: true, sessionOnly: !!window.LIPIDOMIC_TEAM_SESSION_ONLY}));
      await p.waitForFunction(() => document.body.dataset.twScreen === 'data-choice');
      const help = (await p.locator('#tw-screen-help').textContent()).trim();
      if (mode === 'library') {
        assert.equal(help, 'Start with a new matrix or open a private saved checkpoint.', `${mode}: library help`);
      } else {
        assert.equal(help, 'Start with a new matrix or resume a session ZIP you saved earlier. This local session is not saved automatically.', `${mode}: local-session help`);
        assert.doesNotMatch(help, /checkpoint/i, `${mode}: a local session offers no checkpoint`);
      }
      await p.close();
    }
  } finally { await browser.close(); }
  console.log('PASS: Team Data help line is resolved at paint time for local sessions and the library');
})().catch(e => { console.error(e); process.exit(1); });
