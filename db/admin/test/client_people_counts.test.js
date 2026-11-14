// 0037_client_people_counts.sql: client codes, admin.client_people (lab staff read a client's members by name, email
// and last sign-in) and the sample/lipid counts recorded once per dataset version. Synthetic data only.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { as, C, count, freshDb, id, U } from './helpers.js';

vi.setConfig({ testTimeout: 30_000 }); // a fresh PGlite per test is slow when the whole suite runs in parallel
let db;
afterEach(async () => { await db?.close(); db = undefined; });

const people = (client) => db.query('SELECT user_id, display_name, email, role, last_sign_in_at FROM admin.client_people($1)', [client]).then((r) => r.rows);
const record = (ds, samples, lipids) => db.query('SELECT admin.record_dataset_counts($1, $2, $3)', [ds, samples, lipids]);
const counts = async (ds) => { await as(db, null); return (await db.query('SELECT sample_count, lipid_count FROM admin.dataset WHERE id = $1', [ds])).rows[0]; };
const RELEASED_A = id(109); // seeded: client A's released, signed v1
const BUILT_A = id(190);
async function builtVersion() {
  await as(db, null);
  await db.query("INSERT INTO admin.dataset(id, client_id, order_id, version, storage_path, sha256, analysis_sha256, analysis_size_bytes, companion_sha256, companion_size_bytes) VALUES ($1, $2, $3, 2, 'datasets/v2.xlsx', $4, $5, 100, $6, 50)", [BUILT_A, C.A, id(101), 'c'.repeat(64), 'd'.repeat(64), 'e'.repeat(64)]);
  return BUILT_A;
}

describe('0037: client codes', () => {
  test('every client has a unique CL- code; a new client gets the next one; the code is readable like the name', async () => {
    db = await freshDb();
    await as(db, null);
    const codes = (await db.query('SELECT code FROM admin.client ORDER BY code')).rows.map((r) => r.code);
    expect(codes).toHaveLength(2);
    for (const code of codes) expect(code).toMatch(/^CL-\d{3}$/);
    expect(new Set(codes).size).toBe(2);
    await as(db, U.owner);
    const created = (await db.query("SELECT admin.create_client('Synthetic Gamma', 'pi_lab', 'grant', NULL) AS id")).rows[0].id;
    await as(db, null);
    expect((await db.query('SELECT code FROM admin.client WHERE id = $1', [created])).rows[0].code).toBe('CL-003');
    await expect(db.query("INSERT INTO admin.client(name, kind, code) VALUES ('Synthetic Delta', 'company', 'CL-003')")).rejects.toThrow(/client_code_key/);
    await as(db, U.aView);
    expect((await db.query('SELECT name, code FROM admin.client')).rows).toEqual([{ name: 'Synthetic Lab Alpha', code: expect.stringMatching(/^CL-\d{3}$/) }]);
  });
});

describe('0037: admin.client_people', () => {
  test('lab Owner, Admin and Operator read each active member: name or null, email, role, last sign-in; archived members and other clients stay out', async () => {
    db = await freshDb();
    await as(db, null);
    await db.query("UPDATE admin.client_member SET display_name = 'Ada Example' WHERE client_id = $1 AND user_id = $2", [C.A, U.aAdmin]);
    await db.query("UPDATE auth.users SET last_sign_in_at = '2026-11-10T09:00:00Z' WHERE id = $1", [U.aAdmin]);
    await db.query("UPDATE admin.client_member SET archived_at = now(), archived_reason = 'Synthetic: left' WHERE client_id = $1 AND user_id = $2", [C.A, U.aView]);
    for (const user of [U.owner, U.admin, U.operator]) {
      await as(db, user);
      const rows = await people(C.A);
      expect(rows.map((r) => r.user_id)).toEqual([U.aAdmin, U.aReq, U.both]); // client admin first, then by name or email
      expect(rows[0]).toEqual({ user_id: U.aAdmin, display_name: 'Ada Example', email: 'aadmin@example.test', role: 'client_admin', last_sign_in_at: new Date('2026-11-10T09:00:00Z') });
      expect(rows[2]).toMatchObject({ display_name: null, email: 'both@example.test', role: 'requester', last_sign_in_at: null });
      expect((await people(C.B)).map((r) => [r.user_id, r.role])).toEqual([[U.bReq, 'requester'], [U.both, 'viewer']]);
    }
  });

  test('a lab member, a client member and an anonymous caller are refused; no direct read of auth.users opens up', async () => {
    db = await freshDb();
    for (const user of [U.member, U.aAdmin, U.bReq]) {
      await as(db, user);
      await expect(people(C.A)).rejects.toThrow(/Lab staff access is required/);
    }
    await as(db, null);
    await db.exec('SET ROLE anon');
    await expect(people(C.A)).rejects.toThrow(/permission denied/);
    await as(db, U.owner);
    await expect(db.query('SELECT email FROM auth.users')).rejects.toThrow(/permission denied/);
  });

  test('SECURITY DEFINER, pinned search_path, executable by authenticated only', async () => {
    db = await freshDb();
    await as(db, null);
    const rows = (await db.query(`SELECT proname, prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app,
      has_function_privilege('anon', oid, 'EXECUTE') AS anon FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname IN ('client_people', 'record_dataset_counts') ORDER BY proname`)).rows;
    expect(rows.map((r) => r.proname)).toEqual(['client_people', 'record_dataset_counts']);
    for (const r of rows) {
      expect(r.prosecdef, r.proname).toBe(true);
      expect(r.proconfig, r.proname).toEqual(['search_path=pg_catalog, admin']);
      expect(r.app, r.proname).toBe(true);
      expect(r.anon, r.proname).toBe(false);
    }
  });
});

describe('0037: dataset sample and lipid counts', () => {
  test('a lab writer records them once on an unsigned built version; the same numbers again are accepted, others refused', async () => {
    db = await freshDb();
    const ds = await builtVersion();
    expect(await counts(ds)).toEqual({ sample_count: null, lipid_count: null });
    await as(db, U.operator);
    await record(ds, 24, 1098);
    expect(await counts(ds)).toEqual({ sample_count: 24, lipid_count: 1098 });
    await as(db, U.operator);
    await record(ds, 24, 1098);
    await expect(record(ds, 24, 1099)).rejects.toThrow(/already records 24 samples and 1098 lipids/);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'dataset' AND action = 'UPDATE' AND entity_id = $1", [ds])).toBe(1);
  });

  test('refused: outside the lab writers, negative or missing numbers, an unknown, signed or released version; a direct update stays refused', async () => {
    db = await freshDb();
    const ds = await builtVersion();
    for (const user of [U.member, U.aAdmin]) {
      await as(db, user);
      await expect(record(ds, 1, 1)).rejects.toThrow(/Only lab Owner, Admin or Operator/);
    }
    await as(db, U.admin);
    await expect(record(ds, -1, 5)).rejects.toThrow(/zero or more/);
    await expect(record(ds, 5, null)).rejects.toThrow(/zero or more/);
    await expect(record(id(999), 1, 1)).rejects.toThrow(/was not found/);
    await expect(record(RELEASED_A, 12, 400)).rejects.toThrow(/signed or no longer built/);
    await db.query("SELECT admin.sign_dataset($1, 'prepared', 'synthetic')", [ds]);
    await expect(record(ds, 12, 400)).rejects.toThrow(/signed or no longer built/);
    await expect(db.query('UPDATE admin.dataset SET sample_count = 1, lipid_count = 1 WHERE id = $1', [ds])).rejects.toThrow(/permission denied/);
    expect(await counts(ds)).toEqual({ sample_count: null, lipid_count: null });
  });

  test('the guard still freezes a built version\'s content, and lets its counts be filled only from empty', async () => {
    db = await freshDb();
    const ds = await builtVersion();
    await as(db, null);
    await expect(db.query("UPDATE admin.dataset SET storage_path = 'datasets/other.xlsx' WHERE id = $1", [ds])).rejects.toThrow(/content cannot change/);
    await db.query('UPDATE admin.dataset SET sample_count = 3, lipid_count = 4 WHERE id = $1', [ds]);
    await expect(db.query('UPDATE admin.dataset SET sample_count = 5, lipid_count = 4 WHERE id = $1', [ds])).rejects.toThrow(/content cannot change/);
    await expect(db.query('UPDATE admin.dataset SET sample_count = 5, lipid_count = NULL WHERE id = $1', [ds])).rejects.toThrow();
    await expect(db.query('UPDATE admin.dataset SET sample_count = 1, lipid_count = 1 WHERE id = $1', [RELEASED_A])).rejects.toThrow(/frozen/);
  });
});
