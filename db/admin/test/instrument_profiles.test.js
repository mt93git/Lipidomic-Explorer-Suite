// 0035_instrument_profiles.sql: instrument profiles (settings + blank and QC rules) that Batch builder starts from.
// Seed: instrument QQQ-1 (id 500), its active profile "QQQ-1 profile" (id 502, 2 blanks at start, pooled QC every 8).
// Synthetic data only.
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { as, count, freshDb, id, U } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const INSTRUMENT = id(500);
const PROFILE = id(502);
const one = (sql, p) => db.query(sql, p).then((r) => r.rows[0]);
const row = (pid) => one('SELECT * FROM admin.instrument_profile WHERE id = $1', [pid]);
const create = (name = ' Synthetic QTOF profile ', instrument = INSTRUMENT, settings = [' Synthetic OS ', '', 'Sample · Vial', '54-vial plates', '{batch}_{sample}', ' wide TXT ']) =>
  one('SELECT admin.create_instrument_profile($1, $2, $3, $4, $5, $6, $7, $8) AS id', [instrument, name, ...settings]).then((r) => r.id);
const update = (pid, name = 'QQQ-1 profile edited', instrument = INSTRUMENT, settings = ['OS 2', 'blank batch', null, null, null, null]) =>
  db.query('SELECT admin.update_instrument_profile($1, $2, $3, $4, $5, $6, $7, $8, $9)', [pid, instrument, name, ...settings]);
const rules = (pid, { start = 4, startNote = ' 1:1 IPA:ACN ', between = 5, every = 4, qc = 0, qcNote = 'recommended every 8', thresholds = ' CV 20 % ' } = {}) =>
  db.query('SELECT admin.set_instrument_profile_rules($1, $2, $3, $4, $5, $6, $7, $8)', [pid, start, startNote, between, every, qc, qcNote, thresholds]);
const activate = (pid) => db.query('SELECT admin.activate_instrument_profile($1)', [pid]);
const archive = (pid, reason = 'Synthetic retirement') => db.query('SELECT admin.archive_instrument_profile($1, $2)', [pid, reason]);
const active = () => db.query('SELECT id FROM admin.instrument_profile WHERE is_active').then((r) => r.rows.map((x) => x.id));

const RPCS = ['create_instrument_profile', 'update_instrument_profile', 'set_instrument_profile_rules', 'activate_instrument_profile', 'archive_instrument_profile'];

describe('0035: the table and the functions', () => {
  test('the five functions are SECURITY DEFINER, pin search_path and are granted to authenticated only; helpers are not', async () => {
    const rows = (await db.query("SELECT proname, prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app, has_function_privilege('anon', oid, 'EXECUTE') AS anon FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname = ANY($1)", [RPCS])).rows;
    expect(rows.map((r) => r.proname).sort()).toEqual([...RPCS].sort());
    for (const r of rows) {
      expect(r, r.proname).toMatchObject({ prosecdef: true, app: true, anon: false });
      expect(r.proconfig.join(',')).toMatch(/^search_path=pg_catalog, ?admin$/);
    }
    const helpers = (await db.query("SELECT proname FROM pg_proc WHERE pronamespace = 'admin'::regnamespace AND proname = ANY($1) AND has_function_privilege('authenticated', oid, 'EXECUTE')", [['refuse_taken_profile_name', 'check_profile_count', 'lock_live_profile']])).rows;
    expect(helpers).toEqual([]);
  });

  test('no direct INSERT, UPDATE or DELETE for the app role; lab staff read, clients and lab members do not', async () => {
    const grants = (await db.query("SELECT p FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) p WHERE has_table_privilege('authenticated', 'admin.instrument_profile', p)")).rows;
    expect(grants).toEqual([]);
    await as(db, U.owner);
    await expect(db.query('UPDATE admin.instrument_profile SET blanks_at_start = 9')).rejects.toThrow(/permission denied/);
    await expect(db.query("INSERT INTO admin.instrument_profile(instrument_id, name) VALUES ($1, 'Direct')", [INSTRUMENT])).rejects.toThrow(/permission denied/);
    for (const user of [U.owner, U.admin, U.operator]) {
      await as(db, user);
      expect(await count(db, 'SELECT 1 FROM admin.instrument_profile'), user).toBe(1);
    }
    for (const user of [U.member, U.aAdmin, U.aView]) {
      await as(db, user);
      expect(await count(db, 'SELECT 1 FROM admin.instrument_profile'), user).toBe(0);
    }
  });

  test('at most one active profile, also for a direct write by the owner of the schema', async () => {
    await as(db, null);
    await expect(db.query("INSERT INTO admin.instrument_profile(instrument_id, name, is_active) VALUES ($1, 'Second active', true)", [INSTRUMENT]))
      .rejects.toThrow(/instrument_profile_one_active/);
    await expect(db.query("UPDATE admin.instrument_profile SET blanks_between = 3 WHERE id = $1", [PROFILE])).rejects.toThrow(/check constraint/);
  });
});

describe('0035: who may write', () => {
  test('Operators, lab members and client roles are refused every write; nothing changes', async () => {
    const before = await row(PROFILE);
    for (const user of [U.operator, U.member, U.aAdmin, U.aReq, U.aView]) {
      await as(db, user);
      await expect(create(), user).rejects.toThrow(/Owner or Admin/);
      await expect(update(PROFILE), user).rejects.toThrow(/Owner or Admin/);
      await expect(rules(PROFILE), user).rejects.toThrow(/Owner or Admin/);
      await expect(activate(PROFILE), user).rejects.toThrow(/Owner or Admin/);
      await expect(archive(PROFILE), user).rejects.toThrow(/Owner or Admin/);
    }
    await as(db, null);
    expect(await row(PROFILE)).toEqual(before);
  });
});

describe('0035: profiles as an Owner or Admin', () => {
  test('create trims, stores blanks as null, starts inactive while another is active, and leaves an audit row with the actor', async () => {
    await as(db, U.admin);
    const pid = await create();
    await as(db, null);
    expect(await row(pid)).toMatchObject({
      name: 'Synthetic QTOF profile', instrument_id: INSTRUMENT, is_active: false, software: 'Synthetic OS', batch_file: null,
      bench_sheet: 'Sample · Vial', plates: '54-vial plates', sample_name_pattern: '{batch}_{sample}', results_parser: 'wide TXT',
      blanks_at_start: 1, blanks_between: 0, blanks_between_every: 0, pooled_qc_every: 6,
    });
    const audit = await one("SELECT actor, action, after FROM admin.audit_event WHERE entity = 'instrument_profile' AND entity_id = $1", [pid]);
    expect(audit).toMatchObject({ actor: U.admin, action: 'INSERT' });
    expect(audit.after.name).toBe('Synthetic QTOF profile');
  });

  test('the first profile ever created becomes the active one', async () => {
    await as(db, null);
    await db.query("UPDATE admin.instrument_profile SET is_active = false, archived_at = now(), archived_reason = 'Synthetic reset' WHERE id = $1", [PROFILE]);
    await as(db, U.owner);
    const pid = await create('First synthetic profile');
    expect(await active()).toEqual([pid]);
  });

  test('refuses a blank name, no instrument, an archived instrument and a name already taken (active or archived)', async () => {
    await as(db, U.owner);
    await expect(create('  ')).rejects.toThrow('Profile name is required');
    await expect(create('No instrument', null)).rejects.toThrow('Choose the instrument this profile is for');
    await expect(create('Missing instrument', id(999))).rejects.toThrow('Instrument not found');
    await expect(create(' QQQ-1 profile ')).rejects.toThrow('A profile named "QQQ-1 profile" already exists');
    const pid = await create('Old synthetic profile');
    await archive(pid);
    await expect(create('Old synthetic profile')).rejects.toThrow('An archived profile is already named "Old synthetic profile"');
    await as(db, null);
    const spare = (await one("INSERT INTO admin.instrument(name) VALUES ('Spare QQQ') RETURNING id")).id;
    await db.query("UPDATE admin.instrument SET archived_at = now(), archived_reason = 'Synthetic' WHERE id = $1", [spare]);
    await as(db, U.owner);
    await expect(create('On archived', spare)).rejects.toThrow('Instrument "Spare QQQ" is archived');
  });

  test('update changes the settings (blank to null) and keeps the rules and the active flag', async () => {
    await as(db, U.owner);
    await update(PROFILE);
    await as(db, null);
    expect(await row(PROFILE)).toMatchObject({ name: 'QQQ-1 profile edited', software: 'OS 2', batch_file: 'blank batch', bench_sheet: null,
      is_active: true, blanks_at_start: 2, pooled_qc_every: 8 });
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'instrument_profile' AND entity_id = $1 AND action = 'UPDATE'", [PROFILE])).toBe(1);
  });

  test('rules: saved as given (notes trimmed), counts checked 0..96, blanks between needs both numbers or none', async () => {
    await as(db, U.admin);
    await rules(PROFILE);
    await as(db, null);
    expect(await row(PROFILE)).toMatchObject({ blanks_at_start: 4, start_blank_note: '1:1 IPA:ACN', blanks_between: 5, blanks_between_every: 4,
      pooled_qc_every: 0, pooled_qc_note: 'recommended every 8', qc_thresholds: 'CV 20 %' });
    await as(db, U.admin);
    await expect(rules(PROFILE, { start: -1 })).rejects.toThrow('Blanks at the start must be a whole number from 0 to 96');
    await expect(rules(PROFILE, { qc: 97 })).rejects.toThrow('Pooled QC every must be a whole number from 0 to 96');
    await expect(rules(PROFILE, { start: null })).rejects.toThrow('Blanks at the start must be');
    await expect(rules(PROFILE, { between: 2, every: 0 })).rejects.toThrow(/needs both numbers/);
    await rules(PROFILE, { between: 0, every: 0, startNote: ' ', qcNote: '', thresholds: null });
    await as(db, null);
    expect(await row(PROFILE)).toMatchObject({ blanks_between: 0, blanks_between_every: 0, start_blank_note: null, pooled_qc_note: null, qc_thresholds: null });
    const actions = (await db.query("SELECT actor FROM admin.audit_event WHERE entity = 'instrument_profile' AND entity_id = $1 AND action = 'UPDATE'", [PROFILE])).rows;
    expect(actions).toEqual([{ actor: U.admin }, { actor: U.admin }]);
  });

  test('activate moves the one active flag; archive refuses the active profile, needs a reason, then refuses edits', async () => {
    await as(db, U.owner);
    const pid = await create('Synthetic second profile');
    await activate(pid);
    expect(await active()).toEqual([pid]);
    await activate(pid); // already active: nothing changes
    expect(await active()).toEqual([pid]);
    await expect(archive(pid)).rejects.toThrow('Profile "Synthetic second profile" is the active one; make another profile active first');
    await expect(archive(PROFILE, '  ')).rejects.toThrow('Archiving a profile needs a reason');
    await archive(PROFILE);
    await expect(archive(PROFILE)).rejects.toThrow('Profile "QQQ-1 profile" is archived');
    await expect(update(PROFILE)).rejects.toThrow(/is archived/);
    await expect(rules(PROFILE)).rejects.toThrow(/is archived/);
    await expect(activate(PROFILE)).rejects.toThrow(/is archived/);
    await expect(activate(id(999))).rejects.toThrow('Profile not found');
    await as(db, null);
    expect(await row(PROFILE)).toMatchObject({ archived_reason: 'Synthetic retirement', is_active: false });
  });
});
