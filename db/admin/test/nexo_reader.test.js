// Open in Nexo (0009_nexo_reader.sql, docs/integration/admin-nexo-open.md): the role nexo_reader, the RPC
// admin.nexo_dataset and the read-only storage policy on admin-files. Synthetic data only.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, id, U, C } from './helpers.js';

let db;
afterEach(async () => { await db?.close(); });

const sha = (c) => c.repeat(64);
const ORDER = id(710);
const D = { superseded: id(711), current: id(712), withdrawn: id(713), built: id(714), unknown: id(799) };
const pathOf = (code, digest) => `${C.A}/${code}/datasets/${digest}/dataset-v1.xlsx`;
let code;

// The Nexo API's identity: PostgREST and Storage switch to the JWT's role claim. `sub` may be anything (or a
// lab owner's id, forged); nothing below depends on it.
async function asNexo(sub = '') {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [sub]);
  await db.exec('SET ROLE nexo_reader');
}
const nexoDataset = (ds) => db.query('SELECT * FROM admin.nexo_dataset($1)', [ds]).then((r) => r.rows);
const objects = () => db.query('SELECT bucket_id, name FROM storage.objects ORDER BY bucket_id, name').then((r) => r.rows);

// One Storage v1.81.0 request: a transaction with the JWT's role, its subject and the route's operation set locally
// (src/internal/database/postgres/scope.ts). The Nexo API needs only the authenticated download.
const DOWNLOAD = 'storage.object.get_authenticated';
async function storageAs(operation, sub = '', read = objects) {
  await db.exec('RESET ROLE');
  await db.exec('BEGIN');
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true), set_config('storage.operation', $2, true), set_config('role', 'nexo_reader', true)", [sub, operation]);
    return await read();
  } finally {
    await db.exec('COMMIT');
  }
}

// One order with four versions: v1 superseded by v2, v2 released and current, v3 withdrawn, v4 only built.
// Each combined workbook sits in admin-files at its own path; one other admin-files object (a results TXT) and a
// case-files object carrying the current workbook's name sit next to them.
async function scenario() {
  await as(db, null);
  code = (await db.query("INSERT INTO admin.\"order\"(id, client_id, title) VALUES ($1, $2, 'Nexo synthetic') RETURNING code", [ORDER, C.A])).rows[0].code;
  const versions = [[D.superseded, 1, '1', true], [D.current, 2, '2', true], [D.withdrawn, 3, '3', true], [D.built, 4, '4', false]];
  for (const [ds, version, digit, release] of versions) {
    await db.query(`INSERT INTO admin.dataset(id, client_id, order_id, version, storage_path, sha256, analysis_sha256, analysis_size_bytes, companion_sha256, companion_size_bytes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 100, $8, 50)`, [ds, C.A, ORDER, version, pathOf(code, sha(digit)), sha(digit), sha('9'), sha('7')]);
    await db.query('INSERT INTO storage.objects(bucket_id, name) VALUES ($1, $2)', ['admin-files', pathOf(code, sha(digit))]);
    if (!release) continue;
    await db.query("INSERT INTO admin.signature(client_id, dataset_id, user_id, role) VALUES ($1, $2, $3, 'prepared'), ($1, $2, $4, 'approved')", [C.A, ds, U.owner, U.admin]);
    await db.query("UPDATE admin.dataset SET status = 'released' WHERE id = $1", [ds]);
  }
  await db.query('INSERT INTO storage.objects(bucket_id, name) VALUES ($1, $2), ($3, $4)',
    ['admin-files', `${C.A}/${code}/results/${sha('a')}.txt`, 'case-files', pathOf(code, sha('2'))]);
  await as(db, U.owner);
  await db.query('SELECT admin.supersede_dataset($1, $2)', [D.superseded, D.current]);
  await db.query("SELECT admin.withdraw_dataset($1, 'synthetic: wrong metadata')", [D.withdrawn]);
  await as(db, null);
}

describe('0009: nexo_reader', () => {
  beforeEach(async () => { db = await freshDb(); });

  test('the role cannot log in, holds no other role and is granted only to authenticator', async () => {
    const role = (await db.query("SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication FROM pg_roles WHERE rolname = 'nexo_reader'")).rows[0];
    expect(role).toEqual({ rolcanlogin: false, rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false, rolreplication: false });
    const memberOf = (await db.query("SELECT r.rolname FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid WHERE m.member = 'nexo_reader'::regrole")).rows;
    expect(memberOf).toEqual([]);
    const members = (await db.query("SELECT u.rolname FROM pg_auth_members m JOIN pg_roles u ON u.oid = m.member WHERE m.roleid = 'nexo_reader'::regrole ORDER BY 1")).rows.map((r) => r.rolname);
    expect(members).toEqual(['authenticator']);
    expect((await db.query("SELECT pg_has_role('authenticated', 'nexo_reader', 'USAGE') AS app, pg_has_role('nexo_reader', 'authenticated', 'USAGE') AS up")).rows[0])
      .toEqual({ app: false, up: false });
  });

  test('admin.nexo_dataset is SECURITY DEFINER, pins search_path and runs for nexo_reader only', async () => {
    const f = (await db.query(`SELECT prosecdef, proconfig, proacl::text AS acl,
        has_function_privilege('nexo_reader', oid, 'EXECUTE') AS nexo, has_function_privilege('authenticated', oid, 'EXECUTE') AS app,
        has_function_privilege('anon', oid, 'EXECUTE') AS anon, pg_get_function_result(oid) AS result
      FROM pg_proc WHERE oid = 'admin.nexo_dataset(uuid)'::regprocedure`)).rows[0];
    expect(f.prosecdef).toBe(true);
    expect(f.proconfig.join(',')).toMatch(/^search_path=pg_catalog, ?admin$/);
    expect(f.acl).not.toMatch(/(^|[{,])=X/);
    expect({ nexo: f.nexo, app: f.app, anon: f.anon }).toEqual({ nexo: true, app: false, anon: false });
    expect(f.result).toBe('TABLE(dataset_id uuid, order_code text, version integer, storage_path text, sha256 text)');
  });

  test('nexo_reader has no privilege on any admin or Team table, executes no other admin function and only reads storage.objects', async () => {
    const tables = (await db.query(`SELECT n.nspname || '.' || c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'v', 'm', 'p') AND (n.nspname = 'admin' OR (n.nspname = 'public' AND c.relname LIKE 'pilot\\_%'))
        AND has_table_privilege('nexo_reader', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')`)).rows;
    expect(tables).toEqual([]);
    const columns = (await db.query(`SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'admin'::regnamespace AND c.relkind = 'r'
        AND has_any_column_privilege('nexo_reader', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')`)).rows;
    expect(columns).toEqual([]);
    const sequences = (await db.query(`SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'admin'::regnamespace
        AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege('nexo_reader', c.oid, 'USAGE, SELECT, UPDATE') ELSE false END`)).rows;
    expect(sequences).toEqual([]);
    const functions = (await db.query(`SELECT p.oid::regprocedure::text AS f FROM pg_proc p
      WHERE p.pronamespace IN ('admin'::regnamespace, 'public'::regnamespace) AND has_function_privilege('nexo_reader', p.oid, 'EXECUTE') ORDER BY 1`)).rows.map((r) => r.f);
    expect(functions).toEqual(['admin.is_nexo_object(text)', 'admin.nexo_dataset(uuid)']);
    const helper = (await db.query("SELECT prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app FROM pg_proc WHERE oid = 'admin.is_nexo_object(text)'::regprocedure")).rows[0];
    expect(helper.prosecdef).toBe(true);
    expect(helper.proconfig.join(',')).toMatch(/^search_path=pg_catalog, ?admin$/);
    expect(helper.app).toBe(false);
    const storage = (await db.query(`SELECT
        has_table_privilege('nexo_reader', 'storage.objects', 'SELECT') AS read,
        has_table_privilege('nexo_reader', 'storage.objects', 'INSERT, UPDATE, DELETE, TRUNCATE') AS write,
        has_table_privilege('nexo_reader', 'storage.buckets', 'SELECT, INSERT, UPDATE, DELETE') AS buckets`)).rows[0];
    expect(storage).toEqual({ read: true, write: false, buckets: false });
  });
});

describe('0009: admin.nexo_dataset', () => {
  beforeEach(async () => { db = await freshDb(); await scenario(); });

  test('returns the released, current dataset with its order code, version, path and digest', async () => {
    await asNexo();
    expect(await nexoDataset(D.current)).toEqual([{ dataset_id: D.current, order_code: code, version: 2, storage_path: pathOf(code, sha('2')), sha256: sha('2') }]);
  });

  test('built, withdrawn, superseded, unknown and null ids give no row', async () => {
    await asNexo();
    for (const ds of [D.built, D.withdrawn, D.superseded, D.unknown, null]) expect(await nexoDataset(ds), String(ds)).toEqual([]);
  });

  test('a version withdrawn after release stops answering at once', async () => {
    await as(db, U.owner);
    await db.query("SELECT admin.withdraw_dataset($1, 'synthetic: pulled')", [D.current]);
    await asNexo();
    expect(await nexoDataset(D.current)).toEqual([]);
  });

  test('the app role (lab staff and client members alike) cannot call it', async () => {
    for (const u of [U.owner, U.operator, U.aAdmin]) {
      await as(db, u);
      await expect(nexoDataset(D.current), u).rejects.toThrow(/permission denied for function nexo_dataset/);
    }
  });

  test('nexo_reader cannot read admin tables or call staff RPCs, even with a lab owner\'s id as its subject', async () => {
    for (const sub of ['', U.owner]) {
      await asNexo(sub);
      for (const table of ['"order"', 'dataset', 'client', 'signature', 'lab_staff', 'audit_event']) {
        await expect(db.query(`SELECT 1 FROM admin.${table} LIMIT 1`), `${table} as ${sub}`).rejects.toThrow(/permission denied for table/);
      }
      await expect(db.query('SELECT 1 FROM public.pilot_projects LIMIT 1')).rejects.toThrow(/permission denied for table/);
      const calls = [
        ["SELECT admin.sign_dataset($1, 'reviewed', 'x')", [D.built]],
        ["SELECT admin.withdraw_dataset($1, 'x')", [D.current]],
        ['SELECT admin.supersede_dataset($1, $2)', [D.superseded, D.current]],
        ["SELECT admin.release_dataset($1, 'p', $2, 1, 'a.xlsx', 'c.xlsx')", [D.built, sha('9')]],
        ['SELECT admin.is_lab_staff($1)', [U.owner]],
      ];
      for (const [sql, params] of calls) await expect(db.query(sql, params), sql).rejects.toThrow(/permission denied for function/);
    }
    await as(db, null);
    expect((await db.query('SELECT status FROM admin.dataset WHERE id = $1', [D.current])).rows[0].status).toBe('released');
  });
});

describe('0009: storage policy for nexo_reader', () => {
  beforeEach(async () => { db = await freshDb(); await scenario(); });

  test('an authenticated download (storage.object.get_authenticated) sees exactly the workbook of the released, current dataset', async () => {
    for (const sub of ['', U.owner]) {
      expect(await storageAs(DOWNLOAD, sub, () => db.query('SELECT storage.operation() AS op').then((r) => r.rows[0].op))).toBe(DOWNLOAD);
      expect(await storageAs(DOWNLOAD, sub), sub).toEqual([{ bucket_id: 'admin-files', name: pathOf(code, sha('2')) }]);
    }
  });

  test('signing a URL, single or bulk, finds no object (a signed URL would outlive withdrawal and supersession)', async () => {
    for (const op of ['storage.object.sign', 'storage.object.sign_many']) expect(await storageAs(op), op).toEqual([]);
  });

  test('listing, object info, other routes and no operation at all find no object', async () => {
    const others = ['storage.object.list', 'storage.object.list_v2', 'storage.object.info_authenticated', 'object.get_authenticated_info',
      'object.head_authenticated_info', 'storage.object.get_public', 'storage.object.copy', 'storage.object.move', 'object.get_authenticated', ''];
    for (const op of others) expect(await storageAs(op), op).toEqual([]);
    await asNexo();
    expect(await objects()).toEqual([]);
  });

  test('a download that worked stops once the dataset is withdrawn', async () => {
    expect(await storageAs(DOWNLOAD)).toHaveLength(1);
    await as(db, U.owner);
    await db.query("SELECT admin.withdraw_dataset($1, 'synthetic: pulled')", [D.current]);
    expect(await storageAs(DOWNLOAD)).toEqual([]);
  });

  test('a download that worked stops once the dataset is superseded; the released replacement downloads instead', async () => {
    expect(await storageAs(DOWNLOAD)).toEqual([{ bucket_id: 'admin-files', name: pathOf(code, sha('2')) }]);
    await as(db, null);
    await db.query("INSERT INTO admin.signature(client_id, dataset_id, user_id, role) VALUES ($1, $2, $3, 'prepared'), ($1, $2, $4, 'approved')", [C.A, D.built, U.owner, U.admin]);
    await db.query("UPDATE admin.dataset SET status = 'released' WHERE id = $1", [D.built]);
    await as(db, U.owner);
    await db.query('SELECT admin.supersede_dataset($1, $2)', [D.current, D.built]);
    expect(await storageAs(DOWNLOAD)).toEqual([{ bucket_id: 'admin-files', name: pathOf(code, sha('4')) }]);
  });

  test('cannot write, overwrite or delete any object', async () => {
    await asNexo();
    await expect(db.query("INSERT INTO storage.objects(bucket_id, name) VALUES ('admin-files', $1)", [`${C.A}/${code}/datasets/new.xlsx`]))
      .rejects.toThrow(/permission denied for table objects/);
    await expect(db.query("UPDATE storage.objects SET metadata = '{}' WHERE name = $1", [pathOf(code, sha('2'))])).rejects.toThrow(/permission denied for table objects/);
    await expect(db.query('DELETE FROM storage.objects WHERE name = $1', [pathOf(code, sha('2'))])).rejects.toThrow(/permission denied for table objects/);
    await as(db, null);
    expect((await db.query('SELECT count(*)::int AS n FROM storage.objects')).rows[0].n).toBe(6);
  });

  test('lab staff and client members keep their own rules (the new policy is for nexo_reader only)', async () => {
    await as(db, U.operator);
    expect((await objects()).filter((o) => o.bucket_id === 'admin-files')).toHaveLength(5);
    await as(db, U.aAdmin);
    expect((await objects()).filter((o) => o.bucket_id === 'admin-files')).toEqual([]);
  });
});
