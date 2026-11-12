import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { fakePostgrest } from './fake-postgrest.mjs';
import { openDatabase } from '../src/db.mjs';
import { start } from '../src/server.mjs';

const clientA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const projectA = '0a000000-0000-4000-8000-000000000001';
const callers = {
  'token-staff': [{ caller: '44444444-0000-4000-8000-000000000004', caller_view: 'staff', client_id: null }],
  'token-a': [{ caller: '11111111-0000-4000-8000-000000000001', caller_view: 'client', client_id: clientA }],
};
const migrations = new URL('../migrations/', import.meta.url);

let admin;
let dir;
before(async () => {
  admin = await fakePostgrest(callers);
  dir = mkdtempSync(join(tmpdir(), 'nexo-collab-'));
});
after(async () => {
  await admin.close();
  rmSync(dir, { recursive: true, force: true });
});

// A database file with project A in client A's workspace.
const projectDb = name => {
  const path = join(dir, name);
  const { db } = openDatabase(path);
  db.prepare('INSERT INTO projects (id, workspace) VALUES (?, ?)').run(projectA, `nexo-client-${clientA}`);
  db.close();
  return path;
};
const serve = path => start({ port: 0, dbPath: path, restUrl: admin.url, anonKey: 'anon-test' });
const connect = (server, token) => new Promise((resolve, reject) => {
  const provider = new HocuspocusProvider({ url: `${server.wsUrl}/collab`, name: projectA, token,
    onSynced: () => resolve(provider), onAuthenticationFailed: ({ reason }) => reject(new Error(reason)) });
});
const changed = (map, key) => new Promise(resolve => {
  if (map.has(key)) resolve(map.get(key));
  else map.observe(() => map.has(key) && resolve(map.get(key)));
});

test('two clients on the same project see each other change', async () => {
  const server = await serve(projectDb('shared.sqlite'));
  const a = await connect(server, 'token-staff');
  const b = await connect(server, 'token-a');
  a.document.getMap('cards').set('c1', { x: 10 });
  assert.deepEqual(await changed(b.document.getMap('cards'), 'c1'), { x: 10 });
  a.destroy(); b.destroy();
  await server.close();
});

test('the document survives a server restart', async () => {
  const path = projectDb('restart.sqlite');
  const first = await serve(path);
  const a = await connect(first, 'token-staff');
  a.document.getMap('cards').set('c1', { x: 20 });
  const b = await connect(first, 'token-a');
  await changed(b.document.getMap('cards'), 'c1');
  a.destroy(); b.destroy();
  await first.close();
  const second = await serve(path);
  const c = await connect(second, 'token-a');
  assert.deepEqual(c.document.getMap('cards').get('c1'), { x: 20 });
  c.destroy();
  await second.close();
});

test('health answers ok with migrations = 5', async () => {
  const server = await serve(projectDb('health.sqlite'));
  const response = await fetch(`${server.httpUrl}/collab/health`);
  assert.deepEqual(await response.json(), { ok: true, sqlite: true, migrations: 5, admin: 'unknown' });
  await server.close();
});

test('a broken migration file makes start-up fail and applies nothing', async () => {
  const broken = join(dir, 'broken-migrations');
  mkdirSync(broken);
  copyFileSync(new URL('001_init.sql', migrations), join(broken, '001_init.sql'));
  writeFileSync(join(broken, '002_broken.sql'), 'CREATE TABLE oops (');
  const path = join(dir, 'broken.sqlite');
  await assert.rejects(start({ port: 0, dbPath: path, restUrl: admin.url, anonKey: 'anon-test', migrationsDir: broken }));
  const db = new DatabaseSync(path);
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all(), []);
  db.close();
});

test('a failed migration exits the process non-zero', { timeout: 10_000 }, async () => {
  const path = join(dir, 'conflict.sqlite');
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE documents (other TEXT)');
  db.close();
  const child = spawn(process.execPath, [new URL('../src/server.mjs', import.meta.url).pathname], {
    env: { ...process.env, COLLAB_PORT: '0', COLLAB_DB: path, ADMIN_REST_URL: admin.url, ADMIN_ANON_KEY: 'anon-test' },
    stdio: 'ignore',
  });
  const [code] = await once(child, 'exit');
  assert.notEqual(code, 0);
});
