// Admission over the raw Hocuspocus protocol (docs/integration/nexo-collab-plan.md 2.1 "Collab messages" and
// "Protected document fields", 2.3 limits; Phase 2 as cut: staff are Editors, client members Viewers).
// Hand-built messages: [varString document][varUint type] then the type's body (see @hocuspocus/server MessageType).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { fakePostgrest } from './fake-postgrest.mjs';
import { fakeR } from './fake-r.mjs';
import { openDatabase } from '../src/db.mjs';
import { start } from '../src/server.mjs';

const clientA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const projectA = '0a000000-0000-4000-8000-000000000001';
const staffId = '44444444-0000-4000-8000-000000000004';
const staffB = '55555555-0000-4000-8000-000000000005';
const staffC = '66666666-0000-4000-8000-000000000006';
// A JWT-shaped synthetic token whose payload carries the displayName claim (signature irrelevant: Admin vouches for it).
const namedToken = `e30.${Buffer.from(JSON.stringify({ displayName: 'Ada Example' })).toString('base64url')}.sig`;
const callers = {
  'token-staff': [{ caller: staffId, caller_view: 'staff', client_id: null }],
  'token-staff-b': [{ caller: staffB, caller_view: 'staff', client_id: null }],
  'token-staff-c': [{ caller: staffC, caller_view: 'staff', client_id: null }],
  [namedToken]: [{ caller: staffId, caller_view: 'staff', client_id: null }],
  'token-a': [{ caller: '11111111-0000-4000-8000-000000000001', caller_view: 'client', client_id: clientA }],
  'token-client-c': [{ caller: '77777777-0000-4000-8000-000000000007', caller_view: 'client', client_id: clientA }],
};
const Sync = 0, AwarenessMessage = 1, Auth = 2, Stateless = 5, SyncStatus = 8;

let admin;
let dir;
before(async () => {
  admin = await fakePostgrest(callers);
  dir = mkdtempSync(joinPath(tmpdir(), 'nexo-admission-'));
});
after(async () => {
  await admin.close();
  rmSync(dir, { recursive: true, force: true });
});

// The board every test starts from: one plot node with R-settled inputs and a session in meta (with `origin`, the
// project meta POST /collab/projects writes, so that the engine opens an R session); `seed` adds to it first.
function board({ origin = false, seed = () => {} } = {}) {
  const doc = new Y.Doc();
  seed(doc);
  const node = new Y.Map();
  doc.getMap('nodes').set('n1', node);
  node.set('id', 'n1');
  node.set('x', 10);
  node.set('label', new Y.Text('Lipid'));
  const instance = new Y.Map();
  node.set('instance', instance);
  instance.set('id', 'cell_lipid_plot');
  instance.set('inputs', new Y.Map([['lipid', 'PC 34:1']]));
  doc.getMap('meta').set('session', { id: 'g.r', generation: 'g' });
  if (origin) {
    for (const [key, value] of Object.entries({ project: projectA, workspace: `nexo-client-${clientA}`, origin: { checkpointId: 'synthetic' } })) {
      doc.getMap('meta').set(key, value);
    }
  }
  return Y.encodeStateAsUpdate(doc);
}

// Same start helper as server.test.mjs: a database with project A (and, unless empty, the board) and a server on it.
let databases = 0;
async function serve(t, { empty = false, apiUrl, seed } = {}) {
  const path = joinPath(dir, `${++databases}.sqlite`);
  const { db } = openDatabase(path);
  db.prepare('INSERT INTO projects (id, workspace) VALUES (?, ?)').run(projectA, `nexo-client-${clientA}`);
  // The client member (token-a) is a Viewer of project A (by default it would be a Commenter, D8).
  db.prepare("INSERT INTO members (project, user_id, role) VALUES (?, ?, 'viewer')").run(projectA, callers['token-a'][0].caller);
  if (!empty) db.prepare("INSERT INTO documents (name, data, updated_at) VALUES (?, ?, 'now')").run(projectA, board({ origin: !!apiUrl, seed }));
  db.close();
  const server = await start({ port: 0, dbPath: path, restUrl: admin.url, anonKey: 'anon-test', apiUrl, serviceSecret: 'synthetic-secret' });
  t.after(() => server.close());
  return server;
}

const message = (type, write) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarString(encoder, projectA);
  encoding.writeVarUint(encoder, type);
  write(encoder);
  return encoding.toUint8Array(encoder);
};

// A raw client: authenticates, syncs the server state into `doc`, and keeps every incoming message.
async function join(t, server, token) {
  const ws = new WebSocket(`${server.wsUrl}/collab`);
  t.after(() => ws.close());
  ws.binaryType = 'arraybuffer';
  const doc = new Y.Doc();
  const inbox = [];
  const waiting = new Set();
  ws.onmessage = ({ data }) => {
    const decoder = decoding.createDecoder(new Uint8Array(data));
    decoding.readVarString(decoder);
    const type = decoding.readVarUint(decoder);
    const m = { type };
    if (type === Sync) {
      m.step = decoding.readVarUint(decoder);
      m.payload = decoding.readVarUint8Array(decoder);
      if (m.step !== 0) Y.applyUpdate(doc, m.payload, 'server');
    } else if (type === AwarenessMessage) m.payload = decoding.readVarUint8Array(decoder);
    else if (type === Auth) { m.auth = decoding.readVarUint(decoder); m.scope = decoding.readVarString(decoder); }
    else if (type === Stateless) m.payload = JSON.parse(decoding.readVarString(decoder));
    else if (type === SyncStatus) m.saved = decoding.readVarUint(decoder) === 1;
    inbox.push(m);
    for (const w of waiting) if (w.match(m)) { waiting.delete(w); w.resolve(m); }
  };
  const next = match => new Promise(resolve => waiting.add({ match, resolve }));
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const authenticated = next(m => m.type === Auth);
  ws.send(message(Auth, e => { encoding.writeVarUint(e, 0); encoding.writeVarString(e, token); }));
  assert.equal((await authenticated).auth, 2, 'authenticated');
  const synced = next(m => m.type === Sync && m.step === 1);
  ws.send(message(Sync, e => { encoding.writeVarUint(e, 0); encoding.writeVarUint8Array(e, Y.encodeStateVector(doc)); }));
  await synced;
  return {
    doc, inbox, next,
    /** Applies `change` locally, sends it as one Y update, and answers the server's verdict and any refusal. */
    async edit(change) {
      let update;
      doc.once('update', u => { update = u; });
      doc.transact(() => change(doc));
      const seen = inbox.length;
      const status = next(m => m.type === SyncStatus);
      ws.send(message(Sync, e => { encoding.writeVarUint(e, 2); encoding.writeVarUint8Array(e, update); }));
      const { saved } = await status;
      return { saved, refused: inbox.slice(seen).find(m => m.type === Stateless)?.payload };
    },
    /** Sends a stateless message (an intent) and answers the next stateless message the server sends back. */
    async say(payload) {
      const answer = next(m => m.type === Stateless);
      ws.send(message(Stateless, e => encoding.writeVarString(e, JSON.stringify(payload))));
      return (await answer).payload;
    },
    sendStateless(payload) {
      ws.send(message(Stateless, e => encoding.writeVarString(e, JSON.stringify(payload))));
    },
    sendAwareness(state) {
      const awareness = new Awareness(doc);
      awareness.setLocalState(state);
      ws.send(message(AwarenessMessage, e => encoding.writeVarUint8Array(e, encodeAwarenessUpdate(awareness, [doc.clientID]))));
      awareness.destroy();
    },
  };
}

// What a newcomer sees: the server's document after a fresh sync.
async function serverState(t, server) {
  return (await join(t, server, 'token-staff')).doc;
}
const node = doc => doc.getMap('nodes').get('n1');

test('viewer update is refused', async t => {
  const server = await serve(t);
  const viewer = await join(t, server, 'token-a');
  const answer = await viewer.edit(doc => node(doc).set('x', 99));
  assert.deepEqual(answer, { saved: false, refused: { type: 'refused', reason: 'viewer', paths: ['nodes.n1.x'] } });
  assert.equal(node(await serverState(t, server)).get('x'), 10);
});

test('editor moving a node is accepted', async t => {
  const server = await serve(t);
  const editor = await join(t, server, 'token-staff');
  assert.deepEqual(await editor.edit(doc => node(doc).set('x', 99)), { saved: true, refused: undefined });
  assert.equal(node(await serverState(t, server)).get('x'), 99);
});

test('editor writing meta.session is refused', async t => {
  const server = await serve(t);
  const editor = await join(t, server, 'token-staff');
  const answer = await editor.edit(doc => doc.getMap('meta').set('session', { id: 'forged', generation: 'forged' }));
  assert.deepEqual(answer, { saved: false, refused: { type: 'refused', reason: 'protected', paths: ['meta.session.id', 'meta.session.generation'] } });
  assert.deepEqual((await serverState(t, server)).getMap('meta').get('session'), { id: 'g.r', generation: 'g' });
});

test('editor writing instance inputs with a node move is refused whole', async t => {
  const server = await serve(t);
  const editor = await join(t, server, 'token-staff');
  const answer = await editor.edit(doc => {
    node(doc).set('x', 99);
    node(doc).get('instance').get('inputs').set('lipid', 'PE 36:2');
  });
  assert.deepEqual(answer,
    { saved: false, refused: { type: 'refused', reason: 'protected', paths: ['nodes.n1.instance.inputs.lipid'] } });
  const state = node(await serverState(t, server));
  assert.equal(state.get('x'), 10);
  assert.equal(state.get('instance').get('inputs').get('lipid'), 'PC 34:1');
});

test('editor writing activity is refused', async t => {
  const server = await serve(t);
  const editor = await join(t, server, 'token-staff');
  const answer = await editor.edit(doc => doc.getArray('activity').push([{ at: 1, actor: 'forged', kind: 'save' }]));
  assert.deepEqual(answer, { saved: false, refused: { type: 'refused', reason: 'protected', paths: ['activity'] } });
  assert.equal((await serverState(t, server)).getArray('activity').length, 0);
});

test('editor changing a node\'s instance id is refused', async t => {
  const server = await serve(t);
  const editor = await join(t, server, 'token-staff');
  const answer = await editor.edit(doc => node(doc).get('instance').set('id', 'card-2'));
  assert.deepEqual(answer, { saved: false, refused: { type: 'refused', reason: 'protected', paths: ['nodes.n1.instance.id'] } });
  assert.equal(node(await serverState(t, server)).get('instance').get('id'), 'cell_lipid_plot');
});

test('editor writing a node\'s instance source is refused', async t => {
  const server = await serve(t);
  const editor = await join(t, server, 'token-staff');
  const answer = await editor.edit(doc => node(doc).get('instance').set('source', 'pca'));
  assert.deepEqual(answer, { saved: false, refused: { type: 'refused', reason: 'protected', paths: ['nodes.n1.instance.source'] } });
  assert.equal(node(await serverState(t, server)).get('instance').has('source'), false);
});

test('oversize update is refused', async t => {
  const server = await serve(t);
  const editor = await join(t, server, 'token-staff');
  const answer = await editor.edit(doc => node(doc).set('visual', { plotTitle: 'x'.repeat(24 * 1024 ** 2) }));
  assert.deepEqual(answer,
    { saved: false, refused: { type: 'refused', reason: 'teamBytes', paths: ['nodes.n1.visual.plotTitle'] } });
  assert.equal(node(await serverState(t, server)).get('visual'), undefined);
});

test('oversize update outside the board is refused', async t => {
  const server = await serve(t);
  const editor = await join(t, server, 'token-staff');
  const answer = await editor.edit(doc => doc.getMap('comments').set('c1', 'x'.repeat(32 * 1024 ** 2)));
  assert.deepEqual(answer, { saved: false, refused: { type: 'refused', reason: 'totalBytes', paths: ['comments.c1'] } });
  assert.equal((await serverState(t, server)).getMap('comments').get('c1'), undefined);
});

test('the first opener seeds an empty document', async t => {
  const server = await serve(t, { empty: true });
  const editor = await join(t, server, 'token-staff');
  const answer = await editor.edit(doc => Y.applyUpdate(doc, board()));
  assert.deepEqual(answer, { saved: true, refused: undefined });
  assert.equal(node(await serverState(t, server)).get('instance').get('inputs').get('lipid'), 'PC 34:1');
});

test('a first seed carrying activity is refused', async t => {
  const server = await serve(t, { empty: true });
  const editor = await join(t, server, 'token-staff');
  const answer = await editor.edit(doc => { Y.applyUpdate(doc, board()); doc.getArray('activity').push([{ at: 1, actor: 'forged', kind: 'save' }]); });
  assert.deepEqual(answer, { saved: false, refused: { type: 'refused', reason: 'protected', paths: ['activity'] } });
});

test('editor writing finished is refused', async t => {
  const server = await serve(t);
  const editor = await join(t, server, 'token-staff');
  const answer = await editor.edit(doc => node(doc).set('finished', null));
  assert.deepEqual(answer, { saved: false, refused: { type: 'refused', reason: 'protected', paths: ['nodes.n1.finished'] } });
  assert.equal(node(await serverState(t, server)).has('finished'), false);
});

test('editor writing statistics applied is refused', async t => {
  const server = await serve(t);
  const editor = await join(t, server, 'token-staff');
  const answer = await editor.edit(doc => node(doc).set('statistics', { applied: { test: 'welch' } }));
  assert.deepEqual(answer,
    { saved: false, refused: { type: 'refused', reason: 'protected', paths: ['nodes.n1.statistics.applied.test'] } });
  assert.equal(node(await serverState(t, server)).has('statistics'), false);
});

test('editor writing statistics presentation is accepted', async t => {
  const server = await serve(t);
  const editor = await join(t, server, 'token-staff');
  assert.deepEqual(await editor.edit(doc => node(doc).set('statistics', { presentation: { show: true } })),
    { saved: true, refused: undefined });
});

test('the sidecar writing finished for a finish intent passes', async t => {
  const r = await fakeR(); t.after(() => r.close());
  const server = await serve(t, { apiUrl: r.url });
  const editor = await join(t, server, 'token-staff');
  await r.seen(c => c.path.endsWith('/lease'));
  const finished = { url: 'data:image/png;base64,AA' };
  const answer = await editor.say({ type: 'intent', intentId: 'i-1', kind: 'finish', target: { nodeId: 'n1' }, payload: { finished }, baseRevision: 1 });
  assert.equal(answer.type, 'intent-result');
  assert.deepEqual(node(await serverState(t, server)).get('finished'), finished);
});

// The awareness states another member receives for `token`'s client after it sends `state`.
async function stamped(t, token, state) {
  const server = await serve(t);
  const observer = await join(t, server, 'token-a');
  const sender = await join(t, server, token);
  const received = observer.next(m => m.type === AwarenessMessage);
  sender.sendAwareness(state);
  const awareness = new Awareness(new Y.Doc());
  applyAwarenessUpdate(awareness, (await received).payload, 'test');
  awareness.destroy(); // stops its outdated-state timer
  return awareness.getStates().get(sender.doc.clientID);
}

test('forged awareness identity is overwritten', async t => {
  const state = await stamped(t, 'token-staff', { userId: 'forged', displayName: 'Mallory', kind: 'client', role: 'owner',
    colour: '#000000', cursor: { x: 1, y: 2 } });
  assert.match(state.colour, /^hsl\(\d+ 65% 45%\)$/);
  assert.deepEqual({ ...state, colour: undefined }, { userId: staffId, displayName: 'Lab staff', kind: 'staff',
    role: 'editor', colour: undefined, cursor: { x: 1, y: 2 } });
});

test('awareness displayName comes from the token claim', async t => {
  const state = await stamped(t, namedToken, { displayName: 'Mallory' });
  assert.equal(state.displayName, 'Ada Example');
});

// Phase 6 as cut: a comment is a Y.Map in 'comments' with its replies in a Y.Array.
function addComment(doc, id, fields = {}) {
  const comment = new Y.Map();
  doc.getMap('comments').set(id, comment);
  for (const [key, value] of Object.entries({ x: 10, y: 20, author: 'forged', displayName: 'Mallory', text: 'Check the PC scale',
    createdAt: '2026-11-09T00:00:00Z', resolved: false, ...fields })) comment.set(key, value);
  comment.set('replies', new Y.Array());
}
const comment = (doc, id = 'c1') => doc.getMap('comments').get(id).toJSON();

test('viewer comment is refused', async t => {
  const server = await serve(t);
  const viewer = await join(t, server, 'token-a');
  const answer = await viewer.edit(doc => addComment(doc, 'c1'));
  assert.deepEqual(answer, { saved: false, refused: { type: 'refused', reason: 'viewer', paths: ['comments.c1'] } });
  assert.equal((await serverState(t, server)).getMap('comments').size, 0);
});

test('comment author is stamped', async t => {
  const server = await serve(t);
  const editor = await join(t, server, namedToken);
  assert.deepEqual(await editor.edit(doc => addComment(doc, 'c1')), { saved: true, refused: undefined });
  const stored = comment(await serverState(t, server));
  assert.deepEqual([stored.author, stored.displayName, stored.text], [staffId, 'Ada Example', 'Check the PC scale']);
});

test('comment and reply say whether lab staff or a client member wrote them', async t => {
  const server = await serve(t);
  const client = await join(t, server, 'token-client-c'); // a client member is a Commenter by default (D8)
  assert.deepEqual(await client.edit(doc => addComment(doc, 'c1', { kind: 'staff' })), { saved: true, refused: undefined });
  const staff = await join(t, server, 'token-staff');
  await staff.edit(doc => doc.getMap('comments').get('c1').get('replies').push([{ author: 'forged', displayName: 'Mallory', kind: 'client', text: 'Done', createdAt: '2026-11-09T00:01:00Z' }]));
  const stored = comment(await serverState(t, server));
  assert.deepEqual([stored.kind, stored.replies.map(r => r.kind)], ['client', ['staff']]);
});

test("editing someone else's comment text is refused", async t => {
  const server = await serve(t);
  const a = await join(t, server, 'token-staff');
  await a.edit(doc => addComment(doc, 'c1'));
  const b = await join(t, server, 'token-staff-b');
  const answer = await b.edit(doc => doc.getMap('comments').get('c1').set('text', 'Rewritten'));
  assert.deepEqual(answer, { saved: false, refused: { type: 'refused', reason: 'comment', paths: ['comments.c1.text'] } });
  assert.equal(comment(await serverState(t, server)).text, 'Check the PC scale');
});

test("another editor may resolve and reply to someone else's comment", async t => {
  const server = await serve(t);
  const a = await join(t, server, 'token-staff');
  await a.edit(doc => addComment(doc, 'c1'));
  const b = await join(t, server, 'token-staff-b');
  const answer = await b.edit(doc => {
    const c1 = doc.getMap('comments').get('c1');
    c1.set('resolved', true);
    c1.get('replies').push([{ author: 'forged', displayName: 'Mallory', text: 'Done', createdAt: '2026-11-09T00:01:00Z' }]);
  });
  assert.deepEqual(answer, { saved: true, refused: undefined });
  const stored = comment(await serverState(t, server));
  assert.equal(stored.resolved, true);
  assert.equal(stored.author, staffId);
  assert.deepEqual(stored.replies.map(r => [r.author, r.text]), [[staffB, 'Done']]);
});

test('a summon reaches the other connections of the project', { timeout: 5000 }, async t => {
  const server = await serve(t);
  const a = await join(t, server, 'token-staff');
  const b = await join(t, server, 'token-staff-b');
  const received = b.next(m => m.type === Stateless);
  a.sendStateless({ type: 'summon', from: 7 });
  assert.deepEqual((await received).payload, { type: 'summon', from: 7 });
});

test('a viewer summon is not relayed', { timeout: 5000 }, async t => {
  const server = await serve(t);
  const viewer = await join(t, server, 'token-a');
  const b = await join(t, server, 'token-staff-b');
  viewer.sendStateless({ type: 'summon', from: 7 });
  const a = await join(t, server, 'token-staff');
  const received = b.next(m => m.type === Stateless);
  a.sendStateless({ type: 'summon', from: 8 });
  assert.deepEqual((await received).payload, { type: 'summon', from: 8 }, 'the first summon b receives is the editor one');
});

test('an entry stored before comments had a shape can be replaced', { timeout: 5000 }, async t => {
  const server = await serve(t, { seed: doc => doc.getMap('comments').set('c1', 'left by Phase 2') });
  const b = await join(t, server, 'token-staff-b');
  assert.deepEqual(await b.edit(doc => addComment(doc, 'c1')), { saved: true, refused: undefined });
  assert.equal(comment(await serverState(t, server)).author, staffB);
});

// Alice (token-staff) owns c1 and Bob (token-staff-b) has replied; a fresh join of Alice sees his stamped reply.
async function threadWithBobsReply(t, server) {
  const alice = await join(t, server, 'token-staff');
  await alice.edit(doc => addComment(doc, 'c1'));
  const bob = await join(t, server, 'token-staff-b');
  await bob.edit(doc => doc.getMap('comments').get('c1').get('replies').push([{ text: 'Done', createdAt: '2026-11-09T00:01:00Z' }]));
  return join(t, server, 'token-staff');
}

test("a thread author's delete of someone else's reply is refused", { timeout: 5000 }, async t => {
  const server = await serve(t);
  const alice = await threadWithBobsReply(t, server);
  const answer = await alice.edit(doc => doc.getMap('comments').get('c1').get('replies').delete(0, 1));
  assert.deepEqual(answer, { saved: false, refused: { type: 'refused', reason: 'comment', paths: ['comments.c1.replies'] } });
  assert.deepEqual(comment(await serverState(t, server)).replies.map(r => [r.author, r.text]), [[staffB, 'Done']]);
});

test("deleting a thread that holds someone else's reply is refused", { timeout: 5000 }, async t => {
  const server = await serve(t);
  const alice = await threadWithBobsReply(t, server);
  const answer = await alice.edit(doc => doc.getMap('comments').delete('c1'));
  assert.deepEqual(answer, { saved: false, refused: { type: 'refused', reason: 'comment', paths: ['comments.c1'] } });
  assert.deepEqual(comment(await serverState(t, server)).replies.map(r => [r.author, r.text]), [[staffB, 'Done']]);
});

test("an exact copy of someone else's reply is stamped with its sender and the original keeps its author", { timeout: 5000 }, async t => {
  const server = await serve(t);
  await threadWithBobsReply(t, server);
  const eve = await join(t, server, 'token-staff-c');
  const answer = await eve.edit(doc => {
    const replies = doc.getMap('comments').get('c1').get('replies');
    replies.push([JSON.parse(JSON.stringify(replies.get(0)))]);
  });
  assert.deepEqual(answer, { saved: true, refused: undefined });
  assert.deepEqual(comment(await serverState(t, server)).replies.map(r => r.author), [staffB, staffC]);
});

// UX-A4: a thread's votes are a Y.Map keyed by userId (value true); each person sets or deletes only their own key.
const clientC = callers['token-client-c'][0].caller;
const votes = (doc, id = 'c1') => {
  const c = doc.getMap('comments').get(id);
  if (!(c.get('votes') instanceof Y.Map)) c.set('votes', new Y.Map());
  return c.get('votes');
};

test('a commenter may set and delete their own vote', { timeout: 5000 }, async t => {
  const server = await serve(t);
  await (await join(t, server, 'token-staff')).edit(doc => addComment(doc, 'c1'));
  const client = await join(t, server, 'token-client-c'); // a Commenter (D8), not the author
  assert.deepEqual(await client.edit(doc => votes(doc).set(clientC, true)), { saved: true, refused: undefined });
  assert.deepEqual(comment(await serverState(t, server)).votes, { [clientC]: true });
  assert.deepEqual(await client.edit(doc => votes(doc).delete(clientC)), { saved: true, refused: undefined });
  assert.deepEqual(comment(await serverState(t, server)).votes, {});
});

test("setting someone else's vote is refused, even on one's own thread", { timeout: 5000 }, async t => {
  const server = await serve(t);
  const alice = await join(t, server, 'token-staff');
  await alice.edit(doc => { addComment(doc, 'c1'); votes(doc); });
  const answer = await alice.edit(doc => votes(doc).set(staffB, true));
  assert.deepEqual(answer, { saved: false, refused: { type: 'refused', reason: 'comment', paths: [`comments.c1.votes.${staffB}`] } });
  assert.deepEqual(comment(await serverState(t, server)).votes, {});
});

test('a viewer vote is refused', { timeout: 5000 }, async t => {
  const server = await serve(t);
  await (await join(t, server, 'token-staff')).edit(doc => { addComment(doc, 'c1'); votes(doc); });
  const viewer = await join(t, server, 'token-a');
  const answer = await viewer.edit(doc => votes(doc).set(callers['token-a'][0].caller, true));
  assert.deepEqual(answer, { saved: false, refused: { type: 'refused', reason: 'viewer', paths: [`comments.c1.votes.${callers['token-a'][0].caller}`] } });
  assert.deepEqual(comment(await serverState(t, server)).votes, {});
});

test('project list shows a connected person from awareness', async t => {
  const server = await serve(t);
  const observer = await join(t, server, 'token-staff');
  const person = await join(t, server, 'token-staff-b');
  const received = observer.next(m => m.type === AwarenessMessage);
  person.sendAwareness({});
  await received;
  const response = await fetch(`${server.httpUrl}/collab/projects`, { headers: { 'X-Nexo-Admin-Token': 'token-staff' } });
  const { projects } = await response.json();
  assert.deepEqual(projects[0].online, [{ userId: staffB, displayName: 'Lab staff' }]);
});
