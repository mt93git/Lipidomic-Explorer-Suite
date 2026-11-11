// Phase 3 journey on the real path (docs/integration/nexo-collab-plan.md 5, "Phases 3–7 as cut": the intent contract),
// with tests/dual-ui/collab-real.cjs. A chooses another lipid in the violin's Data tab: R gets one mutation, sent by the
// sidecar with the service identity and an intent id, and B's card re-renders with A's value and says "Updated by A";
// while A's change is on the project queue B's pill says "Engine busy · 1 queued" (amber), and meta.engineQueue returns to 0.
// While A's Data control has focus, B on the same card sees the soft-lock banner.
// B adds a card (one createCard by the service identity) and A sees it; B parks it (one park) and A sees it go.
// Chromium and WebKit. node tests/dual-ui/test_nexo_collab_inputs.cjs
'use strict';
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const h = require('./collab-real.cjs');
const shots = process.env.NEXO_SHOTS || os.tmpdir();

const instance = id => id.split('-')[0];
const who = calls => JSON.stringify(calls.map(c => ({ service: c.service, intent: c.intent })));

h.eachBrowser('Phase 3 inputs (real path)', async (browser, name) => {
  const { a, b, project, session } = await h.pair(browser);
  const { violin } = h.cards(), prefix = `/api/v1/sessions/${encodeURIComponent(session)}`;
  const since = (mark, method, path) => h.calls().slice(mark).filter(c => c.method === method && c.path === path);

  // A chooses another lipid for the violin.
  await h.card(a.page, violin).locator('header').click();
  const inspector = a.page.locator('#inspector');
  await inspector.getByRole('tab', { name: 'Data', exact: true }).click();
  const lipid = inspector.getByRole('listbox', { name: 'Choose a lipid', exact: true });
  const choice = (await lipid.getByRole('option', { selected: false }).first().textContent()).trim();
  const original = (await lipid.getByRole('option', { selected: true }).textContent()).trim(); // for A's Undo below
  assert.notEqual(original, choice);
  const mark = h.calls().length, rendersB = b.requests.length;
  // Every text and state B's pill takes from here on (the busy state lasts as long as R's answer).
  await b.page.evaluate(() => {
    const seen = window.pillStates = [], record = () => { const pill = document.querySelector('.save-pill'); seen.push(`${pill?.dataset.state} ${pill?.textContent}`); };
    new MutationObserver(record).observe(document.querySelector('.topbar'), { subtree: true, childList: true, characterData: true, attributes: true });
  });
  await lipid.getByRole('option', { name: choice, exact: true }).click();
  const patches = () => since(mark, 'PATCH', `${prefix}/cards/${instance(violin)}`);
  await h.until(async () => patches().length, 30_000, "A's input change did not reach R");
  assert(patches().every(c => c.service && c.intent), `R mutations of the card (service identity and intent): ${who(patches())}`);
  await h.card(b.page, violin).getByText(`Updated by ${h.people.a.displayName}`).waitFor({ timeout: 30_000 });
  await h.until(async () => b.requests.slice(rendersB).some(r => r.status === 200 && r.url.endsWith(`${prefix}/cards/${instance(violin)}/render`)), 30_000, 'B did not re-render the card');
  await h.card(b.page, violin).locator('header').click();
  await b.page.locator('#inspector').getByRole('tab', { name: 'Data', exact: true }).click();
  await b.page.locator('#inspector').getByRole('listbox', { name: 'Choose a lipid', exact: true })
    .getByRole('option', { name: choice, exact: true, selected: true }).waitFor({ timeout: 10_000 });
  assert.equal(patches().length, 1, `R mutations of the card: ${who(patches())}`);
  // A's own change is not announced to A (the client knows its userId from Admin's token answer).
  assert.equal(await h.card(a.page, violin).getByText(/Updated by/).count(), 0, "A's card says Updated by for A's own change");
  console.log(`PASS ${name} A's input lands once through the sidecar and B shows "Updated by ${h.people.a.displayName}"`);
  const states = await b.page.evaluate(() => window.pillStates);
  assert(states.includes('dirty Engine busy · 1 queued'), `B's pill states: ${JSON.stringify(states)}`);
  await b.page.locator('.save-pill').filter({ hasText: /^Live/ }).waitFor({ timeout: 10_000 });
  await h.until(async () => (await h.meta(project))?.engineQueue === 0, 10_000, 'meta.engineQueue did not return to 0');
  console.log(`PASS ${name} B's pill says "Engine busy · 1 queued" while A's change runs, then Live; the queue is back to 0`);
  // After A's change both people's violin cards are drawn, and no card says the plot is behind the board (R sends
  // one X-Nexo-Engine-Revision; two read "3, 3", NaN in meta.engineRevision, and every render was discarded).
  const drawn = async page => await h.card(page, violin).locator('.body').locator('img, .js-plotly-plot').count() > 0;
  await h.until(async () => await drawn(a.page) && await drawn(b.page), 30_000, "A's and B's violin cards are not drawn after A's change");
  for (const [who, page] of [['A', a.page], ['B', b.page]])
    assert.equal(await page.locator('.card').filter({ hasText: 'still behind' }).count(), 0, `${who} has a card that says "still behind"`);
  console.log(`PASS ${name} after A's change both people's violin cards are drawn and no card says "still behind"`);

  // "Undo mine" (product owner, 2026-11-10, UX review 2 question 3): A's Undo, the toolbar's and then Ctrl/Cmd+Z, sends A's
  // previous lipid as a new intent and both boards show it.
  const lipidOnB = b.page.locator('#inspector').getByRole('listbox', { name: 'Choose a lipid', exact: true });
  await lipidOnB.getByRole('option', { name: choice, exact: true, selected: true }).waitFor({ timeout: 10_000 });
  for (const [how, undo] of [['the toolbar', () => a.page.getByRole('button', { name: '↶ Undo', exact: true }).click({ timeout: 10_000 })],
    ['Ctrl/Cmd+Z', () => a.page.keyboard.press('ControlOrMeta+z')]]) {
    if (how !== 'the toolbar') {
      const markRedo = h.calls().length;
      await lipid.getByRole('option', { name: choice, exact: true }).click();
      await h.until(async () => since(markRedo, 'PATCH', `${prefix}/cards/${instance(violin)}`).length, 30_000, "A's lipid change did not reach R");
      await lipidOnB.getByRole('option', { name: choice, exact: true, selected: true }).waitFor({ timeout: 30_000 });
      await h.until(async () => (await h.meta(project))?.engineQueue === 0, 10_000, 'meta.engineQueue did not return to 0');
    }
    const markUndo = h.calls().length, markForm = a.requests.length;
    await undo();
    await h.until(async () => since(markUndo, 'PATCH', `${prefix}/cards/${instance(violin)}`).length, 30_000, `A's Undo (${how}) did not reach R`)
      .catch(async e => { throw new Error(`${e.message} (toasts: ${JSON.stringify(await a.page.locator('.toast').allTextContents())})`); });
    assert(since(markUndo, 'PATCH', `${prefix}/cards/${instance(violin)}`).every(c => c.service && c.intent), "A's Undo is not an intent");
    // A's own open form reloads from the engine once the Undo settles (a click before that lands in the old form).
    await h.until(async () => a.requests.slice(markForm).some(r => r.status === 200 && r.url.endsWith(`${prefix}/cards/${instance(violin)}/schema`)), 30_000, "A's form did not reload after the Undo");
    await lipid.getByRole('option', { name: original, exact: true, selected: true }).waitFor({ timeout: 30_000 });
    await lipidOnB.getByRole('option', { name: original, exact: true, selected: true }).waitFor({ timeout: 30_000 });
    await h.until(async () => (await h.meta(project))?.engineQueue === 0, 10_000, 'meta.engineQueue did not return to 0');
    if (how === 'the toolbar') {
      await a.page.setViewportSize({ width: 1440, height: 900 });
      await a.page.screenshot({ path: path.join(shots, `fix-g10-undo-mine-A-1440-${name}.png`) });
      await a.page.setViewportSize({ width: 1920, height: 1080 });
    }
    console.log(`PASS ${name} A changes the lipid, Undo (${how}) sends A's previous lipid and both boards show it`);
  }

  // UX review 2, group 2: A's open Data tab follows B's change, and A's later changes never put the old lipid back.
  const lipidB = b.page.locator('#inspector').getByRole('listbox', { name: 'Choose a lipid', exact: true });
  const choiceB = (await lipidB.getByRole('option', { selected: false }).filter({ hasNotText: choice }).first().textContent()).trim();
  const markB = h.calls().length;
  await lipidB.getByRole('option', { name: choiceB, exact: true }).click();
  await h.until(async () => since(markB, 'PATCH', `${prefix}/cards/${instance(violin)}`).length, 30_000, "B's lipid change did not reach R");
  await lipid.getByRole('option', { name: choiceB, exact: true, selected: true }).waitFor({ timeout: 10_000 });
  const colorBy = inspector.getByLabel('Color samples by', { exact: true });
  for (const group of ['Group2', 'Group1']) {
    const markA = h.calls().length;
    await colorBy.selectOption(group);
    await h.until(async () => since(markA, 'PATCH', `${prefix}/cards/${instance(violin)}`).length, 30_000, `A's "Color samples by" ${group} did not reach R`);
    await h.until(async () => (await h.meta(project))?.engineQueue === 0, 10_000, 'meta.engineQueue did not return to 0');
  }
  const engine = await h.api('a', `/sessions/${encodeURIComponent(session)}/cards/${instance(violin)}/schema`);
  assert.equal(engine.status, 200, `schema: ${JSON.stringify(engine.value).slice(0, 300)}`);
  assert.equal(engine.value.controls.find(c => c.id === 'violin_lipid')?.value, choiceB, `the engine's lipid after A's two changes (A's old one: ${choice})`);
  await lipid.getByRole('option', { name: choiceB, exact: true, selected: true }).waitFor({ timeout: 10_000 });
  assert.equal(await lipid.getByRole('option', { name: choice, exact: true, selected: true }).count(), 0, "A's form shows A's old lipid again");
  console.log(`PASS ${name} A's open Data tab shows B's lipid; A changes "Color samples by" twice and the lipid stays B's`);

  // Soft lock (prototype scene 2): while A's Data tab control has focus, B selecting the same card sees who is
  // editing it; nothing is locked. The banner goes when A leaves the control.
  const { pca } = h.cards(), banner = b.page.locator('#inspector .editing-banner');
  await h.card(b.page, pca).locator('header').click();
  await inspector.getByRole('searchbox', { name: 'Filter Choose a lipid', exact: true }).click();
  await h.card(b.page, violin).locator('header').click();
  await banner.filter({ hasText: `${h.people.a.displayName} is editing this card · Lab` }).waitFor({ timeout: 10_000 });
  await inspector.locator('.inspector-head h2').click();
  await banner.waitFor({ state: 'detached', timeout: 10_000 });
  console.log(`PASS ${name} while A edits the card's Data, B selecting it sees "${h.people.a.displayName} is editing this card · Lab"; it goes when A leaves`);

  // B adds a card; A sees it.
  const markAdd = h.calls().length;
  const added = await h.addCard(b.page, 'Abundance heatmap');
  const creates = () => since(markAdd, 'POST', `${prefix}/cards`);
  assert(creates().every(c => c.service && c.intent), `R card creations (service identity and intent): ${who(creates())}`);
  await h.card(a.page, added).waitFor({ timeout: 30_000 });
  assert.equal(creates().length, 1, `R card creations: ${who(creates())}`);
  // The card may land off A's screen: A is told, and Show brings it into A's view.
  const toast = a.page.locator('.toast').filter({ hasText: `${h.people.b.displayName} added Abundance heatmap` });
  await toast.waitFor({ timeout: 10_000 });
  await toast.getByRole('button', { name: 'Show', exact: true }).click();
  await h.until(async () => h.card(a.page, added).evaluate(el => {
    const r = el.getBoundingClientRect(), v = document.querySelector('#viewport').getBoundingClientRect();
    return r.left >= v.left && r.right <= v.right && r.top >= v.top && r.bottom <= v.bottom;
  }), 10_000, "Show did not bring B's card into A's view");
  console.log(`PASS ${name} B adds a card through the sidecar; A is told and Show brings it into view`);

  // B parks it; A sees it go.
  const markPark = h.calls().length;
  await h.card(b.page, added).locator('header').click();
  await b.page.keyboard.press('Delete');
  const parks = () => since(markPark, 'DELETE', `${prefix}/cards/${instance(added)}`);
  await h.until(async () => parks().length, 30_000, "B's park did not reach R");
  assert(parks().every(c => c.service && c.intent), `R parks (service identity and intent): ${who(parks())}`);
  await h.until(async () => !(await h.cardIds(a.page)).includes(added), 30_000, "B's park did not reach A");
  assert.equal(parks().length, 1, `R parks: ${who(parks())}`);
  console.log(`PASS ${name} B parks the card through the sidecar and A sees it go`);

  // A saves a version, chooses a third lipid, saves again and restores the first: both open forms show its lipid.
  for (const side of [a, b]) {
    await h.card(side.page, violin).locator('header').click();
    await side.page.locator('#inspector').getByRole('tab', { name: 'Data', exact: true }).click();
  }
  await lipid.getByRole('option', { name: choiceB, exact: true, selected: true }).waitFor({ timeout: 10_000 });
  const versions = a.page.getByRole('complementary', { name: 'Version history', exact: true });
  const saveVersion = async text => {
    await a.page.getByRole('button', { name: 'Version history', exact: true }).click();
    await versions.getByRole('button', { name: 'Save version…', exact: true }).click();
    await versions.getByLabel('Version name', { exact: true }).fill(text);
    await versions.getByRole('button', { name: 'Save', exact: true }).click();
    await versions.locator('article').filter({ hasText: text }).waitFor({ timeout: 30_000 });
  };
  await saveVersion(`Lipid B ${name}`);
  await versions.getByRole('button', { name: 'Close version history', exact: true }).click();
  const choiceC = (await lipid.getByRole('option', { selected: false }).filter({ hasNotText: choice }).first().textContent()).trim();
  const markC = h.calls().length;
  await lipid.getByRole('option', { name: choiceC, exact: true }).click();
  await h.until(async () => since(markC, 'PATCH', `${prefix}/cards/${instance(violin)}`).length, 30_000, "A's third lipid did not reach R");
  await lipidB.getByRole('option', { name: choiceC, exact: true, selected: true }).waitFor({ timeout: 10_000 });
  await saveVersion(`Lipid C ${name}`);
  await versions.locator('article').filter({ hasText: `Lipid B ${name}` }).getByRole('button', { name: 'Restore', exact: true }).click();
  await h.until(async () => (await h.meta(project))?.restoredFrom?.by === h.people.a.userId, 60_000, "A's restore did not land");
  await lipid.getByRole('option', { name: choiceB, exact: true, selected: true }).waitFor({ timeout: 30_000 });
  await lipidB.getByRole('option', { name: choiceB, exact: true, selected: true }).waitFor({ timeout: 30_000 });
  await versions.getByRole('button', { name: 'Close version history', exact: true }).click();
  console.log(`PASS ${name} after A restores a version, A's and B's open Data tabs show the restored lipid`);

  // UX review 2, group 2: B follows A; A's figure page is not shared (as cut, follow adopts camera and tab).
  const camera = page => page.evaluate(() => (/translate\(([-\d.e]+)px,\s*([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(document.querySelector('#world').style.transform) ?? []).slice(1).map(Number));
  const near = (p, q) => p.length === 3 && p.every((v, i) => Math.abs(v - q[i]) < 0.01);
  await b.page.getByRole('button', { name: new RegExp(`^Follow ${h.people.a.displayName}`) }).click();
  await h.until(async () => near(await camera(b.page), await camera(a.page)), 10_000, 'B does not follow A');
  await b.page.evaluate(() => { const world = document.querySelector('#world'), seen = window.cameras = [];
    new MutationObserver(() => seen.push(world.style.transform)).observe(world, { attributes: true, attributeFilter: ['style'] }); });
  const draft = await camera(a.page);
  await a.page.getByRole('button', { name: 'Figure page →', exact: true }).click();
  const figure = await h.until(async () => { const c = await camera(a.page); return near(c, draft) ? undefined : c; }, 10_000, "A's figure page did not move A's camera");
  await a.page.getByRole('button', { name: '← Draft', exact: true }).click();
  await a.page.locator('#viewport').hover({ position: { x: 600, y: 400 } });
  await a.page.mouse.wheel(0, 200);
  await h.until(async () => near(await camera(b.page), await camera(a.page)), 10_000, "B does not follow A's pan in Draft");
  const seen = await b.page.evaluate(() => window.cameras.map(t => (/translate\(([-\d.e]+)px,\s*([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(t) ?? []).slice(1).map(Number)));
  assert(!seen.some(c => near(c, figure)), `B took A's figure page camera ${JSON.stringify(figure)}`);
  console.log(`PASS ${name} B follows A; A's figure page is not shared, A's Draft pan is`);

  // Keyboard: Tab onto a card past the right edge brings it into view, and the browser does not scroll the stage.
  const shown = () => h.card(a.page, violin).evaluate(el => {
    const r = el.getBoundingClientRect(), v = document.querySelector('#viewport').getBoundingClientRect();
    return r.left >= v.left && r.right <= v.right && r.top >= v.top && r.bottom <= v.bottom;
  });
  const edge = await h.card(a.page, violin).evaluate(el => el.getBoundingClientRect().left - document.querySelector('#viewport').getBoundingClientRect().right);
  await a.page.locator('#viewport').hover({ position: { x: 600, y: 400 } });
  await a.page.mouse.wheel(edge + 150, 0); // the violin's left edge 150 px inside the right edge
  await h.until(async () => !(await shown()), 10_000, 'the violin did not reach the right edge of A\'s screen');
  await a.page.locator('#viewport').focus();
  await h.until(async () => { await a.page.keyboard.press('Tab'); return h.card(a.page, violin).evaluate(el => el.contains(document.activeElement)); }, 30_000, 'Tab did not reach the violin');
  await h.until(shown, 10_000, 'Tab onto the violin did not bring it into view');
  const scrolled = await a.page.evaluate(() => [...document.querySelectorAll('.stage, #viewport')].map(e => [e.scrollLeft, e.scrollTop]));
  assert.deepEqual(scrolled, [[0, 0], [0, 0]], 'the browser scrolled the stage (stage, viewport)');
  console.log(`PASS ${name} Tab onto a card past the right edge brings it into view; the stage does not scroll`);

  // A refused join (a client member on a lab project) or a signed-out one says one sentence; no editing tools.
  for (const [who, sentence] of [['client', 'This project is not available to your account.'], ['nobody', 'Sign in to Admin to work on this board.']]) {
    const x = await h.open(browser, who, a.page.url());
    const toast = x.page.locator('.toast').filter({ hasText: sentence });
    await toast.waitFor({ timeout: 30_000 }).catch(async e => { throw new Error(`${e.message} (toasts: ${JSON.stringify(await x.page.locator('.toast').allTextContents())})`); });
    if (who === 'nobody') await toast.getByRole('button', { name: 'Sign in to Admin', exact: true }).waitFor({ timeout: 1000 });
    for (const tool of ['+ Add plot', 'Tidy up']) assert.equal(await x.page.getByRole('button', { name: tool, exact: true }).count(), 0, `${who} still has "${tool}"`);
    await x.context.close();
  }
  console.log(`PASS ${name} a refused or signed-out join says one sentence and shows no editing tools`);
});
