// 0028_notifications.sql (Gerardo, 2026-11-10): admin.notification_pref (no row = on; written only by
// set_my_notification_pref, for oneself; read only by its person), admin.notification_log (inserted only by the
// service role, read only by lab Owner and Admin, append-only) and admin.notification_audience (service role only).
// The seed (helpers.js) has client A's viewer with dataset_released off and one skipped send to the Operator.
// Synthetic data only.
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
const setPref = (kind, enabled) => db.query('SELECT admin.set_my_notification_pref($1, $2)', [kind, enabled]);
const myPrefs = () => db.query('SELECT user_id, kind, enabled FROM admin.notification_pref ORDER BY kind').then((r) => r.rows);
const logRow = (over = {}) => {
  const row = { kind: 'request_answered', user_id: U.aReq, email: 'areq@example.test', subject: 'Your order request ORD001 was accepted', status: 'sent', error: null, order_id: id(101), client_id: C.A, reference: 'ORD001', ...over };
  return db.query('INSERT INTO admin.notification_log(kind, user_id, email, subject, status, error, order_id, client_id, reference) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [row.kind, row.user_id, row.email, row.subject, row.status, row.error, row.order_id, row.client_id, row.reference]);
};
const audience = (client) => db.query('SELECT * FROM admin.notification_audience($1)', [client]).then((r) => r.rows);

describe('0028: definitions and grants', () => {
  test('set_my_notification_pref is for signed-in users, notification_audience for the service role only; both SECURITY DEFINER with a pinned search_path', async () => {
    const rows = (await db.query(`SELECT proname, prosecdef, proconfig, proacl::text AS acl,
        has_function_privilege('anon', oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', oid, 'EXECUTE') AS app,
        has_function_privilege('service_role', oid, 'EXECUTE') AS service
      FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname IN ('set_my_notification_pref', 'notification_audience', 'refuse_notification_log_change')`)).rows;
    const access = Object.fromEntries(rows.map((r) => [r.proname, [r.anon, r.app, r.service]]));
    expect(access).toEqual({ set_my_notification_pref: [false, true, false], notification_audience: [false, false, true], refuse_notification_log_change: [false, false, false] });
    for (const r of rows.filter((r) => r.proname !== 'refuse_notification_log_change')) {
      expect(r.prosecdef, r.proname).toBe(true);
      expect(r.proconfig.join(','), r.proname).toMatch(/^search_path=pg_catalog, ?admin$/);
      expect(r.acl, r.proname).not.toMatch(/(^|[{,])=X/);
    }
  });

  test('table privileges: the app role only reads both tables; the service role only inserts log rows; anon nothing', async () => {
    const privileges = (await db.query(`SELECT t, r, p, has_table_privilege(r, 'admin.' || t, p) AS ok
      FROM unnest(ARRAY['notification_pref', 'notification_log']) t, unnest(ARRAY['anon', 'authenticated', 'service_role']) r,
           unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p WHERE has_table_privilege(r, 'admin.' || t, p)`)).rows;
    expect(privileges.map((x) => `${x.t} ${x.r} ${x.p}`).sort()).toEqual([
      'notification_log authenticated SELECT', 'notification_log service_role INSERT', 'notification_pref authenticated SELECT',
    ]);
    const triggers = (await db.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'admin.notification_log'::regclass AND NOT tgisinternal ORDER BY 1")).rows.map((r) => r.tgname);
    expect(triggers).toEqual(['refuse_change', 'refuse_truncate']);
  });
});

describe('0028: notification_pref and set_my_notification_pref', () => {
  test('no row means on; a person turns a kind off and on again for themselves (one row, audited with the actor)', async () => {
    await as(db, U.aReq);
    expect(await myPrefs()).toEqual([]);
    await setPref('request_answered', false);
    expect(await myPrefs()).toEqual([{ user_id: U.aReq, kind: 'request_answered', enabled: false }]);
    await setPref('request_answered', false); // unchanged: no update
    await setPref('request_answered', true);
    expect(await myPrefs()).toEqual([{ user_id: U.aReq, kind: 'request_answered', enabled: true }]);
    await as(db, null);
    const audit = (await db.query("SELECT actor, action, after->>'enabled' AS enabled FROM admin.audit_event WHERE entity = 'notification_pref' AND actor = $1 ORDER BY id", [U.aReq])).rows;
    expect(audit).toEqual([{ actor: U.aReq, action: 'INSERT', enabled: 'false' }, { actor: U.aReq, action: 'UPDATE', enabled: 'true' }]);
  });

  test('every signed-in role may set its own switches; nobody reads or writes anyone else\'s', async () => {
    for (const who of [U.owner, U.operator, U.member, U.aAdmin, U.bReq]) {
      await as(db, who);
      await setPref('dataset_released', false);
      expect(await myPrefs(), who).toEqual([{ user_id: who, kind: 'dataset_released', enabled: false }]);
    }
    // The seed's viewer row is invisible to the lab Owner, and no direct write reaches any row.
    await as(db, U.owner);
    expect(await count(db, 'SELECT 1 FROM admin.notification_pref WHERE user_id = $1', [U.aView])).toBe(0);
    for (const who of [U.owner, U.aView]) {
      await as(db, who);
      expect(await code(db.query("INSERT INTO admin.notification_pref(user_id, kind, enabled) VALUES ($1, 'order_requested', false)", [who])), who).toBe('42501');
      expect(await code(db.query('UPDATE admin.notification_pref SET enabled = true')), who).toBe('42501');
      expect(await code(db.query('DELETE FROM admin.notification_pref')), who).toBe('42501');
    }
  });

  test('refusals: no signed-in user (42501), anon and service_role cannot execute, an unknown kind or a missing value (22023)', async () => {
    await as(db, null);
    await db.exec('SET ROLE authenticated');
    expect(await code(setPref('request_answered', false))).toBe('42501');
    for (const role of ['anon', 'service_role']) {
      await asRole(role);
      expect(await code(setPref('request_answered', false)), role).toBe('42501');
    }
    await as(db, U.aReq);
    expect(await code(setPref('weekly_digest', false))).toBe('22023');
    expect(await code(setPref(null, false))).toBe('22023');
    expect(await code(setPref('request_answered', null))).toBe('22023');
    expect(await myPrefs()).toEqual([]);
  });
});

describe('0028: notification_log', () => {
  test('only the service role inserts; lab Owner and Admin read every row; the Operator, a lab member and client roles read none', async () => {
    await asRole('service_role');
    await logRow();
    await logRow({ status: 'failed', error: 'Resend answered 422: invalid from address', user_id: U.aAdmin, email: 'aadmin@example.test' });
    expect(await code(db.query('SELECT * FROM admin.notification_log'))).toBe('42501');
    for (const who of [U.owner, U.admin]) {
      await as(db, who);
      expect(await count(db, 'SELECT 1 FROM admin.notification_log'), who).toBe(3);
    }
    for (const who of [U.operator, U.member, U.aReq, U.aAdmin, U.bReq]) {
      await as(db, who);
      expect(await count(db, 'SELECT 1 FROM admin.notification_log'), who).toBe(0);
      expect(await code(logRow()), who).toBe('42501');
    }
    await asRole('anon');
    expect(await code(db.query('SELECT * FROM admin.notification_log'))).toBe('42501');
    expect(await code(logRow())).toBe('42501');
  });

  test('append-only: no update or delete for the service role, the app role or the migration owner', async () => {
    await asRole('service_role');
    expect(await code(db.query("UPDATE admin.notification_log SET status = 'sent', error = NULL"))).toBe('42501');
    await as(db, U.owner);
    expect(await code(db.query("UPDATE admin.notification_log SET status = 'sent', error = NULL"))).toBe('42501');
    await as(db, null);
    await expect(db.query("UPDATE admin.notification_log SET subject = 'changed'")).rejects.toThrow(/append-only/);
    await expect(db.query('DELETE FROM admin.notification_log')).rejects.toThrow(/append-only/);
    await expect(db.query('TRUNCATE admin.notification_log')).rejects.toThrow(/append-only/);
    expect(await count(db, 'SELECT 1 FROM admin.notification_log')).toBe(1);
  });

  test('checks: a sent row has no error, a failed or skipped row has one; known kinds and statuses only', async () => {
    await asRole('service_role');
    expect(await code(logRow({ status: 'sent', error: 'x' }))).toBe('23514');
    expect(await code(logRow({ status: 'skipped', error: null }))).toBe('23514');
    expect(await code(logRow({ status: 'bounced', error: 'x' }))).toBe('23514');
    expect(await code(logRow({ kind: 'weekly_digest' }))).toBe('23514');
    expect(await code(logRow({ email: ' ' }))).toBe('23514');
    expect(await code(logRow({ status: 'skipped', error: 'Turned off by the recipient' }))).toBe('ok');
  });
});

describe('0028: notification_audience', () => {
  test('active lab staff with their role and the active members of the client with theirs, each with the kinds they turned off', async () => {
    await asRole('service_role');
    const rows = await audience(C.A);
    const lab = rows.filter((r) => r.lab_role).map((r) => [r.email, r.lab_role]);
    expect(lab).toEqual([['admin@example.test', 'admin'], ['member@example.test', 'member'], ['operator@example.test', 'operator'], ['owner@example.test', 'owner']]);
    const members = rows.filter((r) => r.client_role).map((r) => [r.email, r.client_role, r.off]);
    expect(members).toEqual([
      ['aadmin@example.test', 'client_admin', []], ['areq@example.test', 'requester', []],
      ['aview@example.test', 'viewer', ['dataset_released']], ['both@example.test', 'requester', []],
    ]);
    expect((await audience(null)).every((r) => r.lab_role && !r.client_role)).toBe(true);
    expect((await audience(C.B)).filter((r) => r.client_role).map((r) => [r.email, r.client_role])).toEqual([['breq@example.test', 'requester'], ['both@example.test', 'viewer']].sort());
  });

  test('archived memberships, archived lab staff and an archived client drop out; a turned-off kind shows up at once', async () => {
    await as(db, null);
    await db.query("UPDATE admin.client_member SET archived_at = now(), archived_reason = 'left' WHERE user_id = $1 AND client_id = $2", [U.aReq, C.A]);
    await db.query("UPDATE admin.lab_staff SET archived_at = now(), archived_reason = 'left' WHERE user_id = $1", [U.operator]);
    await as(db, U.owner);
    await setPref('order_requested', false);
    await asRole('service_role');
    const rows = await audience(C.A);
    expect(rows.map((r) => r.email)).not.toContain('areq@example.test');
    expect(rows.map((r) => r.email)).not.toContain('operator@example.test');
    expect(rows.find((r) => r.email === 'owner@example.test').off).toEqual(['order_requested']);
    await as(db, null);
    await db.query("UPDATE admin.client SET archived_at = now(), archived_reason = 'contract ended' WHERE id = $1", [C.B]);
    await asRole('service_role');
    expect((await audience(C.B)).filter((r) => r.client_role)).toEqual([]);
  });

  test('the app role and anon cannot call it', async () => {
    for (const who of [U.owner, U.aAdmin]) {
      await as(db, who);
      expect(await code(audience(C.A)), who).toBe('42501');
    }
    await asRole('anon');
    expect(await code(audience(C.A))).toBe('42501');
  });
});
