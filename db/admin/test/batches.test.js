// Batches (0016_batches.sql): admin.create_batch, admin.mark_batch_exported, admin.mark_batch_acquired.
// Synthetic data only. The seed has two clients; sample 103/104 (order 101, client A) and 203/204 (order 201, client B).
// Aliquot 105 (sample 103) and 205 (sample 203) exist and sit in the seeded batches B2026-001 / B2026-002, which these
// tests first mark acquired so their samples are free to batch (one test puts B2026-001 back to planned).
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, count, id, U, C } from './helpers.js';

let db;
let CODE; // sample id -> its lab code (ORD001-S001): the only name an Unknown injection may carry
beforeEach(async () => {
  db = await freshDb();
  CODE = Object.fromEntries((await db.query('SELECT id, sample_code FROM admin.sample')).rows.map((r) => [r.id, r.sample_code]));
  // Seeded orders sit at Request; samples exist, so the lab has registered them.
  await as(db, null);
  await db.query("UPDATE admin.\"order\" SET stage = 'registered'");
  await db.query("UPDATE admin.batch SET status = 'acquired'");
});
afterEach(async () => { await db?.close(); });

const PANEL = id(501);
const S = { a1: id(103), a2: id(104), b2: id(204), b1: id(203) };
const rules = { rules: { blanksAtStart: 1, pooledQcEvery: 2, blankAfterQc: false, qcAtEnd: true, randomize: true, seed: 'syn' }, minutesPerInjection: 12 };
const unknown = (seq, sample, name = CODE[sample]) => ({ seq, sample_type: 'Unknown', sample_name: name, sample_id: sample, plate: 'Plate 1', vial: `A${seq}` });
const control = (seq, type, name) => ({ seq, sample_type: type, sample_name: name, sample_id: null, plate: 'Plate 1', vial: `B${seq}` });
const injections = () => [
  control(1, 'Blank', 'Blank_001'), unknown(2, S.a1), unknown(3, S.a2),
  control(4, 'Quality Control', 'QC_001'), unknown(5, S.b2),
];
const create = (name = null, panel = PANEL, r = rules, inj = injections()) =>
  db.query('SELECT admin.create_batch($1, $2, $3::jsonb, $4::jsonb) AS id', [name, panel, JSON.stringify(r), JSON.stringify(inj)]).then((x) => x.rows[0].id);
const owner = async (sql, p = []) => { await as(db, null); return (await db.query(sql, p)).rows; };
const stage = async (oid) => (await owner('SELECT stage FROM admin."order" WHERE id = $1', [oid]))[0].stage;
const sha = 'c'.repeat(64);
// What the app hashes: the latest live version's live injections in sequence order, as the sequence CSV's columns.
const hashed = (bid) => owner(`SELECT i.seq, i.sample_type, i.sample_name, i.client_id, i.aliquot_id, coalesce(i.plate, '') AS plate, coalesce(i.vial, '') AS vial
  FROM admin.injection i JOIN admin.batch_version v ON v.id = i.batch_version_id
 WHERE v.id = (SELECT id FROM admin.batch_version WHERE batch_id = $1 AND archived_at IS NULL ORDER BY version DESC LIMIT 1) AND i.archived_at IS NULL
 ORDER BY i.seq`, [bid]);
// mark_batch_exported as user u, sending the injections it hashed (read now unless given).
const exportAs = async (u, bid, list, hash = sha) => {
  const sent = list ?? await hashed(bid);
  await as(db, u);
  return db.query('SELECT admin.mark_batch_exported($1, $2, $3::jsonb)', [bid, hash, JSON.stringify(sent)]);
};
const year = async () => (await owner("SELECT to_char(now(), 'YYYY') AS y"))[0].y;

describe('admin.create_batch', () => {
  test('lab staff create a planned batch with version 1, its rules, every injection and the orders In batch', async () => {
    for (const u of [U.operator, U.admin, U.owner]) {
      await as(db, u);
      const bid = await create();
      const [b] = await owner('SELECT * FROM admin.batch WHERE id = $1', [bid]);
      expect(b).toMatchObject({ status: 'planned', panel_id: PANEL, instrument_id: id(500), imported: false, archived_at: null });
      expect(b.name).toMatch(/^B\d{4}-\d{3,}$/);
      const [v] = await owner('SELECT * FROM admin.batch_version WHERE batch_id = $1', [bid]);
      expect(v).toMatchObject({ version: 1, exported_at: null, sequence_sha256: null });
      expect(v.rules).toEqual(rules);
      const inj = await owner('SELECT * FROM admin.injection WHERE batch_version_id = $1 ORDER BY seq', [v.id]);
      expect(inj.map((i) => [i.seq, i.sample_type, i.sample_name, i.plate, i.vial, i.status])).toEqual([
        [1, 'Blank', 'Blank_001', 'Plate 1', 'B1', 'planned'], [2, 'Unknown', CODE[S.a1], 'Plate 1', 'A2', 'planned'],
        [3, 'Unknown', CODE[S.a2], 'Plate 1', 'A3', 'planned'], [4, 'Quality Control', 'QC_001', 'Plate 1', 'B4', 'planned'],
        [5, 'Unknown', CODE[S.b2], 'Plate 1', 'A5', 'planned'],
      ]);
      expect(inj[0]).toMatchObject({ client_id: null, aliquot_id: null });
      expect(inj[1]).toMatchObject({ client_id: C.A, aliquot_id: id(105) }); // the sample's live aliquot is reused
      expect(inj[4].client_id).toBe(C.B);
      expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'batch' AND entity_id = $1 AND action = 'INSERT' AND actor = $2", [bid, u])).toBe(1);
      // Reset for the next staff role: the injections' samples may be batched once per planned batch.
      await as(db, null);
      await db.query("UPDATE admin.batch SET status = 'acquired' WHERE id = $1", [bid]);
    }
  });

  test('a sample with no aliquot gets one, extracted by the caller; the orders move to In batch', async () => {
    await as(db, U.operator);
    await create();
    const [a] = await owner('SELECT * FROM admin.aliquot WHERE sample_id = $1', [S.a2]);
    expect(a).toMatchObject({ client_id: C.A, extracted_by: U.operator });
    expect(a.extracted_at).not.toBe(null);
    expect(await stage(id(101))).toBe('in_batch');
    expect(await stage(id(201))).toBe('in_batch');
  });

  test('numbers the batch after the highest of the year; an explicit valid name is kept', async () => {
    const y = await year();
    await as(db, U.operator);
    const first = (await owner('SELECT name FROM admin.batch WHERE id = $1', [await create()]))[0].name;
    expect(first).toBe(y === '2026' ? 'B2026-003' : `B${y}-001`);
    await as(db, null);
    await db.query("UPDATE admin.batch SET status = 'acquired'");
    await as(db, U.operator);
    const named = await create('B2027-041', PANEL, rules, [unknown(1, S.a1)]);
    expect((await owner('SELECT name FROM admin.batch WHERE id = $1', [named]))[0].name).toBe('B2027-041');
  });

  test('refuses a bad or taken batch name', async () => {
    await as(db, U.operator);
    await expect(create('batch-7')).rejects.toThrow(/batch name/);
    await expect(create('B2026-001')).rejects.toThrow(/already used/);
  });

  test('refuses a caller who is not a lab writer', async () => {
    for (const u of [U.member, U.aAdmin, U.aReq, U.aView]) {
      await as(db, u);
      await expect(create(), u).rejects.toThrow(/only lab staff/);
    }
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.batch')).toBe(2);
  });

  test('refuses a missing, unknown or archived panel and a rules value that is not an object', async () => {
    await as(db, null);
    await db.query("INSERT INTO admin.panel(id, name, dataset_type, archived_at, archived_reason) VALUES ($1, 'Retired panel', 'global', now(), 'synthetic')", [id(502)]);
    await as(db, U.operator);
    await expect(create(null, null)).rejects.toThrow(/panel is required/);
    await expect(create(null, id(998))).rejects.toThrow(/panel .* not found/);
    await expect(create(null, id(502))).rejects.toThrow(/panel .* is archived/);
    await expect(create(null, PANEL, [1])).rejects.toThrow(/rules must be a JSON object/);
  });

  test('refuses an empty list, a sequence that is not 1..n, bad types, blank or repeated names', async () => {
    await as(db, U.operator);
    await expect(create(null, PANEL, rules, [])).rejects.toThrow(/non-empty JSON array/);
    await expect(create(null, PANEL, rules, [unknown(2, S.a1)])).rejects.toThrow(/sequence must run 1\.\.n/);
    await expect(create(null, PANEL, rules, [{ ...unknown(1, S.a1), sample_type: 'Standard' }])).rejects.toThrow(/sample_type/);
    await expect(create(null, PANEL, rules, [unknown(1, S.a1, '  ')])).rejects.toThrow(/needs a sample_name/);
    await expect(create(null, PANEL, rules, [unknown(1, S.a1, 'Same'), unknown(2, S.a2, 'Same')])).rejects.toThrow(/sample_name .* more than once/);
  });

  test('refuses an Unknown without a sample, a control with one, a repeated sample and an unknown or archived sample', async () => {
    await as(db, U.operator);
    await expect(create(null, PANEL, rules, [unknown(1, null, 'X')])).rejects.toThrow(/Unknown injection and needs a sample_id/);
    await expect(create(null, PANEL, rules, [{ ...control(1, 'Blank', 'Blank_001'), sample_id: S.a1 }])).rejects.toThrow(/control injection .* no sample/);
    await expect(create(null, PANEL, rules, [unknown(1, S.a1, 'X'), unknown(2, S.a1, 'Y')])).rejects.toThrow(/sample .* more than once/);
    await expect(create(null, PANEL, rules, [unknown(1, id(997), 'ORD001-S999')])).rejects.toThrow(/not found or archived/);
    await as(db, null);
    await db.query("UPDATE admin.sample SET archived_at = now(), archived_reason = 'synthetic' WHERE id = $1", [S.a2]);
    await as(db, U.operator);
    await expect(create(null, PANEL, rules, [unknown(1, S.a2)])).rejects.toThrow(/not found or archived/);
  });

  test('refuses a sample already in another planned batch, and orders that are not registered yet or already processed', async () => {
    await as(db, null);
    await db.query("UPDATE admin.batch SET status = 'planned' WHERE name = 'B2026-001'");
    await as(db, U.operator);
    await expect(create(null, PANEL, rules, [unknown(1, S.b1)])).rejects.toThrow(/already in a planned batch \(B2026-001/);
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET stage = 'request' WHERE id = $1", [id(101)]);
    await as(db, U.operator);
    await expect(create(null, PANEL, rules, [unknown(1, S.a1)])).rejects.toThrow(/ORD\d+ is at request/);
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET stage = 'processed' WHERE id = $1", [id(101)]);
    await as(db, U.operator);
    await expect(create(null, PANEL, rules, [unknown(1, S.a1)])).rejects.toThrow(/ORD\d+ is at processed/);
  });

  test('is all-or-nothing: a refusal leaves no batch, injection, aliquot or stage change', async () => {
    await as(db, U.operator);
    const before = await owner('SELECT (SELECT count(*) FROM admin.batch)::int b, (SELECT count(*) FROM admin.injection)::int i, (SELECT count(*) FROM admin.aliquot)::int a');
    await expect(create(null, PANEL, rules, [unknown(1, S.a1), unknown(2, S.a2), unknown(3, id(997), 'ORD001-S999')])).rejects.toThrow();
    expect(await owner('SELECT (SELECT count(*) FROM admin.batch)::int b, (SELECT count(*) FROM admin.injection)::int i, (SELECT count(*) FROM admin.aliquot)::int a')).toEqual(before);
    expect(await stage(id(101))).toBe('registered');
  });

  test('never moves an order backwards: an order already Acquired stays Acquired', async () => {
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET stage = 'acquired' WHERE id = $1", [id(101)]);
    await as(db, U.operator);
    await create(null, PANEL, rules, [unknown(1, S.a1)]);
    expect(await stage(id(101))).toBe('acquired');
  });

  test('refuses an Unknown not named by its own sample code (never client-written text such as the FullName)', async () => {
    await as(db, U.operator);
    await expect(create(null, PANEL, rules, [unknown(1, S.a1, 'Ctrl_1')])).rejects.toThrow(new RegExp(`must be named by its sample code ${CODE[S.a1]}`));
    await expect(create(null, PANEL, rules, [unknown(1, S.a1, CODE[S.a2])])).rejects.toThrow(/must be named by its sample code/);
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.batch')).toBe(2);
  });

  test('refuses samples of an archived client, like create_order', async () => {
    await as(db, null);
    await db.query("UPDATE admin.client SET archived_at = now(), archived_reason = 'synthetic' WHERE id = $1", [C.B]);
    await as(db, U.operator);
    await expect(create()).rejects.toThrow(/client Synthetic Company Beta is archived/);
    await expect(create(null, PANEL, rules, [unknown(1, S.b1)])).rejects.toThrow(/client .* is archived/);
    await create(null, PANEL, rules, [unknown(1, S.a1)]); // client A is still active
  });
});

describe('admin.mark_batch_exported', () => {
  test('freezes the version with the sequence hash, marks the batch and moves the orders to Sequence exported', async () => {
    await as(db, U.operator);
    const bid = await create();
    await exportAs(U.operator, bid);
    const [v] = await owner('SELECT * FROM admin.batch_version WHERE batch_id = $1', [bid]);
    expect(v).toMatchObject({ sequence_sha256: sha, exported_by: U.operator });
    expect(v.exported_at).not.toBe(null);
    expect((await owner('SELECT status FROM admin.batch WHERE id = $1', [bid]))[0].status).toBe('sequence_exported');
    expect(await stage(id(101))).toBe('sequence_exported');
    expect(await stage(id(201))).toBe('sequence_exported');
    // The existing freeze triggers now hold the sequence.
    await as(db, U.operator);
    await expect(db.query("UPDATE admin.injection SET sample_name = 'renamed' WHERE batch_version_id = $1 AND seq = 2", [v.id])).rejects.toThrow(/frozen/);
    await expect(db.query('UPDATE admin.batch_version SET sequence_sha256 = $2 WHERE id = $1', [v.id, 'd'.repeat(64)])).rejects.toThrow(/frozen/);
  });

  test('refuses (PT409) when the injections changed after the app read and hashed them, and freezes nothing', async () => {
    await as(db, U.operator);
    const bid = await create();
    const read = await hashed(bid);
    // A concurrent edit lands between the app's read (and hash) and the call.
    await as(db, U.operator);
    await db.query("UPDATE admin.injection SET vial = 'H12' WHERE seq = 2 AND batch_version_id = (SELECT id FROM admin.batch_version WHERE batch_id = $1)", [bid]);
    const refused = await exportAs(U.operator, bid, read).catch((e) => e);
    expect(refused).toMatchObject({ code: 'PT409', message: expect.stringMatching(/changed after it was read; download it again/) });
    await as(db, U.operator);
    await db.query("UPDATE admin.injection SET archived_at = now(), archived_reason = 'synthetic' WHERE seq = 3 AND batch_version_id = (SELECT id FROM admin.batch_version WHERE batch_id = $1)", [bid]);
    await expect(exportAs(U.operator, bid, [...read.slice(0, 2), ...read.slice(3)])).rejects.toMatchObject({ code: 'PT409' }); // the vial edit was not read
    await expect(db.query('SELECT admin.mark_batch_exported($1, $2, NULL)', [bid, sha])).rejects.toMatchObject({ code: 'PT409' });
    const [v] = await owner('SELECT exported_at FROM admin.batch_version WHERE batch_id = $1', [bid]);
    expect(v.exported_at).toBe(null);
    expect(await stage(id(101))).toBe('in_batch');
    await exportAs(U.operator, bid); // read again: exports
    expect(await stage(id(101))).toBe('sequence_exported');
  });

  test('an injection of an exported version cannot be archived, so its sequence file never changes', async () => {
    await as(db, U.operator);
    const bid = await create();
    await exportAs(U.operator, bid);
    const before = await hashed(bid);
    for (const u of [U.operator, null]) {
      await as(db, u);
      await expect(db.query("UPDATE admin.injection SET archived_at = now(), archived_reason = 'synthetic' WHERE seq = 2 AND batch_version_id = (SELECT id FROM admin.batch_version WHERE batch_id = $1)", [bid]))
        .rejects.toThrow(/frozen/);
    }
    expect(await hashed(bid)).toEqual(before);
    // Acquisition status still moves, and the version itself may still be archived as a whole.
    await as(db, U.operator);
    await db.query('SELECT admin.mark_batch_acquired($1)', [bid]);
    await as(db, null);
    await db.query("UPDATE admin.batch_version SET archived_at = now(), archived_reason = 'synthetic' WHERE batch_id = $1", [bid]);
  });

  test('exports the latest version only: other live versions stay unfrozen and their orders do not move', async () => {
    await as(db, U.operator);
    const bid = await create();
    // Version 2 (client A's two samples only) supersedes version 1, which is still live.
    await as(db, null);
    const v2 = (await db.query('INSERT INTO admin.batch_version (batch_id, version) VALUES ($1, 2) RETURNING id', [bid])).rows[0].id;
    const ali = (await db.query('SELECT id FROM admin.aliquot WHERE sample_id = $1', [S.a2])).rows[0].id;
    await db.query(`INSERT INTO admin.injection (batch_version_id, seq, sample_type, sample_name, client_id, aliquot_id, plate, vial)
      VALUES ($1, 1, 'Unknown', $2, $3, $4, 'Plate 1', 'A1'), ($1, 2, 'Unknown', $5, $3, $6, 'Plate 1', 'A2')`, [v2, CODE[S.a1], C.A, id(105), CODE[S.a2], ali]);
    await exportAs(U.operator, bid);
    const versions = await owner('SELECT version, sequence_sha256 FROM admin.batch_version WHERE batch_id = $1 ORDER BY version', [bid]);
    expect(versions).toEqual([{ version: 1, sequence_sha256: null }, { version: 2, sequence_sha256: sha }]);
    expect(await stage(id(101))).toBe('sequence_exported');
    expect(await stage(id(201))).toBe('in_batch'); // only version 1 holds client B's sample

    await as(db, U.operator);
    await db.query('SELECT admin.mark_batch_acquired($1)', [bid]);
    expect(await owner('SELECT v.version, i.status, count(*)::int n FROM admin.injection i JOIN admin.batch_version v ON v.id = i.batch_version_id WHERE v.batch_id = $1 GROUP BY 1, 2 ORDER BY 1', [bid]))
      .toEqual([{ version: 1, status: 'planned', n: 5 }, { version: 2, status: 'acquired', n: 2 }]);
    expect(await stage(id(101))).toBe('acquired');
    expect(await stage(id(201))).toBe('in_batch');
  });

  test('refuses a bad hash, a second export, a batch that is not planned, an unknown batch and non-writers', async () => {
    await as(db, U.operator);
    const bid = await create();
    await expect(exportAs(U.operator, bid, undefined, 'xyz')).rejects.toThrow(/64 lowercase hex/);
    await expect(exportAs(U.operator, id(996))).rejects.toThrow(/batch .* not found/);
    for (const u of [U.member, U.aAdmin, U.aReq, U.aView]) {
      await expect(exportAs(u, bid), u).rejects.toThrow(/only lab staff/);
    }
    await as(db, U.operator);
    await exportAs(U.operator, bid);
    await expect(exportAs(U.operator, bid)).rejects.toThrow(/already sequence_exported/);
    expect(await stage(id(101))).toBe('sequence_exported');
  });
});

describe('admin.mark_batch_acquired', () => {
  test('marks the batch and its injections acquired and moves the orders to Acquired', async () => {
    await as(db, U.operator);
    const bid = await create();
    await exportAs(U.operator, bid);
    await db.query('SELECT admin.mark_batch_acquired($1)', [bid]);
    expect((await owner('SELECT status FROM admin.batch WHERE id = $1', [bid]))[0].status).toBe('acquired');
    expect(await owner("SELECT i.status FROM admin.injection i JOIN admin.batch_version v ON v.id = i.batch_version_id WHERE v.batch_id = $1", [bid]))
      .toEqual(Array(5).fill({ status: 'acquired' }));
    expect(await stage(id(101))).toBe('acquired');
    expect(await stage(id(201))).toBe('acquired');
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'batch' AND entity_id = $1 AND action = 'UPDATE' AND actor IS NOT NULL", [bid])).toBeGreaterThanOrEqual(2);
  });

  test('refuses a batch whose sequence was not exported, a second call, an unknown batch and non-writers', async () => {
    await as(db, U.operator);
    const bid = await create();
    await expect(db.query('SELECT admin.mark_batch_acquired($1)', [bid])).rejects.toThrow(/planned; export its sequence first/);
    await expect(db.query('SELECT admin.mark_batch_acquired($1)', [id(996)])).rejects.toThrow(/batch .* not found/);
    await exportAs(U.operator, bid);
    for (const u of [U.member, U.aAdmin, U.aReq, U.aView]) {
      await as(db, u);
      await expect(db.query('SELECT admin.mark_batch_acquired($1)', [bid]), u).rejects.toThrow(/only lab staff/);
    }
    await as(db, U.operator);
    await db.query('SELECT admin.mark_batch_acquired($1)', [bid]);
    await expect(db.query('SELECT admin.mark_batch_acquired($1)', [bid])).rejects.toThrow(/already acquired/);
    expect(await stage(id(101))).toBe('acquired');
  });

  test('refuses when a newer version appeared after the export: only the exported version is acquired', async () => {
    await as(db, U.operator);
    const bid = await create();
    await exportAs(U.operator, bid);
    await as(db, null);
    await db.query('INSERT INTO admin.batch_version (batch_id, version) VALUES ($1, 2)', [bid]);
    await as(db, U.operator);
    await expect(db.query('SELECT admin.mark_batch_acquired($1)', [bid])).rejects.toThrow(/latest version of batch .* was not exported/);
    expect(await stage(id(101))).toBe('sequence_exported');
  });
});

describe('batch functions: definer, search_path, grants', () => {
  test.each([
    'admin.create_batch(text, uuid, jsonb, jsonb)',
    'admin.mark_batch_exported(uuid, text, jsonb)',
    'admin.mark_batch_acquired(uuid)',
  ])('%s is SECURITY DEFINER with search_path pinned, for authenticated and not anon', async (sig) => {
    await as(db, null);
    const fn = (await db.query('SELECT prosecdef, proconfig FROM pg_proc WHERE oid = $1::regprocedure', [sig])).rows[0];
    expect(fn.prosecdef).toBe(true);
    expect(fn.proconfig.join()).toMatch(/search_path=/);
    const can = async (role) => (await db.query(`SELECT has_function_privilege('${role}', '${sig}', 'EXECUTE') AS ok`)).rows[0].ok;
    expect(await can('authenticated')).toBe(true);
    expect(await can('anon')).toBe(false);
  });
});

// 0031_injection_status.sql: the run monitor records how each injection of an exported batch went.
describe('admin.record_injection_status', () => {
  const record = async (bid, rows, u = U.operator) => { await as(db, u); return db.query('SELECT admin.record_injection_status($1, $2::jsonb) AS n', [bid, JSON.stringify(rows)]).then((x) => x.rows[0].n); };
  const statuses = async (bid) => Object.fromEntries((await owner(`SELECT i.sample_name, i.status FROM admin.injection i
    JOIN admin.batch_version v ON v.id = i.batch_version_id WHERE v.batch_id = $1 AND i.archived_at IS NULL`, [bid])).map((r) => [r.sample_name, r.status]));

  test('a lab writer records acquired, failed and skipped by injection name; the batch and orders stay where they are', async () => {
    await as(db, U.operator);
    const bid = await create();
    await exportAs(U.operator, bid);
    expect(await record(bid, [{ sample_name: 'Blank_001', status: 'acquired' }, { sample_name: CODE[S.a1], status: 'Failed' }, { sample_name: 'QC_001', status: 'skipped' }])).toBe(3);
    const s = await statuses(bid);
    expect(s).toMatchObject({ Blank_001: 'acquired', [CODE[S.a1]]: 'failed', QC_001: 'skipped', [CODE[S.a2]]: 'planned' });
    expect((await owner('SELECT status FROM admin.batch WHERE id = $1', [bid]))[0].status).toBe('sequence_exported');
    expect(await stage(id(101))).toBe('sequence_exported');
    // The same status again changes nothing; Mark acquired then leaves the failed and skipped ones as they are.
    expect(await record(bid, [{ sample_name: 'Blank_001', status: 'acquired' }])).toBe(0);
    await as(db, U.operator);
    await db.query('SELECT admin.mark_batch_acquired($1)', [bid]);
    expect(await statuses(bid)).toMatchObject({ [CODE[S.a1]]: 'failed', QC_001: 'skipped', [CODE[S.a2]]: 'acquired' });
    // After acquisition a failure noticed late may still be recorded.
    expect(await record(bid, [{ sample_name: CODE[S.a2], status: 'failed' }])).toBe(1);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'injection' AND action = 'UPDATE' AND actor = $1", [U.operator])).toBeGreaterThanOrEqual(3);
  });

  test('refuses a planned batch, an unknown name or status, an empty list and anyone who is not a lab writer', async () => {
    await as(db, U.operator);
    const bid = await create();
    await expect(record(bid, [{ sample_name: 'Blank_001', status: 'acquired' }])).rejects.toThrow(/is planned; injection status is recorded once/);
    await exportAs(U.operator, bid);
    await expect(record(bid, [{ sample_name: 'Nope_001', status: 'acquired' }])).rejects.toThrow(/has no injection named Nope_001/);
    await expect(record(bid, [{ sample_name: 'Blank_001', status: 'running' }])).rejects.toThrow(/not one of planned, acquired, failed, skipped/);
    await expect(record(bid, [])).rejects.toThrow(/at least one injection/);
    // One bad row refuses the whole call.
    await expect(record(bid, [{ sample_name: 'Blank_001', status: 'failed' }, { sample_name: 'Nope_001', status: 'failed' }])).rejects.toThrow(/Nope_001/);
    expect((await statuses(bid)).Blank_001).toBe('planned');
    for (const u of [U.member, U.aAdmin, U.aReq, U.aView]) {
      await expect(record(bid, [{ sample_name: 'Blank_001', status: 'acquired' }], u), u).rejects.toThrow(/only lab staff/);
    }
  });
});
