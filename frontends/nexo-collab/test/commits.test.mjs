// Science commits (docs/integration/nexo-collab-plan.md 2.2, "Phases 3–7 as cut", intent contract): a stateless
// intent runs on the engine's per-project queue, calls R with the service identity and X-Nexo-Intent, writes the
// settled values with origin 'server' and answers the sender. Fake R (and fake Admin for the socket case) at the edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { fakeR } from './fake-r.mjs';
import { fakePostgrest } from './fake-postgrest.mjs';
import { createEngine } from '../src/engine.mjs';
import { createCommits } from '../src/commits.mjs';
import { start } from '../src/server.mjs';
import { openDatabase } from '../src/db.mjs';
import { createAuth } from '../src/auth.mjs';
import { createRoles } from '../src/roles.mjs';

// Transactions other than the engine queue's own length (engine.mjs run writes meta.engineQueue before and after a job).
const onCommit = (doc, fn) => doc.on('afterTransaction', tx => { if ([...tx.changed.values()].flatMap(keys => [...keys]).join() !== 'engineQueue') fn(tx); });
const staff = { userId: 'ada', displayName: 'Ada', kind: 'staff', role: 'editor' };
const viewer = { userId: 'cy', displayName: 'Member', kind: 'client', role: 'viewer' };
const clientEditor = { userId: 'bo', displayName: 'Bo', kind: 'client', role: 'editor' };
const revision = n => ({ 'X-Nexo-Engine-Revision': String(n) });
const card = (id, instance) => new Y.Map([['id', id], ['kind', 'plot'],
  ['instance', new Y.Map([['id', instance], ['source', 'pca'], ['inputs', new Y.Map([['top_n', 5]])]])]]);

async function setup(t, access = {}) {
  const r = await fakeR(); t.after(() => r.close());
  const doc = new Y.Doc();
  for (const [key, value] of Object.entries({ project: 'project', workspace: 'lab', origin: { checkpointId: 'synthetic' } })) {
    doc.getMap('meta').set(key, value);
  }
  doc.getMap('nodes').set('n1', card('n1', 'card-1'));
  doc.getMap('nodes').set('n2', card('n2', 'card-2'));
  const engine = createEngine({ apiUrl: r.url, secret: 'synthetic-secret' });
  t.after(() => engine.close());
  await engine.connect(doc, 'ada');
  const onStateless = createCommits({ engine, ...access });
  // Sends one intent as `who` (on a connection with `socket` and `context`) and resolves with the answer it receives.
  const send = (intent, who = staff, { socket, context } = {}) => new Promise(resolve => {
    const connection = { webSocket: socket, context: { identity: who, ...context }, sendStateless: payload => resolve(JSON.parse(payload)) };
    void onStateless({ connection, document: doc, payload: JSON.stringify({ type: 'intent', baseRevision: 1, ...intent }) });
  });
  return { r, doc, send, engine };
}
const patches = r => r.calls.filter(c => c.method === 'PATCH');

test('an inputs intent patches R once with the service token and the intent id', async t => {
  const { r, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 9 } } });
  await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } });
  assert.equal(patches(r).length, 1);
  const [call] = patches(r);
  assert.equal(call.path, '/api/v1/sessions/generation.1/cards/card-1');
  assert.deepEqual(call.body, { inputs: { top_n: 9 } });
  assert.equal(call.intent, 'i-1');
  assert.equal(JSON.parse(Buffer.from(call.token.split('.')[1], 'base64url')).actor, 'ada');
});

test('an inputs intent writes the settled values, revision and last change in one server transaction', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 9 } } });
  const origins = []; onCommit(doc, tx => origins.push(tx.origin));
  await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } });
  assert.deepEqual(origins, ['server']);
  assert.equal(doc.getMap('nodes').get('n1').get('instance').get('inputs').get('top_n'), 9);
  assert.equal(doc.getMap('meta').get('engineRevision'), 2);
  assert.deepEqual(doc.getMap('meta').get('lastChange'),
    { nodeId: 'n1', actor: 'ada', displayName: 'Ada', kind: 'inputs', revision: 2 });
});

test('the sender gets intent-result with the engine revision', async t => {
  const { r, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 9 } } });
  const answer = await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } });
  assert.deepEqual(answer, { type: 'intent-result', intentId: 'i-1', revision: 2 });
});

test('a computed control goes to the Nexo member, not to Team instance inputs', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 5, customCol_A: '#112233' } } });
  await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { customCol_A: '#112233' } } });
  assert.deepEqual(doc.getMap('nexo').get('nodes').get('n1').get('inputs'), { customCol_A: '#112233' });
  assert.equal(doc.getMap('nodes').get('n1').get('instance').get('inputs').has('customCol_A'), false);
});

test('two intents on different cards run in order', async t => {
  const { r, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { inputs: { top_n: 7 } } }, { headers: revision(3), body: { inputs: { top_n: 8 } } });
  const answers = await Promise.all([
    send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 7 } } }),
    send({ intentId: 'i-2', kind: 'inputs', target: { nodeId: 'n2' }, payload: { inputs: { top_n: 8 } } }),
  ]);
  assert.deepEqual(answers.map(a => a.revision), [2, 3]);
  const one = '/api/v1/sessions/generation.1/cards/card-1', two = '/api/v1/sessions/generation.1/cards/card-2';
  assert.ok(r.log.indexOf(`out ${one}`) < r.log.indexOf(`in ${two}`));
});

test('a viewer intent is refused and R is not called', async t => {
  const { r, send } = await setup(t);
  const count = r.calls.length;
  const answer = await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } }, viewer);
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'viewer' });
  assert.equal(r.calls.length, count);
});

test('a client member finish is refused as lab only', async t => {
  const { doc, send } = await setup(t);
  const answer = await send({ intentId: 'i-1', kind: 'finish', target: { nodeId: 'n1' }, payload: { finished: { url: 'data:image/png;base64,AA' } } }, clientEditor);
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'lab_only' });
  assert.equal(doc.getMap('nodes').get('n1').has('finished'), false);
});

test('an R 422 is refused with its reason and the document is unchanged', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ status: 422, body: { error: 'unprocessable', message: 'Unknown input: colour' } });
  const answer = await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { colour: 1 } } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'Unknown input: colour' });
  assert.equal(doc.getMap('meta').has('lastChange'), false);
});

test('session_lost is refused with please redo', async t => {
  const { r, send } = await setup(t);
  r.replies.push({ status: 409, body: { error: 'session_lost', message: 'Session not found' } });
  const answer = await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'the engine restarted; please redo' });
});

test('session_lost asks the engine to recover once', async t => {
  const { r, doc, send, engine } = await setup(t);
  const opens = () => r.calls.filter(c => c.path === '/api/v1/sessions').length;
  // R answers the intent and the recovery lease alike: the session is gone; the reopen gets generation.2.
  r.replies.push({ status: 409, body: { error: 'session_lost', message: 'Session not found' } },
    { status: 409, body: { error: 'session_lost', message: 'Session not found' } });
  await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } });
  await engine.idle('project');
  assert.equal(opens(), 2);
  assert.equal(doc.getMap('meta').get('session').id, 'generation.2');
});

test('a timeout re-asks R once with the same intent id', async t => {
  const { r, send } = await setup(t);
  r.replies.push({ status: 504, body: { error: 'engine_timeout', intentId: 'i-1' } },
    { headers: revision(2), body: { settled: true, inputs: { top_n: 9 } } });
  const answer = await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } });
  assert.deepEqual(patches(r).map(c => c.intent), ['i-1', 'i-1']);
  assert.deepEqual(answer, { type: 'intent-result', intentId: 'i-1', revision: 2 });
});

test('an unknown kind is refused', async t => {
  const { send } = await setup(t);
  const answer = await send({ intentId: 'i-1', kind: 'teleport', target: {}, payload: {} });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'unknown_kind' });
});

// Who restores (Gerardo, 2026-11-10, UX review 2 question 2): the project's Owner and lab staff. Without versions.mjs
// a restore that passes the role check is refused as not_here; one that does not, as owner_only.
for (const [who, identity, reason] of [
  ['an Owner client member', { userId: 'cy', displayName: 'Member', kind: 'client', role: 'owner' }, 'not_here'],
  ['a lab staff Editor', staff, 'not_here'],
  ['a client Editor', clientEditor, 'owner_only'],
]) test(`${who} restore is ${reason === 'owner_only' ? 'refused as owner only' : 'allowed by the role check'}`, async t => {
  const { send } = await setup(t);
  const answer = await send({ intentId: 'i-1', kind: 'restore', target: {}, payload: { versionId: 'v1' } }, identity);
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason });
});

test('save without a registered handler is refused as not here', async t => {
  const { send } = await setup(t);
  const answer = await send({ intentId: 'i-1', kind: 'save', target: {}, payload: {} });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'not_here' });
});

test('an intent sent over the socket gets its intent-result', { timeout: 10_000 }, async t => {
  const admin = await fakePostgrest({ 'token-ada': [{ caller: '44444444-0000-4000-8000-000000000004', caller_view: 'staff' }] });
  const r = await fakeR();
  const server = await start({ port: 0, dbPath: ':memory:', restUrl: admin.url, anonKey: 'anon-test', apiUrl: r.url, serviceSecret: 'synthetic-secret' });
  t.after(async () => { await server.close(); await r.close(); await admin.close(); });
  const project = (await (await fetch(`${server.httpUrl}/collab/projects`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nexo-Admin-Token': 'token-ada' },
    body: JSON.stringify({ workspace: 'nexo-lab-synthetic', origin: { kind: 'checkpoint', id: 'synthetic-checkpoint' } }) })).json()).projectId;
  const provider = await new Promise((resolve, reject) => {
    const p = new HocuspocusProvider({ url: `${server.wsUrl}/collab`, name: project, token: 'token-ada',
      onSynced: () => resolve(p), onAuthenticationFailed: ({ reason }) => reject(new Error(reason)) });
    t.after(() => p.destroy());
  });
  const meta = provider.document.getMap('meta');
  await new Promise(resolve => { if (meta.has('session')) resolve(); else meta.observe(() => meta.has('session') && resolve()); });
  // Resolves with the answer to `intent`; the card exists first (an intent needs its target node), then its inputs change.
  const ask = intent => new Promise(resolve => {
    provider.on('stateless', ({ payload }) => { const m = JSON.parse(payload); if (m.intentId === intent.intentId) resolve(m); });
    provider.sendStateless(JSON.stringify({ type: 'intent', baseRevision: 1, ...intent }));
  });
  r.replies.push({ headers: revision(3), body: { instanceId: 'tcinstance_v0_pca', inputs: { top_n: 5 } } });
  assert.equal((await ask({ intentId: 'i-0', kind: 'createCard', target: { nodeId: 'n1' },
    payload: { node: { id: 'n1', kind: 'plot', instance: { id: 'tcinstance_v0_pca', source: 'pca', inputs: {} } } } })).type, 'intent-result');
  r.replies.push({ headers: revision(4), body: { settled: true, inputs: { top_n: 9 } } });
  assert.deepEqual(await ask({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } }, baseRevision: 3 }),
    { type: 'intent-result', intentId: 'i-1', revision: 4 });
});

test('an action intent patches the actions and records them in the Nexo member', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 5 } } });
  await send({ intentId: 'i-1', kind: 'action', target: { nodeId: 'n1' }, payload: { actions: ['run'] } });
  assert.deepEqual(patches(r)[0].body, { actions: ['run'] });
  assert.deepEqual(doc.getMap('nexo').get('nodes').get('n1').get('actions'), ['run']);
});

test('a createCard intent creates the card in R and writes the node with its settled inputs', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { instanceId: 'card-3', inputs: { top_n: 4, alpha: 1 } } });
  const node = { id: 'n3', kind: 'plot', label: 'PCA', x: 10, y: 20, width: 300, height: 200,
    instance: { id: 'card-3', source: 'pca', inputs: { top_n: 4 } } };
  await send({ intentId: 'i-1', kind: 'createCard', target: { nodeId: 'n3' }, payload: { node } });
  const call = r.calls.findLast(c => c.path === '/api/v1/sessions/generation.1/cards');
  assert.deepEqual(call.body, { instanceId: 'card-3', source: 'pca', inputs: { top_n: 4 } });
  const written = doc.getMap('nodes').get('n3');
  assert.deepEqual({ ...written.toJSON(), label: written.get('label').toString() },
    { ...node, instance: { id: 'card-3', source: 'pca', inputs: { top_n: 4, alpha: 1 } } });
});

test('a parkCard intent deletes the card in R and removes its node', async t => {
  const { r, doc, send } = await setup(t);
  doc.getMap('nexo').set('nodes', new Y.Map([['n1', new Y.Map([['actions', ['run']]])]]));
  r.replies.push({ headers: revision(2), body: { ok: true } });
  await send({ intentId: 'i-1', kind: 'parkCard', target: { nodeId: 'n1' }, payload: {} });
  assert.ok(r.calls.some(c => c.method === 'DELETE' && c.path === '/api/v1/sessions/generation.1/cards/card-1'));
  assert.equal(doc.getMap('nodes').has('n1'), false);
  assert.equal(doc.getMap('nexo').get('nodes').has('n1'), false);
});

// Recovery (src/engine.mjs open) re-sends meta.design, meta.analysis, meta.cohort and meta.palette as they are written here.
test('a design intent confirms the design in R and records it for recovery and the checkpoint', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { allowed: true, unit: 'sample', type: 'independent', confirmed: true } });
  await send({ intentId: 'i-1', kind: 'design', target: {}, payload: { unit: 'sample', type: 'independent' } });
  assert.deepEqual(r.calls.at(-1).body, { unit: 'sample', type: 'independent', confirm: true });
  assert.deepEqual(doc.getMap('meta').get('design'), { unit: 'sample', type: 'independent', confirmed: true });
  assert.deepEqual(doc.getMap('nexo').get('design'), { unit: 'sample', type: 'independent' });
});

test('an analysis intent patches R and keeps every analysis setting changed so far', async t => {
  const { r, doc, send } = await setup(t);
  doc.getMap('meta').set('analysis', { inputs: { fdr: 0.1 } });
  r.replies.push({ headers: revision(2), body: { sections: [] } });
  await send({ intentId: 'i-1', kind: 'analysis', target: {}, payload: { inputs: { test: 'wilcox' } } });
  assert.deepEqual(r.calls.at(-1), { ...r.calls.at(-1), method: 'PATCH', path: '/api/v1/sessions/generation.1/analysis', body: { inputs: { test: 'wilcox' } } });
  assert.deepEqual(doc.getMap('meta').get('analysis'), { inputs: { fdr: 0.1, test: 'wilcox' } });
});

test('a cohort intent puts the lipids in R and records the cohort R settled', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { active: true, lipids: ['PC 34:1'], available: [] } });
  await send({ intentId: 'i-1', kind: 'cohort', target: {}, payload: { lipids: ['PC 34:1', 'PC 34:1'] } });
  assert.deepEqual(r.calls.at(-1), { ...r.calls.at(-1), method: 'PUT', path: '/api/v1/sessions/generation.1/cohort', body: { lipids: ['PC 34:1', 'PC 34:1'] } });
  assert.deepEqual(doc.getMap('meta').get('cohort'), { lipids: ['PC 34:1'] });
});

test('a palette intent patches R and records the resulting state as a restore', async t => {
  const { r, doc, send } = await setup(t);
  const state = { useCustomColors: false, customColors: {}, activePalette: 'Viridis' };
  r.replies.push({ headers: revision(2), body: { active: 'Viridis', palettes: [], contexts: [], state } });
  await send({ intentId: 'i-1', kind: 'palette', target: {}, payload: { palette: 'Viridis' } });
  assert.deepEqual(r.calls.at(-1), { ...r.calls.at(-1), method: 'PATCH', path: '/api/v1/sessions/generation.1/palette', body: { palette: 'Viridis' } });
  assert.deepEqual(doc.getMap('meta').get('palette'), { restore: state });
});

const settings = { test: 'welch', effect: 'hedges_g', correction: 'holm', scope: 'displayed', comparisons: [{ a: 'A', b: 'B' }] };
const presentation = { show: true, pValue: 'adjusted', label: 'stars', fontSize: 12, spacing: 1, tip: 1, nDisplay: 'samples', hidden: [] };

test('an applyViolin intent applies in R and writes the statistics as the Statistics tab saves them', async t => {
  const { r, doc, send } = await setup(t);
  const result = { fingerprint: 'f', dataFingerprint: 'd', rows: [] };
  r.replies.push({ headers: revision(2), body: { status: 'ok', settings, result, policy: {} } });
  await send({ intentId: 'i-1', kind: 'applyViolin', target: { nodeId: 'n1' }, payload: { settings, presentation } });
  assert.deepEqual(r.calls.at(-1), { ...r.calls.at(-1), path: '/api/v1/sessions/generation.1/cards/card-1/statistics/violin', body: { mode: 'apply', settings } });
  assert.deepEqual(doc.getMap('nodes').get('n1').get('statistics'),
    { version: '1', presentation, applied: { ...settings, comparisons: [['A', 'B']] }, result });
});

test('an applyViolin that Team blocks is refused with its reason', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ headers: revision(1), body: { status: 'blocked', reason: 'Too few samples per group', policy: {} } });
  const answer = await send({ intentId: 'i-1', kind: 'applyViolin', target: { nodeId: 'n1' }, payload: { settings, presentation } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'Too few samples per group' });
  assert.equal(doc.getMap('nodes').get('n1').has('statistics'), false);
});

test('a lab member confirmBaseline confirms the reference group in R', async t => {
  const { r, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { id: 'card-1', confirmed: true } });
  const answer = await send({ intentId: 'i-1', kind: 'confirmBaseline', target: { nodeId: 'n1' }, payload: { confirmationToken: 'synthetic-token' } });
  assert.deepEqual(r.calls.at(-1), { ...r.calls.at(-1), path: '/api/v1/sessions/generation.1/cards/card-1/group-comparison/confirm', body: { confirmationToken: 'synthetic-token' } });
  assert.deepEqual(answer, { type: 'intent-result', intentId: 'i-1', revision: 2 });
});

test('a lab member finish writes the snapshot without calling R', async t => {
  const { r, doc, send } = await setup(t);
  const count = r.calls.length, finished = { url: 'data:image/png;base64,AA', createdAt: '2026-11-09T00:00:00Z' };
  const answer = await send({ intentId: 'i-1', kind: 'finish', target: { nodeId: 'n1' }, payload: { finished } });
  assert.deepEqual(answer, { type: 'intent-result', intentId: 'i-1', revision: 1 });
  assert.deepEqual(doc.getMap('nodes').get('n1').get('finished'), finished);
  assert.equal(r.calls.length, count);
});

test('a finish snapshot over 4 MiB is refused', async t => {
  const { doc, send } = await setup(t);
  const finished = { url: `data:image/png;base64,${'A'.repeat(4 * 1024 ** 2)}` };
  const answer = await send({ intentId: 'i-1', kind: 'finish', target: { nodeId: 'n1' }, payload: { finished } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'snapshotBytes' });
  assert.equal(doc.getMap('nodes').get('n1').has('finished'), false);
});

test('an editFigure clears the snapshot', async t => {
  const { doc, send } = await setup(t);
  doc.getMap('nodes').get('n1').set('finished', { url: 'data:image/png;base64,AA' });
  await send({ intentId: 'i-1', kind: 'editFigure', target: { nodeId: 'n1' }, payload: {} });
  assert.equal(doc.getMap('nodes').get('n1').get('finished'), null);
});

// Hardening after the adversarial review of the sidecar (FX1): one case per reviewed scenario.
const token64 = 'a'.repeat(64);

test('an inputs intent carrying the baseline confirmation is refused and R is not called', async t => {
  const { r, send } = await setup(t);
  const count = r.calls.length;
  const answer = await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' },
    payload: { inputs: { 'card-1-gc_baseline_confirmation': token64 } } }, clientEditor);
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'protected_input' });
  assert.equal(r.calls.length, count);
});

test('a createCard intent carrying the baseline confirmation is refused and R is not called', async t => {
  const { r, send } = await setup(t);
  const count = r.calls.length;
  const node = { id: 'n3', kind: 'plot', instance: { id: 'card-3', source: 'pca', inputs: { gc_baseline_confirmation: token64 } } };
  const answer = await send({ intentId: 'i-1', kind: 'createCard', target: { nodeId: 'n3' }, payload: { node } }, staff);
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'protected_input' });
  assert.equal(r.calls.length, count);
});

test('an intent whose connection closed before it ran is refused and R is not called', async t => {
  const { r, send } = await setup(t);
  const count = r.calls.length, socket = { readyState: 1 };
  const answer = send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } }, staff, { socket });
  socket.readyState = 3; // closed while the intent waits on the queue
  assert.deepEqual(await answer, { type: 'refused', intentId: 'i-1', reason: 'connection_closed' });
  assert.equal(r.calls.length, count);
});

test('an intent queued before a viewer downgrade is refused and R is not called', async t => {
  const { r, send } = await setup(t);
  const count = r.calls.length, who = { ...clientEditor };
  const answer = send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } }, who);
  who.role = 'viewer'; // roles.tell pushed the downgrade while the intent waits on the queue
  assert.deepEqual(await answer, { type: 'refused', intentId: 'i-1', reason: 'viewer' });
  assert.equal(r.calls.length, count);
});

test('an intent with an expired token is refused and R is not called', async t => {
  const { r, send } = await setup(t);
  const count = r.calls.length, token = `e30.${Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url')}.sig`;
  const answer = await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } }, staff, { context: { token } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'token_expired' });
  assert.equal(r.calls.length, count);
});

test('an intent outside the caller\'s current Admin scope is refused and R is not called', async t => {
  // Connected while its client could use the workspace; Admin now answers another client for the same token.
  const admin = await fakePostgrest({ 'token-bo': [{ caller: 'bo', caller_view: 'client', client_id: 'bbbbbbbb-0000-4000-8000-00000000000b' }] });
  t.after(() => admin.close());
  const { db } = openDatabase(':memory:'); t.after(() => db.close());
  const { r, send } = await setup(t, { auth: createAuth({ restUrl: admin.url, anonKey: 'anon-test', db }), roles: createRoles(db) });
  const count = r.calls.length;
  const answer = await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } }, clientEditor,
    { context: { token: 'token-bo', userId: 'bo', staff: false } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'forbidden_scope' });
  assert.equal(r.calls.length, count);
});

const newCard = (id, instance) => ({ id, kind: 'plot', instance: { id: instance, source: 'pca', inputs: {} } });

test('a createCard over an existing node is refused and the node keeps its snapshot', async t => {
  const { r, doc, send } = await setup(t);
  doc.getMap('nodes').get('n1').set('finished', { url: 'data:image/png;base64,AA' });
  const count = r.calls.length;
  const answer = await send({ intentId: 'i-1', kind: 'createCard', target: { nodeId: 'n1' }, payload: { node: newCard('n1', 'card-9') } }, clientEditor);
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'node_exists' });
  assert.equal(r.calls.length, count);
  assert.deepEqual(doc.getMap('nodes').get('n1').get('finished'), { url: 'data:image/png;base64,AA' });
});

test('a createCard reusing an existing instance id is refused and R is not called', async t => {
  const { r, send } = await setup(t);
  const count = r.calls.length;
  const answer = await send({ intentId: 'i-1', kind: 'createCard', target: { nodeId: 'n3' }, payload: { node: newCard('n3', 'card-1') } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'instance_exists' });
  assert.equal(r.calls.length, count);
});

test('a createCard whose target is not its node is refused and R is not called', async t => {
  const { r, send } = await setup(t);
  const count = r.calls.length;
  const answer = await send({ intentId: 'i-1', kind: 'createCard', target: { nodeId: 'n4' }, payload: { node: newCard('n3', 'card-3') } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'target_mismatch' });
  assert.equal(r.calls.length, count);
});

test('an intent on a node that does not exist is refused and R is not called', async t => {
  const { r, doc, send } = await setup(t);
  const count = r.calls.length;
  const answer = await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'absent' }, payload: { instance: 'card-1', inputs: { top_n: 9 } } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'unknown_node' });
  assert.equal(r.calls.length, count);
  assert.equal(doc.getMap('nexo').get('nodes')?.has('absent') ?? false, false);
});

test('an intent on a card node patches the node\'s own instance, not payload.instance', async t => {
  const { r, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 9 } } });
  await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { instance: 'card-2', inputs: { top_n: 9 } } });
  assert.deepEqual(patches(r).map(c => c.path), ['/api/v1/sessions/generation.1/cards/card-1']);
});

// A node with no instance (fixed dashboard cards): the R card id comes from the node (client api/instance.ts
// cardInstanceId), never from payload.instance.
const bare = id => new Y.Map([['id', id], ['kind', 'plot']]);

test('a legacy dashboard node without instance patches its own derived card, not payload.instance', async t => {
  const { r, doc, send } = await setup(t);
  doc.getMap('nodes').set('results_dashboard-plot_pca', bare('results_dashboard-plot_pca'));
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 9 } } });
  await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'results_dashboard-plot_pca' }, payload: { instance: 'card-2', inputs: { top_n: 9 } } });
  assert.deepEqual(patches(r).map(c => c.path), ['/api/v1/sessions/generation.1/cards/tcinstance_v0_pca']);
});

test('a fixed family view without instance patches its own derived card, not payload.instance', async t => {
  const { r, doc, send } = await setup(t);
  doc.getMap('nodes').set('lipid_class-heatmap', bare('lipid_class-heatmap'));
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 9 } } });
  await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'lipid_class-heatmap' }, payload: { instance: 'card-2', inputs: { top_n: 9 } } });
  assert.deepEqual(patches(r).map(c => c.path), ['/api/v1/sessions/generation.1/cards/tcinstance_fixed_lipid_class_heatmap']);
});

test('a createCard past the node limit is refused and R is not called', async t => {
  const { r, doc, send } = await setup(t);
  for (let i = 3; i <= 40; i++) doc.getMap('nodes').set(`n${i}`, card(`n${i}`, `card-${i}`));
  const count = r.calls.length;
  const answer = await send({ intentId: 'i-1', kind: 'createCard', target: { nodeId: 'n41' }, payload: { node: newCard('n41', 'card-41') } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'nodes' });
  assert.equal(r.calls.length, count);
});

test('a createCard with an oversize visual is refused and R is not called', async t => {
  const { r, doc, send } = await setup(t);
  const count = r.calls.length;
  const node = { ...newCard('n3', 'card-3'), visual: { plotTitle: 'x'.repeat(24 * 1024 ** 2) } };
  const answer = await send({ intentId: 'i-1', kind: 'createCard', target: { nodeId: 'n3' }, payload: { node } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'teamBytes' });
  assert.equal(r.calls.length, count);
  assert.equal(doc.getMap('nodes').has('n3'), false);
});

test('a repeated intent returns its first result and writes nothing', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 7 } } },
    { headers: revision(3), body: { settled: true, inputs: { top_n: 8 } } });
  await send({ intentId: 'i-a', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 7 } } });
  await send({ intentId: 'i-b', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 8 } } });
  const count = r.calls.length, origins = []; onCommit(doc, tx => origins.push(tx.origin));
  // R would answer the retry of A from its intent store: revision 2, top_n 7.
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 7 } } });
  const answer = await send({ intentId: 'i-a', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 7 } } });
  assert.deepEqual(answer, { type: 'intent-result', intentId: 'i-a', revision: 2 });
  assert.equal(doc.getMap('meta').get('engineRevision'), 3);
  assert.equal(doc.getMap('nodes').get('n1').get('instance').get('inputs').get('top_n'), 8);
  assert.deepEqual(origins, []);
  assert.equal(r.calls.length, count);
});

test('a repeated action is recorded once', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { settled: true } }, { headers: revision(2), body: { settled: true } });
  await send({ intentId: 'i-1', kind: 'action', target: { nodeId: 'n1' }, payload: { actions: ['run'] } });
  await send({ intentId: 'i-1', kind: 'action', target: { nodeId: 'n1' }, payload: { actions: ['run'] } });
  assert.deepEqual(doc.getMap('nexo').get('nodes').get('n1').get('actions'), ['run']);
});

test('an applyViolin keeps the comparison pairs R answers as arrays', async t => {
  const { r, doc, send } = await setup(t);
  const result = { fingerprint: 'f', dataFingerprint: 'd', rows: [] };
  r.replies.push({ headers: revision(2), body: { status: 'ok', settings: { ...settings, comparisons: [['A', 'B']] }, result, policy: {} } });
  await send({ intentId: 'i-1', kind: 'applyViolin', target: { nodeId: 'n1' }, payload: { settings, presentation } });
  assert.deepEqual(doc.getMap('nodes').get('n1').get('statistics').applied.comparisons, [['A', 'B']]);
});

test('an inputs change on a card with applied statistics clears them in the same commit', async t => {
  const { r, doc, send } = await setup(t);
  const result = { fingerprint: 'f', dataFingerprint: 'd', rows: [] };
  doc.getMap('nodes').get('n1').set('statistics', { version: '1', presentation, applied: { ...settings, comparisons: [['A', 'B']] }, result });
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { lipid: 'PE 36:2' } } });
  const origins = []; onCommit(doc, tx => origins.push(tx.origin));
  await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { lipid: 'PE 36:2' } } });
  assert.deepEqual(doc.getMap('nodes').get('n1').get('statistics'), { version: '1', presentation, applied: null, result: null });
  assert.deepEqual(origins, ['server']);
  assert.deepEqual(doc.getMap('meta').get('lastChange'), { nodeId: 'n1', actor: 'ada', displayName: 'Ada', kind: 'inputs', revision: 2 });
});

test('a createCard writes every input R settled, computed controls in the Nexo member', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { instanceId: 'card-3', inputs: { color_by: 'Group2', pca_scale: 'none', customCol_A: '#112233' } } });
  await send({ intentId: 'i-1', kind: 'createCard', target: { nodeId: 'n3' }, payload: { node: newCard('n3', 'card-3') } });
  assert.deepEqual(doc.getMap('nodes').get('n3').get('instance').get('inputs').toJSON(), { color_by: 'Group2', pca_scale: 'none' });
  assert.deepEqual(doc.getMap('nexo').get('nodes').get('n3').get('inputs'), { customCol_A: '#112233' });
});

test('a confirmBaseline that R still asks to confirm is refused and writes nothing', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ headers: revision(1), body: { id: 'card-1', requiresConfirmation: true } });
  const answer = await send({ intentId: 'i-1', kind: 'confirmBaseline', target: { nodeId: 'n1' }, payload: { confirmationToken: token64 } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'requires_confirmation' });
  assert.equal(doc.getMap('meta').has('lastChange'), false);
});

test('a confirmBaseline from before the current engine revision is refused and R is not called', async t => {
  const { r, doc, send } = await setup(t);
  doc.getMap('meta').set('engineRevision', 3);
  const count = r.calls.length;
  const answer = await send({ intentId: 'i-1', kind: 'confirmBaseline', target: { nodeId: 'n1' }, payload: { confirmationToken: token64 }, baseRevision: 2 });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'stale' });
  assert.equal(r.calls.length, count);
});

test('an action intent whose actions are not a list is refused before R and leaves no node', async t => {
  const { r, doc, send } = await setup(t);
  const count = r.calls.length;
  const answer = await send({ intentId: 'i-1', kind: 'action', target: { nodeId: 'n1' }, payload: { actions: {} } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'invalid_payload' });
  assert.equal(r.calls.length, count);
  assert.equal(doc.getMap('nexo').get('nodes')?.has('n1') ?? false, false);
});

test('an inputs intent whose inputs are not an object is refused and R is not called', async t => {
  const { r, doc, send } = await setup(t);
  const count = r.calls.length;
  const answer = await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: 'top_n' } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'invalid_payload' });
  assert.equal(r.calls.length, count);
  assert.deepEqual(doc.getMap('nodes').get('n1').get('instance').get('inputs').toJSON(), { top_n: 5 });
});

test('a createCard whose node has no instance is refused and R is not called', async t => {
  const { r, send } = await setup(t);
  const count = r.calls.length;
  const answer = await send({ intentId: 'i-1', kind: 'createCard', target: { nodeId: 'n3' }, payload: { node: { id: 'n3', kind: 'plot' } } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'invalid_payload' });
  assert.equal(r.calls.length, count);
});

test('an action intent past the Nexo member limit is refused with its name and R is not called', async t => {
  const { r, doc, send } = await setup(t);
  const count = r.calls.length;
  const actions = Array.from({ length: 160_000 }, () => 'runAnalysis');
  const answer = await send({ intentId: 'i-1', kind: 'action', target: { nodeId: 'n1' }, payload: { actions } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'nexoBytes' });
  assert.equal(r.calls.length, count);
  assert.equal(doc.getMap('nexo').get('nodes')?.has('n1') ?? false, false);
});

test('an action intent with inputs forwards both to R in one PATCH', async t => {
  const { r, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 5, case_bucket_A: ['s1'] } } });
  await send({ intentId: 'i-1', kind: 'action', target: { nodeId: 'n1' },
    payload: { inputs: { case_bucket_A: ['s1'] }, actions: ['submit_longitudinal_btn'] } });
  assert.deepEqual(patches(r).map(c => c.body), [{ inputs: { case_bucket_A: ['s1'] }, actions: ['submit_longitudinal_btn'] }]);
});

test('an action intent with inputs commits the settled inputs and the actions', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 5, case_bucket_A: ['s1'] } } });
  await send({ intentId: 'i-1', kind: 'action', target: { nodeId: 'n1' },
    payload: { inputs: { case_bucket_A: ['s1'] }, actions: ['submit_longitudinal_btn'] } });
  assert.deepEqual(doc.getMap('nexo').get('nodes').get('n1').toJSON(), { inputs: { case_bucket_A: ['s1'] }, actions: ['submit_longitudinal_btn'] });
});

test('an action intent carrying the baseline confirmation is refused and R is not called', async t => {
  const { r, send } = await setup(t);
  const count = r.calls.length;
  const answer = await send({ intentId: 'i-1', kind: 'action', target: { nodeId: 'n1' },
    payload: { inputs: { violin_gc_baseline_confirmation: 'x' }, actions: ['run'] } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'protected_input' });
  assert.equal(r.calls.length, count);
});

test('an inputs intent commits every input R settled, dependent controls and explicit nulls included', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 5, sortBy: 'log2fc', bottom_sortBy: 'log2fc', label: null } } });
  await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { bottom_sortBy: 'log2fc' } } });
  assert.deepEqual(doc.getMap('nodes').get('n1').get('instance').get('inputs').toJSON(),
    { top_n: 5, sortBy: 'log2fc', bottom_sortBy: 'log2fc', label: null });
});

test('a createCard keeps an input R settled to null', async t => {
  const { r, doc, send } = await setup(t);
  r.replies.push({ headers: revision(2), body: { instanceId: 'card-3', inputs: { top_n: null } } });
  const node = { ...newCard('n3', 'card-3'), instance: { id: 'card-3', source: 'pca', inputs: { top_n: 4 } } };
  await send({ intentId: 'i-1', kind: 'createCard', target: { nodeId: 'n3' }, payload: { node } });
  assert.deepEqual(doc.getMap('nodes').get('n3').get('instance').get('inputs').toJSON(), { top_n: null });
});

for (const [kind, payload] of [['cohort', { lipids: ['PE 36:2'] }], ['design', { unit: 'sample', type: 'paired' }],
  ['analysis', { inputs: { normalization: 'median' } }]]) {
  test(`${kind} clears applied statistics on every node in the same commit`, async t => {
    const { r, doc, send } = await setup(t);
    const result = { fingerprint: 'f', dataFingerprint: 'd', rows: [] };
    for (const id of ['n1', 'n2']) doc.getMap('nodes').get(id).set('statistics', { version: '1', presentation, applied: { ...settings, comparisons: [['A', 'B']] }, result });
    r.replies.push({ headers: revision(2), body: { lipids: ['PE 36:2'], confirmed: true } });
    const origins = []; onCommit(doc, tx => origins.push(tx.origin));
    await send({ intentId: 'i-1', kind, target: {}, payload });
    for (const id of ['n1', 'n2']) {
      assert.deepEqual(doc.getMap('nodes').get(id).get('statistics'), { version: '1', presentation, applied: null, result: null });
    }
    assert.deepEqual(origins, ['server']);
  });
}

test('a busy R is re-asked with the same intent id after Retry-After', async t => {
  const { r, send } = await setup(t);
  r.replies.push({ status: 503, headers: { 'Retry-After': '0' }, body: { error: 'busy', message: 'The engine is busy with another request; retry shortly.' } },
    { headers: revision(2), body: { settled: true, inputs: { top_n: 9 } } });
  const answer = await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } });
  assert.deepEqual(patches(r).map(c => c.intent), ['i-1', 'i-1']);
  assert.deepEqual(answer, { type: 'intent-result', intentId: 'i-1', revision: 2 });
});

test('a busy R whose Retry-After passes the deadline is refused without waiting', async t => {
  const { r, send } = await setup(t);
  r.replies.push({ status: 503, headers: { 'Retry-After': '3600' }, body: { error: 'busy', message: 'The engine is busy with another request; retry shortly.' } });
  const answer = await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } });
  assert.deepEqual(answer, { type: 'refused', intentId: 'i-1', reason: 'The engine is busy with another request; retry shortly.' });
  assert.equal(patches(r).length, 1);
});

test('a committed intent appends one activity entry in its own transaction', async t => {
  const { r, doc, send } = await setup(t);
  doc.getMap('nodes').get('n1').set('label', new Y.Text('Feature distributions'));
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 9 } } });
  const touched = []; onCommit(doc, tx => touched.push(tx.changed.has(doc.getArray('activity'))));
  await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } });
  assert.deepEqual(touched, [true]);
  const [entry] = doc.getArray('activity').toArray();
  assert.equal(typeof entry.at, 'number');
  assert.deepEqual({ ...entry, at: 0 }, { at: 0, actor: 'ada', displayName: 'Ada', kind: 'inputs', nodeId: 'n1', label: 'Feature distributions' });
});

test('activity keeps the last 200 entries', async t => {
  const { r, doc, send } = await setup(t);
  doc.getArray('activity').push(Array.from({ length: 200 }, (_, i) => ({ at: i, kind: 'old' })));
  r.replies.push({ headers: revision(2), body: { settled: true, inputs: { top_n: 9 } } });
  await send({ intentId: 'i-1', kind: 'inputs', target: { nodeId: 'n1' }, payload: { inputs: { top_n: 9 } } });
  const activity = doc.getArray('activity').toArray();
  assert.equal(activity.length, 200);
  assert.equal(activity[0].at, 1);
  assert.equal(activity.at(-1).kind, 'inputs');
});
