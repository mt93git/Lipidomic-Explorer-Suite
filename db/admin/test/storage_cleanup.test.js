// 0012_storage_orphan_cleanup.sql: the app may remove, with the caller's own token, an object it uploaded when the
// function that would have recorded it fails. admin-files: lab writers, only objects no admin row refers to.
// case-files: eligible signers, only a pending analysis file (0007's condition). Synthetic data only.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, count, id, U, C } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const sha = (c) => c.repeat(64);
const MANIFEST = { sha256: sha('b'), analysis_sha256: sha('9'), analysis_size_bytes: 1234, companion_sha256: sha('7'), companion_size_bytes: 99 };

// Objects are written as the migration owner (RLS off) unless a test is about the insert itself.
const plant = async (bucket, name) => { await as(db, null); await db.query('INSERT INTO storage.objects(bucket_id, name) VALUES ($1, $2)', [bucket, name]); };
const exists = async (bucket, name) => { await as(db, null); return (await count(db, 'SELECT 1 FROM storage.objects WHERE bucket_id = $1 AND name = $2', [bucket, name])) === 1; };
// What Storage's remove() runs (DELETE ... WHERE bucket_id AND name IN (...) RETURNING): the rows it really removed.
const remove = async (bucket, names) => (await db.query('DELETE FROM storage.objects WHERE bucket_id = $1 AND name = ANY($2) RETURNING name', [bucket, names])).rows.map((r) => r.name);

// A fresh order of client A with an accepted results TXT stored at <client>/<code>/review-1/results.txt.
async function processedOrder() {
  await as(db, U.operator);
  const order = (await db.query("INSERT INTO admin.\"order\"(client_id, title) VALUES ($1, 'Cleanup synthetic') RETURNING id, code", [C.A])).rows[0];
  const folder = `${C.A}/${order.code}`;
  const results = `${folder}/review-1/results.txt`;
  const rf = (await db.query("SELECT admin.accept_result_file($1, $2, $3, '3.4.5', 'Global v1', '{}'::jsonb) AS id", [order.id, results, sha('a')])).rows[0].id;
  return { order, rf, folder, results, next: 1 };
}
const paths = (folder, m = MANIFEST) => ({
  full: `${folder}/datasets/${m.sha256}/dataset-v1.xlsx`, analysis: `${folder}/datasets/${m.analysis_sha256}/analysis.xlsx`, companion: `${folder}/datasets/${m.companion_sha256}/companion.xlsx`,
});
async function build(o, m = MANIFEST) {
  await as(db, U.operator);
  const ds = (await db.query('SELECT admin.build_dataset($1, $2, $3, $4, $5, $6, $7, $8, $9) AS id',
    [o.order.id, o.rf, o.next, paths(o.folder, m).full, m.sha256, m.analysis_sha256, m.analysis_size_bytes, m.companion_sha256, m.companion_size_bytes])).rows[0].id;
  o.next += 1;
  return ds;
}
async function signAndRelease(ds, project, companionPath, m = MANIFEST) {
  await as(db, U.owner); await db.query("SELECT admin.sign_dataset($1, 'prepared', null)", [ds]);
  await as(db, U.admin); await db.query("SELECT admin.sign_dataset($1, 'approved', null)", [ds]);
  await db.query("SELECT admin.release_dataset($1, $2, $3, $4, 'analysis.xlsx', $5)", [ds, `${project}/${m.analysis_sha256}`, m.analysis_sha256, m.analysis_size_bytes, companionPath]);
}

describe('0012: the helper and the policies', () => {
  test('is_referenced_admin_file is SECURITY DEFINER, pins search_path, runs for authenticated only', async () => {
    const f = (await db.query("SELECT prosecdef, proconfig, proacl::text AS acl, has_function_privilege('authenticated', oid, 'EXECUTE') AS app, has_function_privilege('anon', oid, 'EXECUTE') AS anon FROM pg_proc WHERE oid = 'admin.is_referenced_admin_file(text)'::regprocedure")).rows[0];
    expect(f.prosecdef).toBe(true);
    expect(f.proconfig.join(',')).toMatch(/^search_path=pg_catalog, ?admin$/);
    expect({ app: f.app, anon: f.anon }).toEqual({ app: true, anon: false });
    expect(f.acl).not.toMatch(/(^|[{,])=X/);
  });

  test('adds one DELETE policy on admin-files and a SELECT + DELETE pair on case-files; Team\'s own policies are unchanged', async () => {
    const rows = (await db.query("SELECT policyname, cmd, roles::text AS roles FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname")).rows;
    expect(rows.map((r) => [r.policyname, r.cmd])).toEqual([
      ['admin_files_nexo_read', 'SELECT'], ['admin_files_orphan_delete', 'DELETE'], ['admin_files_staff_insert', 'INSERT'], ['admin_files_staff_read', 'SELECT'],
      ['case_files_pending_delete', 'DELETE'], ['case_files_pending_read', 'SELECT'], ['case_files_release_insert', 'INSERT'],
      ['pilot_object_insert', 'INSERT'], ['pilot_object_read', 'SELECT'],
    ]);
    for (const r of rows.filter((r) => /orphan|pending/.test(r.policyname))) expect(r.roles, r.policyname).toBe('{authenticated}');
    // No UPDATE policy anywhere: an object is still never overwritten.
    expect(rows.filter((r) => r.cmd === 'UPDATE' || r.cmd === 'ALL')).toEqual([]);
  });
});

describe('0012: admin-files', () => {
  test('a lab writer removes an object no admin row refers to (a failed build\'s files, an unaccepted TXT)', async () => {
    const o = await processedOrder();
    const writers = { [U.operator]: sha('1'), [U.admin]: sha('2'), [U.owner]: sha('3') };
    for (const [u, digest] of Object.entries(writers)) {
      const orphan = `${o.folder}/datasets/${digest}/dataset-v1.xlsx`;
      const txt = `${o.folder}/unaccepted-${digest.slice(0, 1)}/results.txt`;
      await as(db, u);
      await db.query("INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('admin-files', $1, auth.uid()), ('admin-files', $2, auth.uid())", [orphan, txt]);
      expect((await remove('admin-files', [orphan, txt])).sort(), u).toEqual([orphan, txt].sort());
      expect(await exists('admin-files', orphan), u).toBe(false);
    }
  });

  test('nobody removes an object a dataset (any status, archived included) or a results file refers to', async () => {
    const o = await processedOrder();
    // v1 released (companion_path recorded at release), then withdrawn; v2 built and discarded (archived); v3 built.
    const v1 = await build(o);
    const project = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const releasedCompanion = `${o.folder}/released/v1-companion.xlsx`;
    await signAndRelease(v1, project, releasedCompanion);
    await db.query("SELECT admin.withdraw_dataset($1, 'synthetic')", [v1]);
    const m2 = { ...MANIFEST, sha256: sha('c'), analysis_sha256: sha('d'), companion_sha256: sha('e') };
    const v2 = await build(o, m2);
    await db.query("UPDATE admin.dataset SET archived_at = now(), archived_reason = 'discarded build' WHERE id = $1", [v2]);
    const m3 = { ...MANIFEST, sha256: sha('f'), analysis_sha256: sha('0'), companion_sha256: sha('6') };
    await build(o, m3);
    const referenced = [
      o.results, // admin.result_file.storage_path
      ...Object.values(paths(o.folder)), releasedCompanion, // withdrawn v1: storage_path, derived analysis/companion, companion_path
      ...Object.values(paths(o.folder, m2)), // archived v2
      ...Object.values(paths(o.folder, m3)), // built v3
      `${o.folder}/datasets/${MANIFEST.sha256}/analysis.xlsx`, // 0007's single-folder layout: all three files under the workbook digest
      `${o.folder}/datasets/${m3.analysis_sha256}/other-name.xlsx`, // any object under a recorded digest folder
    ];
    for (const name of referenced) await plant('admin-files', name);
    for (const u of [U.operator, U.admin, U.owner]) {
      await as(db, u);
      expect(await remove('admin-files', referenced), u).toEqual([]);
    }
    for (const name of referenced) expect(await exists('admin-files', name), name).toBe(true);
  });

  test('is_referenced_admin_file answers only lab writers: to anyone else every path reads as referenced', async () => {
    const o = await processedOrder();
    const orphan = `${o.folder}/datasets/${sha('1')}/dataset-v1.xlsx`;
    const ask = async (u) => { await as(db, u); return (await db.query('SELECT admin.is_referenced_admin_file($1) AS r', [orphan])).rows[0].r; };
    expect(await ask(U.operator)).toBe(false);
    for (const u of [U.aAdmin, U.aReq, U.bReq, U.member]) expect(await ask(u), u).toBe(true);
  });

  test('client members, lab members, anon and nexo_reader remove nothing; paths outside a live order stay too', async () => {
    const o = await processedOrder();
    const orphan = `${o.folder}/datasets/${sha('1')}/dataset-v1.xlsx`;
    await plant('admin-files', orphan);
    for (const u of [U.aAdmin, U.aReq, U.aView, U.bReq, U.member]) {
      await as(db, u);
      expect(await remove('admin-files', [orphan]), u).toEqual([]);
    }
    // Supabase grants anon table privileges on storage.objects; the stub does not, so grant them here to test the policy.
    await as(db, null);
    await db.exec('GRANT USAGE ON SCHEMA storage TO anon; GRANT ALL ON storage.objects TO anon');
    await db.exec('SET ROLE anon');
    expect(await remove('admin-files', [orphan])).toEqual([]);
    await as(db, null);
    await db.exec('SET ROLE nexo_reader');
    await expect(remove('admin-files', [orphan])).rejects.toThrow(/permission denied/);
    // Not under <client_id>/<order_code>/ of a live order (here: the order archived).
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET archived_at = now(), archived_reason = 'cancelled' WHERE id = $1", [o.order.id]);
    await as(db, U.operator);
    expect(await remove('admin-files', [orphan])).toEqual([]);
    expect(await exists('admin-files', orphan)).toBe(true);
  });
});

describe('0012: case-files', () => {
  const project = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  test('an eligible signer reads back and removes the pending analysis file it staged; an operator, a client or anon cannot', async () => {
    const o = await processedOrder();
    await build(o);
    const pending = `${project}/${MANIFEST.analysis_sha256}`;
    await as(db, U.owner);
    await db.query("INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('case-files', $1, auth.uid())", [pending]);
    for (const u of [U.operator, U.aAdmin, U.aReq, U.member]) {
      await as(db, u);
      expect(await count(db, "SELECT 1 FROM storage.objects WHERE bucket_id = 'case-files'"), u).toBe(0);
      expect(await remove('case-files', [pending]), u).toEqual([]);
    }
    await as(db, null);
    await db.exec('GRANT USAGE ON SCHEMA storage TO anon; GRANT ALL ON storage.objects TO anon');
    await db.exec('SET ROLE anon');
    expect(await remove('case-files', [pending])).toEqual([]);
    for (const u of [U.admin, U.owner]) { // both eligible under the default policy
      await as(db, u);
      expect(await count(db, "SELECT 1 FROM storage.objects WHERE bucket_id = 'case-files'"), u).toBe(1);
    }
    expect(await remove('case-files', [pending])).toEqual([pending]);
    expect(await exists('case-files', pending)).toBe(false);
  });

  test('never a released project\'s file, a digest that is not pending, or a path of another shape', async () => {
    const o = await processedOrder();
    const ds = await build(o);
    const released = `${project}/${MANIFEST.analysis_sha256}`;
    await plant('case-files', released);
    await signAndRelease(ds, project, `${o.folder}/released/companion.xlsx`);
    // A built dataset of another order keeps a digest pending, for the shape checks.
    const o2 = await processedOrder();
    const m2 = { ...MANIFEST, analysis_sha256: sha('c') };
    await build(o2, m2);
    const kept = [
      released, // the project exists: Team's rule only
      `${id(950)}/${MANIFEST.analysis_sha256}`, // that digest is released now, not pending, whatever the project id
      `${id(951)}/${sha('e')}`, // no dataset records that digest
      `${id(952)}/${m2.analysis_sha256}/x`, `${id(952)}/${m2.analysis_sha256.toUpperCase()}`, m2.analysis_sha256, // other shapes
      `${project}/${sha('d')}`, // a file Team's own rule let a project owner add
    ];
    for (const name of kept.slice(1)) await plant('case-files', name);
    await as(db, null);
    await db.query("INSERT INTO public.pilot_projects(id, name) VALUES ($1, 'existing project')", [id(953)]);
    const existingProject = `${id(953)}/${m2.analysis_sha256}`; // pending digest, but the project exists
    await plant('case-files', existingProject);
    for (const u of [U.owner, U.admin]) {
      await as(db, u);
      expect(await remove('case-files', [...kept, existingProject]), u).toEqual([]);
    }
    for (const name of [...kept, existingProject]) expect(await exists('case-files', name), name).toBe(true);
  });
});
