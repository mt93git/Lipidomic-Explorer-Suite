// ENTRY-8: a flagged sample is decided on the shared board (PUT <path>/projects/<id>/decisions). Team's model: the
// preparation setting outlierTreatments (sample → "remove"); the board keeps settings.outlierDecisions for the record.
// Fake Admin and fake R at the HTTP edge; the project's document is an in-memory Y.Doc the engine has open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { fakePostgrest } from './fake-postgrest.mjs';
import { fakeR } from './fake-r.mjs';
import { openDatabase } from '../src/db.mjs';
import { createAuth } from '../src/auth.mjs';
import { createRoles } from '../src/roles.mjs';
import { createEngine } from '../src/engine.mjs';
import { createProjects } from '../src/projects.mjs';
import { start } from '../src/server.mjs';

const client = 'aaaaaaaa-0000-4000-8000-00000000000a';
const workspace = `nexo-client-${client}`;
const named = (who, displayName) => `${who}.${Buffer.from(JSON.stringify({ displayName })).toString('base64url')}.signature`;
const ana = named('ana', 'Ana R.'), editor = named('editor', 'Lee M.');
const tokens = { [ana]: [{ caller: 'ana-id', caller_view: 'staff', members_prepare: null }],
  [editor]: [{ caller: 'editor-id', caller_view: 'client', client_id: client, members_prepare: true }],
  disabled: [{ caller: 'disabled-id', caller_view: 'client', client_id: client, members_prepare: false }] };
const samples = ['Control_1', 'Control_2', 'Treated_1', 'Treated_3'];
const settings = { samples, normalizationMethod: 'median', outlierDecisions: [{ sample: 'Treated_3', choice: 'undecided' }] };
const opens = r => r.calls.filter(c => c.path === '/api/v1/datasets/sessions');

async function setup(t) {
  const admin = await fakePostgrest(tokens);
  const r = await fakeR();
  const { db } = openDatabase(':memory:');
  const auth = createAuth({ restUrl: admin.url, anonKey: 'test', db });
  const roles = createRoles(db);
  const engine = createEngine({ apiUrl: r.url, secret: 'synthetic-secret' });
  db.prepare('INSERT INTO projects (id, workspace, origin_kind, origin_id, created_by) VALUES (?, ?, ?, ?, ?)')
    .run('project', workspace, 'dataset', 'synthetic-dataset', 'ana-id');
  const doc = new Y.Doc();
  doc.transact(() => {
    for (const [key, value] of Object.entries({ project: 'project', workspace, origin: { adminDatasetId: 'synthetic-dataset', settings } })) doc.getMap('meta').set(key, value);
    doc.getMap('nodes').set('n1', new Y.Map([['statistics', { version: '1', applied: { test: 't' }, result: { p: 0.1 } }]]));
  }, 'server');
  const origins = [];
  doc.on('afterTransaction', tx => origins.push(tx.origin));
  const handler = createProjects({ db, auth, roles, restUrl: admin.url, anonKey: 'test', engine, edit: (id, fn) => fn(doc) });
  const http = createServer((request, response) => handler(request, response, request.url.replace(/^\/collab\/projects\/?/, '')));
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  t.after(async () => { engine.close(); await new Promise(resolve => http.close(resolve)); await r.close(); await admin.close(); db.close(); });
  await engine.connect(doc, 'ana-id');
  const decide = async (body, token = ana) => {
    const response = await fetch(`http://127.0.0.1:${http.address().port}/collab/projects/project/decisions`, { method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Nexo-Admin-Token': token }, body: JSON.stringify(body) });
    return { status: response.status, value: await response.json() };
  };
  const current = () => doc.getMap('meta').get('origin').settings;
  return { r, doc, roles, origins, decide, current };
}

test('lab staff excludes a sample: R re-opens once with it removed', async t => {
  const { r, decide } = await setup(t);
  const before = opens(r).length;
  assert.equal((await decide({ sample: 'Treated_3', choice: 'exclude', reason: 'failed injection' })).status, 200);
  assert.equal(opens(r).length, before + 1);
  assert.deepEqual(opens(r).at(-1).body.settings.outlierTreatments, { Treated_3: 'remove' });
  assert.deepEqual(opens(r).at(-1).body.settings.samples, samples);
});

test('the decision is written into the settings with origin server', async t => {
  const { decide, current, origins } = await setup(t);
  origins.length = 0;
  await decide({ sample: 'Treated_3', choice: 'exclude', reason: 'failed injection' });
  assert.deepEqual(current().outlierTreatments, { Treated_3: 'remove' });
  const [row] = current().outlierDecisions;
  assert.equal(current().outlierDecisions.length, 1);
  assert.equal(typeof row.at, 'number');
  assert.deepEqual({ ...row, at: 0 }, { sample: 'Treated_3', choice: 'exclude', reason: 'failed injection', by: 'ana-id', displayName: 'Ana R.', at: 0 });
  assert.ok(origins.length && origins.every(origin => origin === 'server'));
});

test('the new session replaces the old one, which is released', async t => {
  const { r, doc, decide } = await setup(t);
  const old = doc.getMap('meta').get('session').id;
  await decide({ sample: 'Treated_3', choice: 'exclude' });
  assert.notEqual(doc.getMap('meta').get('session').id, old);
  assert.ok(r.calls.some(c => c.path === `/api/v1/sessions/${old}/lease` && c.body.connections === 0));
});

test('an exclusion clears applied statistics on every card', async t => {
  const { doc, decide } = await setup(t);
  await decide({ sample: 'Treated_3', choice: 'exclude' });
  assert.equal(doc.getMap('nodes').get('n1').get('statistics').applied, null);
});

test('keep records the decision without re-opening R', async t => {
  const { r, doc, decide, current } = await setup(t);
  const before = opens(r).length;
  assert.equal((await decide({ sample: 'Treated_3', choice: 'keep' })).status, 200);
  assert.equal(opens(r).length, before);
  assert.equal(current().outlierTreatments, undefined);
  assert.equal(current().outlierDecisions[0].choice, 'keep');
  assert.ok(doc.getMap('nodes').get('n1').get('statistics').applied);
});

test('undo of a kept sample makes it undecided again', async t => {
  const { r, decide, current } = await setup(t);
  const before = opens(r).length;
  await decide({ sample: 'Treated_3', choice: 'keep' });
  await decide({ sample: 'Treated_3', choice: 'undecided' });
  assert.equal(opens(r).length, before);
  assert.deepEqual(current().outlierDecisions.map(d => [d.sample, d.choice, d.by]), [['Treated_3', 'undecided', 'ana-id']]);
});

test('undo of an exclusion keeps the sample and re-opens R without the treatment', async t => {
  const { r, decide, current } = await setup(t);
  const before = opens(r).length;
  await decide({ sample: 'Treated_3', choice: 'exclude' });
  await decide({ sample: 'Treated_3', choice: 'keep' });
  assert.equal(opens(r).length, before + 2);
  assert.equal(opens(r).at(-1).body.settings.outlierTreatments, undefined);
  assert.equal(current().outlierTreatments, undefined);
  assert.equal(current().outlierDecisions[0].choice, 'keep');
});

test('each decision adds an activity entry that says what was done', async t => {
  const { doc, decide } = await setup(t);
  await decide({ sample: 'Treated_3', choice: 'exclude' });
  await decide({ sample: 'Treated_3', choice: 'keep' });
  await decide({ sample: 'Treated_3', choice: 'keep' });
  await decide({ sample: 'Treated_3', choice: 'undecided' });
  assert.deepEqual(doc.getArray('activity').toArray().map(e => [e.actor, e.displayName, e.kind, e.label]), [
    ['ana-id', 'Ana R.', 'decision', 'excluded Treated_3'], ['ana-id', 'Ana R.', 'decision', 'undid the exclusion of Treated_3'],
    ['ana-id', 'Ana R.', 'decision', 'kept Treated_3'], ['ana-id', 'Ana R.', 'decision', 'undid the decision on Treated_3']]);
});

test('a client member whose client has members_prepare false is refused', async t => {
  const { roles, decide, current } = await setup(t);
  roles.set('project', 'disabled-id', 'editor');
  assert.deepEqual(await decide({ sample: 'Treated_3', choice: 'exclude' }, 'disabled'), { status: 403, value: { error: 'lab_prepares' } });
  assert.equal(current().outlierTreatments, undefined);
});

test('a client Viewer or Commenter is refused even with members_prepare on', async t => {
  const { roles, decide } = await setup(t);
  assert.deepEqual(await decide({ sample: 'Treated_3', choice: 'keep' }, editor), { status: 403, value: { error: 'forbidden_role' } });
  roles.set('project', 'editor-id', 'viewer');
  assert.deepEqual(await decide({ sample: 'Treated_3', choice: 'keep' }, editor), { status: 403, value: { error: 'forbidden_role' } });
});

test('a client Editor with members_prepare on decides', async t => {
  const { roles, decide, current } = await setup(t);
  roles.set('project', 'editor-id', 'editor');
  assert.equal((await decide({ sample: 'Treated_3', choice: 'keep' }, editor)).status, 200);
  assert.equal(current().outlierDecisions[0].displayName, 'Lee M.');
});

test('an unknown choice or sample is refused', async t => {
  const { decide } = await setup(t);
  assert.deepEqual(await decide({ sample: 'Treated_3', choice: 'average' }), { status: 400, value: { error: 'invalid_decision' } });
  assert.deepEqual(await decide({ sample: 'Nobody_9', choice: 'exclude' }), { status: 400, value: { error: 'invalid_decision' } });
});

test('a board decision reaches every connected person', { timeout: 10_000 }, async t => {
  const admin = await fakePostgrest(tokens);
  const r = await fakeR();
  const server = await start({ port: 0, dbPath: ':memory:', restUrl: admin.url, anonKey: 'test', apiUrl: r.url, serviceSecret: 'synthetic-secret' });
  t.after(async () => { await server.close(); await r.close(); await admin.close(); });
  const request = (method, suffix, body) => fetch(`${server.httpUrl}/collab/projects${suffix}`, { method,
    headers: { 'Content-Type': 'application/json', 'X-Nexo-Admin-Token': ana }, body: JSON.stringify(body) });
  const { projectId } = await (await request('POST', '', { workspace, origin: { kind: 'dataset', id: 'synthetic-dataset' }, settings })).json();
  const provider = await new Promise((resolve, reject) => {
    const p = new HocuspocusProvider({ url: `${server.wsUrl}/collab`, name: projectId, token: ana,
      onSynced: () => resolve(p), onAuthenticationFailed: ({ reason }) => reject(new Error(reason)) });
    t.after(() => p.destroy());
  });
  const meta = provider.document.getMap('meta');
  await new Promise(resolve => { if (meta.get('session')) resolve(); else meta.observe(() => meta.get('session') && resolve()); });
  assert.equal((await request('PUT', `/${projectId}/decisions`, { sample: 'Treated_3', choice: 'exclude' })).status, 200);
  await new Promise(resolve => { const seen = () => meta.get('origin').settings.outlierTreatments && resolve(); seen(); meta.observe(seen); });
  assert.deepEqual(meta.get('origin').settings.outlierTreatments, { Treated_3: 'remove' });
  assert.equal(meta.get('origin').settings.outlierDecisions[0].displayName, 'Ana R.');
});
