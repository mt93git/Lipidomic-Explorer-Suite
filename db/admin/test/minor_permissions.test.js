// 0042_minor_permissions.sql: the audit log's CSV export is itself audited (admin.record_audit_export), and
// admin.next_client_code() gives codes to lab Owners and Admins only (it refuses everyone else signed in). Synthetic data only.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { as, C, freshDb, U } from './helpers.js';

vi.setConfig({ testTimeout: 30_000 });
let db;
afterEach(async () => { await db?.close(); db = undefined; });

const record = (entity, order, rows, truncated = false) =>
  db.query('SELECT admin.record_audit_export($1, $2, $3, $4)', [entity, order, rows, truncated]);
const exports = async () => {
  await as(db, null);
  return (await db.query("SELECT actor, client_id, entity, entity_id, action, before, after FROM admin.audit_event WHERE entity = 'audit_export' ORDER BY id")).rows;
};

describe('0042: admin.record_audit_export', () => {
  test('lab Owner, Admin and Operator each record one audit row: who, the filter and the row count', async () => {
    db = await freshDb();
    await as(db, U.operator);
    await record('order', 'ORD080', 12);
    await as(db, U.admin);
    await record(null, null, 3051, true);
    await as(db, U.owner);
    await record('  ', '', 0);
    expect(await exports()).toEqual([
      { actor: U.operator, client_id: null, entity: 'audit_export', entity_id: null, action: 'INSERT', before: null, after: { entity: 'order', order: 'ORD080', rows: 12, truncated: false } },
      { actor: U.admin, client_id: null, entity: 'audit_export', entity_id: null, action: 'INSERT', before: null, after: { entity: null, order: null, rows: 3051, truncated: true } },
      { actor: U.owner, client_id: null, entity: 'audit_export', entity_id: null, action: 'INSERT', before: null, after: { entity: null, order: null, rows: 0, truncated: false } },
    ]);
    // Lab staff read it back like any other event.
    await as(db, U.operator);
    expect((await db.query("SELECT count(*)::int AS n FROM admin.audit_event WHERE entity = 'audit_export'")).rows[0].n).toBe(3);
  });

  test('a lab Member and client users are refused; a negative or missing count is refused; nothing is written', async () => {
    db = await freshDb();
    for (const user of [U.member, U.aAdmin, U.aReq, U.bReq]) {
      await as(db, user);
      await expect(record('order', null, 1)).rejects.toThrow(/Lab staff access is required/);
    }
    await as(db, U.operator);
    await expect(record(null, null, -1)).rejects.toThrow(/row count/);
    await expect(record(null, null, null)).rejects.toThrow(/row count/);
    expect(await exports()).toEqual([]);
  });

  test('grants: authenticated only (anon and service_role cannot run it); a direct insert into audit_event is still refused', async () => {
    db = await freshDb();
    await as(db, null);
    const grant = (await db.query(`SELECT has_function_privilege('anon', 'admin.record_audit_export(text, text, integer, boolean)', 'EXECUTE') AS anon,
      has_function_privilege('authenticated', 'admin.record_audit_export(text, text, integer, boolean)', 'EXECUTE') AS app,
      has_function_privilege('service_role', 'admin.record_audit_export(text, text, integer, boolean)', 'EXECUTE') AS service`)).rows[0];
    expect(grant).toEqual({ anon: false, app: true, service: false });
    await as(db, U.operator);
    await expect(db.query("INSERT INTO admin.audit_event(actor, entity, action, after) VALUES ($1, 'audit_export', 'INSERT', '{}')", [U.operator])).rejects.toThrow(/permission denied/);
  });
});

describe('0042: admin.next_client_code', () => {
  test('a client user (and a lab Operator or Member) calling it directly is refused, and no code is spent', async () => {
    db = await freshDb();
    for (const user of [U.aAdmin, U.aReq, U.aView, U.bReq, U.operator, U.member]) {
      await as(db, user);
      await expect(db.query('SELECT admin.next_client_code()')).rejects.toThrow(/Lab Owner or Admin access is required to give a client code/);
    }
    await as(db, U.owner);
    const created = (await db.query("SELECT admin.create_client('Synthetic Gamma', 'pi_lab', NULL, NULL) AS id")).rows[0].id;
    await as(db, null);
    expect((await db.query('SELECT code FROM admin.client WHERE id = $1', [created])).rows[0].code).toBe('CL-003');
  });

  test('lab Owner and Admin get a code through New client (create_client); an Operator cannot create a client', async () => {
    db = await freshDb();
    await as(db, U.owner);
    const a = (await db.query("SELECT admin.create_client('Synthetic Gamma', 'pi_lab', NULL, NULL) AS id")).rows[0].id;
    await as(db, U.admin);
    const b = (await db.query("SELECT admin.create_client('Synthetic Delta', 'company', 'po', NULL) AS id")).rows[0].id;
    await as(db, U.operator);
    await expect(db.query("SELECT admin.create_client('Synthetic Epsilon', 'company', NULL, NULL)")).rejects.toThrow(/Lab Owner or Admin/);
    await as(db, null);
    expect((await db.query('SELECT id, code FROM admin.client WHERE id IN ($1, $2) ORDER BY code', [a, b])).rows).toEqual([{ id: a, code: 'CL-003' }, { id: b, code: 'CL-004' }]);
    expect((await db.query('SELECT code FROM admin.client WHERE id = $1', [C.A])).rows[0].code).toMatch(/^CL-\d{3}$/);
  });

  test('grants: authenticated only (anon cannot); a lab Owner or Admin calling it gets a code; the migration owner still can', async () => {
    db = await freshDb();
    await as(db, null);
    const grant = (await db.query(`SELECT has_function_privilege('anon', 'admin.next_client_code()', 'EXECUTE') AS anon,
      has_function_privilege('authenticated', 'admin.next_client_code()', 'EXECUTE') AS app`)).rows[0];
    expect(grant).toEqual({ anon: false, app: true });
    expect((await db.query('SELECT admin.next_client_code() AS code')).rows[0].code).toBe('CL-003');
    await as(db, U.owner);
    expect((await db.query('SELECT admin.next_client_code() AS code')).rows[0].code).toBe('CL-004');
    await as(db, U.admin);
    expect((await db.query('SELECT admin.next_client_code() AS code')).rows[0].code).toBe('CL-005');
  });
});
