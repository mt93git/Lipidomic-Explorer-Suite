// 0026_instruments_panels.sql: lab Owner/Admin create, edit and archive instruments and panels through functions;
// everyone else reads. Seed: instrument QQQ-1 (id 500), panel "Global panel" (id 501, global) on it, used by both
// seeded orders and both seeded batches. Synthetic data only.
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { as, C, count, freshDb, id, U } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const INSTRUMENT = id(500);
const PANEL = id(501);
const one = (sql, p) => db.query(sql, p).then((r) => r.rows[0]);
const createInstrument = (name = 'Synthetic QTOF', model = ' QTOF 1 ', serial = ' SN-0001 ') =>
  one('SELECT admin.create_instrument($1, $2, $3) AS id', [name, model, serial]).then((r) => r.id);
const updateInstrument = (iid, name = 'Synthetic QTOF edited', model = 'QTOF 2', serial = null) =>
  db.query('SELECT admin.update_instrument($1, $2, $3, $4)', [iid, name, model, serial]);
const archiveInstrument = (iid, reason = 'Synthetic decommission') => db.query('SELECT admin.archive_instrument($1, $2)', [iid, reason]);
const createPanel = (name = 'Synthetic mediators', instrument = INSTRUMENT, lc = ' C18 12 min ', kits = [' Kit A ', '', 'Kit B', 'Kit A'], type = 'mediators') =>
  one('SELECT admin.create_panel($1, $2, $3, $4, $5) AS id', [instrument, name, lc, kits, type]).then((r) => r.id);
const updatePanel = (pid, { name = 'Synthetic mediators edited', instrument = INSTRUMENT, lc = null, kits = [], type = 'mediators' } = {}) =>
  db.query('SELECT admin.update_panel($1, $2, $3, $4, $5, $6)', [pid, instrument, name, lc, kits, type]);
const archivePanel = (pid, reason = 'Synthetic retirement') => db.query('SELECT admin.archive_panel($1, $2)', [pid, reason]);
const row = (table, rid) => one(`SELECT * FROM admin.${table} WHERE id = $1`, [rid]);

const RPCS = ['create_instrument', 'update_instrument', 'archive_instrument', 'create_panel', 'update_panel', 'archive_panel'];

describe('0026: the functions and the tables', () => {
  test('the six functions are SECURITY DEFINER, pin search_path and are granted to authenticated only', async () => {
    const rows = (await db.query("SELECT proname, prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app, has_function_privilege('anon', oid, 'EXECUTE') AS anon FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname = ANY($1)", [RPCS])).rows;
    expect(rows.map((r) => r.proname).sort()).toEqual([...RPCS].sort());
    for (const r of rows) {
      expect(r, r.proname).toMatchObject({ prosecdef: true, app: true, anon: false });
      expect(r.proconfig.join(',')).toMatch(/^search_path=pg_catalog, ?admin$/);
    }
    const helpers = (await db.query("SELECT proname FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname = ANY($1) AND has_function_privilege('authenticated', oid, 'EXECUTE')", [['clean_istd_kits', 'require_lab_manager_for_catalog', 'active_instrument_for_panel', 'refuse_taken_name']])).rows;
    expect(helpers).toEqual([]);
  });

  test('no direct INSERT or UPDATE for the app role: no write policy and no grant is left', async () => {
    const grants = (await db.query(`SELECT t, p FROM unnest(ARRAY['instrument', 'panel']) t, unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) p
      WHERE has_table_privilege('authenticated', 'admin.' || t, p)`)).rows;
    expect(grants).toEqual([]);
    const policies = (await db.query("SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'admin' AND tablename IN ('instrument', 'panel') ORDER BY 1, 2")).rows;
    expect(policies).toEqual([{ tablename: 'instrument', policyname: 'instrument_read', cmd: 'SELECT' }, { tablename: 'panel', policyname: 'panel_read', cmd: 'SELECT' }]);
    await as(db, U.owner);
    await expect(db.query("UPDATE admin.panel SET dataset_type = 'mediators' WHERE id = $1", [PANEL])).rejects.toThrow(/permission denied/);
    await expect(db.query("INSERT INTO admin.instrument(name) VALUES ('Direct')")).rejects.toThrow(/permission denied/);
    await as(db, null);
    expect((await row('panel', PANEL)).dataset_type).toBe('global');
  });

  test('reads are unchanged: lab staff read instruments; everyone signed in reads panels; only staff read instruments', async () => {
    for (const user of [U.owner, U.admin, U.operator]) {
      await as(db, user);
      expect(await count(db, 'SELECT 1 FROM admin.instrument'), user).toBe(1);
      expect(await count(db, 'SELECT 1 FROM admin.panel'), user).toBe(1);
    }
    for (const user of [U.member, U.aAdmin, U.aView]) {
      await as(db, user);
      expect(await count(db, 'SELECT 1 FROM admin.instrument'), user).toBe(0);
      expect(await count(db, 'SELECT 1 FROM admin.panel'), user).toBe(1);
    }
  });
});

describe('0026: who may write', () => {
  test('Operators, lab members, client roles and archived managers are refused every write; nothing changes', async () => {
    const before = { i: await row('instrument', INSTRUMENT), p: await row('panel', PANEL) };
    const refusedEverything = async () => {
      await expect(createInstrument()).rejects.toThrow(/Owner or Admin/);
      await expect(updateInstrument(INSTRUMENT)).rejects.toThrow(/Owner or Admin/);
      await expect(archiveInstrument(INSTRUMENT)).rejects.toThrow(/Owner or Admin/);
      await expect(createPanel()).rejects.toThrow(/Owner or Admin/);
      await expect(updatePanel(PANEL, { type: 'global' })).rejects.toThrow(/Owner or Admin/);
      await expect(archivePanel(PANEL)).rejects.toThrow(/Owner or Admin/);
    };
    for (const user of [U.operator, U.member, U.aAdmin, U.aReq, U.aView, U.bReq]) {
      await as(db, user);
      await refusedEverything();
    }
    await as(db, null);
    await db.query("UPDATE admin.lab_staff SET archived_at = now(), archived_reason = 'Synthetic departure' WHERE user_id = $1", [U.admin]);
    await as(db, U.admin);
    await refusedEverything();
    await as(db, null);
    await refusedEverything(); // no auth.uid(): the migration owner through the app path is not a lab manager either
    expect({ i: await row('instrument', INSTRUMENT), p: await row('panel', PANEL) }).toEqual(before);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity IN ('instrument', 'panel') AND action = 'UPDATE'")).toBe(0);
  });
});

describe('0026: instruments', () => {
  test('an Owner creates (trimmed, blanks to null), an Admin edits, both audited with their names', async () => {
    await as(db, U.owner);
    const iid = await createInstrument('  Synthetic QTOF  ');
    expect(await row('instrument', iid)).toMatchObject({ name: 'Synthetic QTOF', model: 'QTOF 1', serial_number: 'SN-0001', archived_at: null });
    await as(db, U.admin);
    await updateInstrument(iid, ' Synthetic QTOF edited ', '  ', '   ');
    expect(await row('instrument', iid)).toMatchObject({ name: 'Synthetic QTOF edited', model: null, serial_number: null });
    expect((await db.query("SELECT actor, action FROM admin.audit_event WHERE entity = 'instrument' AND entity_id = $1 ORDER BY id", [iid])).rows)
      .toEqual([{ actor: U.owner, action: 'INSERT' }, { actor: U.admin, action: 'UPDATE' }]);
  });

  test('blank names and duplicate names are refused with a clear message; unknown ids are not found', async () => {
    await as(db, U.admin);
    const iid = await createInstrument();
    for (const name of ['', '   ', null]) {
      await expect(createInstrument(name)).rejects.toThrow('Instrument name is required');
      await expect(updateInstrument(iid, name)).rejects.toThrow('Instrument name is required');
    }
    await expect(createInstrument(' QQQ-1 ')).rejects.toThrow('An instrument named "QQQ-1" already exists');
    await expect(updateInstrument(iid, 'QQQ-1')).rejects.toThrow('An instrument named "QQQ-1" already exists');
    await expect(updateInstrument(id(999))).rejects.toThrow('Instrument not found');
    await expect(archiveInstrument(id(999))).rejects.toThrow('Instrument not found');
    expect((await row('instrument', iid)).name).toBe('Synthetic QTOF');
    await updateInstrument(iid, 'Synthetic QTOF'); // its own name is not a duplicate
  });

  test('archive needs a reason and is refused while an active panel uses the instrument; the archived name stays taken', async () => {
    await as(db, U.owner);
    for (const reason of ['', '  ', null]) await expect(archiveInstrument(INSTRUMENT, reason)).rejects.toThrow('Archiving an instrument needs a reason');
    await expect(archiveInstrument(INSTRUMENT)).rejects.toThrow('Instrument "QQQ-1" is used by the active panel(s) "Global panel"');
    await archivePanel(PANEL);
    await archiveInstrument(INSTRUMENT, '  Synthetic decommission  ');
    expect(await row('instrument', INSTRUMENT)).toMatchObject({ archived_at: expect.any(Date), archived_reason: 'Synthetic decommission' });
    await expect(archiveInstrument(INSTRUMENT)).rejects.toThrow('Instrument is already archived');
    await expect(updateInstrument(INSTRUMENT)).rejects.toThrow('Instrument is archived');
    await expect(createInstrument('QQQ-1')).rejects.toThrow('An archived instrument is already named "QQQ-1"; archived instruments keep their names');
    // History: the batches and the orders keep their instrument and panel.
    expect(await count(db, 'SELECT 1 FROM admin.batch WHERE instrument_id = $1 AND panel_id = $2', [INSTRUMENT, PANEL])).toBe(2);
    expect(await count(db, 'SELECT 1 FROM admin."order" WHERE panel_id = $1', [PANEL])).toBe(2);
  });

  test('a panel cannot be put on an archived or unknown instrument', async () => {
    await as(db, U.admin);
    const spare = await createInstrument('Synthetic spare');
    await archiveInstrument(spare);
    await expect(createPanel('On archived', spare)).rejects.toThrow('Instrument "Synthetic spare" is archived; choose an active instrument');
    await expect(updatePanel(PANEL, { name: 'Global panel', instrument: spare, type: 'global' })).rejects.toThrow(/is archived; choose an active instrument/);
    await expect(createPanel('On unknown', id(999))).rejects.toThrow('Instrument not found');
    expect(await count(db, 'SELECT 1 FROM admin.panel')).toBe(1);
  });
});

describe('0026: panels', () => {
  test('an Admin creates a panel: trimmed text, kits cleaned in order, without an instrument too; audited', async () => {
    await as(db, U.admin);
    const pid = await createPanel('  Synthetic mediators  ');
    expect(await row('panel', pid)).toMatchObject({ name: 'Synthetic mediators', instrument_id: INSTRUMENT, lc_method: 'C18 12 min', istd_kits: ['Kit A', 'Kit B'], dataset_type: 'mediators', archived_at: null });
    const bare = await createPanel('Synthetic bare', null, '  ', null, 'global');
    expect(await row('panel', bare)).toMatchObject({ instrument_id: null, lc_method: null, istd_kits: [] });
    expect((await db.query("SELECT actor, action FROM admin.audit_event WHERE entity = 'panel' AND entity_id = $1", [pid])).rows).toEqual([{ actor: U.admin, action: 'INSERT' }]);
  });

  test('blank names, duplicate names and bad dataset types are refused', async () => {
    await as(db, U.owner);
    const pid = await createPanel();
    for (const name of ['', ' ', null]) {
      await expect(createPanel(name)).rejects.toThrow('Panel name is required');
      await expect(updatePanel(pid, { name })).rejects.toThrow('Panel name is required');
    }
    await expect(createPanel('Global panel')).rejects.toThrow('A panel named "Global panel" already exists');
    await expect(updatePanel(pid, { name: ' Global panel ' })).rejects.toThrow('A panel named "Global panel" already exists');
    for (const type of ['lipidome', null]) {
      await expect(createPanel('Typed', INSTRUMENT, null, [], type)).rejects.toThrow('Choose a valid dataset type');
      await expect(updatePanel(pid, { type })).rejects.toThrow('Choose a valid dataset type');
    }
    await expect(updatePanel(id(999))).rejects.toThrow('Panel not found');
    await expect(archivePanel(id(999))).rejects.toThrow('Panel not found');
  });

  test('editing a used panel: everything but the dataset type may change; the type is refused once an order or a batch uses it', async () => {
    await as(db, U.admin);
    const spare = await createInstrument('Synthetic spare');
    await updatePanel(PANEL, { name: 'Global panel v2', instrument: spare, lc: ' HILIC ', kits: ['Kit C'], type: 'global' });
    expect(await row('panel', PANEL)).toMatchObject({ name: 'Global panel v2', instrument_id: spare, lc_method: 'HILIC', istd_kits: ['Kit C'], dataset_type: 'global' });
    await expect(updatePanel(PANEL, { name: 'Global panel v2', instrument: spare, type: 'mediators' }))
      .rejects.toThrow('Panel "Global panel v2" is already used by an order or a batch, so its dataset type stays global; create a new panel for mediators');
    // Only a batch uses it (the orders moved away, archived ones count too): still refused.
    await as(db, null);
    const onlyBatch = (await db.query("INSERT INTO admin.panel(name, dataset_type) VALUES ('Synthetic batch-only', 'global') RETURNING id")).rows[0].id;
    await db.query('UPDATE admin.batch SET panel_id = $1 WHERE id = $2', [onlyBatch, id(410)]);
    const onlyArchivedOrder = (await db.query("INSERT INTO admin.panel(name, dataset_type) VALUES ('Synthetic archived-order', 'global') RETURNING id")).rows[0].id;
    await db.query("UPDATE admin.\"order\" SET panel_id = $1, archived_at = now(), archived_reason = 'Synthetic cancellation' WHERE id = $2", [onlyArchivedOrder, id(201)]);
    await as(db, U.admin);
    await expect(updatePanel(onlyBatch, { name: 'Synthetic batch-only', instrument: null, type: 'mediators' })).rejects.toThrow(/already used by an order or a batch/);
    await expect(updatePanel(onlyArchivedOrder, { name: 'Synthetic archived-order', instrument: null, type: 'mediators' })).rejects.toThrow(/already used by an order or a batch/);
    // An unused panel's type may change.
    const unused = await createPanel('Synthetic unused');
    await updatePanel(unused, { name: 'Synthetic unused', type: 'global' });
    expect((await row('panel', unused)).dataset_type).toBe('global');
  });

  test('archive needs a reason; afterwards it cannot be edited, New order and Batch builder refuse it, history keeps it', async () => {
    await as(db, U.owner);
    for (const reason of ['', '  ', null]) await expect(archivePanel(PANEL, reason)).rejects.toThrow('Archiving a panel needs a reason');
    await archivePanel(PANEL, '  Synthetic retirement  ');
    expect(await row('panel', PANEL)).toMatchObject({ archived_at: expect.any(Date), archived_reason: 'Synthetic retirement' });
    await expect(archivePanel(PANEL)).rejects.toThrow('Panel is already archived');
    await expect(updatePanel(PANEL, { name: 'Global panel', type: 'global' })).rejects.toThrow('Panel is archived');
    await expect(createPanel('Global panel')).rejects.toThrow('An archived panel is already named "Global panel"; archived panels keep their names');
    await expect(db.query("SELECT admin.create_order($1, $2, 'Synthetic', 'plasma', 4, NULL, NULL)", [C.A, PANEL])).rejects.toThrow(/archived; choose an active panel/);
    await expect(db.query("SELECT admin.create_batch(NULL, $1, '{}'::jsonb, '[]'::jsonb)", [PANEL])).rejects.toThrow(/archived; choose an active panel/);
    expect(await count(db, 'SELECT 1 FROM admin."order" WHERE panel_id = $1', [PANEL])).toBe(2);
    expect(await count(db, 'SELECT 1 FROM admin.batch WHERE panel_id = $1', [PANEL])).toBe(2);
    expect((await db.query("SELECT action FROM admin.audit_event WHERE entity = 'panel' AND entity_id = $1", [PANEL])).rows.map((r) => r.action)).toContain('UPDATE');
  });
});
