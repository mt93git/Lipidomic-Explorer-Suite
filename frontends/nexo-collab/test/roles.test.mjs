// Roles (docs/integration/nexo-collab-plan.md 2.1 "Collab messages", Phase 5 as cut): one members table, the effective
// role (row, else owner for the creator, else lab staff editor, else client member commenter), the matrix enforced on
// updates and intents, {type:'role'} on connect and after a change, and the members routes. Fake Admin and fake R at
// the HTTP edge; synthetic ids only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { fakePostgrest } from './fake-postgrest.mjs';
import { fakeR } from './fake-r.mjs';
import { openDatabase } from '../src/db.mjs';
import { createRoles } from '../src/roles.mjs';
import { register } from '../src/commits.mjs';
import { start } from '../src/server.mjs';

const client = 'cccccccc-0000-4000-8000-00000000000c';
const workspace = `nexo-client-${client}`;
const ids = { staff: '44444444-0000-4000-8000-000000000004', owner: '11111111-0000-4000-8000-000000000001',
  member: '22222222-0000-4000-8000-000000000002' };
const callers = {
  'token-staff': [{ caller: ids.staff, caller_view: 'staff' }],
  'token-owner': [{ caller: ids.owner, caller_view: 'client', client_id: client }],
  'token-member': [{ caller: ids.member, caller_view: 'client', client_id: client }],
};
// What admin.nexo_people answers for the client (its kind is 'staff' or 'member', Admin 0017), with columns the sidecar
// must never pass on.
const people = { [client]: [
  { user_id: ids.staff, display_name: 'Ada', kind: 'staff', client_role: null, email: 'ada@example.org' },
  { user_id: ids.owner, display_name: 'Olive', kind: 'member', client_role: 'Admin', email: 'olive@example.org' },
  { user_id: ids.member, display_name: 'Milo', kind: 'member', client_role: 'Viewer', email: 'milo@example.org' },
] };


async function setup(t, options = {}) {
  const admin = await fakePostgrest(callers, { people });
  const r = await fakeR();
  const server = await start({ port: 0, dbPath: ':memory:', restUrl: admin.url, anonKey: 'anon-test', apiUrl: r.url, serviceSecret: 'synthetic-secret', ...options });
  t.after(async () => { await server.close(); await r.close(); await admin.close(); });
  const http = (method, path, token, body) => fetch(`${server.httpUrl}/collab/projects${path}`, { method,
    headers: { 'Content-Type': 'application/json', 'X-Nexo-Admin-Token': token }, body: body && JSON.stringify(body) });
  const create = async (token, space = workspace) => (await (await http('POST', '', token,
    { workspace: space, origin: { kind: 'checkpoint', id: 'synthetic-checkpoint' } })).json()).projectId;
  const setRole = (project, token, userId, role) => http('PUT', `/${project}/members/${userId}`, token, { role });
  // A person on the board: `next(type)` resolves with the next stateless message of that type, already received or to come.
  const connect = (project, token) => new Promise((resolve, reject) => {
    const inbox = [], waiting = [];
    // A long reconnect timeout: a test that moves the mocked Date forward must not make the provider reconnect.
    const provider = new HocuspocusProvider({ url: `${server.wsUrl}/collab`, name: project, token, messageReconnectTimeout: 600_000,
      onStateless: ({ payload }) => {
        const message = JSON.parse(payload), i = waiting.findIndex(w => w.type === message.type);
        if (i >= 0) waiting.splice(i, 1)[0].resolve(message); else inbox.push(message);
      },
      onSynced: () => resolve({ provider, doc: provider.document, next }),
      onAuthenticationFailed: ({ reason }) => reject(new Error(reason)) });
    const next = type => {
      const i = inbox.findIndex(m => m.type === type);
      return i >= 0 ? Promise.resolve(inbox.splice(i, 1)[0]) : new Promise(resolve => waiting.push({ type, resolve }));
    };
    t.after(() => provider.destroy());
  });
  return { admin, http, create, setRole, connect };
}
const intent = (person, kind, payload = {}) => {
  person.provider.sendStateless(JSON.stringify({ type: 'intent', intentId: `i-${kind}`, kind, target: { nodeId: 'n1' }, payload, baseRevision: 1 }));
  return Promise.race([person.next('refused'), person.next('intent-result')]);
};
const sessionReady = ({ doc }) => new Promise(resolve => {
  const meta = doc.getMap('meta');
  if (meta.has('session')) resolve(); else meta.observe(() => meta.has('session') && resolve());
});

function rolesOn(t) {
  const { db } = openDatabase(':memory:');
  t.after(() => db.close());
  db.prepare('INSERT INTO projects (id, workspace, created_by) VALUES (?, ?, ?)').run('p1', workspace, ids.owner);
  return { db, roles: createRoles(db) };
}

test('default roles: creator owner, staff editor, client member commenter', t => {
  const { roles } = rolesOn(t);
  assert.equal(roles.effectiveRole('p1', { userId: ids.owner, staff: false }), 'owner');
  assert.equal(roles.effectiveRole('p1', { userId: ids.staff, staff: true }), 'editor');
  assert.equal(roles.effectiveRole('p1', { userId: ids.member, staff: false }), 'commenter');
});

test('a members row overrides the default role', t => {
  const { db, roles } = rolesOn(t);
  db.prepare("INSERT INTO members (project, user_id, role) VALUES ('p1', ?, 'viewer')").run(ids.staff);
  db.prepare("INSERT INTO members (project, user_id, role) VALUES ('p1', ?, 'editor')").run(ids.member);
  assert.equal(roles.effectiveRole('p1', { userId: ids.staff, staff: true }), 'viewer');
  assert.equal(roles.effectiveRole('p1', { userId: ids.member, staff: false }), 'editor');
});

test('on connect each person is told its role and whether it may share', { timeout: 10_000 }, async t => {
  const { create, connect } = await setup(t);
  const project = await create('token-owner');
  assert.deepEqual(await (await connect(project, 'token-owner')).next('role'), { type: 'role', role: 'owner', canShare: true });
  assert.deepEqual(await (await connect(project, 'token-staff')).next('role'), { type: 'role', role: 'editor', canShare: true });
  assert.deepEqual(await (await connect(project, 'token-member')).next('role'), { type: 'role', role: 'commenter', canShare: false });
});

test('commenter board update is refused', { timeout: 10_000 }, async t => {
  const { create, connect } = await setup(t);
  const project = await create('token-owner');
  const commenter = await connect(project, 'token-member');
  commenter.doc.getMap('canvas').set('version', 2);
  assert.deepEqual(await commenter.next('refused'), { type: 'refused', reason: 'commenter', paths: ['canvas.version'] });
});

test('viewer intent is refused', { timeout: 10_000 }, async t => {
  const { create, setRole, connect } = await setup(t);
  const project = await create('token-owner');
  assert.equal((await setRole(project, 'token-owner', ids.member, 'viewer')).status, 200);
  const viewer = await connect(project, 'token-member');
  assert.deepEqual(await intent(viewer, 'inputs', { inputs: { top_n: 9 } }), { type: 'refused', intentId: 'i-inputs', reason: 'viewer' });
});

test('editor restore is refused', { timeout: 10_000 }, async t => {
  const { create, setRole, connect } = await setup(t);
  const project = await create('token-owner');
  await setRole(project, 'token-owner', ids.member, 'editor');
  const editor = await connect(project, 'token-member');
  assert.deepEqual(await intent(editor, 'restore', { versionId: 'v1' }), { type: 'refused', intentId: 'i-restore', reason: 'owner_only' });
});

test('owner restore is accepted', { timeout: 10_000 }, async t => {
  const { create, connect } = await setup(t);
  const project = await create('token-owner');
  const owner = await connect(project, 'token-owner');
  await sessionReady(owner);
  // Only the role check is under test: replace the real handler (src/versions.mjs, registered by start()) with a no-op.
  register('restore', async () => {});
  assert.equal((await intent(owner, 'restore', { versionId: 'v1' })).type, 'intent-result');
});

test('client member finish is refused whatever the role', { timeout: 10_000 }, async t => {
  const { create, connect } = await setup(t);
  const project = await create('token-owner');
  const owner = await connect(project, 'token-owner');
  assert.deepEqual(await intent(owner, 'finish', { finished: { url: 'data:image/png;base64,AA' } }),
    { type: 'refused', intentId: 'i-finish', reason: 'lab_only' });
});

test('PUT by an editor member is forbidden', { timeout: 10_000 }, async t => {
  const { create, setRole } = await setup(t);
  const project = await create('token-owner');
  await setRole(project, 'token-owner', ids.member, 'editor');
  assert.equal((await setRole(project, 'token-member', ids.owner, 'viewer')).status, 403);
});

test('PUT by the owner pushes the role to the open connection and makes it read-only', { timeout: 10_000 }, async t => {
  const { create, setRole, connect } = await setup(t);
  const project = await create('token-owner');
  const member = await connect(project, 'token-member');
  await member.next('role');
  const response = await setRole(project, 'token-owner', ids.member, 'viewer');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: ids.member, role: 'viewer' });
  assert.deepEqual(await member.next('role'), { type: 'role', role: 'viewer', canShare: false });
  member.doc.getMap('comments').set('c1', { text: 'synthetic' });
  assert.equal((await member.next('refused')).reason, 'viewer');
});

test('DELETE by the owner returns a member to the default role', { timeout: 10_000 }, async t => {
  const { http, create, setRole, connect } = await setup(t);
  const project = await create('token-owner');
  await setRole(project, 'token-owner', ids.member, 'viewer');
  const member = await connect(project, 'token-member');
  await member.next('role');
  const response = await http('DELETE', `/${project}/members/${ids.member}`, 'token-owner');
  assert.deepEqual(await response.json(), { userId: ids.member, role: null });
  assert.deepEqual(await member.next('role'), { type: 'role', role: 'commenter', canShare: false });
});

test('GET members lists the members and the client people from nexo_people without e-mails', { timeout: 10_000 }, async t => {
  const { admin, http, create, setRole } = await setup(t);
  const project = await create('token-owner');
  await setRole(project, 'token-owner', ids.member, 'editor');
  const response = await http('GET', `/${project}/members`, 'token-owner');
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.doesNotMatch(text, /mail/);
  assert.deepEqual(JSON.parse(text), {
    workspace: `nexo-client-${client}`,
    members: [{ userId: ids.owner, displayName: 'Olive', kind: 'client', role: 'owner' },
      { userId: ids.member, displayName: 'Milo', kind: 'client', role: 'editor' }],
    people: [{ userId: ids.staff, displayName: 'Ada', kind: 'staff' }, { userId: ids.owner, displayName: 'Olive', kind: 'client' },
      { userId: ids.member, displayName: 'Milo', kind: 'client' }],
  });
  const call = admin.calls.find(c => c.url === '/rpc/nexo_people');
  assert.equal(call.headers.authorization, 'Bearer token-owner');
  assert.deepEqual(JSON.parse(call.body), { p_client_id: client });
});

test('GET members of a lab-only workspace has no people', { timeout: 10_000 }, async t => {
  const { admin, http, create } = await setup(t);
  const project = await create('token-staff', 'nexo-lab-synthetic');
  const answer = await (await http('GET', `/${project}/members`, 'token-staff')).json();
  assert.deepEqual(answer.people, []);
  assert.equal(answer.workspace, 'nexo-lab-synthetic'); // the Share dialog says who can open it (FIX-PROD-E)
  // No client directory is asked (the caller's own name is, with no client: auth.mjs, FIX-PROD-E).
  assert.equal(admin.calls.some(c => c.url === '/rpc/nexo_people' && JSON.parse(c.body).p_client_id !== null), false);
});

test("GET members names the caller's own row when Admin does not list it", { timeout: 10_000 }, async t => {
  const token = `test.${Buffer.from(JSON.stringify({ displayName: 'Stella Staff' })).toString('base64url')}.signature`;
  callers[token] = callers['token-staff'];
  t.after(() => { delete callers[token]; });
  const { http, create } = await setup(t);
  const project = await create(token, 'nexo-lab-synthetic');
  const answer = await (await http('GET', `/${project}/members`, token)).json();
  assert.deepEqual(answer.members, [{ userId: ids.staff, displayName: 'Stella Staff', kind: 'staff', role: 'owner' }]);
});

test('an expired cached owner token cannot change roles and Admin is not asked', { timeout: 10_000 }, async t => {
  const exp = Math.floor(Date.now() / 1000) + 20;
  const token = `test.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
  callers[token] = callers['token-owner'];
  t.after(() => { delete callers[token]; });
  const { admin, create, setRole } = await setup(t);
  const project = await create(token); // caches the owner
  const asked = admin.calls.length;
  t.mock.timers.enable({ apis: ['Date'], now: (exp + 5) * 1000 });
  assert.equal((await setRole(project, token, ids.member, 'owner')).status, 401);
  assert.equal(admin.calls.length, asked);
});

test('staff demoted to a client member can no longer write the board after revalidation', { timeout: 5_000 }, async t => {
  const demoted = '55555555-0000-4000-8000-000000000005';
  callers['token-demoted'] = [{ caller: demoted, caller_view: 'staff' }];
  t.after(() => { delete callers['token-demoted']; });
  const { create, connect } = await setup(t, { revalidateEvery: 20 });
  const project = await create('token-owner');
  const person = await connect(project, 'token-demoted');
  assert.equal((await person.next('role')).role, 'editor');
  callers['token-demoted'] = [{ caller: demoted, caller_view: 'client', client_id: client }];
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 61_000 }); // past auth's 60 s cache
  assert.deepEqual(await person.next('role'), { type: 'role', role: 'commenter', canShare: false });
  person.doc.getMap('canvas').set('libraryHidden', true);
  assert.deepEqual(await person.next('refused'), { type: 'refused', reason: 'commenter', paths: ['canvas.libraryHidden'] });
});
