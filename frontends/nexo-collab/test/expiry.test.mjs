import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchExpiry } from '../src/expiry.mjs';
const token = exp => `test.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;

test('expired token closes 4401 and a fresh token reconnects', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 100000 });
  const codes = [];
  const close = ({ code }) => codes.push(code);
  const stop = watchExpiry({ token: token(101), close, revalidate: async () => {} });
  t.mock.timers.tick(1000);
  assert.deepEqual(codes, [4401]); stop();
  const fresh = watchExpiry({ token: token(200), close, revalidate: async () => {} });
  t.mock.timers.tick(1000);
  assert.deepEqual(codes, [4401]); fresh();
});

test('lost scope closes 4403 within one revalidation', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 100000 });
  const codes = [];
  const stop = watchExpiry({ token: token(300), close: ({ code }) => codes.push(code),
    revalidate: async () => { throw Object.assign(new Error(), { reason: 'forbidden_scope' }); } });
  t.mock.timers.tick(60000); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(codes, [4403]); stop();
});

test('Admin outage keeps the socket and does not close it as signed out', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 100000 });
  const codes = [];
  const stop = watchExpiry({ token: token(300), close: ({ code }) => codes.push(code),
    revalidate: async () => { throw Object.assign(new Error(), { reason: 'admin_unavailable' }); } });
  t.mock.timers.tick(60000); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(codes, []); stop();
});

test('the socket closes 4401 and the provider reconnects with a fresh token', { timeout: 6000 }, async t => {
  const { fakePostgrest } = await import('./fake-postgrest.mjs');
  const { start } = await import('../src/server.mjs');
  const { HocuspocusProvider } = await import('@hocuspocus/provider');
  const projectId = 'aaaaaaaa-0000-4000-8000-00000000000a';
  const first = token(Math.floor(Date.now() / 1000) + 1), fresh = token(Math.floor(Date.now() / 1000) + 300);
  const rows = [{ caller: 'synthetic-staff', caller_view: 'staff' }];
  const admin = await fakePostgrest({ [first]: rows, [fresh]: rows });
  const server = await start({ port: 0, dbPath: ':memory:', restUrl: admin.url, anonKey: 'test' });
  t.after(async () => { await server.close(); await admin.close(); });
  const created = await fetch(`${server.httpUrl}/collab/projects`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nexo-Admin-Token': fresh },
    body: JSON.stringify({ workspace: 'test-lab', origin: { kind: 'checkpoint', id: projectId } }) });
  const project = (await created.json()).projectId;
  let calls = 0, closed;
  await new Promise((resolve, reject) => {
    const provider = new HocuspocusProvider({ url: `${server.wsUrl}/collab`, name: project,
      token: () => ++calls === 1 ? first : fresh,
      onClose: ({ event }) => { closed = event.code; },
      onSynced: () => { if (calls > 1) resolve(); },
      onAuthenticationFailed: ({ reason }) => reject(new Error(reason)) });
    t.after(() => provider.destroy());
  });
  assert.equal(closed, 4401);
  assert.equal(calls, 2);
});
