// Phase 1B, Phase 0 spike (docs/integration/nexo-collab-plan.md 2.3, 5): two browsers share one board through the real
// sidecar (fake Admin PostgREST), geometry only, Chromium and WebKit (mock build); a flag-off build never reaches it.
// UX review 2, groups 4 and 5 (chrome below): "Updated by" drawn on the card, refusal sentences, inert view-only options, the
// phone pill's dot.
// node tests/dual-ui/test_nexo_collab_spike.cjs      (NEXO_BROWSERS=chromium limits the run)
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const nexo = path.join(root, 'frontends/nexo');
const sidecar = path.join(root, 'frontends/nexo-collab');
const ci = path.join(root, 'tests/browser/ci');
const checkpoint = require(path.join(nexo, 'src/mock/checkpoints.json'))[0].id;
const project = '0a000000-0000-4000-8000-0000000000f5';
// UX review 2, groups 4 and 5: a second board in a client's workspace, where the client member Dr. Lee is an Editor.
const shared = '0a000000-0000-4000-8000-0000000000f7', client = 'c0000000-0000-4000-8000-0000000000c1';
// The mock Admin tokens (src/mock/adminToken.ts) for the fake PostgREST: "Lab staff" by default; with sessionStorage
// 'nexo-mock-admin' = 'staff2', Blair Synthetic (a second person, not a second tab of the first); = 'client', Dr. Lee.
const callers = { 'mock-admin-token': [{ caller: '00000000-0000-4000-8000-00000000a001', caller_view: 'staff', client_id: null }],
  'eyJhbGciOiJub25lIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMGEwMDQiLCJkaXNwbGF5TmFtZSI6IkJsYWlyIFN5bnRoZXRpYyJ9.mock-staff':
    [{ caller: '00000000-0000-4000-8000-00000000a004', caller_view: 'staff', client_id: null }],
  'eyJhbGciOiJub25lIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMGEwMDIiLCJkaXNwbGF5TmFtZSI6IkRyLiBMZWUifQ.mock-client':
    [{ caller: '00000000-0000-4000-8000-00000000a002', caller_view: 'client', client_id: client }],
  // FIX-PROD-E: 'named' (Robin Synthetic), whose opaque token carries no name; Admin's nexo_people names Robin.
  'mock-named-token': [{ caller: '00000000-0000-4000-8000-00000000a005', caller_view: 'staff', client_id: null }] };
const directory = { null: [{ user_id: '00000000-0000-4000-8000-00000000a005', display_name: 'Robin Synthetic', kind: 'staff' }] };
// A yjs bundle carries this literal (its double-import warning): a loaded script with it is a loaded yjs chunk.
const yjsMarker = 'Yjs was already imported';
let preview;
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: nexo, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
}
function port() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
async function serve(env) {
  run('npm', ['run', 'build'], { VITE_API_MOCK: '1', VITE_COLLAB_URL: '', ...env });
  const p = await port();
  preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(p), '--strictPort'], { cwd: nexo, stdio: 'ignore' });
  const base = `http://127.0.0.1:${p}`, deadline = Date.now() + 30000;
  while (true) {
    try { const r = await fetch(`${base}/nexo/`); if (r.ok) return base; } catch {}
    if (Date.now() > deadline) throw new Error('preview server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
}
const stop = () => new Promise(resolve => { if (!preview || preview.exitCode !== null) return resolve(); preview.once('exit', resolve); preview.kill(); });
const nodes = page => page.evaluate(() => window.__nexo.store.get().nodes);
const card = (page, id) => page.locator(`.card[data-id="${id}"]`);
async function undo(page) { await page.locator('#viewport').focus(); await page.keyboard.press('Control+z'); }
async function drag(page, id, dx, dy) {
  const box = await card(page, id).locator('header').boundingBox();
  assert(box, 'missing drag target');
  const x = box.x + 40, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up();
}
// A context that records console errors, the scripts it loaded that carry yjs and the intents it sent. `options`: another
// project, the person (`who`: 'staff2' or 'client'), and the context's own options (viewport, touch).
async function open(browser, base, extra = "", { project: board = project, who = 'staff', ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, ...options });
  if (who !== 'staff') await context.addInitScript(w => { try { sessionStorage.setItem('nexo-mock-admin', w); } catch { /* an opaque frame */ } }, who);
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  const errors = [], requests = [], yjs = [], intents = [];
  context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('weberror', e => errors.push(e.error().message));
  context.on('request', r => requests.push(r.url()));
  context.on('response', async r => { if (r.request().resourceType() === 'script' && (await r.text().catch(() => '')).includes(yjsMarker)) yjs.push(r.url()); });
  const page = await context.newPage();
  page.on('websocket', ws => { requests.push(ws.url()); ws.on('framesent', f => { if (String(f.payload).includes('"type":"intent"')) intents.push(f); }); });
  await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}&project=${board}${extra}`);
  await page.waitForSelector('.card');
  return { context, page, errors, requests, yjs, intents };
}
async function journey(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const a = await open(browser, base), b = await open(browser, base, '', { who: 'staff2' });
    for (const page of [a.page, b.page]) await page.waitForFunction(() => window.__nexo.collab);
    const original = await nodes(a.page), [first, second] = original;
    await card(a.page, first.id).locator('.card-title').dblclick();
    const title = card(a.page, first.id).getByRole('textbox', { name: 'Card title' });
    await title.fill('Shared title'); await title.press('Enter');
    await drag(b.page, second.id, 100, 0);
    await b.page.waitForFunction(id => window.__nexo.store.get().nodes.find(n => n.id === id).label === 'Shared title', first.id, { timeout: 5000 }).catch(() => { throw new Error('A rename did not reach B'); });
    await a.page.waitForFunction(([id, x]) => window.__nexo.store.get().nodes.find(n => n.id === id).x === x, [second.id, second.x + 100]);
    console.log(`PASS ${name} rename and move converge`);
    // Presence is exposed as accessible labels so it is usable without relying on styling.
    // UX-B1 (prototype scene 1): each stack starts with "You", then the other person with Lab and role; the hover card
    // offers Follow; B's cursor tag on A's board says Lab.
    for (const page of [a.page, b.page]) {
      await page.locator('.presence-avatar').first().and(page.getByRole('button', { name: /^You, .+, Lab, (Owner|Editor)$/ })).waitFor({ timeout: 5000 });
      assert.equal(await page.getByRole('button', { name: /^Follow .+, Lab, (Owner|Editor)$/ }).count(), 1, 'the stack shows the other person');
    }
    await a.page.getByRole('button', { name: /^Follow / }).hover();
    await a.page.getByRole('tooltip').filter({ hasText: /Lab · (Owner|Editor)On a computerFollow$/ }).waitFor({ timeout: 5000 });
    const view = await b.page.locator('#viewport').boundingBox();
    // Near the centre: zoom keeps the centre fixed, so at 150 % the cursor stays on A's screen.
    await b.page.mouse.move(view.x + view.width / 2 + 60, view.y + view.height / 2 + 60, { steps: 4 });
    const tag = a.page.locator('.presence-cursor').filter({ hasText: /^Blair Synthetic · Lab$/ });
    await tag.waitFor({ timeout: 5000 });
    console.log(`PASS ${name} stacks show You first and the other person; hover card; cursor tag says Lab`);
    // UX review 2: the cursor tag keeps its size on screen at any zoom.
    const tagHeight = async scale => { await a.page.evaluate(s => window.__nexo.handle.zoomTo(s), scale); const label = tag.locator('.presence-tag'); await label.waitFor(); return (await label.boundingBox()).height; };
    const [small, large] = [await tagHeight(0.5), await tagHeight(1.5)];
    assert.ok(Math.abs(small - large) < 1 && small >= 15, `the cursor tag is ${small} px tall at 50 % and ${large} px at 150 %`);
    await a.page.evaluate(() => window.__nexo.handle.zoomTo(1));
    console.log(`PASS ${name} the cursor tag is ${Math.round(small)} px tall at 50 % and at 150 %`);
    await card(a.page, first.id).click();
    await b.page.waitForFunction(id => document.querySelector(`.card[data-id="${id}"]`)?.matches('[data-remote-selected="true"]'), first.id);
    // UX review 2: a remote selection carries the person's name.
    await card(b.page, first.id).locator('.presence-name').filter({ hasText: /^Lab staff$/ }).waitFor({ timeout: 5000 });
    assert.equal(await card(a.page, first.id).locator('.presence-name').count(), 0, 'my own selection has no name tag');
    console.log(`PASS ${name} avatars and remote selection with the person's name`);
    // UX review 2: the editing chip names the field.
    const violin = (await nodes(a.page)).find(n => n.id.includes('plot_violin'));
    await card(a.page, violin.id).locator('header').click();
    await a.page.locator('#inspector').getByRole('tab', { name: 'Data', exact: true }).click();
    await a.page.locator('#inspector').getByRole('searchbox', { name: /^Filter / }).first().click();
    await card(b.page, violin.id).locator('.presence-editing').filter({ hasText: /^Lab staff is editing · Violin lipid$/ }).waitFor({ timeout: 5000 })
      .catch(async () => { throw new Error(`B's editing chip says ${JSON.stringify(await card(b.page, violin.id).locator('.presence-editing').allTextContents())}`); });
    await a.page.locator('#inspector .inspector-head h2').click();
    console.log(`PASS ${name} the editing chip says who and which field`);
    // Prototype scene 1: B's minimap draws A's view as a rectangle that moves when A pans; clicking it follows A.
    const remote = b.page.locator('#minimap rect.remote-view');
    await remote.waitFor({ state: 'attached', timeout: 5000 }).catch(() => { throw new Error("B's minimap does not show A's view"); });
    assert(await b.page.locator('#minimap').isVisible(), "B's minimap is shown while A is on the tab");
    const before = Number(await remote.getAttribute('x'));
    await a.page.mouse.move(960, 540); await a.page.mouse.wheel(400, 0);
    await b.page.waitForFunction(x => Number(document.querySelector('#minimap rect.remote-view')?.getAttribute('x')) > x, before, { timeout: 5000 })
      .catch(() => { throw new Error("A's rectangle did not move on B's minimap when A panned"); });
    await remote.click();
    await b.page.getByRole('status').filter({ hasText: 'Following' }).waitFor({ timeout: 5000 });
    await b.page.getByRole('button', { name: 'Stop following' }).click();
    console.log(`PASS ${name} minimap shows the other person's view and follows on click`);
    await undo(b.page);
    await a.page.waitForFunction(([id, x]) => window.__nexo.store.get().nodes.find(n => n.id === id).x === x, [second.id, second.x]);
    assert.equal((await nodes(b.page)).find(n => n.id === first.id).label, 'Shared title');
    console.log(`PASS ${name} undo is personal`);
    const exported = await Promise.all([a.page, b.page].map(page => page.evaluate(() => window.__nexo.handle.snapshotState())));
    assert.ok(exported[0].tabs.savedActive, 'Team export includes savedActive');
    assert.deepEqual(exported[0], exported[1], 'Team exports agree including savedActive');
    console.log(`PASS ${name} Team exports agree`);
    // UX review 2: A's second tab, on a phone, is A: one avatar per person, A's other tab never offered to follow,
    // and a 390 px top bar shows the others first (one avatar, then +N; vitest covers +N) without widening the page.
    const phone = await open(browser, base, '', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await b.page.waitForFunction(() => document.querySelectorAll('#minimap rect.remote-view').length >= 2, null, { timeout: 5000 })
      .catch(() => { throw new Error("B's minimap does not show both of A's tabs"); });
    await phone.page.getByRole('button', { name: /^Follow Blair Synthetic, Lab, Editor$/ }).waitFor({ timeout: 5000 });
    assert.equal(await b.page.getByRole('button', { name: /^Follow Lab staff/ }).count(), 1, 'A with two tabs appears once on B');
    assert.equal(await a.page.getByRole('button', { name: /^Follow Lab staff/ }).count(), 0, "A's own phone tab is not offered to A");
    assert.equal(await phone.page.locator('.presence-avatar').count(), 1);
    const [width, bar] = await phone.page.evaluate(() => [document.documentElement.scrollWidth, document.querySelector('.topbar')].map(v => typeof v === 'number' ? v : `${v.scrollWidth}/${v.clientWidth}`));
    assert.ok(width <= 390 && +bar.split('/')[0] <= +bar.split('/')[1], `the phone page is ${width} px wide, its top bar ${bar}`);
    await phone.context.close();
    console.log(`PASS ${name} one avatar per person; my other tab is not offered; a 390 px top bar shows the person to follow (page ${width} px, top bar ${bar})`);
    // FIX-PROD-A: Admin's session-token answer names the person (displayName) and the token has no such claim: my avatar's
    // initials and label come from that name, not "LS" / "Lab staff". Screenshot in <tmp>/nexo-fix-prod-a.
    const named = await open(browser, base, '', { who: 'named', viewport: { width: 1440, height: 900 }, ...(name === 'chromium' && { permissions: ['clipboard-write'] }) });
    await named.page.waitForFunction(() => window.__nexo.collab);
    const mine = named.page.locator('.presence-avatar.me');
    await mine.and(named.page.getByRole('button', { name: /^You, Robin Synthetic, Lab\b/ })).waitFor({ timeout: 5000 });
    assert.match(await mine.textContent(), /^RS/, 'my initials come from Admin\'s displayName');
    await mine.hover(); await named.page.getByRole('tooltip').filter({ hasText: /^Robin Synthetic · You/ }).waitFor({ timeout: 5000 });
    fs.mkdirSync(path.join(os.tmpdir(), 'nexo-fix-prod-a'), { recursive: true });
    await named.page.screenshot({ path: path.join(os.tmpdir(), 'nexo-fix-prod-a', `${name}-1440-avatar-display-name.png`) });
    console.log(`PASS ${name} my avatar takes Admin's displayName (RS, Robin Synthetic)`);
    // FIX-PROD-E: the others see that name too (the sidecar asks Admin's nexo_people; the token has no name), not "Lab
    // staff": on B's board the card Robin selects is tagged "Robin Synthetic" and Robin's comment is by Robin Synthetic.
    // Screenshots in <tmp>/nexo-fix-prod-e.
    const shots = path.join(os.tmpdir(), 'nexo-fix-prod-e'); fs.mkdirSync(shots, { recursive: true });
    await b.page.setViewportSize({ width: 1440, height: 900 });
    // A card A has not selected (A's tag on it says "Lab staff": A's token has no name and Admin names nobody for it).
    const mark = original.find(n => n.id !== first.id && n.id !== violin.id);
    await card(named.page, mark.id).locator('header').click({ position: { x: 10, y: 10 } });
    await card(b.page, mark.id).locator('.presence-name').filter({ hasText: /^Robin Synthetic$/ }).waitFor({ timeout: 5000 })
      .catch(async () => { throw new Error(`B's tag on the card Robin selected says ${JSON.stringify(await card(b.page, mark.id).locator('.presence-name').allTextContents())}`); });
    const box = await card(named.page, mark.id).boundingBox();
    await named.page.getByRole('button', { name: 'Comment', exact: true }).click();
    await named.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await named.page.getByRole('textbox', { name: 'New comment' }).fill(`Synthetic note by Robin ${name}`);
    await named.page.getByRole('button', { name: 'Post' }).click();
    const robinPin = b.page.getByRole('button', { name: new RegExp(`^Comment by Robin Synthetic: Synthetic note by Robin ${name}`) });
    await robinPin.waitFor({ state: 'attached', timeout: 5000 })
      .catch(async () => { throw new Error(`B's pins say ${JSON.stringify(await b.page.locator('.comment-pin').evaluateAll(pins => pins.map(p => p.getAttribute('aria-label'))))}`); });
    // B opens the thread from the pin: its author reads Robin Synthetic.
    await robinPin.focus(); await b.page.keyboard.press('Enter');
    await b.page.getByRole('complementary', { name: 'Comments' }).getByText('Robin Synthetic', { exact: true }).waitFor({ timeout: 5000 });
    await b.page.screenshot({ path: path.join(shots, `${name}-1440-others-see-admin-name.png`) });
    console.log(`PASS ${name} B sees Robin's Admin name on the card Robin selected and on Robin's comment`);
    // FIX-PROD-E: Share on this lab-only board says only lab staff can open it, and Copy link says it copied.
    // This build reaches the sidecar on its own port (one origin behind nginx in production): its members answer is
    // passed through with CORS headers.
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    await named.context.route(url => url.pathname.includes('/collab/projects/'), async route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), ...cors } });
    });
    await named.page.keyboard.press('Escape');
    await named.page.locator('.topbar').getByRole('button', { name: 'Share', exact: true }).click();
    const dialog = named.page.getByRole('dialog', { name: /^Share / });
    await dialog.getByText('Lab staff can open this project. Roles decide what each person can change.', { exact: true }).waitFor({ timeout: 5000 })
      .catch(async () => { throw new Error(`Share on the lab-only board says ${JSON.stringify(await dialog.textContent())}`); });
    assert.equal(await dialog.getByText(/this client's members/).count(), 0, 'a lab-only board names a client');
    await dialog.getByRole('button', { name: 'Copy link', exact: true }).click();
    await dialog.getByRole('button', { name: 'Link copied', exact: true }).waitFor({ timeout: 2000 })
      .catch(async () => { throw new Error(`after Copy link the dialog says ${JSON.stringify(await dialog.textContent())}`); });
    await named.page.screenshot({ path: path.join(shots, `${name}-1440-share-lab-only-link-copied.png`) });
    await dialog.getByRole('button', { name: 'Copy link', exact: true }).waitFor({ timeout: 5000 });
    await named.context.close();
    console.log(`PASS ${name} Share on a lab-only board says "Lab staff can open this project." and Copy link says "Link copied"`);
  } finally { await browser.close(); }
}
// UX review 2, groups 4 and 5, on the board in the client's workspace (A lab staff, C the client Editor Dr. Lee, V lab
// staff on a view-only link, P a phone). The sidecar has an engine but no R behind the board (mock build): a science
// intent is refused before R ("engine_not_ready"), and meta.lastChange is written as the sidecar writes it.
async function chrome(pw, name, base, collab) {
  const browser = await pw[name].launch();
  const failed = [];
  const step = async (title, fn) => { try { await fn(); console.log(`PASS ${name} ${title}`); } catch (e) { console.error(`FAIL ${name} ${title}: ${e.message.split('\n')[0]}`); failed.push(title); } };
  try {
    const a = await open(browser, base, '', { project: shared, viewport: { width: 1440, height: 900 } });
    const c = await open(browser, base, '', { project: shared, who: 'client' });
    for (const page of [a.page, c.page]) await page.waitForFunction(() => window.__nexo.collab);
    const violin = (await nodes(a.page)).find(n => /violin/.test(`${n.id} ${n.instance?.source ?? ''}`));
    assert(violin, 'the mock board has a violin card');

    // "Updated by" is drawn on the card for about 10 s, and the veil while it draws again names the person.
    await step("\"Updated by\" is drawn on the card for more than 5 s and the veil names the person", async () => {
      await a.page.evaluate(id => {
        const seen = window.veils = [];
        new MutationObserver(records => { for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) {
          const box = n.matches('.card-skeleton') ? n : n.querySelector('.card-skeleton'); if (box) seen.push(`${box.textContent} ${box.dataset.note ?? ''}`);
        } }).observe(document.querySelector(`.card[data-id="${id}"]`), { subtree: true, childList: true });
      }, violin.id);
      await collab.write(shared, doc => doc.getMap('meta').set('lastChange',
        { nodeId: violin.id, actor: '00000000-0000-4000-8000-00000000a003', displayName: 'Casey Member', kind: 'inputs', revision: Date.now() }));
      const note = card(a.page, violin.id).locator('.card-status').getByText('Updated by Casey Member');
      await note.waitFor({ timeout: 5000 });
      const drawn = async () => ((await note.boundingBox())?.width ?? 0) > 40;
      assert(await drawn(), '"Updated by Casey Member" is drawn on the card, not only read to screen readers');
      // FIX-G11: the note does not squeeze the title: the title shows whole, or keeps at least 40 % of the header.
      const head = await card(a.page, violin.id).evaluate(el => {
        const t = el.querySelector('.card-title'), width = t.getBoundingClientRect().width;
        return { title: width, whole: width * t.scrollWidth / t.clientWidth, header: el.querySelector('header').getBoundingClientRect().width };
      });
      assert(head.title >= Math.min(head.whole - 1, 0.4 * head.header), `the title keeps ${Math.round(head.title)} of ${Math.round(head.whole)} px in a ${Math.round(head.header)} px header while "Updated by" shows`);
      await a.page.screenshot({ path: `/tmp/g45-updated-by-${name}-1440.png` });
      await a.page.waitForTimeout(5000); // the note's duration is the behaviour under test: it used to go after 4 s
      assert(await drawn(), '"Updated by" is still on the card after 5 s');
      assert((await a.page.evaluate(() => window.veils)).some(v => v.includes('Updated by Casey Member')), `the veil names who changed the card: ${JSON.stringify(await a.page.evaluate(() => window.veils))}`);
    });

    // A refused input change: one sentence, no code, and the form goes back to the board's value.
    await step("a refused input change reads as a sentence and the form goes back to the board's value", async () => {
      await card(a.page, violin.id).locator('header').click();
      const inspector = a.page.locator('#inspector');
      await inspector.getByRole('tab', { name: 'Data', exact: true }).click();
      const lipid = inspector.getByRole('listbox', { name: 'Lipid', exact: true });
      const before = (await lipid.getByRole('option', { selected: true }).textContent()).trim();
      const choice = (await lipid.getByRole('option', { selected: false }).first().textContent()).trim();
      await lipid.getByRole('option', { name: choice, exact: true }).click();
      await a.page.getByText('This change was not applied. Try again.').first().waitFor({ timeout: 15000 })
        .catch(() => { throw new Error('no refusal sentence'); });
      assert.equal(await a.page.getByText(/Change not allowed|engine_not_ready/).count(), 0, 'the refusal shows no code');
      await lipid.getByRole('option', { name: before, exact: true, selected: true }).waitFor({ timeout: 10000 })
        .catch(() => { throw new Error(`the form kept the refused value (${choice}) instead of the board's (${before})`); });
      await a.page.screenshot({ path: `/tmp/g45-refused-${name}-1440.png` });
    });

    // A client Editor may not finish a plot (lab only, D2): the sentence says so.
    await step("a client Editor's Finish plot reads \"Only lab staff can finish a plot…\"", async () => {
      const menu = card(c.page, violin.id);
      await menu.locator('header').click();
      await menu.getByRole('button', { name: 'More card actions' }).click();
      await menu.getByRole('button', { name: 'Finish plot' }).click();
      await c.page.getByText('Only lab staff can finish a plot, edit a figure or confirm a baseline.').first().waitFor({ timeout: 20000 })
        .catch(() => { throw new Error('no lab-only sentence'); });
    });

    // View only: the lipid list inside the disabled inspector does not take a click.
    await step("options are inert in the view-only inspector", async () => {
      const v = await open(browser, base, '&mode=view', { project: shared });
      await v.page.waitForFunction(() => window.__nexo.collab);
      await card(v.page, violin.id).locator('header').click();
      await v.page.locator('#inspector').getByRole('tab', { name: 'Data', exact: true }).click();
      const other = v.page.locator('#inspector').getByRole('listbox', { name: 'Lipid', exact: true }).getByRole('option', { selected: false }).first();
      await other.click({ force: true });
      await v.page.waitForTimeout(1000); // nothing to await: an inert option sends nothing
      assert.equal(await other.getAttribute('aria-selected'), 'false', 'a view-only option took the click');
      assert.equal(v.intents.length, 0, 'a view-only page sent an intent');
    });

    // The phone's pill keeps its dot and hides its text (no 24 px circle that reads "L").
    await step("the phone pill keeps its dot", async () => {
      const phone = await open(browser, base, '', { project: shared, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const pill = phone.page.locator('.save-pill');
      await pill.filter({ hasText: 'Live' }).waitFor({ timeout: 15000 });
      const look = await pill.evaluate(el => {
        const range = document.createRange(); range.selectNodeContents(el);
        return { dot: parseFloat(getComputedStyle(el, '::before').width), text: range.getBoundingClientRect().width, label: el.textContent };
      });
      await phone.page.screenshot({ path: `/tmp/g45-phone-pill-${name}-390.png` });
      assert(look.dot >= 6, `the phone pill keeps its dot: ${JSON.stringify(look)}`);
      assert(look.text < 1, `the phone pill hides its text: ${JSON.stringify(look)}`);
      assert.match(look.label, /Live/, 'the pill still names its state for screen readers');
    });
    if (failed.length) throw new Error(`${failed.length} step(s) failed`);
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP F0-5 Playwright: ${e.message}`); return; } throw e; }
  const { fakePostgrest } = await import(path.join(sidecar, 'test/fake-postgrest.mjs'));
  const { fakeR } = await import(path.join(sidecar, 'test/fake-r.mjs'));
  const { openDatabase } = await import(path.join(sidecar, 'src/db.mjs'));
  const { start } = await import(path.join(sidecar, 'src/server.mjs'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-collab-spike-')), dbPath = path.join(dir, 'collab.sqlite');
  const { db } = openDatabase(dbPath);
  db.prepare('INSERT INTO projects (id, workspace) VALUES (?, ?)').run(project, 'nexo-lab-synthetic');
  db.prepare('INSERT INTO projects (id, workspace) VALUES (?, ?)').run(shared, `nexo-client-${client}`);
  db.prepare('INSERT INTO members (project, user_id, role) VALUES (?, ?, ?)').run(shared, '00000000-0000-4000-8000-00000000a002', 'editor');
  db.close();
  const admin = await fakePostgrest(callers, { people: directory }), r = await fakeR();
  let collab;
  try {
    collab = await start({ port: p, dbPath, restUrl: admin.url, anonKey: 'anon-test', apiUrl: r.url, serviceSecret: 'synthetic-service-secret' });
    const collabUrl = `${collab.wsUrl}/collab`;
    run('sh', ['scripts/vendor-plotly.sh']);
    const pw = require(require.resolve('@playwright/test', { paths: [ci] }));
    let base = await serve({ VITE_COLLAB_URL: collabUrl });
    const failures = [];
    for (const name of (process.env.NEXO_BROWSERS || 'chromium,webkit').split(',')) {
      try { await journey(pw, name, base, collab.wsUrl); await chrome(pw, name, base, collab); }
      catch (error) { console.error(`FAIL ${name}: ${error.message}`); failures.push(name); }
    }
    if (failures.length) throw new Error(`Journey failed: ${failures.join(', ')}`);
    console.log('Phase 2 journey OK');
  } finally {
    await stop(); await collab?.close(); await admin.close(); await r.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
