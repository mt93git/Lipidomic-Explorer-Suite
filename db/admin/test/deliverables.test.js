// Client deliverables and the per-client Nexo switch (0021_deliverables.sql): add_deliverable,
// set_deliverable_visibility, retire_deliverable, set_client_nexo_access, who reads which row, and which admin-files
// objects a client member may read. Synthetic data only.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, count, id, U, C } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const ORDER_A = id(101); // ORD001, client A, released dataset id(109), seeded visible deliverable id(113)
const ORDER_B = id(201); // ORD002, client B, released dataset id(209), seeded visible deliverable id(213)
const PDF = 'application/pdf';
const sha = (c) => c.repeat(64);
const pathOf = (client, code, digest, name) => `${client}/${code}/deliverables/${digest}/${name}`;

const add = (o = {}) => db.query('SELECT admin.add_deliverable($1, $2, $3, $4, $5, $6, $7, $8, $9) AS id', [
  o.order ?? ORDER_A, o.dataset === undefined ? id(109) : o.dataset, o.title ?? 'Final report', 'kind' in o ? o.kind : 'report', o.name ?? 'final-report.pdf',
  o.type ?? PDF, o.size ?? 2048, o.sha ?? sha('c'), 'visible' in o ? o.visible : false,
]).then((r) => r.rows[0].id);
const setVisible = (d, v) => db.query('SELECT admin.set_deliverable_visibility($1, $2)', [d, v]);
const retire = (d, reason) => db.query('SELECT admin.retire_deliverable($1, $2)', [d, reason]);
const setNexo = (c, on) => db.query('SELECT admin.set_client_nexo_access($1, $2)', [c, on]);
const row = async (d) => { await as(db, null); return (await db.query('SELECT * FROM admin.deliverable WHERE id = $1', [d])).rows[0]; };
const audits = async (entity, entityId) => { await as(db, null); return count(db, 'SELECT 1 FROM admin.audit_event WHERE entity = $1 AND entity_id = $2', [entity, entityId]); };
const code = async (p) => p.then(() => 'ok', (e) => e.code);
const visibleIds = async (who) => { await as(db, who); return (await db.query('SELECT id FROM admin.deliverable ORDER BY id')).rows.map((r) => r.id); };
const plant = async (name) => { await as(db, null); await db.query("INSERT INTO storage.objects(bucket_id, name) VALUES ('admin-files', $1)", [name]); };
const objects = async (who) => { await as(db, who); return (await db.query("SELECT name FROM storage.objects WHERE bucket_id = 'admin-files' ORDER BY name")).rows.map((r) => r.name); };

describe('installation', () => {
  test('the functions are SECURITY DEFINER with a pinned search_path, for authenticated only; nobody writes the table directly', async () => {
    await as(db, null);
    const fns = ['add_deliverable', 'set_deliverable_visibility', 'retire_deliverable', 'set_client_nexo_access', 'client_sees_deliverable', 'is_client_deliverable_object'];
    const rows = (await db.query("SELECT proname, prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app, has_function_privilege('anon', oid, 'EXECUTE') AS anon FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname = ANY($1)", [fns])).rows;
    expect(rows.map((r) => r.proname).sort()).toEqual([...fns].sort());
    for (const r of rows) expect({ name: r.proname, definer: r.prosecdef, path: r.proconfig.join(','), app: r.app, anon: r.anon })
      .toEqual({ name: r.proname, definer: true, path: 'search_path=pg_catalog, admin', app: true, anon: false });
    for (const helper of ['lock_live_deliverable(uuid)', 'guard_deliverable()']) {
      expect((await db.query(`SELECT has_function_privilege('authenticated', 'admin.${helper}', 'EXECUTE') AS ok`)).rows[0].ok, helper).toBe(false);
    }
    for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
      expect((await db.query("SELECT has_table_privilege('authenticated', 'admin.deliverable', $1) AS ok", [priv])).rows[0].ok, priv).toBe(false);
    }
    expect((await db.query("SELECT has_table_privilege('anon', 'admin.deliverable', 'SELECT') AS ok")).rows[0].ok).toBe(false);
    // nexo_access: no direct insert or update; the other client columns keep their 0004 grants.
    const col = async (c, p) => (await db.query("SELECT has_column_privilege('authenticated', 'admin.client', $1, $2) AS ok", [c, p])).rows[0].ok;
    expect([await col('nexo_access', 'UPDATE'), await col('nexo_access', 'INSERT'), await col('nexo_access', 'SELECT')]).toEqual([false, false, true]);
    expect([await col('name', 'UPDATE'), await col('archived_reason', 'UPDATE'), await col('name', 'INSERT')]).toEqual([true, true, true]);
  });

  test('direct writes are refused for every lab and client role', async () => {
    for (const u of [U.owner, U.operator, U.aAdmin]) {
      await as(db, u);
      expect(await code(db.query("UPDATE admin.deliverable SET visible_to_client = false WHERE id = $1", [id(113)])), u).toBe('42501');
      expect(await code(db.query("INSERT INTO admin.deliverable(client_id, order_id, title, kind, file_name, content_type, size_bytes, sha256, storage_path, added_by) VALUES ($1, $2, 'x', 'other', 'x.pdf', 'application/pdf', 1, $3, 'x', $4)", [C.A, ORDER_A, sha('d'), u])), u).toBe('42501');
    }
  });
});

describe('admin.add_deliverable', () => {
  test('each lab writer adds a hidden deliverable under the order\'s path, recorded with who and when, audited', async () => {
    for (const [u, digest] of [[U.operator, sha('c')], [U.admin, sha('d')], [U.owner, sha('e')]]) {
      await as(db, u);
      const d = await add({ sha: digest });
      expect(await row(d)).toMatchObject({
        client_id: C.A, order_id: ORDER_A, dataset_id: id(109), title: 'Final report', kind: 'report', file_name: 'final-report.pdf',
        content_type: PDF, size_bytes: 2048, sha256: digest, storage_path: pathOf(C.A, 'ORD001', digest, 'final-report.pdf'),
        visible_to_client: false, added_by: u, archived_at: null,
      });
      expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'deliverable' AND entity_id = $1 AND action = 'INSERT' AND actor = $2 AND client_id = $3", [d, u, C.A])).toBe(1);
    }
  });

  test('every allowed type by its extension, without a dataset, visible at once', async () => {
    await as(db, U.operator);
    const types = { 'a.pdf': PDF, 'b.png': 'image/png', 'c.jpg': 'image/jpeg', 'd.JPEG': 'image/jpeg', 'e.svg': 'image/svg+xml',
      'f.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'g.csv': 'text/csv' };
    for (const [name, type] of Object.entries(types)) {
      const d = await add({ name, type, dataset: null, visible: true, size: 52428800 });
      expect(await row(d), name).toMatchObject({ content_type: type, dataset_id: null, visible_to_client: true });
      await as(db, U.operator);
    }
  });

  test('refuses anyone who is not a lab writer', async () => {
    for (const u of [U.member, U.aAdmin, U.aReq, U.aView, U.bReq]) {
      await as(db, u);
      expect(await code(add()), u).toBe('42501');
    }
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.deliverable')).toBe(2);
  });

  test('refuses bad input (22023): title, kind, file name, type, size, digest, visibility', async () => {
    await as(db, U.operator);
    for (const bad of [{ title: '  ' }, { title: 'x'.repeat(201) }, { kind: 'invoice' }, { kind: 'Report' }, { kind: null }, { name: '../x.pdf' }, { name: 'a/b.pdf' },
      { name: 'report final.pdf' }, { name: '.hidden.pdf' }, { name: 'x'.repeat(118) + '.pdf' }, { name: 'notes.txt', type: 'text/plain' },
      { name: 'page.html', type: 'text/html' }, { name: 'report.pdf', type: 'image/png' }, { name: 'figure.png', type: PDF }, { size: 0 },
      { size: 52428801 }, { sha: 'C'.repeat(64) }, { sha: 'abc' }, { visible: null }]) {
      expect(await code(add(bad)), JSON.stringify(bad).slice(0, 80)).toBe('22023');
    }
  });

  test('refuses an unknown, archived or unaccepted order and a dataset that is not this order\'s current release', async () => {
    await as(db, U.operator);
    expect(await code(add({ order: id(999) }))).toBe('P0002');
    expect(await code(add({ dataset: id(209) }))).toBe('55000'); // client B's dataset
    await as(db, null);
    await db.query("INSERT INTO admin.dataset(id, client_id, order_id, version, storage_path, sha256) VALUES ($1, $2, $3, 2, 'datasets/v2.xlsx', $4)", [id(150), C.A, ORDER_A, sha('f')]);
    await as(db, U.operator);
    expect(await code(add({ dataset: id(150) }))).toBe('55000'); // built, not released
    await as(db, U.aReq);
    const pending = (await db.query("SELECT admin.request_order($1, NULL, 'Waiting', NULL, 2, NULL, NULL) AS id", [C.A])).rows[0].id;
    await as(db, U.operator);
    expect(await code(add({ order: pending, dataset: null }))).toBe('55000');
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET archived_at = now(), archived_reason = 'synthetic' WHERE id = $1", [ORDER_A]);
    await as(db, U.operator);
    expect(await code(add()), 'archived').toBe('55000');
  });

  test('the same file twice is a conflict (PT409); once retired it may be added again', async () => {
    await as(db, U.operator);
    const d = await add();
    expect(await code(add({ title: 'Again' }))).toBe('PT409');
    await retire(d, 'Wrong cover page');
    const again = await add({ title: 'Again' });
    expect(again).not.toBe(d);
    expect((await row(again)).storage_path).toBe((await row(d)).storage_path);
  });
});

describe('admin.set_deliverable_visibility and admin.retire_deliverable', () => {
  test('a lab writer shows and hides a deliverable; each change is audited, setting the same value writes nothing', async () => {
    await as(db, U.operator);
    const d = await add();
    await setVisible(d, true);
    expect((await row(d)).visible_to_client).toBe(true);
    expect(await audits('deliverable', d)).toBe(2);
    await as(db, U.admin);
    await setVisible(d, true);
    expect(await audits('deliverable', d)).toBe(2);
    await as(db, U.admin);
    await setVisible(d, false);
    expect((await row(d)).visible_to_client).toBe(false);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'deliverable' AND entity_id = $1 AND action = 'UPDATE' AND actor = $2 AND after->>'visible_to_client' = 'false'", [d, U.admin])).toBe(1);
  });

  test('refusals: not a lab writer (42501), null (22023), unknown (P0002), retired (PT409)', async () => {
    for (const u of [U.member, U.aAdmin, U.bReq]) {
      await as(db, u);
      expect(await code(setVisible(id(113), false)), u).toBe('42501');
      expect(await code(retire(id(113), 'no')), u).toBe('42501');
    }
    await as(db, U.operator);
    expect(await code(setVisible(id(113), null))).toBe('22023');
    expect(await code(setVisible(id(998), true))).toBe('P0002');
    expect(await code(retire(id(998), 'gone'))).toBe('P0002');
    expect(await code(retire(id(113), '   '))).toBe('22023');
    expect(await code(retire(id(113), 'x'.repeat(501)))).toBe('22023');
    await retire(id(113), 'Superseded by the corrected report');
    expect(await row(id(113))).toMatchObject({ archived_reason: 'Superseded by the corrected report' });
    await as(db, U.operator);
    expect(await code(retire(id(113), 'again'))).toBe('PT409');
    expect(await code(setVisible(id(113), false))).toBe('PT409');
  });

  test('a deliverable\'s file never changes, and a retired row never changes, even for the migration owner', async () => {
    await as(db, null);
    expect(await code(db.query("UPDATE admin.deliverable SET title = 'Edited' WHERE id = $1", [id(113)]))).toBe('55000');
    expect(await code(db.query("UPDATE admin.deliverable SET sha256 = $2 WHERE id = $1", [id(113), sha('e')]))).toBe('55000');
    await db.query("UPDATE admin.deliverable SET archived_at = now(), archived_reason = 'synthetic' WHERE id = $1", [id(113)]);
    expect(await code(db.query("UPDATE admin.deliverable SET archived_at = NULL, archived_reason = NULL WHERE id = $1", [id(113)]))).toBe('PT409');
    expect(await code(db.query('DELETE FROM admin.deliverable WHERE id = $1', [id(113)]))).not.toBe('ok');
  });
});

describe('who reads which deliverable', () => {
  test('lab staff read every row, hidden and retired ones too; a lab member reads none', async () => {
    await as(db, U.operator);
    const hidden = await add();
    const retired = await add({ sha: sha('d') });
    await retire(retired, 'Wrong file');
    for (const u of [U.owner, U.admin, U.operator]) expect(await visibleIds(u), u).toEqual([id(113), id(213), hidden, retired].sort());
    expect(await visibleIds(U.member)).toEqual([]);
  });

  test('a client member reads only live, visible deliverables of their own client\'s live orders', async () => {
    await as(db, U.operator);
    const hidden = await add();
    const shown = await add({ sha: sha('d'), visible: true });
    const retired = await add({ sha: sha('e'), visible: true });
    await retire(retired, 'Wrong file');
    for (const u of [U.aAdmin, U.aReq, U.aView]) expect(await visibleIds(u), u).toEqual([id(113), shown].sort());
    expect(await visibleIds(U.bReq)).toEqual([id(213)]);
    expect(await visibleIds(U.both)).toEqual([id(113), id(213), shown].sort());
    expect((await visibleIds(U.aReq)).includes(hidden)).toBe(false);

    // Hiding it again, an archived order, an archived membership and an archived client each take it away.
    await as(db, U.operator);
    await setVisible(shown, false);
    expect(await visibleIds(U.aView)).toEqual([id(113)]);
    await as(db, null);
    await db.query("UPDATE admin.client_member SET archived_at = now(), archived_reason = 'left' WHERE user_id = $1 AND client_id = $2", [U.aView, C.A]);
    expect(await visibleIds(U.aView)).toEqual([]);
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET archived_at = now(), archived_reason = 'synthetic' WHERE id = $1", [ORDER_A]);
    expect(await visibleIds(U.aReq)).toEqual([]);
    await as(db, null);
    await db.query("UPDATE admin.client SET archived_at = now(), archived_reason = 'synthetic' WHERE id = $1", [C.B]);
    expect(await visibleIds(U.bReq)).toEqual([]);
  });

  test('storage: a client member reads exactly the objects of their visible, live deliverables, nothing else in admin-files', async () => {
    await as(db, U.operator);
    const hidden = await add();
    const retired = await add({ sha: sha('e'), visible: true, name: 'figure.svg', type: 'image/svg+xml' });
    await retire(retired, 'Wrong colours');
    const objs = {
      mine: pathOf(C.A, 'ORD001', sha('1'), 'report.pdf'), hidden: (await row(hidden)).storage_path, retired: (await row(retired)).storage_path,
      other: pathOf(C.B, 'ORD002', sha('2'), 'report.pdf'), results: `${C.A}/ORD001/review-1/results.txt`, dataset: `${C.A}/ORD001/datasets/${sha('b')}/dataset-v1.xlsx`,
      lookalike: pathOf(C.A, 'ORD001', sha('1'), 'report.pdf.bak'),
    };
    for (const name of Object.values(objs)) await plant(name);
    for (const u of [U.aAdmin, U.aReq, U.aView]) expect(await objects(u), u).toEqual([objs.mine]);
    expect(await objects(U.bReq)).toEqual([objs.other]);
    expect(await objects(U.both)).toEqual([objs.mine, objs.other].sort());
    expect(await objects(U.member)).toEqual([]);
    expect((await objects(U.operator)).length).toBe(Object.keys(objs).length);

    // A client member writes and removes nothing there; hiding the deliverable closes its object too.
    await as(db, U.aAdmin);
    expect(await code(db.query("INSERT INTO storage.objects(bucket_id, name) VALUES ('admin-files', $1)", [pathOf(C.A, 'ORD001', sha('9'), 'x.pdf')]))).toBe('42501');
    expect((await db.query("DELETE FROM storage.objects WHERE bucket_id = 'admin-files' RETURNING name")).rows).toEqual([]);
    await as(db, U.operator);
    await setVisible(id(113), false);
    expect(await objects(U.aReq)).toEqual([]);
  });

  test('0012\'s cleanup never removes a deliverable\'s object, live or retired; an unrecorded one still goes', async () => {
    await as(db, U.operator);
    const live = await add();
    const retired = await add({ sha: sha('d') });
    await retire(retired, 'Wrong file');
    const orphan = pathOf(C.A, 'ORD001', sha('e'), 'failed-upload.pdf');
    const names = [(await row(live)).storage_path, (await row(retired)).storage_path, orphan];
    for (const name of names) await plant(name);
    await as(db, U.operator);
    expect((await db.query("DELETE FROM storage.objects WHERE bucket_id = 'admin-files' AND name = ANY($1) RETURNING name", [names])).rows.map((r) => r.name)).toEqual([orphan]);
  });
});

describe('admin.set_client_nexo_access', () => {
  test('off by default; a lab Owner or Admin turns it on and off, audited on the client; the same value writes nothing', async () => {
    await as(db, null);
    expect((await db.query('SELECT DISTINCT nexo_access FROM admin.client')).rows).toEqual([{ nexo_access: false }]);
    const before = await audits('client', C.A);
    await as(db, U.admin);
    await setNexo(C.A, true);
    await as(db, U.owner);
    await setNexo(C.A, true);
    expect(await audits('client', C.A)).toBe(before + 1);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'client' AND entity_id = $1 AND actor = $2 AND before->>'nexo_access' = 'false' AND after->>'nexo_access' = 'true'", [C.A, U.admin])).toBe(1);
    // The client's own people read it; another client does not see this client at all.
    await as(db, U.aView);
    expect((await db.query('SELECT nexo_access FROM admin.client WHERE id = $1', [C.A])).rows).toEqual([{ nexo_access: true }]);
    await as(db, U.bReq);
    expect(await count(db, 'SELECT 1 FROM admin.client WHERE id = $1', [C.A])).toBe(0);
    await as(db, U.owner);
    await setNexo(C.A, false);
    await as(db, null);
    expect((await db.query('SELECT nexo_access FROM admin.client WHERE id = $1', [C.A])).rows[0].nexo_access).toBe(false);
  });

  test('refusals: Operator, lab member and client roles (42501), null (22023), unknown (P0002), archived (55000); no direct update', async () => {
    for (const u of [U.operator, U.member, U.aAdmin, U.bReq]) {
      await as(db, u);
      expect(await code(setNexo(C.A, true)), u).toBe('42501');
    }
    await as(db, U.admin);
    expect(await code(setNexo(C.A, null))).toBe('22023');
    expect(await code(setNexo(id(997), true))).toBe('P0002');
    expect(await code(db.query('UPDATE admin.client SET nexo_access = true WHERE id = $1', [C.A]))).toBe('42501');
    expect(await code(db.query("INSERT INTO admin.client(name, kind, nexo_access) VALUES ('Synthetic Gamma', 'pi_lab', true)"))).toBe('42501');
    await db.query("UPDATE admin.client SET notes = 'still editable' WHERE id = $1", [C.A]); // the other columns keep their grants
    await db.query("UPDATE admin.client SET archived_at = now(), archived_reason = 'synthetic' WHERE id = $1", [C.B]);
    expect(await code(setNexo(C.B, true))).toBe('55000');
    await as(db, null);
    expect((await db.query('SELECT count(*)::int AS n FROM admin.client WHERE nexo_access')).rows[0].n).toBe(0);
  });
});
