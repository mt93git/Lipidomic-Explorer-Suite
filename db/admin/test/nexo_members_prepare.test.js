// 0024_nexo_members_prepare.sql (Nexo's own entry, 2026-11-10): the per-client switch admin.client.members_prepare
// (off by default; lab Owner or Admin, only while nexo_access is on), the list RPC admin.nexo_datasets_for_caller() Nexo
// shows on its own landing page, and the column members_prepare on nexo_dataset_for_caller and nexo_caller.
// members_prepare in every RPC row is the row's client's effective value (nexo_access AND members_prepare); the staff
// row of nexo_caller has no client, so NULL. Synthetic data only.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, id, count, U, C, setNexoAccess } from './helpers.js';

let db;
afterEach(async () => { await db?.close(); });

const code = async (p) => p.then(() => 'ok', (e) => e.code);
const setPrepare = (c, on) => db.query('SELECT admin.set_client_members_prepare($1, $2)', [c, on]);
async function prepare(client, on) { await as(db, U.admin); await setPrepare(client, on); await as(db, null); }
const list = () => db.query('SELECT * FROM admin.nexo_datasets_for_caller()').then((r) => r.rows);
const ids = (rows) => rows.map((r) => r.dataset_id);
// The seed's released v1 per client (helpers.js): dataset id(109) of order id(101) (A), id(209) of order id(201) (B).
const A1 = id(109);
const B1 = id(209);
const A2 = id(150); // a second, released order of client A, added below
const BUILT = id(151); // built, never released

async function asAnon() {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  await db.exec('SET ROLE anon');
}

async function definition(signature) {
  return (await db.query(`SELECT prosecdef, proconfig, proacl::text AS acl, provolatile,
      has_function_privilege('authenticated', oid, 'EXECUTE') AS app, has_function_privilege('anon', oid, 'EXECUTE') AS anon,
      has_function_privilege('nexo_reader', oid, 'EXECUTE') AS nexo, pg_get_function_result(oid) AS result
    FROM pg_proc WHERE oid = $1::regprocedure`, [signature])).rows[0];
}

// Client A gets a second released order (A2) and a built, unreleased version on it (BUILT).
async function moreDatasets() {
  await as(db, null);
  await db.query("INSERT INTO admin.\"order\"(id, client_id, title) VALUES ($1, $2, 'Second synthetic order')", [id(152), C.A]);
  for (const [ds, version] of [[A2, 1], [BUILT, 2]]) {
    await db.query(`INSERT INTO admin.dataset(id, client_id, order_id, version, storage_path, sha256, analysis_sha256, analysis_size_bytes, companion_sha256, companion_size_bytes)
      VALUES ($1, $2, $3, $4, 'datasets/y.xlsx', $5, $6, 100, $7, 50)`, [ds, C.A, id(152), version, String(version).repeat(64), '9'.repeat(64), '7'.repeat(64)]);
  }
  await db.query("INSERT INTO admin.signature(client_id, dataset_id, user_id, role) VALUES ($1, $2, $3, 'prepared'), ($1, $2, $4, 'approved')", [C.A, A2, U.owner, U.admin]);
  await db.query("UPDATE admin.dataset SET status = 'released' WHERE id = $1", [A2]);
}

describe('0024: admin.client.members_prepare', () => {
  beforeEach(async () => { db = await freshDb(); });

  test('is boolean NOT NULL DEFAULT false and off for every client; the app role cannot write it directly', async () => {
    const column = (await db.query(`SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'admin' AND table_name = 'client' AND column_name = 'members_prepare'`)).rows[0];
    expect(column).toEqual({ data_type: 'boolean', is_nullable: 'NO', column_default: 'false' });
    expect((await db.query('SELECT DISTINCT members_prepare FROM admin.client')).rows).toEqual([{ members_prepare: false }]);
    const col = async (privilege) => (await db.query("SELECT has_column_privilege('authenticated', 'admin.client', 'members_prepare', $1) AS ok", [privilege])).rows[0].ok;
    expect([await col('UPDATE'), await col('INSERT'), await col('SELECT')]).toEqual([false, false, true]);
    await as(db, U.admin);
    expect(await code(db.query('UPDATE admin.client SET members_prepare = true WHERE id = $1', [C.A]))).toBe('42501');
    expect(await code(db.query("INSERT INTO admin.client(name, kind, members_prepare) VALUES ('Synthetic Gamma', 'pi_lab', true)"))).toBe('42501');
  });

  test('set_client_members_prepare: a lab Owner or Admin turns it on while Nexo access is on, audited; the same value writes nothing', async () => {
    await setNexoAccess(db, C.A, true);
    const before = await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'client' AND entity_id = $1", [C.A]);
    await as(db, U.admin);
    await setPrepare(C.A, true);
    await as(db, U.owner);
    await setPrepare(C.A, true);
    await as(db, null);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'client' AND entity_id = $1", [C.A])).toBe(before + 1);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'client' AND entity_id = $1 AND actor = $2 AND before->>'members_prepare' = 'false' AND after->>'members_prepare' = 'true'", [C.A, U.admin])).toBe(1);
    expect((await db.query('SELECT id, members_prepare FROM admin.client ORDER BY id')).rows).toEqual([{ id: C.A, members_prepare: true }, { id: C.B, members_prepare: false }]);
    await as(db, U.owner);
    await setPrepare(C.A, false);
    await as(db, null);
    expect((await db.query('SELECT members_prepare FROM admin.client WHERE id = $1', [C.A])).rows[0].members_prepare).toBe(false);
  });

  test('refusals: Operator, lab member and client roles (42501); on while Nexo access is off (55000); null (22023); unknown (P0002); archived (55000)', async () => {
    await setNexoAccess(db, C.A, true);
    for (const u of [U.operator, U.member, U.aAdmin, U.aReq, U.bReq]) {
      await as(db, u);
      expect(await code(setPrepare(C.A, true)), u).toBe('42501');
    }
    await as(db, U.admin);
    expect(await code(setPrepare(C.B, true))).toBe('55000'); // client B's Nexo access is off
    expect(await code(setPrepare(C.B, false))).toBe('ok'); // turning it off is always allowed
    expect(await code(setPrepare(C.A, null))).toBe('22023');
    expect(await code(setPrepare(id(997), true))).toBe('P0002');
    await db.query("UPDATE admin.client SET archived_at = now(), archived_reason = 'synthetic' WHERE id = $1", [C.A]);
    expect(await code(setPrepare(C.A, true))).toBe('55000');
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.client WHERE members_prepare')).toBe(0);
  });

  test('set_client_members_prepare is SECURITY DEFINER with a pinned search_path, for authenticated only', async () => {
    const f = await definition('admin.set_client_members_prepare(uuid, boolean)');
    expect(f.prosecdef).toBe(true);
    expect(f.proconfig.join(',')).toMatch(/^search_path=pg_catalog, ?admin$/);
    expect(f.acl).not.toMatch(/(^|[{,])=X/);
    expect({ app: f.app, anon: f.anon, nexo: f.nexo }).toEqual({ app: true, anon: false, nexo: false });
  });
});

describe('0024: admin.nexo_datasets_for_caller (definition)', () => {
  beforeEach(async () => { db = await freshDb(); });

  test('is SECURITY DEFINER, pins search_path, takes no argument, has the contract result type (no e-mail) and runs for authenticated only', async () => {
    const f = await definition('admin.nexo_datasets_for_caller()');
    expect(f.prosecdef).toBe(true);
    expect(f.proconfig.join(',')).toMatch(/^search_path=pg_catalog, ?admin$/);
    expect(f.acl).not.toMatch(/(^|[{,])=X/);
    expect({ app: f.app, anon: f.anon, nexo: f.nexo }).toEqual({ app: true, anon: false, nexo: false });
    expect(f.provolatile).toBe('s');
    expect(f.result).toBe('TABLE(dataset_id uuid, order_code text, version integer, client_id uuid, client_name text, released_at timestamp with time zone, members_prepare boolean)');
    expect(f.result).not.toMatch(/mail/i);
  });

  test('nexo_dataset_for_caller and nexo_caller gain a last column members_prepare boolean, same grants', async () => {
    const one = await definition('admin.nexo_dataset_for_caller(uuid)');
    expect(one.result).toBe('TABLE(dataset_id uuid, order_code text, version integer, storage_path text, sha256 text, client_id uuid, caller uuid, caller_view text, members_prepare boolean)');
    const scope = await definition('admin.nexo_caller()');
    expect(scope.result).toBe('TABLE(caller uuid, caller_view text, client_id uuid, members_prepare boolean)');
    for (const f of [one, scope]) {
      expect(f.prosecdef).toBe(true);
      expect(f.proconfig.join(',')).toMatch(/^search_path=pg_catalog, ?admin$/);
      expect(f.acl).not.toMatch(/(^|[{,])=X/);
      expect({ app: f.app, anon: f.anon, nexo: f.nexo }).toEqual({ app: true, anon: false, nexo: false });
      expect(f.provolatile).toBe('s');
    }
  });
});

describe('0024: admin.nexo_datasets_for_caller (who gets which rows)', () => {
  // Client A has Nexo on, client B off (the default).
  beforeEach(async () => { db = await freshDb(); await moreDatasets(); await setNexoAccess(db, C.A, true); });

  test('lab staff get every released dataset of every client, whatever the switches, with the client name and release time', async () => {
    for (const u of [U.owner, U.admin, U.operator]) {
      await as(db, u);
      const rows = await list();
      expect(ids(rows).sort(), u).toEqual([A1, A2, B1].sort());
      expect(rows.find((r) => r.dataset_id === B1)).toMatchObject({ version: 1, client_id: C.B, client_name: 'Synthetic Company Beta', members_prepare: false });
      for (const r of rows) {
        expect(r.order_code).toMatch(/\S/);
        expect(r.released_at).toBeInstanceOf(Date);
        expect(Object.keys(r)).toEqual(['dataset_id', 'order_code', 'version', 'client_id', 'client_name', 'released_at', 'members_prepare']);
      }
    }
  });

  test('a client member gets only the released datasets of their clients with Nexo access on', async () => {
    for (const u of [U.aAdmin, U.aReq, U.aView, U.both]) {
      await as(db, u);
      const rows = await list();
      expect(ids(rows).sort(), u).toEqual([A1, A2].sort());
      expect(rows.every((r) => r.client_id === C.A && r.client_name === 'Synthetic Lab Alpha'), u).toBe(true);
    }
    await setNexoAccess(db, C.B, true);
    await as(db, U.both);
    expect(ids(await list()).sort()).toEqual([A1, A2, B1].sort());
  });

  test('another client\'s member gets nothing (client B is off); nor do a lab member, a stranger or a request without a subject', async () => {
    const stranger = id(40);
    await as(db, null);
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [stranger]);
    for (const u of [U.bReq, U.member, stranger]) {
      await as(db, u);
      expect(await list(), u).toEqual([]);
    }
    await as(db, null);
    await db.exec('SET ROLE authenticated');
    expect(await list()).toEqual([]);
  });

  // A released dataset is never archived by itself (0008's guard: it is retired by withdraw or supersede); its order is.
  test('a dataset of an archived order and a withdrawn one are hidden, from staff and members alike', async () => {
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET archived_at = now(), archived_reason = 'synthetic: closed' WHERE id = ANY($1)", [[id(101), id(201)]]);
    await as(db, U.owner);
    expect(ids(await list())).toEqual([A2]);
    await as(db, U.aReq);
    expect(ids(await list())).toEqual([A2]);
    await as(db, U.owner);
    await db.query("SELECT admin.withdraw_dataset($1, 'synthetic: pulled')", [A2]);
    expect(await list()).toEqual([]);
  });

  test('members_prepare is carried per client, to staff and members, and only while Nexo access is on', async () => {
    await prepare(C.A, true);
    const prepared = (rows) => Object.fromEntries(rows.map((r) => [r.dataset_id, r.members_prepare]));
    await as(db, U.aReq);
    expect(prepared(await list())).toEqual({ [A1]: true, [A2]: true });
    await as(db, U.operator);
    expect(prepared(await list())).toEqual({ [A1]: true, [A2]: true, [B1]: false });
    await setNexoAccess(db, C.A, false); // the stored value stays; it does not count while Nexo is off
    await as(db, U.operator);
    expect(prepared(await list())).toEqual({ [A1]: false, [A2]: false, [B1]: false });
    await as(db, U.aReq);
    expect(await list()).toEqual([]);
  });

  test('a lab staff member who is also a client member sees everything, like staff', async () => {
    await as(db, null);
    await db.query("INSERT INTO admin.client_member(client_id, user_id, role) VALUES ($1, $2, 'viewer')", [C.B, U.operator]);
    await as(db, U.operator);
    expect(ids(await list()).sort()).toEqual([A1, A2, B1].sort());
  });

  test('anon and nexo_reader cannot call it', async () => {
    await asAnon();
    await expect(list()).rejects.toThrow(/permission denied for (schema admin|function nexo_datasets_for_caller)/);
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [U.owner]);
    await db.exec('SET ROLE nexo_reader');
    await expect(list()).rejects.toThrow(/permission denied for function nexo_datasets_for_caller/);
  });
});

describe('0024: members_prepare on nexo_dataset_for_caller and nexo_caller', () => {
  beforeEach(async () => { db = await freshDb(); await setNexoAccess(db, C.A, true); await setNexoAccess(db, C.B, true); await prepare(C.A, true); });

  test('nexo_dataset_for_caller answers the dataset\'s client\'s value, to its members and to staff', async () => {
    const one = async (ds) => (await db.query('SELECT client_id, caller_view, members_prepare FROM admin.nexo_dataset_for_caller($1)', [ds])).rows;
    await as(db, U.aReq);
    expect(await one(A1)).toEqual([{ client_id: C.A, caller_view: 'client', members_prepare: true }]);
    await as(db, U.bReq);
    expect(await one(B1)).toEqual([{ client_id: C.B, caller_view: 'client', members_prepare: false }]);
    expect(await one(A1)).toEqual([]);
    await as(db, U.owner);
    expect(await one(A1)).toEqual([{ client_id: C.A, caller_view: 'staff', members_prepare: true }]);
    expect(await one(B1)).toEqual([{ client_id: C.B, caller_view: 'staff', members_prepare: false }]);
  });

  test('nexo_caller answers each client row\'s value; the staff row has no client, so NULL', async () => {
    const scope = async () => (await db.query('SELECT caller_view, client_id, members_prepare FROM admin.nexo_caller() ORDER BY client_id')).rows;
    await as(db, U.both);
    expect(await scope()).toEqual([{ caller_view: 'client', client_id: C.A, members_prepare: true }, { caller_view: 'client', client_id: C.B, members_prepare: false }].sort((a, b) => a.client_id.localeCompare(b.client_id)));
    await as(db, U.owner);
    expect(await scope()).toEqual([{ caller_view: 'staff', client_id: null, members_prepare: null }]);
  });
});
