// Run with: node tests/dual-ui/test_team_no_seven_step.cjs
//   Optional: TEAM_NO7_SHOTS=<dir> saves a screenshot per opened tool.
// Production also ran a library-less local-session mode (LIPIDOMIC_TEAM_LOCAL_SESSION=1); that mode is not ported
// (local use is the library's files backend), so only the library mode runs and the session branches below are inert.
// Two views only: Classic, and Team = the Data -> Review -> Canvas workspace. This starts the real Team app
// (LIPIDOMIC_INTERFACE=team, LIPIDOMIC_TEAM_WORKSPACE deliberately unset) twice, in parallel:
//   - session-only: no project library (LIPIDOMIC_PROJECT_LIBRARY unset, LIPIDOMIC_TEAM_LOCAL_SESSION=1), as a teammate running it locally;
//   - library: LIPIDOMIC_PROJECT_LIBRARY=1 against a local stub identity/REST/storage service on 127.0.0.1
//     (synthetic test account generated here; nothing leaves this machine).
// In each mode it uploads the CI abundance fixture, goes Data -> Review -> Canvas, then clicks every entry of the
// Canvas toolbar's "Analysis tools" drawer (and every visible back-link on the page it opens) and asserts that the
// old seven-step Team shell never becomes visible: no "STEP n OF 7", no seven-step tour, no #guide-navigation step
// bar, no Design/Question page of the old shell, and the workspace stays in place. Each tool must open inside the
// workspace (its own page, or Review when the study design is still required), never leave the link without effect.
// Session-only mode also checks the save slot: "Not saved: local session", no Sign out, no library, no autosave.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('../browser/ci/node_modules/playwright');

const ROOT = path.resolve(__dirname, '../..');
const FIXTURE = path.join(ROOT, 'tests/browser/ci/fixtures/abundance.csv');
const SHOTS = process.env.TEAM_NO7_SHOTS || '';
const MODES = (process.env.TEAM_NO7_MODES || 'library').split(',').map(s => s.trim()).filter(Boolean);
const SEVEN_STEP_ONLY_PANES = ['Design', 'Question'];

function freePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer(); s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

// Minimal stand-in for the pilot's identity (GoTrue), REST (PostgREST) and storage services, enough for
// sign-in, one owned project and checkpoint autosave (team_library_call in R/frontends/team/project_library.R).
function startStubLibrary(port, account) {
  const project = crypto.randomUUID(), files = [], objects = new Map(), calls = [];
  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks), url = new URL(req.url, 'http://stub'), p = url.pathname;
      calls.push(req.method + ' ' + p);
      if (p === '/auth/token') {
        const b = JSON.parse(body.toString() || '{}');
        if (url.searchParams.get('grant_type') === 'password' && (b.email !== account.email || b.password !== account.password)) return json(res, 400, { error: 'invalid_grant' });
        return json(res, 200, { access_token: 'stub-access', refresh_token: 'stub-refresh', expires_in: 3600, user: { id: account.id, email: account.email } });
      }
      if (p === '/auth/user') return json(res, 200, { id: account.id, email: account.email });
      if (p === '/auth/logout') return json(res, 204);
      if (p === '/rest/pilot_projects') return json(res, 200, [{ id: project, name: 'Workspace test project' }]);
      if (p === '/rest/pilot_members') return json(res, 200, [{ project_id: project, user_id: account.id, role: 'owner' }]);
      if (p === '/rest/pilot_files' && req.method === 'GET') {
        const sha = (url.searchParams.get('sha256') || '').replace(/^eq\./, '');
        return json(res, 200, sha ? files.filter(f => f.sha256 === sha) : files.slice().reverse());
      }
      if (p === '/rest/pilot_files' && req.method === 'POST') {
        const f = JSON.parse(body.toString()); f.id = crypto.randomUUID(); f.created_at = new Date().toISOString(); files.push(f); return json(res, 201);
      }
      const object = p.match(/^\/storage\/object\/(?:authenticated\/)?case-files\/(.+)$/);
      if (object && req.method === 'POST') { objects.set(object[1], body); return json(res, 200, { Key: object[1] }); }
      if (object && req.method === 'GET') {
        if (!objects.has(object[1])) return json(res, 404, {});
        res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(objects.get(object[1]));
      }
      json(res, 404, {});
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ server, calls, files })));
}

function startApp(port, env, log) {
  // The pilot machines keep some packages only in the standard per-user library; append it (never ahead of
  // the app's own sandbox library) when it exists.
  const expr = "local({u<-file.path(Sys.getenv('HOME'),'Library','R',Sys.info()[['machine']],paste(R.version$major,sub('[.].*','',R.version$minor),sep='.'),'library');" +
    "x<-c(strsplit(Sys.getenv('TEAM_TEST_EXTRA_R_LIBS'),':')[[1]],u);x<-x[nzchar(x)&dir.exists(x)];if(length(x)).libPaths(unique(c(.libPaths(),x)))});" +
    `shiny::runApp('.',port=${port},host='127.0.0.1',launch.browser=FALSE)`;
  const clean = Object.assign({}, process.env);
  ['LIPIDOMIC_TEAM_WORKSPACE', 'LIPIDOMIC_TEAM_LOCAL_SESSION', 'LIPIDOMIC_PROJECT_LIBRARY', 'LIPIDOMIC_STORAGE', 'LIPIDOMIC_AUTH_URL', 'LIPIDOMIC_REST_URL', 'LIPIDOMIC_STORAGE_URL', 'LIPIDOMIC_UPLOAD_QUEUE'].forEach(k => delete clean[k]);
  const child = spawn('Rscript', ['-e', expr], { cwd: ROOT, env: Object.assign(clean, { LIPIDOMIC_INTERFACE: 'team' }, env), stdio: ['ignore', 'pipe', 'pipe'] });
  const out = fs.createWriteStream(log);
  child.stdout.pipe(out); child.stderr.pipe(out);
  const ready = new Promise((resolve, reject) => {
    let text = '';
    const onData = d => { text += d; if (/Listening on http/.test(text)) resolve(); if (/Execution halted/.test(text)) reject(new Error('Team app did not start; see ' + log)); };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('exit', code => reject(new Error('Team app exited with ' + code + '; see ' + log)));
    setTimeout(() => reject(new Error('Team app start timed out; see ' + log)), 150000);
  });
  return { child, ready };
}

// Everything the old seven-step shell would show; evaluated in the page.
function sevenStepProbe() {
  const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const text = document.body.innerText;
  const panes = Array.from(document.querySelectorAll('.tab-pane.active')).filter(vis).map(t => t.dataset.value).filter(Boolean);
  return {
    stepText: (text.match(/.{0,60}STEP\s+\d\s+OF\s+7.{0,60}/i) || [])[0] || '',
    tourText: (text.match(/.{0,60}seven-step.{0,60}/i) || [])[0] || '',
    guideNavigation: vis(document.getElementById('guide-navigation')),
    guideSteps: Array.from(document.querySelectorAll('.guide-step')).filter(vis).length,
    analysisToolbar: vis(document.getElementById('guide-analysis-toolbar')),
    // The bslib navbar entries of the old shell's pages must not be offered as visible links.
    navbarLinks: Array.from(document.querySelectorAll('.navbar a[data-value]')).filter(vis).map(a => a.dataset.value)
      .filter(v => ['Experiment', 'Design', 'Preparation', 'Question', 'Results', '3D Show', 'Share', 'Publication Export Studio'].includes(v)),
    workspace: !!document.getElementById('team-workspace') && document.body.classList.contains('team-workspace-app'),
    stage: document.body.dataset.teamStage || '', screen: document.body.dataset.twScreen || '',
    guideStep: document.body.dataset.guideStep || '', panes,
    canvasVisible: vis(document.getElementById('team-canvas-root')),
    notices: Array.from(document.querySelectorAll('.shiny-notification')).filter(vis).map(n => n.textContent.trim().replace(/\s+/g, ' ')),
    status: (document.getElementById('team-autosave-status') || {}).textContent || ''
  };
}

async function idle(page) {
  await page.waitForFunction(() => !document.documentElement.classList.contains('shiny-busy'), null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.waitForFunction(() => !document.documentElement.classList.contains('shiny-busy'), null, { timeout: 90000 }).catch(() => {});
}

function assertNoSevenStep(r, where) {
  assert.equal(r.stepText, '', `${where}: "${r.stepText}" of the old seven-step shell is visible`);
  assert.equal(r.tourText, '', `${where}: the seven-step tour is visible: "${r.tourText}"`);
  assert.equal(r.guideNavigation, false, `${where}: the seven-step bar (#guide-navigation) is visible`);
  assert.equal(r.guideSteps, 0, `${where}: seven-step buttons are visible`);
  assert.equal(r.analysisToolbar, false, `${where}: the seven-step analysis toolbar is visible`);
  assert.deepEqual(r.navbarLinks, [], `${where}: navbar links into the old shell's pages are visible`);
  assert.ok(r.workspace, `${where}: the Team workspace is gone`);
  for (const pane of SEVEN_STEP_ONLY_PANES) assert.ok(!r.panes.includes(pane), `${where}: the seven-step ${pane} page is showing`);
}

// Next is ignored while the workspace is busy-locked (workspace.js); retry until the screen changes.
async function next(page, screen, where) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.waitForFunction(() => !document.querySelector('[data-tw-next]').disabled, null, { timeout: 120000 });
    await idle(page);
    await page.click('[data-tw-next]').catch(() => {});
    const moved = await page.waitForFunction(s => document.body.dataset.twScreen === s, screen, { timeout: 15000 }).then(() => true, () => false);
    if (moved) return;
  }
  throw new Error(`${where}: Next did not open ${screen}: ${JSON.stringify(await page.evaluate(sevenStepProbe))}`);
}

async function backToCanvas(page, where) {
  const r = await page.evaluate(sevenStepProbe);
  if (r.screen === 'canvas' && r.canvasVisible) return;
  await page.locator('.ts-steps .ts-step[data-stage="canvas"]').click();
  await page.waitForFunction(() => document.body.dataset.twScreen === 'canvas' && (document.getElementById('team-canvas-root') || {}).getClientRects().length > 0, null, { timeout: 60000 })
    .catch(async () => { throw new Error(`${where}: Canvas did not come back: ${JSON.stringify(await page.evaluate(sevenStepProbe))}`); });
  await idle(page);
}

async function openDrawer(page) {
  const trigger = page.locator('.ts-analysis-trigger');
  await trigger.waitFor({ state: 'visible', timeout: 30000 });
  if (!(await page.locator('#team-tools-drawer:not([hidden])').count())) await trigger.click();
  await page.locator('#team-tools-drawer:not([hidden])').waitFor({ timeout: 10000 });
}

async function runMode(browser, mode) {
  const tag = `[${mode}]`;
  const port = await freePort();
  // Session-only Team is an explicit opt-in; without it and without the library Team refuses to start.
  const env = mode === 'session' ? { LIPIDOMIC_TEAM_LOCAL_SESSION: '1' } : {};
  let stub = null;
  const account = { id: crypto.randomUUID(), email: 'no7-' + crypto.randomBytes(4).toString('hex') + '@example.test', password: crypto.randomBytes(18).toString('base64url') };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'team-no7-'));
  if (mode === 'library') {
    const stubPort = await freePort();
    stub = await startStubLibrary(stubPort, account);
    Object.assign(env, { LIPIDOMIC_PROJECT_LIBRARY: '1', LIPIDOMIC_STORAGE: 'database', LIPIDOMIC_AUTH_URL: `http://127.0.0.1:${stubPort}/auth`, LIPIDOMIC_REST_URL: `http://127.0.0.1:${stubPort}/rest`,
      LIPIDOMIC_STORAGE_URL: `http://127.0.0.1:${stubPort}/storage`, LIPIDOMIC_UPLOAD_QUEUE: path.join(tmp, 'queue') });
  }
  const app = startApp(port, env, path.join(tmp, 'app.log'));
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const autosaveRequests = [];
  page.on('websocket', ws => ws.on('framesent', f => { if (/team_library_autosave_request|team_canvas_save_ready/.test(String(f.payload))) autosaveRequests.push(String(f.payload).slice(0, 120)); }));
  try {
    await app.ready;
    for (let attempt = 0; ; attempt++) {
      try { await page.goto(`http://127.0.0.1:${port}/`); break; } catch (e) { if (attempt >= 20) throw e; await page.waitForTimeout(500); }
    }
    await page.waitForFunction(() => window.Shiny && Shiny.shinyapp && Shiny.shinyapp.isConnected(), null, { timeout: 120000 });
    if (mode === 'library') {
      await page.locator('#team_library_email').waitFor({ state: 'visible', timeout: 60000 });
      assertNoSevenStep(await page.evaluate(sevenStepProbe), `${tag} sign-in`);
      await page.fill('#team_library_email', account.email);
      await page.fill('#team_library_password', account.password);
      await page.click('#team_library_login');
    }
    await page.waitForFunction(() => document.body.dataset.teamAuthenticated === 'true' && !document.querySelector('[data-tw-stage="data"]').disabled, null, { timeout: 120000 });
    await idle(page);
    let r = await page.evaluate(sevenStepProbe);
    assertNoSevenStep(r, `${tag} Data`);
    assert.equal(r.screen, 'data-choice', `${tag} the workspace opens on Data`);
    if (mode === 'session') {
      assert.equal(r.status.trim(), 'Not saved: local session', `${tag} the save slot says the session is local`);
      const slot = await page.evaluate(() => {
        const vis = el => !!el && el.getClientRects().length > 0;
        return { signOut: Array.from(document.querySelectorAll('.ts-signout,.tw-signout,[data-tw-logout],#team_library_logout')).some(vis),
          library: !!document.querySelector('.team-library'), login: !!document.querySelector('#team_library_email'),
          mirror: (document.querySelector('.ts-saved') || {}).textContent || '', upload: vis(document.querySelector('[data-tw-choice="matrix"]')) };
      });
      assert.equal(slot.signOut, false, `${tag} Sign out is hidden without a library`);
      assert.equal(slot.library, false, `${tag} no project library is rendered`);
      assert.equal(slot.login, false, `${tag} no sign-in form is rendered`);
      assert.equal(slot.mirror.trim(), 'Not saved: local session', `${tag} the top bar mirrors the local-session status`);
      assert.equal(slot.upload, true, `${tag} Data offers "Upload a new matrix"`);
      const help = await page.evaluate(() => (document.getElementById('tw-screen-help') || {}).textContent || '');
      assert.match(help, /resume a session ZIP/, `${tag} the Data help line describes the local session`);
      assert.doesNotMatch(help, /checkpoint/i, `${tag} the Data help line offers no private checkpoint`);
    } else {
      assert.doesNotMatch(r.status, /local session/i, `${tag} a signed-in library session is not called local`);
    }
    // Library: the Data shell's "New matrix" card (data_shell.js); session-only: the workspace choice card.
    await page.click(mode === 'library' ? '.ts-data-new .ts-data-upload' : '[data-tw-choice="matrix"]');
    await page.waitForFunction(() => document.body.dataset.twScreen === 'data-matrix', null, { timeout: 30000 });
    await page.setInputFiles('#data_hub-files', FIXTURE);
    await page.waitForFunction(() => /Abundance matrix loaded/i.test((document.getElementById('guide_experiment_summary') || {}).textContent || ''), null, { timeout: 120000 });
    assertNoSevenStep(await page.evaluate(sevenStepProbe), `${tag} Data matrix`);
    await next(page, 'data-metadata', `${tag} Data matrix`);
    await page.locator('#guide_skip_extra_metadata').waitFor({ state: 'visible', timeout: 60000 });
    assertNoSevenStep(await page.evaluate(sevenStepProbe), `${tag} Data metadata`);
    await page.click('#guide_skip_extra_metadata');
    await next(page, 'review-single', `${tag} Data metadata`);
    await page.waitForFunction(() => window.TeamWorkspace && TeamWorkspace.state().preparationReady, null, { timeout: 180000 });
    await idle(page);
    assertNoSevenStep(await page.evaluate(sevenStepProbe), `${tag} Review`);
    // Describe the study design so the statistical tools can open (otherwise they route back to Review).
    await page.evaluate(() => { const d = Array.from(document.querySelectorAll('details')).find(x => /Study design and preparation options/.test(x.querySelector('summary') ? x.querySelector('summary').textContent : '')); if (d) d.open = true; });
    await page.locator('#guide_unit').fill('Animal');
    await page.locator('#guide_unit').press('Tab');
    await page.selectOption('#guide_design_type', 'independent');
    await idle(page);
    await page.waitForFunction(() => window.TeamWorkspace && TeamWorkspace.state().preparationReady, null, { timeout: 180000 });
    await next(page, 'canvas', `${tag} Review`);
    await idle(page);
    assertNoSevenStep(await page.evaluate(sevenStepProbe), `${tag} Canvas`);

    await openDrawer(page);
    const entries = await page.$$eval('#team-tools-drawer .ttd-item', items => items.map(i => i.querySelector('.ttd-name').textContent));
    assert.ok(entries.length >= 19, `${tag} the drawer lists every analysis tool (${entries.length})`);
    const opened = {};
    for (const name of entries) {
      await backToCanvas(page, `${tag} before ${name}`);
      await openDrawer(page);
      await page.locator('#team-tools-drawer .ttd-item').filter({ has: page.locator('.ttd-name', { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).locator('.ttd-open').click();
      await idle(page);
      r = await page.evaluate(sevenStepProbe);
      assertNoSevenStep(r, `${tag} ${name}`);
      // Opened inside the workspace: the canvas made way for the tool page (or Review asks for the design).
      const reviewGate = r.screen === 'review-single';
      assert.ok(reviewGate || (!r.canvasVisible && r.panes.length > 0), `${tag} ${name} opened nothing: ${JSON.stringify(r)}`);
      // A tool the study cannot support (here Longitudinal: the fixture has independent units and no time
      // design) explains why on Review, the workspace page that holds the design; that is not a dead link.
      const explained = reviewGate && r.notices.some(t => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' is unavailable for this study', 'i').test(t));
      opened[name] = reviewGate ? (explained ? 'Review (unavailable for this study)' : 'Review') : r.panes[0];
      if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${mode}-${name.replace(/[^A-Za-z0-9]+/g, '_')}.png`) }); }
      // Every visible back-link on that page (outside the workspace's own Canvas tabs) also stays in the workspace.
      const backLinks = await page.$$eval('button[data-guide-step]', bs => bs.filter(b => b.getClientRects().length && !b.closest('#team-workspace,#team-tools-drawer')).map(b => b.textContent.trim()));
      for (const label of backLinks) {
        const link = page.locator('button[data-guide-step]').filter({ hasText: label }).filter({ hasNot: page.locator('xpath=ancestor::*[@id="team-workspace"]') }).first();
        if (!(await link.isVisible().catch(() => false))) continue;
        await link.click();
        await idle(page);
        assertNoSevenStep(await page.evaluate(sevenStepProbe), `${tag} ${name} → ${label}`);
        break; // one hop per page: the next tool starts from Canvas again
      }
    }
    // The design was described, so no statistical tool should still bounce to Review.
    const bounced = Object.keys(opened).filter(k => opened[k] === 'Review');
    assert.deepEqual(bounced, [], `${tag} tools that did not open: ${bounced.join(', ')}`);
    if (mode === 'session') {
      r = await page.evaluate(sevenStepProbe);
      assert.equal(r.status.trim(), 'Not saved: local session', `${tag} the slot never turns into a save state`);
      assert.deepEqual(autosaveRequests, [], `${tag} no autosave or checkpoint request is sent without a library`);
      // Save & export still offers the session ZIP download.
      await backToCanvas(page, `${tag} Save & export`);
      await page.evaluate(() => { const l = Array.from(document.querySelectorAll('.tw-canvas-tabs .guide-button')).find(b => b.textContent.trim() === 'Save & export'); l.click(); });
      await page.waitForFunction(() => document.body.dataset.guideStep === '7', null, { timeout: 30000 });
      await idle(page);
      assertNoSevenStep(await page.evaluate(sevenStepProbe), `${tag} Save & export`);
      assert.ok(await page.locator('#data_hub-export_session_btn').isVisible(), `${tag} Save & export offers the session ZIP`);
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('#data_hub-export_session_btn')]);
      assert.match(download.suggestedFilename(), /\.zip$/);
      assert.doesNotMatch(await page.locator('.tab-pane[data-value="Share"]').innerText(), /Private (project )?checkpoints/i, `${tag} Save & export does not promise private checkpoints`);
      // A fresh local session resumes from that ZIP on Data and opens Review, still without saving anywhere.
      const zip = path.join(tmp, 'session.zip');
      await download.saveAs(zip);
      const again = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const againRequests = [];
      again.on('websocket', ws => ws.on('framesent', f => { if (/team_library_autosave_request|team_canvas_save_ready/.test(String(f.payload))) againRequests.push(String(f.payload).slice(0, 120)); }));
      try {
        await again.goto(`http://127.0.0.1:${port}/`);
        await again.waitForFunction(() => document.body.dataset.teamAuthenticated === 'true' && !document.querySelector('[data-tw-stage="data"]').disabled, null, { timeout: 120000 });
        await again.evaluate(() => { const d = document.querySelector('[data-value="Experiment"] .guide-page > details.guide-panel'); if (d) d.open = true; });
        await again.setInputFiles('#data_hub-import_session_file', zip);
        await again.waitForFunction(() => document.body.dataset.twScreen === 'review-single' && window.TeamWorkspace && TeamWorkspace.state().preparationReady, null, { timeout: 180000 });
        await idle(again);
        const back = await again.evaluate(sevenStepProbe);
        assertNoSevenStep(back, `${tag} restored session ZIP`);
        assert.equal(back.status.trim(), 'Not saved: local session', `${tag} a restored local session is still not saved anywhere`);
        assert.deepEqual(againRequests, [], `${tag} restoring a ZIP sends no autosave request`);
      } finally { await again.close().catch(() => {}); }
    } else {
      assert.ok(stub.calls.some(c => c === 'GET /rest/pilot_projects'), `${tag} the library was used`);
    }
    console.log(`${tag} ok: ${entries.length} tools, none showed the seven-step shell: ${JSON.stringify(opened)}`);
  } finally {
    await page.close().catch(() => {});
    app.child.kill('SIGTERM');
    if (stub) stub.server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await Promise.all(MODES.map(mode => runMode(browser, mode)));
    console.log('test_team_no_seven_step: PASS');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
