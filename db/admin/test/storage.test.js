// Storage (0025_storage.sql): aliquot codes, place_aliquot, move_aliquot, remove_aliquot and the Storage screen's two
// reads (storage_boxes, storage_aliquots). Synthetic data only.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, count, id, U, C } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

// Seed (helpers.js): client A's ORD001 has samples ORD001-S001 (id 103) and ORD001-S002 (id 104); aliquot id(105) of
// S001 is in BOX-1 A1 (placement id 106). Client B's aliquot id(205) is in BOX-2 A1. Both orders are at Request.
const ALQ_A = id(105);
const ALQ_B = id(205);
const place = (a, box, pos) => db.query('SELECT admin.place_aliquot($1, $2, $3) AS id', [a, box, pos]).then((r) => r.rows[0].id);
const move = (a, box, pos) => db.query('SELECT admin.move_aliquot($1, $2, $3) AS id', [a, box, pos]).then((r) => r.rows[0].id);
const remove = (a, reason) => db.query('SELECT admin.remove_aliquot($1, $2)', [a, reason]);
const fail = (p) => p.then(() => ({ code: 'ok' }), (e) => ({ code: e.code, message: e.message }));
const placements = async (a) => {
  await as(db, null);
  return (await db.query('SELECT box, position, archived_reason FROM admin.box_position WHERE aliquot_id = $1 ORDER BY created_at, archived_at NULLS LAST', [a])).rows;
};
// A second aliquot of ORD001-S002, in no box, made by the owner (as create_batch would).
const newAliquot = async (sample = id(104), client = C.A) => {
  await as(db, null);
  return (await db.query('INSERT INTO admin.aliquot(client_id, sample_id) VALUES ($1, $2) RETURNING id, aliquot_code', [client, sample])).rows[0];
};

describe('installation', () => {
  test('the functions are SECURITY DEFINER with a pinned search_path, for authenticated only; nobody writes box_position directly', async () => {
    await as(db, null);
    const fns = ['place_aliquot', 'move_aliquot', 'remove_aliquot', 'storage_boxes', 'storage_aliquots'];
    const rows = (await db.query("SELECT proname, prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app, has_function_privilege('anon', oid, 'EXECUTE') AS anon FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname = ANY($1)", [fns])).rows;
    expect(rows.map((r) => r.proname).sort()).toEqual([...fns].sort());
    for (const r of rows) expect({ name: r.proname, definer: r.prosecdef, path: r.proconfig.join(','), app: r.app, anon: r.anon })
      .toEqual({ name: r.proname, definer: true, path: 'search_path=pg_catalog, admin', app: true, anon: false });
    for (const helper of ['storage_slot(text, text)', 'lock_aliquot(uuid)', 'require_free_slot(text, text)', 'assign_aliquot_code()', 'keep_aliquot_code()']) {
      expect((await db.query(`SELECT has_function_privilege('authenticated', 'admin.${helper}', 'EXECUTE') AS ok`)).rows[0].ok, helper).toBe(false);
    }
    const priv = async (p) => (await db.query("SELECT has_table_privilege('authenticated', 'admin.box_position', $1) AS ok", [p])).rows[0].ok;
    expect([await priv('SELECT'), await priv('INSERT'), await priv('UPDATE'), await priv('DELETE')]).toEqual([true, false, false, false]);
  });

  test('direct writes to box_position are refused for lab writers and client roles alike', async () => {
    for (const u of [U.owner, U.operator, U.aAdmin]) {
      await as(db, u);
      expect((await fail(db.query("INSERT INTO admin.box_position(client_id, aliquot_id, box, position) VALUES ($1, $2, 'BOX-9', 'A1')", [C.A, ALQ_A]))).code, u).toBe('42501');
      expect((await fail(db.query("UPDATE admin.box_position SET box = 'BOX-9' WHERE id = $1", [id(106)]))).code, u).toBe('42501');
    }
  });
});

describe('aliquot codes', () => {
  test('existing aliquots got their sample code plus -A1; the next aliquot of a sample is -A2; the caller cannot choose one', async () => {
    await as(db, null);
    expect((await db.query('SELECT aliquot_code FROM admin.aliquot WHERE id = ANY($1) ORDER BY aliquot_code', [[ALQ_A, ALQ_B]])).rows.map((r) => r.aliquot_code))
      .toEqual(['ORD001-S001-A1', 'ORD002-S001-A1']);
    const second = (await db.query("INSERT INTO admin.aliquot(client_id, sample_id, aliquot_code) VALUES ($1, $2, 'ORD999-S999-A9') RETURNING aliquot_code", [C.A, id(103)])).rows[0];
    expect(second.aliquot_code).toBe('ORD001-S001-A2');
    expect((await newAliquot()).aliquot_code).toBe('ORD001-S002-A1');
  });

  test('a code never changes, even for a lab writer', async () => {
    await as(db, U.operator);
    expect((await fail(db.query("UPDATE admin.aliquot SET aliquot_code = 'ORD001-S001-A9' WHERE id = $1", [ALQ_A]))).code).toBe('55000');
    expect((await db.query('UPDATE admin.aliquot SET volume_ul = 20 WHERE id = $1', [ALQ_A])).affectedRows).toBe(1);
  });
});

describe('who may place, move and remove', () => {
  test('client admins, requesters, viewers and lab members are refused, and nothing changes', async () => {
    const fresh = (await newAliquot()).id;
    for (const u of [U.aAdmin, U.aReq, U.aView, U.bReq, U.both, U.member]) {
      await as(db, u);
      for (const call of [place(fresh, 'BOX-3', 'A1'), move(ALQ_A, 'BOX-3', 'A2'), remove(ALQ_A, 'used up')]) {
        const r = await fail(call);
        expect(r.code, u).toBe('42501');
        expect(r.message, u).toMatch(/only lab staff \(owner, admin, operator\)/);
      }
    }
    expect(await placements(ALQ_A)).toEqual([{ box: 'BOX-1', position: 'A1', archived_reason: null }]);
    expect(await placements(fresh)).toEqual([]);
  });

  test('an Owner, an Admin and an Operator may each place an aliquot, as themselves in the audit log', async () => {
    let n = 0;
    for (const u of [U.owner, U.admin, U.operator]) {
      const fresh = (await newAliquot()).id;
      await as(db, u);
      const p = await place(fresh, 'BOX-3', `B${++n}`);
      await as(db, null);
      expect((await db.query("SELECT actor, after->>'box' AS box FROM admin.audit_event WHERE entity = 'box_position' AND entity_id = $1", [p])).rows).toEqual([{ actor: u, box: 'BOX-3' }]);
    }
  });
});

describe('place_aliquot', () => {
  test('trims box and position and stores the placement for the aliquot\'s client', async () => {
    const fresh = (await newAliquot()).id;
    await as(db, U.operator);
    const p = await place(fresh, '  Freezer 2 / Box 7 ', ' C4  ');
    await as(db, null);
    expect((await db.query('SELECT client_id, aliquot_id, box, position, archived_at FROM admin.box_position WHERE id = $1', [p])).rows[0])
      .toEqual({ client_id: C.A, aliquot_id: fresh, box: 'Freezer 2 / Box 7', position: 'C4', archived_at: null });
  });

  test('refuses a blank box or position', async () => {
    const fresh = (await newAliquot()).id;
    await as(db, U.operator);
    for (const [box, pos, message] of [['  ', 'A1', /Enter a box/], [null, 'A1', /Enter a box/], ['BOX-3', ' ', /Enter a position/], ['BOX-3', null, /Enter a position/]]) {
      const r = await fail(place(fresh, box, pos));
      expect(r.code).toBe('22023');
      expect(r.message).toMatch(message);
    }
    expect(await placements(fresh)).toEqual([]);
  });

  test('refuses an occupied slot, naming the aliquot in it (PT409)', async () => {
    const fresh = (await newAliquot()).id;
    await as(db, U.operator);
    const r = await fail(place(fresh, 'BOX-1', ' A1 '));
    expect(r).toEqual({ code: 'PT409', message: 'Box BOX-1 position A1 already holds ORD001-S001-A1' });
    // Another client's aliquot in the same slot is refused too: a slot is a physical place.
    expect((await fail(place(fresh, 'BOX-2', 'A1'))).message).toBe('Box BOX-2 position A1 already holds ORD002-S001-A1');
    expect(await placements(fresh)).toEqual([]);
  });

  test('refuses an aliquot already in a box (move it instead), an archived aliquot and an unknown one', async () => {
    await as(db, U.operator);
    expect(await fail(place(ALQ_A, 'BOX-3', 'A1'))).toEqual({ code: '55000', message: 'Aliquot ORD001-S001-A1 is already in box BOX-1 position A1; move it instead' });
    const fresh = await newAliquot();
    await db.query("UPDATE admin.aliquot SET archived_at = now(), archived_reason = 'used up' WHERE id = $1", [fresh.id]);
    await as(db, U.operator);
    expect(await fail(place(fresh.id, 'BOX-3', 'A1'))).toEqual({ code: '55000', message: 'Aliquot ORD001-S002-A1 is archived (used up); it cannot be placed' });
    expect((await fail(place(id(9999), 'BOX-3', 'A1'))).code).toBe('P0002');
  });
});

describe('move_aliquot', () => {
  test('archives the old placement with reason moved and inserts the new one; the history stays', async () => {
    await as(db, U.operator);
    const first = await move(ALQ_A, ' BOX-3 ', ' B2 ');
    await as(db, U.admin);
    const second = await move(ALQ_A, 'BOX-1', 'A1'); // back to where it started: the slot is free again
    expect(await placements(ALQ_A)).toEqual([
      { box: 'BOX-1', position: 'A1', archived_reason: 'moved' },
      { box: 'BOX-3', position: 'B2', archived_reason: 'moved' },
      { box: 'BOX-1', position: 'A1', archived_reason: null },
    ]);
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.box_position WHERE aliquot_id = $1 AND archived_at IS NULL', [ALQ_A])).toBe(1);
    expect((await db.query('SELECT id FROM admin.box_position WHERE aliquot_id = $1 AND archived_at IS NULL', [ALQ_A])).rows[0].id).toBe(second);
    expect(first).not.toBe(second);
    // Audited: the archive of the old row and the insert of each new one, by the people who moved it.
    const events = (await db.query("SELECT actor, action, after->>'archived_reason' AS reason FROM admin.audit_event WHERE entity = 'box_position' AND after->>'aliquot_id' = $1 AND actor IS NOT NULL ORDER BY id", [ALQ_A])).rows;
    expect(events).toEqual([
      { actor: U.operator, action: 'UPDATE', reason: 'moved' }, { actor: U.operator, action: 'INSERT', reason: null },
      { actor: U.admin, action: 'UPDATE', reason: 'moved' }, { actor: U.admin, action: 'INSERT', reason: null },
    ]);
  });

  test('refuses an occupied slot and leaves the aliquot where it was', async () => {
    await as(db, U.operator);
    expect(await fail(move(ALQ_A, 'BOX-2', 'A1'))).toEqual({ code: 'PT409', message: 'Box BOX-2 position A1 already holds ORD002-S001-A1' });
    expect(await placements(ALQ_A)).toEqual([{ box: 'BOX-1', position: 'A1', archived_reason: null }]);
  });

  test('refuses an aliquot in no box (place it instead), its own slot, a blank slot and an archived aliquot', async () => {
    const fresh = await newAliquot();
    await as(db, U.operator);
    expect(await fail(move(fresh.id, 'BOX-3', 'A1'))).toEqual({ code: '55000', message: 'Aliquot ORD001-S002-A1 is not in a box; place it instead' });
    expect(await fail(move(ALQ_A, 'BOX-1', ' A1'))).toEqual({ code: '55000', message: 'Aliquot ORD001-S001-A1 is already in box BOX-1 position A1' });
    expect((await fail(move(ALQ_A, 'BOX-3', ''))).code).toBe('22023');
    await as(db, null);
    await db.query("UPDATE admin.aliquot SET archived_at = now(), archived_reason = 'used up' WHERE id = $1", [ALQ_A]);
    await as(db, U.operator);
    expect((await fail(move(ALQ_A, 'BOX-3', 'A1'))).message).toMatch(/archived \(used up\); remove it from its box instead/);
    expect(await placements(ALQ_A)).toEqual([{ box: 'BOX-1', position: 'A1', archived_reason: null }]);
  });
});

describe('remove_aliquot', () => {
  test('archives the placement with the trimmed reason; the slot is free for another aliquot', async () => {
    await as(db, U.operator);
    await remove(ALQ_A, '  used up in B2026-001 ');
    expect(await placements(ALQ_A)).toEqual([{ box: 'BOX-1', position: 'A1', archived_reason: 'used up in B2026-001' }]);
    const fresh = (await newAliquot()).id;
    await as(db, U.operator);
    await place(fresh, 'BOX-1', 'A1');
    expect(await placements(fresh)).toEqual([{ box: 'BOX-1', position: 'A1', archived_reason: null }]);
  });

  test('needs a reason, and an aliquot that is in a box', async () => {
    await as(db, U.operator);
    for (const reason of [null, '', '   ', 'x'.repeat(501)]) {
      const r = await fail(remove(ALQ_A, reason));
      expect(r.code).toBe('22023');
      expect(r.message).toMatch(/Say why the aliquot leaves its box/);
    }
    expect(await placements(ALQ_A)).toEqual([{ box: 'BOX-1', position: 'A1', archived_reason: null }]);
    const fresh = await newAliquot();
    await as(db, U.operator);
    expect(await fail(remove(fresh.id, 'used up'))).toEqual({ code: '55000', message: 'Aliquot ORD001-S002-A1 is not in a box' });
  });

  test('takes an archived aliquot out of its box', async () => {
    await as(db, null);
    await db.query("UPDATE admin.aliquot SET archived_at = now(), archived_reason = 'used up' WHERE id = $1", [ALQ_A]);
    await as(db, U.operator);
    await remove(ALQ_A, 'discarded');
    expect(await placements(ALQ_A)).toEqual([{ box: 'BOX-1', position: 'A1', archived_reason: 'discarded' }]);
  });
});

describe('the Storage screen\'s reads', () => {
  const boxes = () => db.query('SELECT * FROM admin.storage_boxes()').then((r) => r.rows);
  const rows = (box, search) => db.query('SELECT aliquot_code, sample_code, client_name, order_code, archived_reason, box, position, placed_at IS NOT NULL AS placed FROM admin.storage_aliquots($1, $2)', [box, search]).then((r) => r.rows);

  test('lists each box holding something with its occupied count, and one box\'s slots', async () => {
    const fresh = (await newAliquot()).id;
    await as(db, U.operator);
    await place(fresh, 'BOX-1', 'A2');
    expect(await boxes()).toEqual([{ box: 'BOX-1', occupied: 2 }, { box: 'BOX-2', occupied: 1 }]);
    expect(await rows(' BOX-1 ', null)).toEqual([
      { aliquot_code: 'ORD001-S001-A1', sample_code: 'ORD001-S001', client_name: 'Synthetic Lab Alpha', order_code: 'ORD001', archived_reason: null, box: 'BOX-1', position: 'A1', placed: true },
      { aliquot_code: 'ORD001-S002-A1', sample_code: 'ORD001-S002', client_name: 'Synthetic Lab Alpha', order_code: 'ORD001', archived_reason: null, box: 'BOX-1', position: 'A2', placed: true },
    ]);
    await remove(ALQ_B, 'shipped back');
    expect(await boxes()).toEqual([{ box: 'BOX-1', occupied: 2 }]);
    expect(await rows('BOX-2', null)).toEqual([]);
  });

  test('finds aliquots by sample or aliquot code, in any case; an archived aliquot only while it is still in a box', async () => {
    await as(db, U.operator);
    expect((await rows(null, ' ord001-s001 ')).map((r) => [r.aliquot_code, r.box, r.position])).toEqual([['ORD001-S001-A1', 'BOX-1', 'A1']]);
    expect((await rows(null, 'ORD002-S001-A1')).map((r) => r.aliquot_code)).toEqual(['ORD002-S001-A1']);
    expect((await rows(null, 'ORD00')).map((r) => r.aliquot_code)).toEqual(['ORD001-S001-A1', 'ORD002-S001-A1']);
    expect(await rows(null, '%')).toEqual([]);
    await as(db, null);
    await db.query("UPDATE admin.aliquot SET archived_at = now(), archived_reason = 'used up' WHERE id = $1", [ALQ_A]);
    await as(db, U.operator);
    expect((await rows(null, 'ORD001'))[0]).toMatchObject({ aliquot_code: 'ORD001-S001-A1', archived_reason: 'used up', box: 'BOX-1' });
    await remove(ALQ_A, 'discarded');
    expect(await rows(null, 'ORD001')).toEqual([]);
  });

  test('without a box or search: the live aliquots of received orders that are in no box', async () => {
    const fresh = (await newAliquot()).id;
    await as(db, U.operator);
    expect(await rows(null, null)).toEqual([]); // ORD001 is still at Request
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET stage = 'received' WHERE id = $1", [id(101)]);
    await as(db, U.operator);
    expect(await rows(null, '  ')).toEqual([
      { aliquot_code: 'ORD001-S002-A1', sample_code: 'ORD001-S002', client_name: 'Synthetic Lab Alpha', order_code: 'ORD001', archived_reason: null, box: null, position: null, placed: false },
    ]);
    await remove(ALQ_A, 'checked out to the bench');
    expect((await rows(null, null)).map((r) => r.aliquot_code)).toEqual(['ORD001-S001-A1', 'ORD001-S002-A1']);
    await place(fresh, 'BOX-3', 'A1');
    expect((await rows(null, null)).map((r) => r.aliquot_code)).toEqual(['ORD001-S001-A1']);
    // An archived order's aliquots leave the list.
    await as(db, null);
    await db.query("UPDATE admin.\"order\" SET archived_at = now(), archived_reason = 'synthetic test over' WHERE id = $1", [id(101)]);
    await as(db, U.operator);
    expect(await rows(null, null)).toEqual([]);
  });

  test('are for lab staff only', async () => {
    for (const u of [U.aAdmin, U.aReq, U.aView, U.member]) {
      await as(db, u);
      expect((await fail(boxes())).code, u).toBe('42501');
      expect((await fail(rows('BOX-1', null))).code, u).toBe('42501');
      // A client member still reads their own client's placements through 0004's read policy.
    }
    await as(db, U.aView);
    expect((await db.query('SELECT box FROM admin.box_position')).rows).toEqual([{ box: 'BOX-1' }]);
  });
});
