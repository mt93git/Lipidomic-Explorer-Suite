// Phase 4 journey on the real path (docs/integration/nexo-collab-plan.md 5, "Phases 3–7 as cut": versions are sidecar
// rows pointing at checkpoints R stores), with tests/dual-ui/collab-real.cjs. A saves a named version (R saves it from the
// project's session with the service identity; the pill says "Live · saved hh:mm"); B moves a card; A restores the
// version (B's board goes back) and B's move after the restore survives it; Undo on the restore toast brings the
// before-restore snapshot back; B's Activity lists A's save, restore and undo; the version opens in Team (R opens its
// checkpoint with the board's cards).
// UX-B4: A works in the Version history panel the rail clock opens (prototype scene 6); "Current" is the newest named
// save until a restore, then the restored version, so A saves Round 2 after B's move and restores Round 1.
// UX review 2 (scene 6): saving says "Version saved"; a row says "Saved by <name>"; B is told "<A> restored Round 1";
// Undo says "Restore undone".
// Chromium and WebKit. node tests/dual-ui/test_nexo_collab_versions.cjs
'use strict';
const assert = require('node:assert/strict');
const h = require('./collab-real.cjs');

const toast = (page, text) => page.locator('.toast').filter({ hasText: text }).waitFor({ timeout: 30_000 })
  .catch(async e => { throw new Error(`no toast "${text}" (toasts: ${JSON.stringify(await page.locator('.toast').allTextContents())})`); });
const who = calls => JSON.stringify(calls.map(c => ({ service: c.service })));

h.eachBrowser('Phase 4 versions (real path)', async (browser, name) => {
  const { a, b, project, session } = await h.pair(browser);
  const { pca, violin } = h.cards(), prefix = `/api/v1/sessions/${encodeURIComponent(session)}`;
  const original = await h.position(b.page, violin);
  const panel = a.page.getByRole('complementary', { name: 'Version history', exact: true });
  const row = text => panel.locator('article').filter({ hasText: text });
  const current = () => panel.locator('article[aria-current="true"]').textContent();
  const saveVersion = async text => {
    const mark = h.calls().length;
    await panel.getByRole('button', { name: 'Save version…', exact: true }).click();
    await panel.getByLabel('Version name', { exact: true }).fill(text);
    await panel.getByRole('button', { name: 'Save', exact: true }).click();
    const saves = () => h.calls().slice(mark).filter(c => c.method === 'POST' && c.path === `${prefix}/checkpoints`);
    await h.until(async () => saves().length, 30_000, `A's named version ${text} was not saved from the project's session`)
      .catch(async e => { throw new Error(`${e.message} (panel: "${(await panel.getByRole('alert').textContent()).trim()}")`); });
    assert(saves().every(c => c.service), `R saves (service identity): ${who(saves())}`);
    await row(text).waitFor({ timeout: 30_000 });
    await toast(a.page, 'Version saved');
    assert.match(await row(text).textContent(), new RegExp(`Saved by ${h.people.a.displayName} · \\d\\d:\\d\\d`));
  };

  // A opens Version history from the rail clock and saves a named version.
  await a.page.getByRole('button', { name: 'Version history', exact: true }).click();
  await saveVersion('Round 1');
  await a.page.getByText(/Live · saved \d{1,2}:\d{2}/).waitFor({ timeout: 30_000 });
  await h.until(async () => (await current()).includes('Round 1'), 10_000, 'Current is not on the newest named version Round 1');
  console.log(`PASS ${name} A saves a named version through the sidecar`);

  // B moves the violin; A sees it.
  await h.drag(b.page, violin, 200, 0);
  const moved = await h.position(b.page, violin);
  await h.until(async () => (await h.position(a.page, violin)).x === moved.x, 10_000, "B's move did not reach A");

  // A saves Round 2 (now Current), then restores Round 1: B's board goes back to it and Current moves to Round 1.
  await saveVersion('Round 2');
  await h.until(async () => (await current()).includes('Round 2'), 10_000, 'Current is not on the newest named version Round 2');
  await row('Round 1').getByRole('button', { name: 'Restore', exact: true }).click();
  await h.until(async () => (await h.position(b.page, violin)).x === original.x, 60_000, "A's restore did not bring B's board back to the version");
  await h.until(async () => (await current()).includes('Round 1'), 30_000, 'Current did not move to Round 1 after the restore')
    .catch(async e => { throw new Error(`${e.message} (Current: "${await current().catch(() => 'none')}")`); });
  assert.equal(await row('Round 1').getByRole('button', { name: 'Restore', exact: true }).count(), 0, 'the Current row still offers Restore');
  await toast(b.page, `${h.people.a.displayName} restored Round 1`);
  const undo = a.page.locator('.toast').getByRole('button', { name: 'Undo', exact: true });
  await undo.hover(); // the toast stays while hovered
  console.log(`PASS ${name} A restores the version on both boards`);

  // B's move after the restore survives it.
  await h.drag(b.page, pca, 0, 150);
  const later = await h.position(b.page, pca);
  await h.until(async () => (await h.position(a.page, pca)).y === later.y, 10_000, "B's later move did not reach A");
  await h.until(async () => (await h.meta(project))?.engineStatus === 'ready', 60_000, 'the engine did not settle after the restore');
  assert.deepEqual(await h.position(b.page, pca), later, "B's later move did not survive the restore");
  console.log(`PASS ${name} B's move after the restore survives`);

  // Undo restore brings the before-restore snapshot back.
  await undo.click();
  await h.until(async () => (await h.position(b.page, violin)).x === moved.x, 60_000, 'Undo did not bring the before-restore snapshot back');
  await toast(a.page, 'Restore undone');
  console.log(`PASS ${name} Undo restore brings the snapshot back`);

  // B's Activity (under the list in B's Version history panel) shows A's save, restore and undo, newest first.
  await b.page.getByRole('button', { name: 'Version history', exact: true }).click();
  const activity = b.page.getByRole('complementary', { name: 'Version history', exact: true }).getByRole('region', { name: 'Activity', exact: true });
  const said = [`${h.people.a.displayName} restored the safety snapshot`, `${h.people.a.displayName} restored Round 1`,
    `${h.people.a.displayName} named version Round 2`];
  const items = async () => (await activity.getByRole('listitem').allTextContents()).map(t => t.replace(/\s+(now|\d+ min)$/, ''));
  await h.until(async () => JSON.stringify((await items()).slice(0, 3)) === JSON.stringify(said), 10_000, `B's Activity did not list ${JSON.stringify(said)}`)
    .catch(async e => { throw new Error(`${e.message} (it says ${JSON.stringify(await items())})`); });
  await b.page.getByRole('button', { name: 'Close version history', exact: true }).click();
  console.log(`PASS ${name} B's Activity shows A's save, restore and undo`);

  // The version opens in Team.
  const list = await h.api('a', '/checkpoints');
  const version = list.value.find(r => r.name === 'Round 1');
  assert(version, `no Round 1 checkpoint in R: ${JSON.stringify(list.value.map(r => r.name))}`);
  const opened = await h.api('a', '/sessions', { checkpointId: version.id });
  assert.equal(opened.status, 200, `R open of the version: ${JSON.stringify(opened.value)}`);
  assert.deepEqual(opened.value.canvas.nodes.map(n => n.id).sort(), [pca, violin].sort());
  console.log(`PASS ${name} the version opens in Team`);
});
