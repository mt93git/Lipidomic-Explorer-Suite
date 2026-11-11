// Phase 2 on the real path (docs/integration/nexo-collab-plan.md 5, "Phases 3–7 as cut", Proof): R API, sidecar, fake
// Admin PostgREST and a built client (tests/dual-ui/collab-real.cjs). Two lab staff open the fixture checkpoint: the
// first open creates the project, the second joins its link; both render the cards on the sidecar's session, a rename
// reaches the other page and R holds one leased collab session.
// Then a shared project with a client (product owner, 2026-11-10: it lives in the client's workspace; UX review 2 group 6): lab
// staff A open the client's dataset, the project lands in that client's workspace and the client member joins the same
// board from Admin's bare dataset link (FIX-G12) and from the project link (FIX-G10), without being asked to prepare
// the dataset again; A's Share names the project, marks A's own row "(you)" and lists the client member; a role change
// reaches the member across the reload it causes (again without preparing). ENTRY-8: lab staff A exclude a sample on
// the board (the sidecar's PUT decisions, as BoardNotice sends it); R prepares the board again with Team's
// outlierTreatments, one sample fewer, the settings record who excluded it, and the client member's page follows the
// new session. ENTRY-INT-2: before that, lab staff A keep an undecided sample from the banner in the real app and the
// client member's banner goes away. FIX-JOINER-PNG: a png card lab staff add before the client member opens the bare link is
// drawn as an image for the member too. FIX-JOINER-PHONE: on a phone (390 px) the bare-link member's board opens fitted
// to its cards (and fits again when a page opened wide is narrowed to one), the Live dot is the connected colour and the
// band keeps the dataset summary. Screenshots at 1440 px (one at 390) in NEXO_SHOTS (default <tmp>), never committed.
// Chromium and WebKit.
// node tests/dual-ui/test_nexo_collab_real.cjs
'use strict';
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const h = require('./collab-real.cjs');
const shots = process.env.NEXO_SHOTS || os.tmpdir();

h.eachBrowser('Phase 2 real path', async (browser, name) => {
  const a = await h.open(browser, 'a');
  const project = await h.until(async () => h.projectOf(a.page), 30_000, 'the first open did not add &project= to the URL');
  console.log(`PASS ${name} first open creates the project`);
  const b = await h.open(browser, 'b', a.page.url());
  assert.equal(h.projectOf(b.page), project);
  console.log(`PASS ${name} second person opens the project link`);

  const session = await h.until(async () => (await h.meta(project))?.session?.id, 60_000, 'the sidecar did not write meta.session');
  const renders = side => side.requests.filter(r => r.method === 'POST' &&
    r.url.includes(`/api/v1/sessions/${encodeURIComponent(session)}/`) && r.url.endsWith('/render')).map(r => r.status);
  const rendered = side => renders(side).includes(200);
  const first = h.cards().pca;
  await h.until(async () => rendered(a) && rendered(b), 60_000, `both pages did not render on the sidecar's session (render statuses A [${renders(a)}], B [${renders(b)}])`);
  console.log(`PASS ${name} both pages render on the sidecar's session`);

  await h.rename(a.page, first, 'Shared real title');
  await h.until(async () => (await h.titleOf(b.page, first)) === 'Shared real title', 10_000, 'A rename did not reach B');
  console.log(`PASS ${name} rename by A reaches B`);

  const health = await h.health();
  assert.equal(health.leases, 1, `R leases: ${JSON.stringify(health)}`);
  console.log(`PASS ${name} R holds one leased collab session`);
  await a.context.close(); await b.context.close();

  const lab = await h.open(browser, 'a', h.datasetUrl(), { design: { unit: 'Animal', type: 'independent' } });
  const shared = await h.until(async () => h.projectOf(lab.page), 60_000, 'the dataset open did not add &project= to the URL');
  assert.equal((await h.meta(shared)).workspace, h.clientWorkspace);
  console.log(`PASS ${name} lab staff open a client dataset into the client's workspace`);
  // ENTRY-INT step 3: the design confirmed on Prepare is in the project's settings and the sidecar's own session has it.
  const board = await h.until(async () => { const m = await h.meta(shared); return m?.session && m; }, 60_000, 'the sidecar did not open the board session');
  assert.deepEqual(board.origin.settings.design, { unit: 'Animal', type: 'independent', confirmed: true });
  const boardJoin = await h.api('a', `/sessions/${encodeURIComponent(board.session.id)}/join`);
  assert.equal(boardJoin.status, 200, JSON.stringify(boardJoin.value));
  assert.deepEqual([boardJoin.value.design?.unit, boardJoin.value.design?.type, boardJoin.value.design?.confirmed], ['Animal', 'independent', true]);
  console.log(`PASS ${name} the board session the sidecar opened has the design confirmed on Prepare`);
  // FIX-JOINER-PNG: a card Team draws as an image (native png), added by lab staff from the library, is drawn as an image
  // for a later opener too (it was a red "supports native png rendering; requested json" there).
  // The library opens on the Dashboard group: the search shows the Quality check tile.
  await lab.page.getByRole('button', { name: '+ Add plot', exact: true }).click();
  await lab.page.locator('.library-search').fill('PCA scores · 2D');
  const png = await h.addCard(lab.page, 'PCA scores · 2D');
  const drawnAsImage = async (page, who) => {
    const body = h.card(page, png).locator('.body');
    await h.until(async () => await body.locator('img').count() || /supports native/.test(await body.textContent()), 60_000, `${who}: PCA scores · 2D was not drawn`);
    assert.doesNotMatch(await body.textContent(), /supports native/, `${who}: PCA scores · 2D is an error`);
  };
  await drawnAsImage(lab.page, 'lab staff A');
  // FIX-G12: the client member opens Admin's bare link (no project): same board, no Prepare page.
  const bare = await h.open(browser, 'client', h.datasetUrl(), { joins: true });
  await bare.page.getByText('You can comment', { exact: true }).waitFor({ timeout: 30_000 });
  assert.equal(h.projectOf(bare.page), shared);
  await drawnAsImage(bare.page, 'the client member');
  // FIX-JOINER-PHONE: opened wide, then narrowed to a phone: the board fits again (it kept the desktop fit's 100 % with
  // the card off-screen to the right).
  const inView = (page, id) => page.evaluate(id => {
    const view = document.querySelector('#viewport').getBoundingClientRect(), card = document.querySelector(`.card[data-id="${id}"]`).getBoundingClientRect();
    return card.left >= view.left - 1 && card.right <= view.right + 1 && card.top >= view.top - 1 && card.bottom <= view.bottom + 1;
  }, id);
  await bare.page.setViewportSize({ width: 390, height: 844 });
  await h.until(() => inView(bare.page, png), 10_000, "opened wide then narrowed to a phone, the board did not fit again");
  assert.equal(await bare.page.getByRole('button', { name: 'Prepare and check' }).count(), 0);
  assert.equal(bare.requests.filter(r => r.method === 'POST' && new URL(r.url).pathname.endsWith('/collab/projects')).length, 0);
  await bare.page.setViewportSize({ width: 1440, height: 900 });
  await bare.page.screenshot({ path: path.join(shots, `fix-g12-bare-link-C-1440-${name}.png`) });
  await bare.context.close();
  console.log(`PASS ${name} the client member joins the same board from the bare Admin link without preparing it`);
  console.log(`PASS ${name} a png card lab staff added is drawn as an image for the client member who opens the board later`);
  // FIX-JOINER-PHONE: the same bare link on a phone (390 px). The board opens fitted to its cards (the PCA card is in
  // view, not off-screen at 100 %), the connected and synced board's Live dot is the connected colour, and the band
  // keeps the dataset summary before "You can comment".
  const phone = await h.open(browser, 'client', h.datasetUrl(), { joins: true, viewport: { width: 390, height: 844 } });
  await phone.page.getByText('You can comment', { exact: true }).waitFor({ timeout: 30_000 });
  await drawnAsImage(phone.page, 'the client member on a phone');
  await h.until(() => inView(phone.page, png), 10_000, "the client member's phone board did not open fitted");
  await h.until(async () => /^Live/.test(await phone.page.locator('.save-pill').textContent()), 30_000, 'the phone board is not Live');
  const dot = await phone.page.evaluate(() => {
    const probe = document.body.appendChild(Object.assign(document.createElement('i'), { style: 'background:var(--green)' }));
    const colours = [getComputedStyle(document.querySelector('.save-pill'), '::before').backgroundColor, getComputedStyle(probe).backgroundColor];
    probe.remove(); return colours;
  });
  assert.equal(dot[0], dot[1], `the Live dot is ${dot[0]}, not the connected colour ${dot[1]}`);
  const summary = phone.page.locator('.status-band .dataset-summary');
  assert.match(await summary.textContent(), /^\d+ lipids · \d+ samples$/);
  assert(await summary.isVisible(), 'the phone band hides the dataset summary');
  const band = await phone.page.locator('.status-band').evaluate(el => [el.scrollWidth <= el.clientWidth, el.textContent]);
  assert(band[0], `the phone band overflows: ${band[1]}`);
  await phone.page.screenshot({ path: path.join(shots, `fix-joiner-phone-C-390-${name}.png`) });
  await phone.context.close();
  console.log(`PASS ${name} on a phone the bare-link commenter's board opens fitted, Live in the connected colour, with the dataset summary`);
  const member = await h.open(browser, 'client', lab.page.url());
  await member.page.getByText('You can comment', { exact: true }).waitFor({ timeout: 30_000 });
  assert.equal(h.projectOf(member.page), shared);
  await member.page.setViewportSize({ width: 1440, height: 900 });
  await member.page.screenshot({ path: path.join(shots, `fix-g10-dataset-join-C-1440-${name}.png`) });
  console.log(`PASS ${name} the client member joins the same board from the dataset project link without preparing it`);

  // The sidecar's PUT decisions from `page` with its person's Admin token, as BoardNotice sends it; answers the status.
  const decide = (page, decision) => page.evaluate(async ({ project, decision }) => {
    const { accessToken } = await (await fetch('/admin/api/session-token')).json();
    return (await fetch(`/collab/projects/${encodeURIComponent(project)}/decisions`, { method: 'PUT', body: JSON.stringify(decision),
      headers: { 'Content-Type': 'application/json', 'X-Nexo-Admin-Token': accessToken } })).status;
  }, { project: shared, decision });
  // ENTRY-INT-2: an undecided flagged sample is a banner on everyone's board; lab staff A keep it in the real app (the
  // banner's Review, then Keep in the card) and the client member's banner goes away without a reload. The fixture's
  // quality check need not flag a sample, so one is first marked undecided as the quality check marks it.
  const flaggedNow = (await h.meta(shared)).origin.settings;
  if (!flaggedNow.outlierDecisions?.some(d => d.choice === 'undecided')) assert.equal(await decide(lab.page, { sample: flaggedNow.samples[0], choice: 'undecided' }), 200);
  await member.page.locator('.notice-banner').waitFor({ timeout: 30_000 });
  await lab.page.locator('.notice-banner').getByRole('button', { name: 'Review', exact: true }).click({ timeout: 30_000 });
  const card = lab.page.locator('.notice-card');
  assert.match(await card.locator('h2').textContent(), /^Prepared by \S/);
  for (let keep = card.getByRole('button', { name: /^Keep / }); await keep.count(); keep = card.getByRole('button', { name: /^Keep / })) {
    const sample = (await keep.first().textContent()).replace(/^Keep /, '');
    await keep.first().click();
    await h.until(async () => (await h.meta(shared)).origin.settings.outlierDecisions.some(d => d.sample === sample && d.choice === 'keep'), 30_000, `Keep ${sample} did not reach the settings`);
    // The card follows the settings it is sent back: count the next Keep only once this one has gone.
    await card.getByRole('button', { name: `Keep ${sample}`, exact: true }).waitFor({ state: 'detached', timeout: 30_000 });
  }
  await member.page.locator('.notice-banner').waitFor({ state: 'detached', timeout: 30_000 });
  assert.equal(await lab.page.locator('.notice-banner').count(), 0);
  await member.page.screenshot({ path: path.join(shots, `entry-int-2-kept-C-1440-${name}.png`) });
  console.log(`PASS ${name} lab staff keep a flagged sample on the board and the client member's banner goes away`);

  const before = await h.until(async () => { const m = await h.meta(shared); return m?.session?.id && m; }, 60_000, 'the shared board has no session');
  const sample = before.origin.settings.samples.at(-1), joined = async id => (await h.api('client', `/sessions/${encodeURIComponent(id)}/join`)).value.samples;
  const count = await joined(before.session.id);
  const status = await decide(lab.page, { sample, choice: 'exclude', reason: 'synthetic check' });
  assert.equal(status, 200, 'the board decision was refused');
  const after = await h.until(async () => { const m = await h.meta(shared); return m?.session?.id !== before.session.id && m.origin.settings.outlierTreatments && m; },
    120_000, 'R did not prepare the board again');
  assert.deepEqual(after.origin.settings.outlierTreatments, { [sample]: 'remove' });
  const row = after.origin.settings.outlierDecisions.find(d => d.sample === sample);
  assert.deepEqual([row.choice, row.reason, row.displayName], ['exclude', 'synthetic check', 'Alex Synthetic']);
  assert.equal(await joined(after.session.id), count - 1, 'the prepared session does not have one sample fewer');
  await h.until(async () => member.requests.some(r => r.status === 200 && r.url.includes(`/api/v1/sessions/${encodeURIComponent(after.session.id)}/join`)),
    60_000, "the client member's page did not follow the new session");
  console.log(`PASS ${name} lab staff exclude a sample on the board: R prepares it again without it and the member follows`);

  await lab.page.setViewportSize({ width: 1440, height: 900 });
  await lab.page.locator('.topbar .presence-stack').waitFor();
  assert(await lab.page.evaluate(() => {
    const share = [...document.querySelectorAll('.topbar > button')].find(button => button.textContent === 'Share');
    return !!(document.querySelector('.topbar .presence-stack').compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), 'Share does not come after the avatars');
  await lab.page.locator('.topbar').getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = lab.page.getByRole('dialog', { name: /^Share ./ });
  await dialog.getByText('Alex Synthetic (you)', { exact: true }).waitFor({ timeout: 30_000 });
  await dialog.getByRole('combobox', { name: 'Add Casey Member as', exact: true }).waitFor();
  assert.equal(await dialog.getByRole('combobox', { name: 'Role for Alex Synthetic' }).count(), 0, 'my own row is not locked');
  assert.equal(await lab.page.evaluate(() => document.activeElement?.textContent), 'Copy link');
  await dialog.getByText('Not listed? Add the person as a client member in Admin first.', { exact: true }).waitFor();
  await lab.page.screenshot({ path: path.join(shots, `fix-g6-share-A-1440-${name}.png`) });
  console.log(`PASS ${name} Share names the project, marks my row and lists the client member`);

  // Commenter → Editor switches editing on: the member's page reloads and says the new role; then Viewer.
  await member.page.setViewportSize({ width: 1440, height: 900 });
  for (const [role, label] of [['editor', 'Editor'], ['viewer', 'Viewer']]) {
    const reloaded = member.page.waitForEvent('load', { timeout: 30_000 });
    const select = role === 'editor' ? dialog.getByRole('combobox', { name: 'Add Casey Member as', exact: true })
      : dialog.getByRole('combobox', { name: 'Role for Casey Member', exact: true });
    await select.selectOption(role);
    await reloaded;
    await member.page.locator('.toast', { hasText: `Your role on this project is now ${label}.` }).waitFor({ timeout: 60_000 });
  }
  await member.page.getByText('View only — ask the owner for edit access', { exact: true }).waitFor();
  await member.page.screenshot({ path: path.join(shots, `fix-g6-role-C-1440-${name}.png`) });
  console.log(`PASS ${name} a role change reaches the member across the reload`);
});
