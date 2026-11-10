// Shared test harness: fresh in-memory PGlite, auth stub, migrations, synthetic seed.
// All data here is synthetic. No lab data.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Users. Lab roles: owner/admin/operator see all clients; a lab "member" does not.
export const U = {
  owner: id(1), admin: id(2), operator: id(3), member: id(4),
  aAdmin: id(11), aReq: id(12), aView: id(13),
  bReq: id(21),
  both: id(30), // requester in client A and viewer in client B
};
export const C = { A: id(100), B: id(200) };

// Every table that carries client data, with the column naming the client.
export const CLIENT_TABLES = {
  client: 'id', client_member: 'client_id', order: 'client_id', shipment: 'client_id',
  sample: 'client_id', aliquot: 'client_id', box_position: 'client_id', exclusion: 'client_id',
  injection: 'client_id', name_map: 'client_id', dataset: 'client_id', signature: 'client_id',
  job: 'client_id', audit_event: 'client_id',
};

export const ALL_TABLES = [
  'client', 'client_member', 'lab_staff', 'instrument', 'panel', 'order', 'shipment', 'sample',
  'aliquot', 'box_position', 'exclusion', 'batch', 'batch_version', 'injection', 'result_file',
  'name_map', 'dataset', 'signature', 'audit_event', 'job', 'release_policy', 'invitation',
];

export async function freshDb({ seed = true } = {}) {
  const db = new PGlite();
  await db.exec(read('test/auth_stub.sql'));
  await db.exec(read('test/pilot_stub.sql')); // Team's library tables live in the same database
  await db.exec(read('test/storage_stub.sql')); // so does Supabase Storage (bucket admin-files, 0006)
  for (const f of readdirSync(root + 'migrations').filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(read('migrations/' + f));
  }
  if (seed) await seedAll(db);
  return db;
}

// Switch identity. `null` = migration owner (superuser, bypasses RLS, auth.uid() is null).
// Anything else = the non-superuser `authenticated` role with that JWT subject.
export async function as(db, user) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? '']);
  if (user) await db.exec('SET ROLE authenticated');
}

export const count = async (db, sql, params = []) =>
  (await db.query(`SELECT count(*)::int AS n FROM (${sql}) q`, params)).rows[0].n;

// Populate every table, for two clients, as the migration owner.
async function seedAll(db) {
  await as(db, null);
  for (const [key, u] of Object.entries(U)) await db.query('INSERT INTO auth.users(id, email) VALUES ($1, $2)', [u, `${key.toLowerCase()}@example.test`]);
  const q = (sql, p) => db.query(sql, p);
  for (const [u, role] of [[U.owner, 'owner'], [U.admin, 'admin'], [U.operator, 'operator'], [U.member, 'member']]) {
    await q('INSERT INTO admin.lab_staff(user_id, role, display_name) VALUES ($1, $2, $2)', [u, role]);
  }
  await q("INSERT INTO admin.instrument(id, name, model) VALUES ($1, 'QQQ-1', 'Triple quad')", [id(500)]);
  await q("INSERT INTO admin.panel(id, instrument_id, name, dataset_type) VALUES ($1, $2, 'Global panel', 'global')", [id(501), id(500)]);

  await q("INSERT INTO admin.client(id, name, kind) VALUES ($1, 'Synthetic Lab Alpha', 'pi_lab'), ($2, 'Synthetic Company Beta', 'company')", [C.A, C.B]);
  for (const [c, u, r] of [[C.A, U.aAdmin, 'client_admin'], [C.A, U.aReq, 'requester'], [C.A, U.aView, 'viewer'],
    [C.B, U.bReq, 'requester'], [C.A, U.both, 'requester'], [C.B, U.both, 'viewer']]) {
    await q('INSERT INTO admin.client_member(client_id, user_id, role) VALUES ($1, $2, $3)', [c, u, r]);
  }

  // Per client k = 1 (A) or 2 (B): ids k01..k11
  for (const [k, c] of [[1, C.A], [2, C.B]]) {
    const b = k * 100;
    await q("INSERT INTO admin.\"order\"(id, client_id, panel_id, title, matrix) VALUES ($1, $2, $3, 'Synthetic order', 'plasma')", [id(b + 1), c, id(501)]);
    await q("INSERT INTO admin.shipment(id, client_id, order_id, carrier, condition) VALUES ($1, $2, $3, 'courier', 'ok')", [id(b + 2), c, id(b + 1)]);
    await q("INSERT INTO admin.sample(id, client_id, order_id, shipment_id, full_name, group1_term) VALUES ($1, $2, $3, $4, 'Ctrl_1', 'Ctrl'), ($5, $2, $3, $4, 'Trt_1', 'Trt')", [id(b + 3), c, id(b + 1), id(b + 2), id(b + 4)]);
    await q('INSERT INTO admin.aliquot(id, client_id, sample_id) VALUES ($1, $2, $3)', [id(b + 5), c, id(b + 3)]);
    await q("INSERT INTO admin.box_position(id, client_id, aliquot_id, box, position) VALUES ($1, $2, $3, $4, 'A1')", [id(b + 6), c, id(b + 5), `BOX-${k}`]);
    await q("INSERT INTO admin.exclusion(id, client_id, sample_id, reason) VALUES ($1, $2, $3, 'haemolysed')", [id(b + 7), c, id(b + 4)]);
    await q("INSERT INTO admin.name_map(id, client_id, export_name, clean_name) VALUES ($1, $2, 'PC(14:0_16:0)+AcO', 'PC 14:0_16:0')", [id(b + 8), c]);
    await q("INSERT INTO admin.job(id, client_id, kind) VALUES ($1, $2, 'build_dataset')", [id(b + 11), c]);
  }
  await q("INSERT INTO admin.name_map(id, export_name, clean_name) VALUES ($1, 'CE 24:4 +NH4', 'CE 24:4')", [id(300)]);
  await q("INSERT INTO admin.job(id, kind) VALUES ($1, 'parse_results')", [id(301)]);
  // Same meaning as having no policy: any lab owner or admin may sign, two signatures.
  await q("INSERT INTO admin.release_policy(eligible_signers, required_signatures) VALUES ('{}', 2)");
  // One pending client invitation (0015); only the digest of a synthetic token is stored.
  await q("INSERT INTO admin.invitation(id, email, client_id, client_role, token_sha256, expires_at, created_by) VALUES ($1, 'invitee@example.test', $2, 'viewer', $3, now() + interval '7 days', $4)", [id(600), C.A, 'c'.repeat(64), U.admin]);

  // Mixed batch: one injection of A, one of B, one QC (no client). A second batch holds only B.
  await q("INSERT INTO admin.batch(id, name, instrument_id, panel_id) VALUES ($1, 'B2026-001', $3, $4), ($2, 'B2026-002', $3, $4)", [id(400), id(410), id(500), id(501)]);
  await q('INSERT INTO admin.batch_version(id, batch_id, version) VALUES ($1, $2, 1), ($3, $4, 1)', [id(401), id(400), id(411), id(410)]);
  await q(`INSERT INTO admin.injection(id, batch_version_id, seq, sample_type, sample_name, client_id, aliquot_id) VALUES
    ($1, $4, 1, 'Unknown', 'B2026-001_001_ORD001-S001', $5, $6),
    ($2, $4, 2, 'Unknown', 'B2026-001_002_ORD002-S001', $7, $8),
    ($3, $4, 3, 'Quality Control', 'B2026-001_003_PQC', NULL, NULL)`,
  [id(402), id(403), id(404), id(401), C.A, id(105), C.B, id(205)]);
  await q("INSERT INTO admin.injection(id, batch_version_id, seq, sample_type, sample_name, client_id, aliquot_id) VALUES ($1, $2, 1, 'Unknown', 'B2026-002_001_ORD002-S001', $3, $4)", [id(412), id(411), C.B, id(205)]);
  await q("INSERT INTO admin.result_file(id, batch_id, batch_version_id, sha256, storage_path, status) VALUES ($1, $2, $3, $4, 'results/b1.txt', 'parsed')", [id(405), id(400), id(401), 'a'.repeat(64)]);

  // Released dataset per client (with its analysis/companion manifest), signed by the two people the
  // default policy allows (a lab owner and a lab admin).
  for (const [k, c] of [[1, C.A], [2, C.B]]) {
    const b = k * 100;
    await q("INSERT INTO admin.dataset(id, client_id, order_id, result_file_id, version, storage_path, sha256, analysis_sha256, analysis_size_bytes, companion_sha256, companion_size_bytes) VALUES ($1, $2, $3, $4, 1, 'datasets/x.xlsx', $5, $6, 100, $7, 50)", [id(b + 9), c, id(b + 1), id(405), 'b'.repeat(64), '9'.repeat(64), '7'.repeat(64)]);
    await q("INSERT INTO admin.signature(id, client_id, dataset_id, user_id, role) VALUES ($1, $2, $3, $4, 'prepared'), ($5, $2, $3, $6, 'reviewed')", [id(b + 10), c, id(b + 9), U.owner, id(b + 12), U.admin]);
    await q("UPDATE admin.dataset SET status = 'released' WHERE id = $1", [id(b + 9)]);
  }
}
