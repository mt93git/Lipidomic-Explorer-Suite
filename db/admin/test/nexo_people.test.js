// Synthetic identities only; migrations run exclusively in an ephemeral in-memory PGlite.
import { beforeEach, afterEach, test, expect } from 'vitest';
import { freshDb, as, U, C, setNexoAccess } from './helpers.js';
let db;
// Client A has Nexo switched on (0022); the switch itself is tested in nexo_caller.test.js.
beforeEach(async () => { db = await freshDb(); await setNexoAccess(db, C.A, true); });
afterEach(async () => { await db?.close(); });
const people = () => db.query('SELECT * FROM admin.nexo_people($1) ORDER BY user_id', [C.A]).then(r => r.rows);

test('staff and own-client members see staff plus active client members, with only names and kind', async () => {
  await db.query("UPDATE admin.client_member SET display_name = 'Synthetic Alice' WHERE user_id = $1", [U.aAdmin]);
  const expected = [
    ...[[U.owner, 'owner'], [U.admin, 'admin'], [U.operator, 'operator']].map(([user_id, display_name]) => ({ user_id, display_name, kind: 'staff' })),
    ...[U.aAdmin, U.aReq, U.aView, U.both].map(user_id => ({ user_id, display_name: user_id === U.aAdmin ? 'Synthetic Alice' : null, kind: 'member' })),
  ];
  for (const user of [U.owner, U.admin, U.operator, U.aAdmin, U.aReq, U.aView]) {
    await as(db, user);
    expect(await people()).toEqual(expected);
  }
});

test('other-client members, lab non-staff and missing subjects see nothing; anon cannot execute', async () => {
  for (const user of [U.bReq, U.member]) {
    await as(db, user);
    expect(await people()).toEqual([]);
  }
  await as(db, null);
  await db.exec('SET ROLE authenticated');
  expect(await people()).toEqual([]);
  await db.exec('RESET ROLE; SET ROLE anon');
  await expect(people()).rejects.toThrow(/permission denied/);
});

test('archived staff, memberships and clients are excluded', async () => {
  await db.query("UPDATE admin.lab_staff SET archived_at = now(), archived_reason = 'synthetic' WHERE user_id = $1", [U.operator]);
  await db.query("UPDATE admin.client_member SET archived_at = now(), archived_reason = 'synthetic' WHERE user_id = $1", [U.aView]);
  await as(db, U.aReq);
  expect((await people()).map(r => r.user_id)).toEqual([U.owner, U.admin, U.aAdmin, U.aReq, U.both]);
  await as(db, null);
  await db.query("UPDATE admin.client SET archived_at = now(), archived_reason = 'synthetic' WHERE id = $1", [C.A]);
  await as(db, U.aReq);
  expect(await people()).toEqual([]);
});

test('definition is pinned SECURITY DEFINER, authenticated only, and has no e-mail column', async () => {
  const { rows: [f] } = await db.query(`SELECT prosecdef, proconfig, pg_get_function_result(oid) AS result,
    has_function_privilege('authenticated', oid, 'EXECUTE') AS app,
    has_function_privilege('anon', oid, 'EXECUTE') AS anon,
    has_function_privilege('nexo_reader', oid, 'EXECUTE') AS reader
    FROM pg_proc WHERE oid = 'admin.nexo_people(uuid)'::regprocedure`);
  expect(f.prosecdef).toBe(true);
  expect(f.proconfig.join(',')).toMatch(/^search_path=pg_catalog, ?admin$/);
  expect(f.result).toBe('TABLE(user_id uuid, display_name text, kind text)');
  expect([f.app, f.anon, f.reader]).toEqual([true, false, false]);
});
