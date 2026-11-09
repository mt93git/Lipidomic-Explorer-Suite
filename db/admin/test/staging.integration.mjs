#!/usr/bin/env node
// Integration check against a real Admin staging stack (GoTrue + PostgREST + Postgres with RLS).
// PGlite proves the SQL; this proves the same rules hold through real sign-in tokens and the REST API.
//
// Run on the host of the staging stack:
//   node db/admin/test/staging.integration.mjs <staging stack directory>
// Needs Node 22 (global fetch) and docker access to the "<project>-db-1" container.
// Reads ports and keys from the stack's .env and never prints them. Creates throwaway users
// and rows tagged with a run id; staging data is never deleted (the schema forbids it). At the end, failed runs
// included, archiveRun() retires what the run created: released datasets are withdrawn through withdraw_dataset (0008:
// never through the archive columns), then the other datasets, the orders and the two clients are archived.
import { execFileSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: staging.integration.mjs <stack dir>'); process.exit(2); }
const env = Object.fromEntries(readFileSync(join(dir, '.env'), 'utf8').split('\n')
  .filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const project = process.env.ADMIN_STAGING_PROJECT ?? 'lipidomic-admin-staging';
const auth = `http://127.0.0.1:${env.AUTH_PORT}`;
const rest = `http://127.0.0.1:${env.REST_PORT}`;
const run = `it${Date.now().toString(36)}`;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}
function sql(text) {
  return execFileSync('docker', ['exec', '-i', `${project}-db-1`, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', text],
    { encoding: 'utf8' }).trim();
}
async function createUser(label) {
  const email = `${run}-${label}@example.test`;
  const password = randomBytes(18).toString('base64url');
  const res = await fetch(`${auth}/admin/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SERVICE_KEY}`, apikey: env.SERVICE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`create ${label}: ${res.status} ${await res.text()}`);
  const user = await res.json();
  return { id: user.id, email, password };
}
async function signIn(user) {
  const res = await fetch(`${auth}/token?grant_type=password`, {
    method: 'POST', headers: { apikey: env.ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  if (!res.ok) throw new Error(`sign in: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}
function api(token, path, init = {}) {
  return fetch(`${rest}/${path}`, {
    ...init,
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${token}`, 'Accept-Profile': 'admin', 'Content-Profile': 'admin',
      'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers },
  });
}

async function rpc(token, fn, args) {
  const res = await api(token, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
  const text = await res.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

// The run's release signers (set below), whose tokens withdraw what the run released when it ends.
const signers = [];
const clientA = randomUUID(); const clientB = randomUUID();
async function archiveRun() {
  const reason = `${run} staging test run finished`;
  const released = sql(`select id from admin.dataset where client_id in ('${clientA}', '${clientB}') and status = 'released'`).split('\n').filter(Boolean);
  for (const id of released) {
    let withdrawn = false;
    for (const user of signers) {
      try { withdrawn = (await rpc(await signIn(user), 'withdraw_dataset', { p_dataset_id: id, p_reason: reason })).ok; } catch { /* next signer */ }
      if (withdrawn) break;
    }
    if (!withdrawn) console.log(`teardown: dataset ${id} is still released (no run signer could withdraw it); its order and client stay live`);
  }
  // A released dataset keeps its order and client live; everything else of the two run clients is archived.
  sql(`update admin.dataset set archived_at = now(), archived_reason = '${reason}'
         where client_id in ('${clientA}', '${clientB}') and archived_at is null and status <> 'released';
       update admin."order" o set archived_at = now(), archived_reason = '${reason}'
         where o.client_id in ('${clientA}', '${clientB}') and o.archived_at is null
           and not exists (select 1 from admin.dataset d where d.order_id = o.id and d.status = 'released');
       update admin.client c set archived_at = now(), archived_reason = '${reason}'
         where c.id in ('${clientA}', '${clientB}') and c.archived_at is null
           and not exists (select 1 from admin.dataset d where d.client_id = c.id and d.status = 'released');`);
  console.log(`teardown: run ${run} archived (${sql(`select count(*) from admin."order" where client_id in ('${clientA}', '${clientB}') and archived_at is not null`)} orders)`);
}

// The run replaces the staging lab's release policy with its throwaway signers; at the end the policy that was live
// before the run (e.g. the simulated pilot's signers) is set again by the run's Owner, so staging keeps working.
const [priorSigners, priorRequired] = sql(`select eligible_signers, required_signatures from admin.release_policy where archived_at is null`).split('|');
async function restorePolicy() {
  const owner = signers[1];
  if (!priorSigners || !owner) return;
  const ids = priorSigners.replace(/[{}]/g, '').split(',').filter(Boolean);
  const res = await rpc(await signIn(owner), 'set_release_policy', { p_eligible_signers: ids, p_required_signatures: Number(priorRequired) });
  check('teardown: the release policy live before the run is set again', res.ok, `status ${res.status} ${JSON.stringify(res.body)}`);
}

// The checks below run inside try/finally (not re-indented, to keep the diff small) so a failed run archives too.
try {
// Seed: one operator, one requester of client A, two clients with one order each.
const operator = await createUser('operator');
const requester = await createUser('requester');
sql(`insert into admin.lab_staff (user_id, role) values ('${operator.id}', 'operator');
     insert into admin.client (id, name, kind) values ('${clientA}', '${run} Client A', 'pi_lab'), ('${clientB}', '${run} Client B', 'company');
     insert into admin.client_member (client_id, user_id, role) values ('${clientA}', '${requester.id}', 'requester');
     insert into admin."order" (client_id, title) values ('${clientA}', '${run} order A'), ('${clientB}', '${run} order B');`);

const operatorToken = await signIn(operator);
const requesterToken = await signIn(requester);
check('real GoTrue sign-in returns tokens for both users', Boolean(operatorToken && requesterToken));

const mine = `order?select=code,client_id,title&title=like.${run}*`;
const opOrders = await (await api(operatorToken, mine)).json();
check('lab staff see orders of every client', Array.isArray(opOrders) && opOrders.length === 2, JSON.stringify(opOrders));
const rqOrders = await (await api(requesterToken, mine)).json();
check('a client requester sees only their own client', Array.isArray(rqOrders) && rqOrders.length === 1 && rqOrders[0].client_id === clientA, JSON.stringify(rqOrders));
const rqClients = await (await api(requesterToken, `client?select=name&name=like.${run}*`)).json();
check('the other client name is invisible to the requester', Array.isArray(rqClients) && rqClients.length === 1 && !JSON.stringify(rqClients).includes('Client B'), JSON.stringify(rqClients));

const foreign = await api(requesterToken, 'order', { method: 'POST', body: JSON.stringify({ client_id: clientB, title: `${run} foreign` }) });
check('a requester cannot create an order for another client', !foreign.ok, `status ${foreign.status}`);
const own = await api(requesterToken, 'order', { method: 'POST', body: JSON.stringify({ client_id: clientA, title: `${run} own` }) });
const created = own.ok ? (await own.json())[0] : null;
check('a requester can create an order for their own client, with a generated code', Boolean(created?.code?.match(/^ORD\d{3,}$/)), `status ${own.status}`);

const del = await api(operatorToken, `order?title=eq.${encodeURIComponent(`${run} order A`)}`, { method: 'DELETE' });
const stillThere = sql(`select count(*) from admin."order" where title = '${run} order A'`);
check('nobody can hard-delete, not even lab staff', stillThere === '1', `status ${del.status}, rows ${stillThere}`);

const audited = created ? sql(`select count(*) from admin.audit_event where entity_id = '${created.id ?? ''}' or after->>'code' = '${created.code}'`) : '0';
check('the insert made through the API is in the audit log', Number(audited) >= 1, `audit rows ${audited}`);
const tamper = await api(operatorToken, 'audit_event?id=gt.0', { method: 'PATCH', body: JSON.stringify({ action: 'tampered' }) });
const tampered = sql(`select count(*) from admin.audit_event where action = 'tampered'`);
check('the audit log cannot be edited through the API', tampered === '0', `status ${tamper.status}`);

const team = await fetch(`${rest}/pilot_projects?select=id`, { headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${requesterToken}` } });
check("Team's pilot tables live in the same database (shared sign-in reaches them)", team.ok, `status ${team.status}`);

// ---------------------------------------------------------------- wave 2: contract functions through rpc
// Happy path of 0005_wave2.sql with real tokens: receive, register, accept, policy, two signatures, release
// into Team's library. Note: set_release_policy replaces the staging lab's current policy (the old row is
// kept, archived); each run sets its own throwaway signers.
const owner = await createUser('owner');
const secondSigner = await createUser('admin');
sql(`insert into admin.lab_staff (user_id, role) values ('${owner.id}', 'owner'), ('${secondSigner.id}', 'admin');`);
signers.push(secondSigner, owner);
const ownerToken = await signIn(owner);
const adminToken = await signIn(secondSigner);
const hex = (c) => c.repeat(64);

const w2 = await (await api(operatorToken, 'order', { method: 'POST', body: JSON.stringify({ client_id: clientA, title: `${run} wave2` }) })).json();
const w2Order = Array.isArray(w2) ? w2[0] : null;
const stageOf = () => sql(`select stage from admin."order" where id = '${w2Order?.id}'`);
const receiveArgs = { p_order_id: w2Order?.id, p_carrier: 'courier', p_tracking_number: `${run}-trk`, p_condition: 'ok', p_box_count: 1, p_notes: 'synthetic' };

const notStaff = await rpc(requesterToken, 'receive_shipment', receiveArgs);
check('a client requester cannot call a staff function through rpc', !notStaff.ok && stageOf() === 'request', `status ${notStaff.status}`);
const shipment = await rpc(operatorToken, 'receive_shipment', receiveArgs);
check('receive_shipment returns the shipment and moves the order to received', shipment.ok && typeof shipment.body === 'string' && stageOf() === 'received', `status ${shipment.status}`);

const sample = (full_name, group1_term) => ({ full_name, client_sample_id: null, group1_term, group2_term: null, replicate_term: '1', patient_term: null, time_point_term: null, matrix: 'plasma', volume_ul: 50 });
const samples = await rpc(operatorToken, 'register_samples', { p_order_id: w2Order?.id, p_shipment_id: shipment.body, p_samples: [sample('Ctrl_A', 'Ctrl'), sample('Trt_A', 'Trt')] });
check('register_samples assigns codes and moves the order to registered',
  samples.ok && Array.isArray(samples.body) && samples.body.length === 2 && samples.body.every(r => r.sample_code.startsWith(`${w2Order?.code}-S`)) && stageOf() === 'registered',
  `status ${samples.status}`);
const dup = await rpc(operatorToken, 'register_samples', { p_order_id: w2Order?.id, p_shipment_id: null, p_samples: [sample('New_A', 'Ctrl'), sample('Ctrl_A', 'Ctrl')] });
const sampleRows = sql(`select count(*) from admin.sample where order_id = '${w2Order?.id}'`);
check('a duplicate full_name is refused all-or-nothing', !dup.ok && sampleRows === '2' && JSON.stringify(dup.body).includes('duplicate full_name'), `status ${dup.status}, rows ${sampleRows}`);

const rf = await rpc(operatorToken, 'accept_result_file', { p_order_id: w2Order?.id, p_storage_path: `${run}/results.txt`, p_sha256: hex('a'), p_sciex_os_version: '3.4.5', p_processing_method: 'synthetic', p_summary: { analytes: 3 } });
check('accept_result_file accepts the file and moves the order to processed', rf.ok && stageOf() === 'processed', `status ${rf.status}`);

// Built = the combined workbook plus the manifest of its analysis and companion files (0006), only through
// build_dataset (0008: no direct INSERT, the version the files carry, the path bound to the order and digest).
const manifest = { p_analysis_sha256: hex('9'), p_analysis_size_bytes: 1234, p_companion_sha256: hex('7'), p_companion_size_bytes: 99 };
const buildFor = (order, file, version, sha) => ({ p_order_id: order?.id, p_result_file_id: file, p_expected_version: version,
  p_storage_path: `${clientA}/${order?.code}/datasets/${sha}/dataset-v1.xlsx`, p_sha256: sha, ...manifest });
const directInsert = await api(operatorToken, 'dataset', { method: 'POST', body: JSON.stringify({ client_id: clientA, order_id: w2Order?.id, result_file_id: rf.body, version: 1, storage_path: `${run}/dataset.xlsx`, sha256: hex('b'),
  analysis_sha256: hex('9'), analysis_size_bytes: 1234, companion_sha256: hex('7'), companion_size_bytes: 99 }) });
const dsBuilt = await rpc(operatorToken, 'build_dataset', buildFor(w2Order, rf.body, 1, hex('b')));
const dataset = dsBuilt.ok ? { id: dsBuilt.body } : null;
const contentSwap = await api(operatorToken, `dataset?id=eq.${dataset?.id}`, { method: 'PATCH', body: JSON.stringify({ storage_path: `${run}/elsewhere.xlsx`, analysis_sha256: hex('c') }) });
const stale = await rpc(operatorToken, 'build_dataset', buildFor(w2Order, rf.body, 1, hex('d'))); // built for version 1, but 2 is next
const w2Row = sql(`select version || ',' || storage_path || ',' || analysis_sha256 from admin.dataset where order_id = '${w2Order?.id}'`);
check('a dataset is created only by build_dataset: a direct insert, a content change before signing and a stale expected version are refused',
  !directInsert.ok && dsBuilt.ok && !contentSwap.ok && !stale.ok && JSON.stringify(stale.body).includes('PT409')
    && w2Row === `1,${clientA}/${w2Order?.code}/datasets/${hex('b')}/dataset-v1.xlsx,${hex('9')}`,
  `statuses ${directInsert.status}/${dsBuilt.status}/${contentSwap.status}/${stale.status}, rows ${w2Row}`);

const policyArgs = { p_eligible_signers: [owner.id, secondSigner.id], p_required_signatures: 2 };
const adminPolicy = await rpc(adminToken, 'set_release_policy', policyArgs);
check('only the Owner can set the release policy', !adminPolicy.ok, `status ${adminPolicy.status}`);
const policy = await rpc(ownerToken, 'set_release_policy', policyArgs);
check('the Owner sets the release policy (two named signers, two signatures)', policy.ok, `status ${policy.status}`);

const signArgs = (role) => ({ p_dataset_id: dataset?.id, p_role: role, p_note: 'synthetic' });
const first = await rpc(ownerToken, 'sign_dataset', signArgs('prepared'));
const twice = await rpc(ownerToken, 'sign_dataset', signArgs('approved'));
const outsider = await rpc(operatorToken, 'sign_dataset', signArgs('reviewed'));
check('a signer signs once; a second signature by the same person and a signer outside the policy are refused',
  first.ok && !twice.ok && !outsider.ok, `statuses ${first.status}/${twice.status}/${outsider.status}`);

const projectId = randomUUID();
const releaseArgs = { p_dataset_id: dataset?.id, p_analysis_object_path: `${projectId}/${hex('9')}`, p_analysis_sha256: hex('9'), p_analysis_size_bytes: 1234, p_analysis_name: `${run} analysis.xlsx`, p_companion_path: `${clientA}/${w2Order?.code}/companion.xlsx` };
const early = await rpc(ownerToken, 'release_dataset', releaseArgs);
check('release is refused below the policy count', !early.ok && sql(`select count(*) from public.pilot_projects where id = '${projectId}'`) === '0', `status ${early.status}`);
const second = await rpc(adminToken, 'sign_dataset', signArgs('approved'));
const released = await rpc(adminToken, 'release_dataset', releaseArgs);
check('release_dataset returns the Team project id', second.ok && released.ok && released.body === projectId, `statuses ${second.status}/${released.status}`);

const teamRows = sql(`select (select count(*) from public.pilot_projects where id = '${projectId}') || ',' ||
  (select count(*) from public.pilot_members where project_id = '${projectId}') || ',' ||
  (select string_agg(object_path, ';') from public.pilot_files where project_id = '${projectId}')`);
check('release creates one project, its members (2 signers + 1 client member) and one pilot_files row at <project_id>/<sha256>',
  teamRows === `1,3,${projectId}/${hex('9')}`, teamRows);
const frozen = sql(`select status || ',' || stage from admin.dataset d join admin."order" o on o.id = d.order_id where d.id = '${dataset?.id}'`);
check('the dataset is frozen as released and the order reached released', frozen === 'released,released', frozen);
const teamView = await fetch(`${rest}/pilot_projects?select=id,name&id=eq.${projectId}`, { headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${requesterToken}` } });
const teamProjects = teamView.ok ? await teamView.json() : [];
check("the client member opens the project through Team's own RLS", teamProjects.length === 1 && teamProjects[0].name.startsWith(w2Order?.code ?? '?'), `status ${teamView.status}`);
const w2Audit = sql(`select count(*) from admin.audit_event where
  (entity = 'shipment' and entity_id = '${shipment.body}' and actor = '${operator.id}') or
  (entity = 'release_policy' and action = 'INSERT' and actor = '${owner.id}') or
  (entity = 'dataset' and entity_id = '${dataset?.id}' and after->>'status' = 'released' and actor = '${secondSigner.id}')`);
check('receive, policy and release are in the audit log with their actors', w2Audit === '3', `audit rows ${w2Audit}`);

// ---------------------------------------------------------------- wave 2 fixes (0006_wave2_fixes.sql)
// Old release paths under a three-signature policy, a signer removed after signing, a substituted analysis
// file, and bucket admin-files with real Storage tokens. Sets its own throwaway policy like the block above.
const leaver = await createUser('leaver');
sql(`insert into admin.lab_staff (user_id, role) values ('${leaver.id}', 'operator');`);
const leaverToken = await signIn(leaver);
const fx = await (await api(operatorToken, 'order', { method: 'POST', body: JSON.stringify({ client_id: clientA, title: `${run} fixes` }) })).json();
const fxOrder = Array.isArray(fx) ? fx[0] : null;
const fxFile = await rpc(operatorToken, 'accept_result_file', { p_order_id: fxOrder?.id, p_storage_path: `${clientA}/${fxOrder?.code}/${run}/fixes.txt`, p_sha256: hex('a'), p_sciex_os_version: '3.4.5', p_processing_method: 'synthetic', p_summary: { analytes: 3 } });
const fxDs = await rpc(operatorToken, 'build_dataset', buildFor(fxOrder, fxFile.body, 1, hex('b')));
const fxDataset = fxDs.ok ? { id: fxDs.body } : null;
const fxState = () => sql(`select status || ',' || coalesce(project_id::text, '-') from admin.dataset where id = '${fxDataset?.id}'`);
const fxSign = (role) => ({ p_dataset_id: fxDataset?.id, p_role: role, p_note: 'synthetic' });

const three = await rpc(ownerToken, 'set_release_policy', { p_eligible_signers: [owner.id, secondSigner.id, leaver.id], p_required_signatures: 3 });
const fxFirst = await rpc(ownerToken, 'sign_dataset', fxSign('prepared'));
const fxSecond = await rpc(adminToken, 'sign_dataset', fxSign('reviewed'));
const directSign = await api(operatorToken, 'signature', { method: 'POST', body: JSON.stringify({ client_id: clientA, dataset_id: fxDataset?.id, user_id: operator.id, role: 'approved' }) });
const directRelease = await api(adminToken, `dataset?id=eq.${fxDataset?.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'released' }) });
const oldRpc = await rpc(adminToken, 'release_dataset', { did: fxDataset?.id });
const fxSignatures = sql(`select count(*) from admin.signature where dataset_id = '${fxDataset?.id}'`);
check('under a three-signature policy with two signatures, a direct signature insert, UPDATE status and the old release_dataset(did) are all refused',
  three.ok && fxFirst.ok && fxSecond.ok && !directSign.ok && !directRelease.ok && !oldRpc.ok && fxSignatures === '2' && fxState() === 'built,-',
  `statuses ${three.status}/${fxFirst.status}/${fxSecond.status}/${directSign.status}/${directRelease.status}/${oldRpc.status}, signatures ${fxSignatures}, ${fxState()}`);

const fxThird = await rpc(leaverToken, 'sign_dataset', fxSign('approved'));
const two = await rpc(ownerToken, 'set_release_policy', { p_eligible_signers: [owner.id, secondSigner.id], p_required_signatures: 2 });
sql(`update admin.lab_staff set archived_at = now(), archived_reason = '${run} left the lab' where user_id = '${leaver.id}';`);
const fxProject = randomUUID();
const fxRelease = (sha, size) => ({ p_dataset_id: fxDataset?.id, p_analysis_object_path: `${fxProject}/${sha}`, p_analysis_sha256: sha, p_analysis_size_bytes: size, p_analysis_name: `${run} fixes.xlsx`, p_companion_path: `${clientA}/${fxOrder?.code}/companion.xlsx` });
const swapped = await rpc(adminToken, 'release_dataset', fxRelease(hex('c'), 1234));
check('a release presenting another analysis file than the recorded one is refused and creates no Team rows',
  fxThird.ok && two.ok && !swapped.ok && JSON.stringify(swapped.body).includes('not the analysis file recorded') && fxState() === 'built,-'
    && sql(`select count(*) from public.pilot_projects where id = '${fxProject}'`) === '0',
  `statuses ${fxThird.status}/${two.status}/${swapped.status}, ${fxState()}`);
const fxReleased = await rpc(adminToken, 'release_dataset', fxRelease(hex('9'), 1234));
const leaverMember = sql(`select count(*) from public.pilot_members where project_id = '${fxProject}' and user_id = '${leaver.id}'`);
const leaverView = await fetch(`${rest}/pilot_projects?select=id&id=eq.${fxProject}`, { headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${leaverToken}` } });
const leaverProjects = leaverView.ok ? await leaverView.json() : null;
check('a signer removed from the policy and the lab after signing gets no Team ownership and cannot open the project',
  fxReleased.ok && fxReleased.body === fxProject && leaverMember === '0' && Array.isArray(leaverProjects) && leaverProjects.length === 0,
  `status ${fxReleased.status}, member rows ${leaverMember}, view ${leaverView.status} ${JSON.stringify(leaverProjects)}`);

const storage = `http://127.0.0.1:${env.STORAGE_PORT}`;
const objectApi = (token, path, init = {}) => fetch(`${storage}/object/${path}`, { ...init, headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${token}`, ...init.headers } });
const txt = Buffer.from(`Sample Name\tComponent Name\tArea\n${run}_S001\tSynthetic lipid 1\t1000\n`);
const txtSha = createHash('sha256').update(txt).digest('hex');
const key = `${clientA}/${w2Order?.code}/${run}/${txtSha}.txt`;
const put = (token, path, method = 'POST') => objectApi(token, `admin-files/${path}`, { method, body: txt, headers: { 'Content-Type': 'text/plain' } });
const upload = await put(operatorToken, key);
const back = await objectApi(operatorToken, `authenticated/admin-files/${key}`);
const backSha = back.ok ? createHash('sha256').update(Buffer.from(await back.arrayBuffer())).digest('hex') : '';
check('an Operator uploads a synthetic TXT to admin-files under <client_id>/<order_code>/ and reads the same bytes back',
  upload.ok && backSha === txtSha, `statuses ${upload.status}/${back.status}`);
const clientUpload = await put(requesterToken, `${clientA}/${w2Order?.code}/${run}/client.txt`);
const clientRead = await objectApi(requesterToken, `authenticated/admin-files/${key}`);
const overwrite = await put(operatorToken, key);
const upsert = await put(operatorToken, key, 'PUT');
const outside = await put(operatorToken, `${clientB}/${w2Order?.code}/${run}/wrong-client.txt`);
check("admin-files refuses a client token (upload and read), an overwrite of an existing object and a path outside the order's client",
  !clientUpload.ok && !clientRead.ok && !overwrite.ok && !upsert.ok && !outside.ok,
  `statuses ${clientUpload.status}/${clientRead.status}/${overwrite.status}/${upsert.status}/${outside.status}`);

// ---------------------------------------------------------------- wave 2b: release side (0007_release.sql)
// build_dataset → sign ×2 → release → a second version → supersede → withdraw through the real RPCs, plus the
// pre-release upload of the analysis file to case-files with an eligible signer's own token. Uses the policy the
// block above left in place (owner + admin, two signatures; the leaver is archived).
const rb = await (await api(operatorToken, 'order', { method: 'POST', body: JSON.stringify({ client_id: clientA, title: `${run} release` }) })).json();
const rbOrder = Array.isArray(rb) ? rb[0] : null;
const rbStage = () => sql(`select stage from admin."order" where id = '${rbOrder?.id}'`);
const rbFile = await rpc(operatorToken, 'accept_result_file', { p_order_id: rbOrder?.id, p_storage_path: `${clientA}/${rbOrder?.code}/${run}/release.txt`, p_sha256: hex('a'), p_sciex_os_version: '3.4.5', p_processing_method: 'synthetic', p_summary: { analytes: 3 } });
const buildArgs = (sha, analysis, version = 1) => ({ p_order_id: rbOrder?.id, p_result_file_id: rbFile.body, p_expected_version: version, p_storage_path: `${clientA}/${rbOrder?.code}/datasets/${sha}/dataset-v1.xlsx`, p_sha256: sha,
  p_analysis_sha256: analysis, p_analysis_size_bytes: 2048, p_companion_sha256: hex('2'), p_companion_size_bytes: 512 });
const notBuilder = await rpc(requesterToken, 'build_dataset', buildArgs(hex('3'), hex('1')));
const foreignFile = await rpc(operatorToken, 'build_dataset', { ...buildArgs(hex('3'), hex('1')), p_result_file_id: rf.body }); // accepted for the wave 2 order, not this one
const built = await rpc(operatorToken, 'build_dataset', buildArgs(hex('3'), hex('1')));
const builtRow = sql(`select version || ',' || status || ',' || analysis_sha256 || ',' || analysis_size_bytes from admin.dataset where id = '${built.body}'`);
check('build_dataset is staff-only, refuses another order\'s results file, records the manifest as version 1 and moves the order to excel_built',
  rbFile.ok && !notBuilder.ok && !foreignFile.ok && built.ok && builtRow === `1,built,${hex('1')},2048` && rbStage() === 'excel_built',
  `statuses ${rbFile.status}/${notBuilder.status}/${foreignFile.status}/${built.status}, row ${builtRow}, stage ${rbStage()}`);

const rbProject = randomUUID();
const analysisKey = `${rbProject}/${hex('1')}`;
const stage = (token, key) => objectApi(token, `case-files/${key}`, { method: 'POST', body: Buffer.from(`${run} analysis ${key}`), headers: { 'Content-Type': 'application/octet-stream' } });
const staged = await stage(ownerToken, analysisKey);
const stagedByOutsider = await stage(operatorToken, `${randomUUID()}/${hex('1')}`); // not in the policy
const stagedWrongDigest = await stage(ownerToken, `${randomUUID()}/${hex('4')}`); // no built dataset records it
check('an eligible signer stages the pending analysis file in case-files at <project_id>/<analysis_sha256>; an outsider and an unrecorded digest are refused',
  staged.ok && !stagedByOutsider.ok && !stagedWrongDigest.ok, `statuses ${staged.status}/${stagedByOutsider.status}/${stagedWrongDigest.status}`);

const rbSign = (role, ds = built.body) => ({ p_dataset_id: ds, p_role: role, p_note: 'synthetic' });
const rbFirst = await rpc(ownerToken, 'sign_dataset', rbSign('prepared'));
const rbSecond = await rpc(adminToken, 'sign_dataset', rbSign('approved'));
const rbReleaseArgs = (ds, project, analysis, sha) => ({ p_dataset_id: ds, p_analysis_object_path: `${project}/${analysis}`, p_analysis_sha256: analysis, p_analysis_size_bytes: 2048,
  p_analysis_name: `${rbOrder?.code} dataset analysis.xlsx`, p_companion_path: `${clientA}/${rbOrder?.code}/datasets/${sha}/companion.xlsx` });
const rbReleased = await rpc(adminToken, 'release_dataset', rbReleaseArgs(built.body, rbProject, hex('1'), hex('3')));
const stagedAfterRelease = await stage(ownerToken, `${randomUUID()}/${hex('1')}`); // released: the digest is no longer pending
const rbFiles = sql(`select sha256 || ',' || size_bytes from public.pilot_files where project_id = '${rbProject}'`);
check('a dataset built by build_dataset is released through release_dataset with its recorded manifest; the digest can no longer be staged elsewhere',
  rbFirst.ok && rbSecond.ok && rbReleased.ok && rbReleased.body === rbProject && rbFiles === `${hex('1')},2048` && rbStage() === 'released' && !stagedAfterRelease.ok,
  `statuses ${rbFirst.status}/${rbSecond.status}/${rbReleased.status}/${stagedAfterRelease.status}, files ${rbFiles}, stage ${rbStage()}`);

const v2 = await rpc(operatorToken, 'build_dataset', buildArgs(hex('5'), hex('6'), 2));
const v2Row = sql(`select version || ',' || status from admin.dataset where id = '${v2.body}'`);
const earlySupersede = await rpc(adminToken, 'supersede_dataset', { p_dataset_id: built.body, p_new_dataset_id: v2.body }); // v2 is only built
const v2Signed = [await rpc(ownerToken, 'sign_dataset', rbSign('prepared', v2.body)), await rpc(adminToken, 'sign_dataset', rbSign('approved', v2.body))];
const rbProject2 = randomUUID();
const v2Staged = await stage(adminToken, `${rbProject2}/${hex('6')}`);
const v2Released = await rpc(adminToken, 'release_dataset', rbReleaseArgs(v2.body, rbProject2, hex('6'), hex('5')));
check('a second version is numbered 2, cannot supersede version 1 while only built, and is released as a second Team project',
  v2.ok && v2Row === '2,built' && !earlySupersede.ok && v2Signed.every(r => r.ok) && v2Staged.ok && v2Released.ok && v2Released.body === rbProject2,
  `statuses ${v2.status}/${earlySupersede.status}/${v2Signed.map(r => r.status).join('|')}/${v2Staged.status}/${v2Released.status}, row ${v2Row}`);

// 0008: a released version is never archived through the archive columns; only withdraw/supersede retire it.
const archiveReleased = await api(operatorToken, `dataset?id=eq.${v2.body}`, { method: 'PATCH', body: JSON.stringify({ archived_at: new Date().toISOString(), archived_reason: `${run} gone` }) });
const v2Live = sql(`select status || ',' || (archived_at is null) from admin.dataset where id = '${v2.body}'`);
check('an Operator cannot archive a released version through the archive columns', !archiveReleased.ok && v2Live === 'released,true', `status ${archiveReleased.status}, ${v2Live}`);
const supersedeOutsider = await rpc(operatorToken, 'supersede_dataset', { p_dataset_id: built.body, p_new_dataset_id: v2.body });
const superseded = await rpc(adminToken, 'supersede_dataset', { p_dataset_id: built.body, p_new_dataset_id: v2.body });
const v1State = () => sql(`select status || ',' || coalesce(archived_reason, '-') from admin.dataset where id = '${built.body}'`);
check('supersede_dataset needs an eligible signer and marks version 1 as superseded by version 2, keeping both Team projects',
  !supersedeOutsider.ok && superseded.ok && v1State() === `superseded,superseded by version 2 (${v2.body})`
    && sql(`select count(*) from public.pilot_projects where id in ('${rbProject}', '${rbProject2}')`) === '2',
  `statuses ${supersedeOutsider.status}/${superseded.status}, ${v1State()}`);

const withdrawOutsider = await rpc(operatorToken, 'withdraw_dataset', { p_dataset_id: v2.body, p_reason: `${run} not eligible` });
const withdrawBlank = await rpc(adminToken, 'withdraw_dataset', { p_dataset_id: v2.body, p_reason: '  ' });
const withdrawn = await rpc(adminToken, 'withdraw_dataset', { p_dataset_id: v2.body, p_reason: `${run} wrong metadata` });
const v2State = sql(`select status || ',' || coalesce(archived_reason, '-') from admin.dataset where id = '${v2.body}'`);
check('withdraw_dataset refuses an ineligible caller and a blank reason, then freezes the released version as withdrawn with the reason; the Team project stays',
  !withdrawOutsider.ok && !withdrawBlank.ok && withdrawn.ok && v2State === `withdrawn,${run} wrong metadata`
    && sql(`select count(*) from public.pilot_projects where id = '${rbProject2}'`) === '1' && rbStage() === 'released',
  `statuses ${withdrawOutsider.status}/${withdrawBlank.status}/${withdrawn.status}, ${v2State}, stage ${rbStage()}`);
const rbAudit = sql(`select count(*) from admin.audit_event where
  (entity = 'dataset' and action = 'INSERT' and entity_id = '${built.body}' and actor = '${operator.id}') or
  (entity = 'dataset' and entity_id = '${built.body}' and after->>'status' = 'superseded' and actor = '${secondSigner.id}') or
  (entity = 'dataset' and entity_id = '${v2.body}' and after->>'status' = 'withdrawn' and actor = '${secondSigner.id}')`);
check('build, supersede and withdraw are in the audit log with their actors', rbAudit === '3', `audit rows ${rbAudit}`);

// ---------------------------------------------------------------- Open in Nexo (0009_nexo_reader.sql)
// The Nexo API's identity: a JWT whose role claim is nexo_reader, minted here with the stack's JWT_SECRET (HS256,
// ten minutes, never printed). It calls admin.nexo_dataset and downloads one object from admin-files, nothing else.
// The workbooks uploaded here are synthetic bytes, not real workbooks: only their digests and paths matter.
function mintJwt(claims, secret) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}
const issuedAt = Math.floor(Date.now() / 1000);
const nexoToken = env.JWT_SECRET ? mintJwt({ role: 'nexo_reader', iss: 'supabase', iat: issuedAt, exp: issuedAt + 600 }, env.JWT_SECRET) : '';
check('the stack .env has JWT_SECRET to mint the nexo_reader token', Boolean(nexoToken));

const nx = await (await api(operatorToken, 'order', { method: 'POST', body: JSON.stringify({ client_id: clientA, title: `${run} nexo` }) })).json();
const nxOrder = Array.isArray(nx) ? nx[0] : null;
const nxFile = await rpc(operatorToken, 'accept_result_file', { p_order_id: nxOrder?.id, p_storage_path: `${clientA}/${nxOrder?.code}/${run}/nexo.txt`, p_sha256: hex('a'), p_sciex_os_version: '3.4.5', p_processing_method: 'synthetic', p_summary: { analytes: 3 } });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const workbook = (n) => Buffer.from(`${run} synthetic dataset workbook v${n}`);
const nxPath = (n) => `${clientA}/${nxOrder?.code}/datasets/${digest(workbook(n))}/dataset-v1.xlsx`;
const nxAnalysis = (n) => digest(Buffer.from(`${run} nexo analysis v${n}`));
const nxUpload = (n) => objectApi(operatorToken, `admin-files/${nxPath(n)}`, { method: 'POST', body: workbook(n), headers: { 'Content-Type': 'application/octet-stream' } });
const nxBuild = (n) => rpc(operatorToken, 'build_dataset', { p_order_id: nxOrder?.id, p_result_file_id: nxFile.body, p_expected_version: n, p_storage_path: nxPath(n), p_sha256: digest(workbook(n)),
  p_analysis_sha256: nxAnalysis(n), p_analysis_size_bytes: 2048, p_companion_sha256: hex('2'), p_companion_size_bytes: 512 });

const nxUp1 = await nxUpload(1);
const nxV1 = await nxBuild(1);
const nxProject = randomUUID();
const nxStaged = await stage(ownerToken, `${nxProject}/${nxAnalysis(1)}`);
const nxSigned = [await rpc(ownerToken, 'sign_dataset', rbSign('prepared', nxV1.body)), await rpc(adminToken, 'sign_dataset', rbSign('approved', nxV1.body))];
const nxReleased = await rpc(adminToken, 'release_dataset', { p_dataset_id: nxV1.body, p_analysis_object_path: `${nxProject}/${nxAnalysis(1)}`, p_analysis_sha256: nxAnalysis(1), p_analysis_size_bytes: 2048,
  p_analysis_name: `${nxOrder?.code} dataset analysis.xlsx`, p_companion_path: `${clientA}/${nxOrder?.code}/datasets/${hex('2')}/companion.xlsx` });
const nxUp2 = await nxUpload(2);
const nxV2 = await nxBuild(2); // stays built
check('setup: version 1 uploaded, built, signed twice and released; version 2 uploaded and built',
  nxFile.ok && nxUp1.ok && nxV1.ok && nxStaged.ok && nxSigned.every(r => r.ok) && nxReleased.ok && nxUp2.ok && nxV2.ok,
  `statuses ${nxFile.status}/${nxUp1.status}/${nxV1.status}/${nxStaged.status}/${nxSigned.map(r => r.status).join('|')}/${nxReleased.status}/${nxUp2.status}/${nxV2.status}`);

const nexoRow = (ds) => rpc(nexoToken, 'nexo_dataset', { p_dataset_id: ds });
const nxRow = await nexoRow(nxV1.body);
check('nexo_reader: nexo_dataset returns the released, current dataset (id, order code, version, path, digest)',
  nxRow.ok && JSON.stringify(nxRow.body) === JSON.stringify([{ dataset_id: nxV1.body, order_code: nxOrder?.code, version: 1, storage_path: nxPath(1), sha256: digest(workbook(1)) }]),
  `status ${nxRow.status} ${JSON.stringify(nxRow.body)}`);
const noRows = [await nexoRow(nxV2.body), await nexoRow(v2.body), await nexoRow(built.body), await nexoRow(randomUUID())];
check('nexo_reader: built, withdrawn, superseded and unknown ids give an empty answer',
  noRows.every(r => r.ok && Array.isArray(r.body) && r.body.length === 0), noRows.map(r => `${r.status} ${JSON.stringify(r.body)}`).join(' | '));

// A negative check passes only on an explicit refusal, never on a broken backend: Storage answers 4xx with a body whose
// statusCode names 401/403/404 (an object it cannot see is HTTP 400 {"statusCode":"404",...}); PostgREST answers
// 401/403 with code 42501. A 5xx or an unrecognized body fails the check.
const readBody = async (res) => { const text = await res.text(); try { return text ? JSON.parse(text) : null; } catch { return text; } };
const storageCall = async (token, path, init = {}) => { const res = await objectApi(token, path, init); return { ok: res.ok, status: res.status, body: await readBody(res) }; };
const pgCall = async (res) => ({ ok: res.ok, status: res.status, body: await readBody(res) });
const storageRefused = (r) => [400, 401, 403, 404].includes(r.status) && ['401', '403', '404'].includes(String(r.body?.statusCode));
const pgRefused = (r) => [401, 403].includes(r.status) && r.body?.code === '42501';
const show = (r) => `${r.status} ${JSON.stringify(r.body)?.slice(0, 120)}`;
const jsonPost = (body) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

const nexoGet = async (bucketPath) => {
  const res = await objectApi(nexoToken, `authenticated/${bucketPath}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  let body = null; if (!res.ok) { try { body = JSON.parse(bytes.toString('utf8')); } catch { body = bytes.toString('utf8'); } }
  return { ok: res.ok, status: res.status, body, sha: res.ok ? digest(bytes) : '' };
};
const nxDownload = await nexoGet(`admin-files/${nxPath(1)}`);
check('nexo_reader downloads the released workbook from admin-files and its bytes match the recorded sha256',
  nxDownload.ok && nxDownload.sha === digest(workbook(1)), show(nxDownload));
const nxElsewhere = [await nexoGet(`admin-files/${nxPath(2)}`), await nexoGet(`admin-files/${key}`), await nexoGet(`case-files/${nxProject}/${nxAnalysis(1)}`)];
const nxWrite = await storageCall(nexoToken, `admin-files/${clientA}/${nxOrder?.code}/${run}/nexo-write.txt`, { method: 'POST', body: txt, headers: { 'Content-Type': 'text/plain' } });
check('nexo_reader is refused the built version, another admin-files object, a case-files object and an upload',
  nxElsewhere.every(storageRefused) && storageRefused(nxWrite), `${nxElsewhere.map(show).join(' | ')} | upload ${show(nxWrite)}`);

// Signing: a signed URL is checked only when issued and is then served as a superuser, so it would outlive withdrawal
// and supersession. The workbook nexo_reader can download must still not be signable, singly or in bulk; an
// Operator signing the same object proves the endpoint works.
const nxSign = await storageCall(nexoToken, `sign/admin-files/${nxPath(1)}`, jsonPost({ expiresIn: 60 }));
const nxSignMany = await storageCall(nexoToken, 'sign/admin-files', jsonPost({ expiresIn: 60, paths: [nxPath(1)] }));
const opSign = await storageCall(operatorToken, `sign/admin-files/${nxPath(1)}`, jsonPost({ expiresIn: 60 }));
const manyRefused = storageRefused(nxSignMany) || (nxSignMany.status === 200 && Array.isArray(nxSignMany.body) && nxSignMany.body.length === 1
  && nxSignMany.body.every(e => e.signedURL == null && typeof e.error === 'string' && e.error.length > 0));
check('nexo_reader cannot sign a URL (single or bulk) for the workbook it can download; an Operator can (control)',
  storageRefused(nxSign) && manyRefused && opSign.ok && typeof opSign.body?.signedURL === 'string',
  `sign ${show(nxSign)} | sign_many ${show(nxSignMany)} | operator ${opSign.status}`);

// Listing: a forbidden-only prefix (the TXT uploaded above) and a mixed prefix (the released workbook's folder, plus a
// sibling uploaded here). Only a successful listing that shows nothing beyond the workbook counts; an Operator listing
// both prefixes is the control.
const sibling = 'nexo-sibling.txt';
const mixedPrefix = `${clientA}/${nxOrder?.code}/datasets/${digest(workbook(1))}/`;
const forbiddenPrefix = `${clientA}/${w2Order?.code}/${run}/`;
const nxSibling = await objectApi(operatorToken, `admin-files/${mixedPrefix}${sibling}`, { method: 'POST', body: txt, headers: { 'Content-Type': 'text/plain' } });
const list = (token, prefix) => storageCall(token, 'list/admin-files', jsonPost({ prefix, limit: 100 }));
const names = (r) => (Array.isArray(r.body) ? r.body.map(e => e.name).sort() : null);
const listedOnly = (r, allowed) => r.status === 200 && Array.isArray(r.body) && r.body.every(e => allowed.includes(e.name));
const opMixed = await list(operatorToken, mixedPrefix);
const opForbidden = await list(operatorToken, forbiddenPrefix);
const nxMixed = await list(nexoToken, mixedPrefix);
const nxForbidden = await list(nexoToken, forbiddenPrefix);
check('listing: an Operator sees the workbook and its sibling, and the TXT (control); nexo_reader gets a successful listing with nothing beyond the workbook',
  nxSibling.ok && JSON.stringify(names(opMixed)) === JSON.stringify(['dataset-v1.xlsx', sibling].sort()) && (names(opForbidden) ?? []).includes(`${txtSha}.txt`)
    && listedOnly(nxMixed, ['dataset-v1.xlsx']) && listedOnly(nxForbidden, []),
  `sibling ${nxSibling.status}, operator ${show(opMixed)} / ${show(opForbidden)}, nexo ${show(nxMixed)} / ${show(nxForbidden)}`);

const nxOrders = await pgCall(await api(nexoToken, `order?select=code&id=eq.${nxOrder?.id}`));
const nxDatasets = await pgCall(await api(nexoToken, `dataset?select=id&id=eq.${nxV1.body}`));
const nxStaff = [await rpc(nexoToken, 'receive_shipment', { ...receiveArgs, p_order_id: nxOrder?.id }), await rpc(nexoToken, 'withdraw_dataset', { p_dataset_id: nxV1.body, p_reason: `${run} nexo` }),
  await rpc(nexoToken, 'sign_dataset', rbSign('reviewed', nxV2.body))];
const nxTeam = await pgCall(await fetch(`${rest}/pilot_projects?select=id&id=eq.${nxProject}`, { headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${nexoToken}` } }));
check('nexo_reader cannot read admin.order, admin.dataset or Team\'s projects, nor call staff RPCs',
  [nxOrders, nxDatasets, nxTeam, ...nxStaff].every(pgRefused) && sql(`select status from admin.dataset where id = '${nxV1.body}'`) === 'released',
  [nxOrders, nxDatasets, nxTeam, ...nxStaff].map(show).join(' | '));

const ordinary = [];
for (const [who, token] of [['anon', env.ANON_KEY], ['operator', operatorToken], ['requester', requesterToken]]) {
  ordinary.push([`${who} nexo_dataset`, await rpc(token, 'nexo_dataset', { p_dataset_id: nxV1.body })],
    [`${who} is_nexo_object`, await rpc(token, 'is_nexo_object', { p_name: nxPath(1) })]);
}
check('anon and authenticated callers (lab staff and client alike) are refused both nexo_dataset and is_nexo_object',
  ordinary.every(([, r]) => pgRefused(r)), ordinary.map(([n, r]) => `${n} ${show(r)}`).join(' | '));

// ---------------------------------------------------------------- Admin accounts in Nexo (0010_nexo_caller.sql)
// docs/integration/admin-identity.md: the Nexo API calls admin.nexo_dataset_for_caller with the anon key and the
// signed-in user's own GoTrue token. Here version 1 of the nexo order is released and current, version 2 only built.
// A member of client B (and only B) is the "another client" case; tokens minted below are synthetic and never printed.
const bMember = await createUser('b-member');
sql(`insert into admin.client_member (client_id, user_id, role) values ('${clientB}', '${bMember.id}', 'viewer');`);
const bMemberToken = await signIn(bMember);
const callerRow = (token, ds) => rpc(token, 'nexo_dataset_for_caller', { p_dataset_id: ds });
const expectedCaller = (caller, view) => JSON.stringify([{ dataset_id: nxV1.body, order_code: nxOrder?.code, version: 1, storage_path: nxPath(1), sha256: digest(workbook(1)),
  client_id: clientA, caller, caller_view: view }]);
const empty = (r) => r.ok && Array.isArray(r.body) && r.body.length === 0;
const asStaff = await callerRow(operatorToken, nxV1.body);
check('caller: lab staff get the released, current dataset with client_id, caller and caller_view staff',
  asStaff.ok && JSON.stringify(asStaff.body) === expectedCaller(operator.id, 'staff'), show(asStaff));
const asMember = await callerRow(requesterToken, nxV1.body);
check('caller: a member of the dataset\'s client gets it with caller_view client',
  asMember.ok && JSON.stringify(asMember.body) === expectedCaller(requester.id, 'client'), show(asMember));
const asOther = await callerRow(bMemberToken, nxV1.body);
check('caller: a member of another client gets an empty answer (same as an unknown id)',
  empty(asOther) && empty(await callerRow(bMemberToken, randomUUID())), show(asOther));
const callerNoRows = [];
for (const [who, token] of [['staff', operatorToken], ['member', requesterToken]]) {
  callerNoRows.push([`${who} built v2`, await callerRow(token, nxV2.body)], [`${who} withdrawn`, await callerRow(token, v2.body)],
    [`${who} superseded`, await callerRow(token, built.body)], [`${who} unknown`, await callerRow(token, randomUUID())]);
}
check('caller: built, withdrawn, superseded and unknown ids give an empty answer to staff and members alike',
  callerNoRows.every(([, r]) => empty(r)), callerNoRows.map(([n, r]) => `${n} ${show(r)}`).join(' | '));
const callerAnon = await callerRow(env.ANON_KEY, nxV1.body);
const callerNexo = await callerRow(nexoToken, nxV1.body);
check('caller: anon and the nexo_reader token are refused (42501)', pgRefused(callerAnon) && pgRefused(callerNexo), `anon ${show(callerAnon)} | nexo ${show(callerNexo)}`);
const forged = mintJwt({ role: 'authenticated', sub: requester.id, aud: 'authenticated', iat: issuedAt, exp: issuedAt + 600 }, randomBytes(32).toString('base64url'));
const expired = env.JWT_SECRET ? mintJwt({ role: 'authenticated', sub: requester.id, aud: 'authenticated', iat: issuedAt - 7200, exp: issuedAt - 3600 }, env.JWT_SECRET) : '';
const callerForged = await callerRow(forged, nxV1.body);
const callerExpired = await callerRow(expired, nxV1.body);
check('caller: a token signed with another secret and an expired token are 401 at PostgREST (no row, no 5xx)',
  callerForged.status === 401 && callerExpired.status === 401, `forged ${show(callerForged)} | expired ${show(callerExpired)}`);

// Retirement after a successful download: version 2 is released, supersedes version 1 (v1 denied, v2 downloadable),
// then is withdrawn (v2 denied).
const nxProject2 = randomUUID();
const nxStaged2 = await stage(adminToken, `${nxProject2}/${nxAnalysis(2)}`);
const nxSigned2 = [await rpc(ownerToken, 'sign_dataset', rbSign('prepared', nxV2.body)), await rpc(adminToken, 'sign_dataset', rbSign('approved', nxV2.body))];
const nxReleased2 = await rpc(adminToken, 'release_dataset', { p_dataset_id: nxV2.body, p_analysis_object_path: `${nxProject2}/${nxAnalysis(2)}`, p_analysis_sha256: nxAnalysis(2), p_analysis_size_bytes: 2048,
  p_analysis_name: `${nxOrder?.code} dataset analysis v2.xlsx`, p_companion_path: `${clientA}/${nxOrder?.code}/datasets/${digest(workbook(2))}/companion.xlsx` });
const nxBefore = await nexoGet(`admin-files/${nxPath(1)}`);
const nxSuperseded = await rpc(adminToken, 'supersede_dataset', { p_dataset_id: nxV1.body, p_new_dataset_id: nxV2.body });
const nxV1Row = await nexoRow(nxV1.body);
const nxV1Gone = await nexoGet(`admin-files/${nxPath(1)}`);
const nxV2Download = await nexoGet(`admin-files/${nxPath(2)}`);
check('a download that worked is refused once version 1 is superseded (no row, explicit refusal); the released version 2 downloads instead',
  nxStaged2.ok && nxSigned2.every(r => r.ok) && nxReleased2.ok && nxBefore.ok && nxBefore.sha === digest(workbook(1)) && nxSuperseded.ok
    && nxV1Row.ok && Array.isArray(nxV1Row.body) && nxV1Row.body.length === 0 && storageRefused(nxV1Gone) && nxV2Download.ok && nxV2Download.sha === digest(workbook(2)),
  `statuses ${nxStaged2.status}/${nxSigned2.map(r => r.status).join('|')}/${nxReleased2.status}/${nxBefore.status}/${nxSuperseded.status}/${nxV1Row.status}, v1 ${show(nxV1Gone)}, v2 ${nxV2Download.status}`);

const nxWithdrawn = await rpc(adminToken, 'withdraw_dataset', { p_dataset_id: nxV2.body, p_reason: `${run} nexo: pulled` });
const nxAfter = await nexoRow(nxV2.body);
const nxGone = await nexoGet(`admin-files/${nxPath(2)}`);
check('once version 2 is withdrawn, nexo_reader gets no row and an explicit refusal for the workbook it downloaded',
  nxWithdrawn.ok && nxAfter.ok && Array.isArray(nxAfter.body) && nxAfter.body.length === 0 && storageRefused(nxGone),
  `statuses ${nxWithdrawn.status}/${nxAfter.status}, download ${show(nxGone)}`);
const callerRetired = [await callerRow(operatorToken, nxV1.body), await callerRow(operatorToken, nxV2.body), await callerRow(requesterToken, nxV1.body), await callerRow(requesterToken, nxV2.body)];
check('caller: after supersede (v1) and withdraw (v2), staff and the member get an empty answer for both versions',
  callerRetired.every(empty), callerRetired.map(show).join(' | '));

// ---------------------------------------------------------------- Nexo's store per client (0011_nexo_caller_scope.sql)
// docs/integration/nexo-store-scope.md: the Nexo API calls admin.nexo_caller() with the anon key and the signed-in
// user's own token to pick checkpoint workspaces. Two throwaway users: one member of both run clients, one whose only
// membership is archived.
const twoClients = await createUser('two-clients');
const leftClient = await createUser('left-client');
sql(`insert into admin.client_member (client_id, user_id, role) values ('${clientA}', '${twoClients.id}', 'viewer'), ('${clientB}', '${twoClients.id}', 'requester'), ('${clientA}', '${leftClient.id}', 'viewer');
     update admin.client_member set archived_at = now(), archived_reason = '${run} left the client' where user_id = '${leftClient.id}';`);
const nexoCaller = (token) => rpc(token, 'nexo_caller', {});
const byClient = (rows) => JSON.stringify([...rows].sort((a, b) => String(a.client_id).localeCompare(String(b.client_id))));
const scopeStaff = await nexoCaller(operatorToken);
check('scope: lab staff get one row, caller_view staff and a null client_id',
  scopeStaff.ok && JSON.stringify(scopeStaff.body) === JSON.stringify([{ caller: operator.id, caller_view: 'staff', client_id: null }]), show(scopeStaff));
const scopeTwo = await nexoCaller(await signIn(twoClients));
check('scope: a member of two clients gets two rows, one per client, caller_view client',
  scopeTwo.ok && Array.isArray(scopeTwo.body) && byClient(scopeTwo.body) === byClient([clientA, clientB].map(c => ({ caller: twoClients.id, caller_view: 'client', client_id: c }))),
  show(scopeTwo));
const scopeLeft = await nexoCaller(await signIn(leftClient));
check('scope: a member whose only membership is archived gets an empty answer', empty(scopeLeft), show(scopeLeft));
const scopeAnon = await nexoCaller(env.ANON_KEY);
check('scope: anon is refused (42501)', pgRefused(scopeAnon), show(scopeAnon));

// ---------------------------------------------------------------- storage orphan cleanup (0012_storage_orphan_cleanup.sql)
// What the app does after a failed build_dataset or release_dataset: remove, with the same token, what it just
// uploaded, through Storage's bulk remove (DELETE /object/<bucket> with {"prefixes": [...]}, what supabase-js remove()
// sends). Storage removes only the rows RLS lets the token see and delete, and answers with those; the checks read
// storage.objects directly. Uses the policy the 0007 block left in place (owner + admin) and the release order.
const removeObjects = async (token, bucket, names) => {
  const res = await objectApi(token, bucket, { method: 'DELETE', body: JSON.stringify({ prefixes: names }), headers: { 'Content-Type': 'application/json' } });
  const text = await res.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, removed: Array.isArray(body) ? body.length : null };
};
const objectCount = (bucket, name) => sql(`select count(*) from storage.objects where bucket_id = '${bucket}' and name = '${name}'`);
const orphanKey = `${clientA}/${rbOrder?.code}/datasets/${hex('e')}/dataset-v1.xlsx`; // no dataset records that digest
const recordedKey = `${clientA}/${rbOrder?.code}/datasets/${hex('3')}/dataset-v1.xlsx`; // version 1's storage_path (superseded)
const orphanPut = await put(operatorToken, orphanKey);
const recordedPut = await put(operatorToken, recordedKey);
const orphanByClient = await removeObjects(requesterToken, 'admin-files', [orphanKey]);
const orphanAfterClient = objectCount('admin-files', orphanKey);
const orphanRemoved = await removeObjects(operatorToken, 'admin-files', [orphanKey]);
const recordedRemoved = await removeObjects(operatorToken, 'admin-files', [recordedKey]);
check('0012: an Operator removes an admin-files object it just uploaded that no dataset records (a client token cannot), and cannot remove a recorded dataset file',
  orphanPut.ok && recordedPut.ok && orphanAfterClient === '1' && orphanRemoved.ok && objectCount('admin-files', orphanKey) === '0' && objectCount('admin-files', recordedKey) === '1',
  `statuses ${orphanPut.status}/${recordedPut.status}/${orphanByClient.status}/${orphanRemoved.status}/${recordedRemoved.status}, removed ${orphanRemoved.removed}/${recordedRemoved.removed}`);

const v3 = await rpc(operatorToken, 'build_dataset', buildArgs(hex('8'), hex('0'), 3)); // built, never released: its digest stays pending
const pendingKey = `${randomUUID()}/${hex('0')}`;
const pendingStaged = await stage(ownerToken, pendingKey);
const pendingByOperator = await removeObjects(operatorToken, 'case-files', [pendingKey]);
const pendingAfterOperator = objectCount('case-files', pendingKey);
const pendingRemoved = await removeObjects(ownerToken, 'case-files', [pendingKey]);
const releasedRemoved = await removeObjects(ownerToken, 'case-files', [analysisKey]); // version 1's file in its released project
check("0012: an eligible signer removes a pending analysis file it staged in case-files (an Operator cannot), and cannot remove a released project's file",
  v3.ok && pendingStaged.ok && pendingAfterOperator === '1' && pendingRemoved.ok && objectCount('case-files', pendingKey) === '0' && objectCount('case-files', analysisKey) === '1',
  `statuses ${v3.status}/${pendingStaged.status}/${pendingByOperator.status}/${pendingRemoved.status}/${releasedRemoved.status}, removed ${pendingRemoved.removed}/${releasedRemoved.removed}`);
} catch (error) {
  failures++;
  console.log(`FAIL the run stopped: ${error instanceof Error ? error.message : error}`);
} finally {
  try { await archiveRun(); } catch (error) { failures++; console.log(`FAIL teardown: ${error instanceof Error ? error.message : error}`); }
  try { await restorePolicy(); } catch (error) { failures++; console.log(`FAIL teardown policy: ${error instanceof Error ? error.message : error}`); }
}

console.log(failures ? `\n${failures} check(s) failed (run ${run})` : `\nAll checks passed (run ${run})`);
process.exit(failures ? 1 : 0);
