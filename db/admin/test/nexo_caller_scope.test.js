// Nexo's store per client (0011_nexo_caller_scope.sql, docs/integration/nexo-store-scope.md): the RPC
// admin.nexo_caller(), called by the Nexo API through PostgREST with the signed-in Admin user's own token to scope its
// checkpoint workspaces. Lab staff: one row ('staff', client_id null). A client member: one row per active membership
// of an unarchived client ('client'). Anyone else: no rows. Synthetic data only.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, id, U, C } from './helpers.js';

let db;
afterEach(async () => { await db?.close(); });

const callerRows = () => db.query('SELECT * FROM admin.nexo_caller() ORDER BY client_id').then((r) => r.rows);
const staff = (u) => [{ caller: u, caller_view: 'staff', client_id: null }];
const member = (u, ...clients) => clients.sort().map((c) => ({ caller: u, caller_view: 'client', client_id: c }));
const archive = (table, where, params) =>
  db.query(`UPDATE admin.${table} SET archived_at = now(), archived_reason = 'synthetic: left' WHERE ${where}`, params);

describe('0011: admin.nexo_caller (definition)', () => {
  beforeEach(async () => { db = await freshDb(); });

  test('is SECURITY DEFINER, pins search_path, takes no argument, has the contract result type and runs for authenticated only', async () => {
    const f = (await db.query(`SELECT prosecdef, proconfig, proacl::text AS acl, provolatile, pronargs,
        has_function_privilege('authenticated', oid, 'EXECUTE') AS app, has_function_privilege('anon', oid, 'EXECUTE') AS anon,
        has_function_privilege('nexo_reader', oid, 'EXECUTE') AS nexo, pg_get_function_result(oid) AS result
      FROM pg_proc WHERE oid = 'admin.nexo_caller()'::regprocedure`)).rows[0];
    expect(f.prosecdef).toBe(true);
    expect(f.proconfig.join(',')).toMatch(/^search_path=pg_catalog, ?admin$/);
    expect(f.acl).not.toMatch(/(^|[{,])=X/); // not PUBLIC
    expect({ app: f.app, anon: f.anon, nexo: f.nexo }).toEqual({ app: true, anon: false, nexo: false });
    expect(f.provolatile).toBe('s');
    expect(f.pronargs).toBe(0);
    expect(f.result).toBe('TABLE(caller uuid, caller_view text, client_id uuid)');
  });

  test('changes nothing else: nexo_reader still executes only its two functions', async () => {
    const functions = (await db.query(`SELECT p.oid::regprocedure::text AS f FROM pg_proc p
      WHERE p.pronamespace IN ('admin'::regnamespace, 'public'::regnamespace) AND has_function_privilege('nexo_reader', p.oid, 'EXECUTE') ORDER BY 1`)).rows.map((r) => r.f);
    expect(functions).toEqual(['admin.is_nexo_object(text)', 'admin.nexo_dataset(uuid)']);
  });
});

describe('0011: admin.nexo_caller (who gets which rows)', () => {
  beforeEach(async () => { db = await freshDb(); });

  test('lab staff (owner, admin, operator) get one staff row with a null client_id', async () => {
    for (const u of [U.owner, U.admin, U.operator]) {
      await as(db, u);
      expect(await callerRows(), u).toEqual(staff(u));
    }
  });

  test('a member of one client gets one client row; a member of two clients gets two', async () => {
    for (const u of [U.aAdmin, U.aReq, U.aView]) {
      await as(db, u);
      expect(await callerRows(), u).toEqual(member(u, C.A));
    }
    await as(db, U.bReq);
    expect(await callerRows()).toEqual(member(U.bReq, C.B));
    await as(db, U.both);
    expect(await callerRows()).toEqual(member(U.both, C.A, C.B));
  });

  test('a lab member (not staff), a user with no role and a request without a subject get no rows', async () => {
    const stranger = id(40);
    await as(db, null);
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [stranger]);
    for (const u of [U.member, stranger]) {
      await as(db, u);
      expect(await callerRows(), u).toEqual([]);
    }
    await as(db, null);
    await db.exec('SET ROLE authenticated');
    expect(await callerRows()).toEqual([]);
  });

  test('an archived membership drops that client only; a member whose only membership is archived gets no rows', async () => {
    await as(db, null);
    await archive('client_member', 'user_id = $1 AND client_id = $2', [U.aView, C.A]);
    await archive('client_member', 'user_id = $1 AND client_id = $2', [U.both, C.B]);
    await as(db, U.aView);
    expect(await callerRows()).toEqual([]);
    await as(db, U.both);
    expect(await callerRows()).toEqual(member(U.both, C.A));
  });

  test('an archived client drops its members\' rows; its other members\' other clients stay', async () => {
    await as(db, null);
    await archive('client', 'id = $1', [C.A]);
    for (const u of [U.aAdmin, U.aReq]) {
      await as(db, u);
      expect(await callerRows(), u).toEqual([]);
    }
    await as(db, U.both);
    expect(await callerRows()).toEqual(member(U.both, C.B));
    await as(db, U.owner); // lab staff are not tied to a client
    expect(await callerRows()).toEqual(staff(U.owner));
  });

  test('archived lab staff get no rows', async () => {
    await as(db, null);
    await archive('lab_staff', 'user_id = $1', [U.operator]);
    await as(db, U.operator);
    expect(await callerRows()).toEqual([]);
  });

  test('someone who is both lab staff and a member of two clients gets one staff row', async () => {
    await as(db, null);
    await db.query("INSERT INTO admin.client_member(client_id, user_id, role) VALUES ($1, $3, 'viewer'), ($2, $3, 'requester')", [C.A, C.B, U.operator]);
    await as(db, U.operator);
    expect(await callerRows()).toEqual(staff(U.operator));
  });

  test('archived lab staff who are still client members are answered as members', async () => {
    await as(db, null);
    await db.query("INSERT INTO admin.client_member(client_id, user_id, role) VALUES ($1, $2, 'viewer')", [C.B, U.operator]);
    await archive('lab_staff', 'user_id = $1', [U.operator]);
    await as(db, U.operator);
    expect(await callerRows()).toEqual(member(U.operator, C.B));
  });

  test('anon and nexo_reader cannot call it', async () => {
    // anon has no USAGE on schema admin here (PostgREST answers 401/42501 either way); it is refused before the function.
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
    await db.exec('SET ROLE anon');
    await expect(callerRows()).rejects.toThrow(/permission denied for (schema admin|function nexo_caller)/);
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [U.owner]);
    await db.exec('SET ROLE nexo_reader');
    await expect(callerRows()).rejects.toThrow(/permission denied for function nexo_caller/);
  });
});
