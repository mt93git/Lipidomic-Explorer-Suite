// 0036_notification_matrix.sql (Gerardo, 2026-11-13): admin.notification_rule (the event x audience matrix, read by lab
// staff and the service role, changed only by set_notification_rule for lab Owner or Admin, audited),
// admin.notification_event and admin.claim_results_missing (the scheduled "no results TXT N days after acquisition"
// check, service role only, each order once), and the four new kinds on notification_pref and notification_log.
// The seed (helpers.js) has client B's order already announced by the check. Synthetic data only.
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { as, C, count, freshDb, id, U } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const code = async (p) => p.then(() => 'ok', (e) => e.code);
async function asRole(role) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  await db.exec(`SET ROLE ${role}`);
}
const rules = () => db.query('SELECT kind, lab_roles, step_owner, client_admin, requester, days FROM admin.notification_rule ORDER BY kind').then((r) => r.rows);
// 0040 added p_client_members (before p_days); these 0036 cases leave it off.
const setRule = (kind, labRoles, stepOwner, clientAdmin, requester, days = null) =>
  db.query('SELECT admin.set_notification_rule($1, $2, $3, $4, $5, false, $6)', [kind, labRoles, stepOwner, clientAdmin, requester, days]);
const claim = () => db.query('SELECT * FROM admin.claim_results_missing()').then((r) => r.rows);

// Moves client A's order to acquired as the Operator (the audit row dates the acquisition), then back-dates that
// audit row's twin by inserting an older one, as the owner: the check reads the first time the order became acquired.
async function acquireOrderA(daysAgo) {
  await as(db, null);
  await db.query("UPDATE admin.\"order\" SET stage = 'acquired' WHERE id = $1", [id(101)]);
  await db.query(`INSERT INTO admin.audit_event(created_at, actor, client_id, entity, entity_id, action, after)
    VALUES (now() - make_interval(days => $1), $2, $3, 'order', $4, 'UPDATE', '{"stage": "acquired"}')`, [daysAgo, U.operator, C.A, id(101)]);
}

describe('0036: definitions and grants', () => {
  test('set_notification_rule is for signed-in users (it checks Owner or Admin), claim_results_missing for the service role only', async () => {
    const rows = (await db.query(`SELECT proname, prosecdef, proconfig, proacl::text AS acl,
        has_function_privilege('anon', oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', oid, 'EXECUTE') AS app,
        has_function_privilege('service_role', oid, 'EXECUTE') AS service
      FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname IN ('set_notification_rule', 'claim_results_missing')`)).rows;
    expect(Object.fromEntries(rows.map((r) => [r.proname, [r.anon, r.app, r.service]])))
      .toEqual({ set_notification_rule: [false, true, false], claim_results_missing: [false, false, true] });
    for (const r of rows) {
      expect(r.prosecdef, r.proname).toBe(true);
      expect(r.proconfig.join(','), r.proname).toMatch(/^search_path=pg_catalog, ?admin$/);
      expect(r.acl, r.proname).not.toMatch(/(^|[{,])=X/);
    }
  });

  test('table privileges: the app role and the service role only read the matrix; the event record is read by the app role only', async () => {
    const privileges = (await db.query(`SELECT t, r, p FROM unnest(ARRAY['notification_rule', 'notification_event']) t,
        unnest(ARRAY['anon', 'authenticated', 'service_role']) r, unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
      WHERE has_table_privilege(r, 'admin.' || t, p)`)).rows;
    expect(privileges.map((x) => `${x.t} ${x.r} ${x.p}`).sort()).toEqual([
      'notification_event authenticated SELECT', 'notification_rule authenticated SELECT', 'notification_rule service_role SELECT',
    ]);
  });

  test('the defaults: the prototype\'s five events and the 0028 four as they were sent', async () => {
    await as(db, null);
    expect(await rules()).toEqual([
      { kind: 'access_requested', lab_roles: ['owner', 'admin', 'operator'], step_owner: false, client_admin: false, requester: false, days: null },
      { kind: 'batch_acquired', lab_roles: ['operator'], step_owner: false, client_admin: false, requester: true, days: null },
      { kind: 'dataset_released', lab_roles: ['operator'], step_owner: false, client_admin: true, requester: true, days: null },
      { kind: 'gate_failed', lab_roles: [], step_owner: true, client_admin: false, requester: false, days: null },
      { kind: 'order_requested', lab_roles: ['owner', 'admin', 'operator'], step_owner: false, client_admin: false, requester: false, days: null },
      { kind: 'request_answered', lab_roles: [], step_owner: false, client_admin: false, requester: true, days: null },
      { kind: 'results_missing', lab_roles: ['operator', 'admin'], step_owner: false, client_admin: false, requester: false, days: 3 },
      { kind: 'shipment_received', lab_roles: ['admin'], step_owner: false, client_admin: true, requester: true, days: null },
    ]);
  });
});

describe('0036: the matrix', () => {
  test('lab staff read it, client people and a lab Member do not', async () => {
    for (const who of [U.owner, U.admin, U.operator]) {
      await as(db, who);
      expect((await rules()).length, who).toBe(8);
    }
    for (const who of [U.member, U.aAdmin, U.aReq]) {
      await as(db, who);
      expect((await rules()).length, who).toBe(0);
    }
  });

  test('an Owner or Admin changes a row (roles sorted and deduplicated); the change is audited with the actor; an unchanged call writes nothing', async () => {
    await as(db, U.admin);
    await setRule('shipment_received', ['operator', 'admin', 'operator'], false, false, true);
    await setRule('shipment_received', ['admin', 'operator'], false, false, true); // the same row: no update
    await as(db, U.owner);
    await setRule('results_missing', ['admin'], false, false, false, 5); // lab-only since 0040
    await as(db, null);
    const changed = (await rules()).filter((r) => ['shipment_received', 'results_missing'].includes(r.kind));
    expect(changed).toEqual([
      { kind: 'results_missing', lab_roles: ['admin'], step_owner: false, client_admin: false, requester: false, days: 5 },
      { kind: 'shipment_received', lab_roles: ['admin', 'operator'], step_owner: false, client_admin: false, requester: true, days: null },
    ]);
    const audit = (await db.query(`SELECT actor, after->>'kind' AS kind, after->>'updated_by' AS by FROM admin.audit_event
      WHERE entity = 'notification_rule' AND action = 'UPDATE' AND actor IS NOT NULL ORDER BY id`)).rows; // 0040's own updates have no actor
    expect(audit).toEqual([{ actor: U.admin, kind: 'shipment_received', by: U.admin }, { actor: U.owner, kind: 'results_missing', by: U.owner }]);
  });

  test('an Operator, a lab Member and client people are refused; nobody writes the table directly', async () => {
    for (const who of [U.operator, U.member, U.aAdmin]) {
      await as(db, who);
      expect(await code(setRule('gate_failed', [], false, false, false)), who).toBe('42501');
    }
    await as(db, U.owner);
    expect(await code(db.query("UPDATE admin.notification_rule SET requester = false WHERE kind = 'gate_failed'"))).toBe('42501');
    expect(await code(db.query("INSERT INTO admin.notification_rule(kind) VALUES ('gate_failed')"))).toBe('42501');
    await asRole('service_role');
    expect(await code(db.query("UPDATE admin.notification_rule SET requester = false WHERE kind = 'gate_failed'"))).toBe('42501');
    expect(await code(db.query('SELECT admin.set_notification_rule($1, $2, false, false, false, false, NULL)', ['gate_failed', []]))).toBe('42501');
  });

  test('refuses an unknown kind, a lab Member role, a step owner outside gate_failed, a client audience for an access request and a bad delay', async () => {
    await as(db, U.admin);
    expect(await code(setRule('invitation', [], false, false, false))).toBe('22023');
    expect(await code(setRule('batch_acquired', ['member'], false, false, false))).toBe('22023');
    expect(await code(setRule('batch_acquired', [], true, false, false))).toBe('22023');
    expect(await code(setRule('access_requested', ['admin'], false, true, false))).toBe('22023');
    expect(await code(setRule('results_missing', ['admin'], false, false, false, null))).toBe('22023');
    expect(await code(setRule('results_missing', ['admin'], false, false, false, 0))).toBe('22023');
    expect(await code(setRule('results_missing', ['admin'], false, false, false, 61))).toBe('22023');
    expect(await code(setRule('batch_acquired', ['operator'], false, false, true, 3))).toBe('22023');
    expect(await code(setRule('gate_failed', [], false, false, null))).toBe('22023');
  });

  test('the new kinds are accepted by a person\'s own switch and by the send log', async () => {
    await as(db, U.aAdmin);
    for (const kind of ['shipment_received', 'gate_failed', 'batch_acquired', 'results_missing']) {
      await db.query('SELECT admin.set_my_notification_pref($1, false)', [kind]);
    }
    expect(await count(db, 'SELECT 1 FROM admin.notification_pref WHERE user_id = $1', [U.aAdmin])).toBe(4);
    await asRole('service_role');
    await db.query(`INSERT INTO admin.notification_log(kind, user_id, email, subject, status, error, reference)
      VALUES ('results_missing', $1, 'operator@example.test', 'No results TXT for ORD001', 'skipped', 'Sending is off', 'ORD001')`, [U.operator]);
  });
});

describe('0036: claim_results_missing', () => {
  test('an order acquired 3 days ago without results is claimed once, with what the email needs; a second call gets nothing', async () => {
    await acquireOrderA(4);
    await asRole('service_role');
    const first = await claim();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ order_id: id(101), client_id: C.A, client_name: 'Synthetic Lab Alpha', title: 'Synthetic order', days: 3 });
    expect(await claim()).toEqual([]);
    await as(db, null);
    expect(await count(db, "SELECT 1 FROM admin.notification_event WHERE kind = 'results_missing' AND order_id = $1", [id(101)])).toBe(1);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'notification_event' AND after->>'order_id' = $1", [id(101)])).toBe(1);
  });

  test('not yet due, already past acquired, archived, or every audience off: nothing is claimed', async () => {
    await acquireOrderA(2);
    await asRole('service_role');
    expect(await claim()).toEqual([]);
    // A longer delay set by the Admin keeps a 4-day-old acquisition waiting.
    await acquireOrderA(4);
    await as(db, U.admin);
    await setRule('results_missing', ['admin'], false, false, false, 5);
    await asRole('service_role');
    expect(await claim()).toEqual([]);
    // Every audience off: nothing is claimed, so turning one on later still announces the order.
    await as(db, U.admin);
    await setRule('results_missing', [], false, false, false, 3);
    await asRole('service_role');
    expect(await claim()).toEqual([]);
    // Results accepted (the order moved on): nothing to announce.
    await as(db, U.admin);
    await setRule('results_missing', ['admin'], false, false, false, 3);
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET stage = 'processed' WHERE id = $1", [id(101)]);
    await asRole('service_role');
    expect(await claim()).toEqual([]);
  });

  test('client B\'s order, announced already by the seed, is never claimed again', async () => {
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET stage = 'acquired' WHERE id = $1", [id(201)]);
    await db.query(`INSERT INTO admin.audit_event(created_at, client_id, entity, entity_id, action, after)
      VALUES (now() - interval '10 days', $1, 'order', $2, 'UPDATE', '{"stage": "acquired"}')`, [C.B, id(201)]);
    await asRole('service_role');
    expect(await claim()).toEqual([]);
  });

  test('the app role cannot claim or write the event record', async () => {
    await acquireOrderA(4);
    await as(db, U.owner);
    expect(await code(claim())).toBe('42501');
    expect(await code(db.query("INSERT INTO admin.notification_event(kind, order_id, client_id, reference) VALUES ('results_missing', $1, $2, 'ORD001')", [id(101), C.A]))).toBe('42501');
    expect(await count(db, 'SELECT 1 FROM admin.notification_event')).toBe(1); // the seed's row, readable by lab staff
    await as(db, U.aAdmin);
    expect(await count(db, 'SELECT 1 FROM admin.notification_event')).toBe(0);
  });
});
