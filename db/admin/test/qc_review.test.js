// 0027_qc_review.sql (QC review, 2026-11-10): add_exclusion, withdraw_exclusion and mark_qc_checked, for lab writers
// only, while the sample's order is processed or QC reviewed; one live exclusion per sample; the app role no longer
// writes admin.exclusion directly; the release path builds from processed and from qc_checked alike, and does not
// read exclusions. Synthetic data only.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, id, U, C } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const code = async (p) => p.then(() => 'ok', (e) => e.code);
const sha = (c) => c.repeat(64);
// The seed (helpers.js): client A's order id(101) with samples id(103) Ctrl_1 and id(104) Trt_1; Trt_1 has the live
// exclusion id(107). Client B's order id(201) has id(203) and id(204), and the exclusion id(207).
const ORDER_A = id(101);
const CTRL = id(103);
const TRT = id(104);
const SEEDED = id(107);
const ORDER_B = id(201);

const add = (sample, reason = 'haemolysed tube') => db.query('SELECT admin.add_exclusion($1, $2) AS id', [sample, reason]).then((r) => r.rows[0].id);
const withdraw = (exclusion, reason = 'decision reversed') => db.query('SELECT admin.withdraw_exclusion($1, $2)', [exclusion, reason]);
const markQc = (order) => db.query('SELECT admin.mark_qc_checked($1)', [order]);
async function setStage(order, stage) { await as(db, null); await db.query('UPDATE admin."order" SET stage = $2 WHERE id = $1', [order, stage]); }
async function stageOf(order) { await as(db, null); return (await db.query('SELECT stage FROM admin."order" WHERE id = $1', [order])).rows[0].stage; }
async function exclusion(eid) {
  await as(db, null);
  return (await db.query('SELECT sample_id, client_id, reason, decided_by, archived_at IS NOT NULL AS archived, archived_reason FROM admin.exclusion WHERE id = $1', [eid])).rows[0];
}

describe('0027: the functions and the table grants', () => {
  test('the three functions are SECURITY DEFINER, pin search_path and run for authenticated only; the helper for nobody', async () => {
    for (const signature of ['admin.add_exclusion(uuid, text)', 'admin.withdraw_exclusion(uuid, text)', 'admin.mark_qc_checked(uuid)', 'admin.lock_order_for_exclusions(uuid)']) {
      const r = (await db.query(`SELECT prosecdef, proconfig, proacl::text AS acl, has_function_privilege('authenticated', oid, 'EXECUTE') AS app,
        has_function_privilege('anon', oid, 'EXECUTE') AS anon FROM pg_proc WHERE oid = $1::regprocedure`, [signature])).rows[0];
      expect(r.prosecdef, signature).toBe(true);
      expect(r.proconfig.join(','), signature).toMatch(/^search_path=pg_catalog, ?admin$/);
      expect(r.app, signature).toBe(!signature.includes('lock_order_for_exclusions'));
      expect(r.anon, signature).toBe(false);
      expect(r.acl, signature).not.toMatch(/(^|[{,])=X/);
    }
  });

  test('the app role reads exclusions but no longer inserts or updates them directly', async () => {
    const priv = async (p) => (await db.query("SELECT has_table_privilege('authenticated', 'admin.exclusion', $1) AS ok", [p])).rows[0].ok;
    expect([await priv('SELECT'), await priv('INSERT'), await priv('UPDATE')]).toEqual([true, false, false]);
    await setStage(ORDER_A, 'processed');
    await as(db, U.operator);
    expect(await code(db.query("INSERT INTO admin.exclusion(client_id, sample_id, reason) VALUES ($1, $2, 'direct')", [C.A, CTRL]))).toBe('42501');
    expect(await code(db.query("UPDATE admin.exclusion SET archived_at = now(), archived_reason = 'direct' WHERE id = $1", [SEEDED]))).toBe('42501');
  });

  test('one live exclusion per sample, also for the migration owner; an archived one does not count', async () => {
    await as(db, null);
    expect(await code(db.query("INSERT INTO admin.exclusion(client_id, sample_id, reason) VALUES ($1, $2, 'second')", [C.A, TRT]))).toBe('23505');
    await db.query("UPDATE admin.exclusion SET archived_at = now(), archived_reason = 'reversed' WHERE id = $1", [SEEDED]);
    expect(await code(db.query("INSERT INTO admin.exclusion(client_id, sample_id, reason) VALUES ($1, $2, 'again')", [C.A, TRT]))).toBe('ok');
  });
});

describe('0027: add_exclusion', () => {
  test('a lab writer excludes a sample of a processed or QC reviewed order, with a trimmed reason and themselves as decider', async () => {
    await setStage(ORDER_A, 'processed');
    for (const user of [U.operator, U.admin]) {
      await as(db, user);
      const eid = await add(CTRL, '  pooled QC drift in this injection  ');
      expect(await exclusion(eid)).toEqual({ sample_id: CTRL, client_id: C.A, reason: 'pooled QC drift in this injection', decided_by: user, archived: false, archived_reason: null });
      await as(db, user);
      await withdraw(eid);
    }
    await setStage(ORDER_A, 'qc_checked');
    await as(db, U.owner);
    expect(await exclusion(await add(CTRL))).toMatchObject({ decided_by: U.owner, archived: false });
  });

  test('refuses other stages, a second live exclusion, an empty reason, an archived sample, an unknown sample', async () => {
    await as(db, U.operator);
    for (const stage of ['request', 'registered', 'acquired', 'excel_built', 'released']) {
      await setStage(ORDER_A, stage);
      await as(db, U.operator);
      await expect(add(CTRL), stage).rejects.toThrow(new RegExp(`is at stage ${stage}; exclusions are recorded only while an order is processed or QC reviewed`));
      expect(await code(add(CTRL)), stage).toBe('55000');
    }
    await setStage(ORDER_A, 'processed');
    await as(db, U.operator);
    await expect(add(TRT)).rejects.toThrow(/-S002 is already excluded; withdraw that exclusion first/);
    expect(await code(add(TRT))).toBe('23505');
    for (const reason of ['', '   ', null]) expect(await code(add(CTRL, reason)), String(reason)).toBe('23502');
    expect(await code(add(id(999)))).toBe('P0002');
    await as(db, null);
    await db.query("UPDATE admin.sample SET archived_at = now(), archived_reason = 'registered twice' WHERE id = $1", [CTRL]);
    await as(db, U.operator);
    expect(await code(add(CTRL))).toBe('P0002');
    await as(db, null);
    expect((await db.query('SELECT count(*)::int AS n FROM admin.exclusion')).rows[0].n).toBe(2);
  });

  test('client roles and a lab member are refused, for their own client too', async () => {
    await setStage(ORDER_A, 'processed');
    for (const user of [U.aAdmin, U.aReq, U.aView, U.member, U.both]) {
      await as(db, user);
      expect(await code(add(CTRL)), user).toBe('42501');
    }
    await as(db, null);
    expect((await db.query('SELECT count(*)::int AS n FROM admin.exclusion WHERE sample_id = $1', [CTRL])).rows[0].n).toBe(0);
  });
});

describe('0027: withdraw_exclusion', () => {
  test('archives a live exclusion with the reason; the sample may then be excluded again', async () => {
    await setStage(ORDER_A, 'qc_checked');
    await as(db, U.operator);
    await withdraw(SEEDED, '  re-read the tube label  ');
    expect(await exclusion(SEEDED)).toMatchObject({ archived: true, archived_reason: 're-read the tube label', reason: 'haemolysed' });
    await as(db, U.operator);
    await expect(withdraw(SEEDED)).rejects.toThrow(/was already withdrawn/);
    expect(await code(withdraw(SEEDED))).toBe('55000');
    expect(await exclusion(await add(TRT, 'confirmed after all'))).toMatchObject({ reason: 'confirmed after all', archived: false });
  });

  test('refuses an empty reason, an unknown exclusion, other stages and anyone but a lab writer', async () => {
    await setStage(ORDER_A, 'processed');
    await as(db, U.operator);
    for (const reason of ['', '  ', null]) expect(await code(withdraw(SEEDED, reason)), String(reason)).toBe('23502');
    expect(await code(withdraw(id(999)))).toBe('P0002');
    for (const user of [U.aAdmin, U.aReq, U.aView, U.member]) {
      await as(db, user);
      expect(await code(withdraw(SEEDED)), user).toBe('42501');
    }
    for (const stage of ['acquired', 'excel_built', 'released']) {
      await setStage(ORDER_A, stage);
      await as(db, U.operator);
      expect(await code(withdraw(SEEDED)), stage).toBe('55000');
    }
    expect(await exclusion(SEEDED)).toMatchObject({ archived: false });
  });
});

describe('0027: mark_qc_checked', () => {
  test('moves a processed order to qc_checked; refused at every other stage and for anyone but a lab writer', async () => {
    for (const stage of ['request', 'received', 'registered', 'acquired', 'qc_checked', 'excel_built', 'released']) {
      await setStage(ORDER_A, stage);
      await as(db, U.operator);
      await expect(markQc(ORDER_A), stage).rejects.toThrow(new RegExp(`is at stage ${stage}; only a processed order can be marked QC reviewed`));
      expect(await stageOf(ORDER_A), stage).toBe(stage);
    }
    await setStage(ORDER_A, 'processed');
    for (const user of [U.aAdmin, U.aReq, U.aView, U.member]) {
      await as(db, user);
      expect(await code(markQc(ORDER_A)), user).toBe('42501');
    }
    expect(await stageOf(ORDER_A)).toBe('processed');
    await as(db, U.operator);
    expect(await code(markQc(id(999)))).toBe('P0002');
    await markQc(ORDER_A);
    expect(await stageOf(ORDER_A)).toBe('qc_checked');
    await as(db, U.operator);
    expect(await code(markQc(ORDER_A))).toBe('55000');
    expect(await stageOf(ORDER_B)).toBe('request');
  });

  test('the audit trigger records each write with the caller as actor', async () => {
    await setStage(ORDER_A, 'processed');
    await as(db, null);
    const mark = (await db.query('SELECT max(id)::bigint AS n FROM admin.audit_event')).rows[0].n;
    await as(db, U.operator);
    const eid = await add(CTRL, 'carry-over suspected');
    await as(db, U.admin);
    await withdraw(eid, 'carry-over ruled out');
    await as(db, U.operator);
    await markQc(ORDER_A);
    await as(db, null);
    const events = (await db.query(`SELECT entity, entity_id, action, actor, client_id, after->>'reason' AS reason, after->>'archived_reason' AS archived_reason,
        before->>'stage' AS before_stage, after->>'stage' AS after_stage FROM admin.audit_event WHERE id > $1 ORDER BY id`, [mark])).rows;
    expect(events).toEqual([
      { entity: 'exclusion', entity_id: eid, action: 'INSERT', actor: U.operator, client_id: C.A, reason: 'carry-over suspected', archived_reason: null, before_stage: null, after_stage: null },
      { entity: 'exclusion', entity_id: eid, action: 'UPDATE', actor: U.admin, client_id: C.A, reason: 'carry-over suspected', archived_reason: 'carry-over ruled out', before_stage: null, after_stage: null },
      { entity: 'order', entity_id: ORDER_A, action: 'UPDATE', actor: U.operator, client_id: C.A, reason: null, archived_reason: null, before_stage: 'processed', after_stage: 'qc_checked' },
    ]);
  });
});

describe('0027: the release path with and without the QC step', () => {
  const MANIFEST = [sha('b'), sha('9'), 1234, sha('7'), 99];
  async function processedOrder() {
    await as(db, U.operator);
    const order = (await db.query("INSERT INTO admin.\"order\"(client_id, title) VALUES ($1, 'QC synthetic') RETURNING id, code", [C.A])).rows[0];
    await db.query("INSERT INTO admin.sample(client_id, order_id, full_name) VALUES ($1, $2, 'Ctrl_1'), ($1, $2, 'Trt_1')", [C.A, order.id]);
    const rf = (await db.query("SELECT admin.accept_result_file($1, 'results/synthetic.txt', $2, '3.4.5', 'Global v1', '{\"analytes\": 42}'::jsonb) AS id", [order.id, sha('a')])).rows[0].id;
    expect(await stageOf(order.id)).toBe('processed');
    await as(db, U.operator);
    return { order, rf };
  }
  const build = (order, rf) => db.query('SELECT admin.build_dataset($1, $2, 1, $3, $4, $5, $6, $7, $8) AS id',
    [order.id, rf, `${C.A}/${order.code}/datasets/${sha('b')}/dataset-v1.xlsx`, ...MANIFEST]).then((r) => r.rows[0].id);

  test('build_dataset from processed (the step skipped) still works and moves the order to Excel built', async () => {
    const { order, rf } = await processedOrder();
    expect(await build(order, rf)).toMatch(/^[0-9a-f-]{36}$/);
    expect(await stageOf(order.id)).toBe('excel_built');
  });

  test('build_dataset from qc_checked works, with exclusions recorded, and leaves the exclusions as they were', async () => {
    const { order, rf } = await processedOrder();
    const sample = (await db.query("SELECT id FROM admin.sample WHERE order_id = $1 AND full_name = 'Trt_1'", [order.id])).rows[0].id;
    const eid = await add(sample, 'haemolysed');
    await markQc(order.id);
    expect(await stageOf(order.id)).toBe('qc_checked');
    await as(db, U.operator);
    const ds = await build(order, rf);
    expect(await stageOf(order.id)).toBe('excel_built');
    expect(await exclusion(eid)).toMatchObject({ archived: false, reason: 'haemolysed' });
    expect((await db.query('SELECT count(*)::int AS n FROM admin.sample WHERE order_id = $1 AND archived_at IS NULL', [order.id])).rows[0].n).toBe(2);
    expect((await db.query('SELECT version, status FROM admin.dataset WHERE id = $1', [ds])).rows[0]).toEqual({ version: 1, status: 'built' });
    // Hooks never change science: the build does not read exclusions at all.
    expect((await db.query("SELECT pg_get_functiondef('admin.build_dataset(uuid, uuid, int, text, text, text, bigint, text, bigint)'::regprocedure) AS def")).rows[0].def).not.toMatch(/exclusion/);
    // Once built, the decisions are frozen with the version: no new exclusion, no withdrawal, no QC mark.
    await as(db, U.operator);
    expect(await code(withdraw(eid))).toBe('55000');
    expect(await code(markQc(order.id))).toBe('55000');
  });
});
