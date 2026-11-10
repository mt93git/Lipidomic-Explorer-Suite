// Admin accounts in Nexo (0010_nexo_caller.sql, docs/integration/admin-identity.md): the RPC
// admin.nexo_dataset_for_caller, called by the Nexo API through PostgREST with the signed-in Admin user's own token.
// A row only for a released, unarchived dataset of an unarchived order, and only when the caller is lab staff
// ('staff') or an active member of the dataset's client ('client'). Synthetic data only.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, id, U, C, setNexoAccess } from './helpers.js';

let db;
afterEach(async () => { await db?.close(); });

const sha = (c) => c.repeat(64);
const ORDER = id(720);
const D = { superseded: id(721), current: id(722), withdrawn: id(723), built: id(724), unknown: id(799) };
// The seed's released dataset of client B (helpers.js: id(209), order id(201)).
const B_DATASET = id(209);
const pathOf = (code, digest) => `${C.A}/${code}/datasets/${digest}/dataset-v1.xlsx`;
let code;

const forCaller = (ds) => db.query('SELECT * FROM admin.nexo_dataset_for_caller($1)', [ds]).then((r) => r.rows);
const row = (view, caller) => ({
  dataset_id: D.current, order_code: code, version: 2, storage_path: pathOf(code, sha('2')), sha256: sha('2'),
  client_id: C.A, caller, caller_view: view,
});

async function asAnon() {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  await db.exec('SET ROLE anon');
}

// One order of client A with four versions: v1 superseded by v2, v2 released and current, v3 withdrawn, v4 only built.
async function scenario() {
  await as(db, null);
  code = (await db.query("INSERT INTO admin.\"order\"(id, client_id, title) VALUES ($1, $2, 'Nexo caller synthetic') RETURNING code", [ORDER, C.A])).rows[0].code;
  const versions = [[D.superseded, 1, '1', true], [D.current, 2, '2', true], [D.withdrawn, 3, '3', true], [D.built, 4, '4', false]];
  for (const [ds, version, digit, release] of versions) {
    await db.query(`INSERT INTO admin.dataset(id, client_id, order_id, version, storage_path, sha256, analysis_sha256, analysis_size_bytes, companion_sha256, companion_size_bytes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 100, $8, 50)`, [ds, C.A, ORDER, version, pathOf(code, sha(digit)), sha(digit), sha('9'), sha('7')]);
    if (!release) continue;
    await db.query("INSERT INTO admin.signature(client_id, dataset_id, user_id, role) VALUES ($1, $2, $3, 'prepared'), ($1, $2, $4, 'approved')", [C.A, ds, U.owner, U.admin]);
    await db.query("UPDATE admin.dataset SET status = 'released' WHERE id = $1", [ds]);
  }
  await as(db, U.owner);
  await db.query('SELECT admin.supersede_dataset($1, $2)', [D.superseded, D.current]);
  await db.query("SELECT admin.withdraw_dataset($1, 'synthetic: wrong metadata')", [D.withdrawn]);
  await as(db, null);
}

describe('0010: admin.nexo_dataset_for_caller (definition)', () => {
  beforeEach(async () => { db = await freshDb(); });

  test('is SECURITY DEFINER, pins search_path, has the contract result type and runs for authenticated only', async () => {
    const f = (await db.query(`SELECT prosecdef, proconfig, proacl::text AS acl, provolatile,
        has_function_privilege('authenticated', oid, 'EXECUTE') AS app, has_function_privilege('anon', oid, 'EXECUTE') AS anon,
        has_function_privilege('nexo_reader', oid, 'EXECUTE') AS nexo, pg_get_function_result(oid) AS result
      FROM pg_proc WHERE oid = 'admin.nexo_dataset_for_caller(uuid)'::regprocedure`)).rows[0];
    expect(f.prosecdef).toBe(true);
    expect(f.proconfig.join(',')).toMatch(/^search_path=pg_catalog, ?admin$/);
    expect(f.acl).not.toMatch(/(^|[{,])=X/); // not PUBLIC
    expect({ app: f.app, anon: f.anon, nexo: f.nexo }).toEqual({ app: true, anon: false, nexo: false });
    expect(f.provolatile).toBe('s');
    expect(f.result).toBe('TABLE(dataset_id uuid, order_code text, version integer, storage_path text, sha256 text, client_id uuid, caller uuid, caller_view text)');
  });

  test('changes nothing else: nexo_reader still executes only its two functions', async () => {
    const functions = (await db.query(`SELECT p.oid::regprocedure::text AS f FROM pg_proc p
      WHERE p.pronamespace IN ('admin'::regnamespace, 'public'::regnamespace) AND has_function_privilege('nexo_reader', p.oid, 'EXECUTE') ORDER BY 1`)).rows.map((r) => r.f);
    expect(functions).toEqual(['admin.is_nexo_object(text)', 'admin.nexo_dataset(uuid)']);
  });
});

describe('0010: admin.nexo_dataset_for_caller (who gets a row)', () => {
  // Both clients have Nexo switched on (0022); the switch itself is tested below.
  beforeEach(async () => { db = await freshDb(); await scenario(); await setNexoAccess(db, C.A, true); await setNexoAccess(db, C.B, true); });

  test('lab staff (owner, admin, operator) get the released, current dataset with caller_view staff', async () => {
    for (const u of [U.owner, U.admin, U.operator]) {
      await as(db, u);
      expect(await forCaller(D.current), u).toEqual([row('staff', u)]);
    }
  });

  test('lab staff also get a released dataset of any other client', async () => {
    await as(db, U.operator);
    const [r] = await forCaller(B_DATASET);
    expect(r).toMatchObject({ dataset_id: B_DATASET, client_id: C.B, caller: U.operator, caller_view: 'staff' });
  });

  test('every active member of the dataset\'s client (client admin, requester, viewer) gets it with caller_view client', async () => {
    for (const u of [U.aAdmin, U.aReq, U.aView, U.both]) {
      await as(db, u);
      expect(await forCaller(D.current), u).toEqual([row('client', u)]);
    }
  });

  test('a member of another client gets no row; a member of both clients gets each client\'s own dataset', async () => {
    await as(db, U.bReq);
    expect(await forCaller(D.current)).toEqual([]);
    expect(await forCaller(B_DATASET)).toHaveLength(1);
    await as(db, U.aReq);
    expect(await forCaller(B_DATASET)).toEqual([]);
    await as(db, U.both);
    expect((await forCaller(B_DATASET))[0]).toMatchObject({ client_id: C.B, caller_view: 'client' });
  });

  test('a lab member (not staff) and a user with no role at all get no row', async () => {
    const stranger = id(40);
    await as(db, null);
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [stranger]);
    for (const u of [U.member, stranger]) {
      await as(db, u);
      expect(await forCaller(D.current), u).toEqual([]);
    }
  });

  test('built, withdrawn, superseded, unknown and null ids give no row, to staff and members alike', async () => {
    for (const u of [U.owner, U.aAdmin]) {
      await as(db, u);
      for (const ds of [D.built, D.withdrawn, D.superseded, D.unknown, null]) expect(await forCaller(ds), `${u} ${ds}`).toEqual([]);
    }
  });

  test('a version withdrawn after release stops answering at once', async () => {
    await as(db, U.owner);
    await db.query("SELECT admin.withdraw_dataset($1, 'synthetic: pulled')", [D.current]);
    for (const u of [U.owner, U.aReq]) {
      await as(db, u);
      expect(await forCaller(D.current), u).toEqual([]);
    }
  });

  test('an archived order hides its released dataset', async () => {
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET archived_at = now(), archived_reason = 'synthetic: closed' WHERE id = $1", [ORDER]);
    for (const u of [U.owner, U.aReq]) {
      await as(db, u);
      expect(await forCaller(D.current), u).toEqual([]);
    }
  });

  test('an archived membership, an archived client and archived lab staff lose access', async () => {
    await as(db, null);
    await db.query("UPDATE admin.client_member SET archived_at = now(), archived_reason = 'synthetic: left' WHERE user_id = $1 AND client_id = $2", [U.aView, C.A]);
    await db.query("UPDATE admin.lab_staff SET archived_at = now(), archived_reason = 'synthetic: left' WHERE user_id = $1", [U.operator]);
    for (const u of [U.aView, U.operator]) {
      await as(db, u);
      expect(await forCaller(D.current), u).toEqual([]);
    }
    await as(db, null);
    await db.query("UPDATE admin.client SET archived_at = now(), archived_reason = 'synthetic: closed' WHERE id = $1", [C.A]);
    await as(db, U.aReq);
    expect(await forCaller(D.current)).toEqual([]);
    await as(db, U.owner); // lab staff still see it: the dataset and its order are live
    expect(await forCaller(D.current)).toEqual([row('staff', U.owner)]);
  });

  test('a lab staff member who is also a client member is answered as staff', async () => {
    await as(db, null);
    await db.query("INSERT INTO admin.client_member(client_id, user_id, role) VALUES ($1, $2, 'viewer')", [C.A, U.operator]);
    await as(db, U.operator);
    expect(await forCaller(D.current)).toEqual([row('staff', U.operator)]);
  });

  test('an authenticated request without a subject gets no row', async () => {
    await as(db, null);
    await db.exec('SET ROLE authenticated');
    expect(await forCaller(D.current)).toEqual([]);
  });

  test('anon and nexo_reader cannot call it', async () => {
    // anon has no USAGE on schema admin here (PostgREST answers 401/42501 either way); it is refused before the function.
    await asAnon();
    await expect(forCaller(D.current)).rejects.toThrow(/permission denied for (schema admin|function nexo_dataset_for_caller)/);
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [U.owner]);
    await db.exec('SET ROLE nexo_reader');
    await expect(forCaller(D.current)).rejects.toThrow(/permission denied for function nexo_dataset_for_caller/);
  });

  test('the caller column is auth.uid(), never an argument the caller chooses', async () => {
    await as(db, U.aReq);
    const [r] = await forCaller(D.current);
    expect(r.caller).toBe(U.aReq);
    const args = (await db.query("SELECT pronargs FROM pg_proc WHERE oid = 'admin.nexo_dataset_for_caller(uuid)'::regprocedure")).rows[0].pronargs;
    expect(args).toBe(1);
  });
});

// 0022: the per-client Nexo switch (0021's admin.client.nexo_access) in all three functions the Nexo API reads.
describe('0022: the per-client Nexo switch', () => {
  beforeEach(async () => { db = await freshDb(); await scenario(); });
  const scope = () => db.query('SELECT * FROM admin.nexo_caller() ORDER BY client_id').then((r) => r.rows);
  const people = (c) => db.query('SELECT user_id, kind FROM admin.nexo_people($1) ORDER BY kind DESC, user_id', [c]).then((r) => r.rows);
  const staffPeople = [U.owner, U.admin, U.operator].sort().map((user_id) => ({ user_id, kind: 'staff' }));
  const members = (...us) => us.sort().map((user_id) => ({ user_id, kind: 'member' }));

  // What each function gives client A's requester and the Owner, with client B left on.
  async function answers() {
    await as(db, U.aReq);
    const member = { dataset: await forCaller(D.current), scope: await scope(), people: await people(C.A) };
    await as(db, U.both);
    const both = await scope();
    await as(db, U.owner);
    const staff = { dataset: await forCaller(D.current), scope: await scope(), people: await people(C.A), peopleB: await people(C.B) };
    return { member, both, staff };
  }
  const staffAnswers = () => ({ dataset: [row('staff', U.owner)], scope: [{ caller: U.owner, caller_view: 'staff', client_id: null }] });

  test('off (the default for every client): no row for the client member from any of the three; staff keep theirs', async () => {
    await setNexoAccess(db, C.B, true);
    const a = await answers();
    expect(a.member).toEqual({ dataset: [], scope: [], people: staffPeople }); // the member is not listed; staff entries stay
    expect(a.both).toEqual([{ caller: U.both, caller_view: 'client', client_id: C.B }]); // client B's switch is its own
    expect(a.staff).toEqual({ ...staffAnswers(), people: staffPeople, peopleB: [...staffPeople, ...members(U.bReq, U.both)] });
    await as(db, U.both);
    expect(await forCaller(B_DATASET)).toHaveLength(1);
  });

  test('on: the member gets it back from all three; off again: gone again, staff unchanged throughout', async () => {
    await setNexoAccess(db, C.B, true);
    await setNexoAccess(db, C.A, true);
    const on = await answers();
    expect(on.member).toEqual({ dataset: [row('client', U.aReq)], scope: [{ caller: U.aReq, caller_view: 'client', client_id: C.A }],
      people: [...staffPeople, ...members(U.aAdmin, U.aReq, U.aView, U.both)] });
    expect(on.both).toEqual([C.A, C.B].sort().map((client_id) => ({ caller: U.both, caller_view: 'client', client_id })));
    expect(on.staff).toEqual({ ...staffAnswers(), people: [...staffPeople, ...members(U.aAdmin, U.aReq, U.aView, U.both)],
      peopleB: [...staffPeople, ...members(U.bReq, U.both)] });

    await setNexoAccess(db, C.A, false);
    const off = await answers();
    expect(off.member).toEqual({ dataset: [], scope: [], people: staffPeople });
    expect(off.staff).toEqual({ ...staffAnswers(), people: staffPeople, peopleB: [...staffPeople, ...members(U.bReq, U.both)] });
  });

  test('a lab staff member who is also a member of a switched-off client is still answered as staff', async () => {
    await as(db, null);
    await db.query("INSERT INTO admin.client_member(client_id, user_id, role) VALUES ($1, $2, 'viewer')", [C.A, U.operator]);
    await as(db, U.operator);
    expect(await forCaller(D.current)).toEqual([row('staff', U.operator)]);
    expect(await scope()).toEqual([{ caller: U.operator, caller_view: 'staff', client_id: null }]);
  });
});
