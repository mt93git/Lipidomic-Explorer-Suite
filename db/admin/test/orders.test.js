// New order (0013_orders.sql): admin.create_order, the lab staff's way to open an order. Synthetic data only.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, count, id, U, C } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const PANEL = id(501);
const create = (client = C.A, panel = PANEL, { title = 'Synthetic plasma lipidome', expected = 24 } = {}) =>
  db.query("SELECT admin.create_order($1, $2, $3, 'plasma', $4, 'PO-SYN-1', 'synthetic notes') AS id", [client, panel, title, expected])
    .then((r) => r.rows[0].id);
const orderRow = async (oid) => {
  await as(db, null);
  return (await db.query('SELECT * FROM admin."order" WHERE id = $1', [oid])).rows[0];
};

describe('admin.create_order', () => {
  test('lab staff (operator, admin, owner) create an order at Request with every field, requested_by = the caller', async () => {
    for (const u of [U.operator, U.admin, U.owner]) {
      await as(db, u);
      const oid = await create();
      const o = await orderRow(oid);
      expect(o).toMatchObject({
        client_id: C.A, panel_id: PANEL, title: 'Synthetic plasma lipidome', matrix: 'plasma', expected_samples: 24,
        billing_ref: 'PO-SYN-1', notes: 'synthetic notes', stage: 'request', requested_by: u, archived_at: null,
      });
      expect(o.code).toMatch(/^ORD\d{3,}$/);
    }
  });

  test('blank optional text is stored as null; the order is audited with the caller as actor', async () => {
    await as(db, U.operator);
    const oid = (await db.query("SELECT admin.create_order($1, $2, '  Trimmed title ', ' ', NULL, '', '   ') AS id", [C.B, PANEL])).rows[0].id;
    const o = await orderRow(oid);
    expect(o).toMatchObject({ title: 'Trimmed title', matrix: null, expected_samples: null, billing_ref: null, notes: null, client_id: C.B });
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'order' AND entity_id = $1 AND action = 'INSERT' AND actor = $2 AND client_id = $3",
      [oid, U.operator, C.B])).toBe(1);
  });

  test('refuses a caller who is not a lab writer: lab member, client admin, requester, viewer', async () => {
    for (const u of [U.member, U.aAdmin, U.aReq, U.aView]) {
      await as(db, u);
      await expect(create(), u).rejects.toThrow(/only lab staff/);
    }
    await as(db, null);
    expect(await count(db, "SELECT 1 FROM admin.\"order\" WHERE title = 'Synthetic plasma lipidome'")).toBe(0);
  });

  test('refuses an archived client and an unknown client', async () => {
    await as(db, null);
    await db.query("UPDATE admin.client SET archived_at = now(), archived_reason = 'synthetic' WHERE id = $1", [C.B]);
    await as(db, U.operator);
    await expect(create(C.B)).rejects.toThrow(/client .* is archived/);
    await expect(create(id(999))).rejects.toThrow(/client .* not found/);
  });

  test('refuses an archived panel and an unknown panel; a null panel is allowed (not chosen yet)', async () => {
    await as(db, null);
    await db.query("INSERT INTO admin.panel(id, name, dataset_type, archived_at, archived_reason) VALUES ($1, 'Retired panel', 'global', now(), 'synthetic')", [id(502)]);
    await as(db, U.operator);
    await expect(create(C.A, id(502))).rejects.toThrow(/panel .* is archived/);
    await expect(create(C.A, id(998))).rejects.toThrow(/panel .* not found/);
    expect((await orderRow(await create(C.A, null))).panel_id).toBe(null);
  });

  test('refuses a missing title and a negative expected sample count', async () => {
    await as(db, U.operator);
    await expect(create(C.A, PANEL, { title: '  ' })).rejects.toThrow(/title is required/);
    await expect(create(C.A, PANEL, { expected: -1 })).rejects.toThrow(/expected samples/);
  });

  test('is SECURITY DEFINER with search_path pinned and executable by authenticated, not by anon', async () => {
    await as(db, null);
    const fn = (await db.query("SELECT prosecdef, proconfig FROM pg_proc WHERE oid = 'admin.create_order(uuid, uuid, text, text, int, text, text)'::regprocedure")).rows[0];
    expect(fn.prosecdef).toBe(true);
    expect(fn.proconfig.join()).toMatch(/search_path=/);
    const can = async (role) => (await db.query(`SELECT has_function_privilege('${role}', 'admin.create_order(uuid, uuid, text, text, int, text, text)', 'EXECUTE') AS ok`)).rows[0].ok;
    expect(await can('authenticated')).toBe(true);
    expect(await can('anon')).toBe(false);
  });
});
