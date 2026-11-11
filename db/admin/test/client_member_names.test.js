// 0023_client_member_names.sql: client members are named when they accept an invitation (and existing ones are
// backfilled), and the lab's contact for clients (one current text, Owner/Admin write it). Synthetic data only.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { as, C, count, freshDb, id, U } from './helpers.js';

let db;
afterEach(async () => { await db?.close(); db = undefined; });

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');
const MIGRATION = '0023_client_member_names.sql';
const SEEDED_REQUEST = id(700); // pending: Robin Example, robin@larch.example.test

async function asRole(role) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  await db.exec(`SET ROLE ${role}`);
}
async function newUser(n, email) {
  await as(db, null);
  await db.query('INSERT INTO auth.users(id, email) VALUES ($1, $2)', [id(n), email]);
  return id(n);
}
const invite = (email, clientId, role = 'requester', labRole = null) =>
  db.query('SELECT admin.create_invitation($1, $2, $3, $4) AS token', [email, labRole, labRole ? null : clientId, labRole ? null : role]).then((r) => r.rows[0].token);
const approve = (requestId, clientId, role = 'requester') =>
  db.query('SELECT admin.approve_access_request($1, $2, NULL, NULL, $3) AS token', [requestId, clientId, role]).then((r) => r.rows[0].token);
async function acceptAsServer(token, user) {
  await asRole('service_role');
  await db.query('SELECT admin.accept_invitation($1, $2)', [token, user]);
}
const nameOf = async (client, user) => {
  await as(db, null);
  return (await db.query('SELECT display_name FROM admin.client_member WHERE client_id = $1 AND user_id = $2', [client, user])).rows[0]?.display_name;
};

describe('0023: a client member is named when the invitation is accepted', () => {
  test('from an approved access request: the full name the person wrote', async () => {
    db = await freshDb();
    await as(db, U.admin);
    const token = await approve(SEEDED_REQUEST, C.B);
    const robin = await newUser(800, 'robin@larch.example.test');
    await acceptAsServer(token, robin);
    expect(await nameOf(C.B, robin)).toBe('Robin Example');
  });

  test('from a plain invitation: the invited email; accept_my_invitation names the member too', async () => {
    db = await freshDb();
    const kai = await newUser(801, 'kai@cedar.example.test');
    await as(db, U.admin);
    const token = await invite('kai@cedar.example.test', C.B, 'viewer');
    await as(db, kai);
    await db.query('SELECT admin.accept_my_invitation($1)', [token]);
    expect(await nameOf(C.B, kai)).toBe('kai@cedar.example.test');
  });

  test('a member who comes back on a plain invitation keeps the name they had; a lab invitation names no client member', async () => {
    db = await freshDb();
    const ana = await newUser(802, 'ana@alpha.example.test');
    await as(db, null);
    await db.query("INSERT INTO admin.client_member(client_id, user_id, role, display_name, archived_at, archived_reason) VALUES ($1, $2, 'viewer', 'Ana Alpha', now(), 'Synthetic: left')", [C.B, ana]);
    await as(db, U.admin);
    await acceptAsServer(await invite('ana@alpha.example.test', C.B, 'requester'), ana);
    expect(await nameOf(C.B, ana)).toBe('Ana Alpha');

    const lee = await newUser(803, 'lee@lab.example.test');
    await as(db, U.owner);
    await acceptAsServer(await invite('lee@lab.example.test', null, null, 'operator'), lee);
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.client_member WHERE user_id = $1', [lee])).toBe(0);
    expect((await db.query('SELECT display_name FROM admin.lab_staff WHERE user_id = $1', [lee])).rows).toEqual([{ display_name: null }]);
  });

  test('lab Owner, Admin and Operator read the name; the client\'s own members do too; another client\'s member does not', async () => {
    db = await freshDb();
    await as(db, U.admin);
    const token = await approve(SEEDED_REQUEST, C.A);
    const robin = await newUser(804, 'robin@larch.example.test');
    await acceptAsServer(token, robin);
    const read = () => db.query('SELECT display_name FROM admin.client_member WHERE user_id = $1', [robin]).then((r) => r.rows.map((row) => row.display_name));
    for (const u of [U.owner, U.admin, U.operator, U.aReq, U.aView]) {
      await as(db, u);
      expect(await read(), u).toEqual(['Robin Example']);
    }
    await as(db, U.bReq);
    expect(await read()).toEqual([]);
  });

  test('the naming happens in the accept path only: the trigger function is not callable and nobody writes the name directly', async () => {
    db = await freshDb();
    await as(db, null);
    const f = (await db.query(`SELECT prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app,
      has_function_privilege('anon', oid, 'EXECUTE') AS anon, has_function_privilege('service_role', oid, 'EXECUTE') AS service
      FROM pg_proc WHERE oid = 'admin.name_client_member()'::regprocedure`)).rows[0];
    expect(f).toMatchObject({ prosecdef: true, app: false, anon: false, service: false });
    expect(f.proconfig.join()).toMatch(/^search_path=pg_catalog, ?admin$/);
    for (const u of [U.owner, U.aAdmin]) {
      await as(db, u);
      await expect(db.query("UPDATE admin.client_member SET display_name = 'Direct' WHERE client_id = $1", [C.A]), u).rejects.toThrow(/permission denied/);
    }
  });
});

describe('0023: backfill of the members who joined before it', () => {
  // The migrations up to 0022, a few accepted invitations, then 0023 on top: what an existing database goes through.
  async function before0023() {
    const pg = new PGlite();
    await pg.exec(read('test/auth_stub.sql'));
    await pg.exec(read('test/pilot_stub.sql'));
    await pg.exec(read('test/storage_stub.sql'));
    for (const f of readdirSync(root + 'migrations').filter((f) => f.endsWith('.sql') && f < MIGRATION).sort()) await pg.exec(read('migrations/' + f));
    return pg;
  }

  test('names each member from their accepted invitation (an access request\'s name first), leaves named and unmatched rows alone', async () => {
    db = await before0023();
    const q = (sql, p) => db.query(sql, p);
    const users = { owner: id(1), robin: id(2), kai: id(3), ana: id(4), named: id(5), none: id(6) };
    for (const [key, u] of Object.entries(users)) await q('INSERT INTO auth.users(id, email) VALUES ($1, $2)', [u, `${key}@example.test`]);
    await q("INSERT INTO admin.lab_staff(user_id, role) VALUES ($1, 'owner')", [users.owner]);
    await q("INSERT INTO admin.client(id, name, kind) VALUES ($1, 'Synthetic Lab Alpha', 'pi_lab'), ($2, 'Synthetic Company Beta', 'company')", [C.A, C.B]);
    let n = 0;
    const accepted = async (email, client, user, at) => {
      n += 1;
      await q(`INSERT INTO admin.invitation(id, email, client_id, client_role, token_sha256, expires_at, accepted_at, accepted_by)
               VALUES ($1, $2, $3, 'requester', $4, now() + interval '7 days', $5, $6)`, [id(900 + n), email, client, String(n % 10).repeat(64), at, user]);
      return id(900 + n);
    };
    for (const [client, user] of [[C.A, users.robin], [C.A, users.kai], [C.B, users.kai], [C.A, users.ana], [C.A, users.named], [C.A, users.none]]) {
      await q("INSERT INTO admin.client_member(client_id, user_id, role) VALUES ($1, $2, 'requester')", [client, user]);
    }
    await q("UPDATE admin.client_member SET display_name = 'Already Named' WHERE user_id = $1", [users.named]);
    // Robin came through the public form; Kai was invited twice to A (the newer one wins) and once to B; Ana joined
    // through an access request and later through a plain invitation (the request's name wins).
    const robinInv = await accepted('robin@example.test', C.A, users.robin, '2026-10-01');
    await q("INSERT INTO admin.access_request(full_name, email, organisation, kind, status, decided_at, client_id, invitation_id) VALUES ('Robin Example', 'robin@example.test', 'Alpha', 'pi_lab', 'approved', now(), $1, $2)", [C.A, robinInv]);
    await accepted('kai.old@example.test', C.A, users.kai, '2026-09-01');
    await accepted('kai@example.test', C.A, users.kai, '2026-10-01');
    await accepted('kai@beta.example.test', C.B, users.kai, '2026-10-02');
    const anaInv = await accepted('ana@example.test', C.A, users.ana, '2026-09-01');
    await q("INSERT INTO admin.access_request(full_name, email, organisation, kind, status, decided_at, client_id, invitation_id) VALUES ('Ana Alpha', 'ana@example.test', 'Alpha', 'pi_lab', 'approved', now(), $1, $2)", [C.A, anaInv]);
    await accepted('ana.new@example.test', C.A, users.ana, '2026-10-05');
    await accepted('named@example.test', C.A, users.named, '2026-10-01');

    await db.exec(read('migrations/' + MIGRATION));
    const names = (await q('SELECT client_id, user_id, display_name FROM admin.client_member ORDER BY client_id, user_id')).rows;
    expect(names).toEqual([
      { client_id: C.A, user_id: users.robin, display_name: 'Robin Example' },
      { client_id: C.A, user_id: users.kai, display_name: 'kai@example.test' },
      { client_id: C.A, user_id: users.ana, display_name: 'Ana Alpha' },
      { client_id: C.A, user_id: users.named, display_name: 'Already Named' },
      { client_id: C.A, user_id: users.none, display_name: null },
      { client_id: C.B, user_id: users.kai, display_name: 'kai@beta.example.test' },
    ]);
  });
});

describe('0023: the lab\'s contact for clients', () => {
  const current = async () => (await db.query('SELECT body FROM admin.client_contact WHERE archived_at IS NULL')).rows.map((r) => r.body);
  const set = (body) => db.query('SELECT admin.set_client_contact($1)', [body]);
  const SEEDED = 'Write to lab@example.test, quoting your reference.';

  test('every signed-in role reads the current text; anon reads only the text, through client_contact_text', async () => {
    db = await freshDb();
    for (const u of [U.aReq, U.aView, U.bReq, U.operator, U.member]) {
      await as(db, u);
      expect(await current(), u).toEqual([SEEDED]);
    }
    await asRole('anon');
    expect((await db.query('SELECT admin.client_contact_text() AS text')).rows).toEqual([{ text: SEEDED }]);
    await expect(db.query('SELECT body FROM admin.client_contact')).rejects.toThrow(/permission denied/);
  });

  test('Owner and Admin replace it; the earlier text is kept archived; every change is audited; blank clears it', async () => {
    db = await freshDb();
    await as(db, U.owner);
    await set('  Call the synthetic lab desk.  ');
    await as(db, U.admin);
    await set('Write to desk@example.test.');
    expect(await current()).toEqual(['Write to desk@example.test.']);
    await as(db, null);
    expect(await count(db, "SELECT 1 FROM admin.client_contact WHERE archived_reason = 'replaced'")).toBe(2);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'client_contact' AND action = 'INSERT' AND actor = $1", [U.owner])).toBe(1);
    expect((await db.query('SELECT set_by FROM admin.client_contact WHERE archived_at IS NULL')).rows).toEqual([{ set_by: U.admin }]);
    await as(db, U.admin);
    await set('   ');
    expect(await current()).toEqual([]);
    await asRole('anon');
    expect((await db.query('SELECT admin.client_contact_text() AS text')).rows).toEqual([{ text: null }]);
    await as(db, null);
    expect(await count(db, "SELECT 1 FROM admin.client_contact WHERE archived_reason = 'cleared'")).toBe(1);
  });

  test('refuses Operators, lab members, client roles and anon; refuses a text over 500 characters', async () => {
    db = await freshDb();
    for (const u of [U.operator, U.member, U.aAdmin, U.aReq, U.aView]) {
      await as(db, u);
      await expect(set('Not allowed'), u).rejects.toMatchObject({ code: '42501' });
    }
    await asRole('anon');
    await expect(set('Not allowed')).rejects.toThrow(/permission denied/);
    await as(db, U.owner);
    await expect(set('x'.repeat(501))).rejects.toMatchObject({ code: '22023' });
    expect(await current()).toEqual([SEEDED]);
  });

  test('no direct writes for anyone through the app role', async () => {
    db = await freshDb();
    for (const u of [U.owner, U.aReq]) {
      await as(db, u);
      await expect(db.query("INSERT INTO admin.client_contact(body) VALUES ('direct')"), u).rejects.toThrow(/permission denied/);
      await expect(db.query("UPDATE admin.client_contact SET body = 'direct'"), u).rejects.toThrow(/permission denied/);
    }
  });

  test('functions are SECURITY DEFINER with a pinned search_path; set_client_contact is for signed-in users, client_contact_text also for anon', async () => {
    db = await freshDb();
    await as(db, null);
    const access = {};
    for (const sig of ['admin.set_client_contact(text)', 'admin.client_contact_text()']) {
      const f = (await db.query(`SELECT prosecdef, proconfig, proacl::text AS acl, has_function_privilege('authenticated', oid, 'EXECUTE') AS app,
        has_function_privilege('anon', oid, 'EXECUTE') AS anon FROM pg_proc WHERE oid = '${sig}'::regprocedure`)).rows[0];
      expect(f.prosecdef, sig).toBe(true);
      expect(f.proconfig.join(), sig).toMatch(/^search_path=pg_catalog, ?admin$/);
      expect(f.acl, sig).not.toMatch(/(^|[{,])=X/);
      access[sig] = { app: f.app, anon: f.anon };
    }
    expect(access).toEqual({ 'admin.set_client_contact(text)': { app: true, anon: false }, 'admin.client_contact_text()': { app: true, anon: true } });
  });
});
