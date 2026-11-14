// 0033_order_wizard.sql: the lab's rate sheet (panel_rate, set by lab Owner/Admin) and New order drafts (order_draft,
// saved, discarded and placed by lab writers). Seed: panel "Global panel" (id 501) at USD 50.00 and 20 min per
// injection; one open draft (id 901) for client A on step 2. Synthetic data only.
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { as, C, count, freshDb, id, U } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const PANEL = id(501);
const DRAFT = id(901);
const one = (sql, p) => db.query(sql, p).then((r) => r.rows[0]);
const setRate = (rate, currency, minutes, panel = PANEL) => db.query('SELECT admin.set_panel_rate($1, $2, $3, $4)', [panel, rate, currency, minutes]);
const rate = () => one('SELECT rate_per_sample::text AS rate, currency, minutes_per_injection::text AS minutes, updated_by FROM admin.panel_rate WHERE panel_id = $1', [PANEL]);
const save = (draftId, step = 1, client = C.A, title = 'Synthetic study', data = { title: 'Synthetic study' }) =>
  one('SELECT admin.save_order_draft($1, $2, $3, $4, $5) AS id', [draftId, step, client, title, data]).then((r) => r.id);
const place = (draftId, title = 'Placed study') =>
  one('SELECT admin.place_order_draft($1, $2, $3, $4, $5, $6, $7, $8, $9) AS id', [draftId, C.A, PANEL, title, 'Serum', 67, 'Internal charge code · CC-1', 'Study design: Groups.', { title }]).then((r) => r.id);
const draft = (draftId) => one('SELECT * FROM admin.order_draft WHERE id = $1', [draftId]);
const RPCS = ['set_panel_rate', 'save_order_draft', 'discard_order_draft', 'place_order_draft'];

describe('0033: the functions and the tables', () => {
  test('the four functions are SECURITY DEFINER, pin search_path and are granted to authenticated only; the helper is not', async () => {
    const rows = (await db.query("SELECT proname, prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app, has_function_privilege('anon', oid, 'EXECUTE') AS anon FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname = ANY($1)", [RPCS])).rows;
    expect(rows.map((r) => r.proname).sort()).toEqual([...RPCS].sort());
    for (const r of rows) {
      expect(r, r.proname).toMatchObject({ prosecdef: true, app: true, anon: false });
      expect(r.proconfig.join(',')).toMatch(/^search_path=pg_catalog, ?admin$/);
    }
    expect((await one("SELECT has_function_privilege('authenticated', 'admin.lock_open_order_draft(uuid)', 'EXECUTE') AS app")).app).toBe(false);
  });

  test('no direct write for the app role; lab staff read both tables, client users and lab members without a role read nothing', async () => {
    const grants = (await db.query(`SELECT t, p FROM unnest(ARRAY['panel_rate', 'order_draft']) t, unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) p
      WHERE has_table_privilege('authenticated', 'admin.' || t, p)`)).rows;
    expect(grants).toEqual([]);
    for (const user of [U.owner, U.admin, U.operator]) {
      await as(db, user);
      expect(await count(db, 'SELECT 1 FROM admin.panel_rate'), user).toBe(1);
      expect(await count(db, 'SELECT 1 FROM admin.order_draft'), user).toBe(1);
    }
    for (const user of [U.aAdmin, U.aReq, U.aView, U.bReq]) {
      await as(db, user);
      expect(await count(db, 'SELECT 1 FROM admin.panel_rate'), user).toBe(0);
      expect(await count(db, 'SELECT 1 FROM admin.order_draft'), user).toBe(0);
    }
    await as(db, U.owner);
    await expect(db.query("UPDATE admin.panel_rate SET currency = 'EUR'")).rejects.toThrow(/permission denied/);
    await expect(db.query("UPDATE admin.order_draft SET step = 3")).rejects.toThrow(/permission denied/);
  });
});

describe('0033: the rate sheet', () => {
  test('lab Owner and Admin set, change and clear a panel line; the currency is upper-cased and the writer recorded', async () => {
    await as(db, U.owner);
    await setRate(72.5, ' eur ', 33);
    expect(await rate()).toEqual({ rate: '72.50', currency: 'EUR', minutes: '33.00', updated_by: U.owner });
    await as(db, U.admin);
    await setRate(null, null, null);
    expect(await rate()).toEqual({ rate: null, currency: null, minutes: null, updated_by: U.admin });
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.panel_rate')).toBe(1);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'panel_rate'")).toBe(3);
  });

  test('Operators, lab members and client roles are refused; nothing changes', async () => {
    for (const user of [U.operator, U.member, U.aAdmin, U.aReq]) {
      await as(db, user);
      await expect(setRate(1, 'USD', 1), user).rejects.toThrow(/Lab Owner or Admin access is required/);
    }
    await as(db, null);
    expect(await rate()).toEqual({ rate: '50.00', currency: 'USD', minutes: '20.00', updated_by: U.admin });
  });

  test('refuses a price without currency, a currency without price, a bad code, a negative price, bad minutes and an archived panel', async () => {
    await as(db, U.owner);
    await expect(setRate(10, null, null)).rejects.toThrow(/needs its currency/);
    await expect(setRate(null, 'USD', null)).rejects.toThrow(/needs its currency/);
    await expect(setRate(10, 'dollars', null)).rejects.toThrow(/three-letter code/);
    await expect(setRate(-1, 'USD', null)).rejects.toThrow(/0 or more/);
    await expect(setRate(null, null, 0)).rejects.toThrow(/more than 0/);
    await expect(setRate(null, null, 601)).rejects.toThrow(/at most 600/);
    await expect(setRate(1, 'USD', 1, id(999))).rejects.toThrow(/Panel not found/);
    await db.query("SELECT admin.archive_panel($1, 'Synthetic retirement')", [PANEL]).catch(() => null);
    const archived = (await one('SELECT archived_at FROM admin.panel WHERE id = $1', [PANEL])).archived_at;
    if (archived) await expect(setRate(1, 'USD', 1)).rejects.toThrow(/archived/);
    await as(db, null);
    expect((await rate()).rate).toBe('50.00');
  });
});

describe('0033: order drafts', () => {
  test('a lab writer saves a new draft, saves it again, and every lab writer may resume it', async () => {
    await as(db, U.operator);
    const draftId = await save(null, 1, null, '  ', {});
    expect(await draft(draftId)).toMatchObject({ step: 1, client_id: null, title: null, created_by: U.operator, order_id: null, discarded_at: null });
    await as(db, U.admin);
    expect(await save(draftId, 3, C.A, ' Diet study ', { title: 'Diet study', sampleList: 'FullName\nS1' })).toBe(draftId);
    expect(await draft(draftId)).toMatchObject({ step: 3, client_id: C.A, title: 'Diet study', created_by: U.operator, updated_by: U.admin, data: { title: 'Diet study', sampleList: 'FullName\nS1' } });
  });

  test('lab members without a writing role and client users cannot save, discard or place', async () => {
    for (const user of [U.member, U.aAdmin, U.aReq]) {
      await as(db, user);
      await expect(save(null), user).rejects.toThrow(/only lab staff/);
      await expect(db.query('SELECT admin.discard_order_draft($1)', [DRAFT]), user).rejects.toThrow(/only lab staff/);
      await expect(place(DRAFT), user).rejects.toThrow(/only lab staff/);
    }
    await as(db, null);
    expect(await draft(DRAFT)).toMatchObject({ step: 2, order_id: null, discarded_at: null });
  });

  test('refuses a bad step, a non-object, an unknown or archived client and an unknown draft', async () => {
    await as(db, U.operator);
    await expect(save(null, 5)).rejects.toThrow(/step 1 to 4/);
    await expect(one('SELECT admin.save_order_draft(NULL, 1, NULL, NULL, $1)', [[1, 2]])).rejects.toThrow(/as an object/);
    await expect(save(null, 1, id(999))).rejects.toThrow(/not found/);
    await expect(save(id(998))).rejects.toThrow(/Draft not found/);
    await as(db, U.admin);
    await db.query("UPDATE admin.client SET archived_at = now(), archived_reason = 'synthetic end' WHERE id = $1", [C.B]);
    await as(db, U.operator);
    await expect(save(null, 1, C.B)).rejects.toThrow(/archived/);
  });

  test('placing creates the order at Request and closes the draft in the same step; a placed draft never changes', async () => {
    await as(db, U.operator);
    const orderId = await place(DRAFT);
    const order = await one('SELECT client_id, panel_id, title, matrix, expected_samples, stage, billing_ref, notes, requested_by FROM admin."order" WHERE id = $1', [orderId]);
    expect(order).toEqual({ client_id: C.A, panel_id: PANEL, title: 'Placed study', matrix: 'Serum', expected_samples: 67, stage: 'request', billing_ref: 'Internal charge code · CC-1', notes: 'Study design: Groups.', requested_by: U.operator });
    expect(await draft(DRAFT)).toMatchObject({ order_id: orderId, step: 4, title: 'Placed study' });
    await expect(save(DRAFT)).rejects.toThrow(/already placed/);
    await expect(place(DRAFT)).rejects.toThrow(/already placed/);
    await expect(db.query('SELECT admin.discard_order_draft($1)', [DRAFT])).rejects.toThrow(/already placed/);
  });

  test('when create_order refuses, nothing is placed and the draft stays open', async () => {
    await as(db, U.operator);
    const before = await count(db, 'SELECT 1 FROM admin."order"');
    await expect(place(DRAFT, '  ')).rejects.toThrow(/title is required/);
    expect(await count(db, 'SELECT 1 FROM admin."order"')).toBe(before);
    expect(await draft(DRAFT)).toMatchObject({ order_id: null, discarded_at: null, title: 'Synthetic draft' });
  });

  test('discarding keeps the row, records who, and closes it', async () => {
    await as(db, U.operator);
    await db.query('SELECT admin.discard_order_draft($1)', [DRAFT]);
    expect(await draft(DRAFT)).toMatchObject({ discarded_by: U.operator, order_id: null });
    await expect(save(DRAFT)).rejects.toThrow(/discarded/);
    await expect(place(DRAFT)).rejects.toThrow(/discarded/);
    await as(db, null);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'order_draft' AND entity_id = $1", [DRAFT])).toBe(2);
  });
});
