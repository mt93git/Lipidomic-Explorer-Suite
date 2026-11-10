// Access requests (0020_access_requests.sql): submit_access_request (service_role), list/count, approve and decline
// (lab Owner or Admin), and the 90-day erase of declined requests. Synthetic data only.
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { as, C, count, freshDb, id, U } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const SEEDED = id(700); // pending: Robin Example, robin@larch.example.test, Example Larch
const sha = (text) => createHash('sha256').update(text).digest('hex');
async function asRole(role) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  await db.exec(`SET ROLE ${role}`);
}
const submit = (name = 'Kai Sample', email = 'kai@cedar.example.test', org = 'Example Cedar', kind = 'pi_lab', message = 'Postdoc in the group') =>
  db.query('SELECT admin.submit_access_request($1, $2, $3, $4, $5) AS ref', [name, email, org, kind, message]).then((r) => r.rows[0].ref);
const list = () => db.query('SELECT * FROM admin.list_access_requests()').then((r) => r.rows);
const pendingCount = () => db.query('SELECT admin.pending_access_request_count() AS n').then((r) => r.rows[0].n);
const approve = (rid, { client = null, newName = null, newKind = null, role = 'client_admin' } = {}) =>
  db.query('SELECT admin.approve_access_request($1, $2, $3, $4, $5) AS token', [rid, client, newName, newKind, role]).then((r) => r.rows[0].token);
const decline = (rid, reason = 'Synthetic: not a service we offer') => db.query('SELECT admin.decline_access_request($1, $2)', [rid, reason]);
const row = async (rid) => { await as(db, null); return (await db.query('SELECT * FROM admin.access_request WHERE id = $1', [rid])).rows[0]; };
const code = (c) => expect.objectContaining({ code: c });

describe('0020: grants and table access', () => {
  const contract = ['submit_access_request', 'list_access_requests', 'pending_access_request_count', 'approve_access_request', 'decline_access_request'];

  test('contract functions are SECURITY DEFINER with a pinned search_path; only service_role submits, only signed-in users answer', async () => {
    const rows = (await db.query(`SELECT proname, prosecdef, proconfig, proacl::text AS acl,
        has_function_privilege('anon', oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', oid, 'EXECUTE') AS app,
        has_function_privilege('service_role', oid, 'EXECUTE') AS service
      FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname = ANY($1)`, [contract])).rows;
    expect(rows.map((r) => r.proname).sort()).toEqual([...contract].sort());
    const access = {};
    for (const r of rows) {
      expect(r.prosecdef, r.proname).toBe(true);
      expect(r.proconfig.join(','), r.proname).toMatch(/^search_path=pg_catalog, ?admin$/);
      expect(r.acl, r.proname).not.toMatch(/(^|[{,])=X/);
      access[r.proname] = [r.anon, r.app, r.service];
    }
    expect(access).toEqual({
      submit_access_request: [false, false, true], list_access_requests: [false, true, false], pending_access_request_count: [false, true, false],
      approve_access_request: [false, true, false], decline_access_request: [false, true, false],
    });
    const helpers = (await db.query(`SELECT proname FROM pg_proc WHERE pronamespace = 'admin'::regnamespace
      AND proname IN ('erase_expired_access_requests', 'lock_pending_access_request', 'require_access_manager', 'access_request_reference', 'record_access_request_audit')
      AND (has_function_privilege('anon', oid, 'EXECUTE') OR has_function_privilege('authenticated', oid, 'EXECUTE') OR has_function_privilege('service_role', oid, 'EXECUTE'))`)).rows;
    expect(helpers).toEqual([]);
  });

  test('nobody reads or writes the table directly: anon, service_role, lab Owner, client admin', async () => {
    for (const who of ['anon', 'service_role', U.owner, U.aAdmin]) {
      if (who === 'anon' || who === 'service_role') await asRole(who); else await as(db, who);
      await expect(db.query('SELECT * FROM admin.access_request'), String(who)).rejects.toThrow(/permission denied/);
      await expect(db.query("INSERT INTO admin.access_request(full_name, email, organisation, kind) VALUES ('X', 'x@example.test', 'X', 'company')"), String(who)).rejects.toThrow(/permission denied/);
      await expect(db.query("UPDATE admin.access_request SET status = 'declined'"), String(who)).rejects.toThrow(/permission denied/);
    }
  });

  test('anon cannot submit, list or answer', async () => {
    await asRole('anon');
    await expect(submit()).rejects.toThrow(/permission denied/);
    await expect(list()).rejects.toThrow(/permission denied/);
    await expect(approve(SEEDED, { client: C.A })).rejects.toThrow(/permission denied/);
    await expect(decline(SEEDED)).rejects.toThrow(/permission denied/);
  });
});

describe('admin.submit_access_request', () => {
  test('service_role submits: a pending row, cleaned input, a reference; audited without the personal data', async () => {
    await asRole('service_role');
    const ref = await submit('  Kai Sample ', ' Kai@Cedar.Example.Test ', ' Example Cedar ', 'pi_lab', '  ');
    expect(ref).toMatch(/^AR-\d{4,}$/);
    await as(db, null);
    const r = (await db.query("SELECT * FROM admin.access_request WHERE email = 'kai@cedar.example.test'")).rows[0];
    expect(r).toMatchObject({ status: 'pending', full_name: 'Kai Sample', organisation: 'Example Cedar', kind: 'pi_lab', message: null, decided_at: null, client_id: null });
    expect(ref).toBe(`AR-${String(r.number).padStart(4, '0')}`);
    const ev = (await db.query("SELECT actor, after::text AS after FROM admin.audit_event WHERE entity = 'access_request' AND entity_id = $1", [r.id])).rows;
    expect(ev).toHaveLength(1);
    expect(ev[0].actor).toBeNull();
    expect(ev[0].after).not.toMatch(/Kai|cedar|Postdoc/i);
  });

  test('signed-in users (lab or client) cannot call it: the app server holds the only key that can', async () => {
    for (const u of [U.owner, U.admin, U.aAdmin]) {
      await as(db, u);
      await expect(submit(), u).rejects.toThrow(/permission denied/);
    }
  });

  test('refuses missing or malformed fields', async () => {
    await asRole('service_role');
    await expect(submit(' ')).rejects.toEqual(code('22023'));
    await expect(submit('Kai', 'not-an-email')).rejects.toEqual(code('22023'));
    await expect(submit('Kai', 'kai@example.test', '')).rejects.toEqual(code('22023'));
    await expect(submit('Kai', 'kai@example.test', 'Org', 'hospital')).rejects.toEqual(code('22023'));
    await expect(submit('Kai', 'kai@example.test', 'Org', 'company', 'x'.repeat(2001))).rejects.toEqual(code('22023'));
    await expect(submit('x'.repeat(201))).rejects.toEqual(code('22023'));
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.access_request')).toBe(1);
  });

  test('one pending request per email (any case): a second is PT409; after an answer the person may ask again', async () => {
    await asRole('service_role');
    await expect(submit('Robin Again', 'ROBIN@larch.example.test')).rejects.toEqual(code('PT409'));
    await as(db, U.admin);
    await decline(SEEDED, 'Synthetic: please ask through your PI');
    await asRole('service_role');
    expect(await submit('Robin Again', 'robin@larch.example.test')).toMatch(/^AR-/);
  });

  test('an email that already has an account gets the same answer as any other', async () => {
    await asRole('service_role');
    expect(await submit('Requester A', 'areq@example.test', 'Synthetic Lab Alpha', 'pi_lab', 'second client')).toMatch(/^AR-/);
    expect(await submit('Nobody', 'nobody@example.test', 'Nowhere', 'company', null)).toMatch(/^AR-/);
  });

  test('the queue is capped at 200 pending requests (54000)', async () => {
    await as(db, null);
    await db.query("INSERT INTO admin.access_request(full_name, email, organisation, kind) SELECT 'Bulk', 'bulk' || g || '@example.test', 'Bulk', 'company' FROM generate_series(1, 199) g");
    await asRole('service_role');
    await expect(submit()).rejects.toEqual(code('54000'));
    await as(db, U.admin);
    await decline(SEEDED);
    await asRole('service_role');
    expect(await submit()).toMatch(/^AR-/);
  });
});

describe('list and count (Owner, Admin)', () => {
  test('Owner and Admin list every request with its reference and a matching client', async () => {
    await asRole('service_role');
    await submit('Ana Alpha', 'ana@alpha.example.test', 'synthetic lab alpha', 'pi_lab', null);
    for (const u of [U.owner, U.admin]) {
      await as(db, u);
      const rows = await list();
      expect(rows.map((r) => r.full_name)).toEqual(['Ana Alpha', 'Robin Example']);
      expect(rows[0]).toMatchObject({ status: 'pending', email: 'ana@alpha.example.test', matching_client_id: C.A });
      expect(rows[1]).toMatchObject({ matching_client_id: null, kind: 'company' });
      expect(rows[1].reference).toMatch(/^AR-\d{4}$/);
      expect(await pendingCount()).toBe(2);
    }
  });

  test('Operator, lab member and client roles are refused (42501)', async () => {
    for (const u of [U.operator, U.member, U.aAdmin, U.aReq, U.aView]) {
      await as(db, u);
      await expect(list(), u).rejects.toEqual(code('42501'));
      await expect(pendingCount(), u).rejects.toEqual(code('42501'));
    }
  });
});

describe('admin.approve_access_request', () => {
  test('into a new client with the chosen role: client, invitation and request in one step; the token works once', async () => {
    await as(db, U.admin);
    const token = await approve(SEEDED, { newName: ' Example Larch ', newKind: 'company', role: 'viewer' });
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const r = await row(SEEDED);
    expect(r).toMatchObject({ status: 'approved', decided_by: U.admin, decline_reason: null });
    const client = (await db.query('SELECT name, kind FROM admin.client WHERE id = $1', [r.client_id])).rows[0];
    expect(client).toEqual({ name: 'Example Larch', kind: 'company' });
    const inv = (await db.query('SELECT * FROM admin.invitation WHERE id = $1', [r.invitation_id])).rows[0];
    expect(inv).toMatchObject({ email: 'robin@larch.example.test', client_id: r.client_id, client_role: 'viewer', created_by: U.admin, lab_role: null, token_sha256: sha(token) });
    expect(Date.parse(inv.expires_at) - Date.now()).toBeGreaterThan(6.9 * 86400e3);
    await asRole('anon');
    expect((await db.query('SELECT target FROM admin.invitation_preview($1)', [token])).rows).toEqual([{ target: 'Viewer at Example Larch' }]);
    await as(db, null);
    const audited = (await db.query("SELECT entity FROM admin.audit_event WHERE actor = $1 AND entity IN ('client', 'invitation', 'access_request') AND action IN ('INSERT', 'UPDATE') ORDER BY id", [U.admin])).rows.map((e) => e.entity);
    expect(audited).toEqual(['client', 'invitation', 'access_request']);
  });

  test('the new client takes the request\'s type when no kind is given', async () => {
    await as(db, U.owner);
    await approve(SEEDED, { newName: 'Example Larch' });
    const r = await row(SEEDED);
    expect((await db.query('SELECT kind FROM admin.client WHERE id = $1', [r.client_id])).rows[0].kind).toBe('company');
  });

  test('into an existing client as Requester', async () => {
    await as(db, U.owner);
    const token = await approve(SEEDED, { client: C.B, role: 'requester' });
    const r = await row(SEEDED);
    expect(r).toMatchObject({ status: 'approved', client_id: C.B, decided_by: U.owner });
    expect((await db.query('SELECT client_role FROM admin.invitation WHERE token_sha256 = $1', [sha(token)])).rows[0].client_role).toBe('requester');
  });

  test('Operator, lab member and client roles are refused; nothing changes', async () => {
    for (const u of [U.operator, U.member, U.aAdmin, U.aReq, U.bReq]) {
      await as(db, u);
      await expect(approve(SEEDED, { client: C.A }), u).rejects.toEqual(code('42501'));
      await expect(approve(SEEDED, { newName: 'Example Larch' }), u).rejects.toEqual(code('42501'));
    }
    expect(await row(SEEDED)).toMatchObject({ status: 'pending', client_id: null });
    expect(await count(db, "SELECT 1 FROM admin.client WHERE name = 'Example Larch'")).toBe(0);
  });

  test('answering twice is a conflict (PT409): approve then approve, approve then decline', async () => {
    await as(db, U.admin);
    await approve(SEEDED, { client: C.A });
    await expect(approve(SEEDED, { client: C.B })).rejects.toEqual(code('PT409'));
    await expect(decline(SEEDED)).rejects.toEqual(code('PT409'));
    expect(await count(db, 'SELECT 1 FROM admin.invitation WHERE email = $1', ['robin@larch.example.test'])).toBe(1);
  });

  test('exactly one target, a valid role, an unknown request', async () => {
    await as(db, U.admin);
    await expect(approve(SEEDED)).rejects.toEqual(code('22023'));
    await expect(approve(SEEDED, { client: C.A, newName: 'Example Larch' })).rejects.toEqual(code('22023'));
    await expect(approve(SEEDED, { client: C.A, role: 'owner' })).rejects.toEqual(code('22023'));
    await expect(approve(id(799), { client: C.A })).rejects.toEqual(code('P0002'));
  });

  test('a refused step leaves nothing behind: a taken client name, or an email already in that client', async () => {
    await as(db, U.admin);
    await expect(approve(SEEDED, { newName: 'Synthetic Lab Alpha', newKind: 'pi_lab' })).rejects.toEqual(code('23505'));
    expect(await row(SEEDED)).toMatchObject({ status: 'pending' });
    await asRole('service_role');
    const ref = await submit('Requester A', 'areq@example.test', 'Synthetic Lab Alpha', 'pi_lab', null);
    await as(db, null);
    const rid = (await db.query("SELECT id FROM admin.access_request WHERE email = 'areq@example.test'")).rows[0].id;
    expect(ref).toMatch(/^AR-/);
    await as(db, U.admin);
    await expect(approve(rid, { client: C.A, role: 'requester' })).rejects.toThrow(/already a member/);
    expect(await row(rid)).toMatchObject({ status: 'pending' });
    // The same person may join another client.
    await as(db, U.admin);
    await approve(rid, { client: C.B, role: 'viewer' });
    expect(await row(rid)).toMatchObject({ status: 'approved', client_id: C.B });
  });

  test('an archived client is refused', async () => {
    await as(db, null);
    await db.query("UPDATE admin.client SET archived_at = now(), archived_reason = 'synthetic' WHERE id = $1", [C.B]);
    await as(db, U.admin);
    await expect(approve(SEEDED, { client: C.B })).rejects.toEqual(code('55000'));
  });
});

describe('admin.decline_access_request', () => {
  test('Owner or Admin declines with an internal reason; the row is kept, audited without the reason', async () => {
    await as(db, U.owner);
    await decline(SEEDED, '  Synthetic: we do not run this panel  ');
    const r = await row(SEEDED);
    expect(r).toMatchObject({ status: 'declined', decline_reason: 'Synthetic: we do not run this panel', decided_by: U.owner, client_id: null, invitation_id: null, erased_at: null });
    const after = (await db.query("SELECT after::text AS a FROM admin.audit_event WHERE entity = 'access_request' AND entity_id = $1 AND action = 'UPDATE'", [SEEDED])).rows;
    expect(after).toHaveLength(1);
    expect(after[0].a).toMatch(/"status": "declined"/);
    expect(after[0].a).not.toMatch(/panel|Robin|larch/i);
  });

  test('a reason is required; Operator and client roles are refused; twice is PT409', async () => {
    await as(db, U.admin);
    await expect(decline(SEEDED, '  ')).rejects.toEqual(code('22023'));
    for (const u of [U.operator, U.member, U.aAdmin, U.aReq]) {
      await as(db, u);
      await expect(decline(SEEDED), u).rejects.toEqual(code('42501'));
    }
    await as(db, U.admin);
    await decline(SEEDED);
    await expect(decline(SEEDED)).rejects.toEqual(code('PT409'));
    await expect(approve(SEEDED, { client: C.A })).rejects.toEqual(code('PT409'));
  });
});

describe('90-day erase of declined requests (no scheduler)', () => {
  // Back-dated rows as the migration owner: declined 91 days ago (due), declined 89 days ago (not yet), and an
  // approved one 200 days old (never erased).
  async function backdated() {
    await as(db, null);
    await db.query(`INSERT INTO admin.access_request(id, created_at, full_name, email, organisation, kind, message, status, decided_at, decided_by, decline_reason) VALUES
      ($1, now() - interval '100 days', 'Old Declined', 'old@example.test', 'Old Org', 'company', 'old message', 'declined', now() - interval '91 days', $3, 'old reason'),
      ($2, now() - interval '95 days', 'Recent Declined', 'recent@example.test', 'Recent Org', 'pi_lab', NULL, 'declined', now() - interval '89 days', $3, 'recent reason')`,
    [id(710), id(711), U.admin]);
    await db.query("UPDATE admin.access_request SET created_at = now() - interval '210 days' WHERE id = $1", [SEEDED]);
  }
  async function expectErased() {
    const old = await row(id(710));
    expect(old).toMatchObject({ status: 'declined', full_name: null, email: null, organisation: null, message: null, decline_reason: null, kind: 'company', decided_by: U.admin });
    expect(old.erased_at).not.toBeNull();
    expect(old.created_at).not.toBeNull();
    expect(old.decided_at).not.toBeNull();
    expect(await row(id(711))).toMatchObject({ full_name: 'Recent Declined', decline_reason: 'recent reason', erased_at: null });
    // Personal data appears nowhere in the audit log either.
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE after::text ~* 'old@example|Old Declined|old reason|Old Org' OR before::text ~* 'old@example|Old Declined|old reason|Old Org'")).toBe(0);
  }

  test('a submit erases what is due first', async () => {
    await backdated();
    await asRole('service_role');
    await submit();
    await expectErased();
  });

  test('the lab\'s list erases first and shows the row without personal data', async () => {
    await backdated();
    await as(db, U.admin);
    const rows = await list();
    expect(rows.find((r) => r.id === id(710))).toMatchObject({ status: 'declined', full_name: null, email: null });
    await expectErased();
  });

  test('approving or declining another request erases first', async () => {
    await backdated();
    await as(db, U.owner);
    await decline(SEEDED);
    await expectErased();
  });

  test('approving erases too; an old approved request is never erased; a refused call erases nothing', async () => {
    await backdated();
    await as(db, U.operator);
    await expect(approve(SEEDED, { client: C.A })).rejects.toEqual(code('42501'));
    expect(await row(id(710))).toMatchObject({ full_name: 'Old Declined', erased_at: null });
    await as(db, U.owner);
    await approve(SEEDED, { client: C.A });
    await expectErased();
    await as(db, null);
    await db.query("UPDATE admin.access_request SET decided_at = now() - interval '200 days' WHERE id = $1", [SEEDED]);
    await as(db, U.owner);
    await list();
    expect(await row(SEEDED)).toMatchObject({ status: 'approved', full_name: 'Robin Example', erased_at: null });
  });

  test('an erased row cannot get personal data back, and only declined rows can be erased', async () => {
    await backdated();
    await as(db, U.admin);
    await list();
    await as(db, null);
    await expect(db.query("UPDATE admin.access_request SET full_name = 'Back' WHERE id = $1", [id(710)])).rejects.toThrow(/check constraint/);
    await expect(db.query('UPDATE admin.access_request SET erased_at = now(), full_name = NULL, email = NULL, organisation = NULL, message = NULL WHERE id = $1', [SEEDED])).rejects.toThrow(/check constraint/);
  });
});
