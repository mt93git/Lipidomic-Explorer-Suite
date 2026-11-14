// Receive shipment tube by tube (0032_shipment_tubes.sql): check_in_tube, confirm_shipment_receipt, shipment_checkin,
// the receipt guard and the client's read of the discrepancy note. Synthetic data only.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, count, id, U, C } from './helpers.js';

let db;
beforeEach(async () => {
  db = await freshDb();
  // Seed (helpers.js): client A's ORD001 has shipment id(102) with samples ORD001-S001 (id 103, tube already checked in,
  // intact, RCV-1 A1) and ORD001-S002 (id 104). The seeded shipment has not arrived: mark it received.
  await as(db, null);
  await db.query('UPDATE admin.shipment SET received_at = now() WHERE id = ANY($1)', [[id(102), id(202)]]);
  await db.query("UPDATE admin.sample SET client_sample_id = 'SYN-1-d0' WHERE id = $1", [id(104)]);
});
afterEach(async () => { await db?.close(); });

const SHIP_A = id(102);
const checkIn = (label, condition = 'intact', box = null, position = null, note = null, shipment = SHIP_A) =>
  db.query('SELECT admin.check_in_tube($1, $2, $3, $4, $5, $6) AS id', [shipment, label, condition, box, position, note]).then((r) => r.rows[0].id);
const confirm = (note = null, temperature = '-80 °C', shipment = SHIP_A) =>
  db.query('SELECT admin.confirm_shipment_receipt($1, $2, $3) AS r', [shipment, note, temperature]).then((r) => r.rows[0].r);
const checkin = (shipment = SHIP_A) => db.query('SELECT sample_code, client_sample_id, condition, box, position FROM admin.shipment_checkin($1)', [shipment]).then((r) => r.rows);
const fail = (p) => p.then(() => ({ code: 'ok' }), (e) => ({ code: e.code, message: e.message }));

describe('installation', () => {
  test('the functions are SECURITY DEFINER with a pinned search_path, for authenticated only; helpers are not callable', async () => {
    const fns = ['check_in_tube', 'confirm_shipment_receipt', 'shipment_checkin'];
    const rows = (await db.query("SELECT proname, prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app, has_function_privilege('anon', oid, 'EXECUTE') AS anon FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname = ANY($1)", [fns])).rows;
    expect(rows.map((r) => r.proname).sort()).toEqual([...fns].sort());
    for (const r of rows) expect({ name: r.proname, definer: r.prosecdef, path: r.proconfig.join(','), app: r.app, anon: r.anon })
      .toEqual({ name: r.proname, definer: true, path: 'search_path=pg_catalog, admin', app: true, anon: false });
    for (const helper of ['shipment_manifest(uuid)', 'lock_shipment(uuid)', 'guard_shipment_receipt()']) {
      expect((await db.query(`SELECT has_function_privilege('authenticated', 'admin.${helper}', 'EXECUTE') AS ok`)).rows[0].ok, helper).toBe(false);
    }
    const priv = async (p) => (await db.query("SELECT has_table_privilege('authenticated', 'admin.shipment_tube', $1) AS ok", [p])).rows[0].ok;
    expect([await priv('SELECT'), await priv('INSERT'), await priv('UPDATE'), await priv('DELETE')]).toEqual([true, false, false, false]);
  });

  test('nobody signed in writes shipment_tube or the receipt columns directly', async () => {
    for (const u of [U.owner, U.operator, U.aAdmin]) {
      await as(db, u);
      expect((await fail(db.query("INSERT INTO admin.shipment_tube(client_id, shipment_id, sample_id, condition) VALUES ($1, $2, $3, 'intact')", [C.A, SHIP_A, id(104)]))).code, u).toBe('42501');
    }
    await as(db, U.operator);
    const r = await fail(db.query("UPDATE admin.shipment SET receipt_confirmed_at = now(), receipt_note = 'set by hand' WHERE id = $1", [SHIP_A]));
    expect(r.code).toBe('42501');
    expect(r.message).toMatch(/only by confirm_shipment_receipt/);
    // The rest of the row stays writable by a lab writer, as before (0018).
    expect((await db.query("UPDATE admin.shipment SET notes = 'dry ice topped up' WHERE id = $1", [SHIP_A])).affectedRows).toBe(1);
  });
});

describe('who may check in and confirm', () => {
  test('client roles and lab members are refused, and nothing changes', async () => {
    for (const u of [U.aAdmin, U.aReq, U.aView, U.member]) {
      await as(db, u);
      for (const call of [checkIn('ORD001-S002'), confirm('note')]) {
        const r = await fail(call);
        expect(r.code, u).toBe('42501');
        expect(r.message, u).toMatch(/only lab staff \(owner, admin, operator\)/);
      }
      expect((await fail(checkin())).code, u).toBe('42501');
    }
    await as(db, null);
    expect(await count(db, 'SELECT 1 FROM admin.shipment_tube WHERE shipment_id = $1', [SHIP_A])).toBe(1);
  });
});

describe('check-in', () => {
  test('the manifest lists every tube of the shipment with its check-in; a scan marks a tube checked in, audited', async () => {
    await as(db, U.operator);
    expect(await checkin()).toEqual([
      { sample_code: 'ORD001-S001', client_sample_id: null, condition: 'intact', box: 'RCV-1', position: 'A1' },
      { sample_code: 'ORD001-S002', client_sample_id: 'SYN-1-d0', condition: null, box: null, position: null },
    ]);
    const tube = await checkIn(' ord001-s002 ', 'hemolyzed', 'B12', ' c3 ');
    expect((await checkin())[1]).toEqual({ sample_code: 'ORD001-S002', client_sample_id: 'SYN-1-d0', condition: 'hemolyzed', box: 'B12', position: 'C3' });
    await as(db, null);
    const audit = (await db.query("SELECT actor, client_id, action, after->>'condition' AS condition FROM admin.audit_event WHERE entity = 'shipment_tube' AND entity_id = $1", [tube])).rows;
    expect(audit).toEqual([{ actor: U.operator, client_id: C.A, action: 'INSERT', condition: 'hemolyzed' }]);
  });

  test("the client's own sample id is accepted as a label", async () => {
    await as(db, U.operator);
    await checkIn('syn-1-D0', 'thawed');
    expect((await checkin())[1].condition).toBe('thawed');
  });

  test('checking a tube in again keeps the old row archived', async () => {
    await as(db, U.operator);
    await checkIn('ORD001-S002', 'intact', 'B12', 'C3');
    await checkIn('ORD001-S002', 'hemolyzed', 'B12', 'C4');
    await as(db, null);
    expect((await db.query('SELECT condition, position, archived_reason FROM admin.shipment_tube WHERE sample_id = $1 ORDER BY created_at, archived_at NULLS LAST', [id(104)])).rows)
      .toEqual([{ condition: 'intact', position: 'C3', archived_reason: 'checked in again' }, { condition: 'hemolyzed', position: 'C4', archived_reason: null }]);
  });

  test('unknown labels, tubes of another order and bad input are refused with a clear message', async () => {
    await as(db, U.operator);
    let r = await fail(checkIn('ORD001-S099'));
    expect(r).toEqual({ code: 'P0002', message: 'unknown tube label ORD001-S099: it is not on the manifest of ORD001' });
    r = await fail(checkIn('ORD002-S001'));
    expect(r).toEqual({ code: 'P0002', message: 'tube ORD002-S001 belongs to order ORD002, not to ORD001' });
    expect((await fail(checkIn(''))).message).toBe('Scan or type a tube label');
    expect((await fail(checkIn('ORD001-S002', 'broken'))).code).toBe('22023');
    expect((await fail(checkIn('ORD001-S002', 'other'))).message).toMatch(/describe the condition/);
    expect((await fail(checkIn('ORD001-S002', 'intact', 'B12', null))).message).toBe('enter both a box and a position, or neither');
    r = await fail(checkIn('ORD001-S002', 'intact', 'RCV-1', 'a1'));
    expect(r).toEqual({ code: 'PT409', message: 'box RCV-1 position A1 already holds tube ORD001-S001' });
    expect((await checkin())[1].condition).toBe(null);
    await checkIn('ORD001-S002', 'other', null, null, 'cap cracked');
    expect((await checkin())[1].condition).toBe('other');
  });

  test('a shipment that has not arrived cannot be checked in', async () => {
    await as(db, null);
    await db.query('UPDATE admin.shipment SET received_at = NULL WHERE id = $1', [SHIP_A]);
    await as(db, U.operator);
    expect(await fail(checkIn('ORD001-S002'))).toEqual({ code: '55000', message: 'this shipment of ORD001 has not arrived; record its arrival first' });
  });
});

describe('confirm receipt', () => {
  test('missing or damaged tubes need a discrepancy note; then the receipt is recorded and closed', async () => {
    await as(db, U.operator);
    const r = await fail(confirm('  '));
    expect(r.code).toBe('22023');
    expect(r.message).toBe('1 tube missing and 0 damaged: write a discrepancy note; the client reads it on their order');
    expect(await confirm('S002 missing from box, courier contacted.')).toEqual({ expected: 2, checked_in: 1, missing: 1, damaged: 0 });
    await as(db, null);
    const row = (await db.query('SELECT receipt_confirmed_by, receipt_note, receipt_missing, receipt_damaged, storage_temperature, receipt_confirmed_at IS NOT NULL AS confirmed FROM admin.shipment WHERE id = $1', [SHIP_A])).rows[0];
    expect(row).toEqual({ receipt_confirmed_by: U.operator, receipt_note: 'S002 missing from box, courier contacted.', receipt_missing: 1, receipt_damaged: 0, storage_temperature: '-80 °C', confirmed: true });
    // The order's history is the audit trail: the confirmation is an UPDATE of the shipment with the note.
    const audit = (await db.query("SELECT actor, after->>'receipt_note' AS note FROM admin.audit_event WHERE entity = 'shipment' AND entity_id = $1 AND after->>'receipt_confirmed_at' IS NOT NULL", [SHIP_A])).rows;
    expect(audit).toEqual([{ actor: U.operator, note: 'S002 missing from box, courier contacted.' }]);
    await as(db, U.operator);
    expect((await fail(checkIn('ORD001-S002'))).message).toMatch(/already confirmed; its tubes cannot change/);
    expect((await fail(confirm('again'))).message).toMatch(/already confirmed/);
  });

  test('a damaged tube needs a note even when nothing is missing; all intact needs none', async () => {
    await as(db, U.operator);
    await checkIn('ORD001-S002', 'hemolyzed');
    expect((await fail(confirm(null))).message).toBe('0 tubes missing and 1 damaged: write a discrepancy note; the client reads it on their order');
    await checkIn('ORD001-S002', 'intact');
    expect(await confirm(null)).toEqual({ expected: 2, checked_in: 2, missing: 0, damaged: 0 });
  });

  test('a shipment with nothing on its manifest cannot be confirmed tube by tube', async () => {
    await as(db, U.operator);
    const shipment = (await db.query("SELECT admin.receive_shipment($1, 'courier', NULL, 'ok', 1, NULL) AS id", [id(101)])).rows[0].id;
    expect(await checkin(shipment)).toEqual([]);
    expect((await fail(confirm('x', null, shipment))).message).toMatch(/no registered samples on this shipment/);
  });

  test('the client reads the note on their own shipment, and only their own', async () => {
    await as(db, U.operator);
    await confirm('S002 missing from box, courier contacted.');
    await as(db, U.aView);
    expect((await db.query('SELECT receipt_note, receipt_missing FROM admin.shipment WHERE id = $1', [SHIP_A])).rows)
      .toEqual([{ receipt_note: 'S002 missing from box, courier contacted.', receipt_missing: 1 }]);
    expect(await count(db, 'SELECT 1 FROM admin.shipment_tube WHERE shipment_id = $1', [SHIP_A])).toBe(1);
    await as(db, U.bReq);
    expect(await count(db, 'SELECT 1 FROM admin.shipment WHERE id = $1', [SHIP_A])).toBe(0);
    expect(await count(db, 'SELECT 1 FROM admin.shipment_tube WHERE shipment_id = $1', [SHIP_A])).toBe(0);
  });
});
