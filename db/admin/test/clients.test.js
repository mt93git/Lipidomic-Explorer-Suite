// Round 1 client RPC boundary; synthetic data only.
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { as, C, freshDb, id, U } from './helpers.js';
let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });
const create = (name = 'Synthetic Gamma', kind = 'pi_lab', billing = 'po', notes = 'Synthetic notes') =>
  db.query('SELECT admin.create_client($1, $2, $3, $4) AS id', [name, kind, billing, notes]).then(r => r.rows[0].id);
const update = (client, name = 'Synthetic Gamma edited', kind = 'company', billing = 'grant', notes = null) =>
  db.query('SELECT admin.update_client($1, $2, $3, $4, $5)', [client, name, kind, billing, notes]);
const archive = (client, reason = 'Synthetic retirement') => db.query('SELECT admin.archive_client($1, $2)', [client, reason]);
describe('0014: client RPCs', () => {
  test('functions are SECURITY DEFINER, pin search_path and grant only authenticated', async () => {
    const names = ['create_client', 'update_client', 'archive_client', 'client_is_active'];
    const rows = (await db.query("SELECT proname, prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app, proacl::text AS acl FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname = ANY($1)", [names])).rows;
    expect(rows.map(r => r.proname).sort()).toEqual(names.sort());
    for (const row of rows) {
      expect(row.prosecdef).toBe(true);
      expect(row.proconfig.join(',')).toMatch(/^search_path=pg_catalog, ?admin$/);
      expect(row.app).toBe(true);
      expect(row.acl).not.toMatch(/(^|[{,])=X/);
    }
  });
  test('Owner creates, Admin edits only the contracted fields, with audit', async () => {
    await as(db, U.owner);
    const client = await create('  Synthetic Gamma  ');
    const before = (await db.query('SELECT * FROM admin.client WHERE id = $1', [client])).rows[0];
    expect(before).toMatchObject({ name: 'Synthetic Gamma', kind: 'pi_lab', billing_method: 'po', notes: 'Synthetic notes', archived_at: null, archived_reason: null });
    await as(db, U.admin);
    await update(client);
    expect((await db.query('SELECT * FROM admin.client WHERE id = $1', [client])).rows[0]).toEqual({ ...before, name: 'Synthetic Gamma edited', kind: 'company', billing_method: 'grant', notes: null });
    expect((await db.query("SELECT actor, action FROM admin.audit_event WHERE entity = 'client' AND entity_id = $1 ORDER BY id", [client])).rows).toEqual([{ actor: U.owner, action: 'INSERT' }, { actor: U.admin, action: 'UPDATE' }]);
  });
  test('all writes refuse non-managers, client admins and archived lab managers', async () => {
    for (const user of [U.operator, U.member, U.aAdmin, U.aReq, U.aView, U.bReq]) {
      await as(db, user);
      await expect(create()).rejects.toThrow(/Owner or Admin/);
      await expect(update(C.A)).rejects.toThrow(/Owner or Admin/);
      await expect(archive(C.A)).rejects.toThrow(/Owner or Admin/);
    }
    await as(db, null);
    await db.query("UPDATE admin.lab_staff SET archived_at = now(), archived_reason = 'Synthetic departure' WHERE user_id = $1", [U.admin]);
    await as(db, U.admin);
    await expect(create()).rejects.toThrow(/Owner or Admin/);
    await expect(update(C.A)).rejects.toThrow(/Owner or Admin/);
    await expect(archive(C.A)).rejects.toThrow(/Owner or Admin/);
    await as(db, null);
    await expect(create()).rejects.toThrow(/Owner or Admin/);
  });
  test('create/update refuse duplicate names and invalid fields atomically', async () => {
    await as(db, U.admin);
    const client = await create();
    await expect(create()).rejects.toThrow(/client named.*already exists/i);
    await expect(update(client, 'Synthetic Lab Alpha')).rejects.toThrow(/client named.*already exists/i);
    for (const name of ['', '  ', null]) {
      await expect(create(name)).rejects.toThrow(/name is required/i);
      await expect(update(client, name)).rejects.toThrow(/name is required/i);
    }
    for (const kind of ['other', null]) {
      await expect(create('Invalid', kind)).rejects.toThrow(/kind/i);
      await expect(update(client, 'Invalid', kind)).rejects.toThrow(/kind/i);
    }
    await expect(create('Invalid', 'company', 'cash')).rejects.toThrow(/billing method/i);
    await expect(update(client, 'Invalid', 'company', 'cash')).rejects.toThrow(/billing method/i);
    await expect(update(id(999))).rejects.toThrow(/not found/i);
    expect((await db.query('SELECT name FROM admin.client WHERE id = $1', [client])).rows[0].name).toBe('Synthetic Gamma');
    await update(client, 'Synthetic Gamma', 'internal_group', null);
  });
  test('archive refuses open orders/reasonless requests; released or archived orders allow archival with audit', async () => {
    await as(db, U.owner);
    await expect(archive(C.A)).rejects.toThrow(/open order/i);
    for (const reason of ['', '  ', null]) await expect(archive(C.B, reason)).rejects.toThrow(/reason/i);
    await expect(archive(id(999))).rejects.toThrow(/not found/i);
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET stage = 'released' WHERE client_id = $1", [C.A]);
    await db.query("UPDATE admin.\"order\" SET archived_at = now(), archived_reason = 'Synthetic cancellation' WHERE client_id = $1", [C.B]);
    await as(db, U.admin);
    for (const client of [C.A, C.B]) {
      await archive(client, '  Synthetic retirement  ');
      expect((await db.query('SELECT archived_at, archived_reason FROM admin.client WHERE id = $1', [client])).rows[0]).toMatchObject({ archived_at: expect.any(Date), archived_reason: 'Synthetic retirement' });
      await expect(archive(client)).rejects.toThrow(/already archived/i);
      await expect(update(client)).rejects.toThrow(/archived/i);
      expect((await db.query("SELECT actor FROM admin.audit_event WHERE entity = 'client' AND entity_id = $1 AND after->>'archived_at' IS NOT NULL", [client])).rows).toEqual([{ actor: U.admin }]);
    }
    await expect(create('Synthetic Lab Alpha')).rejects.toThrow(/client named.*already exists/i);
  });
  test.each([['Operator', U.operator, null], ['client requester', U.aReq, '42501']])('archival blocks order, shipment and sample inserts by %s; an active client still accepts them only from the lab (0018)', async (_role, user, activeCode) => {
    await db.query("INSERT INTO admin.client_member(client_id, user_id, role) VALUES ($1, $2, 'requester')", [C.B, U.aReq]);
    await db.query("UPDATE admin.\"order\" SET stage = 'released' WHERE client_id = $1", [C.A]);
    await as(db, U.admin);
    await archive(C.A);
    await as(db, user);
    const inserts = [
      ['INSERT INTO admin."order"(client_id, title) VALUES ($1, $2)', ['Synthetic post-archive order']],
      ['INSERT INTO admin.shipment(client_id, order_id) VALUES ($1, $2)', []],
      ['INSERT INTO admin.sample(client_id, order_id, full_name) VALUES ($1, $2, $3)', ['Synthetic post-archive sample']],
    ];
    const archivedWrites = [];
    const activeWrites = [];
    for (const [sql, values] of inserts) {
      const params = client => sql.includes('order_id')
        ? [client, client === C.A ? id(101) : id(201), ...values]
        : [client, ...values];
      archivedWrites.push(await db.query(sql, params(C.A)).then(() => null, error => error.code));
      activeWrites.push(await db.query(sql, params(C.B)).then(() => null, error => error.code));
    }
    expect(archivedWrites).toEqual(['42501', '42501', '42501']);
    expect(activeWrites).toEqual([activeCode, activeCode, activeCode]);
    expect((await db.query('SELECT admin.can_submit($1) AS archived, admin.can_submit($2) AS active, admin.can_submit($3) AS missing', [C.A, C.B, id(999)])).rows[0])
      .toEqual({ archived: false, active: true, missing: false });
  });
});
