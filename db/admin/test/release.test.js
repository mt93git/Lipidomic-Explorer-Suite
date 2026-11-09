// Wave 2b, release side (0007_release.sql): build_dataset, withdraw_dataset, supersede_dataset and the
// pre-release upload of the analysis file to Team's bucket. Synthetic data only.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, count, id, U, C } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); orders.clear(); });
afterEach(async () => { await db?.close(); });

const sha = (c) => c.repeat(64);
// What the app records when it builds: the combined workbook and the two files it is split into.
const MANIFEST = { sha256: sha('b'), analysis_sha256: sha('9'), analysis_size_bytes: 1234, companion_sha256: sha('7'), companion_size_bytes: 99 };

const accept = (oid) => db.query("SELECT admin.accept_result_file($1, 'results/synthetic.txt', $2, '3.4.5', 'Global v1', '{\"analytes\": 42}'::jsonb) AS id", [oid, sha('a')]).then((r) => r.rows[0].id);
// build_dataset (0008): the version the files were built for, and the combined workbook at
// <client_id>/<order_code>/datasets/<sha256>/dataset-v1.xlsx. orderKey(oid) looks the order up as the migration owner.
const orders = new Map();
const pathFor = (oid, m = MANIFEST) => { const o = orders.get(oid); return o ? `${o.client}/${o.code}/datasets/${m.sha256}/dataset-v1.xlsx` : 'unknown-order.xlsx'; };
const build = (oid, rf, m = MANIFEST, path = pathFor(oid, m), expected = orders.get(oid)?.next ?? 1) =>
  db.query('SELECT admin.build_dataset($1, $2, $3, $4, $5, $6, $7, $8, $9) AS id',
    [oid, rf, expected, path, m.sha256, m.analysis_sha256, m.analysis_size_bytes, m.companion_sha256, m.companion_size_bytes])
    .then((r) => { const o = orders.get(oid); if (o) o.next += 1; return r.rows[0].id; });
const sign = (ds, role = 'reviewed') => db.query("SELECT admin.sign_dataset($1, $2, 'synthetic') AS id", [ds, role]).then((r) => r.rows[0].id);
const release = (ds, project, m = MANIFEST) => db.query("SELECT admin.release_dataset($1, $2, $3, $4, 'analysis.xlsx', 'companion.xlsx') AS id",
  [ds, `${project}/${m.analysis_sha256}`, m.analysis_sha256, m.analysis_size_bytes]).then((r) => r.rows[0].id);
const withdraw = (ds, reason) => db.query('SELECT admin.withdraw_dataset($1, $2)', [ds, reason]);
const supersede = (ds, by) => db.query('SELECT admin.supersede_dataset($1, $2)', [ds, by]);
const row = async (ds) => {
  await as(db, null);
  return (await db.query('SELECT status, version, project_id, archived_at IS NOT NULL AS archived, archived_reason FROM admin.dataset WHERE id = $1', [ds])).rows[0];
};
const stage = async (oid) => { await as(db, null); return (await db.query('SELECT stage FROM admin."order" WHERE id = $1', [oid])).rows[0].stage; };
const actors = async (where, params) => { await as(db, null); return (await db.query(`SELECT actor FROM admin.audit_event WHERE ${where} ORDER BY id`, params)).rows.map((r) => r.actor); };

// A fresh order with an accepted results file (stage processed), as the operator.
async function processedOrder(client = C.A) {
  await as(db, U.operator);
  const order = (await db.query("INSERT INTO admin.\"order\"(client_id, title) VALUES ($1, 'Release synthetic') RETURNING id, code", [client])).rows[0];
  orders.set(order.id, { client, code: order.code, next: 1 });
  const rf = await accept(order.id);
  return { order, rf };
}
// ... built as version 1 and released under the default policy (a lab owner and a lab admin sign).
async function releasedOrder(project = id(900), client = C.A) {
  const { order, rf } = await processedOrder(client);
  const ds = await build(order.id, rf);
  await as(db, U.owner); await sign(ds, 'prepared');
  await as(db, U.admin); await sign(ds, 'approved');
  expect(await release(ds, project)).toBe(project);
  return { order, rf, ds, project };
}

describe('0007: build, withdraw, supersede', () => {
  test('the new functions are SECURITY DEFINER, pin search_path, run for authenticated but not PUBLIC', async () => {
    const names = ['build_dataset', 'withdraw_dataset', 'supersede_dataset', 'is_pending_analysis_path'];
    const rows = (await db.query("SELECT proname, prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app, proacl::text AS acl FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname = ANY($1)", [names])).rows;
    expect(rows.map((r) => r.proname).sort()).toEqual([...names].sort());
    for (const r of rows) {
      expect(r.prosecdef, r.proname).toBe(true);
      expect(r.proconfig.join(','), r.proname).toMatch(/^search_path=pg_catalog, ?admin$/);
      expect(r.app, r.proname).toBe(true);
      expect(r.acl, r.proname).not.toMatch(/(^|[{,])=X/);
    }
  });

  test('build_dataset records the manifest, numbers versions per order and moves the order to Excel built', async () => {
    const { order, rf } = await processedOrder();
    expect(await stage(order.id)).toBe('processed');
    await as(db, U.operator);
    const v1 = await build(order.id, rf);
    await as(db, null);
    const r = (await db.query('SELECT client_id, order_id, result_file_id, version, status, storage_path, sha256, analysis_sha256, analysis_size_bytes, companion_sha256, companion_size_bytes, project_id, released_at FROM admin.dataset WHERE id = $1', [v1])).rows[0];
    expect(r).toEqual({ client_id: C.A, order_id: order.id, result_file_id: rf, version: 1, status: 'built', storage_path: `${C.A}/${order.code}/datasets/${MANIFEST.sha256}/dataset-v1.xlsx`, ...MANIFEST, project_id: null, released_at: null });
    expect(await stage(order.id)).toBe('excel_built');
    expect(await actors("entity = 'dataset' AND action = 'INSERT' AND entity_id = $1", [v1])).toEqual([U.operator]);
    expect(await actors("entity = 'order' AND entity_id = $1 AND after->>'stage' = 'excel_built'", [order.id])).toEqual([U.operator]);

    // A second build of the same order is version 2; the manifest it records is what signing needs.
    await as(db, U.operator);
    const v2 = await build(order.id, rf, { ...MANIFEST, sha256: sha('c') });
    expect(await row(v2)).toMatchObject({ version: 2, status: 'built' });
    await as(db, U.owner);
    await sign(v2);
    // Another order starts at version 1 again, and building never moves an order back.
    const other = await processedOrder(C.B);
    await as(db, U.operator);
    expect((await row(await build(other.order.id, other.rf))).version).toBe(1);
    expect(await stage(order.id)).toBe('excel_built');
  });

  test('build_dataset refuses callers outside the lab, a file of another order, a file not accepted, a bad or incomplete manifest, and inserts nothing', async () => {
    const { order, rf } = await processedOrder();
    for (const u of [U.aAdmin, U.aReq, U.aView, U.member]) {
      await as(db, u);
      await expect(build(order.id, rf), u).rejects.toThrow(/lab staff/);
    }
    const other = await processedOrder(C.B);
    await as(db, U.operator);
    await expect(build(order.id, other.rf)).rejects.toThrow(/not accepted for order/);
    await expect(build(order.id, id(405))).rejects.toThrow(/not accepted for order/); // the seed's batch file, accepted for no order
    await expect(build(order.id, id(999))).rejects.toThrow(/not found/);
    await expect(build(id(999), rf)).rejects.toThrow(/not found/);
    await expect(build(order.id, rf, { ...MANIFEST, analysis_sha256: null })).rejects.toThrow(/sha256 and size/);
    await expect(build(order.id, rf, { ...MANIFEST, companion_size_bytes: null })).rejects.toThrow(/sha256 and size/);
    await expect(build(order.id, rf, { ...MANIFEST, sha256: 'not-a-digest' })).rejects.toThrow(/p_sha256 must be/);
    await expect(build(order.id, rf, { ...MANIFEST, analysis_size_bytes: 0 })).rejects.toThrow(/check constraint/);
    await expect(build(order.id, rf, MANIFEST, '  ')).rejects.toThrow(/storage_path/);
    await db.query("UPDATE admin.result_file SET status = 'superseded' WHERE id = $1", [rf]);
    await expect(build(order.id, rf)).rejects.toThrow(/is superseded; only an accepted/);
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.dataset WHERE order_id = $1', [order.id])).toBe(0);
    expect(await stage(order.id)).toBe('processed');
  });

  test('build, sign twice, release: the manifest build_dataset recorded is what release publishes', async () => {
    const { order, ds, project } = await releasedOrder();
    expect(await row(ds)).toMatchObject({ status: 'released', version: 1, project_id: project, archived: false });
    expect(await stage(order.id)).toBe('released');
    expect((await db.query('SELECT sha256, size_bytes FROM public.pilot_files WHERE project_id = $1', [project])).rows)
      .toEqual([{ sha256: MANIFEST.analysis_sha256, size_bytes: MANIFEST.analysis_size_bytes }]);
  });

  test('withdraw_dataset needs an eligible signer and a reason; it freezes the released dataset as withdrawn and leaves the Team project in place', async () => {
    const { order, rf, ds, project } = await releasedOrder();
    await as(db, U.operator); // not eligible under the default policy
    await expect(withdraw(ds, 'wrong metadata')).rejects.toThrow(/not an eligible/);
    await as(db, U.aAdmin);
    await expect(withdraw(ds, 'wrong metadata')).rejects.toThrow(/not an eligible/);
    await as(db, U.admin);
    await expect(withdraw(ds, '  ')).rejects.toThrow(/needs a reason/);
    await expect(withdraw(ds, null)).rejects.toThrow(/needs a reason/);
    await expect(withdraw(id(999), 'x')).rejects.toThrow(/not found/);
    await as(db, U.operator);
    const v2 = await build(order.id, rf, { ...MANIFEST, sha256: sha('c') });
    await as(db, U.admin);
    await expect(withdraw(v2, 'not released yet')).rejects.toThrow(/is built; only a released dataset/);
    expect(await row(ds)).toMatchObject({ status: 'released', archived: false });

    await as(db, U.admin);
    await withdraw(ds, '  wrong sample metadata  ');
    expect(await row(ds)).toMatchObject({ status: 'withdrawn', archived: true, archived_reason: 'wrong sample metadata', project_id: project });
    await as(db, U.admin);
    await expect(withdraw(ds, 'again')).rejects.toThrow(/is withdrawn; only a released dataset/);
    await expect(db.query("UPDATE admin.dataset SET status = 'released' WHERE id = $1", [ds])).rejects.toThrow(/permission denied/);
    await as(db, null);
    await expect(db.query("UPDATE admin.dataset SET status = 'released' WHERE id = $1", [ds])).rejects.toThrow(/frozen/); // not even the owner
    expect(await count(db, 'SELECT 1 FROM public.pilot_projects WHERE id = $1', [project])).toBe(1); // Admin never removes Team rows
    expect(await count(db, 'SELECT 1 FROM public.pilot_files WHERE project_id = $1', [project])).toBe(1);
    expect(await stage(order.id)).toBe('released'); // a stage never moves back on its own
    expect(await actors("entity = 'dataset' AND entity_id = $1 AND after->>'status' = 'withdrawn'", [ds])).toEqual([U.admin]);
  });

  test('supersede_dataset retires a released version in favour of a newer released version of the same order', async () => {
    const { order, rf, ds: v1, project } = await releasedOrder();
    await as(db, U.operator);
    const v2 = await build(order.id, rf, { ...MANIFEST, sha256: sha('c'), analysis_sha256: sha('8') });
    await as(db, U.admin);
    await expect(supersede(v1, v2)).rejects.toThrow(/version 2\) is built; a dataset is superseded only by a live released version/);
    await as(db, U.owner); await sign(v2, 'prepared');
    await as(db, U.admin); await sign(v2, 'approved');
    const project2 = id(901);
    expect(await release(v2, project2, { ...MANIFEST, analysis_sha256: sha('8') })).toBe(project2);
    const foreign = await releasedOrder(id(902), C.B);

    await as(db, U.operator); // not eligible
    await expect(supersede(v1, v2)).rejects.toThrow(/not an eligible/);
    await as(db, U.admin);
    await expect(supersede(v1, v1)).rejects.toThrow(/itself/);
    await expect(supersede(v1, foreign.ds)).rejects.toThrow(/another order/);
    await expect(supersede(v2, v1)).rejects.toThrow(/version 1\) is not newer than version 2/);
    await expect(supersede(id(999), v2)).rejects.toThrow(/not found/);
    await expect(supersede(v1, id(999))).rejects.toThrow(/not found/);
    expect(await row(v1)).toMatchObject({ status: 'released', archived: false });

    await as(db, U.admin);
    await supersede(v1, v2);
    expect(await row(v1)).toMatchObject({ status: 'superseded', archived: true, archived_reason: `superseded by version 2 (${v2})`, project_id: project });
    expect(await row(v2)).toMatchObject({ status: 'released', archived: false, project_id: project2 });
    await as(db, U.admin);
    await expect(supersede(v1, v2)).rejects.toThrow(/is superseded; only a released dataset/);
    await expect(withdraw(v1, 'late')).rejects.toThrow(/is superseded; only a released dataset/);
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM public.pilot_projects WHERE id IN ($1, $2)', [project, project2])).toBe(2); // both Team projects stay
    expect(await stage(order.id)).toBe('released');
    expect(await actors("entity = 'dataset' AND entity_id = $1 AND after->>'status' = 'superseded'", [v1])).toEqual([U.admin]);
  });

  test('an eligible signer stages the pending analysis file in case-files at <project_id>/<analysis_sha256>; nobody else, nowhere else, and not once released', async () => {
    const { order, rf } = await processedOrder();
    const manifest = { ...MANIFEST, analysis_sha256: sha('f') }; // letters, so case matters below
    const ds = await build(order.id, rf, manifest);
    const project = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const put = (name) => db.query("INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('case-files', $1, auth.uid())", [name]);
    const good = `${project}/${manifest.analysis_sha256}`;
    for (const u of [U.operator, U.aAdmin, U.aReq, U.member]) { // the operator is not eligible under the default policy
      await as(db, u);
      await expect(put(good), u).rejects.toThrow(/row-level security/);
    }
    await as(db, U.owner);
    for (const bad of [`${project}/${sha('e')}`, `${project}/${manifest.sha256}`, `${project}/${manifest.companion_sha256}`, manifest.analysis_sha256,
      `${project}/${manifest.analysis_sha256}/x`, `${project}/${manifest.analysis_sha256.toUpperCase()}`, `${project.toUpperCase()}/${manifest.analysis_sha256}`,
      `${id(900)}/${MANIFEST.analysis_sha256}`]) { // the seed's released datasets carry that digest: not pending
      await expect(put(bad), bad).rejects.toThrow(/row-level security/);
    }
    await as(db, null);
    await db.query("INSERT INTO public.pilot_projects(id, name) VALUES ($1, 'existing project')", [id(950)]);
    await as(db, U.owner);
    await expect(put(`${id(950)}/${manifest.analysis_sha256}`)).rejects.toThrow(/row-level security/); // never into a project that exists
    await put(good);
    await expect(put(good)).rejects.toThrow(/duplicate key/);

    await sign(ds, 'prepared');
    await as(db, U.admin); await sign(ds, 'approved');
    expect(await release(ds, project, manifest)).toBe(project);
    // Released: the digest is no longer pending, so it cannot be staged again under another project id ...
    await expect(put(`${id(902)}/${manifest.analysis_sha256}`)).rejects.toThrow(/row-level security/);
    // ... while Team's own rule still lets a project owner add a file, and a viewer not.
    await put(`${project}/${sha('d')}`);
    await as(db, U.aReq);
    await expect(put(`${project}/${sha('e')}`)).rejects.toThrow(/row-level security/);
    await as(db, null);
    expect(await count(db, "SELECT 1 FROM storage.objects WHERE bucket_id = 'case-files'")).toBe(2);
  });
});
