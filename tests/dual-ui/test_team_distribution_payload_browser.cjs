// Live-app check of the Team Signal distribution transport (www/team/js/plot_payload.js).
// Against a running Team app with a restored checkpoint holding a Signal distribution copy,
// records what Plotly holds for that card (gd.data/gd.layout, canonical, sha256) at:
//   1. the first render after Canvas opens,
//   2. a rebind of its hidden output (Shiny replays the stored value without shiny:value),
//   3. a round trip through Review and back to Canvas,
// and the bytes of its modebar "Download plot as png" export. Run it once against the
// production commit and once against the candidate, then compare:
//   node test_team_distribution_payload_browser.cjs record URL OUT.json
//   node test_team_distribution_payload_browser.cjs compare PROD.json CANDIDATE.json
// Env: TEAM_FIXTURE_EMAIL / TEAM_FIXTURE_PASSWORD (stub-library fixture account only),
// TEAM_CHECKPOINT (checkpoint name prefix), PLAYWRIGHT (module path, optional).
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const [mode, a, b] = process.argv.slice(2);
if (mode === 'compare') {
  const P = JSON.parse(fs.readFileSync(a)), C = JSON.parse(fs.readFileSync(b));
  for (const step of ['first', 'rebind', 'review']) {
    assert.ok(P[step] && C[step], 'missing step ' + step);
    assert.equal(C[step].plain, true, step + ': candidate arrays are not plain arrays');
    assert.equal(C[step].traces, P[step].traces, step + ': trace count');
    assert.equal(C[step].points, P[step].points, step + ': point count');
    assert.equal(C[step].data, P[step].data, step + ': gd.data differs from production');
    if (C[step].layout !== P[step].layout && P[step].layoutJson && C[step].layoutJson) { const pl = JSON.parse(P[step].layoutJson), cl = JSON.parse(C[step].layoutJson); console.error(step + ' layout keys differing: ' + [...new Set([...Object.keys(pl), ...Object.keys(cl)])].filter(k => JSON.stringify(pl[k]) !== JSON.stringify(cl[k])).join(', ')); }
    assert.equal(C[step].layout, P[step].layout, step + ': gd.layout differs from production');
  }
  assert.equal(C.modebarPng.sha256, P.modebarPng.sha256, 'modebar PNG export differs from production');
  console.log('PASS live Signal distribution: gd.data/gd.layout equal production at first render (' + C.first.traces + ' traces, ' + C.first.points + ' points), after a hidden-output rebind and after Review -> Canvas; modebar PNG export byte-identical (' + C.modebarPng.bytes + ' bytes)');
  process.exit(0);
}
if (mode !== 'record' || !a || !b) { console.error('usage: record URL OUT.json | compare PROD.json CANDIDATE.json'); process.exit(2); }
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '../browser/ci/node_modules/playwright'));
const email = process.env.TEAM_FIXTURE_EMAIL, password = process.env.TEAM_FIXTURE_PASSWORD;
if (!email || !password) { console.error('TEAM_FIXTURE_EMAIL and TEAM_FIXTURE_PASSWORD are required (stub-library fixture account)'); process.exit(2); }
setTimeout(() => { console.error('ERR hard timeout'); process.exit(3); }, 900000);
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const p = await (await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } })).newPage();
    p.setDefaultTimeout(120000);
    await p.goto(a, { waitUntil: 'commit', timeout: 180000 });
    await p.waitForFunction(() => window.Shiny && Shiny.shinyapp && Shiny.shinyapp.isConnected());
    await p.locator('#team_library_email').fill(email); await p.locator('#team_library_password').fill(password); await p.locator('#team_library_login').click();
    await p.waitForSelector('#team_library_project', { state: 'attached' });
    await p.evaluate(() => { const x = document.querySelector('#team_library_password'); if (x) x.value = ''; });
    // The library controls sit in the collapsed "all data options" section of the data shell.
    await p.waitForFunction(() => !window.TeamDataShell || document.querySelector('.ts-data-all'), null, { timeout: 30000 });
    await p.evaluate(() => { const d = document.querySelector('.ts-data-all'); if (d) d.open = true; });
    await p.waitForFunction(() => document.querySelector('#team_library_checkpoint') && document.querySelector('#team_library_checkpoint').options.length > 0);
    await p.evaluate(n => { const s = document.querySelector('#team_library_checkpoint'); const o = [...s.options].find(o => !n || o.text.startsWith(n)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); }, process.env.TEAM_CHECKPOINT || '');
    await p.evaluate(() => { const d = document.querySelector('.ts-data-all'); if (d) d.open = true; });
    await p.waitForTimeout(1500);
    await p.locator('#team_library_resume').click();
    const canvasReady = () => { const b = document.querySelector('[data-tw-stage="canvas"]'); return b && !b.disabled && window.TeamWorkspace && TeamWorkspace.state().preparationReady && !document.documentElement.classList.contains('shiny-busy'); };
    await p.waitForFunction(canvasReady, null, { timeout: 600000, polling: 200 });
    await p.evaluate(() => document.querySelector('[data-tw-stage="canvas"]').click());
    const settled = () => { const gd = [...document.querySelectorAll('[id^="tcinstance_"][id$="-plot_dist"]')].find(e => e.classList.contains('js-plotly-plot'));
      return !!gd && gd.data && gd.data.length > 0 && !gd.classList.contains('recalculating') && !gd.closest('.tc-restore-settling') && window.TeamAutosave && TeamAutosave.state().restorePending === false && !document.documentElement.classList.contains('shiny-busy'); };
    const snap = async () => {
      await p.waitForFunction(settled, null, { timeout: 600000, polling: 200 }); await p.waitForTimeout(3000);
      await p.waitForFunction(settled, null, { timeout: 600000, polling: 200 });
      const s = await p.evaluate(() => {
        const gd = [...document.querySelectorAll('[id^="tcinstance_"][id$="-plot_dist"]')].find(e => e.classList.contains('js-plotly-plot'));
        const canon = v => Array.isArray(v) ? v.map(canon) : (v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).filter(k => !k.startsWith('_') && k !== 'uid').map(k => [k, canon(v[k])])) : v);
        const keys = v => Array.isArray(v) ? v.map(keys) : (v && typeof v === 'object' ? Object.keys(v).filter(k => !k.startsWith('_') && k !== 'uid').map(k => [k, keys(v[k])]) : 0);
        return { id: gd.id, data: JSON.stringify(canon(gd.data)), order: JSON.stringify(keys(gd.data)), layout: JSON.stringify(canon(gd.layout)), traces: gd.data.length,
          points: gd.data.reduce((n, t) => n + (t.y ? t.y.length : 0), 0), plain: gd.data.every(t => Array.isArray(t.x) && Array.isArray(t.y)) };
      });
      const h = x => crypto.createHash('sha256').update(x).digest('hex');
      return { id: s.id, traces: s.traces, points: s.points, plain: s.plain, data: h(s.data + '\n' + s.order), layout: h(s.layout), layoutJson: s.layout };
    };
    const R = { url: a, at: new Date().toISOString() };
    R.first = await snap(); console.log('first', JSON.stringify({ ...R.first, layoutJson: undefined }));
    // 2. Rebind the hidden output: Shiny re-renders it from its stored value (bindOutput).
    await p.evaluate(async id => { const el = document.getElementById(id); const host = el.parentElement;
      await new Promise(r => { jQuery(el).one('plotly_afterplot', r); Promise.resolve(Shiny.unbindAll(host)).then(() => { el.style.visibility = 'hidden'; return Shiny.bindAll(host); }).then(() => { el.style.visibility = ''; }); setTimeout(r, 20000); }); }, R.first.id);
    R.rebind = await snap(); console.log('rebind', JSON.stringify({ ...R.rebind, layoutJson: undefined }));
    // 3. Hide every card (Review) and come back to Canvas.
    await p.evaluate(() => document.querySelector('[data-tw-stage="review"]').click());
    await p.waitForFunction(() => document.querySelector('[data-tw-stage="review"]').getAttribute('aria-current') === 'step');
    await p.waitForTimeout(2000);
    await p.waitForFunction(canvasReady, null, { timeout: 600000, polling: 200 });
    await p.evaluate(() => document.querySelector('[data-tw-stage="canvas"]').click());
    R.review = await snap(); console.log('review', JSON.stringify({ ...R.review, layoutJson: undefined }));
    // 4. Modebar PNG export of the card.
    const [download] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.evaluate(id => {
      const gd = document.getElementById(id); const btn = gd.querySelector('.modebar-btn[data-title^="Download plot"]');
      if (!btn) throw new Error('no modebar download button'); btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, R.first.id)]);
    const file = await download.path(); const bytes = fs.readFileSync(file);
    R.modebarPng = { name: download.suggestedFilename(), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    console.log('modebar', JSON.stringify(R.modebarPng));
    fs.writeFileSync(b, JSON.stringify(R, null, 1));
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message.split('\n')[0]); process.exit(1); });
