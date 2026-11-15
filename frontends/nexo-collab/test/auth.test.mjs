import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fakePostgrest } from './fake-postgrest.mjs';
import { openDatabase } from '../src/db.mjs';
import { createAuth } from '../src/auth.mjs';

// Synthetic identities (the rows admin.nexo_caller() returns, docs/integration/nexo-store-scope.md).
const clientA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const clientB = 'bbbbbbbb-0000-4000-8000-00000000000b';
const projectA = '0a000000-0000-4000-8000-000000000001';
const projectB = '0b000000-0000-4000-8000-000000000002';
const callers = {
  'token-staff': [{ caller: '44444444-0000-4000-8000-000000000004', caller_view: 'staff', client_id: null }],
  'token-a': [{ caller: '11111111-0000-4000-8000-000000000001', caller_view: 'client', client_id: clientA }],
  'token-expired': 401,
  'token-none': [],
};

let admin;
let db;
const logged = [];
const auth = () => createAuth({ restUrl: admin.url, anonKey: 'anon-test', db, log: line => logged.push(line) });
const connect = (token, documentName) => auth().onAuthenticate({ token, documentName });

before(async () => {
  admin = await fakePostgrest(callers);
  db = openDatabase(':memory:').db;
  const insert = db.prepare('INSERT INTO projects (id, workspace) VALUES (?, ?)');
  insert.run(projectA, `nexo-client-${clientA}`);
  insert.run(projectB, `nexo-client-${clientB}`);
});
after(() => admin.close());

test('staff connects to a project in client A workspace', async () => {
  await connect('token-staff', projectA);
});

test('member of A connects to A project', async () => {
  await connect('token-a', projectA);
});

test('member of A is refused on B project', async () => {
  await assert.rejects(connect('token-a', projectB));
});

test('expired token is refused', async () => {
  await assert.rejects(connect('token-expired', projectA));
});

test('token with no scope is refused', async () => {
  await assert.rejects(connect('token-none', projectA));
});

test('unknown project id is refused', async () => {
  await assert.rejects(connect('token-staff', '0c000000-0000-4000-8000-000000000003'));
});

test('nexo_caller is asked with apikey, the bearer token and the admin profile', async () => {
  const from = admin.calls.length;
  await connect('token-staff', projectA);
  const { method, url, headers } = admin.calls[from];
  assert.deepEqual({ method, url, apikey: headers.apikey, authorization: headers.authorization,
    accept: headers['accept-profile'], content: headers['content-profile'] },
  { method: 'POST', url: '/rpc/nexo_caller', apikey: 'anon-test', authorization: 'Bearer token-staff',
    accept: 'admin', content: 'admin' });
});

test('the nexo_caller answer is cached', async () => {
  const verifier = auth();
  await verifier.onAuthenticate({ token: 'token-a', documentName: projectA });
  const from = admin.calls.length;
  await verifier.onAuthenticate({ token: 'token-a', documentName: projectA });
  assert.equal(admin.calls.length, from);
});

test('a refusal is logged by project and user, never the token', async () => {
  logged.length = 0;
  await assert.rejects(connect('token-a', projectB));
  assert.equal(logged.length, 1);
  assert.match(logged[0], new RegExp(projectB));
  assert.match(logged[0], /11111111-0000-4000-8000-000000000001/);
  assert.doesNotMatch(logged[0], /token-a/);
});

test('admin is reachable after an answer and unreachable when it fails', async () => {
  const verifier = auth();
  await verifier.onAuthenticate({ token: 'token-staff', documentName: projectA });
  assert.equal(verifier.admin(), 'reachable');
  const down = createAuth({ restUrl: 'http://127.0.0.1:1', anonKey: 'anon-test', db, log: () => {} });
  await assert.rejects(down.onAuthenticate({ token: 'token-staff', documentName: projectA }));
  assert.equal(down.admin(), 'unreachable');
});
