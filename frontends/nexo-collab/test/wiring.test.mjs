// Sidecar wiring (docs/integration/nexo-collab-plan.md Phase 2 as cut): POST /collab/projects writes the document's meta,
// a person joining a project document joins the engine, leaving leaves it. Fake Admin and fake R at the HTTP edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { fakePostgrest } from './fake-postgrest.mjs';
import { fakeR } from './fake-r.mjs';
import { start } from '../src/server.mjs';

const workspace = 'nexo-lab-synthetic';
const checkpoint = { kind: 'checkpoint', id: 'synthetic-checkpoint' };
const clientId = 'cccccccc-0000-4000-8000-00000000000c';
const people = { 'token-ada': [{ caller: '44444444-0000-4000-8000-000000000004', caller_view: 'staff' }],
  'token-bo': [{ caller: '55555555-0000-4000-8000-000000000005', caller_view: 'staff' }],
  'token-cy': [{ caller: '66666666-0000-4000-8000-000000000006', caller_view: 'staff' }],
  'token-cliff': [{ caller: '77777777-0000-4000-8000-000000000007', caller_view: 'client', client_id: clientId }] };

async function setup(t, { engine = true } = {}) {
  const admin = await fakePostgrest(people);
  const r = await fakeR();
  const server = await start({ port: 0, dbPath: ':memory:', restUrl: admin.url, anonKey: 'anon-test',
    ...(engine ? { apiUrl: r.url, serviceSecret: 'synthetic-secret' } : {}) });
  t.after(async () => { await server.close(); await r.close(); await admin.close(); });
  const create = async (body, token = 'token-ada') => (await (await fetch(`${server.httpUrl}/collab/projects`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nexo-Admin-Token': token }, body: JSON.stringify(body) })).json()).projectId;
  const connect = (project, token) => new Promise((resolve, reject) => {
    const provider = new HocuspocusProvider({ url: `${server.wsUrl}/collab`, name: project, token,
      onSynced: () => resolve(provider), onAuthenticationFailed: ({ reason }) => reject(new Error(reason)) });
    t.after(() => provider.destroy());
  });
  return { r, create, connect };
}
const opens = r => r.calls.filter(c => c.path === '/api/v1/sessions' || c.path === '/api/v1/datasets/sessions');
const lease = connections => c => c.path.endsWith('/lease') && c.body.connections === connections;
const leave = provider => new Promise(resolve => {
  provider.configuration.websocketProvider.webSocket.addEventListener('close', resolve);
  provider.destroy();
});

test('a created project document carries its meta before anyone seeds it', { timeout: 10_000 }, async t => {
  const { create, connect } = await setup(t, { engine: false });
  const settings = { samples: ['sample'], normalization: 'none' };
  const project = await create({ workspace, origin: { kind: 'dataset', id: 'synthetic-dataset' }, settings });
  const a = await connect(project, 'token-ada');
  assert.deepEqual(a.document.getMap('meta').toJSON(),
    { project, workspace, origin: { adminDatasetId: 'synthetic-dataset', settings } });
});

test('the first opener seeds a created project with card inputs', { timeout: 10_000 }, async t => {
  const { create, connect } = await setup(t, { engine: false });
  const project = await create({ workspace, origin: checkpoint });
  const a = await connect(project, 'token-ada');
  const refused = new Promise(resolve => a.on('stateless', ({ payload }) => resolve(JSON.parse(payload))));
  const seed = new Y.Doc();
  seed.getMap('canvas').set('version', 1);
  seed.getMap('nodes').set('n1', new Y.Map([['instance', new Y.Map([['id', 'card'], ['inputs', new Y.Map([['top_n', 7]])]])]]));
  Y.applyUpdate(a.document, Y.encodeStateAsUpdate(seed));
  const b = await connect(project, 'token-bo');
  const answer = await Promise.race([refused, new Promise(resolve => {
    const cards = b.document.getMap('nodes');
    if (cards.has('n1')) resolve('seeded'); else cards.observe(() => resolve('seeded'));
  })]);
  assert.equal(answer, 'seeded');
});

test('a seed may not rewrite the created project meta', { timeout: 10_000 }, async t => {
  const { create, connect } = await setup(t, { engine: false });
  const project = await create({ workspace, origin: checkpoint });
  const a = await connect(project, 'token-ada');
  const refused = new Promise(resolve => a.on('stateless', ({ payload }) => resolve(JSON.parse(payload))));
  a.document.transact(() => { a.document.getMap('canvas').set('version', 1); a.document.getMap('meta').set('workspace', 'other'); });
  assert.deepEqual(await refused, { type: 'refused', reason: 'protected', paths: ['meta.workspace'] });
});

test('two people open one R session and lease with two connections', { timeout: 10_000 }, async t => {
  const { r, create, connect } = await setup(t);
  const project = await create({ workspace, origin: checkpoint });
  await connect(project, 'token-ada'); await connect(project, 'token-bo');
  await r.seen(lease(2));
  assert.equal(opens(r).length, 1);
});

test('after both leave, the next person is the only connection', { timeout: 10_000 }, async t => {
  const { r, create, connect } = await setup(t);
  const project = await create({ workspace, origin: checkpoint });
  const a = await connect(project, 'token-ada'), b = await connect(project, 'token-bo');
  await r.seen(lease(2));
  await leave(a); await leave(b);
  const from = r.calls.length;
  await connect(project, 'token-cy');
  const next = await r.seen(c => c.path.endsWith('/lease'), from);
  assert.equal(next.body.connections, 1);
  assert.equal(opens(r).length, 1);
});

test('a created project opens R from its origin', { timeout: 10_000 }, async t => {
  const { r, create, connect } = await setup(t);
  const settings = { samples: ['sample'], normalization: 'none' };
  const project = await create({ workspace, origin: { kind: 'dataset', id: 'synthetic-dataset' }, settings });
  await connect(project, 'token-ada');
  const open = await r.seen(c => c.path === '/api/v1/datasets/sessions');
  assert.deepEqual(open.body, { adminDatasetId: 'synthetic-dataset', settings, collab: { project, workspace } });
});

test('without NEXO_API_URL a person connects and R is never called', { timeout: 10_000 }, async t => {
  const { r, create, connect } = await setup(t, { engine: false });
  const project = await create({ workspace, origin: checkpoint });
  const a = await connect(project, 'token-ada');
  await leave(a);
  assert.deepEqual(r.calls, []);
});

// Astra #3: with an engine the sidecar seeds a project board from R, so a person's seed may not write protected fields.
test('with an engine a client Owner seed carrying nodes.n1.finished is refused', { timeout: 10_000 }, async t => {
  const { create, connect } = await setup(t);
  const project = await create({ workspace: `nexo-client-${clientId}`, origin: checkpoint }, 'token-cliff');
  const a = await connect(project, 'token-cliff');
  const refused = new Promise(resolve => a.on('stateless', ({ payload }) => {
    const message = JSON.parse(payload); if (message.type === 'refused') resolve(message);
  }));
  a.document.transact(() => {
    a.document.getMap('canvas').set('version', '1');
    a.document.getMap('nodes').set('n1', new Y.Map([['id', 'n1'], ['finished', { url: 'data:image/png;base64,AA==' }]]));
  });
  const b = await connect(project, 'token-bo');
  const accepted = new Promise(resolve => { const nodes = b.document.getMap('nodes'); if (nodes.has('n1')) resolve('accepted'); else nodes.observe(() => resolve('accepted')); });
  assert.deepEqual(await Promise.race([refused, accepted]), { type: 'refused', reason: 'protected', paths: ['nodes.n1'] });
});
