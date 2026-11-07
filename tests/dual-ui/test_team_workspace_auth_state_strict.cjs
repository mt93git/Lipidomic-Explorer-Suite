// Run with: node tests/dual-ui/test_team_workspace_auth_state_strict.cjs
// team-auth-state unlocks the workspace only for a literal authenticated === true (and reports sessionOnly only
// for a literal true). Malformed values ("false", "0", [], {}, 1, null) keep it locked.
const assert = require('node:assert/strict'), path = require('node:path');
const { chromium } = require('../browser/ci/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const p = await browser.newPage();
    await p.setContent(`<body data-guide-step="1"><section id="team-workspace"><h2 id="tw-screen-title"></h2><p id="tw-screen-help"></p><span id="tw-progress"></span><button data-tw-stage="data"></button><button data-tw-next></button><button data-tw-back></button><button data-tw-choice="matrix"></button><p id="tw-next"></p></section><script>
      window.handlers={};window.jQuery=function(){return {on:function(){return this},trigger:function(){}}};window.Shiny={setInputValue:function(){},addCustomMessageHandler:function(n,f){handlers[n]=f},shinyapp:{isConnected:function(){return true}}};
      window.events=[];window.addEventListener('team-auth-changed',function(e){events.push(e.detail);});</script></body>`);
    await p.addScriptTag({ path: path.resolve('www/team/js/workspace.js') });
    const send = v => p.evaluate(v => { handlers['team-auth-state'](v); return [document.body.dataset.teamAuthenticated, events[events.length - 1]]; }, v);
    for (const bad of ['false', '0', 'true', [], {}, 1, null]) {
      const [flag, detail] = await send({ authenticated: bad, sessionOnly: bad });
      assert.equal(flag, 'false', `authenticated=${JSON.stringify(bad)} must not unlock`);
      assert.deepEqual(detail, { authenticated: false, sessionOnly: false }, `authenticated/sessionOnly=${JSON.stringify(bad)} are not true`);
    }
    let [flag, detail] = await send({ authenticated: true, sessionOnly: true });
    assert.equal(flag, 'true'); assert.deepEqual(detail, { authenticated: true, sessionOnly: true });
    [flag, detail] = await send({ authenticated: '0' });
    assert.equal(flag, 'false', 'a malformed value after a real sign-in locks again');
    [flag] = await send(null); assert.equal(flag, 'false', 'a null message locks');
    console.log('PASS: team-auth-state unlocks only for authenticated === true; sessionOnly only for a literal true');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
