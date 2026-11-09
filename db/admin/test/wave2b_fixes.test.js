// Wave 2b fixes (0008_wave2b_fixes.sql, docs/admin/wave2b-review.md findings 1, 3 and 7). Synthetic data only.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, count, id, U, C } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const sha = (c) => c.repeat(64);
const MANIFEST = { sha256: sha('b'), analysis_sha256: sha('9'), analysis_size_bytes: 1234, companion_sha256: sha('7'), companion_size_bytes: 99 };
// The combined workbook lives in admin-files at <client_id>/<order_code>/datasets/<its sha256>/<name>.xlsx.
const pathOf = (order, client, m = MANIFEST) => `${client}/${order.code}/datasets/${m.sha256}/dataset-v1.xlsx`;

const accept = (oid) => db.query("SELECT admin.accept_result_file($1, 'results/synthetic.txt', $2, '3.4.5', 'Global v1', '{\"analytes\": 42}'::jsonb) AS id", [oid, sha('a')]).then((r) => r.rows[0].id);
const build = (order, client, rf, { expected = 1, m = MANIFEST, path = pathOf(order, client, m) } = {}) =>
  db.query('SELECT admin.build_dataset($1, $2, $3, $4, $5, $6, $7, $8, $9) AS id',
    [order.id, rf, expected, path, m.sha256, m.analysis_sha256, m.analysis_size_bytes, m.companion_sha256, m.companion_size_bytes]).then((r) => r.rows[0].id);
const sign = (ds, role = 'reviewed') => db.query("SELECT admin.sign_dataset($1, $2, 'synthetic') AS id", [ds, role]).then((r) => r.rows[0].id);
const release = (ds, project, m = MANIFEST) => db.query("SELECT admin.release_dataset($1, $2, $3, $4, 'analysis.xlsx', 'companion.xlsx') AS id",
  [ds, `${project}/${m.analysis_sha256}`, m.analysis_sha256, m.analysis_size_bytes]).then((r) => r.rows[0].id);
const supersede = (ds, by) => db.query('SELECT admin.supersede_dataset($1, $2)', [ds, by]);
const row = async (ds) => {
  await as(db, null);
  return (await db.query('SELECT status, version, result_file_id, storage_path, sha256, analysis_sha256, archived_at IS NOT NULL AS archived FROM admin.dataset WHERE id = $1', [ds])).rows[0];
};
const priv = async (q) => (await db.query(`SELECT ${q} AS ok`)).rows[0].ok;

async function processedOrder(client = C.A) {
  await as(db, U.operator);
  const order = (await db.query("INSERT INTO admin.\"order\"(client_id, title) VALUES ($1, 'Fixes synthetic') RETURNING id, code", [client])).rows[0];
  return { order, rf: await accept(order.id), client };
}
async function signTwice(ds) {
  await as(db, U.owner); await sign(ds, 'prepared');
  await as(db, U.admin); await sign(ds, 'approved');
}

describe('finding 1: build_dataset is the only way a dataset is created, and its content never changes', () => {
  test('effective privileges: no INSERT on dataset, and of its columns only archived_at/archived_reason are updatable', async () => {
    expect(await priv("has_table_privilege('authenticated', 'admin.dataset', 'INSERT')")).toBe(false);
    expect(await priv("has_table_privilege('authenticated', 'admin.dataset', 'UPDATE')")).toBe(false);
    expect(await priv("has_table_privilege('authenticated', 'admin.dataset', 'SELECT')")).toBe(true);
    const columns = (await db.query("SELECT attname FROM pg_attribute WHERE attrelid = 'admin.dataset'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum")).rows.map((r) => r.attname);
    expect(columns).toContain('result_file_id');
    for (const col of columns) {
      expect(await priv(`has_column_privilege('authenticated', 'admin.dataset', '${col}', 'INSERT')`), `INSERT ${col}`).toBe(false);
      expect(await priv(`has_column_privilege('authenticated', 'admin.dataset', '${col}', 'UPDATE')`), `UPDATE ${col}`)
        .toBe(['archived_at', 'archived_reason'].includes(col));
    }
    expect(await count(db, "SELECT 1 FROM pg_policies WHERE schemaname = 'admin' AND tablename = 'dataset' AND cmd = 'INSERT'")).toBe(0);
  });

  test('the review probe: a direct insert of a dataset over a merely parsed file of no order is refused to every lab role', async () => {
    const { order } = await processedOrder();
    for (const u of [U.operator, U.admin, U.owner]) {
      await as(db, u);
      await expect(db.query(`INSERT INTO admin.dataset(client_id, order_id, result_file_id, version, storage_path, sha256, analysis_sha256, analysis_size_bytes, companion_sha256, companion_size_bytes)
        VALUES ($1, $2, $3, 99, '', $4, $5, 1, $6, 1)`, [C.A, order.id, id(405), sha('b'), sha('9'), sha('7')]), u).rejects.toThrow(/permission denied/);
    }
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.dataset WHERE order_id = $1', [order.id])).toBe(0);
  });

  test('before signing, source, version, paths and manifest cannot be replaced; archiving a discarded build still can', async () => {
    const { order, rf, client } = await processedOrder();
    await as(db, U.operator);
    const ds = await build(order, client, rf);
    const before = await row(ds);
    const swaps = [['result_file_id', id(405)], ['version', 99], ['storage_path', 'elsewhere.xlsx'], ['sha256', sha('c')], ['analysis_sha256', sha('c')],
      ['analysis_size_bytes', 1], ['companion_sha256', sha('c')], ['companion_size_bytes', 1], ['dataset_format', 2], ['value_type', 'normalised'],
      ['order_id', id(101)], ['client_id', C.B]];
    for (const u of [U.operator, U.owner]) {
      await as(db, u);
      for (const [col, value] of swaps) {
        await expect(db.query(`UPDATE admin.dataset SET ${col} = $2 WHERE id = $1`, [ds, value]), `${u} ${col}`).rejects.toThrow(/permission denied/);
      }
    }
    // The table rule holds for every writer, the migration owner (and any SECURITY DEFINER function) included.
    await as(db, null);
    for (const [col, value] of swaps.filter(([col]) => !['order_id', 'client_id'].includes(col))) {
      await expect(db.query(`UPDATE admin.dataset SET ${col} = $2 WHERE id = $1`, [ds, value]), col).rejects.toThrow(/content cannot change/);
    }
    expect(await row(ds)).toEqual(before);
    // The checked build still signs and releases.
    await signTwice(ds);
    expect(await release(ds, id(900))).toBe(id(900));
    // A second, discarded build is archived through the archive columns.
    await as(db, U.operator);
    const v2 = await build(order, client, rf, { expected: 2, m: { ...MANIFEST, sha256: sha('c') } });
    await db.query("UPDATE admin.dataset SET archived_at = now(), archived_reason = 'discarded' WHERE id = $1", [v2]);
    expect(await row(v2)).toMatchObject({ status: 'built', archived: true });
  });

  test('build_dataset records the combined workbook only at <client_id>/<order_code>/datasets/<sha256>/<name>.xlsx', async () => {
    const { order, rf, client } = await processedOrder();
    await as(db, U.operator);
    for (const path of ['', 'datasets/v1.xlsx', `${C.B}/${order.code}/datasets/${MANIFEST.sha256}/dataset-v1.xlsx`, `${client}/ORD999/datasets/${MANIFEST.sha256}/dataset-v1.xlsx`,
      `${client}/${order.code}/datasets/${sha('c')}/dataset-v1.xlsx`, `${client}/${order.code}/datasets/${MANIFEST.sha256}/x/dataset-v1.xlsx`,
      `${client}/${order.code}/datasets/${MANIFEST.sha256}/dataset-v1.txt`, `${client}/${order.code}/datasets/${MANIFEST.sha256}/../dataset-v1.xlsx`]) {
      await expect(build(order, client, rf, { path }), path).rejects.toThrow(/storage_path/);
    }
    await expect(build(order, client, rf, { m: { ...MANIFEST, sha256: 'B'.repeat(64) } })).rejects.toThrow(/sha256/);
    expect((await row(await build(order, client, rf))).storage_path).toBe(pathOf(order, client));
  });
});

describe('finding 7: the version written into the files is the version the database records', () => {
  test('build_dataset takes the version the caller built for and refuses a stale one under the order lock', async () => {
    const { order, rf, client } = await processedOrder();
    await as(db, U.operator);
    await expect(build(order, client, rf, { expected: 2 })).rejects.toThrow(/version 1 is next.*built for version 2/);
    await expect(build(order, client, rf, { expected: null })).rejects.toThrow(/expected version/);
    const v1 = await build(order, client, rf, { expected: 1 });
    // A second build that read "next is 1" before v1 was recorded is refused (PT409, rebuild), not renumbered.
    const err = await build(order, client, rf, { expected: 1, m: { ...MANIFEST, sha256: sha('c') } }).catch((e) => e);
    expect(err.code).toBe('PT409');
    expect(err.message).toMatch(/version 2 is next.*built for version 1/);
    const v2 = await build(order, client, rf, { expected: 2, m: { ...MANIFEST, sha256: sha('c') } });
    expect([(await row(v1)).version, (await row(v2)).version]).toEqual([1, 2]);
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.dataset WHERE order_id = $1', [order.id])).toBe(2);
  });

  test('the eight-argument build_dataset without an expected version is gone', async () => {
    expect(await priv("to_regprocedure('admin.build_dataset(uuid, uuid, text, text, text, bigint, text, bigint)') IS NULL")).toBe(true);
    const r = (await db.query("SELECT prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app, proacl::text AS acl FROM pg_proc WHERE oid = 'admin.build_dataset(uuid, uuid, int, text, text, text, bigint, text, bigint)'::regprocedure")).rows[0];
    expect(r.prosecdef).toBe(true);
    expect(r.proconfig.join(',')).toMatch(/^search_path=pg_catalog, ?admin$/);
    expect(r.app).toBe(true);
    expect(r.acl).not.toMatch(/(^|[{,])=X/);
  });
});

describe('finding 3: supersede needs a live released replacement, and a released dataset is retired only by the functions', () => {
  async function twoReleased() {
    const { order, rf, client } = await processedOrder();
    await as(db, U.operator);
    const v1 = await build(order, client, rf);
    await signTwice(v1);
    await release(v1, id(900));
    const m2 = { ...MANIFEST, sha256: sha('c'), analysis_sha256: sha('8') };
    await as(db, U.operator);
    const v2 = await build(order, client, rf, { expected: 2, m: m2 });
    await signTwice(v2);
    await release(v2, id(901), m2);
    return { v1, v2 };
  }

  test('the review probe: an Operator cannot archive a released version through the archive columns', async () => {
    const { v2 } = await twoReleased();
    for (const u of [U.operator, U.admin]) {
      await as(db, u);
      await expect(db.query("UPDATE admin.dataset SET archived_at = now(), archived_reason = 'gone' WHERE id = $1", [v2]), u).rejects.toThrow(/withdraw_dataset or supersede_dataset/);
    }
    await as(db, null); // not even the migration owner
    await expect(db.query("UPDATE admin.dataset SET archived_at = now(), archived_reason = 'gone' WHERE id = $1", [v2])).rejects.toThrow(/withdraw_dataset or supersede_dataset/);
    await expect(db.query("UPDATE admin.dataset SET status = 'withdrawn' WHERE id = $1", [v2])).rejects.toThrow(/archived/);
    expect(await row(v2)).toMatchObject({ status: 'released', archived: false });
  });

  test('an archived replacement is refused even when it still reads released', async () => {
    const { v1, v2 } = await twoReleased();
    await as(db, null);
    // Only a pre-0008 row can be released and archived at once; build one by switching the guard off for this statement.
    await db.exec('ALTER TABLE admin.dataset DISABLE TRIGGER guard');
    await db.query("UPDATE admin.dataset SET archived_at = now(), archived_reason = 'archived before 0008' WHERE id = $1", [v2]);
    await db.exec('ALTER TABLE admin.dataset ENABLE TRIGGER guard');
    await as(db, U.admin);
    await expect(supersede(v1, v2)).rejects.toThrow(/archived; a dataset is superseded only by a live released version/);
    expect(await row(v1)).toMatchObject({ status: 'released', archived: false });
  });

  test('a withdrawn replacement is refused; a live released one still supersedes', async () => {
    const { v1, v2 } = await twoReleased();
    await as(db, U.admin);
    await db.query("SELECT admin.withdraw_dataset($1, 'wrong metadata')", [v2]);
    await expect(supersede(v1, v2)).rejects.toThrow(/is withdrawn; a dataset is superseded only by a live released version/);
    expect(await row(v1)).toMatchObject({ status: 'released', archived: false });
  });

  test('supersede locks both versions in one order (by id), whichever is passed first', async () => {
    const src = (await db.query("SELECT prosrc FROM pg_proc WHERE oid = 'admin.supersede_dataset(uuid, uuid)'::regprocedure")).rows[0].prosrc;
    expect(src).toMatch(/WHERE id IN \(p_dataset_id, p_new_dataset_id\)\s+ORDER BY id\s+FOR UPDATE/);
    const { v1, v2 } = await twoReleased();
    await as(db, U.admin);
    await supersede(v1, v2);
    expect(await row(v1)).toMatchObject({ status: 'superseded', archived: true });
    expect(await row(v2)).toMatchObject({ status: 'released', archived: false });
  });
});
