import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, count, id, U, C, CLIENT_TABLES, ALL_TABLES, APPEND_ONLY } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });


describe('installation', () => {
  test('creates the 21 tables, RLS on every table, delete and audit triggers everywhere', async () => {
    const tables = (await db.query("SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'admin'::regnamespace AND relkind = 'r' ORDER BY relname")).rows;
    expect(tables.map((t) => t.relname).sort()).toEqual([...ALL_TABLES].sort());
    expect(tables.filter((t) => !t.relrowsecurity)).toEqual([]);
    for (const t of ALL_TABLES.filter((t) => !APPEND_ONLY.includes(t))) {
      const trg = (await db.query("SELECT tgname FROM pg_trigger WHERE tgrelid = $1::regclass AND NOT tgisinternal", [`admin."${t}"`])).rows.map((r) => r.tgname);
      expect(trg, t).toEqual(expect.arrayContaining(['refuse_delete', 'refuse_truncate', 'zz_audit']));
    }
  });

  test('helpers are SECURITY DEFINER with a fixed search_path', async () => {
    const rows = (await db.query("SELECT proname, prosecdef, proconfig FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname IN ('is_lab_staff', 'lab_role', 'is_client_member')")).rows;
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.prosecdef, r.proname).toBe(true);
      expect(r.proconfig.join(','), r.proname).toMatch(/^search_path=/);
    }
  });

  test('tests really run as a non-superuser role subject to RLS', async () => {
    await as(db, U.aReq);
    const me = (await db.query("SELECT current_user AS u, r.rolsuper, r.rolbypassrls, auth.uid() AS uid FROM pg_roles r WHERE r.rolname = current_user")).rows[0];
    expect(me).toEqual({ u: 'authenticated', rolsuper: false, rolbypassrls: false, uid: U.aReq });
    expect(await count(db, 'SELECT * FROM admin.client')).toBe(1);
    await as(db, null);
    expect(await count(db, 'SELECT * FROM admin.client')).toBe(2);
  });
});

describe('client isolation', () => {
  test('every client-data table is populated for both clients', async () => {
    for (const [t, col] of Object.entries(CLIENT_TABLES)) {
      for (const c of [C.A, C.B]) {
        expect(await count(db, `SELECT 1 FROM admin."${t}" WHERE ${col} = $1`, [c]), `${t} ${c}`).toBeGreaterThan(0);
      }
    }
  });

  test('client users see zero rows of another client in every client-data table', async () => {
    for (const [user, mine] of [[U.aAdmin, C.A], [U.aReq, C.A], [U.aView, C.A], [U.bReq, C.B]]) {
      await as(db, user);
      for (const [t, col] of Object.entries(CLIENT_TABLES)) {
        expect(await count(db, `SELECT 1 FROM admin."${t}" WHERE ${col} IS DISTINCT FROM $1`, [mine]), `${t} as ${user}`).toBe(0);
        if (t !== 'audit_event') {
          expect(await count(db, `SELECT 1 FROM admin."${t}" WHERE ${col} = $1`, [mine]), `${t} own rows as ${user}`).toBeGreaterThan(0);
        }
      }
      // staff-only tables
      for (const t of ['lab_staff', 'instrument', 'result_file']) {
        expect(await count(db, `SELECT 1 FROM admin."${t}"`), `${t} as ${user}`).toBe(0);
      }
    }
  });

  test('a person in two clients sees both, a lab member without membership sees none, operators see all', async () => {
    await as(db, U.both);
    expect(await count(db, 'SELECT DISTINCT client_id FROM admin.sample')).toBe(2);
    await as(db, U.member);
    for (const [t] of Object.entries(CLIENT_TABLES)) expect(await count(db, `SELECT 1 FROM admin."${t}"`), t).toBe(0);
    await as(db, U.operator);
    for (const [t, col] of Object.entries(CLIENT_TABLES)) {
      expect(await count(db, `SELECT DISTINCT ${col} FROM admin."${t}" WHERE ${col} IS NOT NULL`), t).toBe(2);
    }
  });

  test('a mixed batch shows each client only its own injections', async () => {
    const names = async () => (await db.query('SELECT sample_name FROM admin.injection WHERE batch_version_id = $1 ORDER BY seq', [id(401)])).rows.map((r) => r.sample_name);
    await as(db, U.aReq);
    expect(await names()).toEqual(['B2026-001_001_ORD001-S001']);
    expect((await db.query('SELECT name FROM admin.batch ORDER BY name')).rows).toEqual([{ name: 'B2026-001' }]);
    await as(db, U.bReq);
    expect(await names()).toEqual(['B2026-001_002_ORD002-S001']);
    expect((await db.query('SELECT name FROM admin.batch ORDER BY name')).rows.map((r) => r.name)).toEqual(['B2026-001', 'B2026-002']);
    await as(db, U.operator);
    expect(await names()).toEqual(['B2026-001_001_ORD001-S001', 'B2026-001_002_ORD002-S001', 'B2026-001_003_PQC']);
  });

  test('client users only see released datasets of their client', async () => {
    await as(db, null);
    await db.query("INSERT INTO admin.dataset(client_id, order_id, version, storage_path, sha256) VALUES ($1, $2, 2, 'datasets/v2.xlsx', $3)", [C.A, id(101), 'c'.repeat(64)]);
    await as(db, U.aReq);
    expect((await db.query('SELECT version, status FROM admin.dataset')).rows).toEqual([{ version: 1, status: 'released' }]);
    await as(db, U.operator);
    expect(await count(db, 'SELECT 1 FROM admin.dataset WHERE client_id = $1', [C.A])).toBe(2);
  });
});

describe('no hard delete', () => {
  test('DELETE and TRUNCATE are refused on every table, for the app role and for the owner', async () => {
    for (const t of ALL_TABLES) {
      await as(db, U.owner);
      await expect(db.query(`DELETE FROM admin."${t}"`), t).rejects.toThrow(/permission denied/);
      await expect(db.query(`TRUNCATE admin."${t}" CASCADE`), t).rejects.toThrow(/permission denied/);
      await as(db, null);
      await expect(db.query(`DELETE FROM admin."${t}"`), t).rejects.toThrow(/not allowed|append-only/);
      await expect(db.query(`TRUNCATE admin."${t}" CASCADE`), t).rejects.toThrow(/not allowed|append-only/);
    }
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.client')).toBe(2);
  });

  test('archiving needs both archived_at and archived_reason', async () => {
    await as(db, U.admin);
    await expect(db.query('UPDATE admin.client SET archived_at = now() WHERE id = $1', [C.B])).rejects.toThrow(/check constraint/);
    await db.query("UPDATE admin.client SET archived_at = now(), archived_reason = 'contract ended' WHERE id = $1", [C.B]);
  });
});

describe('audit', () => {
  test('inserts and updates in every audited table write audit rows with the actor', async () => {
    await as(db, null);
    const entities = (await db.query('SELECT DISTINCT entity FROM admin.audit_event')).rows.map((r) => r.entity);
    expect(entities.sort()).toEqual(ALL_TABLES.filter((t) => !APPEND_ONLY.includes(t)).sort());

    await as(db, U.operator);
    const o = (await db.query("INSERT INTO admin.\"order\"(client_id, title) VALUES ($1, 'New synthetic order') RETURNING id", [C.A])).rows[0].id;
    await db.query("UPDATE admin.\"order\" SET title = 'Renamed' WHERE id = $1", [o]);
    const ev = (await db.query("SELECT actor, client_id, action, before->>'title' AS before, after->>'title' AS after FROM admin.audit_event WHERE entity = 'order' AND entity_id = $1 ORDER BY id", [o])).rows;
    expect(ev).toEqual([
      { actor: U.operator, client_id: C.A, action: 'INSERT', before: null, after: 'New synthetic order' },
      { actor: U.operator, client_id: C.A, action: 'UPDATE', before: 'New synthetic order', after: 'Renamed' },
    ]);
  });

  test('audit_event cannot be inserted, updated or deleted, by the app role or by the owner', async () => {
    await as(db, U.owner);
    expect(await count(db, 'SELECT 1 FROM admin.audit_event')).toBeGreaterThan(0);
    await expect(db.query("INSERT INTO admin.audit_event(entity, action) VALUES ('x', 'FAKE')")).rejects.toThrow(/permission denied/);
    await expect(db.query("UPDATE admin.audit_event SET action = 'TAMPERED'")).rejects.toThrow(/permission denied/);
    await expect(db.query('DELETE FROM admin.audit_event')).rejects.toThrow(/permission denied/);
    await as(db, null);
    await expect(db.query("UPDATE admin.audit_event SET action = 'TAMPERED'")).rejects.toThrow(/append-only/);
    await expect(db.query('DELETE FROM admin.audit_event')).rejects.toThrow(/append-only/);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE action NOT IN ('INSERT', 'UPDATE')")).toBe(0);
  });
});

describe('frozen rows', () => {
  test('an exported batch_version refuses updates and new injections', async () => {
    await as(db, U.operator);
    await db.query("UPDATE admin.batch_version SET exported_at = now(), sequence_sha256 = $2 WHERE id = $1", [id(401), 'd'.repeat(64)]);
    await expect(db.query("UPDATE admin.batch_version SET note = 'edit' WHERE id = $1", [id(401)])).rejects.toThrow(/frozen/);
    await expect(db.query("UPDATE admin.batch_version SET exported_at = NULL WHERE id = $1", [id(401)])).rejects.toThrow(/frozen/);
    await expect(db.query("INSERT INTO admin.injection(batch_version_id, seq, sample_type, sample_name) VALUES ($1, 9, 'Blank', 'B2026-001_009_BLK')", [id(401)])).rejects.toThrow(/frozen/);
    await expect(db.query("UPDATE admin.injection SET sample_name = 'renamed' WHERE id = $1", [id(402)])).rejects.toThrow(/frozen/);
    await db.query("UPDATE admin.injection SET status = 'acquired' WHERE id = $1", [id(402)]); // acquisition status may still move
    await as(db, null);
    await expect(db.query("UPDATE admin.batch_version SET note = 'edit' WHERE id = $1", [id(401)])).rejects.toThrow(/frozen/);
    await db.query("UPDATE admin.batch_version SET archived_at = now(), archived_reason = 'replaced by v2' WHERE id = $1", [id(401)]);
  });

  test('an accepted result_file refuses updates except being superseded', async () => {
    await as(db, U.operator);
    await db.query("UPDATE admin.result_file SET status = 'accepted', accepted_at = now(), accepted_by = $2 WHERE id = $1", [id(405), U.operator]);
    await expect(db.query("UPDATE admin.result_file SET storage_path = 'other.txt' WHERE id = $1", [id(405)])).rejects.toThrow(/frozen/);
    await expect(db.query("UPDATE admin.result_file SET status = 'parsed' WHERE id = $1", [id(405)])).rejects.toThrow(/frozen/);
    await db.query("UPDATE admin.result_file SET status = 'superseded' WHERE id = $1", [id(405)]);
    await expect(db.query("UPDATE admin.result_file SET status = 'accepted' WHERE id = $1", [id(405)])).rejects.toThrow(/frozen/);
  });

  test('a released dataset refuses updates except withdrawal; its signatures are frozen', async () => {
    await as(db, U.admin);
    await expect(db.query("UPDATE admin.dataset SET storage_path = 'other.xlsx' WHERE id = $1", [id(109)])).rejects.toThrow(/permission denied/); // 0008
    await expect(db.query("UPDATE admin.dataset SET status = 'withdrawn' WHERE id = $1", [id(109)])).rejects.toThrow(/permission denied/);
    await expect(db.query("SELECT admin.sign_dataset($1, 'approved', null)", [id(109)])).rejects.toThrow(/released/);
    await as(db, U.owner); // signature 110 is the owner's own
    await expect(db.query("UPDATE admin.signature SET archived_at = now(), archived_reason = 'retract' WHERE id = $1", [id(110)])).rejects.toThrow(/frozen/);
    await as(db, null); // withdrawal is not open to the app role yet; the rule still holds for the owner
    await expect(db.query("UPDATE admin.dataset SET status = 'built' WHERE id = $1", [id(109)])).rejects.toThrow(/frozen/);
    await expect(db.query("UPDATE admin.dataset SET storage_path = 'other.xlsx' WHERE id = $1", [id(109)])).rejects.toThrow(/frozen/);
    await db.query("UPDATE admin.dataset SET status = 'withdrawn', archived_at = now(), archived_reason = 'wrong order' WHERE id = $1", [id(109)]);
    await expect(db.query("UPDATE admin.dataset SET status = 'released' WHERE id = $1", [id(109)])).rejects.toThrow(/frozen/);
  });
});

describe('release paths under a three-signature policy', () => {
  const MANIFEST = { analysis_sha256: '9'.repeat(64), analysis_size_bytes: 1234, companion_sha256: '7'.repeat(64), companion_size_bytes: 99 };
  async function threeSignerDataset() {
    await as(db, U.owner);
    await db.query("SELECT admin.set_release_policy($1::uuid[], 3)", [`{${U.owner},${U.admin},${U.operator}}`]);
    // Built through the contract function (0008: the app role cannot insert a dataset).
    await as(db, U.operator);
    const order = (await db.query("INSERT INTO admin.\"order\"(client_id, title) VALUES ($1, 'Three signers') RETURNING id, code", [C.A])).rows[0];
    const rf = (await db.query("SELECT admin.accept_result_file($1, 'results/three.txt', $2, '3.4.5', 'Global v1', '{}'::jsonb) AS id", [order.id, 'a'.repeat(64)])).rows[0].id;
    return (await db.query('SELECT admin.build_dataset($1, $2, 1, $3, $4, $5, $6, $7, $8) AS id',
      [order.id, rf, `${C.A}/${order.code}/datasets/${'e'.repeat(64)}/dataset-v1.xlsx`, 'e'.repeat(64), MANIFEST.analysis_sha256, MANIFEST.analysis_size_bytes, MANIFEST.companion_sha256, MANIFEST.companion_size_bytes])).rows[0].id;
  }
  const sign = (ds, role = 'reviewed') => db.query("SELECT admin.sign_dataset($1, $2, 'synthetic') AS id", [ds, role]).then((r) => r.rows[0].id);
  const directSign = (ds) => db.query("INSERT INTO admin.signature(client_id, dataset_id, user_id, role) VALUES ($1, $2, auth.uid(), 'prepared')", [C.A, ds]);
  const release = (ds) => db.query("SELECT admin.release_dataset($1, $2, $3, $4, 'analysis.xlsx', 'companion.xlsx') AS id",
    [ds, `${id(900)}/${MANIFEST.analysis_sha256}`, MANIFEST.analysis_sha256, MANIFEST.analysis_size_bytes]).then((r) => r.rows[0].id);
  const state = async (ds) => { await as(db, null); return (await db.query('SELECT status, project_id FROM admin.dataset WHERE id = $1', [ds])).rows[0]; };

  test('effective privileges: no INSERT on signature or dataset, no table UPDATE on dataset or signature, no release-state or content columns', async () => {
    const priv = async (q) => (await db.query(`SELECT ${q} AS ok`)).rows[0].ok;
    expect(await priv("has_table_privilege('authenticated', 'admin.signature', 'INSERT')")).toBe(false);
    expect(await priv("has_table_privilege('authenticated', 'admin.signature', 'UPDATE')")).toBe(false);
    expect(await priv("has_table_privilege('authenticated', 'admin.dataset', 'UPDATE')")).toBe(false);
    for (const col of ['id', 'client_id', 'order_id', 'status', 'released_at', 'project_id', 'companion_path', 'created_at']) {
      expect(await priv(`has_column_privilege('authenticated', 'admin.dataset', '${col}', 'UPDATE')`), col).toBe(false);
    }
    for (const col of ['id', 'client_id', 'dataset_id', 'user_id', 'role', 'signed_at']) {
      expect(await priv(`has_column_privilege('authenticated', 'admin.signature', '${col}', 'UPDATE')`), col).toBe(false);
    }
    // 0008: content and the file manifest are fixed by build_dataset; a build can only be archived. Retracting a signature: archiving only.
    expect(await priv("has_table_privilege('authenticated', 'admin.dataset', 'INSERT')")).toBe(false);
    for (const col of ['result_file_id', 'version', 'storage_path', 'sha256', 'analysis_sha256', 'analysis_size_bytes', 'companion_sha256', 'companion_size_bytes']) {
      expect(await priv(`has_column_privilege('authenticated', 'admin.dataset', '${col}', 'UPDATE')`), col).toBe(false);
    }
    for (const col of ['archived_at', 'archived_reason']) {
      expect(await priv(`has_column_privilege('authenticated', 'admin.dataset', '${col}', 'UPDATE')`), col).toBe(true);
    }
    expect(await priv("has_column_privilege('authenticated', 'admin.signature', 'archived_at', 'UPDATE')")).toBe(true);
    expect(await priv("to_regprocedure('admin.release_dataset(uuid)') IS NULL")).toBe(true);
  });

  test('a direct signature INSERT is denied to every lab role, eligible or not', async () => {
    const ds = await threeSignerDataset();
    for (const u of [U.operator, U.admin, U.owner]) {
      await as(db, u);
      await expect(directSign(ds), u).rejects.toThrow(/permission denied/);
    }
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.signature WHERE dataset_id = $1', [ds])).toBe(0);
  });

  test('UPDATE status = released is denied with two of three signatures, even to an eligible signer', async () => {
    const ds = await threeSignerDataset();
    await as(db, U.owner); await sign(ds);
    await as(db, U.admin); await sign(ds);
    for (const u of [U.operator, U.admin, U.owner]) {
      await as(db, u);
      await expect(db.query("UPDATE admin.dataset SET status = 'released' WHERE id = $1", [ds]), u).rejects.toThrow(/permission denied/);
      await expect(db.query("UPDATE admin.dataset SET project_id = $2 WHERE id = $1", [ds, id(900)]), u).rejects.toThrow(/permission denied/);
    }
    // Not even the migration owner can release below the policy count: the trigger counts like release_dataset.
    await as(db, null);
    await expect(db.query("UPDATE admin.dataset SET status = 'released' WHERE id = $1", [ds])).rejects.toThrow(/needs 3 signatures.*has 2/);
    expect(await state(ds)).toEqual({ status: 'built', project_id: null });
  });

  test('the old one-argument release RPC is gone', async () => {
    const ds = await threeSignerDataset();
    await as(db, U.owner); await sign(ds);
    await as(db, U.admin); await sign(ds);
    await expect(db.query('SELECT admin.release_dataset($1::uuid)', [ds])).rejects.toThrow(/does not exist/);
    expect(await state(ds)).toEqual({ status: 'built', project_id: null });
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM public.pilot_projects')).toBe(0);
  });

  test('retraction stays possible; a retracted signature cannot be restored; one live signature per person', async () => {
    const ds = await threeSignerDataset();
    await as(db, U.operator);
    const mine = await sign(ds);
    await db.query("UPDATE admin.signature SET archived_at = now(), archived_reason = 'retracted' WHERE id = $1", [mine]);
    await expect(db.query('UPDATE admin.signature SET archived_at = NULL, archived_reason = NULL WHERE id = $1', [mine])).rejects.toThrow(/retracted/);
    await sign(ds); // signing again makes a new signature
    await as(db, null); // the database refuses a second live signature by one person, whoever inserts it
    await expect(db.query("INSERT INTO admin.signature(client_id, dataset_id, user_id, role) VALUES ($1, $2, $3, 'approved')", [C.A, ds, U.operator])).rejects.toThrow(/duplicate key/);
    await expect(db.query('UPDATE admin.signature SET archived_at = NULL, archived_reason = NULL WHERE id = $1', [mine])).rejects.toThrow(/retracted/);
    expect(await count(db, 'SELECT 1 FROM admin.signature WHERE dataset_id = $1 AND archived_at IS NULL', [ds])).toBe(1);
  });

  test('three eligible people release through the six-argument function', async () => {
    const ds = await threeSignerDataset();
    for (const u of [U.owner, U.admin, U.operator]) { await as(db, u); await sign(ds); }
    expect(await release(ds)).toBe(id(900));
    expect(await state(ds)).toEqual({ status: 'released', project_id: id(900) });
  });

  test('a dataset cannot be born released; signed content and its file manifest are locked', async () => {
    const ds = await threeSignerDataset();
    await as(db, U.operator);
    await expect(db.query("INSERT INTO admin.dataset(client_id, order_id, version, storage_path, sha256, status) VALUES ($1, $2, 3, 'x.xlsx', $3, 'released')", [C.A, id(101), 'f'.repeat(64)])).rejects.toThrow(/permission denied/);
    await sign(ds, 'prepared');
    await expect(db.query("UPDATE admin.dataset SET sha256 = $2 WHERE id = $1", [ds, '0'.repeat(64)])).rejects.toThrow(/permission denied/);
    await as(db, null); // the table rule, for every writer
    await expect(db.query("INSERT INTO admin.dataset(client_id, order_id, version, storage_path, sha256, status) VALUES ($1, $2, 3, 'x.xlsx', $3, 'released')", [C.A, id(101), 'f'.repeat(64)])).rejects.toThrow(/built/);
    await expect(db.query("UPDATE admin.dataset SET sha256 = $2 WHERE id = $1", [ds, '0'.repeat(64)])).rejects.toThrow(/content cannot change/);
    await expect(db.query("UPDATE admin.dataset SET analysis_sha256 = $2 WHERE id = $1", [ds, '0'.repeat(64)])).rejects.toThrow(/content cannot change/);
  });
});

describe('uniqueness and generated codes', () => {
  test('full_name is unique per order, not across orders', async () => {
    await as(db, U.operator);
    await expect(db.query("INSERT INTO admin.sample(client_id, order_id, full_name) VALUES ($1, $2, 'Ctrl_1')", [C.A, id(101)])).rejects.toThrow(/duplicate key.*sample_order_id_full_name_key/);
    await db.query("INSERT INTO admin.sample(client_id, order_id, full_name) VALUES ($1, $2, 'Ctrl_2')", [C.B, id(201)]);
    expect(await count(db, "SELECT 1 FROM admin.sample WHERE full_name = 'Ctrl_1'")).toBe(2);
  });

  test('sample_name is unique per batch_version, not across versions', async () => {
    await as(db, U.operator);
    await expect(db.query("INSERT INTO admin.injection(batch_version_id, seq, sample_type, sample_name) VALUES ($1, 8, 'Blank', 'B2026-001_003_PQC')", [id(401)])).rejects.toThrow(/duplicate key.*injection_batch_version_id_sample_name_key/);
    const v2 = (await db.query('INSERT INTO admin.batch_version(batch_id, version) VALUES ($1, 2) RETURNING id', [id(400)])).rows[0].id;
    await db.query("INSERT INTO admin.injection(batch_version_id, seq, sample_type, sample_name) VALUES ($1, 3, 'Quality Control', 'B2026-001_003_PQC')", [v2]);
  });

  test('sample codes are ORD{nnn}-S{nnn}, sequential per order, without client names, and stable', async () => {
    await as(db, U.operator);
    const rows = (await db.query('SELECT o.code AS order_code, s.sample_code, c.name FROM admin.sample s JOIN admin."order" o ON o.id = s.order_id JOIN admin.client c ON c.id = s.client_id ORDER BY s.sample_code')).rows;
    expect(rows.map((r) => [r.order_code, r.sample_code])).toEqual([
      ['ORD001', 'ORD001-S001'], ['ORD001', 'ORD001-S002'], ['ORD002', 'ORD002-S001'], ['ORD002', 'ORD002-S002'],
    ]);
    for (const r of rows) {
      expect(r.sample_code).toMatch(/^ORD\d{3,}-S\d{3,}$/);
      for (const word of r.name.split(' ')) expect(r.sample_code).not.toContain(word);
    }
    // a caller cannot choose or change the code
    const s = (await db.query("INSERT INTO admin.sample(client_id, order_id, full_name, sample_code, sample_number) VALUES ($1, $2, 'Trt_2', 'ALPHA-1', 99) RETURNING sample_code", [C.A, id(101)])).rows[0];
    expect(s.sample_code).toBe('ORD001-S003');
    await expect(db.query("UPDATE admin.sample SET sample_code = 'ALPHA-1' WHERE id = $1", [id(103)])).rejects.toThrow(/cannot change/);
  });
});

describe('role-based writes', () => {
  test('an operator can create a batch; a client requester, client admin or lab member cannot', async () => {
    await as(db, U.operator);
    await db.query("INSERT INTO admin.batch(name) VALUES ('B2026-050')");
    for (const u of [U.aReq, U.aAdmin, U.member]) {
      await as(db, u);
      await expect(db.query("INSERT INTO admin.batch(name) VALUES ('B2026-051')"), u).rejects.toThrow(/row-level security/);
      await expect(db.query("INSERT INTO admin.injection(batch_version_id, seq, sample_type, sample_name) VALUES ($1, 20, 'Blank', 'X')", [id(401)]), u).rejects.toThrow(/row-level security/);
    }
  });

  // 0018: order, shipment and sample are written by lab writers only; client users go through nothing but reads.
  test('client admins, requesters and viewers cannot insert or update order, shipment or sample directly, stage included', async () => {
    await as(db, null);
    const before = (await db.query('SELECT o.stage, o.title, sh.notes, s.group1_term FROM admin."order" o JOIN admin.shipment sh ON sh.order_id = o.id JOIN admin.sample s ON s.order_id = o.id WHERE s.id = $1', [id(103)])).rows[0];
    for (const u of [U.aAdmin, U.aReq, U.aView]) {
      await as(db, u);
      for (const c of [C.A, C.B]) {
        const o = c === C.A ? id(101) : id(201);
        await expect(db.query('INSERT INTO admin."order"(client_id, title) VALUES ($1, \'direct\')', [c]), u).rejects.toThrow(/row-level security/);
        await expect(db.query('INSERT INTO admin.shipment(client_id, order_id) VALUES ($1, $2)', [c, o]), u).rejects.toThrow(/row-level security/);
        await expect(db.query('INSERT INTO admin.sample(client_id, order_id, full_name) VALUES ($1, $2, \'Direct_1\')', [c, o]), u).rejects.toThrow(/row-level security/);
      }
      for (const sql of [
        'UPDATE admin."order" SET stage = \'released\' WHERE client_id = $1',
        'UPDATE admin."order" SET title = \'hijack\' WHERE client_id = $1',
        'UPDATE admin.shipment SET notes = \'hijack\' WHERE client_id = $1',
        'UPDATE admin.sample SET group1_term = \'hijack\' WHERE client_id = $1',
        'UPDATE admin.sample SET client_id = $1 WHERE client_id = $1',
      ]) expect((await db.query(sql, [C.A])).affectedRows, `${u}: ${sql}`).toBe(0);
      await expect(db.query('INSERT INTO admin.aliquot(client_id, sample_id) VALUES ($1, $2)', [C.A, id(103)]), u).rejects.toThrow(/row-level security/);
    }
    await as(db, null);
    expect((await db.query('SELECT o.stage, o.title, sh.notes, s.group1_term FROM admin."order" o JOIN admin.shipment sh ON sh.order_id = o.id JOIN admin.sample s ON s.order_id = o.id WHERE s.id = $1', [id(103)])).rows[0]).toEqual(before);
  });

  test('a lab operator still inserts and updates order, shipment and sample directly, stage included', async () => {
    await as(db, U.operator);
    const o = (await db.query('INSERT INTO admin."order"(client_id, title) VALUES ($1, \'Synthetic direct\') RETURNING id', [C.A])).rows[0].id;
    const sh = (await db.query('INSERT INTO admin.shipment(client_id, order_id) VALUES ($1, $2) RETURNING id', [C.A, o])).rows[0].id;
    const s = (await db.query('INSERT INTO admin.sample(client_id, order_id, shipment_id, full_name) VALUES ($1, $2, $3, \'Direct_1\') RETURNING id', [C.A, o, sh])).rows[0].id;
    expect((await db.query('UPDATE admin."order" SET stage = \'received\' WHERE id = $1', [o])).affectedRows).toBe(1);
    expect((await db.query('UPDATE admin.shipment SET notes = \'checked\' WHERE id = $1', [sh])).affectedRows).toBe(1);
    expect((await db.query('UPDATE admin.sample SET group1_term = \'Ctrl\' WHERE id = $1', [s])).affectedRows).toBe(1);
    expect((await db.query('SELECT stage FROM admin."order" WHERE id = $1', [o])).rows[0].stage).toBe('received');
  });

  test('create_order, receive_shipment and register_samples still write for a lab operator, and refuse client users', async () => {
    const calls = {
      create: () => db.query("SELECT admin.create_order($1, $2, 'Synthetic F0', 'plasma', 1, NULL, NULL) AS id", [C.A, id(501)]).then((r) => r.rows[0].id),
      receive: (o) => db.query("SELECT admin.receive_shipment($1, 'courier', 'TRK-F0', 'ok', 1, NULL) AS id", [o]).then((r) => r.rows[0].id),
      register: (o, sh) => db.query('SELECT * FROM admin.register_samples($1, $2, $3::jsonb)', [o, sh, JSON.stringify([{ full_name: 'F0_1', group1_term: 'Ctrl' }])]).then((r) => r.rows),
    };
    await as(db, U.operator);
    const o = await calls.create();
    const sh = await calls.receive(o);
    expect((await calls.register(o, sh)).map((r) => r.full_name)).toEqual(['F0_1']);
    expect((await db.query('SELECT stage FROM admin."order" WHERE id = $1', [o])).rows[0].stage).toBe('registered');
    for (const u of [U.aAdmin, U.aReq]) {
      await as(db, u);
      await expect(calls.create(), u).rejects.toThrow(/only lab staff/);
      await expect(calls.receive(id(101)), u).rejects.toThrow(/only lab staff/);
      await expect(calls.register(id(101), id(102)), u).rejects.toThrow(/only lab staff/);
    }
  });

  // Since 0015 nobody signed in writes memberships directly: invitations and the People functions do (people.test.js).
  test('clients are managed by owner/admin; lab staff and client members are never written directly', async () => {
    await as(db, U.operator);
    await expect(db.query("INSERT INTO admin.client(name, kind) VALUES ('Synthetic Group Gamma', 'internal_group')")).rejects.toThrow(/row-level security/);
    await expect(db.query("INSERT INTO admin.lab_staff(user_id, role) VALUES ($1, 'operator')", [U.aView])).rejects.toThrow(/permission denied/);
    await as(db, U.admin);
    await db.query("INSERT INTO admin.client(name, kind) VALUES ('Synthetic Group Gamma', 'internal_group')");
    await expect(db.query("INSERT INTO admin.lab_staff(user_id, role) VALUES ($1, 'owner')", [U.aView])).rejects.toThrow(/permission denied/);
    for (const user of [U.owner, U.admin, U.aAdmin, U.aReq]) {
      await as(db, user);
      await expect(db.query("INSERT INTO admin.client_member(client_id, user_id, role) VALUES ($1, $2, 'viewer')", [C.A, U.bReq])).rejects.toThrow(/permission denied/);
    }
  });
});

// ---------------------------------------------------------------- wave 2: contract functions

describe('wave 2 contract functions', () => {
  const CONTRACT = ['receive_shipment', 'register_samples', 'accept_result_file', 'set_release_policy', 'sign_dataset', 'release_dataset'];
  const sha = (c) => c.repeat(64);
  const SAMPLES = [
    { full_name: 'Ctrl_A', client_sample_id: 'tube-1', group1_term: 'Ctrl', group2_term: null, replicate_term: '1', patient_term: 'P1', time_point_term: 'T0', matrix: 'plasma', volume_ul: 50 },
    { full_name: 'Trt_A', client_sample_id: 'tube-2', group1_term: 'Trt', group2_term: null, replicate_term: '1', patient_term: 'P2', time_point_term: 'T0', matrix: 'plasma', volume_ul: 45.5 },
  ];

  const receive = (oid) => db.query("SELECT admin.receive_shipment($1, 'courier', 'TRK-1', 'ok', 1, 'synthetic') AS id", [oid]).then((r) => r.rows[0].id);
  const register = (oid, shipment, samples) => db.query('SELECT * FROM admin.register_samples($1, $2, $3::jsonb)', [oid, shipment, JSON.stringify(samples)]).then((r) => r.rows);
  const accept = (oid) => db.query("SELECT admin.accept_result_file($1, 'results/synthetic.txt', $2, '3.4.5', 'Global v1', '{\"analytes\": 42}'::jsonb) AS id", [oid, sha('a')]).then((r) => r.rows[0].id);
  const setPolicy = (signers, n) => db.query('SELECT admin.set_release_policy($1::uuid[], $2)', [`{${signers.join(',')}}`, n]);
  const sign = (ds, role = 'reviewed') => db.query("SELECT admin.sign_dataset($1, $2, 'synthetic note') AS id", [ds, role]).then((r) => r.rows[0].id);
  const release = (ds, path, s = sha('9')) => db.query("SELECT admin.release_dataset($1, $2, $3, 1234, 'ORD analysis.xlsx', 'ORD/companion.xlsx') AS id", [ds, path, s]).then((r) => r.rows[0].id);
  const stage = async (oid) => { await as(db, U.operator); return (await db.query('SELECT stage FROM admin."order" WHERE id = $1', [oid])).rows[0].stage; };

  // A fresh order of client A taken to a built dataset: received, registered, processed.
  async function builtDataset() {
    await as(db, U.operator);
    const order = (await db.query("INSERT INTO admin.\"order\"(client_id, title) VALUES ($1, 'Wave2 synthetic') RETURNING id, code", [C.A])).rows[0];
    const shipment = await receive(order.id);
    await register(order.id, shipment, SAMPLES);
    const rf = await accept(order.id);
    // Built: the combined workbook plus the manifest of the two files it is split into (analysis, companion).
    const ds = (await db.query('SELECT admin.build_dataset($1, $2, 1, $3, $4, $5, 1234, $6, 99) AS id',
      [order.id, rf, `${C.A}/${order.code}/datasets/${sha('b')}/dataset-v1.xlsx`, sha('b'), sha('9'), sha('7')])).rows[0].id;
    return { order, shipment, rf, ds };
  }

  test('the six functions are SECURITY DEFINER, pin search_path, run for authenticated but not PUBLIC', async () => {
    const rows = (await db.query("SELECT proname, prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app, proacl::text AS acl FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname = ANY($1) AND pronargs > 1", [CONTRACT])).rows;
    expect([...new Set(rows.map((r) => r.proname))].sort()).toEqual([...CONTRACT].sort()); // release_dataset has two forms (0030)
    for (const r of rows) {
      expect(r.prosecdef, r.proname).toBe(true);
      expect(r.proconfig.join(','), r.proname).toMatch(/^search_path=pg_catalog, ?admin$/);
      expect(r.app, r.proname).toBe(true);
      expect(r.acl, r.proname).not.toMatch(/(^|[{,])=X/); // no PUBLIC execute
    }
  });

  test('receive, register and accept move the order stage; an order without a batch gets an imported one', async () => {
    await as(db, U.operator);
    const order = (await db.query("INSERT INTO admin.\"order\"(client_id, title) VALUES ($1, 'Wave2 synthetic') RETURNING id, code", [C.A])).rows[0];
    expect(await stage(order.id)).toBe('request');

    const shipment = await receive(order.id);
    const sh = (await db.query('SELECT client_id, received_by, received_at IS NOT NULL AS stamped, box_count FROM admin.shipment WHERE id = $1', [shipment])).rows[0];
    expect(sh).toEqual({ client_id: C.A, received_by: U.operator, stamped: true, box_count: 1 });
    expect(await stage(order.id)).toBe('received');

    const samples = await register(order.id, shipment, SAMPLES);
    expect(samples.map((s) => [s.sample_code, s.full_name, s.shipment_id, Number(s.volume_ul)])).toEqual([
      [`${order.code}-S001`, 'Ctrl_A', shipment, 50], [`${order.code}-S002`, 'Trt_A', shipment, 45.5],
    ]);
    expect(await stage(order.id)).toBe('registered');

    const rf = await accept(order.id);
    const row = (await db.query('SELECT f.status, f.accepted_by, f.order_id, f.summary, b.imported, b.status AS batch_status, b.name FROM admin.result_file f JOIN admin.batch b ON b.id = f.batch_id WHERE f.id = $1', [rf])).rows[0];
    expect(row).toMatchObject({ status: 'accepted', accepted_by: U.operator, order_id: order.id, summary: { analytes: 42 }, imported: true, batch_status: 'processed' });
    expect(row.name).toMatch(/^B\d{4}-\d{3,}$/);
    expect(await stage(order.id)).toBe('processed');

    // Order ORD001 already sits in batch B2026-001 (seed): its file is attached there, no new batch.
    const batches = await count(db, 'SELECT 1 FROM admin.batch');
    const rf1 = await accept(id(101));
    expect((await db.query('SELECT batch_id FROM admin.result_file WHERE id = $1', [rf1])).rows[0].batch_id).toBe(id(400));
    expect(await count(db, 'SELECT 1 FROM admin.batch')).toBe(batches);
  });

  test('register_samples rejects a duplicate full_name and inserts nothing', async () => {
    await as(db, U.operator);
    await receive(id(101));
    const before = await count(db, 'SELECT 1 FROM admin.sample WHERE order_id = $1', [id(101)]);
    // Ctrl_1 already exists in ORD001 (seed); the first, valid sample must not be kept either.
    await expect(register(id(101), null, [SAMPLES[0], { ...SAMPLES[1], full_name: 'Ctrl_1' }])).rejects.toThrow(/duplicate full_name.*Ctrl_1/);
    await expect(register(id(101), null, [SAMPLES[0], SAMPLES[0]])).rejects.toThrow(/duplicate full_name.*Ctrl_A/);
    expect(await count(db, 'SELECT 1 FROM admin.sample WHERE order_id = $1', [id(101)])).toBe(before);
    expect(await stage(id(101))).toBe('received');
  });

  test('register_samples refuses an order whose registry is closed (not yet received, or advanced past registered)', async () => {
    await as(db, U.operator);
    await expect(register(id(101), null, SAMPLES)).rejects.toThrow(/ORD001 is at stage request.*receive the shipment/);
    // A grid left open while someone else accepts the results file: the stale submit must add nothing.
    const order = (await db.query("INSERT INTO admin.\"order\"(client_id, title) VALUES ($1, 'Stale grid') RETURNING id, code", [C.A])).rows[0];
    const shipment = await receive(order.id);
    await register(order.id, shipment, [SAMPLES[0]]);
    await accept(order.id);
    await expect(register(order.id, shipment, [SAMPLES[1]])).rejects.toThrow(new RegExp(`${order.code} is at stage processed.*registry is closed`));
    expect(await count(db, 'SELECT 1 FROM admin.sample WHERE order_id = $1', [order.id])).toBe(1);
    expect(await stage(order.id)).toBe('processed');
  });

  test('client users and lab members cannot call staff functions', async () => {
    const { ds } = await builtDataset();
    for (const u of [U.aAdmin, U.aReq, U.member]) {
      await as(db, u);
      await expect(receive(id(101)), u).rejects.toThrow(/lab staff/);
      await expect(register(id(101), null, SAMPLES), u).rejects.toThrow(/lab staff/);
      await expect(accept(id(101)), u).rejects.toThrow(/lab staff/);
      await expect(setPolicy([], 2), u).rejects.toThrow(/lab owner/);
      await expect(sign(ds), u).rejects.toThrow(/not an eligible/);
      await expect(release(ds, `${id(900)}/${sha('9')}`), u).rejects.toThrow(/not an eligible/);
    }
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.signature WHERE dataset_id = $1', [ds])).toBe(0);
  });

  test('only the Owner sets the release policy, it needs at least two signatures, and history is kept', async () => {
    await as(db, U.admin);
    await expect(setPolicy([U.owner, U.admin], 2)).rejects.toThrow(/lab owner/);
    await as(db, U.owner);
    await expect(setPolicy([U.owner, U.admin], 1)).rejects.toThrow(/at least 2/);
    await expect(setPolicy([U.owner], 2)).rejects.toThrow(/fewer eligible signers/);
    await expect(setPolicy([U.owner, U.aAdmin], 2)).rejects.toThrow(/not lab staff/);
    await expect(db.query("INSERT INTO admin.release_policy(eligible_signers, required_signatures) VALUES ('{}', 2)")).rejects.toThrow(/permission denied/);
    await expect(db.query('UPDATE admin.release_policy SET required_signatures = 5')).rejects.toThrow(/permission denied/);
    await setPolicy([U.owner, U.admin], 2);
    await setPolicy([U.owner, U.admin, U.operator], 3);
    const rows = (await db.query('SELECT eligible_signers, required_signatures, set_by, archived_at IS NULL AS live FROM admin.release_policy ORDER BY created_at, live')).rows;
    expect(rows.filter((r) => r.live)).toEqual([{ eligible_signers: [U.owner, U.admin, U.operator], required_signatures: 3, set_by: U.owner, live: true }]);
    expect(rows).toHaveLength(3); // seed row + two settings, all kept
  });

  test('the same person cannot sign twice', async () => {
    const { ds } = await builtDataset();
    await as(db, U.owner);
    await sign(ds, 'prepared');
    await expect(sign(ds, 'approved')).rejects.toThrow(/already signed/);
    expect(await count(db, 'SELECT 1 FROM admin.signature WHERE dataset_id = $1', [ds])).toBe(1);
  });

  test('a signer outside the policy is refused', async () => {
    const { ds } = await builtDataset();
    await as(db, U.operator); // default policy: owners and admins only
    await expect(sign(ds)).rejects.toThrow(/not an eligible/);
    await as(db, U.owner);
    await setPolicy([U.owner, U.operator], 2);
    await as(db, U.admin); // an admin, but not on the list
    await expect(sign(ds)).rejects.toThrow(/not an eligible/);
    await as(db, U.operator);
    await sign(ds);
  });

  test('release is refused below the policy count', async () => {
    const { ds } = await builtDataset();
    await as(db, U.owner);
    await setPolicy([U.owner, U.admin, U.operator], 3);
    await sign(ds);
    await as(db, U.admin);
    await sign(ds);
    await expect(release(ds, `${id(900)}/${sha('9')}`)).rejects.toThrow(/needs 3 signatures.*has 2/);
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM public.pilot_projects')).toBe(0);
    expect((await db.query('SELECT status FROM admin.dataset WHERE id = $1', [ds])).rows).toEqual([{ status: 'built' }]);
  });

  test('a signer removed after signing does not count and gets no Team ownership', async () => {
    const { ds } = await builtDataset();
    await as(db, U.owner);
    await setPolicy([U.owner, U.admin, U.operator], 2);
    await as(db, U.operator);
    await sign(ds, 'prepared'); // eligible when signing
    await as(db, U.owner);
    await setPolicy([U.owner, U.admin], 2); // then removed from the policy ...
    await db.query("SELECT admin.archive_member('lab_staff', (SELECT id FROM admin.lab_staff WHERE user_id = $1), 'left the lab')", [U.operator]); // ... and from the lab (0015)
    await sign(ds, 'reviewed');
    await expect(release(ds, `${id(900)}/${sha('9')}`)).rejects.toThrow(/needs 2 signatures.*has 1/);
    await as(db, U.admin);
    await sign(ds, 'approved');
    expect(await release(ds, `${id(900)}/${sha('9')}`)).toBe(id(900));
    await as(db, null);
    expect((await db.query('SELECT user_id FROM public.pilot_members WHERE project_id = $1 AND role = $2 ORDER BY user_id', [id(900), 'owner'])).rows.map((r) => r.user_id))
      .toEqual([U.owner, U.admin].sort());
    expect(await count(db, 'SELECT 1 FROM public.pilot_members WHERE user_id = $1', [U.operator])).toBe(0);
    expect(await count(db, 'SELECT 1 FROM admin.signature WHERE dataset_id = $1 AND user_id = $2 AND archived_at IS NULL', [ds, U.operator])).toBe(1); // kept as evidence
    await as(db, U.operator);
    expect(await count(db, 'SELECT 1 FROM public.pilot_projects')).toBe(0);
  });

  test('signing needs the recorded analysis and companion files; release must present exactly the recorded analysis', async () => {
    const { ds } = await builtDataset();
    // Rows without a (complete) manifest only exist from before 0006; the migration owner inserts them here.
    await as(db, null);
    const bare = (await db.query("INSERT INTO admin.dataset(client_id, order_id, version, storage_path, sha256) VALUES ($1, $2, 2, 'datasets/bare.xlsx', $3) RETURNING id", [C.A, id(101), sha('c')])).rows[0].id;
    const half = (await db.query("INSERT INTO admin.dataset(client_id, order_id, version, storage_path, sha256, analysis_sha256, analysis_size_bytes) VALUES ($1, $2, 3, 'datasets/half.xlsx', $3, $4, 10) RETURNING id", [C.A, id(101), sha('c'), sha('d')])).rows[0].id;
    await as(db, U.owner);
    await expect(sign(bare)).rejects.toThrow(/record the analysis and companion files/);
    await expect(sign(half)).rejects.toThrow(/record the analysis and companion files/); // half a manifest is not enough
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.signature WHERE dataset_id IN ($1, $2)', [bare, half])).toBe(0);

    await as(db, U.owner); await sign(ds);
    await as(db, U.admin); await sign(ds);
    // Another staged workbook (different digest, path consistent with it) is refused, and so is a wrong size.
    await expect(release(ds, `${id(900)}/${sha('c')}`, sha('c'))).rejects.toThrow(/not the analysis file recorded/);
    await expect(db.query("SELECT admin.release_dataset($1, $2, $3, 999, 'a.xlsx', 'c.xlsx')", [ds, `${id(900)}/${sha('9')}`, sha('9')])).rejects.toThrow(/not the analysis file recorded/);
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM public.pilot_projects')).toBe(0);
    expect(await count(db, 'SELECT 1 FROM public.pilot_files')).toBe(0);
    expect((await db.query('SELECT status, project_id FROM admin.dataset WHERE id = $1', [ds])).rows[0]).toEqual({ status: 'built', project_id: null });
  });

  test('release creates exactly one project, its members and one pilot_files row, and freezes the dataset', async () => {
    const { order, ds } = await builtDataset();
    await as(db, U.owner);
    await sign(ds, 'prepared');
    await as(db, U.admin);
    await sign(ds, 'approved');
    const project = id(900);
    const path = `${project}/${sha('9')}`;
    await expect(release(ds, `${id(901)}/${sha('8')}`)).rejects.toThrow(/object_path/); // path must be <project_id>/<sha256>
    expect(await release(ds, path)).toBe(project);

    await as(db, null);
    expect((await db.query('SELECT id, name FROM public.pilot_projects')).rows).toEqual([{ id: project, name: `${order.code} Wave2 synthetic` }]);
    const members = (await db.query('SELECT user_id, role FROM public.pilot_members WHERE project_id = $1 ORDER BY user_id', [project])).rows;
    expect(members).toEqual([
      { user_id: U.owner, role: 'owner' }, { user_id: U.admin, role: 'owner' },
      { user_id: U.aAdmin, role: 'viewer' }, { user_id: U.aReq, role: 'viewer' }, { user_id: U.aView, role: 'viewer' },
      { user_id: U.both, role: 'viewer' },
    ].sort((a, b) => a.user_id.localeCompare(b.user_id)));
    expect((await db.query('SELECT project_id, object_path, original_name, sha256, size_bytes, created_by FROM public.pilot_files')).rows).toEqual([
      { project_id: project, object_path: path, original_name: 'ORD analysis.xlsx', sha256: sha('9'), size_bytes: 1234, created_by: U.admin },
    ]);
    expect((await db.query('SELECT status, project_id, companion_path, released_at IS NOT NULL AS stamped FROM admin.dataset WHERE id = $1', [ds])).rows[0])
      .toEqual({ status: 'released', project_id: project, companion_path: 'ORD/companion.xlsx', stamped: true });
    expect(await stage(order.id)).toBe('released');

    // Frozen: no second release, no second project, no edit.
    await as(db, U.admin);
    await expect(release(ds, `${id(902)}/${sha('9')}`)).rejects.toThrow(/released/);
    await expect(db.query("UPDATE admin.dataset SET storage_path = 'x' WHERE id = $1", [ds])).rejects.toThrow(/permission denied/);
    await expect(db.query("UPDATE admin.dataset SET companion_path = 'x' WHERE id = $1", [ds])).rejects.toThrow(/permission denied/);
    // Team's own RLS now shows the project to the client, and not to the other client.
    await as(db, U.aReq);
    expect(await count(db, 'SELECT 1 FROM public.pilot_projects')).toBe(1);
    await as(db, U.bReq);
    expect(await count(db, 'SELECT 1 FROM public.pilot_projects')).toBe(0);
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM public.pilot_projects')).toBe(1);
  });

  test('every step writes audit rows with the actor', async () => {
    const { order, shipment, rf, ds } = await builtDataset();
    await as(db, U.owner);
    await setPolicy([U.owner, U.admin], 2);
    await sign(ds);
    await as(db, U.admin);
    await sign(ds);
    await release(ds, `${id(900)}/${sha('9')}`);
    await as(db, null);
    const ev = async (entity, action, eid, where = 'true') => (await db.query(
      `SELECT actor FROM admin.audit_event WHERE entity = $1 AND action = $2 AND ($3::uuid IS NULL OR entity_id = $3) AND ${where} ORDER BY id`, [entity, action, eid])).rows.map((r) => r.actor);
    expect(await ev('shipment', 'INSERT', shipment)).toEqual([U.operator]);
    expect(await ev('sample', 'INSERT', null, "after->>'order_id' = '" + order.id + "'")).toEqual([U.operator, U.operator]);
    expect(await ev('result_file', 'INSERT', rf)).toEqual([U.operator]);
    expect(await ev('order', 'UPDATE', order.id, "after->>'stage' IN ('received', 'registered', 'processed')")).toEqual([U.operator, U.operator, U.operator]);
    expect(await ev('order', 'UPDATE', order.id, "after->>'stage' = 'released'")).toEqual([U.admin]);
    expect(await ev('release_policy', 'INSERT', null, "after->>'set_by' IS NOT NULL")).toEqual([U.owner]);
    expect(await ev('release_policy', 'UPDATE', null, "after->>'archived_at' IS NOT NULL")).toEqual([U.owner]);
    expect(await ev('signature', 'INSERT', null, "after->>'dataset_id' = '" + ds + "'")).toEqual([U.owner, U.admin]);
    expect(await ev('dataset', 'UPDATE', ds, "after->>'status' = 'released'")).toEqual([U.admin]);
  });
});

// ---------------------------------------------------------------- wave 2 fixes: storage, name dictionary

describe('bucket admin-files', () => {
  const put = (name) => db.query("INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('admin-files', $1, auth.uid())", [name]);
  const good = `${C.A}/ORD001/review-1/results.txt`;

  test('is private and staff-only: operators upload under <client_id>/<order_code>/, clients and lab members cannot', async () => {
    await as(db, null);
    expect((await db.query("SELECT public FROM storage.buckets WHERE id = 'admin-files'")).rows).toEqual([{ public: false }]);
    await as(db, U.operator);
    await put(good);
    for (const u of [U.aAdmin, U.aReq, U.aView, U.member]) {
      await as(db, u);
      await expect(put(`${C.A}/ORD001/review-1/client.txt`), u).rejects.toThrow(/row-level security/);
      expect(await count(db, "SELECT 1 FROM storage.objects WHERE bucket_id = 'admin-files'"), u).toBe(0);
    }
    for (const u of [U.operator, U.admin, U.owner]) {
      await as(db, u);
      expect(await count(db, "SELECT 1 FROM storage.objects WHERE bucket_id = 'admin-files'"), u).toBe(1);
    }
  });

  test('refuses paths outside a live order of the named client', async () => {
    await as(db, U.operator);
    for (const bad of [`${C.B}/ORD001/x.txt`, `${C.A}/ORD999/x.txt`, 'ORD001/x.txt', `${C.A}/ORD001`, `${C.A}/ORD001/`, `${C.A}/ORD001/../ORD002/x.txt`, `${C.A}/ord001/x.txt`, `${C.A}/ORD001//x.txt`]) {
      await expect(put(bad), bad).rejects.toThrow(/row-level security/);
    }
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET archived_at = now(), archived_reason = 'cancelled' WHERE id = $1", [id(101)]);
    await as(db, U.operator);
    await expect(put(good)).rejects.toThrow(/row-level security/);
  });

  test('never overwrites an existing object, nor removes one a results file records (0012 removes only unrecorded ones)', async () => {
    await as(db, U.operator);
    await put(good);
    await expect(put(good)).rejects.toThrow(/duplicate key/);
    await db.query("SELECT admin.accept_result_file($1, $2, $3, '3.4.5', 'Global v1', '{}'::jsonb)", [id(101), good, 'c'.repeat(64)]);
    for (const u of [U.operator, U.owner]) {
      await as(db, u);
      expect((await db.query("UPDATE storage.objects SET owner = NULL WHERE bucket_id = 'admin-files'")).affectedRows, u).toBe(0);
      expect((await db.query("DELETE FROM storage.objects WHERE bucket_id = 'admin-files'")).affectedRows, u).toBe(0);
    }
    await as(db, null);
    expect(await count(db, "SELECT 1 FROM storage.objects WHERE bucket_id = 'admin-files' AND owner = $1", [U.operator])).toBe(1);
  });
});

describe('lab-wide name dictionary', () => {
  test('holds one live mapping per export name; client-scoped and archived mappings do not conflict', async () => {
    await as(db, U.operator); // seed: lab-wide 'CE 24:4 +NH4'
    await expect(db.query("INSERT INTO admin.name_map(export_name, clean_name) VALUES ('CE 24:4 +NH4', 'CE 24:4 (other)')")).rejects.toThrow(/duplicate key.*name_map_lab_wide_export_name/);
    await db.query("INSERT INTO admin.name_map(client_id, export_name, clean_name) VALUES ($1, 'CE 24:4 +NH4', 'CE 24:4')", [C.A]);
    await db.query("UPDATE admin.name_map SET archived_at = now(), archived_reason = 'replaced' WHERE id = $1", [id(300)]);
    await db.query("INSERT INTO admin.name_map(export_name, clean_name) VALUES ('CE 24:4 +NH4', 'CE 24:4 [M+NH4]')");
    expect(await count(db, "SELECT 1 FROM admin.name_map WHERE export_name = 'CE 24:4 +NH4' AND client_id IS NULL AND archived_at IS NULL")).toBe(1);
  });
});
