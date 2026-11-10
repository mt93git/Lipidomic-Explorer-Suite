// 0015: people, invitations and roles. Synthetic data only.
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { as, C, freshDb, id, U } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const sha = (text) => createHash('sha256').update(text).digest('hex');
// Supabase's API roles without a user: the anon key, and the service-role key the Admin app server holds.
async function asRole(role) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  await db.exec(`SET ROLE ${role}`);
}
const invite = (email, labRole, clientId = null, clientRole = null) =>
  db.query('SELECT admin.create_invitation($1, $2, $3, $4) AS token', [email, labRole, clientId, clientRole]).then(r => r.rows[0].token);
const preview = (token) => db.query('SELECT * FROM admin.invitation_preview($1)', [token]).then(r => r.rows);
const accept = (token, user) => db.query('SELECT admin.accept_invitation($1, $2)', [token, user]);
const acceptMine = (token) => db.query('SELECT admin.accept_my_invitation($1)', [token]);
const revoke = (invitation) => db.query('SELECT admin.revoke_invitation($1)', [invitation]);
const setLabRole = (user, role) => db.query('SELECT admin.set_lab_role($1, $2)', [user, role]);
const setMemberRole = (member, role) => db.query('SELECT admin.set_client_member_role($1, $2)', [member, role]);
const archiveMember = (kind, rowId, reason = 'Synthetic departure') => db.query('SELECT admin.archive_member($1, $2, $3)', [kind, rowId, reason]);
async function newUser(n, email) {
  await as(db, null);
  await db.query('INSERT INTO auth.users(id, email) VALUES ($1, $2)', [id(n), email]);
  return id(n);
}
async function invitationOf(token) {
  await as(db, null);
  return (await db.query('SELECT * FROM admin.invitation WHERE token_sha256 = $1', [sha(token)])).rows[0];
}
const labRow = async (user) => { await as(db, null); return (await db.query('SELECT * FROM admin.lab_staff WHERE user_id = $1', [user])).rows[0]; };
const memberRow = async (client, user) => { await as(db, null); return (await db.query('SELECT * FROM admin.client_member WHERE client_id = $1 AND user_id = $2', [client, user])).rows[0]; };

describe('0015: grants', () => {
  const contract = ['create_invitation', 'invitation_preview', 'accept_invitation', 'accept_my_invitation', 'revoke_invitation', 'set_lab_role', 'set_client_member_role', 'archive_member'];

  test('contract functions are SECURITY DEFINER with a pinned search_path; each role can execute exactly its own', async () => {
    const rows = (await db.query(`SELECT proname, prosecdef, proconfig, proacl::text AS acl,
        has_function_privilege('anon', oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', oid, 'EXECUTE') AS app,
        has_function_privilege('service_role', oid, 'EXECUTE') AS service
      FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname = ANY($1)`, [contract])).rows;
    expect(rows.map(r => r.proname).sort()).toEqual([...contract].sort());
    const access = {};
    for (const row of rows) {
      expect(row.prosecdef, row.proname).toBe(true);
      expect(row.proconfig.join(','), row.proname).toMatch(/^search_path=pg_catalog, ?admin$/);
      expect(row.acl, row.proname).not.toMatch(/(^|[{,])=X/); // nothing granted to PUBLIC
      access[row.proname] = [row.anon, row.app, row.service];
    }
    expect(access).toEqual({
      create_invitation: [false, true, false], invitation_preview: [true, true, false], accept_invitation: [false, false, true],
      accept_my_invitation: [false, true, false],
      revoke_invitation: [false, true, false], set_lab_role: [false, true, false], set_client_member_role: [false, true, false],
      archive_member: [false, true, false],
    });
  });

  test('anon can execute nothing in admin but invitation_preview and client_contact_text (0023) and reads no admin table', async () => {
    const fns = (await db.query("SELECT proname FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND has_function_privilege('anon', oid, 'EXECUTE')")).rows;
    expect(fns.map(r => r.proname).sort()).toEqual(['client_contact_text', 'invitation_preview']);
    const rels = (await db.query("SELECT relname FROM pg_class WHERE relnamespace = 'admin'::regnamespace AND relkind IN ('r', 'v', 'm', 'S') AND (has_table_privilege('anon', oid, 'SELECT') OR has_table_privilege('anon', oid, 'INSERT') OR has_table_privilege('anon', oid, 'UPDATE'))")).rows;
    expect(rels).toEqual([]);
  });

  test('anon and signed-in users cannot call accept_invitation; nobody writes invitations directly', async () => {
    await as(db, U.owner);
    const token = await invite('newperson@example.test', null, C.A, 'viewer');
    const user = await newUser(700, 'newperson@example.test');
    await asRole('anon');
    expect(await preview(token)).toHaveLength(1);
    await expect(accept(token, user)).rejects.toThrow(/permission denied/);
    for (const who of [U.owner, U.admin]) {
      await as(db, who);
      await expect(accept(token, user)).rejects.toThrow(/permission denied/);
      await expect(db.query("INSERT INTO admin.invitation(email, lab_role, token_sha256, expires_at) VALUES ('x@example.test', 'admin', $1, now() + interval '1 day')", ['d'.repeat(64)])).rejects.toThrow(/permission denied/);
      await expect(db.query("UPDATE admin.invitation SET revoked_at = now()")).rejects.toThrow(/permission denied/);
      await expect(db.query('SELECT token_sha256 FROM admin.invitation')).rejects.toThrow(/permission denied/);
    }
    expect((await invitationOf(token)).accepted_at).toBeNull();
  });
});

describe('0015: create_invitation', () => {
  test('the Owner invites lab staff: a 7-day link whose raw token is returned once and never stored, audited', async () => {
    await as(db, U.owner);
    const token = await invite('  New.Operator@Example.test ', 'operator');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const row = await invitationOf(token);
    expect(row).toMatchObject({ email: 'new.operator@example.test', lab_role: 'operator', client_id: null, client_role: null, created_by: U.owner, accepted_at: null, revoked_at: null });
    expect(row.token_sha256).toBe(sha(token));
    const days = (row.expires_at - row.created_at) / 86_400_000;
    expect(days).toBeCloseTo(7, 5);
    const audit = (await db.query("SELECT actor, action FROM admin.audit_event WHERE entity = 'invitation' AND entity_id = $1", [row.id])).rows;
    expect(audit).toEqual([{ actor: U.owner, action: 'INSERT' }]);
    // The raw token appears in no stored row: not in the invitation table, not in the audit log.
    const leaks = await db.query(`SELECT (SELECT count(*) FROM admin.invitation i WHERE to_jsonb(i)::text LIKE '%' || $1 || '%')::int
      + (SELECT count(*) FROM admin.audit_event a WHERE coalesce(a.after::text, '') || coalesce(a.before::text, '') LIKE '%' || $1 || '%')::int AS n`, [token]);
    expect(leaks.rows[0].n).toBe(0);
    await as(db, U.owner);
    expect(await invite('second.operator@example.test', 'operator')).not.toBe(token);
  });

  test('a lab Admin invites client members but not lab staff; Operators, lab members and client admins invite nobody', async () => {
    await as(db, U.admin);
    expect(await invite('client.person@example.test', null, C.A, 'requester')).toMatch(/^[0-9a-f]{64}$/);
    for (const role of ['owner', 'admin', 'operator', 'member']) {
      await expect(invite('lab.person@example.test', role)).rejects.toThrow(/Only the lab Owner/);
    }
    for (const user of [U.operator, U.member, U.aAdmin, U.aReq]) {
      await as(db, user);
      await expect(invite('client.other@example.test', null, C.A, 'viewer')).rejects.toThrow(/Owner or Admin/);
      await expect(invite('lab.other@example.test', 'operator')).rejects.toThrow(/Only the lab Owner|Owner or Admin/);
    }
    await as(db, null);
    expect(Number((await db.query("SELECT count(*) FROM admin.invitation WHERE email LIKE '%.other@example.test' OR email = 'lab.person@example.test'")).rows[0].count)).toBe(0);
  });

  test('refuses a bad target, a bad email, an archived client, a role already held and a duplicate pending link', async () => {
    await as(db, U.owner);
    await expect(invite('both@example.test', 'operator', C.A, 'viewer')).rejects.toThrow(/exactly one/);
    await expect(invite('none@example.test', null)).rejects.toThrow(/exactly one/);
    await expect(invite('half@example.test', null, C.A, null)).rejects.toThrow(/exactly one/);
    await expect(invite('half@example.test', null, null, 'viewer')).rejects.toThrow(/exactly one/);
    for (const email of ['', 'not-an-email', 'a@b', null]) await expect(invite(email, 'operator')).rejects.toThrow(/valid email/);
    await expect(invite('x@example.test', 'superuser')).rejects.toThrow(/valid lab role/);
    await expect(invite('x@example.test', null, C.A, 'owner')).rejects.toThrow(/valid client role/);
    await expect(invite('x@example.test', null, id(999), 'viewer')).rejects.toThrow(/Client not found/);
    // Seeded users carry <key>@example.test: operator is lab staff, aview is a viewer of client A.
    await expect(invite('OPERATOR@example.test', 'admin')).rejects.toThrow(/already holds a lab role/);
    await expect(invite('aview@example.test', null, C.A, 'requester')).rejects.toThrow(/already a member/);
    expect(await invite('aview@example.test', null, C.B, 'viewer')).toMatch(/^[0-9a-f]{64}$/); // another client is fine
    await expect(invite('aview@example.test', null, C.B, 'requester')).rejects.toThrow(/pending invitation/);
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET archived_at = now(), archived_reason = 'Synthetic' WHERE client_id = $1", [C.B]);
    await db.query("UPDATE admin.client SET archived_at = now(), archived_reason = 'Synthetic' WHERE id = $1", [C.B]);
    await as(db, U.owner);
    await expect(invite('late@example.test', null, C.B, 'viewer')).rejects.toThrow(/archived/);
  });
});

describe('0015: preview and accept', () => {
  test('preview shows a valid link only; accept adds the membership once and marks the link used', async () => {
    await as(db, U.owner);
    const clientToken = await invite('new.viewer@example.test', null, C.A, 'viewer');
    const labToken = await invite('new.operator@example.test', 'operator');
    await asRole('anon');
    expect(await preview(clientToken)).toEqual([{ email: 'new.viewer@example.test', target: 'Viewer at Synthetic Lab Alpha', expires_at: expect.any(Date), has_account: false }]);
    expect((await preview(labToken))[0].target).toBe('Lab Operator');
    expect(await preview('0'.repeat(64))).toEqual([]);
    expect(await preview(null)).toEqual([]);

    const viewer = await newUser(701, 'New.Viewer@example.test');
    const operator = await newUser(702, 'new.operator@example.test');
    await asRole('service_role');
    await accept(clientToken, viewer);
    await accept(labToken, operator);
    expect(await memberRow(C.A, viewer)).toMatchObject({ role: 'viewer', archived_at: null });
    expect(await labRow(operator)).toMatchObject({ role: 'operator', archived_at: null });
    const used = await invitationOf(clientToken);
    expect(used).toMatchObject({ accepted_by: viewer, accepted_at: expect.any(Date) });
    expect((await db.query("SELECT action FROM admin.audit_event WHERE entity = 'invitation' AND entity_id = $1 ORDER BY id", [used.id])).rows.map(r => r.action)).toEqual(['INSERT', 'UPDATE']);
    // The membership is inserted, then named from the invitation (0023): two audited writes.
    expect((await db.query("SELECT action, after->>'display_name' AS name FROM admin.audit_event WHERE entity = 'client_member' AND after->>'user_id' = $1 ORDER BY id", [viewer])).rows)
      .toEqual([{ action: 'INSERT', name: null }, { action: 'UPDATE', name: 'new.viewer@example.test' }]);

    await asRole('service_role');
    await expect(accept(clientToken, viewer)).rejects.toThrow(/already used/);
    await asRole('anon');
    expect(await preview(clientToken)).toEqual([]);
  });

  test('accept refuses an unknown, expired or revoked link and a user whose email differs', async () => {
    await as(db, U.owner);
    const expired = await invite('expired@example.test', null, C.A, 'viewer');
    const revoked = await invite('revoked@example.test', null, C.A, 'viewer');
    const other = await invite('right@example.test', null, C.A, 'viewer');
    const revokedId = (await invitationOf(revoked)).id;
    await as(db, U.owner);
    await revoke(revokedId);
    await as(db, null);
    await db.query("UPDATE admin.invitation SET expires_at = now() - interval '1 second' WHERE token_sha256 = $1", [sha(expired)]);
    const users = { expired: await newUser(710, 'expired@example.test'), revoked: await newUser(711, 'revoked@example.test'), wrong: await newUser(712, 'wrong@example.test') };
    await asRole('anon');
    expect(await preview(expired)).toEqual([]);
    expect(await preview(revoked)).toEqual([]);
    await asRole('service_role');
    await expect(accept('f'.repeat(64), users.wrong)).rejects.toThrow(/not valid/);
    await expect(accept(expired, users.expired)).rejects.toThrow(/expired/);
    await expect(accept(revoked, users.revoked)).rejects.toThrow(/revoked/);
    await expect(accept(other, users.wrong)).rejects.toThrow(/different email/);
    await expect(accept(other, id(799))).rejects.toThrow(/User not found/);
    await as(db, null);
    expect(Number((await db.query('SELECT count(*) FROM admin.client_member WHERE user_id = ANY($1)', [Object.values(users)])).rows[0].count)).toBe(0);
    expect((await invitationOf(other)).accepted_at).toBeNull();
  });

  test('a person who left comes back on the same row; an archived client cannot be joined', async () => {
    await as(db, null);
    const leaver = await labRow(U.operator);
    await db.query("UPDATE admin.lab_staff SET archived_at = now(), archived_reason = 'Synthetic leave' WHERE id = $1", [leaver.id]);
    await as(db, U.owner);
    const back = await invite('operator@example.test', 'admin');
    const late = await invite('late.member@example.test', null, C.B, 'viewer');
    const lateUser = await newUser(720, 'late.member@example.test');
    await db.query("UPDATE admin.\"order\" SET archived_at = now(), archived_reason = 'Synthetic' WHERE client_id = $1", [C.B]);
    await db.query("UPDATE admin.client SET archived_at = now(), archived_reason = 'Synthetic' WHERE id = $1", [C.B]);
    await asRole('service_role');
    await accept(back, U.operator);
    expect(await labRow(U.operator)).toMatchObject({ id: leaver.id, role: 'admin', archived_at: null, archived_reason: null });
    await asRole('service_role');
    await expect(accept(late, lateUser)).rejects.toThrow(/archived/);
  });
});

describe('0015: revoke_invitation', () => {
  test('same people as create; a used or revoked link cannot be revoked again', async () => {
    await as(db, U.owner);
    const lab = await invite('lab.revoke@example.test', 'operator');
    const client = await invite('client.revoke@example.test', null, C.A, 'viewer');
    const used = await invite('client.used@example.test', null, C.A, 'viewer');
    const [labId, clientId, usedId] = [(await invitationOf(lab)).id, (await invitationOf(client)).id, (await invitationOf(used)).id];
    const usedUser = await newUser(730, 'client.used@example.test');
    await asRole('service_role');
    await accept(used, usedUser);

    await as(db, U.admin);
    await expect(revoke(labId)).rejects.toThrow(/Only the lab Owner/);
    for (const user of [U.operator, U.aAdmin]) {
      await as(db, user);
      await expect(revoke(clientId)).rejects.toThrow(/Owner or Admin/);
    }
    await as(db, U.admin);
    await revoke(clientId);
    await expect(revoke(clientId)).rejects.toThrow(/already revoked/);
    await expect(revoke(usedId)).rejects.toThrow(/already used/);
    await expect(revoke(id(999))).rejects.toThrow(/not found/);
    await as(db, U.owner);
    await revoke(labId);
    await as(db, null);
    expect((await db.query('SELECT revoked_by FROM admin.invitation WHERE id = ANY($1) ORDER BY email', [[labId, clientId]])).rows).toEqual([{ revoked_by: U.admin }, { revoked_by: U.owner }]);
  });
});

describe('0015: memberships', () => {
  test('set_lab_role: Owner only; the last active Owner cannot be demoted', async () => {
    for (const user of [U.admin, U.operator, U.aAdmin]) {
      await as(db, user);
      await expect(setLabRole(U.operator, 'admin')).rejects.toThrow(/Only the lab Owner/);
    }
    await as(db, U.owner);
    await expect(setLabRole(U.operator, 'boss')).rejects.toThrow(/valid lab role/);
    await expect(setLabRole(U.aView, 'operator')).rejects.toThrow(/not active lab staff/);
    await expect(setLabRole(U.owner, 'admin')).rejects.toThrow(/at least one active Owner/);
    await setLabRole(U.operator, 'admin');
    expect((await labRow(U.operator)).role).toBe('admin');
    await as(db, U.owner);
    await setLabRole(U.admin, 'owner');
    await setLabRole(U.owner, 'operator'); // another Owner exists now
    expect((await labRow(U.owner)).role).toBe('operator');
    await as(db, U.admin);
    await expect(setLabRole(U.admin, 'member')).rejects.toThrow(/at least one active Owner/);
    await as(db, null);
    expect((await db.query("SELECT actor FROM admin.audit_event WHERE entity = 'lab_staff' AND action = 'UPDATE' ORDER BY id")).rows.map(r => r.actor)).toEqual([U.owner, U.owner, U.owner]);
  });

  test('set_client_member_role: lab Owner or Admin only', async () => {
    const member = (await memberRow(C.A, U.aView)).id;
    for (const user of [U.operator, U.member, U.aAdmin]) {
      await as(db, user);
      await expect(setMemberRole(member, 'requester')).rejects.toThrow(/Owner or Admin/);
    }
    await as(db, U.admin);
    await expect(setMemberRole(member, 'owner')).rejects.toThrow(/valid client role/);
    await expect(setMemberRole(id(999), 'viewer')).rejects.toThrow(/not active/);
    await setMemberRole(member, 'requester');
    expect((await memberRow(C.A, U.aView)).role).toBe('requester');
  });

  test('archive_member: lab staff by the Owner only and never the last Owner; client members by Owner/Admin; nothing is deleted', async () => {
    const operator = (await labRow(U.operator)).id;
    const owner = (await labRow(U.owner)).id;
    const member = (await memberRow(C.A, U.aView)).id;
    await as(db, U.admin);
    await expect(archiveMember('lab_staff', operator)).rejects.toThrow(/Only the lab Owner/);
    await as(db, U.aAdmin);
    await expect(archiveMember('client_member', member)).rejects.toThrow(/Owner or Admin/);
    await as(db, U.owner);
    await expect(archiveMember('person', operator)).rejects.toThrow(/lab_staff or client_member/);
    await expect(archiveMember('lab_staff', operator, '  ')).rejects.toThrow(/needs a reason/);
    await expect(archiveMember('lab_staff', owner)).rejects.toThrow(/at least one active Owner/);
    await archiveMember('lab_staff', operator, '  Synthetic departure  ');
    await expect(archiveMember('lab_staff', operator)).rejects.toThrow(/not active lab staff/);
    await as(db, U.admin);
    await archiveMember('client_member', member);
    await expect(archiveMember('client_member', member)).rejects.toThrow(/not active/);
    expect(await labRow(U.operator)).toMatchObject({ id: operator, archived_reason: 'Synthetic departure', archived_at: expect.any(Date) });
    expect(await memberRow(C.A, U.aView)).toMatchObject({ id: member, archived_reason: 'Synthetic departure' });
  });
});

// Security review (2026-11-10), finding 1: memberships change only through the functions above, and the lab never
// ends up without an active Owner, whatever the path.
describe('0015: no direct membership writes; always an active Owner', () => {
  test('signed-in users have no INSERT or UPDATE on lab_staff and client_member, and no write policy is left', async () => {
    const grants = (await db.query(`SELECT t, p FROM unnest(ARRAY['lab_staff', 'client_member']) t, unnest(ARRAY['INSERT', 'UPDATE']) p
      WHERE has_table_privilege('authenticated', 'admin.' || t, p)`)).rows;
    expect(grants).toEqual([]);
    const policies = (await db.query("SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'admin' AND tablename IN ('lab_staff', 'client_member') ORDER BY 1, 2")).rows;
    expect(policies).toEqual([{ tablename: 'client_member', policyname: 'client_member_read', cmd: 'SELECT' }, { tablename: 'lab_staff', policyname: 'lab_staff_read', cmd: 'SELECT' }]);
  });

  test('an Admin cannot promote an Operator (or anyone) with a direct write', async () => {
    await as(db, U.admin);
    await expect(db.query("UPDATE admin.lab_staff SET role = 'admin' WHERE user_id = $1", [U.operator])).rejects.toThrow(/permission denied/);
    await expect(db.query("UPDATE admin.lab_staff SET role = 'owner' WHERE user_id = $1", [U.admin])).rejects.toThrow(/permission denied/);
    await expect(db.query("INSERT INTO admin.lab_staff(user_id, role) VALUES ($1, 'admin')", [U.aView])).rejects.toThrow(/permission denied/);
    await as(db, U.owner);
    await expect(db.query("UPDATE admin.lab_staff SET archived_at = now(), archived_reason = 'x' WHERE user_id = $1", [U.operator])).rejects.toThrow(/permission denied/);
    expect(await labRow(U.operator)).toMatchObject({ role: 'operator', archived_at: null });
  });

  test('a client admin cannot promote or add members of their client with a direct write', async () => {
    await as(db, U.aAdmin);
    await expect(db.query("UPDATE admin.client_member SET role = 'client_admin' WHERE client_id = $1 AND user_id = $2", [C.A, U.aView])).rejects.toThrow(/permission denied/);
    await expect(db.query("INSERT INTO admin.client_member(client_id, user_id, role) VALUES ($1, $2, 'client_admin')", [C.A, U.bReq])).rejects.toThrow(/permission denied/);
    await as(db, U.admin);
    await expect(db.query("UPDATE admin.client_member SET role = 'client_admin' WHERE user_id = $1", [U.aView])).rejects.toThrow(/permission denied/);
    expect(await memberRow(C.A, U.aView)).toMatchObject({ role: 'viewer' });
    expect(await memberRow(C.A, U.bReq)).toBeUndefined();
  });

  test('no path can archive or demote the last active Owner, not even the migration owner; a second Owner unlocks it', async () => {
    await as(db, null);
    await expect(db.query("UPDATE admin.lab_staff SET archived_at = now(), archived_reason = 'Synthetic' WHERE user_id = $1", [U.owner])).rejects.toThrow(/at least one active Owner/);
    await expect(db.query("UPDATE admin.lab_staff SET role = 'admin' WHERE user_id = $1", [U.owner])).rejects.toThrow(/at least one active Owner/);
    await db.query("UPDATE admin.lab_staff SET role = 'owner' WHERE user_id = $1", [U.admin]);
    // One statement that demotes both Owners at once is refused too.
    await expect(db.query("UPDATE admin.lab_staff SET role = 'operator' WHERE role = 'owner'")).rejects.toThrow(/at least one active Owner/);
    await db.query("UPDATE admin.lab_staff SET archived_at = now(), archived_reason = 'Synthetic' WHERE user_id = $1", [U.owner]);
    expect(Number((await db.query("SELECT count(*) FROM admin.lab_staff WHERE role = 'owner' AND archived_at IS NULL")).rows[0].count)).toBe(1);
    // Rows that are not an active Owner move freely.
    await db.query("UPDATE admin.lab_staff SET role = 'admin' WHERE user_id = $1", [U.operator]);
  });
});

// Finding 3: the token digest never reaches the audit log, which Operators read.
describe('0015: the audit log holds no token digest', () => {
  test('create, accept and revoke leave no token_sha256 key or value in admin.audit_event', async () => {
    await as(db, U.owner);
    const used = await invite('digest.used@example.test', null, C.A, 'viewer');
    const revoked = await invite('digest.revoked@example.test', 'operator');
    const user = await newUser(740, 'digest.used@example.test');
    await asRole('service_role');
    await accept(used, user);
    const revokedId = (await invitationOf(revoked)).id;
    await as(db, U.owner);
    await revoke(revokedId);
    await as(db, null);
    const rows = (await db.query("SELECT before, after FROM admin.audit_event WHERE entity = 'invitation'")).rows;
    expect(rows.length).toBe(5); // the seeded invitation, two creates, one accept, one revoke
    for (const row of rows) {
      expect(row.after).not.toHaveProperty('token_sha256');
      if (row.before) expect(row.before).not.toHaveProperty('token_sha256');
      expect(row.after).toHaveProperty('email');
    }
    const digests = [sha(used), sha(revoked), 'c'.repeat(64)];
    const leaks = await db.query("SELECT count(*)::int AS n FROM admin.audit_event a, unnest($1::text[]) d WHERE coalesce(a.after::text, '') || coalesce(a.before::text, '') LIKE '%' || d || '%'", [digests]);
    expect(leaks.rows[0].n).toBe(0);
  });
});

// Finding 4: a person who already has an account accepts while signed in, without touching the password.
describe('0015: accept_my_invitation', () => {
  test('preview says whether the invited email already has an account', async () => {
    await as(db, U.owner);
    const known = await invite('aview@example.test', null, C.B, 'viewer');
    const fresh = await invite('nobody.yet@example.test', null, C.B, 'viewer');
    await asRole('anon');
    expect((await preview(known))[0].has_account).toBe(true);
    expect((await preview(fresh))[0].has_account).toBe(false);
  });

  test('the signed-in person whose email matches gets the role; the link is used', async () => {
    await as(db, U.owner);
    const client = await invite('AVIEW@example.test', null, C.B, 'requester');
    const lab = await invite('breq@example.test', 'member');
    await as(db, U.aView);
    await acceptMine(client);
    await as(db, U.bReq);
    await acceptMine(lab);
    expect(await memberRow(C.B, U.aView)).toMatchObject({ role: 'requester', archived_at: null });
    expect(await labRow(U.bReq)).toMatchObject({ role: 'member', archived_at: null });
    expect(await invitationOf(client)).toMatchObject({ accepted_by: U.aView, accepted_at: expect.any(Date) });
    await as(db, U.aView);
    await expect(acceptMine(client)).rejects.toThrow(/already used/);
  });

  test('refuses another signed-in person, a role already held, anon and a revoked link', async () => {
    await as(db, U.owner);
    const token = await invite('aview@example.test', null, C.B, 'viewer');
    const late = await invite('areq@example.test', null, C.B, 'viewer');
    for (const other of [U.aReq, U.owner]) {
      await as(db, other);
      await expect(acceptMine(token)).rejects.toThrow(/different email/);
    }
    await asRole('anon');
    await expect(acceptMine(token)).rejects.toThrow(/permission denied/);
    // The person got the role some other way after the link was made.
    await as(db, null);
    await db.query("INSERT INTO admin.client_member(client_id, user_id, role) VALUES ($1, $2, 'requester')", [C.B, U.aReq]);
    await as(db, U.aReq);
    await expect(acceptMine(late)).rejects.toThrow(/already a member/);
    const tokenId = (await invitationOf(token)).id;
    await as(db, U.owner);
    await revoke(tokenId);
    await as(db, U.aView);
    await expect(acceptMine(token)).rejects.toThrow(/revoked/);
    expect(await memberRow(C.B, U.aView)).toBeUndefined();
  });
});
