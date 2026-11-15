// The fake Admin PostgREST answers admin.nexo_datasets_for_caller as contract C2 says (docs/integration/nexo-entry-build.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakePostgrest } from './fake-postgrest.mjs';
const client = 'aaaaaaaa-0000-4000-8000-00000000000a';
const released = { dataset_id: 'dddddddd-0000-4000-8000-00000000000d', order_code: 'SYN001', version: 2, client_id: client,
  client_name: 'Synthetic client', released_at: '2026-01-01T00:00:00Z', members_prepare: false };
const dataset = { row: { ...released, storage_path: 'released/syn001/v2.xlsx', sha256: '0'.repeat(64) }, bytes: Buffer.from('') };
async function setup(t) {
  const admin = await fakePostgrest({ staff: [{ caller: 'staff-id', caller_view: 'staff', client_id: null }],
    member: [{ caller: 'member-id', caller_view: 'client', client_id: client }],
    stranger: [{ caller: 'stranger-id', caller_view: 'client', client_id: 'cccccccc-0000-4000-8000-00000000000c' }] }, { dataset });
  t.after(() => admin.close());
  return token => fetch(`${admin.url}/rest/v1/rpc/nexo_datasets_for_caller`, { method: 'POST', body: '{}',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
}
test('lab staff get every released dataset with the C2 columns', async t => {
  const response = await (await setup(t))('staff');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [released]);
});
test('a client member gets the datasets of their client', async t => {
  assert.deepEqual(await (await (await setup(t))('member')).json(), [released]);
});
test('a member of another client gets none', async t => {
  assert.deepEqual(await (await (await setup(t))('stranger')).json(), []);
});
test('an unknown token is refused', async t => {
  assert.equal((await (await setup(t))('nobody')).status, 401);
});
