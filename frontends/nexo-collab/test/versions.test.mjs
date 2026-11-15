// Versions as cut (docs/integration/nexo-collab-plan.md, "Phases 3–7 as cut", Phase 4): rows in the sidecar's SQLite
// pointing at checkpoints R stores. `save` and `restore` are intents run by src/commits.mjs (registered by versions.mjs);
// autosave runs on the engine's per-project queue. Fake R (and fake Admin for the route) at the edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as Y from 'yjs';
import { fakeR } from './fake-r.mjs';
import { fakePostgrest } from './fake-postgrest.mjs';
import { openDatabase } from '../src/db.mjs';
import { createEngine } from '../src/engine.mjs';
import { createCommits } from '../src/commits.mjs';
import { createVersions } from '../src/versions.mjs';
import { replaceBoard, teamCanvas } from '../src/board.mjs';
import { start } from '../src/server.mjs';

// Transactions other than the engine queue's own length (engine.mjs run writes meta.engineQueue before and after a job).
const onCommit = (doc, fn) => doc.on('afterTransaction', tx => { if ([...tx.changed.values()].flatMap(keys => [...keys]).join() !== 'engineQueue') fn(tx); });
const card = i => ({ kind: 'plot', id: `tcinstance_${i}-plot_pca`, label: 'PCA', x: i * 500, y: 0, width: 440, height: 330,
  visual: {}, finished: null, instance: { id: `tcinstance_${i}`, source: 'results_dashboard-plot_pca', inputs: { color_by: 'Group1' } } });
const boardA = { version: '1', libraryHidden: false, nodes: [card(1), card(2)], document: null, tabs: null };
const boardB = { version: '1', libraryHidden: false, nodes: [card(3)], document: null, tabs: null };
const nexo = { version: 1, nodes: {} };
const personA = { userId: 'person-a', displayName: 'Person A', kind: 'staff', role: 'editor' };
const personB = { userId: 'person-b', displayName: 'Person B', kind: 'staff', role: 'editor' };
const saves = r => r.calls.filter(c => c.method === 'POST' && c.path.endsWith('/checkpoints'));
const claims = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));

async function setup(t, { timers = false } = {}) {
  if (timers) t.mock.timers.enable({ apis: ['setInterval'] });
  const r = await fakeR(); t.after(() => r.close());
  const { db } = openDatabase(':memory:'); t.after(() => db.close());
  const doc = new Y.Doc();
  for (const [key, value] of Object.entries({ project: 'project', workspace: 'lab', origin: { checkpointId: 'synthetic' } })) doc.getMap('meta').set(key, value);
  replaceBoard(doc, boardA, nexo);
  const engine = createEngine({ apiUrl: r.url, secret: 'synthetic-secret' }); t.after(() => engine.close());
  await engine.connect(doc, 'person-a');
  const connected = new Set(['project']);
  const versions = createVersions({ db, engine, connected: () => connected }); t.after(() => versions.close());
  const onStateless = createCommits({ engine });
  let n = 0;
  // Sends one intent as `who` and resolves with the answer the sender receives.
  const send = (kind, payload, who = personA) => new Promise(resolve => {
    const connection = { context: { identity: who }, sendStateless: answer => resolve(JSON.parse(answer)) };
    void onStateless({ connection, document: doc, payload: JSON.stringify({ type: 'intent', intentId: `i-${++n}`, kind, target: {}, payload, baseRevision: 1 }) });
  });
  const rows = () => db.prepare('SELECT * FROM versions WHERE project = ? ORDER BY rowid').all('project');
  const tick = async () => { t.mock.timers.tick(300_000); await engine.idle('project'); };
  return { r, doc, engine, send, connected, rows, tick };
}

test('named save writes one checkpoint with the service identity and the intent id', async t => {
  const { r, doc, send } = await setup(t);
  assert.deepEqual(await send('save', { name: 'Round 2' }, personB), { type: 'intent-result', intentId: 'i-1', revision: 1 });
  assert.equal(saves(r).length, 1);
  const [save] = saves(r);
  assert.equal(save.path, '/api/v1/sessions/generation.1/checkpoints');
  assert.equal(save.intent, 'i-1');
  assert.equal(save.body.label, 'Round 2');
  assert.equal(save.body.collab, true);
  assert.deepEqual(save.body.canvas.state, teamCanvas(doc));
  assert.match(save.body.canvas.token, /^[A-Za-z0-9_.:-]{1,160}$/);
  assert.deepEqual(save.body.nexo, nexo);
  assert.deepEqual({ ...claims(save.token), exp: 0 }, { iss: 'nexo-collab', aud: 'nexo-api', sub: 'service', workspace: 'lab', project: 'project', actor: 'person-b', exp: 0 });
});

test('named save writes one row with the actor and display name', async t => {
  const { send, rows } = await setup(t);
  await send('save', { name: 'Round 2' }, personB);
  assert.deepEqual(rows().map(row => [row.kind, row.name, row.checkpoint_id, row.actor, row.display_name, row.revision]),
    [['named', 'Round 2', 'checkpoint.1', 'person-b', 'Person B', 1]]);
});

test('named save writes savedAt in ms with lastChange in one server transaction', async t => {
  const { doc, send } = await setup(t);
  const origins = []; onCommit(doc, tx => origins.push(tx.origin));
  const before = Date.now();
  await send('save', { name: 'Round 2' }, personB);
  assert.deepEqual(origins, ['server']);
  const meta = doc.getMap('meta');
  assert.ok(meta.get('savedAt') >= before && meta.get('savedAt') <= Date.now());
  assert.deepEqual(meta.get('lastChange'), { nodeId: null, actor: 'person-b', displayName: 'Person B', kind: 'save', revision: 1 });
});

test('autosave every 5 minutes only when the revision changed since the last version', async t => {
  const { r, doc, send, connected, rows, tick } = await setup(t, { timers: true });
  await send('save', { name: 'Baseline' });
  await tick();
  assert.equal(saves(r).length, 1);
  doc.getMap('meta').set('engineRevision', 2);
  r.replies.push({ headers: { 'X-Nexo-Engine-Revision': '2' } });
  await tick();
  assert.equal(saves(r).length, 2);
  assert.equal(saves(r)[1].body.label, 'autosave');
  assert.equal(claims(saves(r)[1].token).actor, 'person-a');
  assert.deepEqual(rows().map(row => [row.kind, row.revision]), [['named', 1], ['autosave', 2]]);
  doc.getMap('meta').set('engineRevision', 3);
  connected.clear();
  await tick();
  assert.equal(saves(r).length, 2);
});

test('autosave writes savedAt in ms', async t => {
  const { doc, tick } = await setup(t, { timers: true });
  doc.getMap('meta').set('engineRevision', 2);
  await tick();
  assert.equal(typeof doc.getMap('meta').get('savedAt'), 'number');
});

test('the 21st autosave drops the oldest from the list', async t => {
  const { r, doc, rows, tick } = await setup(t, { timers: true });
  for (let revision = 2; revision <= 22; revision++) {
    doc.getMap('meta').set('engineRevision', revision);
    r.replies.push({ headers: { 'X-Nexo-Engine-Revision': String(revision) } });
    await tick();
  }
  assert.equal(rows().length, 20);
  assert.deepEqual(rows().map(row => row.revision), Array.from({ length: 20 }, (_, i) => i + 3));
});

test('restore writes before-restore first, reopens R with that checkpoint and replaces the document', async t => {
  const { r, doc, send, rows } = await setup(t);
  await send('save', { name: 'Board A' });
  doc.transact(() => replaceBoard(doc, boardB, nexo));
  const versionId = rows()[0].id, from = r.calls.length;
  const origins = []; onCommit(doc, tx => origins.push(tx.origin));
  assert.deepEqual(await send('restore', { versionId }, personB), { type: 'intent-result', intentId: 'i-2', revision: 2 });
  assert.deepEqual(r.calls.slice(from).map(c => c.path), ['/api/v1/sessions/generation.1/checkpoints', '/api/v1/sessions',
    '/api/v1/sessions/generation.2/lease', '/api/v1/sessions/generation.1/lease']);
  const open = r.calls.findLast(c => c.path === '/api/v1/sessions');
  assert.deepEqual(open.body, { checkpointId: 'checkpoint.1', collab: { workspace: 'lab', project: 'project' } });
  assert.equal(open.intent, 'i-2');
  assert.equal(claims(open.token).actor, 'person-b');
  assert.deepEqual(rows().map(row => [row.kind, row.checkpoint_id, row.actor]),
    [['named', 'checkpoint.1', 'person-a'], ['before-restore', 'checkpoint.2', 'person-b']]);
  assert.deepEqual(teamCanvas(doc), boardA);
  assert.deepEqual(origins, ['server']);
});

test('after a restore engineRevision and session are the reopened R session', async t => {
  const { doc, send, rows } = await setup(t);
  await send('save', { name: 'Board A' });
  await send('restore', { versionId: rows()[0].id });
  const meta = doc.getMap('meta');
  assert.deepEqual(meta.get('session'), { id: 'generation.2', generation: 'generation' });
  assert.equal(meta.get('engineRevision'), 2);
});

test('restoredFrom carries the version, the before-restore id, who and when', async t => {
  const { doc, send, rows } = await setup(t);
  await send('save', { name: 'Board A' });
  const versionId = rows()[0].id, before = Date.now();
  await send('restore', { versionId }, personB);
  const { at, ...restoredFrom } = doc.getMap('meta').get('restoredFrom');
  assert.deepEqual(restoredFrom, { versionId, beforeRestoreId: rows()[1].id, by: 'person-b', displayName: 'Person B' });
  assert.ok(at >= before && at <= Date.now());
  assert.ok(doc.getMap('meta').get('savedAt') >= before);
});

test('undo restores exactly the before-restore version of restoredFrom', async t => {
  const { r, doc, send, rows } = await setup(t);
  await send('save', { name: 'Board A' });
  doc.transact(() => replaceBoard(doc, boardB, nexo));
  await send('restore', { versionId: rows()[0].id });
  const { beforeRestoreId } = doc.getMap('meta').get('restoredFrom');
  await send('restore', { versionId: beforeRestoreId });
  assert.equal(r.calls.findLast(c => c.path === '/api/v1/sessions').body.checkpointId, rows().find(row => row.id === beforeRestoreId).checkpoint_id);
  assert.deepEqual(teamCanvas(doc), boardB);
});

test('after a restore the lease renews the new session id', async t => {
  const { r, engine, send, rows } = await setup(t);
  await send('save', { name: 'Board A' });
  await send('restore', { versionId: rows()[0].id });
  await engine.renew('project');
  assert.equal(r.calls.at(-1).path, '/api/v1/sessions/generation.2/lease');
});

test('restore of an unknown version is refused', async t => {
  const { send } = await setup(t);
  assert.deepEqual(await send('restore', { versionId: 'missing' }), { type: 'refused', intentId: 'i-1', reason: 'unknown_version' });
});

test('the versions route lists rows newest first with checkpointId and displayName and refuses another workspace', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'nexo-collab-versions-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const admin = await fakePostgrest({ staff: [{ caller: 'staff-id', caller_view: 'staff' }],
    member: [{ caller: 'member-id', caller_view: 'client', client_id: 'aaaaaaaa-0000-4000-8000-00000000000a' }] });
  const server = await start({ port: 0, dbPath: join(dir, 'collab.db'), restUrl: admin.url, anonKey: 'test' });
  t.after(async () => { await server.close(); await admin.close(); });
  const request = (method, suffix, token, body) => fetch(`${server.httpUrl}/collab/projects${suffix}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Nexo-Admin-Token': token }, body: body && JSON.stringify(body) });
  const { projectId } = await (await request('POST', '', 'staff', { workspace: 'other-workspace', origin: { kind: 'checkpoint', id: 'synthetic' } })).json();
  const db = new DatabaseSync(join(dir, 'collab.db'));
  const insert = db.prepare(`INSERT INTO versions (project, id, kind, name, checkpoint_id, actor, display_name, revision, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insert.run(projectId, 'version-1', 'named', 'First', 'checkpoint.1', 'staff-id', 'Staff', 1, '2026-11-10T10:00:00.000Z');
  insert.run(projectId, 'version-2', 'autosave', null, 'checkpoint.2', null, null, 2, '2026-11-10T10:05:00.000Z');
  db.close();
  const listed = await request('GET', `/${projectId}/versions`, 'staff');
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), [
    { id: 'version-2', kind: 'autosave', name: null, checkpointId: 'checkpoint.2', actor: null, displayName: null, createdAt: '2026-11-10T10:05:00.000Z', revision: 2 },
    { id: 'version-1', kind: 'named', name: 'First', checkpointId: 'checkpoint.1', actor: 'staff-id', displayName: 'Staff', createdAt: '2026-11-10T10:00:00.000Z', revision: 1 },
  ]);
  assert.equal((await request('GET', `/${projectId}/versions`, 'member')).status, 403);
});

// Astra review #6: the restored checkpoint is the recovery baseline, with the recovery globals R's open answer gives.
test('after a restore a lost session reopens the restored checkpoint without the newer settings', async t => {
  const { r, doc, engine, send, rows } = await setup(t);
  await send('save', { name: 'Board A' });
  const meta = doc.getMap('meta');
  doc.transact(() => {
    meta.set('design', { unit: 'unit-b', type: 'paired', confirmed: true });
    meta.set('analysis', { inputs: { filter: 'newer' } });
    meta.set('cohort', { lipids: ['PC 34:1'] });
    meta.set('palette', { restore: { preset: 'newer' } });
  });
  r.replies.push({}, { body: { sessionId: 'generation.2', generation: 'generation', engineRevision: 2, canvas: boardA, nexo,
    design: { allowed: true, unit: 'unit-a', type: 'independent', confirmed: true } } });
  await send('restore', { versionId: rows()[0].id });
  assert.deepEqual(meta.get('origin'), { checkpointId: 'checkpoint.1' });
  r.replies.push({ status: 409, body: { error: 'session_lost' } });
  const from = r.calls.length;
  await engine.renew('project');
  const reopen = r.calls.slice(from + 1);
  assert.deepEqual(reopen[0].body, { checkpointId: 'checkpoint.1', collab: { workspace: 'lab', project: 'project' } });
  assert.deepEqual(reopen.filter(c => /\/(design|analysis|cohort|palette)$/.test(c.path)).map(c => [c.path, c.body]),
    [['/api/v1/sessions/generation.3/design', { unit: 'unit-a', type: 'independent', confirm: true }]]);
});

// Astra review #12: the checkpoint answer advances R's revision; rows and meta.engineRevision follow it.
test('named save writes its row with the revision R answers the checkpoint with', async t => {
  const { r, send, rows } = await setup(t);
  r.replies.push({ headers: { 'X-Nexo-Engine-Revision': '2' } });
  assert.deepEqual(await send('save', { name: 'Round 2' }), { type: 'intent-result', intentId: 'i-1', revision: 2 });
  assert.deepEqual(rows().map(row => row.revision), [2]);
});

test('autosave publishes the revision R answers the checkpoint with', async t => {
  const { r, doc, rows, tick } = await setup(t, { timers: true });
  doc.getMap('meta').set('engineRevision', 2);
  r.replies.push({ headers: { 'X-Nexo-Engine-Revision': '3' } });
  await tick();
  assert.deepEqual(rows().map(row => row.revision), [3]);
  assert.equal(doc.getMap('meta').get('engineRevision'), 3);
});

// Astra review #13: the new session is leased before it is published, and the old one is released.
test('restore leases the new session before publishing it and releases the old one', async t => {
  const { r, doc, send, rows } = await setup(t);
  await send('save', { name: 'Board A' });
  let published = null;
  doc.getMap('meta').observe(event => { if (event.keysChanged.has('session')) published = r.calls.length; });
  const from = r.calls.length;
  await send('restore', { versionId: rows()[0].id });
  const leases = r.calls.slice(from).filter(c => c.path.endsWith('/lease'));
  assert.deepEqual(leases.map(c => [c.path, c.body, c.intent]), [
    ['/api/v1/sessions/generation.2/lease', { connections: 1, inFlight: 0 }, undefined],
    ['/api/v1/sessions/generation.1/lease', { connections: 0, inFlight: 0 }, undefined],
  ]);
  assert.ok(r.calls.indexOf(leases[0]) < published);
});

// Astra review #16: an open that first waited for capacity ends with the engine ready.
test('a restore that waited for capacity leaves the engine ready', async t => {
  const { r, doc, send, rows } = await setup(t);
  await send('save', { name: 'Board A' });
  r.replies.push({}, { status: 503, body: { error: 'capacity' }, headers: { 'Retry-After': '0' } });
  assert.equal((await send('restore', { versionId: rows()[0].id })).type, 'intent-result');
  assert.equal(doc.getMap('meta').get('engineStatus'), 'ready');
});

// Astra review 2 #6: the release answers the old session's revision.
test('releasing the old session after a restore keeps the new session revision', async t => {
  const { r, doc, send, rows } = await setup(t);
  await send('save', { name: 'Board A' });
  r.replies.push({}, {}, { headers: { 'X-Nexo-Engine-Revision': '2' } }, { headers: { 'X-Nexo-Engine-Revision': '9' } });
  const answer = await send('restore', { versionId: rows()[0].id });
  assert.equal(answer.revision, 2);
  assert.equal(doc.getMap('meta').get('engineRevision'), 2);
});

const activity = doc => doc.getArray('activity').toArray().map(({ at, ...entry }) => (assert.equal(typeof at, 'number'), entry));
test('a named save appends one activity entry with its name', async t => {
  const { doc, send } = await setup(t);
  await send('save', { name: 'Round 2' }, personB);
  assert.deepEqual(activity(doc), [{ actor: 'person-b', displayName: 'Person B', kind: 'save', label: 'Round 2' }]);
});

test('a restore appends one activity entry naming the restored version', async t => {
  const { doc, send, rows } = await setup(t);
  await send('save', { name: 'Board A' });
  await send('restore', { versionId: rows()[0].id }, personB);
  assert.deepEqual(activity(doc).at(-1), { actor: 'person-b', displayName: 'Person B', kind: 'restore', label: 'Board A' });
  assert.equal(activity(doc).length, 2);
});

test('an autosave appends one activity entry in its transaction', async t => {
  const { doc, tick } = await setup(t, { timers: true });
  doc.getMap('meta').set('engineRevision', 2);
  const touched = []; onCommit(doc, tx => touched.push(tx.changed.has(doc.getArray('activity'))));
  await tick();
  assert.deepEqual(touched, [true]);
  assert.deepEqual(activity(doc), [{ actor: null, displayName: null, kind: 'autosave' }]);
});
