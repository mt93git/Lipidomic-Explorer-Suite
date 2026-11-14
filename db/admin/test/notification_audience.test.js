// 0040_notification_audience.sql (Gerardo, 2026-11-14): the lab-only events (order_requested, gate_failed,
// results_missing, access_requested) never reach a client's people; a "Client members" column (every active member of
// the order's client) for the client-facing events, on for dataset_released; the results check no longer loses an email
// when the send fails (claimed rows stay unsent until mark_results_missing_sent, and are handed out again later).
// Synthetic data only.
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { as, C, count, freshDb, id, U } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const code = async (p) => p.then(() => 'ok', (e) => e.code);
async function asService() {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  await db.exec('SET ROLE service_role');
}
const LAB_ONLY = ['access_requested', 'gate_failed', 'order_requested', 'results_missing'];
const setRule = (kind, labRoles, stepOwner, clientAdmin, requester, clientMembers, days = null) =>
  db.query('SELECT admin.set_notification_rule($1, $2, $3, $4, $5, $6, $7)', [kind, labRoles, stepOwner, clientAdmin, requester, clientMembers, days]);
const row = (kind) => db.query('SELECT * FROM admin.notification_rule WHERE kind = $1', [kind]).then((r) => r.rows[0]);
const claim = () => db.query('SELECT * FROM admin.claim_results_missing()').then((r) => r.rows);
const markSent = (orderId) => db.query('SELECT admin.mark_results_missing_sent($1)', [orderId]);

async function acquireOrderA(daysAgo) {
  await as(db, null);
  await db.query("UPDATE admin.\"order\" SET stage = 'acquired' WHERE id = $1", [id(101)]);
  await db.query(`INSERT INTO admin.audit_event(created_at, actor, client_id, entity, entity_id, action, after)
    VALUES (now() - make_interval(days => $1), $2, $3, 'order', $4, 'UPDATE', '{"stage": "acquired"}')`, [daysAgo, U.operator, C.A, id(101)]);
}

describe('0040 item 1: lab-only events', () => {
  test('no client cell is on for a lab-only event, and the table refuses one', async () => {
    await as(db, null);
    const rows = (await db.query('SELECT kind, client_admin, requester, client_members FROM admin.notification_rule WHERE kind = ANY($1) ORDER BY kind', [LAB_ONLY])).rows;
    expect(rows).toEqual(LAB_ONLY.map((kind) => ({ kind, client_admin: false, requester: false, client_members: false })));
    for (const kind of LAB_ONLY) {
      for (const cell of ['client_admin', 'requester', 'client_members']) {
        expect(await code(db.query(`UPDATE admin.notification_rule SET ${cell} = true WHERE kind = $1`, [kind])), `${kind} ${cell}`).toBe('23514');
      }
    }
  });

  test('set_notification_rule refuses a client audience for each lab-only event, with a clear message', async () => {
    await as(db, U.admin);
    for (const kind of LAB_ONLY) {
      const days = kind === 'results_missing' ? 3 : null;
      for (const cells of [[true, false, false], [false, true, false], [false, false, true]]) {
        const error = await setRule(kind, ['admin'], false, ...cells, days).then(() => null, (e) => e);
        expect(error?.code, `${kind} ${cells}`).toBe('22023');
        expect(error?.message, kind).toMatch(/lab staff only/);
      }
      expect(await code(setRule(kind, ['admin'], kind === 'gate_failed', false, false, false, days)), kind).toBe('ok');
    }
  });
});

describe('0040 item 2: the Client members column', () => {
  test('a new boolean, on by default for dataset_released only', async () => {
    await as(db, null);
    const on = (await db.query('SELECT kind FROM admin.notification_rule WHERE client_members ORDER BY kind')).rows.map((r) => r.kind);
    expect(on).toEqual(['dataset_released']);
  });

  test('an Owner or Admin turns it on or off for a client-facing event (audited); refused for a lab-only one', async () => {
    await as(db, U.owner);
    await setRule('dataset_released', ['operator'], false, true, true, false);
    await setRule('shipment_received', ['admin'], false, true, true, true);
    await as(db, null);
    expect((await row('dataset_released')).client_members).toBe(false);
    expect((await row('shipment_received')).client_members).toBe(true);
    const audit = (await db.query(`SELECT after->>'kind' AS kind, after->>'client_members' AS members FROM admin.audit_event
      WHERE entity = 'notification_rule' AND action = 'UPDATE' AND actor = $1 ORDER BY id`, [U.owner])).rows;
    expect(audit).toEqual([{ kind: 'dataset_released', members: 'false' }, { kind: 'shipment_received', members: 'true' }]);
    await as(db, U.admin);
    expect(await code(setRule('order_requested', ['admin'], false, false, false, true))).toBe('22023');
    expect(await code(setRule('dataset_released', ['operator'], false, true, true, null))).toBe('22023');
  });

  test('the old six-argument call is gone, so an old app cannot silently clear the column', async () => {
    await as(db, U.admin);
    expect(await code(db.query("SELECT admin.set_notification_rule('dataset_released', '{operator}', false, true, true, NULL::int)"))).toBe('42883');
  });
});

describe('0040 item 4: a failed send does not lose the results email', () => {
  test('a claimed order stays unsent until marked; after 15 minutes it is handed out again, once', async () => {
    await acquireOrderA(4);
    await asService();
    expect((await claim()).map((r) => r.order_id)).toEqual([id(101)]);
    // Still within the lease: nobody else gets it (two servers never email it at the same time).
    expect(await claim()).toEqual([]);
    // The send failed (or the server stopped): the lease runs out and the next run gets it again.
    await as(db, null);
    await db.query("UPDATE admin.notification_event SET claimed_at = now() - interval '16 minutes' WHERE order_id = $1", [id(101)]);
    await asService();
    const again = await claim();
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ order_id: id(101), client_id: C.A, client_name: 'Synthetic Lab Alpha', days: 3 });
    expect(await claim()).toEqual([]);
    // Sent: never handed out again, even after the lease.
    await markSent(id(101));
    await as(db, null);
    await db.query("UPDATE admin.notification_event SET claimed_at = now() - interval '1 day' WHERE order_id = $1", [id(101)]);
    await asService();
    expect(await claim()).toEqual([]);
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.notification_event WHERE order_id = $1 AND sent_at IS NOT NULL', [id(101)])).toBe(1);
  });

  test('an unsent claim whose order moved on is not retried; the seed\'s announced order counts as sent', async () => {
    await acquireOrderA(4);
    await asService();
    await claim();
    await as(db, null);
    await db.query("UPDATE admin.notification_event SET claimed_at = now() - interval '1 hour' WHERE order_id = $1", [id(101)]);
    await db.query("UPDATE admin.\"order\" SET stage = 'processed' WHERE id = $1", [id(101)]);
    await asService();
    expect(await claim()).toEqual([]);
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.notification_event WHERE order_id = $1 AND sent_at IS NOT NULL', [id(201)])).toBe(1);
  });

  test('mark_results_missing_sent is for the service role only', async () => {
    const rows = (await db.query(`SELECT has_function_privilege('anon', 'admin.mark_results_missing_sent(uuid)', 'EXECUTE') AS anon,
      has_function_privilege('authenticated', 'admin.mark_results_missing_sent(uuid)', 'EXECUTE') AS app,
      has_function_privilege('service_role', 'admin.mark_results_missing_sent(uuid)', 'EXECUTE') AS service`)).rows[0];
    expect(rows).toEqual({ anon: false, app: false, service: true });
  });
});
