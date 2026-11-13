#!/usr/bin/env node
// Showcase seed for Admin staging (docs/admin/admin-demo-seed.md): synthetic clients and orders parked at every point
// of the pipeline, so every screen has something to show. The plan (names, samples, which order stops where, the
// synthetic files) is e2e/live/demo-plan.mjs, covered by tests/demo-seed.test.ts. It creates, or finds:
//
//   Demo Staff (demo)     demo.staff@admin-staging.test     lab staff, role admin: does the lab's every step
//   Demo Approver (demo)  demo.approver@admin-staging.test  lab staff, role owner: the second signer
//   "Demo Lipid Panel (demo)"                               the panel of every demo order (create_panel)
//   "Harbor Lipid Lab (demo)", "Cedar Cardio Group (demo)", "Atlas Nutrition Core (demo)", each with one requester
//   (<slug>.demo@admin-staging.test), made the way a real client arrives: the member's access request
//   (submit_access_request), approved by Demo Staff into a new client (approve_access_request), the invitation accepted
//   by the member (accept_my_invitation), which names the membership after the request.
//   10 orders titled "… (demo)", each requested by its client's member (request_order) and moved by Demo Staff only
//   through the admin.* RPCs the screens call (accept_order … release_dataset, add_deliverable), each signed in with
//   the anon key and that person's own token, so every guard and audit row is the real one. Results, dataset files
//   and the deliverable are uploaded to admin-files with Demo Staff's token first, as the app does; the results file
//   is e2e/fixtures/sciex-synthetic.txt renamed to the batch, and the dataset is built with @lipidomic/admin-ingest
//   as src/lib/release-build.ts builds it (packages/admin-ingest must be built: npm ci && npm run build there).
//   One order asked for at Extracted stops at Registered: no RPC moves an order to Extracted (create_batch records the
//   extraction and moves it to In batch). The batched orders' aliquots go into "Demo freezer box 1 (demo)".
//
// Idempotent: an order is found by its client and title, and a run only takes the steps it still lacks (a run that
// stopped half way resumes). The service key is used only where no RPC can do the work: the four GoTrue users, the
// two lab_staff rows (seed-kit.mjs), and submit_access_request, which the public Request access page also calls with
// it. Release policy: when it does not let Demo Staff and Demo Approver sign and release, Demo Approver widens it for
// the run (the demo two added, 2 signatures) and puts the recorded policy back at the end; the policy to put back is
// kept in the credentials file until it is back, and the next run puts it back first.
//
//   --dry-run   print the plan; no environment needed, nothing read or written
//   --reset     archive, never delete: withdraw the released demo dataset, retire deliverables, take the aliquots out
//               of the box, archive batches, aliquots, orders and memberships, rename each demo client
//               "… (demo, archived <UTC>)" and archive it (client names are unique). The next run creates them again.
//
// Each run gives the four demo accounts new generated passwords and removes any TOTP factor (two-step sign-in is off
// since 2026-11-11); they go only to the file named by ADMIN_DEMO_CREDENTIALS (mode 600, git-ignored:
// e2e/live/.demo-credentials*.json). Passwords, tokens and keys are never printed.
//
// Environment (never committed): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// ADMIN_DEMO_CREDENTIALS; optional ADMIN_E2E_AUTH_URL / ADMIN_E2E_REST_URL as for the pilot seed, and
// ADMIN_E2E_STORAGE_URL (default <url>/storage/v1).
//   ADMIN_DEMO_CREDENTIALS=e2e/live/.demo-credentials.local.json node e2e/live/demo-seed.mjs [--dry-run | --reset]
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOX, CLIENTS, ORDERS, PANEL, POINTS, PROCESSING_METHOD, RESET_REASON, SCIEX_OS_VERSION, STAFF, archivedClientName, batchInjections,
  batchRules, clientOf, datasetPaths, deliverablePath, demoDeliverable, demoSamples, formatPlan, isDemoName, matchSamples, matchesOrder,
  nextSteps, orderRequest, policyChange, sequenceCsv, sha256, slotName, slotOffsets, syntheticResults,
} from "./demo-plan.mjs";

const PREFIX = "demo-seed";
const flags = process.argv.slice(2);
const unknownFlags = flags.filter(flag => !["--dry-run", "--reset"].includes(flag));
if (unknownFlags.length) { console.error(`${PREFIX}: unknown argument ${unknownFlags.join(" ")} (use --dry-run or --reset)`); process.exit(2); }
const dryRun = flags.includes("--dry-run");
const reset = flags.includes("--reset");
if (dryRun) { console.log(formatPlan({ reset })); process.exit(0); }

const env = process.env;
const missing = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_DEMO_CREDENTIALS"].filter(name => !env[name]?.trim());
if (missing.length) { console.error(`${PREFIX}: missing environment: ${missing.join(", ")}`); process.exit(2); }
// The seed resets passwords and factors: only reserved test domains (RFC 2606/6761).
for (const email of [...Object.values(STAFF).map(p => p.email), ...CLIENTS.map(c => c.member.email)]) {
  if (!/@[^@]+\.(test|invalid|example)$/i.test(email)) { console.error(`${PREFIX}: ${email} is not on a reserved test domain`); process.exit(2); }
}

const { createSeedKit } = await import("./seed-kit.mjs");
const kit = createSeedKit(env, PREFIX);
const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
const storageUrl = (env.ADMIN_E2E_STORAGE_URL || `${base}/storage/v1`).replace(/\/+$/, "");
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const here = dirname(fileURLToPath(import.meta.url));
const log = message => console.log(`${PREFIX}: ${message}`);
const list = ids => `in.(${ids.join(",")})`;
const enc = value => encodeURIComponent(value);

// ---------------------------------------------------------------- credentials file

const file = env.ADMIN_DEMO_CREDENTIALS;
let earlier = {};
if (existsSync(file)) { try { earlier = JSON.parse(readFileSync(file, "utf8")) ?? {}; } catch { earlier = {}; } }
let record = {};
function save(patch) {
  record = { ...record, ...patch };
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

// ---------------------------------------------------------------- people

// GoTrue users and lab_staff rows (service key, seed-kit), new passwords, no TOTP factor (two-step is off).
const people = {};
async function preparePeople() {
  for (const [key, persona] of [...Object.entries(STAFF), ...CLIENTS.map(c => [c.key, c.member])]) {
    const password = kit.password();
    const userId = await kit.ensureUser(persona, password);
    if (persona.role) await kit.ensureStaff(userId, persona);
    for (const factor of (await kit.auth(`/admin/users/${userId}/factors`)) ?? []) await kit.auth(`/admin/users/${userId}/factors/${factor.id}`, { method: "DELETE" });
    people[key] = { email: persona.email, password, name: persona.name, userId, ...(persona.role ? { role: persona.role } : {}) };
  }
  save({ ...people, policyToRestore: earlier.policyToRestore, orders: earlier.orders ?? [] });
  log(`${Object.values(people).map(p => `${p.name} <${p.email}>`).join(", ")} ready; passwords written to ${file} (mode 600)`);
  for (const key of Object.keys(people)) as[key] = await signIn(people[key]);
  if (earlier.policyToRestore) {
    log("an earlier run left the release policy widened; putting it back first");
    await restorePolicy(earlier.policyToRestore);
  }
}

// Each person's own session: the anon key and their token, as the app's server actions use them.
async function signIn(person) {
  const session = await kit.auth("/token?grant_type=password", { key: anon, method: "POST", body: { email: person.email, password: person.password } });
  if (!session?.access_token) throw new Error(`sign-in of ${person.email} returned no token`);
  return { ...person, token: session.access_token };
}
const as = {};
const db = (who, path, init = {}) => kit.rest(path, { ...init, key: anon, token: who.token });
const rpc = (who, name, args) => db(who, `rpc/${name}`, { method: "POST", body: args });

// ---------------------------------------------------------------- admin-files (the user's own storage rights)

const objectPath = path => path.split("/").map(enc).join("/");
async function upload(who, path, bytes, contentType) {
  const res = await fetch(`${storageUrl}/object/admin-files/${objectPath(path)}`, {
    method: "POST", headers: { apikey: anon, Authorization: `Bearer ${who.token}`, "Content-Type": contentType, "x-upsert": "false" }, body: bytes,
  });
  if (res.ok) return true;
  const text = await res.text();
  if (/duplicate|already exists/i.test(text)) return false; // the path names the digest: the same bytes are there
  throw new Error(`upload to admin-files/${path}: ${res.status} ${text.slice(0, 200)}`);
}
async function download(who, path) {
  const res = await fetch(`${storageUrl}/object/authenticated/admin-files/${objectPath(path)}`, { headers: { apikey: anon, Authorization: `Bearer ${who.token}` } });
  if (!res.ok) throw new Error(`download of admin-files/${path}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
// As src/lib/data/upload-then-record.ts: objects this attempt wrote are removed again when the RPC refuses them.
async function uploadThenRecord(who, files, recordRpc) {
  const written = [];
  try {
    for (const item of files) if (await upload(who, item.path, item.bytes, item.contentType)) written.push(item.path);
    return await recordRpc();
  } catch (error) {
    if (written.length) {
      await fetch(`${storageUrl}/object/admin-files`, {
        method: "DELETE", headers: { apikey: anon, Authorization: `Bearer ${who.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: written }),
      }).catch(() => undefined);
    }
    throw error;
  }
}

// ---------------------------------------------------------------- release policy

let policyOpen = false;
async function restorePolicy(previous) {
  await rpc(as.approver, "set_release_policy", { p_eligible_signers: previous.eligible_signers, p_required_signatures: previous.required_signatures });
  save({ policyToRestore: undefined });
  log(`release policy put back (${previous.required_signatures} signatures, ${previous.eligible_signers.length ? `${previous.eligible_signers.length} named signers` : "any Owner or Admin"})`);
}
// Before the first signature, release or withdrawal: let both demo people sign, recording what to put back.
async function ensureSigners() {
  if (policyOpen) return;
  const [current] = await db(as.staff, "release_policy?select=eligible_signers,required_signatures&archived_at=is.null");
  const change = policyChange(current ?? null, [people.staff.userId, people.approver.userId]);
  if (change) {
    if (!current) throw new Error("the release policy has no current row, yet the demo signers are not eligible; set it on Release policy first");
    save({ policyToRestore: { eligible_signers: current.eligible_signers, required_signatures: current.required_signatures } });
    await rpc(as.approver, "set_release_policy", { p_eligible_signers: change.eligible_signers, p_required_signatures: change.required_signatures });
    log("release policy widened for this run: Demo Staff and Demo Approver may sign (put back at the end)");
  }
  policyOpen = true;
}
async function closeSigners() {
  if (!record.policyToRestore) return;
  try { await restorePolicy(record.policyToRestore); } catch (error) {
    console.error(`${PREFIX}: WARNING: the release policy could not be put back (${error.message}). It is recorded in ${file}; run the seed again to put it back.`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------- reads

async function liveClient(name) {
  const rows = await db(as.staff, `client?select=id,name,archived_at&name=eq.${enc(name)}`);
  if (rows[0]?.archived_at) throw new Error(`the client "${name}" is archived but keeps its name; rename it (Clients) or run --reset`);
  return rows[0] ?? null;
}
async function orderSamples(orderId) {
  return db(as.staff, `sample?select=id,sample_code,sample_number,full_name,group1_term,group2_term,replicate_term,patient_term,time_point_term&order_id=eq.${orderId}&archived_at=is.null&order=sample_number`);
}
async function orderAliquots(orderId) {
  const samples = await orderSamples(orderId);
  if (!samples.length) return [];
  const aliquots = await db(as.staff, `aliquot?select=id,aliquot_code,sample_id&sample_id=${list(samples.map(s => s.id))}&archived_at=is.null`);
  const rank = new Map(samples.map(s => [s.id, s.sample_number]));
  return aliquots.sort((a, b) => rank.get(a.sample_id) - rank.get(b.sample_id) || a.aliquot_code.localeCompare(b.aliquot_code));
}
async function placedAliquotIds(aliquotIds) {
  if (!aliquotIds.length) return new Set();
  return new Set((await db(as.staff, `box_position?select=aliquot_id&aliquot_id=${list(aliquotIds)}&archived_at=is.null`)).map(row => row.aliquot_id));
}
// The order's live batch (one per demo order), through its aliquots' injections.
async function orderBatch(orderId) {
  const aliquots = await orderAliquots(orderId);
  if (!aliquots.length) return null;
  const versionIds = [...new Set((await db(as.staff, `injection?select=batch_version_id&aliquot_id=${list(aliquots.map(a => a.id))}&archived_at=is.null`)).map(row => row.batch_version_id))];
  if (!versionIds.length) return null;
  const versions = await db(as.staff, `batch_version?select=id,batch_id,version&id=${list(versionIds)}&archived_at=is.null`);
  const batches = versions.length ? await db(as.staff, `batch?select=id,name,status&id=${list([...new Set(versions.map(v => v.batch_id))])}&archived_at=is.null`) : [];
  if (batches.length !== 1) throw new Error(`expected one live batch for the order, found ${batches.length}`);
  const [latest] = await db(as.staff, `batch_version?select=id&batch_id=eq.${batches[0].id}&archived_at=is.null&order=version.desc&limit=1`);
  const injections = await db(as.staff, `injection?select=seq,sample_type,sample_name,client_id,aliquot_id,plate,vial&batch_version_id=eq.${latest.id}&archived_at=is.null&order=seq`);
  return { ...batches[0], injections };
}
async function liveDatasets(orderId) {
  return db(as.staff, `dataset?select=id,version,status,client_id,sha256,analysis_sha256,companion_sha256&order_id=eq.${orderId}&archived_at=is.null&order=version.desc`);
}
async function observe(row) {
  if (!row) return { exists: false };
  const state = { exists: true, review: row.review, stage: row.stage };
  const aliquots = await orderAliquots(row.id);
  const placed = await placedAliquotIds(aliquots.map(a => a.id));
  state.unplacedAliquots = aliquots.filter(a => !placed.has(a.id)).length;
  const [dataset] = await liveDatasets(row.id);
  if (dataset) {
    const signers = await db(as.staff, `signature?select=user_id&dataset_id=eq.${dataset.id}&archived_at=is.null`);
    state.signedBy = Object.entries({ staff: people.staff.userId, approver: people.approver.userId }).filter(([, id]) => signers.some(s => s.user_id === id)).map(([key]) => key);
  }
  state.deliverables = (await db(as.staff, `deliverable?select=id&order_id=eq.${row.id}&archived_at=is.null`)).length;
  return state;
}

// ---------------------------------------------------------------- reset

async function resetDemo() {
  let archivedOrders = 0;
  try {
    for (const client of CLIENTS) {
      const found = await liveClient(client.name).catch(() => null);
      if (!found) { log(`"${client.name}": no live client; nothing to archive`); continue; }
      const orders = (await db(as.staff, `order?select=id,code,title,stage,archived_at&client_id=eq.${found.id}&archived_at=is.null&order=order_number`)).filter(o => isDemoName(o.title));
      for (const order of orders) {
        for (const dataset of await db(as.staff, `dataset?select=id&order_id=eq.${order.id}&status=eq.released&archived_at=is.null`)) {
          await ensureSigners();
          await rpc(as.staff, "withdraw_dataset", { p_dataset_id: dataset.id, p_reason: RESET_REASON });
        }
        for (const deliverable of await db(as.staff, `deliverable?select=id&order_id=eq.${order.id}&archived_at=is.null`)) {
          await rpc(as.staff, "retire_deliverable", { p_deliverable_id: deliverable.id, p_reason: RESET_REASON });
        }
        const aliquots = await orderAliquots(order.id);
        const placed = await placedAliquotIds(aliquots.map(a => a.id));
        for (const aliquot of aliquots) if (placed.has(aliquot.id)) await rpc(as.staff, "remove_aliquot", { p_aliquot_id: aliquot.id, p_reason: RESET_REASON });
        // The batch, as e2e/live/pilot-teardown.mjs archives it: open versions' injections, versions, batch; then aliquots.
        const archive = path => db(as.staff, `${path}&archived_at=is.null`, { method: "PATCH", body: { archived_at: new Date().toISOString(), archived_reason: RESET_REASON } });
        const ids = aliquots.map(a => a.id);
        const versionIds = ids.length ? [...new Set((await db(as.staff, `injection?select=batch_version_id&aliquot_id=${list(ids)}`)).map(r => r.batch_version_id))] : [];
        const batchIds = versionIds.length ? [...new Set((await db(as.staff, `batch_version?select=batch_id&id=${list(versionIds)}`)).map(r => r.batch_id))] : [];
        if (batchIds.length) {
          const versions = await db(as.staff, `batch_version?select=id,exported_at&batch_id=${list(batchIds)}`);
          const own = new Set(ids);
          const foreign = (await db(as.staff, `injection?select=aliquot_id&batch_version_id=${list(versions.map(v => v.id))}`)).filter(r => r.aliquot_id && !own.has(r.aliquot_id));
          if (foreign.length) log(`${order.code}: its batch also holds other orders' samples; batch left as it is`);
          else {
            const open = versions.filter(v => !v.exported_at).map(v => v.id);
            if (open.length) await archive(`injection?batch_version_id=${list(open)}`);
            await archive(`batch_version?batch_id=${list(batchIds)}`);
            await archive(`batch?id=${list(batchIds)}`);
          }
        }
        if (ids.length) await archive(`aliquot?id=${list(ids)}`);
        await archive(`order?id=eq.${order.id}`);
        archivedOrders++;
        log(`${order.code} "${order.title}" archived`);
      }
      const open = await db(as.staff, `order?select=code&client_id=eq.${found.id}&archived_at=is.null&stage=neq.released`);
      if (open.length) { log(`"${client.name}" still has open orders (${open.map(o => o.code).join(", ")}) not made by the seed; client left live`); continue; }
      for (const member of await db(as.staff, `client_member?select=id&client_id=eq.${found.id}&archived_at=is.null`)) {
        await rpc(as.staff, "archive_member", { p_kind: "client_member", p_id: member.id, p_reason: RESET_REASON });
      }
      const renamed = archivedClientName(client.name);
      const [row] = await db(as.staff, `client?select=kind,billing_method,notes&id=eq.${found.id}`);
      await rpc(as.staff, "update_client", { p_client_id: found.id, p_name: renamed, p_kind: row.kind, p_billing_method: row.billing_method, p_notes: row.notes });
      await rpc(as.staff, "archive_client", { p_client_id: found.id, p_reason: RESET_REASON });
      log(`"${client.name}" archived as "${renamed}"`);
    }
  } finally {
    await closeSigners();
  }
  save({ orders: [] });
  log(`reset done: ${archivedOrders} order(s) archived; run the seed again to create the demo anew`);
}

// ---------------------------------------------------------------- panel, clients, members, orders

async function seedDemo() {

  const [panelRow] = await db(as.staff, `panel?select=id,archived_at&name=eq.${enc(PANEL.name)}`);
  if (panelRow?.archived_at) throw new Error(`the panel "${PANEL.name}" is archived; restore it on Instruments & panels or rename it`);
  const panelId = panelRow?.id ?? await rpc(as.staff, "create_panel", { p_instrument_id: null, p_name: PANEL.name, p_lc_method: PANEL.lcMethod, p_istd_kits: [], p_dataset_type: PANEL.datasetType });

  const clientIds = {};
  for (const client of CLIENTS) {
    const member = people[client.key];
    let found = await liveClient(client.name);
    const isMember = found && (await db(as.staff, `client_member?select=id&client_id=eq.${found.id}&user_id=eq.${member.userId}&archived_at=is.null`)).length > 0;
    if (!isMember) {
      // An invitation an interrupted run left waiting would block the approval: revoke it (its token is lost).
      if (found) {
        for (const invitation of await db(as.staff, `invitation?select=id&email=eq.${enc(member.email)}&client_id=eq.${found.id}&accepted_at=is.null&revoked_at=is.null&archived_at=is.null`)) {
          await rpc(as.staff, "revoke_invitation", { p_invitation_id: invitation.id });
        }
      }
      try {
        await kit.rest("rpc/submit_access_request", { method: "POST", body: {
          p_full_name: member.name, p_email: member.email, p_organisation: client.name, p_kind: client.kind,
          p_message: "Synthetic access request of the Admin showcase seed (demo).",
        } });
      } catch (error) { if (!/already waiting/i.test(error.message)) throw error; }
      const requests = await rpc(as.staff, "list_access_requests", {});
      const request = requests.find(r => r.email === member.email && r.status === "pending");
      if (!request) throw new Error(`no pending access request for ${member.email}`);
      const token = await rpc(as.staff, "approve_access_request", {
        p_request_id: request.id, p_client_id: found?.id ?? null, p_new_client_name: found ? null : client.name, p_new_client_kind: client.kind, p_client_role: "requester",
      });
      await rpc(as[client.key], "accept_my_invitation", { p_token: token });
      found = await liveClient(client.name);
      log(`"${client.name}" ready, ${member.name} is its requester (access request approved, invitation accepted)`);
    }
    clientIds[client.key] = found.id;
  }

  // ---------------------------------------------------------------- the orders

  const fixture = readFileSync(join(here, "../fixtures/sciex-synthetic.txt"), "utf8");
  let ingest = null;
  let ExcelJS = null;
  async function tools() {
    ingest ??= await import("@lipidomic/admin-ingest");
    ExcelJS ??= (await import("exceljs")).default;
    return { ingest, ExcelJS };
  }
  // src/lib/release-build.ts: the dataset v1 workbook, then its analysis and companion files, cells copied as they are.
  async function buildFiles({ sourceText, sourceSha256, metadata, headerMode, version, sciexOsVersion, processingMethod }) {
    const { ingest: { buildDatasetV1, classify, parseSciexTxt }, ExcelJS: Excel } = await tools();
    if (sha256(Buffer.from(sourceText, "utf8")) !== sourceSha256) throw new Error("the results text does not re-encode to the accepted bytes; nothing built");
    const classified = classify(parseSciexTxt(sourceText));
    const provenance = { sourceText, datasetVersion: String(version), ...(sciexOsVersion ? { sciexOsVersion } : {}), ...(processingMethod ? { processingMethod } : {}) };
    const full = Buffer.from(await buildDatasetV1(classified, { headerMode, metadata, provenance }));
    const book = new Excel.Workbook();
    await book.xlsx.load(full);
    const names = book.worksheets.map(sheet => sheet.name);
    if (names.join("|") !== "Abundance|Metadata|Internal_Standards|QC_Injections|Provenance") throw new Error(`not a dataset v1 workbook: ${names.join(", ")}`);
    const extract = async sheets => {
      const out = new Excel.Workbook();
      for (const name of sheets) {
        const from = book.getWorksheet(name);
        const to = out.addWorksheet(name);
        from.eachRow({ includeEmpty: true }, (row, number) => { to.getRow(number).values = row.values; });
      }
      return Buffer.from(await out.xlsx.writeBuffer());
    };
    const analysis = await extract(["Abundance", "Metadata"]);
    const companion = await extract(["Internal_Standards", "QC_Injections", "Provenance"]);
    const described = bytes => ({ bytes, sha256: sha256(bytes), sizeBytes: bytes.byteLength });
    return { full: described(full), analysis: described(analysis), companion: described(companion) };
  }

  const offsets = slotOffsets();
  const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const steps = {
    async request(ctx) {
      const id = await rpc(as[ctx.client.key], "request_order", { p_client_id: ctx.clientId, p_panel_id: panelId, ...orderRequest(ctx.plan) });
      [ctx.row] = await db(as.staff, `order?select=id,code,title,stage,review,archived_at,client_id&id=eq.${id}`);
    },
    accept: ctx => rpc(as.staff, "accept_order", { p_order_id: ctx.row.id, p_panel_id: null }),
    decline: ctx => rpc(as.staff, "decline_order", { p_order_id: ctx.row.id, p_reason: ctx.plan.declineReason }),
    receive: ctx => rpc(as.staff, "receive_shipment", {
      p_order_id: ctx.row.id, p_carrier: "Synthetic Courier (demo)", p_tracking_number: `DEMO-${ctx.row.code}`, p_condition: "ok", p_box_count: 1,
      p_notes: "Arrived on dry ice; synthetic shipment (demo).",
    }),
    async register(ctx) {
      const [shipment] = await db(as.staff, `shipment?select=id&order_id=eq.${ctx.row.id}&archived_at=is.null&order=received_at.desc&limit=1`);
      await rpc(as.staff, "register_samples", { p_order_id: ctx.row.id, p_shipment_id: shipment?.id ?? null, p_samples: demoSamples(ctx.plan) });
    },
    async batch(ctx) {
      const samples = await orderSamples(ctx.row.id);
      await rpc(as.staff, "create_batch", { p_name: null, p_panel_id: panelId, p_rules: batchRules(ctx.row.code), p_injections: batchInjections(samples) });
    },
    async store(ctx) {
      const aliquots = await orderAliquots(ctx.row.id);
      const placed = await placedAliquotIds(aliquots.map(a => a.id));
      for (const [i, aliquot] of aliquots.entries()) {
        if (!placed.has(aliquot.id)) await rpc(as.staff, "place_aliquot", { p_aliquot_id: aliquot.id, p_box: BOX, p_position: slotName(offsets[ctx.plan.key] + i) });
      }
    },
    async export(ctx) {
      const batch = await orderBatch(ctx.row.id);
      const rows = batch.injections.map(({ seq, sample_type, sample_name, client_id, aliquot_id, plate, vial }) => ({ seq, sample_type, sample_name, client_id, aliquot_id, plate: plate ?? "", vial: vial ?? "" }));
      await rpc(as.staff, "mark_batch_exported", { p_batch_id: batch.id, p_sequence_sha256: sha256(sequenceCsv(rows)), p_injections: rows });
    },
    async acquire(ctx) {
      await rpc(as.staff, "mark_batch_acquired", { p_batch_id: (await orderBatch(ctx.row.id)).id });
    },
    // src/lib/data/results.ts: the TXT is parsed and summarised, uploaded, then accepted for the order.
    async results(ctx) {
      const { ingest: { parseSciexTxt, classify, checks } } = await tools();
      const text = syntheticResults(fixture, (await orderBatch(ctx.row.id)).injections);
      const bytes = Buffer.from(text, "utf8");
      const parsed = parseSciexTxt(text);
      const classified = classify(parsed);
      const found = checks(parsed);
      const summary = {
        injections: classified.counts.samplesByType, analytes: classified.lipids.map(row => row.name), internalStandards: classified.internalStandards.length,
        duplicatesDropped: classified.droppedRows.length, naShare: classified.counts.nullCellShare, checks: found,
        overrideReason: found.some(check => check.status === "stop") ? "Synthetic demo export (demo)." : null,
      };
      const digest = sha256(bytes);
      const path = `${ctx.row.client_id}/${ctx.row.code}/${randomUUID()}/${randomUUID()}-${digest}.txt`;
      await uploadThenRecord(as.staff, [{ path, bytes, contentType: "text/plain" }], () => rpc(as.staff, "accept_result_file", {
        p_order_id: ctx.row.id, p_storage_path: path, p_sha256: digest, p_sciex_os_version: SCIEX_OS_VERSION, p_processing_method: PROCESSING_METHOD, p_summary: summary,
      }));
    },
    // src/lib/data/release.ts buildDataset: the accepted TXT, matched to this order's registry, built, uploaded, recorded.
    async build(ctx) {
      const { ingest: { parseSciexTxt } } = await tools();
      const [accepted] = await db(as.staff, `result_file?select=id,sha256,storage_path,sciex_os_version,processing_method&order_id=eq.${ctx.row.id}&status=eq.accepted&archived_at=is.null&order=accepted_at.desc&limit=1`);
      if (!accepted) throw new Error("no accepted results file");
      const bytes = await download(as.staff, accepted.storage_path);
      if (sha256(bytes) !== accepted.sha256) throw new Error("the stored results file does not match its recorded digest");
      const sourceText = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      const registry = (await orderSamples(ctx.row.id)).map(s => ({ code: s.sample_code, full_name: s.full_name, group1_term: s.group1_term, group2_term: s.group2_term, replicate_term: s.replicate_term, patient_term: s.patient_term, time_point_term: s.time_point_term }));
      const match = matchSamples(parseSciexTxt(sourceText).samples.filter(s => s.type === "Unknown").map(s => s.name), registry);
      if (match.unmatched.length) throw new Error(`Unknown injections that are not samples of ${ctx.row.code}: ${match.unmatched.join(", ")}`);
      const [latest] = await db(as.staff, `dataset?select=version&order_id=eq.${ctx.row.id}&order=version.desc&limit=1`);
      const version = (latest?.version ?? 0) + 1;
      const built = await buildFiles({ sourceText, sourceSha256: accepted.sha256, metadata: match.metadata, headerMode: match.headerMode, version, sciexOsVersion: accepted.sciex_os_version, processingMethod: accepted.processing_method });
      const paths = datasetPaths(ctx.row.client_id, ctx.row.code, { full: built.full.sha256, analysis: built.analysis.sha256, companion: built.companion.sha256 });
      await uploadThenRecord(as.staff, [
        { path: paths.full, bytes: built.full.bytes, contentType: XLSX }, { path: paths.analysis, bytes: built.analysis.bytes, contentType: XLSX },
        { path: paths.companion, bytes: built.companion.bytes, contentType: XLSX },
      ], () => rpc(as.staff, "build_dataset", {
        p_order_id: ctx.row.id, p_result_file_id: accepted.id, p_expected_version: version, p_storage_path: paths.full, p_sha256: built.full.sha256,
        p_analysis_sha256: built.analysis.sha256, p_analysis_size_bytes: built.analysis.sizeBytes, p_companion_sha256: built.companion.sha256, p_companion_size_bytes: built.companion.sizeBytes,
      }));
    },
    async sign_prepared(ctx) {
      await ensureSigners();
      const [dataset] = await liveDatasets(ctx.row.id);
      await rpc(as.staff, "sign_dataset", { p_dataset_id: dataset.id, p_role: "prepared", p_note: "Prepared from the synthetic export (demo)." });
    },
    async sign_approved(ctx) {
      await ensureSigners();
      const [dataset] = await liveDatasets(ctx.row.id);
      await rpc(as.approver, "sign_dataset", { p_dataset_id: dataset.id, p_role: "approved", p_note: "Approved for the showcase (demo)." });
    },
    async release(ctx) {
      await ensureSigners();
      const [dataset] = await liveDatasets(ctx.row.id);
      const paths = datasetPaths(dataset.client_id, ctx.row.code, { full: dataset.sha256, analysis: dataset.analysis_sha256, companion: dataset.companion_sha256 });
      await rpc(as.staff, "release_dataset", { p_dataset_id: dataset.id, p_companion_path: paths.companion });
    },
    async deliverable(ctx) {
      const [dataset] = (await liveDatasets(ctx.row.id)).filter(d => d.status === "released");
      const item = demoDeliverable(ctx.plan);
      const bytes = Buffer.from(item.text, "utf8");
      const digest = sha256(bytes);
      await uploadThenRecord(as.staff, [{ path: deliverablePath(ctx.row.client_id, ctx.row.code, digest, item.fileName), bytes, contentType: item.contentType }], () => rpc(as.staff, "add_deliverable", {
        p_order_id: ctx.row.id, p_dataset_id: dataset?.id ?? null, p_title: item.title, p_kind: item.kind, p_file_name: item.fileName,
        p_content_type: item.contentType, p_size_bytes: bytes.byteLength, p_sha256: digest, p_visible: true,
      }));
    },
  };

  const existing = await db(as.staff, `order?select=id,code,title,stage,review,archived_at,client_id&client_id=${list(Object.values(clientIds))}&order=order_number`);
  const results = [];
  let failed = 0;
  try {
    for (const plan of ORDERS) {
      const client = clientOf(plan);
      const ctx = { plan, client, clientId: clientIds[client.key], row: existing.find(row => matchesOrder(plan, clientIds[client.key], row)) ?? null };
      try {
        const todo = nextSteps(plan.point, await observe(ctx.row));
        for (const step of todo) await steps[step](ctx);
        [ctx.row] = await db(as.staff, `order?select=id,code,title,stage,review,archived_at,client_id&id=eq.${ctx.row.id}`);
        const label = plan.wanted ? `${POINTS[plan.point].label} (asked: ${plan.wanted}; ${plan.note})` : POINTS[plan.point].label;
        log(`${ctx.row.code} "${plan.title}": ${todo.length ? `${todo.join(" → ")} done` : "already there"}; stage ${ctx.row.stage}, review ${ctx.row.review} · ${label}`);
        results.push({ key: plan.key, code: ctx.row.code, title: plan.title, client: client.name, stage: ctx.row.stage, review: ctx.row.review });
      } catch (error) {
        failed++;
        console.error(`${PREFIX}: "${plan.title}" stopped: ${error.message}`);
        results.push({ key: plan.key, code: ctx.row?.code ?? null, title: plan.title, client: client.name, error: error.message });
      }
    }
  } finally {
    await closeSigners();
    save({ orders: results });
  }
  log(`${results.length - failed} of ${ORDERS.length} orders at their point${failed ? `; ${failed} stopped (see above), run again to resume` : ""}; order codes written to ${file}`);
  if (failed) process.exitCode = 1;
}

try {
  await preparePeople();
  await (reset ? resetDemo() : seedDemo());
} catch (error) {
  console.error(`${PREFIX}: ${error.message}`);
  process.exitCode = 1;
}
