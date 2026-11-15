// 0041_freezers_aliquot_kind_slots.sql: the freezer and rack catalog and each box's place in it, the aliquot's kind
// (original or re-extraction), and one slot for one holder across Storage (box_position) and Receive shipment
// (shipment_tube). Synthetic data only.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, count, id, U, C } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const fail = (p) => p.then(() => ({ code: 'ok' }), (e) => ({ code: e.code, message: e.message }));
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];

// ---------------------------------------------------------------- 1. freezers and racks

describe('freezer-catalog', () => {
  // Seed (helpers.js): freezer id(950) "Freezer F1" (−80 °C) with rack id(951) "Rack 1"; box BOX-1 is in it (id 952).
  const createFreezer = (name, temperature = '-80 °C', note = null) =>
    db.query('SELECT admin.create_freezer($1, $2, $3) AS id', [name, temperature, note]).then((r) => r.rows[0].id);
  const createRack = (freezer, name) => db.query('SELECT admin.create_freezer_rack($1, $2) AS id', [freezer, name]).then((r) => r.rows[0].id);
  const setBox = (box, freezer, rack) => db.query('SELECT admin.set_box_location($1, $2, $3)', [box, freezer, rack]);
  const location = async (box) => {
    await as(db, null);
    return (await db.query('SELECT freezer_id, rack_id FROM admin.storage_box_location WHERE box = $1', [box])).rows[0] ?? null;
  };

  test('installation: definer functions with a pinned search_path for authenticated; tables are read-only to the app', async () => {
    await as(db, null);
    const fns = ['create_freezer', 'archive_freezer', 'create_freezer_rack', 'archive_freezer_rack', 'set_box_location'];
    const rows = (await db.query("SELECT proname, prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app, has_function_privilege('anon', oid, 'EXECUTE') AS anon FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname = ANY($1)", [fns])).rows;
    expect(rows.map((r) => r.proname).sort()).toEqual([...fns].sort());
    for (const r of rows) expect({ name: r.proname, definer: r.prosecdef, path: r.proconfig.join(','), app: r.app, anon: r.anon })
      .toEqual({ name: r.proname, definer: true, path: 'search_path=pg_catalog, admin', app: true, anon: false });
    for (const t of ['freezer', 'freezer_rack', 'storage_box_location']) {
      const priv = async (p) => (await db.query(`SELECT has_table_privilege('authenticated', 'admin.${t}', $1) AS ok`, [p])).rows[0].ok;
      expect([await priv('SELECT'), await priv('INSERT'), await priv('UPDATE'), await priv('DELETE')], t).toEqual([true, false, false, false]);
    }
  });

  test('lab staff read the catalog; client people and a lab member read nothing', async () => {
    for (const u of [U.owner, U.operator]) {
      await as(db, u);
      expect(await count(db, 'SELECT 1 FROM admin.freezer'), u).toBe(1);
      expect(await count(db, 'SELECT 1 FROM admin.freezer_rack'), u).toBe(1);
      expect(await count(db, 'SELECT 1 FROM admin.storage_box_location'), u).toBe(1);
    }
    for (const u of [U.member, U.aAdmin, U.bReq]) {
      await as(db, u);
      for (const t of ['freezer', 'freezer_rack', 'storage_box_location']) expect(await count(db, `SELECT 1 FROM admin.${t}`), `${t} ${u}`).toBe(0);
    }
  });

  test('the Owner or Admin adds freezers and racks (trimmed, named once); an Operator cannot', async () => {
    await as(db, U.admin);
    const f2 = await createFreezer('  Freezer F2 ', ' −20 °C ', '  Corridor ');
    expect(await one('SELECT name, temperature, note FROM admin.freezer WHERE id = $1', [f2])).toEqual({ name: 'Freezer F2', temperature: '−20 °C', note: 'Corridor' });
    const r = await createRack(f2, ' Rack A ');
    expect(await one('SELECT name, freezer_id FROM admin.freezer_rack WHERE id = $1', [r])).toEqual({ name: 'Rack A', freezer_id: f2 });
    // The same rack name in another freezer is fine; twice in one freezer is not.
    await as(db, U.owner);
    await createRack(id(950), 'Rack A');
    expect((await fail(createRack(f2, 'Rack A'))).code).toBe('23505');
    expect((await fail(createFreezer('Freezer F1'))).code).toBe('23505');
    expect((await fail(createFreezer('   '))).code).toBe('22023');
    expect((await fail(createRack(f2, ''))).code).toBe('22023');
    for (const u of [U.operator, U.member, U.aAdmin]) {
      await as(db, u);
      expect((await fail(createFreezer('Freezer F9'))).code, u).toBe('42501');
      expect((await fail(createRack(id(950), 'Rack 9'))).code, u).toBe('42501');
      expect((await fail(db.query("INSERT INTO admin.freezer(name) VALUES ('Direct')"))).code, u).toBe('42501');
    }
  });

  test('a lab writer sets, changes and clears a box location; the rack must be in the freezer and both live', async () => {
    await as(db, U.admin);
    const f2 = await createFreezer('Freezer F2');
    const r2 = await createRack(f2, 'Rack 2');
    await as(db, U.operator);
    await setBox(' BOX-2 ', f2, r2);
    expect(await location('BOX-2')).toEqual({ freezer_id: f2, rack_id: r2 });
    await as(db, U.operator);
    await setBox('BOX-2', id(950), null); // a freezer without a rack
    expect(await location('BOX-2')).toEqual({ freezer_id: id(950), rack_id: null });
    await as(db, U.operator);
    expect((await fail(setBox('BOX-2', id(950), r2))).message).toMatch(/is not in freezer/);
    expect((await fail(setBox('BOX-2', null, r2))).code).toBe('22023');
    expect((await fail(setBox('  ', id(950), null))).code).toBe('22023');
    await setBox('BOX-2', null, null);
    expect(await location('BOX-2')).toEqual({ freezer_id: null, rack_id: null });
    for (const u of [U.member, U.aAdmin]) {
      await as(db, u);
      expect((await fail(setBox('BOX-2', id(950), id(951)))).code, u).toBe('42501');
    }
  });

  test('archive, never delete: a freezer or rack still holding a box is refused; archiving a freezer archives its racks', async () => {
    await as(db, U.admin);
    expect((await fail(db.query('SELECT admin.archive_freezer_rack($1, $2)', [id(951), 'broken']))).message).toMatch(/BOX-1/);
    expect((await fail(db.query('SELECT admin.archive_freezer($1, $2)', [id(950), 'replaced']))).message).toMatch(/BOX-1/);
    expect((await fail(db.query('SELECT admin.archive_freezer($1, $2)', [id(950), '  ']))).code).toBe('22023');
    await as(db, U.operator);
    expect((await fail(db.query('SELECT admin.archive_freezer($1, $2)', [id(950), 'replaced']))).code).toBe('42501');
    await setBox('BOX-1', null, null);
    await as(db, U.admin);
    await db.query('SELECT admin.archive_freezer($1, $2)', [id(950), 'replaced']);
    await as(db, null);
    expect((await db.query('SELECT archived_reason FROM admin.freezer WHERE id = $1', [id(950)])).rows).toEqual([{ archived_reason: 'replaced' }]);
    expect((await db.query('SELECT archived_reason FROM admin.freezer_rack WHERE id = $1', [id(951)])).rows).toEqual([{ archived_reason: 'replaced' }]);
    await as(db, U.operator);
    expect((await fail(setBox('BOX-1', id(950), null))).code).toBe('55000');
    await as(db, U.admin);
    expect((await fail(createRack(id(950), 'Rack 5'))).code).toBe('55000');
    await as(db, null);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity IN ('freezer', 'freezer_rack', 'storage_box_location') AND actor IS NOT NULL")).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------- 2. aliquot kind

describe('aliquot-kind', () => {
  const insert = (sample, client = C.A, kind) => kind === undefined
    ? db.query('INSERT INTO admin.aliquot(client_id, sample_id) VALUES ($1, $2) RETURNING aliquot_code, kind', [client, sample]).then((r) => r.rows[0])
    : db.query('INSERT INTO admin.aliquot(client_id, sample_id, kind) VALUES ($1, $2, $3) RETURNING aliquot_code, kind', [client, sample, kind]).then((r) => r.rows[0]);

  test('existing aliquots are originals; a sample\'s first aliquot is original, a later one a re-extraction unless set', async () => {
    await as(db, null);
    expect((await db.query('SELECT kind FROM admin.aliquot WHERE id = ANY($1)', [[id(105), id(205)]])).rows).toEqual([{ kind: 'original' }, { kind: 'original' }]);
    expect(await insert(id(104))).toEqual({ aliquot_code: 'ORD001-S002-A1', kind: 'original' });
    expect(await insert(id(104))).toEqual({ aliquot_code: 'ORD001-S002-A2', kind: 're_extraction' });
    expect(await insert(id(103))).toEqual({ aliquot_code: 'ORD001-S001-A2', kind: 're_extraction' });
    expect(await insert(id(103), C.A, 'original')).toEqual({ aliquot_code: 'ORD001-S001-A3', kind: 'original' });
    expect((await fail(insert(id(103), C.A, 'copy'))).code).toBe('23514');
  });

  test('create_batch sets it: a re-made aliquot of a used-up one is a re-extraction', async () => {
    await as(db, null);
    // As in batches.test.js: the seeded orders are registered and the seeded batches done, so the samples are free.
    await db.query("UPDATE admin.\"order\" SET stage = 'registered'");
    await db.query("UPDATE admin.batch SET status = 'acquired'");
    // ORD001-S001's only aliquot is used up; ORD001-S002 never had one.
    await db.query("UPDATE admin.aliquot SET archived_at = now(), archived_reason = 'used up' WHERE id = $1", [id(105)]);
    await as(db, U.operator);
    await db.query("SELECT admin.create_batch('B2026-090', $1, '{}'::jsonb, $2::jsonb)", [id(501), JSON.stringify([
      { seq: 1, sample_type: 'Unknown', sample_name: 'ORD001-S001', sample_id: id(103) },
      { seq: 2, sample_type: 'Unknown', sample_name: 'ORD001-S002', sample_id: id(104) },
    ])]);
    await as(db, null);
    expect((await db.query('SELECT aliquot_code, kind FROM admin.aliquot WHERE sample_id = ANY($1) ORDER BY aliquot_code', [[id(103), id(104)]])).rows).toEqual([
      { aliquot_code: 'ORD001-S001-A1', kind: 'original' },
      { aliquot_code: 'ORD001-S001-A2', kind: 're_extraction' },
      { aliquot_code: 'ORD001-S002-A1', kind: 'original' },
    ]);
  });
});

// ---------------------------------------------------------------- 3. one slot, one holder

describe('one-slot', () => {
  // Seed: aliquot id(105) of ORD001-S001 is in BOX-1 A1 (Storage); tube ORD001-S001 was checked in at RCV-1 A1.
  beforeEach(async () => {
    await as(db, null);
    await db.query('UPDATE admin.shipment SET received_at = now() WHERE id = ANY($1)', [[id(102), id(202)]]);
  });
  const newAliquot = async () => {
    await as(db, null);
    return (await db.query('INSERT INTO admin.aliquot(client_id, sample_id) VALUES ($1, $2) RETURNING id', [C.A, id(104)])).rows[0].id;
  };
  const checkIn = (label, box, position) =>
    db.query("SELECT admin.check_in_tube($1, $2, 'intact', $3, $4, null) AS id", [id(102), label, box, position]).then((r) => r.rows[0].id);

  test('Storage refuses a slot a checked-in tube holds (any case), for place and move', async () => {
    const a = await newAliquot();
    await as(db, U.operator);
    const placed = await fail(db.query('SELECT admin.place_aliquot($1, $2, $3)', [a, 'RCV-1', 'A1']));
    expect(placed.code).toBe('PT409');
    expect(placed.message).toMatch(/Box RCV-1 position A1 holds tube ORD001-S001/);
    expect((await fail(db.query('SELECT admin.place_aliquot($1, $2, $3)', [a, 'rcv-1', ' a1 ']))).code).toBe('PT409');
    const moved = await fail(db.query('SELECT admin.move_aliquot($1, $2, $3)', [id(105), 'RCV-1', 'A1']));
    expect(moved.code).toBe('PT409');
    await as(db, null);
    expect((await db.query('SELECT box, position FROM admin.box_position WHERE aliquot_id = $1 AND archived_at IS NULL', [id(105)])).rows).toEqual([{ box: 'BOX-1', position: 'A1' }]);
    // A free slot still works.
    await as(db, U.operator);
    await db.query('SELECT admin.place_aliquot($1, $2, $3)', [a, 'RCV-1', 'A2']);
  });

  test('Receive shipment refuses a slot an aliquot holds in Storage; free again once the aliquot leaves', async () => {
    await as(db, U.operator);
    const r = await fail(checkIn('ORD001-S002', 'BOX-1', 'a1'));
    expect(r.code).toBe('PT409');
    expect(r.message).toMatch(/BOX-1 position A1 already holds aliquot ORD001-S001-A1 in Storage/);
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.shipment_tube WHERE sample_id = $1', [id(104)])).toBe(0);
    await as(db, U.operator);
    await db.query("SELECT admin.remove_aliquot($1, 'used up')", [id(105)]);
    await checkIn('ORD001-S002', 'BOX-1', 'A1');
    // And the other way: a tube checked in again elsewhere frees its old slot for Storage.
    await checkIn('ORD001-S001', 'RCV-1', 'B1');
    const a = await newAliquot();
    await as(db, U.operator);
    await db.query('SELECT admin.place_aliquot($1, $2, $3)', [a, 'RCV-1', 'A1']);
  });

  test('the rule holds for direct writes by the migration owner too (a trigger, not only the functions)', async () => {
    await as(db, null);
    const a = await newAliquot();
    await as(db, null);
    expect((await fail(db.query("INSERT INTO admin.box_position(client_id, aliquot_id, box, position) VALUES ($1, $2, 'RCV-1', 'A1')", [C.A, a]))).code).toBe('PT409');
    expect((await fail(db.query("UPDATE admin.shipment_tube SET box = 'BOX-1', position = 'A1' WHERE id = $1", [id(114)]))).code).toBe('PT409');
  });
});
