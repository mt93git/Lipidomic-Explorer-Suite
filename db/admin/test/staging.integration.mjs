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
// After restoring the prior release policy, all created users have their memberships archived and auth accounts banned.
import { BAN_DURATION, retireThrowawayUsers } from './retire-users.mjs';
import { restoreRunPolicy } from './restore-run-policy.mjs';
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
const createdUsers = [];
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
  createdUsers.push({ id: user.id, email });
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
  // A released dataset keeps its order and client live; everything else of the two run clients is archived. Their Nexo
  // switch (0021/0022) is off again whatever stopped the run.
  sql(`update admin.client set nexo_access = false where id in ('${clientA}', '${clientB}') and nexo_access;
       update admin.dataset set archived_at = now(), archived_reason = '${reason}'
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
  await restoreRunPolicy({ priorSigners, priorRequired, sql, runUserIds: createdUsers.map(user => user.id),
    restore: async (ids, required) => {
      const owner = signers[1];
      if (!owner) throw new Error('release policy restoration requires the run Owner');
      return rpc(await signIn(owner), 'set_release_policy', { p_eligible_signers: ids, p_required_signatures: required });
    },
  });
  check('teardown: prior release policy restored (including implicit default)', true);
}

// Run only after archiveRun and restorePolicy: both still need the run signers' active memberships and tokens.
async function retireRunUsers() {
  await retireThrowawayUsers(createdUsers, {
    beforeRetire: async id => {
      const literal = "'" + id.replaceAll("'", "''") + "'";
      if (sql(`select count(*) from admin.release_policy where archived_at is null and ${literal}::uuid = any(eligible_signers)`) !== '0') {
        throw new Error('user still named in live policy');
      }
    },
    archive: async (table, ids) => {
      // IDs come from GoTrue; quote them as SQL literals, even though GoTrue returns UUIDs.
      const literals = ids.map(id => "'" + id.replaceAll("'", "''") + "'").join(',');
      sql(`update admin.${table} set archived_at = now(), archived_reason = '${run} staging test run finished'
           where user_id in (${literals}) and archived_at is null`);
    },
    ban: async id => {
      const res = await fetch(`${auth}/admin/users/${encodeURIComponent(id)}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${env.SERVICE_KEY}`, apikey: env.SERVICE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ban_duration: BAN_DURATION }),
      });
      if (!res.ok) throw new Error(`user ban: ${res.status}`);
    },
  });
  console.log(`teardown: retired ${createdUsers.length} throwaway user(s) (archived memberships, banned auth users)`);
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

// ---------------------------------------------------------------- F0: no direct client writes (0018)
// order, shipment and sample are written only by lab writers and the SECURITY DEFINER functions. The requester's own
// token can neither insert an order for their own client nor move an order's stage through the REST API.
const own = await api(requesterToken, 'order', { method: 'POST', body: JSON.stringify({ client_id: clientA, title: `${run} own` }) });
const ownRows = sql(`select count(*) from admin."order" where title = '${run} own'`);
check('0018: a requester cannot insert an order directly, even for their own client', !own.ok && ownRows === '0', `status ${own.status}, rows ${ownRows}`);
const orderA = sql(`select id from admin."order" where title = '${run} order A'`);
const restage = await api(requesterToken, `order?id=eq.${orderA}`, { method: 'PATCH', body: JSON.stringify({ stage: 'released' }) });
const restaged = restage.ok ? await restage.json() : null;
const stageA = sql(`select stage from admin."order" where id = '${orderA}'`);
check('0018: a requester cannot change order.stage directly', stageA === 'request' && !(Array.isArray(restaged) && restaged.length > 0),
  `status ${restage.status}, stage ${stageA}`);
const opOwn = await api(operatorToken, 'order', { method: 'POST', body: JSON.stringify({ client_id: clientA, title: `${run} own` }) });
const created = opOwn.ok ? (await opOwn.json())[0] : null;
check('lab staff create an order through the API, with a generated code', Boolean(created?.code?.match(/^ORD\d{3,}$/)), `status ${opOwn.status}`);

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
// 0022: client members reach Nexo only while their client's switch is on, so the run's Admin turns it on for both run
// clients here (through the rpc) and off again at the end of the 0011 block.
const bMember = await createUser('b-member');
sql(`insert into admin.client_member (client_id, user_id, role) values ('${clientB}', '${bMember.id}', 'viewer');`);
const bMemberToken = await signIn(bMember);
const callerRow = (token, ds) => rpc(token, 'nexo_dataset_for_caller', { p_dataset_id: ds });
const nexoSwitch = (client, on) => rpc(adminToken, 'set_client_nexo_access', { p_client_id: client, p_enabled: on });
const switchOn = [await nexoSwitch(clientA, true), await nexoSwitch(clientB, true)];
check('0022: the run\'s Admin turns Nexo on for both run clients', switchOn.every(r => r.ok), switchOn.map(show).join(' | '));
const expectedCaller = (caller, view) => JSON.stringify([{ dataset_id: nxV1.body, order_code: nxOrder?.code, version: 1, storage_path: nxPath(1), sha256: digest(workbook(1)),
  client_id: clientA, caller, caller_view: view }]);
const empty = (r) => r.ok && Array.isArray(r.body) && r.body.length === 0;
const asStaff = await callerRow(operatorToken, nxV1.body);
check('caller: lab staff get the released, current dataset with client_id, caller and caller_view staff',
  asStaff.ok && JSON.stringify(asStaff.body) === expectedCaller(operator.id, 'staff'), show(asStaff));
const asMember = await callerRow(requesterToken, nxV1.body);
check('caller: a member of the dataset\'s client gets it with caller_view client',
  asMember.ok && JSON.stringify(asMember.body) === expectedCaller(requester.id, 'client'), show(asMember));
const switchOff = await nexoSwitch(clientA, false);
const offMember = await callerRow(requesterToken, nxV1.body);
const offStaff = await callerRow(operatorToken, nxV1.body);
const switchBack = await nexoSwitch(clientA, true);
const backMember = await callerRow(requesterToken, nxV1.body);
check('0022: with client A\'s Nexo switch off its member gets an empty answer while staff keep theirs; on again, the member gets it back',
  switchOff.ok && empty(offMember) && offStaff.ok && JSON.stringify(offStaff.body) === expectedCaller(operator.id, 'staff')
    && switchBack.ok && JSON.stringify(backMember.body) === expectedCaller(requester.id, 'client'),
  [switchOff, offMember, offStaff, switchBack, backMember].map(show).join(' | '));
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
const switchRestored = [await nexoSwitch(clientA, false), await nexoSwitch(clientB, false)];
check('0022: the run\'s Admin turns Nexo off again for both run clients', switchRestored.every(r => r.ok)
  && sql(`select count(*) from admin.client where id in ('${clientA}', '${clientB}') and nexo_access`) === '0', switchRestored.map(show).join(' | '));

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

// ---------------------------------------------------------------- New order (0013_orders.sql)
// admin.create_order through rpc with real tokens. Two run panels (one archived from the start) and a third run client
// created archived; the active panel is archived at the end of the block. The created order belongs to client A, so
// archiveRun retires it with the rest of the run.
const coPanel = randomUUID(); const coOldPanel = randomUUID(); const coOldClient = randomUUID();
sql(`insert into admin.panel (id, name, dataset_type) values ('${coPanel}', '${run} panel', 'global');
     insert into admin.panel (id, name, dataset_type, archived_at, archived_reason) values ('${coOldPanel}', '${run} old panel', 'global', now(), '${run} retired');
     insert into admin.client (id, name, kind, archived_at, archived_reason) values ('${coOldClient}', '${run} archived client', 'company', now(), '${run} archived');`);
const coArgs = (client = clientA, panel = coPanel) => ({ p_client_id: client, p_panel_id: panel, p_title: `${run} new order`, p_matrix: 'plasma',
  p_expected_samples: 12, p_billing_ref: `${run}-PO`, p_notes: 'synthetic' });
const coCreated = await rpc(operatorToken, 'create_order', coArgs());
const coRow = coCreated.ok ? sql(`select stage || '|' || requested_by || '|' || panel_id || '|' || expected_samples || '|' || billing_ref from admin."order" where id = '${coCreated.body}'`) : '';
const coAudit = coCreated.ok ? sql(`select count(*) from admin.audit_event where entity = 'order' and entity_id = '${coCreated.body}' and action = 'INSERT' and actor = '${operator.id}'`) : '0';
check('0013: an Operator creates an order through rpc: stage request, requested_by = the Operator, audited',
  coCreated.ok && coRow === `request|${operator.id}|${coPanel}|12|${run}-PO` && coAudit === '1', `${show(coCreated)}, row ${coRow}, audit ${coAudit}`);
const coByRequester = await rpc(requesterToken, 'create_order', coArgs());
const coOldC = await rpc(operatorToken, 'create_order', coArgs(coOldClient));
const coOldP = await rpc(operatorToken, 'create_order', coArgs(clientA, coOldPanel));
const coCount = sql(`select count(*) from admin."order" where title = '${run} new order'`);
check('0013: create_order refuses a client requester (42501), an archived client and an archived panel; nothing else was inserted',
  pgRefused(coByRequester) && !coOldC.ok && /archived/.test(coOldC.body?.message ?? '') && !coOldP.ok && /archived/.test(coOldP.body?.message ?? '') && coCount === '1',
  `${show(coByRequester)} | ${show(coOldC)} | ${show(coOldP)} | rows ${coCount}`);
sql(`update admin.panel set archived_at = now(), archived_reason = '${run} staging test run finished' where id = '${coPanel}'`);

// ---------------------------------------------------------------- Clients, wave 3 round 1 (0014_clients.sql)
// Exact RPC contract through PostgREST, with the run's synthetic Owner/Admin/Operator/requester tokens.
const clientArgs = { p_name: `${run} RPC client`, p_kind: 'pi_lab', p_billing_method: 'charge_code', p_notes: 'Synthetic round 1 client' };
const clientCreated = await rpc(ownerToken, 'create_client', clientArgs);
const rpcClientId = clientCreated.body;
const validRpcClient = clientCreated.ok && typeof rpcClientId === 'string' && /^[0-9a-f-]{36}$/.test(rpcClientId);
check('0014: Owner creates a client through rpc', validRpcClient, show(clientCreated));
if (validRpcClient) {
  try {
    const editArgs = { p_client_id: rpcClientId, ...clientArgs, p_billing_method: 'po' };
    const clientEdited = await rpc(adminToken, 'update_client', editArgs);
    const visibleClient = await pgCall(await api(operatorToken, `client?select=name,kind,billing_method,client_member(user_id,role),order(code,stage)&id=eq.${rpcClientId}`));
    check('0014: Admin edits billing and Operator reads client details with member/order embeds',
      clientEdited.ok && visibleClient.ok && visibleClient.body?.[0]?.billing_method === 'po'
        && Array.isArray(visibleClient.body?.[0]?.client_member) && Array.isArray(visibleClient.body?.[0]?.order), show(visibleClient));
    const duplicateClient = await rpc(ownerToken, 'create_client', clientArgs);
    const runClientName = sql(`select name from admin.client where id = '${clientA}'`);
    const duplicateEdit = await rpc(adminToken, 'update_client', { ...editArgs, p_name: runClientName });
    check('0014: duplicate create/update return a clear 23505 refusal',
      [duplicateClient, duplicateEdit].every(r => !r.ok && r.status === 409 && r.body?.code === '23505' && /already exists/i.test(r.body?.message)),
      [duplicateClient, duplicateEdit].map(show).join(' | '));
    const clientDenied = [];
    for (const token of [operatorToken, requesterToken]) {
      clientDenied.push(await rpc(token, 'create_client', { ...clientArgs, p_name: `${run} forbidden` }),
        await rpc(token, 'update_client', editArgs), await rpc(token, 'archive_client', { p_client_id: rpcClientId, p_reason: `${run} forbidden` }));
    }
    check('0014: non-managers are refused all three client RPCs with 42501', clientDenied.every(pgRefused), clientDenied.map(show).join(' | '));
    // One open order, then a released order and an archived order: the exact archive gate.
    sql(`insert into admin.client_member (client_id, user_id, role) values ('${rpcClientId}', '${requester.id}', 'requester');`);
    const rpcOrder = await pgCall(await api(operatorToken, 'order', { method: 'POST', body: JSON.stringify({ client_id: rpcClientId, title: `${run} client archive gate` }) }));
    const openRefusal = await rpc(adminToken, 'archive_client', { p_client_id: rpcClientId, p_reason: `${run} premature archive` });
    check('0014: archive refuses an open order without changing the client', rpcOrder.ok && !openRefusal.ok && openRefusal.body?.code === '55000'
      && /open order/i.test(openRefusal.body?.message) && sql(`select archived_at is null from admin.client where id = '${rpcClientId}'`) === 't', show(openRefusal));
    sql(`update admin."order" set stage = 'released' where client_id = '${rpcClientId}';
         insert into admin."order" (client_id, title, archived_at, archived_reason) values ('${rpcClientId}', '${run} cancelled', now(), '${run} synthetic cancellation');`);
    const noReason = await rpc(adminToken, 'archive_client', { p_client_id: rpcClientId, p_reason: '  ' });
    const clientArchived = await rpc(adminToken, 'archive_client', { p_client_id: rpcClientId, p_reason: `  ${run} finished  ` });
    check('0014: reason is required; released/archived orders permit archival, audited as Admin',
      !noReason.ok && noReason.body?.code === '22023' && clientArchived.ok
        && sql(`select archived_reason from admin.client where id = '${rpcClientId}'`) === `${run} finished`
        && sql(`select count(*) from admin.audit_event where entity = 'client' and entity_id = '${rpcClientId}' and actor = '${secondSigner.id}' and after->>'archived_at' is not null`) === '1',
      `reason ${show(noReason)} | archive ${show(clientArchived)}`);
    const archivedClientWrites = [];
    for (const token of [operatorToken, requesterToken]) {
      for (const [table, fields] of [
        ['order', { title: `${run} archived client order` }],
        ['shipment', { order_id: rpcOrder.body?.[0]?.id }],
        ['sample', { order_id: rpcOrder.body?.[0]?.id, full_name: `${run} archived client sample` }],
      ]) {
        archivedClientWrites.push(await pgCall(await api(token, table, { method: 'POST', body: JSON.stringify({ client_id: rpcClientId, ...fields }) })));
      }
    }
    check('0014: after archive_client, Operator and requester cannot insert orders, shipments or samples for that client',
      clientArchived.ok && archivedClientWrites.every(pgRefused), archivedClientWrites.map(show).join(' | '));
  } finally {
    // Keep this block independent of the other tasks' teardown; no hard deletes, even on failure.
    sql(`update admin."order" set archived_at = now(), archived_reason = '${run} client checks finished' where client_id = '${rpcClientId}' and archived_at is null;
         update admin.client set archived_at = now(), archived_reason = '${run} client checks finished' where id = '${rpcClientId}' and archived_at is null;`);
  }
}

// ---------------------------------------------------------------- People and invitations, wave 3 round 2 (0015_people.sql)
// The invitation flow the Admin app runs, through PostgREST: an Owner/Admin creates a link (only its digest is stored),
// anon previews it, the app server creates the GoTrue user and accepts with the stack's service key (SERVICE_KEY,
// never printed), then roles change and memberships are archived. Invitees are throwaway run users (retired at the
// end with the others); the block revokes its own pending links in `finally`.
const serviceRpc = async (fn, args) => pgCall(await fetch(`${rest}/rpc/${fn}`, {
  method: 'POST', body: JSON.stringify(args),
  headers: { apikey: env.SERVICE_KEY, Authorization: `Bearer ${env.SERVICE_KEY}`, 'Accept-Profile': 'admin', 'Content-Profile': 'admin', 'Content-Type': 'application/json' },
}));
const runEmail = (label) => `${run}-${label}@example.test`;
const digestOf = (token) => createHash('sha256').update(token).digest('hex');
try {
  const inviteArgs = (label, lab, client = null, role = null) => ({ p_email: runEmail(label), p_lab_role: lab, p_client_id: client, p_client_role: role });
  const pInvite = await rpc(adminToken, 'create_invitation', inviteArgs('invitee', null, clientA, 'requester'));
  const pToken = typeof pInvite.body === 'string' ? pInvite.body : '';
  const pStored = pToken ? sql(`select count(*) from admin.invitation where token_sha256 = '${digestOf(pToken)}' and email = '${runEmail('invitee')}' and expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days'`) : '0';
  const pLeak = pToken ? sql(`select (select count(*) from admin.invitation i where to_jsonb(i)::text like '%${pToken}%') + (select count(*) from admin.audit_event a where coalesce(a.after::text, '') like '%${pToken}%')`) : '1';
  check('0015: an Admin creates a client invitation through rpc; only its digest is stored, 7 days, the raw token is nowhere',
    pInvite.ok && /^[0-9a-f]{64}$/.test(pToken) && pStored === '1' && pLeak === '0', `${pInvite.status}, stored ${pStored}, leak ${pLeak}`);
  const pAdminLab = await rpc(adminToken, 'create_invitation', inviteArgs('lab-by-admin', 'operator'));
  const pOperator = await rpc(operatorToken, 'create_invitation', inviteArgs('by-operator', null, clientA, 'viewer'));
  const pRequester = await rpc(requesterToken, 'create_invitation', inviteArgs('by-requester', null, clientA, 'viewer'));
  const pRead = await pgCall(await api(adminToken, `invitation?select=token_sha256&email=eq.${runEmail('invitee')}`));
  check('0015: an Admin cannot invite lab staff, an Operator and a client requester invite nobody (42501); the digest is not readable',
    [pAdminLab, pOperator, pRequester].every(pgRefused) && !pRead.ok, [pAdminLab, pOperator, pRequester, pRead].map(show).join(' | '));

  const pPreview = await rpc(env.ANON_KEY, 'invitation_preview', { p_token: pToken });
  const pBogus = await rpc(env.ANON_KEY, 'invitation_preview', { p_token: '0'.repeat(64) });
  check('0015: anon previews a valid link (email, target in plain words, no account yet) and gets no row for an unknown one',
    pPreview.ok && pPreview.body?.length === 1 && pPreview.body[0].email === runEmail('invitee') && pPreview.body[0].target === `Requester at ${run} Client A`
      && pPreview.body[0].has_account === false && pBogus.ok && pBogus.body?.length === 0, `${show(pPreview)} | ${show(pBogus)}`);

  const invitee = await createUser('invitee');
  const pAnonAccept = await rpc(env.ANON_KEY, 'accept_invitation', { p_token: pToken, p_user_id: invitee.id });
  const pOwnerAccept = await rpc(ownerToken, 'accept_invitation', { p_token: pToken, p_user_id: invitee.id });
  check('0015: anon and a signed-in Owner cannot call accept_invitation', [pAnonAccept, pOwnerAccept].every(r => !r.ok && [401, 403].includes(r.status)),
    `${show(pAnonAccept)} | ${show(pOwnerAccept)}`);
  const pAccepted = await serviceRpc('accept_invitation', { p_token: pToken, p_user_id: invitee.id });
  const pMember = sql(`select role from admin.client_member where client_id = '${clientA}' and user_id = '${invitee.id}' and archived_at is null`);
  const pUsed = sql(`select count(*) from admin.invitation where token_sha256 = '${digestOf(pToken)}' and accepted_by = '${invitee.id}'`);
  const pAgain = await serviceRpc('accept_invitation', { p_token: pToken, p_user_id: invitee.id });
  const pAfter = await rpc(env.ANON_KEY, 'invitation_preview', { p_token: pToken });
  check('0015: the service role accepts once: requester membership, link marked used, a second accept refused (55000), no preview any more',
    pAccepted.ok && pMember === 'requester' && pUsed === '1' && !pAgain.ok && pAgain.body?.code === '55000' && pAfter.body?.length === 0,
    `${show(pAccepted)}, member ${pMember}, used ${pUsed} | ${show(pAgain)}`);
  const inviteeToken = await signIn(invitee);
  const inviteeOrders = await pgCall(await api(inviteeToken, `order?select=client_id&client_id=eq.${clientA}`));
  check('0015: the invited person signs in with the password the app set and reads their client', inviteeOrders.ok && inviteeOrders.body?.length >= 1, show(inviteeOrders));

  const pOther = await rpc(ownerToken, 'create_invitation', inviteArgs('someone-else', null, clientB, 'viewer'));
  const pMismatch = await serviceRpc('accept_invitation', { p_token: pOther.body, p_user_id: invitee.id });
  const pRevokeMe = await rpc(ownerToken, 'create_invitation', inviteArgs('invitee', null, clientB, 'viewer'));
  const pRevokeId = sql(`select id from admin.invitation where token_sha256 = '${digestOf(String(pRevokeMe.body))}'`);
  const pRevokedByOp = await rpc(operatorToken, 'revoke_invitation', { p_invitation_id: pRevokeId });
  const pRevoked = await rpc(adminToken, 'revoke_invitation', { p_invitation_id: pRevokeId });
  const pRevokedAccept = await serviceRpc('accept_invitation', { p_token: pRevokeMe.body, p_user_id: invitee.id });
  sql(`update admin.invitation set expires_at = now() - interval '1 second' where token_sha256 = '${digestOf(String(pOther.body))}'`);
  const pExpired = await serviceRpc('accept_invitation', { p_token: pOther.body, p_user_id: invitee.id });
  check('0015: accept refuses a different email (42501), a revoked link and an expired one (55000); an Operator cannot revoke',
    pOther.ok && !pMismatch.ok && pMismatch.body?.code === '42501' && pgRefused(pRevokedByOp) && pRevoked.ok
      && !pRevokedAccept.ok && /revoked/.test(pRevokedAccept.body?.message ?? '') && !pExpired.ok && /expired/.test(pExpired.body?.message ?? ''),
    [pMismatch, pRevokedByOp, pRevoked, pRevokedAccept, pExpired].map(show).join(' | '));

  // Security review finding 4: an existing account accepts while signed in (accept_my_invitation), password untouched.
  const pMine = await rpc(ownerToken, 'create_invitation', inviteArgs('invitee', null, clientB, 'viewer'));
  const pMinePreview = await rpc(env.ANON_KEY, 'invitation_preview', { p_token: pMine.body });
  const pMineByOther = await rpc(requesterToken, 'accept_my_invitation', { p_token: pMine.body });
  const pMineAnon = await rpc(env.ANON_KEY, 'accept_my_invitation', { p_token: pMine.body });
  const pMineAccepted = await rpc(inviteeToken, 'accept_my_invitation', { p_token: pMine.body });
  check('0015: preview says the invited email has an account; that person accepts signed in (viewer of client B); another person (42501) and anon cannot',
    pMine.ok && pMinePreview.body?.[0]?.has_account === true && !pMineByOther.ok && pMineByOther.body?.code === '42501'
      && !pMineAnon.ok && [401, 403].includes(pMineAnon.status) && pMineAccepted.ok
      && sql(`select role from admin.client_member where client_id = '${clientB}' and user_id = '${invitee.id}' and archived_at is null`) === 'viewer',
    [pMine, pMinePreview, pMineByOther, pMineAnon, pMineAccepted].map(show).join(' | '));
  check('0015: no audit row of this run\'s invitations holds token_sha256',
    sql(`select count(*) from admin.audit_event a join admin.invitation i on i.id = a.entity_id where a.entity = 'invitation' and i.email like '${run}-%'
         and (a.after ? 'token_sha256' or coalesce(a.before ? 'token_sha256', false))`) === '0'
      && sql(`select count(*) from admin.audit_event a join admin.invitation i on i.id = a.entity_id where a.entity = 'invitation' and i.email like '${run}-%'`) !== '0');

  // Security review finding 1: memberships are never written directly through the API.
  const pDirectPromote = await pgCall(await api(adminToken, `lab_staff?user_id=eq.${operator.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'admin' }) }));
  const pDirectInsert = await pgCall(await api(ownerToken, 'lab_staff', { method: 'POST', body: JSON.stringify({ user_id: invitee.id, role: 'owner' }) }));
  const pDirectMember = await pgCall(await api(requesterToken, `client_member?client_id=eq.${clientA}`, { method: 'PATCH', body: JSON.stringify({ role: 'client_admin' }) }));
  check('0015: direct INSERT/UPDATE on lab_staff and client_member is refused (42501) even for the Owner; the Operator is still an Operator',
    [pDirectPromote, pDirectInsert, pDirectMember].every(pgRefused)
      && sql(`select role from admin.lab_staff where user_id = '${operator.id}' and archived_at is null`) === 'operator',
    [pDirectPromote, pDirectInsert, pDirectMember].map(show).join(' | '));

  // Lab staff: only the Owner invites; the role changes and the person is archived, never deleted.
  const pLab = await rpc(ownerToken, 'create_invitation', inviteArgs('lab-member', 'member'));
  const labMember = await createUser('lab-member');
  const pLabAccepted = await serviceRpc('accept_invitation', { p_token: pLab.body, p_user_id: labMember.id });
  const pPromoteByAdmin = await rpc(adminToken, 'set_lab_role', { p_user_id: labMember.id, p_role: 'operator' });
  const pPromoted = await rpc(ownerToken, 'set_lab_role', { p_user_id: labMember.id, p_role: 'operator' });
  const pLabRow = sql(`select id || '|' || role from admin.lab_staff where user_id = '${labMember.id}' and archived_at is null`);
  const [pLabId, pLabRole] = pLabRow.split('|');
  const pArchiveByAdmin = await rpc(adminToken, 'archive_member', { p_kind: 'lab_staff', p_id: pLabId, p_reason: `${run} synthetic` });
  const pArchived = await rpc(ownerToken, 'archive_member', { p_kind: 'lab_staff', p_id: pLabId, p_reason: `${run} synthetic departure` });
  check('0015: the Owner invites lab staff, changes the lab role and archives them; an Admin cannot (42501); the row stays, audited',
    pLab.ok && pLabAccepted.ok && pgRefused(pPromoteByAdmin) && pPromoted.ok && pLabRole === 'operator' && pgRefused(pArchiveByAdmin) && pArchived.ok
      && sql(`select archived_reason from admin.lab_staff where id = '${pLabId}'`) === `${run} synthetic departure`
      && sql(`select count(*) from admin.audit_event where entity = 'lab_staff' and entity_id = '${pLabId}' and actor = '${owner.id}'`) === '2',
    [pLab, pLabAccepted, pPromoteByAdmin, pPromoted, pArchiveByAdmin, pArchived].map(show).join(' | '));

  const pMemberId = sql(`select id from admin.client_member where client_id = '${clientA}' and user_id = '${invitee.id}'`);
  const pRoleByOp = await rpc(operatorToken, 'set_client_member_role', { p_member_id: pMemberId, p_role: 'viewer' });
  const pRole = await rpc(adminToken, 'set_client_member_role', { p_member_id: pMemberId, p_role: 'viewer' });
  const pMemberArchived = await rpc(adminToken, 'archive_member', { p_kind: 'client_member', p_id: pMemberId, p_reason: `${run} synthetic` });
  check('0015: an Admin changes a client role and archives the membership; an Operator cannot (42501)',
    pgRefused(pRoleByOp) && pRole.ok && pMemberArchived.ok
      && sql(`select role || '|' || (archived_at is not null) from admin.client_member where id = '${pMemberId}'`) === 'viewer|true',
    [pRoleByOp, pRole, pMemberArchived].map(show).join(' | '));
} finally {
  sql(`update admin.invitation set revoked_at = now() where email like '${run}-%' and accepted_at is null and revoked_at is null`);
}

// ---------------------------------------------------------------- Batches, wave 3 round 2 (0016_batches.sql)
// create_batch → mark_batch_exported → mark_batch_acquired through rpc with real tokens, on two Registered run orders
// (client A: two samples, client B: one). Unknown injections are named by the sample code. Batches cannot be deleted:
// the block archives its versions and batches itself (the injections of an exported version stay as they are; an
// unexported version's are archived too); archiveRun retires the orders and clients.
const bPanel = randomUUID(); const bOrderA = randomUUID(); const bOrderB = randomUUID();
const bSamples = [randomUUID(), randomUUID(), randomUUID()];
sql(`insert into admin.panel (id, name, dataset_type) values ('${bPanel}', '${run} batch panel', 'global');
     insert into admin."order" (id, client_id, title, stage) values ('${bOrderA}', '${clientA}', '${run} batch order A', 'registered'),
       ('${bOrderB}', '${clientB}', '${run} batch order B', 'registered');
     insert into admin.sample (id, client_id, order_id, full_name) values ('${bSamples[0]}', '${clientA}', '${bOrderA}', '${run}_S1'),
       ('${bSamples[1]}', '${clientA}', '${bOrderA}', '${run}_S2'), ('${bSamples[2]}', '${clientB}', '${bOrderB}', '${run}_S3');`);
const bCode = Object.fromEntries(sql(`select id || '=' || sample_code from admin.sample where id in ('${bSamples.join("', '")}')`).split('\n').map(line => line.split('=')));
const bInjections = [
  { seq: 1, sample_type: 'Blank', sample_name: 'Blank_001', sample_id: null, plate: 'Plate 1', vial: 'A1' },
  ...bSamples.map((id, i) => ({ seq: i + 2, sample_type: 'Unknown', sample_name: bCode[id], sample_id: id, plate: 'Plate 1', vial: `B${i + 1}` })),
  { seq: 5, sample_type: 'Quality Control', sample_name: 'QC_001', sample_id: null, plate: 'Plate 1', vial: 'A2' },
];
const bArgs = { p_name: null, p_panel_id: bPanel, p_rules: { rules: { seed: run }, minutesPerInjection: 12 }, p_injections: bInjections };
const bBatches = [];
try {
  const bCreated = await rpc(operatorToken, 'create_batch', bArgs);
  const bId = bCreated.body;
  if (bCreated.ok) bBatches.push(bId);
  const bFacts = bCreated.ok ? sql(`select b.name || '|' || b.status || '|' || b.panel_id || '|' || (select count(*) from admin.injection i where i.batch_version_id = v.id)
                                      || '|' || v.version || '|' || (v.rules->'rules'->>'seed')
                                      || '|' || (select string_agg(stage, ',' order by stage) from admin."order" where id in ('${bOrderA}', '${bOrderB}'))
                                    from admin.batch b join admin.batch_version v on v.batch_id = b.id where b.id = '${bId}'`) : '';
  const bAudit = bCreated.ok ? sql(`select count(*) from admin.audit_event where entity = 'batch' and entity_id = '${bId}' and action = 'INSERT' and actor = '${operator.id}'`) : '0';
  check('0016: an Operator creates a planned batch through rpc: B<yyyy>-<nnn>, version 1 with its rules, 5 injections, both orders In batch, audited',
    bCreated.ok && new RegExp(`^B\\d{4}-\\d{3,}\\|planned\\|${bPanel}\\|5\\|1\\|${run}\\|in_batch,in_batch$`).test(bFacts) && bAudit === '1', `${show(bCreated)}, facts ${bFacts}, audit ${bAudit}`);

  const bByRequester = await rpc(requesterToken, 'create_batch', bArgs);
  const bAgain = await rpc(operatorToken, 'create_batch', bArgs);
  const bFullName = await rpc(operatorToken, 'create_batch', { ...bArgs, p_injections: bInjections.map(r => r.sample_id === bSamples[0] ? { ...r, sample_name: `${run}_S1` } : r) });
  const bCount = sql(`select count(*) from admin.batch_version v join admin.injection i on i.batch_version_id = v.id where i.sample_name = '${bCode[bSamples[0]]}'`);
  check('0016: create_batch refuses a client requester (42501), samples already in a planned batch (55000) and an Unknown named by its FullName (23514); nothing else was inserted',
    pgRefused(bByRequester) && !bAgain.ok && bAgain.body?.code === '55000' && /already in a planned batch/.test(bAgain.body?.message ?? '')
      && !bFullName.ok && bFullName.body?.code === '23514' && /named by its sample code/.test(bFullName.body?.message ?? '') && bCount === '1',
    `${show(bByRequester)} | ${show(bAgain)} | ${show(bFullName)} | injections ${bCount}`);

  // RLS on what the function wrote: client A's requester sees the batch and only client A's injections.
  const bRead = await pgCall(await api(requesterToken, `injection?select=sample_name,client_id&batch_version_id=in.(${sql(`select id from admin.batch_version where batch_id = '${bId}'`)})`));
  check("0016: a client requester reads only their client's injections of the mixed batch (no blanks, QC or other clients)",
    bRead.ok && bRead.body.length === 2 && bRead.body.every(r => r.client_id === clientA), show(bRead));

  const sha = createHash('sha256').update(`${run} sequence`).digest('hex');
  // What the app hashes and sends: the version's live injections as the operator reads them, in seq order.
  const bVersion = sql(`select id from admin.batch_version where batch_id = '${bId}'`);
  const bRows = await pgCall(await api(operatorToken, `injection?select=seq,sample_type,sample_name,client_id,aliquot_id,plate,vial&batch_version_id=eq.${bVersion}&archived_at=is.null&order=seq`));
  const bHashed = (bRows.body ?? []).map(r => ({ ...r, plate: r.plate ?? '', vial: r.vial ?? '' }));
  const bExp = (token, extra = {}) => rpc(token, 'mark_batch_exported', { p_batch_id: bId, p_sequence_sha256: sha, p_injections: bHashed, ...extra });
  const bExpByRequester = await bExp(requesterToken);
  const bExpBadHash = await bExp(operatorToken, { p_sequence_sha256: 'xyz' });
  const bExpStale = await bExp(operatorToken, { p_injections: bHashed.map(r => r.seq === 2 ? { ...r, vial: 'H12' } : r) });
  const bAckEarly = await rpc(operatorToken, 'mark_batch_acquired', { p_batch_id: bId });
  check('0016: mark_batch_exported refuses injections that differ from the version\'s rows (PT409), so a concurrent edit cannot be frozen under the hash',
    bRows.ok && bHashed.length === 5 && !bExpStale.ok && bExpStale.body?.code === 'PT409' && /changed after it was read/.test(bExpStale.body?.message ?? ''),
    `${show(bRows)} | ${show(bExpStale)}`);
  const bExported = await bExp(operatorToken);
  const bExpFacts = sql(`select v.sequence_sha256 || '|' || v.exported_by || '|' || b.status || '|' || (select string_agg(stage, ',') from admin."order" where id in ('${bOrderA}', '${bOrderB}'))
                           from admin.batch b join admin.batch_version v on v.batch_id = b.id where b.id = '${bId}'`);
  check('0016: only lab staff export; a bad hash and acquiring a planned batch are refused; export freezes the version with the hash and moves the orders to Sequence exported',
    pgRefused(bExpByRequester) && !bExpBadHash.ok && !bAckEarly.ok && bAckEarly.body?.code === '55000' && bExported.ok
      && bExpFacts === `${sha}|${operator.id}|sequence_exported|sequence_exported,sequence_exported`,
    `${show(bExpByRequester)} | ${show(bExpBadHash)} | ${show(bAckEarly)} | ${show(bExported)} | ${bExpFacts}`);

  const bS1 = bCode[bSamples[0]];
  const bRename = await pgCall(await api(operatorToken, `injection?sample_name=eq.${bS1}`, { method: 'PATCH', body: JSON.stringify({ sample_name: `${bS1}-renamed` }) }));
  const bArchive = await pgCall(await api(operatorToken, `injection?sample_name=eq.${bS1}`, { method: 'PATCH', body: JSON.stringify({ archived_at: new Date().toISOString(), archived_reason: `${run} archive check` }) }));
  const bTwice = await bExp(operatorToken);
  check('0016: the exported sequence is frozen against a direct edit or archive through the API, and a second export is refused (55000)',
    !bRename.ok && !bArchive.ok && sql(`select count(*) from admin.injection where sample_name = '${bS1}' and archived_at is null`) === '1' && !bTwice.ok && bTwice.body?.code === '55000',
    `${show(bRename)} | ${show(bArchive)} | ${show(bTwice)}`);

  const bAckByRequester = await rpc(requesterToken, 'mark_batch_acquired', { p_batch_id: bId });
  const bAcquired = await rpc(operatorToken, 'mark_batch_acquired', { p_batch_id: bId });
  const bAckFacts = sql(`select b.status || '|' || (select string_agg(distinct i.status, ',') from admin.injection i where i.batch_version_id = v.id)
                           || '|' || (select string_agg(stage, ',') from admin."order" where id in ('${bOrderA}', '${bOrderB}'))
                           from admin.batch b join admin.batch_version v on v.batch_id = b.id where b.id = '${bId}'`);
  check('0016: only lab staff mark acquired; the batch and its injections read acquired and both orders Acquired',
    pgRefused(bAckByRequester) && bAcquired.ok && bAckFacts === 'acquired|acquired|acquired,acquired', `${show(bAckByRequester)} | ${show(bAcquired)} | ${bAckFacts}`);
} finally {
  const bReason = `${run} batch checks finished`;
  for (const bId of bBatches) {
    sql(`update admin.injection set archived_at = now(), archived_reason = '${bReason}' where batch_version_id in (select id from admin.batch_version where batch_id = '${bId}' and exported_at is null) and archived_at is null;
         update admin.batch_version set archived_at = now(), archived_reason = '${bReason}' where batch_id = '${bId}' and archived_at is null;
         update admin.batch set archived_at = now(), archived_reason = '${bReason}' where id = '${bId}' and archived_at is null;`);
  }
  sql(`update admin.panel set archived_at = now(), archived_reason = '${bReason}' where id = '${bPanel}' and archived_at is null`);
}

// ---------------------------------------------------------------- Client order requests, F2 (0019_order_requests.sql)
// request_order → accept_order / decline_order through rpc with real tokens: the run's requester (client A) asks twice,
// the run's Operator accepts one and declines the other. A throwaway viewer of client A is refused. Both orders belong
// to client A, so archiveRun retires them. The shipping instructions are set by the run's Admin and then put back as
// they were before the run (the earlier rows stay archived, as the schema keeps every text).
const rqViewer = await createUser('f2-viewer');
sql(`insert into admin.client_member (client_id, user_id, role) values ('${clientA}', '${rqViewer.id}', 'viewer');`);
const rqViewerToken = await signIn(rqViewer);
const rqArgs = (title, client = clientA) => ({ p_client_id: client, p_panel_id: null, p_title: `${run} ${title}`, p_matrix: 'plasma',
  p_expected_samples: 6, p_billing_ref: null, p_notes: 'synthetic request' });
const rqAsked = await rpc(requesterToken, 'request_order', rqArgs('request to accept'));
const rqAsked2 = await rpc(requesterToken, 'request_order', rqArgs('request to decline'));
const rqRow = (id) => sql(`select stage || '|' || review || '|' || requested_by || '|' || coalesce(reviewed_by::text, '-') || '|' || (archived_at is not null) || '|' || coalesce(archived_reason, '-') from admin."order" where id = '${id}'`);
check('0019: a requester requests an order through rpc: stage request, review pending, requested_by = the requester, audited',
  rqAsked.ok && rqAsked2.ok && rqRow(rqAsked.body) === `request|pending|${requester.id}|-|false|-`
    && sql(`select count(*) from admin.audit_event where entity = 'order' and entity_id = '${rqAsked.body}' and action = 'INSERT' and actor = '${requester.id}'`) === '1',
  `${show(rqAsked)} | ${show(rqAsked2)} | ${rqAsked.ok ? rqRow(rqAsked.body) : ''}`);
const rqByViewer = await rpc(rqViewerToken, 'request_order', rqArgs('viewer request'));
const rqOtherClient = await rpc(requesterToken, 'request_order', rqArgs('foreign request', clientB));
const rqByOperator = await rpc(operatorToken, 'request_order', rqArgs('operator request'));
check('0019: request_order refuses a viewer, another client and lab staff (42501); nothing else was inserted',
  [rqByViewer, rqOtherClient, rqByOperator].every(pgRefused) && sql(`select count(*) from admin."order" where title like '${run} %request' and title not like '${run} request to %'`) === '0',
  `${show(rqByViewer)} | ${show(rqOtherClient)} | ${show(rqByOperator)}`);
const rqFlip = await pgCall(await api(requesterToken, `order?id=eq.${rqAsked.body}`, { method: 'PATCH', body: JSON.stringify({ review: 'accepted' }) }));
const rqEarly = await rpc(operatorToken, 'receive_shipment', { p_order_id: rqAsked.body, p_carrier: 'courier', p_tracking_number: `${run}-f2`, p_condition: 'ok', p_box_count: 1, p_notes: null });
check('0019: the requester cannot accept their own request directly, and receive_shipment refuses a pending request (55000, "Accept the request first")',
  !(Array.isArray(rqFlip.body) && rqFlip.body.length) && !rqEarly.ok && rqEarly.body?.code === '55000' && /Accept the request first/.test(rqEarly.body?.message ?? '')
    && rqRow(rqAsked.body).startsWith('request|pending|'),
  `${show(rqFlip)} | ${show(rqEarly)}`);
const rqAcceptByRequester = await rpc(requesterToken, 'accept_order', { p_order_id: rqAsked.body, p_panel_id: null });
const rqAccepted = await rpc(operatorToken, 'accept_order', { p_order_id: rqAsked.body, p_panel_id: null });
const rqAcceptAgain = await rpc(operatorToken, 'accept_order', { p_order_id: rqAsked.body, p_panel_id: null });
check('0019: only lab staff accept (42501 for the requester); the Operator accepts; a second answer is a conflict (409, PT409)',
  pgRefused(rqAcceptByRequester) && rqAccepted.ok && rqRow(rqAsked.body) === `request|accepted|${requester.id}|${operator.id}|false|-`
    && rqAcceptAgain.status === 409 && rqAcceptAgain.body?.code === 'PT409',
  `${show(rqAcceptByRequester)} | ${show(rqAccepted)} | ${show(rqAcceptAgain)}`);
const rqNoReason = await rpc(operatorToken, 'decline_order', { p_order_id: rqAsked2.body, p_reason: '  ' });
const rqDeclined = await rpc(operatorToken, 'decline_order', { p_order_id: rqAsked2.body, p_reason: `${run} cannot run this method yet` });
const rqSeen = await pgCall(await api(requesterToken, `order?select=review,archived_reason&id=eq.${rqAsked2.body}`));
check('0019: decline needs a reason (22023); declined archives the order with it and the requester still reads the reason',
  !rqNoReason.ok && rqNoReason.body?.code === '22023' && rqDeclined.ok
    && rqRow(rqAsked2.body) === `request|declined|${requester.id}|${operator.id}|true|${run} cannot run this method yet`
    && rqSeen.ok && rqSeen.body?.[0]?.review === 'declined' && rqSeen.body?.[0]?.archived_reason === `${run} cannot run this method yet`,
  `${show(rqNoReason)} | ${show(rqDeclined)} | ${show(rqSeen)}`);

const shipPrior = sql(`select coalesce((select body from admin.shipping_instructions where archived_at is null), '')`);
try {
  const shipByOperator = await rpc(operatorToken, 'set_shipping_instructions', { p_body: `${run} operator text` });
  const shipSet = await rpc(adminToken, 'set_shipping_instructions', { p_body: `${run} ship on dry ice` });
  const shipRead = await pgCall(await api(requesterToken, 'shipping_instructions?select=body&archived_at=is.null'));
  const shipDirect = await pgCall(await api(adminToken, 'shipping_instructions', { method: 'POST', body: JSON.stringify({ body: `${run} direct` }) }));
  check('0019: only lab Owner/Admin set the shipping instructions (42501 for the Operator); a requester reads the current text; no direct insert',
    pgRefused(shipByOperator) && shipSet.ok && shipRead.ok && shipRead.body?.length === 1 && shipRead.body[0].body === `${run} ship on dry ice` && !shipDirect.ok,
    `${show(shipByOperator)} | ${show(shipSet)} | ${show(shipRead)} | ${show(shipDirect)}`);
} finally {
  const restored = await rpc(adminToken, 'set_shipping_instructions', { p_body: shipPrior });
  check('0019 teardown: the shipping instructions are back to what they were before the run',
    restored.ok && sql(`select coalesce((select body from admin.shipping_instructions where archived_at is null), '')`) === shipPrior, show(restored));
}

// ---------------------------------------------------------------- Access requests, F3 (0020_access_requests.sql)
// The public form's path through PostgREST: the app server submits with the service key (anon and signed-in users
// cannot), the run's Admin lists, approves one into a new throwaway client with a chosen role (the 0015 invitation
// link comes back once) and declines another; the Operator and the requester are refused. A back-dated declined row
// checks the 90-day erase. In `finally` the block revokes its invitations, archives its client, declines whatever of
// its requests is still pending and erases the personal data of its declined rows, so the lab's queue is as before.
const arEmail = (label) => `${run}-f3-${label}@example.test`;
const arClientName = `${run} F3 new client`;
const arSubmitArgs = (label) => ({ p_full_name: `${run} ${label}`, p_email: arEmail(label), p_organisation: `${run} F3 org`, p_kind: 'company', p_message: 'synthetic' });
try {
  const arAnon = await rpc(env.ANON_KEY, 'submit_access_request', arSubmitArgs('anon'));
  const arSigned = await rpc(requesterToken, 'submit_access_request', arSubmitArgs('signed'));
  const arSent = await serviceRpc('submit_access_request', arSubmitArgs('approve'));
  const arSent2 = await serviceRpc('submit_access_request', arSubmitArgs('decline'));
  const arAgain = await serviceRpc('submit_access_request', { ...arSubmitArgs('approve'), p_email: arEmail('approve').toUpperCase() });
  const arDirect = await pgCall(await api(adminToken, 'access_request?select=id'));
  check('0020: only the service key submits (anon and a signed-in user are refused); a reference comes back; a second pending request for the email is 409 PT409; no direct read',
    !arAnon.ok && !arSigned.ok && sql(`select count(*) from admin.access_request where email in ('${arEmail('anon')}', '${arEmail('signed')}')`) === '0'
      && arSent.ok && /^AR-\d{4,}$/.test(arSent.body ?? '') && arSent2.ok && arAgain.status === 409 && arAgain.body?.code === 'PT409' && !arDirect.ok,
    [arAnon, arSigned, arSent, arSent2, arAgain, arDirect].map(show).join(' | '));

  const arList = await rpc(adminToken, 'list_access_requests', {});
  const arMine = Array.isArray(arList.body) ? arList.body.filter(r => r.email?.startsWith(`${run}-f3-`)) : [];
  const arByOperator = await rpc(operatorToken, 'list_access_requests', {});
  const arByRequester = await rpc(requesterToken, 'pending_access_request_count', {});
  check('0020: the Admin lists the run\'s two pending requests; the Operator and a requester are refused (42501)',
    arList.ok && arMine.length === 2 && arMine.every(r => r.status === 'pending') && pgRefused(arByOperator) && pgRefused(arByRequester),
    `${show(arList)} | ${show(arByOperator)} | ${show(arByRequester)}`);
  const arApproveId = arMine.find(r => r.email === arEmail('approve'))?.id;
  const arDeclineId = arMine.find(r => r.email === arEmail('decline'))?.id;

  const approveArgs = { p_request_id: arApproveId, p_client_id: null, p_new_client_name: arClientName, p_new_client_kind: 'company', p_client_role: 'client_admin' };
  const arApproveByOp = await rpc(operatorToken, 'approve_access_request', approveArgs);
  const arApproved = await rpc(adminToken, 'approve_access_request', approveArgs);
  const arToken = typeof arApproved.body === 'string' ? arApproved.body : '';
  const arTwice = await rpc(adminToken, 'approve_access_request', approveArgs);
  const arPreview = arToken ? await rpc(env.ANON_KEY, 'invitation_preview', { p_token: arToken }) : null;
  check('0020: the Operator cannot approve (42501); the Admin approves into a new client as Client admin; the link previews; a second answer is 409 PT409',
    pgRefused(arApproveByOp) && arApproved.ok && /^[0-9a-f]{64}$/.test(arToken) && arPreview?.ok && arPreview.body?.[0]?.target === `Client admin at ${arClientName}`
      && arTwice.status === 409 && arTwice.body?.code === 'PT409'
      && sql(`select r.status || '|' || c.name || '|' || i.client_role from admin.access_request r join admin.client c on c.id = r.client_id join admin.invitation i on i.id = r.invitation_id where r.id = '${arApproveId}'`) === `approved|${arClientName}|client_admin`,
    [arApproveByOp, arApproved, arTwice].map(show).join(' | '));

  const arDeclineByOp = await rpc(operatorToken, 'decline_access_request', { p_request_id: arDeclineId, p_reason: `${run} synthetic` });
  const arDeclined = await rpc(adminToken, 'decline_access_request', { p_request_id: arDeclineId, p_reason: `${run} synthetic decline` });
  const arAudit = sql(`select count(*) from admin.audit_event where entity = 'access_request' and (after::text like '%${run}%' or coalesce(before::text, '') like '%${run}%')`);
  check('0020: the Operator cannot decline (42501); the Admin declines with a reason; the audit log holds none of the personal data',
    pgRefused(arDeclineByOp) && arDeclined.ok && sql(`select status from admin.access_request where id = '${arDeclineId}'`) === 'declined' && arAudit === '0',
    `${show(arDeclineByOp)} | ${show(arDeclined)} | audit ${arAudit}`);

  sql(`insert into admin.access_request (full_name, email, organisation, kind, status, decided_at, decline_reason)
       values ('${run} old', '${arEmail('old')}', '${run} old org', 'pi_lab', 'declined', now() - interval '91 days', '${run} old reason')`);
  const arErase = await rpc(adminToken, 'list_access_requests', {});
  check('0020: a request declined 91 days ago is erased by the next list (no scheduler): the row stays, without name, email, organisation or reason',
    arErase.ok && sql(`select count(*) from admin.access_request where organisation = '${run} old org'`) === '0'
      && sql(`select count(*) from admin.access_request where erased_at is not null and full_name is null and email is null and decline_reason is null and created_at > now() - interval '1 hour'`) !== '0',
    show(arErase));
} finally {
  const arReason = `${run} staging test run finished`;
  sql(`update admin.invitation set revoked_at = now() where email like '${run}-f3-%' and accepted_at is null and revoked_at is null;
       update admin.client set archived_at = now(), archived_reason = '${arReason}' where name = '${arClientName}' and archived_at is null;
       update admin.access_request set status = 'declined', decided_at = now(), decline_reason = '${arReason}' where email like '${run}-f3-%' and status = 'pending';
       update admin.access_request set full_name = null, email = null, organisation = null, message = null, decline_reason = null, erased_at = now()
         where email like '${run}-f3-%' and status = 'declined';`);
}

// ---------------------------------------------------------------- Deliverables and the Nexo switch, F4 (0021_deliverables.sql)
// A throwaway order of the run's client A: the Operator uploads a synthetic PDF and PNG to admin-files under
// <client_id>/<order_code>/deliverables/<sha256>/<name> with their own token and records both (hidden), then shows the
// PDF. The run's requester (client A) reads and downloads exactly the PDF through PostgREST and Storage; the PNG, a
// retired deliverable and client B's folder stay closed; the requester cannot record, show or retire anything. The
// Admin turns client A's Nexo access on and off (the Operator cannot; no direct PATCH). In `finally` the block retires
// what it recorded and turns the switch off; the objects stay (nothing in admin-files is deleted), under the run's client.
const dlOrder = await rpc(operatorToken, 'create_order', { p_client_id: clientA, p_panel_id: null, p_title: `${run} F4 deliverables`, p_matrix: null, p_expected_samples: 1, p_billing_ref: null, p_notes: null });
try {
  const dlCode = sql(`select code from admin."order" where id = '${dlOrder.body}'`);
  const pdf = Buffer.from(`%PDF-1.4\n% ${run} synthetic report\n%%EOF\n`);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a70000000049454e44ae426082', 'hex');
  const files = { pdf: { bytes: pdf, name: 'report.pdf', type: 'application/pdf' }, png: { bytes: png, name: 'figure-1.png', type: 'image/png' } };
  for (const f of Object.values(files)) {
    f.sha = createHash('sha256').update(f.bytes).digest('hex');
    f.path = `${clientA}/${dlCode}/deliverables/${f.sha}/${f.name}`;
    f.upload = await objectApi(operatorToken, `admin-files/${f.path}`, { method: 'POST', body: f.bytes, headers: { 'Content-Type': f.type } });
    f.add = await rpc(operatorToken, 'add_deliverable', { p_order_id: dlOrder.body, p_dataset_id: null, p_title: `${run} ${f.name}`, p_kind: 'figure',
      p_file_name: f.name, p_content_type: f.type, p_size_bytes: f.bytes.length, p_sha256: f.sha, p_visible: false });
  }
  const dlStored = sql(`select string_agg(storage_path, ',' order by storage_path) from admin.deliverable where order_id = '${dlOrder.body}'`);
  check('0021: the Operator uploads a PDF and a PNG under the order\'s deliverables folder and records both (hidden), at the path the function computes',
    dlOrder.ok && files.pdf.upload.ok && files.png.upload.ok && files.pdf.add.ok && files.png.add.ok && dlStored === [files.pdf.path, files.png.path].sort().join(','),
    `${show(dlOrder)} | ${files.pdf.upload.status} ${files.png.upload.status} | ${show(files.pdf.add)} | ${show(files.png.add)}`);

  const dlHidden = await pgCall(await api(requesterToken, `deliverable?select=id&order_id=eq.${dlOrder.body}`));
  const dlHiddenGet = await storageCall(requesterToken, `authenticated/admin-files/${files.pdf.path}`);
  const dlShowByClient = await rpc(requesterToken, 'set_deliverable_visibility', { p_deliverable_id: files.pdf.add.body, p_visible: true });
  const dlAddByClient = await rpc(requesterToken, 'add_deliverable', { p_order_id: dlOrder.body, p_dataset_id: null, p_title: 'x', p_kind: 'other',
    p_file_name: 'x.pdf', p_content_type: 'application/pdf', p_size_bytes: 1, p_sha256: hex('e'), p_visible: true });
  const dlPatch = await pgCall(await api(requesterToken, `deliverable?id=eq.${files.pdf.add.body}`, { method: 'PATCH', body: JSON.stringify({ visible_to_client: true }) }));
  check('0021: while hidden the requester reads neither the row nor the object, and cannot show, record or PATCH a deliverable (42501)',
    dlHidden.ok && dlHidden.body?.length === 0 && storageRefused(dlHiddenGet) && pgRefused(dlShowByClient) && pgRefused(dlAddByClient) && !dlPatch.ok,
    [dlHidden, dlHiddenGet, dlShowByClient, dlAddByClient, dlPatch].map(show).join(' | '));

  const dlShown = await rpc(operatorToken, 'set_deliverable_visibility', { p_deliverable_id: files.pdf.add.body, p_visible: true });
  const dlRows = await pgCall(await api(requesterToken, `deliverable?select=id,file_name&order_id=eq.${dlOrder.body}`));
  const dlGet = await objectApi(requesterToken, `authenticated/admin-files/${files.pdf.path}`);
  const dlBytes = dlGet.ok ? Buffer.from(await dlGet.arrayBuffer()) : Buffer.alloc(0);
  const dlPng = await storageCall(requesterToken, `authenticated/admin-files/${files.png.path}`);
  const dlSign = await storageCall(requesterToken, `sign/admin-files/${files.pdf.path}`, jsonPost({ expiresIn: 60 }));
  const dlOtherFolder = await storageCall(requesterToken, `authenticated/admin-files/${key}`); // the 0006 TXT of client A's wave-2 order
  check('0021: once shown, the requester reads that one row and downloads exactly the PDF\'s bytes (also by a short signed URL); the PNG and the order\'s other files stay closed',
    dlShown.ok && dlRows.ok && dlRows.body?.length === 1 && dlRows.body[0].file_name === 'report.pdf' && dlGet.ok
      && createHash('sha256').update(dlBytes).digest('hex') === files.pdf.sha && storageRefused(dlPng) && dlSign.ok && typeof dlSign.body?.signedURL === 'string'
      && storageRefused(dlOtherFolder),
    `${show(dlShown)} | ${show(dlRows)} | get ${dlGet.status} | ${show(dlPng)} | ${show(dlSign)} | ${show(dlOtherFolder)}`);

  const dlRetired = await rpc(operatorToken, 'retire_deliverable', { p_deliverable_id: files.pdf.add.body, p_reason: `${run} wrong cover page` });
  const dlRetiredAgain = await rpc(operatorToken, 'retire_deliverable', { p_deliverable_id: files.pdf.add.body, p_reason: `${run} again` });
  const dlAfter = await storageCall(requesterToken, `authenticated/admin-files/${files.pdf.path}`);
  const dlRemove = await storageCall(operatorToken, 'admin-files', { method: 'DELETE', body: JSON.stringify({ prefixes: [files.pdf.path] }), headers: { 'Content-Type': 'application/json' } });
  check('0021: a retired deliverable closes its object to the client; retiring twice is 409 PT409; the lab cannot remove the retired file (0012 cleanup)',
    dlRetired.ok && dlRetiredAgain.status === 409 && dlRetiredAgain.body?.code === 'PT409' && storageRefused(dlAfter)
      && objectCount('admin-files', files.pdf.path) === '1',
    `${show(dlRetired)} | ${show(dlRetiredAgain)} | ${show(dlAfter)} | ${show(dlRemove)}`);

  // Only this block's changes: the 0010 block already turned the switch on and off (0022).
  const nxAuditCount = () => Number(sql(`select count(*) from admin.audit_event where entity = 'client' and entity_id = '${clientA}' and before is not null and before->>'nexo_access' is distinct from after->>'nexo_access'`));
  const nxAuditBefore = nxAuditCount();
  const nxByOperator = await rpc(operatorToken, 'set_client_nexo_access', { p_client_id: clientA, p_enabled: true });
  const nxOn = await rpc(adminToken, 'set_client_nexo_access', { p_client_id: clientA, p_enabled: true });
  const nxSeen = await pgCall(await api(requesterToken, `client?select=nexo_access&id=eq.${clientA}`));
  const nxPatch = await pgCall(await api(adminToken, `client?id=eq.${clientA}`, { method: 'PATCH', body: JSON.stringify({ nexo_access: false }) }));
  const nxOff = await rpc(adminToken, 'set_client_nexo_access', { p_client_id: clientA, p_enabled: false });
  const nxAudit = nxAuditCount() - nxAuditBefore;
  check('0021: the Admin turns client A\'s Nexo access on and off (audited twice); the requester reads it; the Operator is refused (42501); no direct PATCH',
    pgRefused(nxByOperator) && nxOn.ok && nxSeen.ok && nxSeen.body?.[0]?.nexo_access === true && !nxPatch.ok && nxOff.ok
      && sql(`select nexo_access from admin.client where id = '${clientA}'`) === 'f' && nxAudit === 2,
    [nxByOperator, nxOn, nxSeen, nxPatch, nxOff].map(show).join(' | ') + ` | audit ${nxAudit}`);
} finally {
  sql(`update admin.client set nexo_access = false where id = '${clientA}' and nexo_access;`);
  if (dlOrder.ok && /^[0-9a-f-]{36}$/.test(String(dlOrder.body))) {
    sql(`update admin.deliverable set archived_at = now(), archived_reason = '${run} staging test run finished'
           where order_id = '${dlOrder.body}' and archived_at is null;`);
  }
}

// ---------------------------------------------------------------- Member names and the contact for clients (0023_client_member_names.sql)
// The run's Admin approves a throwaway access request into client A as Requester; the server (service key) accepts
// the invitation for a throwaway account with that email, as the invitation page does. The membership carries the
// name the person wrote, and the run's Operator reads it through PostgREST. A plain invitation names its member by
// the invited email. The contact for clients: the Operator is refused, the Admin sets it, the requester reads it from
// the table, anon only through client_contact_text (the table stays closed to anon). In `finally` the text that was
// there before the run is set again; the memberships are retired with the run's users, the client by archiveRun.
const cnPrior = sql(`select coalesce((select body from admin.client_contact where archived_at is null), '')`);
try {
  const cnNamed = await createUser('f5-named');
  const cnPlain = await createUser('f5-plain');
  const cnSent = await serviceRpc('submit_access_request', { p_full_name: `${run} Named Person`, p_email: cnNamed.email, p_organisation: `${run} F5 org`, p_kind: 'pi_lab', p_message: null });
  const cnList = await rpc(adminToken, 'list_access_requests', {});
  const cnRequestId = Array.isArray(cnList.body) ? cnList.body.find(r => r.email === cnNamed.email)?.id : undefined;
  const cnApproved = await rpc(adminToken, 'approve_access_request', { p_request_id: cnRequestId, p_client_id: clientA, p_new_client_name: null, p_new_client_kind: null, p_client_role: 'requester' });
  const cnAccepted = typeof cnApproved.body === 'string' ? await serviceRpc('accept_invitation', { p_token: cnApproved.body, p_user_id: cnNamed.id }) : cnApproved;
  const cnInvited = await rpc(adminToken, 'create_invitation', { p_email: cnPlain.email, p_lab_role: null, p_client_id: clientA, p_client_role: 'viewer' });
  const cnAcceptedPlain = typeof cnInvited.body === 'string' ? await serviceRpc('accept_invitation', { p_token: cnInvited.body, p_user_id: cnPlain.id }) : cnInvited;
  const cnRead = await pgCall(await api(operatorToken, `client_member?select=user_id,display_name&client_id=eq.${clientA}&user_id=in.(${cnNamed.id},${cnPlain.id})`));
  const cnName = (user) => cnRead.body?.find?.(r => r.user_id === user.id)?.display_name;
  check('0023: accepting an invitation names the member (the access request\'s full name, else the invited email); the Operator reads both names',
    cnSent.ok && cnApproved.ok && cnAccepted.ok && cnInvited.ok && cnAcceptedPlain.ok && cnRead.ok
      && cnName(cnNamed) === `${run} Named Person` && cnName(cnPlain) === cnPlain.email,
    [cnSent, cnApproved, cnAccepted, cnInvited, cnAcceptedPlain, cnRead].map(show).join(' | '));

  const cnByOperator = await rpc(operatorToken, 'set_client_contact', { p_body: `${run} operator text` });
  const cnSet = await rpc(adminToken, 'set_client_contact', { p_body: `${run} write to lab@example.test` });
  const cnSeen = await pgCall(await api(requesterToken, 'client_contact?select=body&archived_at=is.null'));
  const cnAnon = await rpc(env.ANON_KEY, 'client_contact_text', {});
  const cnAnonTable = await pgCall(await api(env.ANON_KEY, 'client_contact?select=body'));
  const cnDirect = await pgCall(await api(adminToken, 'client_contact', { method: 'POST', body: JSON.stringify({ body: `${run} direct` }) }));
  check('0023: only lab Owner/Admin set the contact for clients (42501 for the Operator); a requester reads it; anon reads only the text through client_contact_text; no direct insert',
    pgRefused(cnByOperator) && cnSet.ok && cnSeen.ok && cnSeen.body?.length === 1 && cnSeen.body[0].body === `${run} write to lab@example.test`
      && cnAnon.ok && cnAnon.body === `${run} write to lab@example.test` && !cnAnonTable.ok && !cnDirect.ok,
    [cnByOperator, cnSet, cnSeen, cnAnon, cnAnonTable, cnDirect].map(show).join(' | '));
} finally {
  const restored = await rpc(adminToken, 'set_client_contact', { p_body: cnPrior });
  check('0023 teardown: the contact for clients is back to what it was before the run',
    restored.ok && sql(`select coalesce((select body from admin.client_contact where archived_at is null), '')`) === cnPrior, show(restored));
}

} catch (error) {
  failures++;
  console.log(`FAIL the run stopped: ${error instanceof Error ? error.message : error}`);
} finally {
  try { await archiveRun(); } catch (error) { failures++; console.log(`FAIL teardown: ${error instanceof Error ? error.message : error}`); }
  try { await restorePolicy(); } catch (error) { failures++; console.log(`FAIL teardown policy: ${error instanceof Error ? error.message : error}`); }
  try { await retireRunUsers(); } catch (error) { failures++; console.log(`FAIL teardown users: ${error instanceof Error ? error.message : error}`); }
}

console.log(failures ? `\n${failures} check(s) failed (run ${run})` : `\nAll checks passed (run ${run})`);
process.exit(failures ? 1 : 0);
