// Phase 1B, Phase 6 as cut (docs/integration/nexo-collab-plan.md 5): follow, summon and comments between two browsers
// through the real sidecar (fake Admin PostgREST), Chromium and WebKit (mock build). A is lab staff (Editor), B a client
// member (Commenter, D8; the mock Admin token's 'client' person). UX-A4: @mentions and 👍 votes in comments.
// UX review 2, scene 3 and the phone pins (group 8): comment mode looks pressed with a hint; a pin on a card moves with
// it, stays above the selected card, has its author's colour and a tooltip and keeps its size on screen; the thread
// names its card (Jump to card), has bordered actions and Reopen; Enter on a pin goes into the thread, Esc goes back to
// the pin; Mentions (N) counts open threads only; on a phone a tap on a pin opens its thread.
// node tests/dual-ui/test_nexo_collab_follow.cjs
'use strict';
const { spawnSync } = require('node:child_process');
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
// One project per browser, in a client's workspace so the members route lists that client's people.
const projects = { chromium: '0a000000-0000-4000-8000-0000000000f5', webkit: '0a000000-0000-4000-8000-0000000000f6' };
const client = 'c0000000-0000-4000-8000-0000000000c1';
// The mock Admin tokens (src/mock/adminToken.ts): lab staff, and with sessionStorage 'nexo-mock-admin' = 'client' a
// client member named Dr. Lee. Synthetic people of the client (admin.nexo_people) for the mention picker.
const callers = { 'mock-admin-token': [{ caller: '00000000-0000-4000-8000-00000000a001', caller_view: 'staff', client_id: null }],
  'eyJhbGciOiJub25lIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMGEwMDIiLCJkaXNwbGF5TmFtZSI6IkRyLiBMZWUifQ.mock-client':
    [{ caller: '00000000-0000-4000-8000-00000000a002', caller_view: 'client', client_id: client }] };
const people = { [client]: [{ user_id: '00000000-0000-4000-8000-00000000a001', display_name: 'Lab staff', kind: 'staff' },
  { user_id: '00000000-0000-4000-8000-00000000a002', display_name: 'Dr. Lee', kind: 'client' },
  { user_id: '00000000-0000-4000-8000-00000000a003', display_name: 'Mia S.', kind: 'client' }] };
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
// The mock build served with /collab proxied to the sidecar, so the board and its members route are same-origin as in
// production (the mention picker fetches the members route).
async function serve(collabHttp) {
  const p = await port();
  run('npm', ['run', 'build'], { VITE_API_MOCK: '1', VITE_COLLAB_URL: `ws://127.0.0.1:${p}/collab` });
  const { preview: start } = await import(path.join(nexo, 'node_modules/vite/dist/node/index.js'));
  preview = await start({ root: nexo, logLevel: 'silent', preview: { host: '127.0.0.1', port: p, strictPort: true,
    proxy: { '/collab': { target: collabHttp, ws: true } } } });
  return `http://127.0.0.1:${p}`;
}
const stop = async () => { await preview?.close(); };
// A context that records console errors and the scripts it loaded that carry yjs.
async function open(browser, base, project, who = 'staff') {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  if (who === 'client') await context.addInitScript(() => { try { sessionStorage.setItem('nexo-mock-admin', 'client'); } catch { /* an opaque frame */ } });
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  const errors = [], requests = [], yjs = [];
  context.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  context.on('weberror', e => errors.push(e.error().message));
  context.on('request', r => requests.push(r.url()));
  context.on('response', async r => { if (r.request().resourceType() === 'script' && (await r.text().catch(() => '')).includes(yjsMarker)) yjs.push(r.url()); });
  const page = await context.newPage();
  page.on('websocket', ws => requests.push(ws.url()));
  await page.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}&project=${project}`);
  await page.waitForSelector('.card');
  return { context, page, errors, requests, yjs };
}
// This page's active tab and camera, read from what it shows.
const view = page => page.evaluate(() => {
  const m = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(document.querySelector('#world').style.transform);
  return { activeTab: document.querySelector('.tablist [role=tab][aria-selected=true]')?.id, camera: { x: +m[1], y: +m[2], scale: +m[3] } };
});
const close = (p, q) => p.activeTab === q.activeTab && ['x', 'y', 'scale'].every(k => Math.abs(p.camera[k] - q.camera[k]) < 0.01);
// Waits until B shows A's tab and camera (awareness travels through the sidecar).
async function matches(a, b, what) {
  const target = await view(a), deadline = Date.now() + 5000;
  let seen;
  while (Date.now() < deadline) { seen = await view(b); if (close(seen, target)) return target; await b.waitForTimeout(25); }
  throw new Error(`${what}: B shows ${JSON.stringify(seen)}, A ${JSON.stringify(target)}`);
}
const following = page => page.getByRole('status').filter({ hasText: /^Following / });
const toast = (page, text) => page.locator('.toast').filter({ hasText: text });
const dismiss = page => page.locator('.toast').getByRole('button', { name: 'Dismiss' }).click().catch(() => {});
async function journey(pw, name, base) {
  const browser = await pw[name].launch();
  try {
    const a = await open(browser, base, projects[name]), b = await open(browser, base, projects[name], 'client');
    for (const page of [a.page, b.page]) await page.waitForFunction(() => window.__nexo.collab);
    const tabs = page => page.locator('.tablist [role=tab]').count(), had = await tabs(b.page);
    await a.page.getByRole('button', { name: 'Add canvas tab' }).click();
    await b.page.waitForFunction(n => document.querySelectorAll('.tablist [role=tab]').length === n, had + 1, { timeout: 5000 })
      .catch(async () => { throw new Error(`B does not see the tab A added (A ${await tabs(a.page)}, B ${await tabs(b.page)})`); });
    const ownTab = (await view(b.page)).activeTab;
    await a.page.getByRole('button', { name: 'Bring everyone here' }).click();
    await following(b.page).filter({ hasText: 'Following Lab staff' }).waitFor({ timeout: 5000 });
    // UX review 2, scene 5: the summoned see who brought them and can stay; the presenter sees that it worked.
    await toast(b.page, 'Lab staff brought everyone here').getByRole('button', { name: 'Stay here' }).waitFor({ timeout: 5000 });
    await a.page.getByRole('status').filter({ hasText: /^1 person is following you$/ }).waitFor({ timeout: 5000 });
    for (const scale of [0.5, 1, 1.5]) {
      await a.page.evaluate(s => window.__nexo.handle.zoomTo(s), scale);
      await matches(a.page, b.page, `zoom ${scale}`);
    }
    assert.notEqual((await view(b.page)).activeTab, ownTab, 'B switched to the tab A is on');
    console.log(`PASS ${name} A summons; B's tab and camera match at 50, 100 and 150 %`);
    const held = await view(b.page), stop = following(b.page).getByRole('button');
    assert.equal(await stop.textContent(), 'Stop following');
    await stop.click();
    await following(b.page).waitFor({ state: 'hidden' });
    await toast(b.page, 'You stopped following Lab staff').waitFor({ timeout: 5000 });
    await a.page.getByRole('status').filter({ hasText: /following you$/ }).waitFor({ state: 'hidden', timeout: 5000 });
    await a.page.evaluate(() => window.__nexo.handle.zoomTo(0.75));
    assert.ok(close(await view(b.page), held), 'B keeps its view after Stop');
    const avatar = b.page.getByRole('button', { name: /^Follow Lab staff/ });
    assert.equal(await avatar.getAttribute('aria-pressed'), 'false');
    await avatar.click();
    await matches(a.page, b.page, 'avatar follow');
    assert.equal(await avatar.getAttribute('aria-pressed'), 'true', 'the followed avatar is pressed');
    await b.page.keyboard.press('Escape');
    await following(b.page).waitFor({ state: 'hidden' });
    assert.equal(await avatar.getAttribute('aria-pressed'), 'false');
    await avatar.click();
    await following(b.page).waitFor({ timeout: 5000 });
    await dismiss(b.page);
    await b.page.locator('#viewport').hover({ position: { x: 600, y: 400 } });
    await b.page.mouse.wheel(0, 200);
    await following(b.page).waitFor({ state: 'hidden' });
    await toast(b.page, 'You stopped following Lab staff').waitFor({ timeout: 5000 });
    await a.page.getByRole('button', { name: 'Bring everyone here' }).click();
    await toast(b.page, 'Lab staff brought everyone here').getByRole('button', { name: 'Stay here' }).click();
    await following(b.page).waitFor({ state: 'hidden' });
    await a.page.evaluate(() => window.__nexo.handle.zoomTo(1.25));
    assert.ok(!close(await view(b.page), await view(a.page)), 'B stays where it is after Stay here');
    console.log(`PASS ${name} B stops following (Stop following, Esc, own zoom, Stay here) with a toast; the followed avatar is pressed`);
    // The rail counts open threads; the Comments panel lists them, opens one, and Reply and Resolve live there.
    await b.page.getByRole('button', { name: 'Comments (0 open)' }).waitFor({ timeout: 5000 });
    // Comment mode shows: the button is pressed and a hint says what to do; Esc leaves it.
    const commentButton = a.page.getByRole('button', { name: 'Comment', exact: true }), hint = a.page.getByText('Click where the comment goes · Esc to cancel');
    await commentButton.click();
    // The button is React state set from the canvas's event: wait for its render instead of reading it at once.
    await a.page.getByRole('button', { name: 'Comment', exact: true, pressed: true }).waitFor({ timeout: 2000 })
      .catch(() => { throw new Error('comment mode: the Comment button looks pressed'); });
    await hint.waitFor({ timeout: 2000 });
    await a.page.keyboard.press('Escape');
    await hint.waitFor({ state: 'hidden', timeout: 2000 });
    await a.page.getByRole('button', { name: 'Comment', exact: true, pressed: false }).waitFor({ timeout: 2000 })
      .catch(() => { throw new Error('Esc leaves comment mode'); });
    console.log(`PASS ${name} comment mode is pressed with its hint; Esc leaves it`);
    // A drops the pin on a card of the first tab (both go back there: A's new tab is empty).
    for (const page of [a.page, b.page]) await page.locator('.tablist [role=tab]').first().click();
    await a.page.evaluate(() => window.__nexo.handle.zoomTo(1));
    const card = a.page.locator('.card:not([hidden])').first(), cardId = await card.getAttribute('data-id'), cardLabel = await card.getAttribute('aria-label');
    const cardBox = await card.boundingBox();
    await commentButton.click();
    await a.page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await a.page.getByRole('textbox', { name: 'New comment' }).fill(`Synthetic note on PCA ${name}`);
    await a.page.getByRole('button', { name: 'Post' }).click();
    const pin = b.page.getByRole('button', { name: new RegExp(`^Comment by Lab staff: Synthetic note on PCA ${name}`) });
    await pin.waitFor({ state: 'attached', timeout: 5000 });
    const aPin = a.page.getByRole('button', { name: new RegExp(`^Comment by Lab staff: Synthetic note on PCA ${name}`) });
    // The pin has its author's colour (A's avatar on B's page) and a tooltip.
    const colours = [await pin.evaluate(el => getComputedStyle(el).backgroundColor),
      await b.page.getByRole('button', { name: /^Follow Lab staff/ }).evaluate(el => getComputedStyle(el).backgroundColor)];
    assert.equal(colours[0], colours[1], `the pin is in its author's colour (pin, A's avatar: ${colours})`);
    assert.equal(await pin.getAttribute('title'), await pin.getAttribute('aria-label'), 'the pin has a tooltip');
    // The pin belongs to its card: moving the card 120 px moves the pin with it.
    const before = await aPin.boundingBox();
    await a.page.evaluate(id => { const n = window.__nexo.handle.getSession().canvas.nodes.find(node => node.id === id); window.__nexo.handle.setCardPosition(id, { x: n.x + 120, y: n.y }); }, cardId);
    await a.page.waitForFunction(([x]) => { const p = [...document.querySelectorAll('.comment-pin')].at(-1)?.getBoundingClientRect(); return p && Math.abs(p.x - x - 120) < 2; }, [before.x], { timeout: 5000 })
      .catch(async () => { throw new Error(`the pin stayed behind its card (before ${JSON.stringify(before)}, after ${JSON.stringify(await aPin.boundingBox())})`); });
    // A selected card does not cover its pins.
    await a.page.locator(`.card[data-id="${cardId}"] header`).click({ position: { x: 10, y: 10 } });
    const on = await aPin.boundingBox(), top = await a.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.comment-pin')?.getAttribute('aria-label') ?? document.elementFromPoint(x, y)?.className, [on.x + on.width / 2, on.y + on.height / 2]);
    assert.match(String(top), /^Comment by Lab staff/, `the pin is above the selected card (found ${top})`);
    // The pin keeps its size on screen at any zoom.
    const sizes = [];
    for (const zoom of [0.5, 1.5]) { await a.page.evaluate(z => window.__nexo.handle.zoomTo(z), zoom); await a.page.waitForTimeout(100); sizes.push((await aPin.boundingBox()).height); }
    assert.ok(Math.abs(sizes[0] - sizes[1]) < 1 && sizes[0] >= 24, `the pin keeps its size on screen, a 24 px target (heights at 50 and 150 %: ${sizes})`);
    console.log(`PASS ${name} a pin on a card moves with it, stays above it when selected, has A's colour and a tooltip, keeps its size`);
    await b.page.getByRole('button', { name: 'Comments (1 open)' }).click();
    const panel = b.page.getByRole('complementary', { name: 'Comments' });
    await panel.getByText(/^1 open · \d+ resolved$/).waitFor({ timeout: 5000 }); // the browser before left a resolved one
    // B's own zoom left the pin off screen: choosing the thread selects its pin and brings it beside the panel.
    await panel.getByRole('button', { name: new RegExp(`Lab staff.*Lab.*Synthetic note on PCA ${name}.*0 replies`) }).click();
    assert.equal(await pin.getAttribute('aria-current'), 'true', 'the chosen thread selects its pin');
    const [box, viewport, side] = [await pin.boundingBox(), await b.page.locator('#viewport').boundingBox(), await panel.boundingBox()];
    assert.ok(box.x >= viewport.x && box.y >= viewport.y && box.x + box.width <= side.x && box.y + box.height <= viewport.y + viewport.height,
      `the pin is in view beside the panel (pin ${JSON.stringify(box)}, viewport ${JSON.stringify(viewport)}, panel x ${side.x})`);
    // The panel sits under the dark top bar: its text must not inherit the bar's white.
    const ink = await panel.evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
    assert.notEqual(ink[0], ink[1], `thread text is readable (${ink})`);
    await panel.getByRole('textbox', { name: 'Reply' }).fill('Synthetic reply');
    await panel.getByRole('button', { name: 'Reply', exact: true }).click();
    await panel.getByText('Synthetic reply').waitFor({ timeout: 5000 });
    // The thread says which card it is on; Jump to card goes there.
    await panel.getByText(`Pinned to ${cardLabel}`).waitFor({ timeout: 5000 });
    const resolveButton = panel.getByRole('button', { name: 'Resolve', exact: true });
    assert.notEqual(await resolveButton.evaluate(el => getComputedStyle(el).borderTopWidth), '0px', 'the thread actions are buttons with a border');
    await resolveButton.click();
    await b.page.getByRole('button', { name: 'Comments (0 open)' }).waitFor({ timeout: 5000 });
    await a.page.getByRole('button', { name: `Comment by Lab staff: Synthetic note on PCA ${name} (resolved, 1 reply)` }).waitFor({ timeout: 5000 });
    console.log(`PASS ${name} A drops a pin; B's rail counts it, B opens it from the Comments panel, replies and resolves; the count drops`);
    // A resolved thread can be reopened.
    await panel.getByRole('button', { name: 'Reopen', exact: true }).click();
    await b.page.getByRole('button', { name: 'Comments (1 open)' }).waitFor({ timeout: 5000 });
    await panel.getByRole('button', { name: 'Jump to card', exact: true }).click();
    assert.equal(await b.page.evaluate(() => document.activeElement?.closest('.card')?.dataset.id), cardId, 'Jump to card focuses the card');
    console.log(`PASS ${name} the thread names its card, Jump to card goes there; Reopen opens a resolved thread again`);
    // Keyboard: Enter on a pin goes into its thread; Esc closes it and goes back to the pin.
    await pin.focus(); await b.page.keyboard.press('Enter');
    await b.page.waitForFunction(() => !!document.activeElement?.closest('.comments-panel'), null, { timeout: 2000 })
      .catch(async () => { throw new Error(`Enter on a pin leaves focus on ${await b.page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))}`); });
    await b.page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden', timeout: 2000 });
    assert.match(await b.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''), /^Comment by Lab staff: Synthetic note on PCA/, 'Esc goes back to the pin');
    await pin.focus(); await b.page.keyboard.press('Enter'); // the thread again, for the steps below
    console.log(`PASS ${name} Enter on a pin goes into its thread; Esc closes it and focus is back on the pin`);
    // UX-A4: A types "@", picks B (Dr. Lee) with the keyboard and posts; B's Mentions (1) shows the thread with the
    // mention highlighted; B votes 👍 and A sees 1 on the thread row and on the pin.
    await a.page.getByRole('button', { name: 'Comment', exact: true }).click();
    await a.page.locator('#viewport').click({ position: { x: 420, y: 260 } });
    const composer = a.page.getByRole('textbox', { name: 'New comment' }), picker = a.page.getByRole('listbox', { name: 'Mention someone' });
    await composer.pressSequentially('Synthetic panel C? @');
    const options = async () => picker.getByRole('option').evaluateAll(list => list.map(o => `${o.getAttribute('aria-selected')} ${o.textContent}`));
    await picker.waitFor({ timeout: 5000 });
    assert.deepEqual(await options(), ['true DLDr. Lee Client', 'false MSMia S. Client'], 'the picker lists the people who can see the project, not me');
    await composer.press('ArrowDown'); assert.deepEqual(await options(), ['false DLDr. Lee Client', 'true MSMia S. Client']);
    await composer.press('ArrowUp'); await composer.press('Escape');
    await picker.waitFor({ state: 'hidden' });
    await composer.pressSequentially('d');
    assert.deepEqual(await options(), ['true DLDr. Lee Client'], 'typing filters the picker');
    await composer.press('Enter');
    assert.equal(await composer.inputValue(), 'Synthetic panel C? @Dr. Lee ');
    await a.page.getByRole('button', { name: 'Post' }).click();
    const bPanel = b.page.getByRole('complementary', { name: 'Comments' });
    await bPanel.getByRole('button', { name: '← All comments' }).click();
    await bPanel.getByRole('button', { name: 'Mentions (1)' }).click();
    const mentionRow = bPanel.getByRole('button', { name: /Synthetic panel C\? @Dr\. Lee/ });
    await mentionRow.waitFor({ timeout: 5000 });
    assert.equal(await bPanel.getByText(`Synthetic note on PCA ${name}`).count(), 0, 'Mentions lists only threads that mention B');
    await mentionRow.click();
    await bPanel.locator('.mention', { hasText: '@Dr. Lee' }).waitFor({ timeout: 5000 });
    await bPanel.getByRole('button', { name: '👍 0' }).click();
    assert.equal(await bPanel.getByRole('button', { name: '👍 1' }).getAttribute('aria-pressed'), 'true');
    // The panel sits in the top bar: a hovered, pressed button stays readable (not the bar's accent hover).
    const thumb = bPanel.getByRole('button', { name: '👍 1' }); await thumb.hover();
    const hovered = await thumb.evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
    assert.notEqual(hovered[0], hovered[1], `the hovered 👍 is readable (${hovered})`);
    const aPanel = a.page.getByRole('complementary', { name: 'Comments' });
    await aPanel.getByRole('button', { name: '← All comments' }).click();
    await aPanel.getByRole('button', { name: /Synthetic panel C\?.*0 replies · 👍 1/ }).waitFor({ timeout: 5000 });
    await a.page.getByRole('button', { name: /^Comment by Lab staff: Synthetic panel C\? @Dr\. Lee \(0 replies, 1 vote\)$/ }).waitFor({ timeout: 5000 });
    console.log(`PASS ${name} A mentions B from the @ picker (keyboard); B's Mentions (1) shows it highlighted; B's 👍 shows 1 on A's row and pin`);
    // Mentions (N) counts open threads only: B resolves the thread that mentions them.
    await bPanel.getByRole('button', { name: 'Resolve', exact: true }).click();
    await bPanel.getByRole('button', { name: '← All comments' }).click();
    await bPanel.getByRole('button', { name: 'Mentions (0)' }).waitFor({ timeout: 5000 });
    console.log(`PASS ${name} Mentions (N) counts open threads only`);
    // On a phone (390 px, touch) a tap on a pin opens its thread.
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      await phone.addInitScript(() => { try { sessionStorage.setItem('nexo-mock-admin', 'client'); } catch { /* an opaque frame */ } });
      await phone.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
      const p = await phone.newPage();
      await p.goto(`${base}/nexo/?checkpoint=${encodeURIComponent(checkpoint)}&project=${projects[name]}`);
      const phonePin = p.getByRole('button', { name: new RegExp(`^Comment by Lab staff: Synthetic note on PCA ${name}`) });
      await phonePin.waitFor({ timeout: 10_000 });
      const size = await phonePin.boundingBox();
      assert.ok(size.width >= 24 && size.height >= 24, `the phone pin is a 24 px target (${JSON.stringify(size)})`);
      await phonePin.tap();
      await p.getByRole('complementary', { name: 'Comments' }).getByText(`Synthetic note on PCA ${name}`).waitFor({ timeout: 5000 });
    } finally { await phone.close(); }
    console.log(`PASS ${name} on a phone a tap on a pin opens its thread`);
    for (const page of [a.page, b.page]) {
      const exported = JSON.stringify(await page.evaluate(() => window.__nexo.handle.snapshotState()));
      assert.doesNotMatch(exported, /Synthetic note|Synthetic reply|Synthetic panel|comments/, 'comments stay out of the Team export');
    }
    console.log(`PASS ${name} comments never enter the export`);
    for (const { errors } of [a, b]) assert.deepEqual(errors, [], 'no console errors');
  } finally { await browser.close(); }
}
(async () => {
  let p;
  try { p = await port(); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { console.log(`SKIP F0-5 Playwright: ${e.message}`); return; } throw e; }
  const { fakePostgrest } = await import(path.join(sidecar, 'test/fake-postgrest.mjs'));
  const { openDatabase } = await import(path.join(sidecar, 'src/db.mjs'));
  const { start } = await import(path.join(sidecar, 'src/server.mjs'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-collab-follow-')), dbPath = path.join(dir, 'collab.sqlite');
  const { db } = openDatabase(dbPath);
  for (const project of Object.values(projects)) db.prepare('INSERT INTO projects (id, workspace) VALUES (?, ?)').run(project, `nexo-client-${client}`);
  db.close();
  const admin = await fakePostgrest(callers, { people });
  let collab;
  try {
    collab = await start({ port: p, dbPath, restUrl: admin.url, anonKey: 'anon-test' });
    run('sh', ['scripts/vendor-plotly.sh']);
    const pw = require(require.resolve('@playwright/test', { paths: [ci] }));
    const base = await serve(collab.httpUrl);
    const failures = [];
    for (const name of ['chromium', 'webkit']) {
      try { await journey(pw, name, base, collab.wsUrl); }
      catch (error) { console.error(`FAIL ${name}: ${error.message}`); failures.push(name); }
    }
    if (failures.length) throw new Error(`Journey failed: ${failures.join(', ')}`);
    console.log('Phase 6 journey OK');
  } finally {
    await stop(); await collab?.close(); await admin.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
