import { test } from 'node:test';
import assert from 'node:assert/strict';
import { start } from '../src/server.mjs';
import { createProjects } from '../src/projects.mjs';
import { openDatabase } from '../src/db.mjs';
import { fakePostgrest } from './fake-postgrest.mjs';
const client = 'aaaaaaaa-0000-4000-8000-00000000000a';
const workspace = `nexo-client-${client}`;
const namedStaff = `test.${Buffer.from(JSON.stringify({ displayName: 'Creator Example' })).toString('base64url')}.signature`;
const origin = { kind: 'dataset', id: 'bbbbbbbb-0000-4000-8000-00000000000b' };
async function setup(t) {
  const admin = await fakePostgrest({ staff: [{ caller: 'staff-id', caller_view: 'staff', members_prepare: null }],
    [namedStaff]: [{ caller: 'creator-id', caller_view: 'staff', members_prepare: null }],
    enabled: [{ caller: 'enabled-id', caller_view: 'client', client_id: client, members_prepare: true }],
    disabled: [{ caller: 'disabled-id', caller_view: 'client', client_id: client, members_prepare: false }],
    member: [{ caller: 'member-id', caller_view: 'client', client_id: client }],
    stranger: [{ caller: 'stranger-id', caller_view: 'client', client_id: 'cccccccc-0000-4000-8000-00000000000c' }] }, { people: { [client]: [{ user_id: 'staff-id', display_name: 'Staff Example', kind: 'staff' }] } });
  const server = await start({ port: 0, dbPath: ':memory:', restUrl: admin.url, anonKey: 'test' });
  t.after(async () => { await server.close(); await admin.close(); });
  return (method, suffix = '', body, token = 'staff') => fetch(`${server.httpUrl}/collab/projects${suffix}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Nexo-Admin-Token': token },
    body: body && JSON.stringify(body) });
}
test('create and read a project', async t => {
  const request = await setup(t);
  const response = await request('POST', '', { workspace, origin });
  assert.equal(response.status, 201);
  const { projectId } = await response.json();
  assert.match(projectId, /^[0-9a-f-]{14}4[0-9a-f-]{21}$/);
  const read = await request('GET', `/${projectId}`);
  assert.deepEqual(await read.json(), { projectId, workspace, origin, createdBy: { userId: 'staff-id', displayName: 'Staff Example' } });
});
// FIX-G10: a link that names a dataset project opens the dataset with the preparation its first open chose.
test('reading a dataset project answers its preparation settings', async t => {
  const request = await setup(t);
  const settings = { sampleSheet: 'Samples', groupColumn: 'Group' };
  const { projectId } = await (await request('POST', '', { workspace, origin, settings })).json();
  const read = await request('GET', `/${projectId}`, undefined, 'member');
  assert.deepEqual(await read.json(), { projectId, workspace, origin, settings, createdBy: { userId: 'staff-id', displayName: 'Staff Example' } });
});
test('scope refused for creation and read', async t => {
  const request = await setup(t);
  const body = { workspace: 'other-workspace', origin };
  assert.equal((await request('POST', '', body, 'member')).status, 403);
  const { projectId } = await (await request('POST', '', body)).json();
  assert.equal((await request('GET', `/${projectId}`, undefined, 'member')).status, 403);
});
test('same dataset twice concurrently returns one project', async t => {
  const request = await setup(t);
  const responses = await Promise.all([request('POST', '', { workspace, origin }), request('POST', '', { workspace, origin })]);
  const values = await Promise.all(responses.map(r => r.json()));
  assert.ok(values[0].projectId);
  assert.equal(values[0].projectId, values[1].projectId);
});
// FIX-G12: the bare Admin link (?dataset=<id>, no project) finds the dataset's project and its preparation settings.
test('a dataset project is found by its dataset with its settings', async t => {
  const request = await setup(t);
  const settings = { sampleSheet: 'Samples', groupColumn: 'Group' };
  const { projectId } = await (await request('POST', '', { workspace, origin, settings })).json();
  const found = await request('GET', `?dataset=${origin.id}`, undefined, 'member');
  assert.equal(found.status, 200);
  assert.deepEqual(await found.json(), { projectId, workspace, settings, createdBy: { userId: 'staff-id', displayName: 'Staff Example' } });
});
test('another client\'s member does not find the dataset project', async t => {
  const request = await setup(t);
  await request('POST', '', { workspace, origin });
  const found = await request('GET', `?dataset=${origin.id}`, undefined, 'stranger');
  assert.equal(found.status, 404);
  assert.deepEqual(await found.json(), { error: 'unknown_project' });
});
test('a dataset without a project yet is not found', async t => {
  const request = await setup(t);
  const found = await request('GET', `?dataset=${origin.id}`, undefined, 'member');
  assert.equal(found.status, 404);
  assert.deepEqual(await found.json(), { error: 'unknown_project' });
});
test('finding a dataset project without a token answers 401', async t => {
  const request = await setup(t);
  await request('POST', '', { workspace, origin });
  assert.equal((await request('GET', `?dataset=${origin.id}`, undefined, '')).status, 401);
});
test('the newest dataset project the caller may open is found', async t => {
  const request = await setup(t);
  await request('POST', '', { workspace: 'nexo-lab', origin });
  const { projectId } = await (await request('POST', '', { workspace, origin })).json();
  assert.equal((await (await request('GET', `?dataset=${origin.id}`)).json()).projectId, projectId);
});

test('staff sees lab and client projects, newest first with creator names', async t => {
  const request = await setup(t);
  const lab = await (await request('POST', '', { workspace: 'nexo-lab', origin: { kind: 'checkpoint', id: 'lab' } })).json();
  const clientProject = await (await request('POST', '', { workspace, origin })).json();
  const response = await request('GET');
  assert.equal(response.status, 200);
  const { projects } = await response.json();
  assert.deepEqual(new Set(projects.map(p => p.projectId)), new Set([lab.projectId, clientProject.projectId]));
  const row = projects.find(p => p.projectId === clientProject.projectId);
  assert.deepEqual(row.createdBy, { userId: 'staff-id', displayName: 'Staff Example' });
  assert.deepEqual(row.origin, origin);
  assert.equal(row.workspace, workspace);
  assert.ok(row.createdAt && row.updatedAt);
  assert.deepEqual(row.online, []);
  assert.deepEqual(projects.map(p => p.updatedAt), projects.map(p => p.updatedAt).sort().reverse());
});
test('client member sees only its client projects', async t => {
  const request = await setup(t);
  await request('POST', '', { workspace: 'nexo-lab', origin: { kind: 'checkpoint', id: 'lab' } });
  const { projectId } = await (await request('POST', '', { workspace, origin })).json();
  const { projects } = await (await request('GET', '', undefined, 'member')).json();
  assert.deepEqual(projects.map(p => p.projectId), [projectId]);
});
test('another client member sees none of those projects', async t => {
  const request = await setup(t);
  await request('POST', '', { workspace, origin });
  assert.deepEqual(await (await request('GET', '', undefined, 'stranger')).json(), { projects: [] });
});
test('listing projects requires a token', async t => {
  const request = await setup(t);
  assert.equal((await request('GET', '', undefined, '')).status, 401);
});
test('online lists distinct people in document awareness', async t => {
  const { db } = openDatabase(':memory:');
  t.after(() => db.close());
  db.prepare("INSERT INTO projects (id, workspace, created_by) VALUES ('p', 'nexo-lab', 'one')").run();
  const projects = createProjects({ db, auth: { caller: async () => ({ userId: 'one', staff: true }), allow() {} },
    roles: {}, restUrl: '', anonKey: '', online: () => [{ userId: 'two', displayName: 'Second Example' }, { userId: 'two', displayName: 'Second Example' }] });
  let body;
  await projects({ method: 'GET', url: '/collab/projects', headers: {} }, { writeHead() { return this; }, end(value) { body = JSON.parse(value); } }, '');
  assert.deepEqual(body.projects[0].online, [{ userId: 'two', displayName: 'Second Example' }]);
});

test('staff with null members_prepare creates a dataset project', async t => {
  const request = await setup(t);
  assert.equal((await request('POST', '', { workspace, origin })).status, 201);
});
test('client with members_prepare true creates a dataset project', async t => {
  const request = await setup(t);
  assert.equal((await request('POST', '', { workspace, origin }, 'enabled')).status, 201);
});
test('client with members_prepare false cannot create a dataset project', async t => {
  const request = await setup(t);
  const response = await request('POST', '', { workspace, origin }, 'disabled');
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'lab_prepares' });
});
test('client with absent members_prepare cannot create a dataset project', async t => {
  const request = await setup(t);
  const response = await request('POST', '', { workspace, origin }, 'member');
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'lab_prepares' });
});
test('client with members_prepare false joins an existing project', async t => {
  const request = await setup(t);
  const created = await (await request('POST', '', { workspace, origin })).json();
  const response = await request('POST', '', { workspace, origin }, 'disabled');
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), created);
});
test('another staff member sees the stored creator name on a lab board', async t => {
  const request = await setup(t);
  await request('POST', '', { workspace: 'nexo-lab', origin }, namedStaff);
  const { projects } = await (await request('GET')).json();
  assert.deepEqual(projects[0].createdBy, { userId: 'creator-id', displayName: 'Creator Example' });
});
// ENTRY-INT step 4: a joiner's page names who prepared the board (the join card, BoardNotice) from the same answers.
test('a dataset project found by its dataset names who created it, as the list does', async t => {
  const request = await setup(t);
  await request('POST', '', { workspace, origin, settings: { samples: ['A'] } }, 'enabled');
  const found = await (await request('GET', `?dataset=${origin.id}`, undefined, 'member')).json();
  assert.deepEqual(found.createdBy, { userId: 'enabled-id', displayName: 'Member' });
});
test('a project read by its id names who created it with the stored name', async t => {
  const request = await setup(t);
  const { projectId } = await (await request('POST', '', { workspace: 'nexo-lab', origin }, namedStaff)).json();
  assert.deepEqual((await (await request('GET', `/${projectId}`)).json()).createdBy, { userId: 'creator-id', displayName: 'Creator Example' });
});
