// 0029_activation.sql (Gerardo, 2026-11-11): notification_log takes the 'invitation' kind (no user) and 'activation';
// admin.account_state() (lab Owner and Admin only) gives each active member's sign-in facts; record_activation_email
// writes the "Activation email sent" audit row. Synthetic data only.
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { as, freshDb, id, U } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const code = async (p) => p.then(() => 'ok', (e) => e.code);
const insertLog = (kind, userId, status = 'sent', error = null, at = null) => db.query(
  'INSERT INTO admin.notification_log(kind, user_id, email, subject, status, error, created_at) VALUES ($1, $2, $3, $4, $5, $6, coalesce($7, now()))',
  [kind, userId, 'someone@example.test', 'Welcome to Lipidomics', status, error, at]);
const state = () => db.query('SELECT * FROM admin.account_state()').then((r) => Object.fromEntries(r.rows.map((row) => [row.user_id, row])));

describe('0029: definitions and grants', () => {
  test('both functions: SECURITY DEFINER with a pinned search_path, for signed-in users only (not anon, not the service role)', async () => {
    const rows = (await db.query(`SELECT proname, prosecdef, proconfig, has_function_privilege('anon', oid, 'EXECUTE') AS anon,
        has_function_privilege('authenticated', oid, 'EXECUTE') AS app, has_function_privilege('service_role', oid, 'EXECUTE') AS service
      FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname IN ('account_state', 'record_activation_email') ORDER BY proname`)).rows;
    expect(rows.map((r) => [r.proname, r.prosecdef, r.anon, r.app, r.service])).toEqual([
      ['account_state', true, false, true, false], ['record_activation_email', true, false, true, false],
    ]);
    for (const r of rows) expect(r.proconfig.join(','), r.proname).toMatch(/^search_path=pg_catalog, ?admin$/);
  });
});

describe('0029: notification_log kinds', () => {
  test('an invitation row has no user; every other kind, activation included, has one; unknown kinds are refused', async () => {
    await as(db, null);
    expect(await code(insertLog('invitation', null, 'skipped', 'Sending is off'))).toBe('ok');
    expect(await code(insertLog('activation', U.aReq))).toBe('ok');
    expect(await code(insertLog('invitation', U.aReq))).toBe('23514');
    expect(await code(insertLog('activation', null))).toBe('23514');
    expect(await code(insertLog('request_answered', null))).toBe('23514');
    expect(await code(insertLog('welcome', U.aReq))).toBe('23514');
    // The 0028 rules still hold: a sent row has no error, the log is append-only, switches know no account kinds.
    expect(await code(insertLog('activation', U.aReq, 'sent', 'oops'))).toBe('23514');
    expect(await code(db.query("UPDATE admin.notification_log SET status = 'failed', error = 'x' WHERE kind = 'activation'"))).toBe('42501');
    await as(db, U.aReq);
    expect(await code(db.query("SELECT admin.set_my_notification_pref('activation', false)"))).toBe('22023');
  });
});

describe('0029: account_state', () => {
  test('lab Owner and Admin read every active member once, with sign-in, two-step, password and the last sent activation email', async () => {
    await as(db, null);
    await db.query("UPDATE auth.users SET last_sign_in_at = '2026-11-01T10:00:00Z', encrypted_password = '$2a$10$x' WHERE id = $1", [U.aAdmin]);
    await db.query("UPDATE auth.users SET encrypted_password = '' WHERE id = $1", [U.aView]);
    await db.query("UPDATE auth.users SET encrypted_password = '$2a$10$y' WHERE id = $1", [U.operator]);
    await db.query("INSERT INTO auth.mfa_factors(user_id, status) VALUES ($1, 'verified'), ($2, 'unverified')", [U.owner, U.operator]);
    await insertLog('activation', U.aReq, 'sent', null, '2026-11-11T09:00:00Z');
    await insertLog('activation', U.aReq, 'sent', null, '2026-11-11T09:30:00Z');
    await insertLog('activation', U.aReq, 'failed', 'Resend answered 500', '2026-11-11T09:45:00Z'); // not sent: not counted
    await insertLog('activation', U.aView, 'skipped', 'Sending is off');
    // An archived membership is left out (the person in both clients keeps their other row).
    await db.query("UPDATE admin.client_member SET archived_at = now(), archived_reason = 'left' WHERE user_id = $1", [U.bReq]);
    for (const who of [U.owner, U.admin]) {
      await as(db, who);
      const rows = await state();
      expect(Object.keys(rows).sort(), who).toEqual([U.owner, U.admin, U.operator, U.member, U.aAdmin, U.aReq, U.aView, U.both].sort());
      expect(rows[U.owner]).toMatchObject({ email: 'owner@example.test', signed_in_at: null, two_step: true, has_password: false, activation_sent_at: null });
      expect(rows[U.operator]).toMatchObject({ two_step: false, has_password: true });
      expect(rows[U.aAdmin]).toMatchObject({ two_step: false, has_password: true });
      expect(rows[U.aAdmin].signed_in_at.toISOString()).toBe('2026-11-01T10:00:00.000Z');
      expect(rows[U.aReq].activation_sent_at.toISOString()).toBe('2026-11-11T09:30:00.000Z');
      expect(rows[U.aView]).toMatchObject({ has_password: false, activation_sent_at: null });
    }
  });

  test('an Operator, a lab Member, a client user and anon are refused', async () => {
    for (const who of [U.operator, U.member, U.aAdmin, U.bReq]) {
      await as(db, who);
      expect(await code(db.query('SELECT * FROM admin.account_state()')), who).toBe('42501');
    }
    await db.exec('RESET ROLE');
    await db.exec('SET ROLE anon');
    expect(await code(db.query('SELECT * FROM admin.account_state()'))).toBe('42501');
  });
});

describe('0029: record_activation_email', () => {
  const audit = () => db.query("SELECT actor, entity, entity_id, action, after FROM admin.audit_event WHERE entity = 'activation_email' ORDER BY id").then((r) => r.rows);

  test('a lab Owner or Admin writes one audit row naming the person (lab name, client member name, else email)', async () => {
    await as(db, null);
    await db.query("UPDATE admin.client_member SET display_name = 'Avery Viewer' WHERE user_id = $1", [U.aView]);
    await as(db, U.owner);
    await db.query('SELECT admin.record_activation_email($1)', [U.operator]);
    await as(db, U.admin);
    await db.query('SELECT admin.record_activation_email($1)', [U.aView]);
    await db.query('SELECT admin.record_activation_email($1)', [U.aReq]);
    await as(db, null);
    expect(await audit()).toEqual([
      { actor: U.owner, entity: 'activation_email', entity_id: U.operator, action: 'INSERT', after: { user_id: U.operator, name: 'operator' } },
      { actor: U.admin, entity: 'activation_email', entity_id: U.aView, action: 'INSERT', after: { user_id: U.aView, name: 'Avery Viewer' } },
      { actor: U.admin, entity: 'activation_email', entity_id: U.aReq, action: 'INSERT', after: { user_id: U.aReq, name: 'areq@example.test' } },
    ]);
  });

  test('anyone else is refused (42501), and a person without an active membership is P0002; nothing is written', async () => {
    for (const who of [U.operator, U.member, U.aAdmin]) {
      await as(db, who);
      expect(await code(db.query('SELECT admin.record_activation_email($1)', [U.aReq])), who).toBe('42501');
    }
    await as(db, null);
    await db.query('INSERT INTO auth.users(id, email) VALUES ($1, $2)', [id(950), 'nobody@example.test']);
    await as(db, U.owner);
    expect(await code(db.query('SELECT admin.record_activation_email($1)', [id(950)]))).toBe('P0002');
    await as(db, null);
    expect(await audit()).toEqual([]);
  });
});
