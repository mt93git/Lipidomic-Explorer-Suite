import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import * as Y from 'yjs';
import { fakeR } from './fake-r.mjs';
import { createEngine } from '../src/engine.mjs';
import { serviceToken } from '../src/service.mjs';

async function setup(t, origin = { checkpointId: 'synthetic' }) {
  const r = await fakeR(); t.after(() => r.close());
  const doc = new Y.Doc();
  for (const [key, value] of Object.entries({ project: 'project', workspace: 'lab', origin })) doc.getMap('meta').set(key, value);
  const engine = createEngine({ apiUrl: r.url, secret: 'synthetic-secret' });
  t.after(() => engine.close());
  return { r, doc, engine };
}
test('service token has scoped claims, a 45 second expiry and a valid HS256 signature', () => {
  const token = serviceToken({ workspace: 'lab', project: 'project', actor: 'person', secret: 'synthetic-secret', now: 100 });
  const [header, payload, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'HS256', typ: 'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), { iss: 'nexo-collab', aud: 'nexo-api', sub: 'service', workspace: 'lab', project: 'project', actor: 'person', exp: 145 });
  assert.equal(signature, createHmac('sha256', 'synthetic-secret').update(`${header}.${payload}`).digest('base64url'));
});
test('first connect opens once and publishes the session with server origin', async t => {
  const { r, doc, engine } = await setup(t); const origins = [];
  doc.on('afterTransaction', tx => origins.push(tx.origin));
  await engine.connect(doc, 'person');
  assert.deepEqual(r.calls[0].body, { checkpointId: 'synthetic', collab: { project: 'project', workspace: 'lab' } });
  assert.deepEqual(doc.getMap('meta').get('session'), { id: 'generation.1', generation: 'generation' });
  assert.equal(doc.getMap('meta').get('engineRevision'), 1);
  assert.ok(origins.includes('server'));
  assert.ok(r.calls.every(c => c.token));
});
test('a revision header that is not a number is never stored', async t => {
  const { r, doc, engine } = await setup(t);
  r.replies.push({ headers: { 'X-Nexo-Engine-Revision': ['1', '1'] } }); // fetch reads "1, 1"
  await engine.connect(doc, 'person');
  assert.equal(doc.getMap('meta').get('engineRevision'), 1);
  r.replies.push({ headers: { 'X-Nexo-Engine-Revision': ['2', '2'] } });
  await engine.renew('project');
  assert.equal(engine.revision('project'), 1);
});
test('two simultaneous connects open once', async t => {
  const { r, doc, engine } = await setup(t);
  await Promise.all([engine.connect(doc, 'a'), engine.connect(doc, 'b')]);
  assert.equal(r.calls.filter(c => c.path === '/api/v1/sessions').length, 1);
  await engine.renew('project');
  assert.equal(r.calls.at(-1).body.connections, 2);
});
test('lease renews every 60 seconds and stops after the last disconnect', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { r, doc, engine } = await setup(t);
  await engine.connect(doc, 'a');
  t.mock.timers.tick(60_000); await engine.idle('project');
  assert.equal(r.calls.at(-1).path, '/api/v1/sessions/generation.1/lease');
  assert.equal(r.calls.at(-1).body.connections, 1);
  engine.disconnect('project'); const count = r.calls.length;
  t.mock.timers.tick(120_000); await engine.idle('project');
  assert.equal(r.calls.length, count);
});
test('session_lost reopens and recreates cards from document inputs after confirming design', async t => {
  const { r, doc, engine } = await setup(t);
  doc.getMap('meta').set('design', { unit: 'sample', type: 'independent', confirmed: true });
  doc.getMap('nodes').set('node', new Y.Map([['instance', new Y.Map([['id', 'card'], ['source', 'pca'], ['inputs', new Y.Map([['top_n', 7]])]])]]));
  await engine.connect(doc, 'a');
  r.replies.push({ status: 409, body: { error: 'session_lost' } });
  await engine.renew('project');
  assert.equal(doc.getMap('meta').get('session').id, 'generation.2');
  const recovery = r.calls.slice(r.calls.findIndex(c => c.path === '/api/v1/sessions/generation.1/lease') + 1);
  assert.ok(recovery.findIndex(c => c.path.endsWith('/design')) < recovery.findIndex(c => c.path.endsWith('/cards')));
  assert.deepEqual(recovery.find(c => c.path.endsWith('/cards')).body, { instanceId: 'card', source: 'pca', inputs: { top_n: 7 } });
});
test('dataset origin reuses persisted preparation settings', async t => {
  const origin = { adminDatasetId: 'synthetic-dataset', settings: { samples: ['sample'], normalization: 'none' } };
  const { r, doc, engine } = await setup(t, origin);
  await engine.connect(doc, 'a');
  assert.equal(r.calls[0].path, '/api/v1/datasets/sessions');
  assert.deepEqual(r.calls[0].body, { ...origin, collab: { project: 'project', workspace: 'lab' } });
});
test('a dataset project confirms the study design its settings carry before any card', async t => {
  const origin = { adminDatasetId: 'synthetic-dataset', settings: { samples: ['sample'], design: { unit: 'Animal', type: 'paired', confirmed: true } } };
  const { r, doc, engine } = await setup(t, origin);
  doc.getMap('nodes').set('node', new Y.Map([['instance', new Y.Map([['id', 'card'], ['source', 'pca']])]]));
  await engine.connect(doc, 'a');
  const design = r.calls.findIndex(c => c.path === '/api/v1/sessions/generation.1/design');
  assert.deepEqual(r.calls[design]?.body, { unit: 'Animal', type: 'paired', confirm: true });
  assert.ok(design < r.calls.findIndex(c => c.path.endsWith('/cards')));
});
test('a design confirmed later on the board wins over the one in the settings', async t => {
  const origin = { adminDatasetId: 'synthetic-dataset', settings: { samples: ['sample'], design: { unit: 'Animal', type: 'paired', confirmed: true } } };
  const { r, doc, engine } = await setup(t, origin);
  doc.getMap('meta').set('design', { unit: 'Donor', type: 'independent', confirmed: true });
  await engine.connect(doc, 'a');
  assert.deepEqual(r.calls.find(c => c.path.endsWith('/design')).body, { unit: 'Donor', type: 'independent', confirm: true });
});
test('capacity publishes waiting and retries after Retry-After', async t => {
  const { r, doc, engine } = await setup(t);
  r.replies.push({ status: 503, headers: { 'Retry-After': '0' }, body: { error: 'capacity' } });
  const states = []; doc.getMap('meta').observe(() => states.push(doc.getMap('meta').get('engineStatus')));
  await engine.connect(doc, 'a');
  assert.ok(states.includes('waiting'));
  assert.equal(r.calls.filter(c => c.path === '/api/v1/sessions').length, 2);
  assert.equal(doc.getMap('meta').get('engineStatus'), 'ready');
});

// FIX-PROD-B 3: the journal's "Unexpected end of JSON input" was R's answer without a body read as JSON.
test('an empty answer from R is not a JSON error', async t => {
  const { r, doc, engine } = await setup(t);
  await engine.connect(doc, 'person');
  r.replies.push({ raw: '' });
  await engine.renew('project');
  assert.equal(r.calls.at(-1).path, '/api/v1/sessions/generation.1/lease');
});
test('an empty refusal from R fails with its status, not a JSON parse error', async t => {
  const { r, doc, engine } = await setup(t);
  await engine.connect(doc, 'person');
  r.replies.push({ status: 502, raw: '' });
  await assert.rejects(engine.renew('project'), { status: 502, message: 'R answered 502' });
});
test('a changed engine generation reopens by origin', async t => {
  const { r, doc, engine } = await setup(t);
  await engine.connect(doc, 'a');
  r.replies.push({ body: { generation: 'restarted' } });
  await engine.renew('project');
  assert.equal(doc.getMap('meta').get('session').id, 'generation.2');
});

test('a reconnect after the document was reloaded writes to the new document', async t => {
  const { r, doc, engine } = await setup(t);
  await engine.connect(doc, 'a');
  engine.disconnect('project');
  const reloaded = new Y.Doc(); Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(doc));
  r.replies.push({ body: { generation: 'restarted' } });
  await engine.connect(reloaded, 'a');
  assert.equal(reloaded.getMap('meta').get('session').id, 'generation.2');
});

// Astra #3: the sidecar, not the first opener, seeds a project board, from R's open answer.
test('first connect fills an empty board from R open answer in one server transaction', async t => {
  const { r, doc, engine } = await setup(t);
  const finished = { url: 'data:image/png;base64,AA==' };
  r.replies.push({ body: { sessionId: 'generation.1', generation: 'generation', engineRevision: 1,
    canvas: { version: '1', libraryHidden: false, document: null, tabs: null, nodes: [{ kind: 'plot', id: 'n1', x: 0, y: 0,
      width: 100, height: 100, label: 'Lipid', visual: {}, finished, instance: { id: 'card', source: 'lipid', inputs: { lipid: 'PC 34:1' } } }] },
    nexo: { version: 1, nodes: { n1: { inputs: {}, actions: [] } } } } });
  const seeds = [];
  doc.on('afterTransaction', tx => { if (tx.changed.has(doc.getMap('nodes'))) seeds.push({ origin: tx.origin, meta: tx.changed.has(doc.getMap('meta')) }); });
  await engine.connect(doc, 'person');
  assert.deepEqual(doc.getMap('nodes').get('n1').get('finished'), finished);
  assert.equal(doc.getMap('nodes').get('n1').get('instance').get('inputs').get('lipid'), 'PC 34:1');
  assert.equal(doc.getMap('canvas').get('version'), '1');
  assert.deepEqual(seeds, [{ origin: 'server', meta: true }]);
});
test('session_lost recovery replays the Nexo inputs and actions of a fixed dashboard card without creating it', async t => {
  const { r, doc, engine } = await setup(t);
  doc.getMap('nodes').set('results_dashboard-plot_violin', new Y.Map([['id', 'results_dashboard-plot_violin'], ['kind', 'plot']]));
  doc.getMap('nexo').set('nodes', new Y.Map([['results_dashboard-plot_violin',
    new Y.Map([['inputs', { violin_lipid: 'PE 36:2' }], ['actions', ['run']]])]]));
  await engine.connect(doc, 'a');
  r.replies.push({ status: 409, body: { error: 'session_lost' } });
  await engine.renew('project');
  const recovery = r.calls.slice(r.calls.findIndex(c => c.path === '/api/v1/sessions/generation.1/lease') + 1);
  assert.deepEqual(recovery.filter(c => c.path.includes('/cards')).map(c => [c.method, c.path, c.body]), [
    ['PATCH', '/api/v1/sessions/generation.2/cards/tcinstance_v0_violin', { inputs: { violin_lipid: 'PE 36:2' } }],
    ['POST', '/api/v1/sessions/generation.2/cards/tcinstance_v0_violin/replay', { actions: ['run'] }],
  ]);
});
test('the project queue length is published as meta.engineQueue while jobs wait, 0 when idle', async t => {
  const { doc, engine } = await setup(t);
  await engine.connect(doc, 'a');
  const seen = [], origins = [];
  doc.getMap('meta').observe((event, tx) => { if (event.keysChanged.has('engineQueue')) { seen.push(doc.getMap('meta').get('engineQueue')); origins.push(tx.origin); } });
  let release; const held = new Promise(resolve => { release = resolve; });
  const first = engine.run('project', () => held), second = engine.run('project', async () => {});
  assert.deepEqual(seen, [1, 2]);
  release(); await Promise.all([first, second]);
  assert.deepEqual(seen, [1, 2, 1, 0]);
  assert.ok(origins.every(origin => origin === 'server'));
});

test('a queue length left in the document by a crash is reset when the engine opens', async t => {
  const { doc, engine } = await setup(t);
  doc.getMap('meta').set('engineQueue', 3);
  await engine.connect(doc, 'a');
  assert.equal(doc.getMap('meta').get('engineQueue'), 0);
});
