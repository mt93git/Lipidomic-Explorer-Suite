import "server-only";
import { uploadThenRecord as recordUploads } from "./upload-then-record";
import { randomUUID } from "node:crypto";
import { demoClients, demoOrders } from "../demo";
import { getEnvironment } from "../environment";
import { stages } from "../models";
import {
  datasetPaths, defaultPolicy, describeHeaders, isLabStaff, matchSamples, ownSamplesProblem,
  type DatasetStatus, type LabPerson, type LabRole, type ReleasePolicy, type RegistryEntry, type SignerRole,
} from "../release";
import { ANALYSIS_SHEETS, COMPANION_SHEETS, DATASET_SHEETS, buildDatasetFiles, digest, sourceTextOf, unknownSampleNames, type BuiltFile } from "../release-build";
import {
  demoLabStaff, demoPolicy, demoSourceText, recordBuild, recordRelease, recordSignature, recordSupersede, recordWithdrawal, setDemoPolicy, type DemoDataset,
} from "../release-demo";
import { exclusionsAt, type Exclusion, type RecordedExclusion } from "../qc-review";
import { DataError, stageFromDb } from "../samples";
import { applyDemoState, demoOrderSamples, type DemoState } from "../samples-demo";
import { requireWorkspace } from "../session";
import { createAdminClient } from "../supabase/server";
import { readDemoState, readDemoWorkbook, storeDemoWorkbook, writeDemoState } from "./demo-store";
import { notify } from "./notifications";

export { DataError };

// The release side of the data seam: build a dataset version, sign it, release it into Team's library, withdraw
// or supersede it, and the release policy. Live mode calls the admin functions through the signed-in user's
// Supabase client (RLS and the functions' own checks apply) and moves files with that same token; demo mode
// works on the browser's demo records. A plain `if (live)` each, like data/samples.ts.
const live = () => !getEnvironment().mock;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PROCESSED = 7;

// ---------------------------------------------------------------- what the screens read

export type VersionSummary = { id: string; version: number; status: DatasetStatus; signatures: number; releasedAt: string | null; projectId: string | null };
// releasedAt: when the order was released (a demo order may be released without a recorded version; live orders
// through their latest released version), so the list can tell a released order from a build candidate.
export type ReleaseOrder = { id: string; code: string; clientId: string; clientName: string; title: string; stage: number; resultFileId: string | null; acceptedAt: string | null; releasedAt: string | null; versions: VersionSummary[] };
export type DatasetFile = { label: string; sheets: string[]; sha256: string; sizeBytes: number; path: string | null };
export type SignatureRecord = { id: string; userId: string; name: string; role: SignerRole; note: string | null; signedAt: string };
export type DatasetRecord = {
  id: string; orderId: string; orderCode: string; orderTitle: string; clientId: string; clientName: string;
  version: number; status: DatasetStatus; builtAt: string; builtBy: string | null; releasedAt: string | null;
  projectId: string | null; projectName: string | null;
  full: DatasetFile; analysis: DatasetFile; companion: DatasetFile;
  provenance: { sourceSha256: string | null; sciexOsVersion: string | null; processingMethod: string | null; acceptedAt: string | null; headers: string | null };
  signatures: SignatureRecord[];
  // The QC review's exclusions in force when this version was built: recorded decisions, not removed from the data.
  exclusions: RecordedExclusion[];
  archivedAt: string | null; archivedReason: string | null;
  // How many samples and lipids the version holds (0037), recorded at build; null for a version built before that.
  samples?: number | null; lipids?: number | null;
};
// demoActors: the demo lab people a form may act as (null in live mode, where the signed-in user acts).
export type ReleaseView = { dataset: DatasetRecord; policy: ReleasePolicy; people: LabPerson[]; me: LabPerson | null; versions: VersionSummary[]; demoActors: LabPerson[] | null };
export type PolicyView = { policy: ReleasePolicy; staff: LabPerson[]; me: LabPerson | null; canEdit: boolean; demoActors: LabPerson[] | null };

const labels = { full: "Dataset v1 workbook", analysis: "Analysis file", companion: "Companion file" };
const projectName = (code: string, title: string | null) => `${code}${title?.trim() ? ` ${title.trim()}` : ""}`;

async function staffSession() {
  const session = await requireWorkspace("staff");
  return session;
}
function requireBuilder(role: string) {
  if (!["Owner", "Admin", "Operator"].includes(role)) throw new DataError("Lab Operator access is required to build a dataset.");
}

// ---------------------------------------------------------------- demo

const clientName = (id: string) => demoClients.find(client => client.id === id)?.name ?? "Client";
const pad3 = (n: number) => String(n).padStart(3, "0");

function demoActor(session: { userId: string; displayName: string }, actorId?: string): LabPerson {
  if (actorId) {
    const person = demoLabStaff.find(item => item.userId === actorId);
    if (!person) throw new DataError("Choose one of the demo lab people.");
    return person;
  }
  return demoLabStaff.find(item => item.userId === session.userId) ?? { userId: session.userId, name: session.displayName, role: "operator" };
}
const demoVersion = (dataset: DemoDataset): VersionSummary => ({ id: dataset.id, version: dataset.version, status: dataset.status, signatures: dataset.signatures.length, releasedAt: dataset.releasedAt, projectId: dataset.projectId });
function fromDemo(dataset: DemoDataset, state: DemoState): DatasetRecord {
  const order = applyDemoState(demoOrders, state).find(item => item.code === dataset.orderCode);
  const file = (key: "full" | "analysis" | "companion", path: string): DatasetFile => ({ label: labels[key], sheets: dataset[key].sheets, sha256: dataset[key].sha256, sizeBytes: dataset[key].sizeBytes, path });
  const paths = datasetPaths(dataset.clientId, dataset.orderCode, { full: dataset.full.sha256, analysis: dataset.analysis.sha256, companion: dataset.companion.sha256 });
  return {
    id: dataset.id, orderId: dataset.orderCode, orderCode: dataset.orderCode, orderTitle: order?.description ?? "", clientId: dataset.clientId, clientName: clientName(dataset.clientId),
    version: dataset.version, status: dataset.status, builtAt: dataset.builtAt, builtBy: dataset.builtBy, releasedAt: dataset.releasedAt, projectId: dataset.projectId, projectName: dataset.projectName,
    full: file("full", dataset.storagePath), analysis: file("analysis", paths.analysis), companion: file("companion", paths.companion),
    provenance: {
      sourceSha256: dataset.sourceSha256, sciexOsVersion: dataset.sciexOsVersion, processingMethod: dataset.processingMethod,
      acceptedAt: (state.results ?? []).filter(result => result.orderCode === dataset.orderCode).at(-1)?.acceptedAt ?? null,
      headers: describeHeaders(dataset.headerMode, dataset.matched, dataset.samples),
    },
    signatures: dataset.signatures.map(signature => ({ ...signature })),
    exclusions: exclusionsAt((state.exclusions ?? []).filter(item => item.orderCode === dataset.orderCode), dataset.builtAt),
    archivedAt: dataset.archivedAt, archivedReason: dataset.archivedReason,
    samples: dataset.samples ?? null, lipids: dataset.lipids ?? null,
  };
}
const byOrderAndVersion = (a: { orderCode: string; version: number }, b: { orderCode: string; version: number }) => a.orderCode.localeCompare(b.orderCode) || a.version - b.version;

async function demoDatasets() {
  const state = await readDemoState();
  return { state, datasets: [...(state.datasets ?? [])].sort(byOrderAndVersion) };
}
async function demoWrite<T>(action: (state: DemoState, actor: LabPerson) => { state: DemoState; result: T }, actorId: string | undefined): Promise<T> {
  const session = await staffSession();
  const state = await readDemoState();
  const { state: next, result } = action(state, demoActor(session, actorId));
  await writeDemoState(next);
  return result;
}

// ---------------------------------------------------------------- live

type DbError = { code?: string; message: string };
type OrderRow = { id: string; code: string; title: string | null; stage: string; client_id: string };
type ClientRow = { id: string; name: string };
type ResultFileRow = { id: string; order_id: string; status: string; sha256: string; storage_path: string; sciex_os_version: string | null; processing_method: string | null; accepted_at: string | null };
type SampleRow = { sample_code: string; full_name: string; group1_term: string | null; group2_term: string | null; replicate_term: string | null; patient_term: string | null; time_point_term: string | null };
type DatasetRow = {
  id: string; order_id: string; client_id: string; result_file_id: string | null; version: number; status: DatasetStatus; storage_path: string; sha256: string;
  analysis_sha256: string | null; analysis_size_bytes: number | string | null; companion_sha256: string | null; companion_size_bytes: number | string | null;
  project_id: string | null; companion_path: string | null; released_at: string | null; archived_at: string | null; archived_reason: string | null; created_at: string;
  sample_count?: number | null; lipid_count?: number | null;
};
type SignatureRow = { id: string; dataset_id: string; user_id: string; role: SignerRole; note: string | null; signed_at: string };
type ExclusionRow = { id: string; sample_id: string; reason: string; decided_by: string | null; created_at: string; archived_at: string | null; archived_reason: string | null;
  sample: { order_id: string; sample_code: string } | { order_id: string; sample_code: string }[] | null };
type StaffRow = { user_id: string; display_name: string | null; role: LabRole };
type PolicyRow = { eligible_signers: string[] | null; required_signatures: number; set_by: string | null; created_at: string };
const orderSelect = "id, code, title, stage, client_id";
const datasetSelect = "id, order_id, client_id, result_file_id, version, status, storage_path, sha256, analysis_sha256, analysis_size_bytes, companion_sha256, companion_size_bytes, project_id, companion_path, released_at, archived_at, archived_reason, created_at, sample_count, lipid_count";
const BUILD_STAGES = ["processed", "qc_checked", "excel_built", "released"];
const BUILD_ATTEMPTS = 3;
class StaleVersion extends Error {} // build_dataset's PT409: another build took the version; build again

async function client() {
  const supabase = await createAdminClient();
  if (!supabase) throw new DataError("Your session is not available. Sign in again.");
  return supabase;
}
// Postgres speaks in constraints; the functions' own refusals are already written for the operator.
function refusal(error: DbError): DataError {
  if (/permission denied|row-level security/i.test(error.message)) return new DataError("You do not have permission to do this.");
  return new DataError(error.message);
}
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await (await client()).schema("admin").rpc(name, args);
  if (error) throw refusal(error);
  return data;
}
const shortId = (id: string) => `${id.slice(0, 8)}…`;
const person = (row: StaffRow): LabPerson => ({ userId: row.user_id, name: row.display_name?.trim() || shortId(row.user_id), role: row.role });
const num = (value: number | string | null | undefined) => value === null || value === undefined ? 0 : Number(value);

async function liveStaff(db: ReturnType<Awaited<ReturnType<typeof client>>["schema"]>): Promise<LabPerson[]> {
  const { data, error } = await db.from("lab_staff").select("user_id, display_name, role").is("archived_at", null);
  if (error) throw refusal(error);
  return ((data ?? []) as unknown as StaffRow[]).map(person);
}
async function livePolicy(db: ReturnType<Awaited<ReturnType<typeof client>>["schema"]>): Promise<ReleasePolicy> {
  const { data, error } = await db.from("release_policy").select("eligible_signers, required_signatures, set_by, created_at").is("archived_at", null).maybeSingle();
  if (error) throw refusal(error);
  const row = data as unknown as PolicyRow | null;
  return row ? { eligibleSigners: row.eligible_signers ?? [], requiredSignatures: row.required_signatures, setBy: row.set_by, setAt: row.created_at } : defaultPolicy;
}
const liveMe = (session: { userId: string }, people: LabPerson[]) => people.find(item => item.userId === session.userId) ?? null;

// Dataset rows with what the screens show around them: order, client, results file, signatures, who built them.
async function liveRecords(db: ReturnType<Awaited<ReturnType<typeof client>>["schema"]>, rows: DatasetRow[], people: LabPerson[]): Promise<DatasetRecord[]> {
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const unique = (values: (string | null)[]) => Array.from(new Set(values.filter((value): value is string => !!value)));
  const [orders, clients, files, signatures, exclusions] = await Promise.all([
    db.from("order").select(orderSelect).in("id", unique(rows.map(row => row.order_id))),
    db.from("client").select("id, name").in("id", unique(rows.map(row => row.client_id))),
    db.from("result_file").select("id, order_id, status, sha256, storage_path, sciex_os_version, processing_method, accepted_at").in("id", unique(rows.map(row => row.result_file_id))),
    db.from("signature").select("id, dataset_id, user_id, role, note, signed_at").in("dataset_id", ids).is("archived_at", null).order("signed_at"),
    // The QC review's decisions on these clients' samples (withdrawn ones too: what was in force at each build counts).
    db.from("exclusion").select("id, sample_id, reason, decided_by, created_at, archived_at, archived_reason, sample:sample(order_id, sample_code)").in("client_id", unique(rows.map(row => row.client_id))),
  ]);
  for (const result of [orders, clients, files, signatures, exclusions]) if (result.error) throw refusal(result.error);
  const builders = new Map<string, string>();
  try {
    const audit = await db.from("audit_event").select("entity_id, actor").eq("entity", "dataset").eq("action", "INSERT").in("entity_id", ids);
    for (const event of (audit.data ?? []) as unknown as { entity_id: string; actor: string | null }[]) {
      const actor = event.actor ? people.find(item => item.userId === event.actor) : null;
      if (actor) builders.set(event.entity_id, actor.name);
    }
  } catch { /* the audit log is staff-only; a missing name is not a failure */ }
  const orderById = new Map(((orders.data ?? []) as unknown as OrderRow[]).map(row => [row.id, row]));
  const clientById = new Map(((clients.data ?? []) as unknown as ClientRow[]).map(row => [row.id, row]));
  const fileById = new Map(((files.data ?? []) as unknown as ResultFileRow[]).map(row => [row.id, row]));
  const signed = (signatures.data ?? []) as unknown as SignatureRow[];
  const decisions = ((exclusions.data ?? []) as unknown as ExclusionRow[]).flatMap(item => {
    const sample = Array.isArray(item.sample) ? item.sample[0] : item.sample;
    if (!sample) return [];
    const decided: Exclusion & { orderId: string } = {
      id: item.id, orderId: sample.order_id, sampleId: item.sample_id, sampleCode: sample.sample_code, reason: item.reason, decidedAt: item.created_at,
      decidedBy: item.decided_by ? people.find(person => person.userId === item.decided_by)?.name ?? shortId(item.decided_by) : null,
      withdrawnAt: item.archived_at, withdrawnReason: item.archived_reason,
    };
    return [decided];
  });
  return rows.map(row => {
    const order = orderById.get(row.order_id);
    const file = row.result_file_id ? fileById.get(row.result_file_id) : undefined;
    const fileOf = (key: "full" | "analysis" | "companion", sha256: string | null, size: number | string | null, path: string | null, sheets: readonly string[]): DatasetFile =>
      ({ label: labels[key], sheets: [...sheets], sha256: sha256 ?? "", sizeBytes: num(size), path });
    const paths = order ? filePaths(row, order.code) : null;
    return {
      id: row.id, orderId: row.order_id, orderCode: order?.code ?? shortId(row.order_id), orderTitle: order?.title ?? "", clientId: row.client_id, clientName: clientById.get(row.client_id)?.name ?? "Client",
      version: row.version, status: row.status, builtAt: row.created_at, builtBy: builders.get(row.id) ?? null, releasedAt: row.released_at, projectId: row.project_id,
      projectName: row.project_id && order ? projectName(order.code, order.title) : null,
      full: fileOf("full", row.sha256, null, row.storage_path, DATASET_SHEETS),
      analysis: fileOf("analysis", row.analysis_sha256, row.analysis_size_bytes, paths?.analysis ?? null, ANALYSIS_SHEETS),
      companion: fileOf("companion", row.companion_sha256, row.companion_size_bytes, row.companion_path ?? paths?.companion ?? null, COMPANION_SHEETS),
      provenance: { sourceSha256: file?.sha256 ?? null, sciexOsVersion: file?.sciex_os_version ?? null, processingMethod: file?.processing_method ?? null, acceptedAt: file?.accepted_at ?? null, headers: null },
      signatures: signed.filter(signature => signature.dataset_id === row.id).map(signature => ({
        id: signature.id, userId: signature.user_id, name: people.find(item => item.userId === signature.user_id)?.name ?? shortId(signature.user_id), role: signature.role, note: signature.note, signedAt: signature.signed_at,
      })),
      exclusions: exclusionsAt(decisions.filter(item => item.orderId === row.order_id), row.created_at),
      archivedAt: row.archived_at, archivedReason: row.archived_reason,
      samples: row.sample_count ?? null, lipids: row.lipid_count ?? null,
    };
  });
}
const liveVersion = (record: DatasetRecord): VersionSummary => ({ id: record.id, version: record.version, status: record.status, signatures: record.signatures.length, releasedAt: record.releasedAt, projectId: record.projectId });

// Where build_dataset's three files of a dataset row live (each under its own recorded digest).
const filePaths = (row: Pick<DatasetRow, "client_id" | "sha256" | "analysis_sha256" | "companion_sha256">, orderCode: string) =>
  datasetPaths(row.client_id, orderCode, { full: row.sha256, analysis: row.analysis_sha256 ?? "", companion: row.companion_sha256 ?? "" });

async function download(bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await (await client()).storage.from(bucket).download(path);
  if (error || !data) throw new DataError(`${path} could not be read from ${bucket}: ${error?.message ?? "no content"}.`);
  return Buffer.from(await data.arrayBuffer());
}
// Objects are never overwritten (upsert false; neither bucket has an UPDATE policy). When the path is taken, the
// existing object is read back and accepted only if it holds exactly these bytes (sha256 and size); anything
// else, an unreadable object included, fails closed. A digest in the path is a name, not proof of content.
// Returns true when this call wrote the object, false when an identical one was already there.
async function upload(bucket: string, path: string, bytes: Buffer): Promise<boolean> {
  const { error } = await (await client()).storage.from(bucket).upload(path, bytes, { contentType: XLSX, upsert: false });
  if (!error) return true;
  if (!/already exists|duplicate/i.test(error.message)) throw new DataError(`${bucket} refused ${path}: ${error.message}`);
  let existing: Buffer;
  try {
    existing = await download(bucket, path);
  } catch {
    throw new DataError(`${bucket} already holds ${path}, and it could not be read back to compare; nothing was recorded.`);
  }
  if (existing.byteLength !== bytes.byteLength || digest(existing) !== digest(bytes)) {
    throw new DataError(`${bucket} already holds ${path} with other bytes (sha256 ${digest(existing).slice(0, 12)}…, ${existing.byteLength} bytes); nothing was recorded.`);
  }
  return false;
}
// Uploads the files, then calls the function that records them. If an upload or the call fails, the objects this
// call wrote (not ones that were already there) are removed with the same token, best effort, and the original
// error is thrown. 0012 lets that token remove only what no admin row records (admin-files) or a still pending
// analysis file (case-files), so a call that did commit despite the error keeps its files.
async function uploadThenRecord<T>(bucket: string, files: { path: string; bytes: Buffer }[], record: () => Promise<T>): Promise<T> {
  return recordUploads(files, file => upload(bucket, file.path, file.bytes), paths => removeQuietly(bucket, paths), record);
}
async function removeQuietly(bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  let problem: string;
  try {
    const { data, error } = await (await client()).storage.from(bucket).remove(paths);
    if (!error && (data?.length ?? 0) === paths.length) return;
    problem = error ? "storage refused" : `${data?.length ?? 0} removed`;
  } catch {
    problem = "request failed";
  }
  // Counts only: the paths name clients and orders, and the server log is not the place for them.
  console.warn(`release: could not remove ${paths.length} uploaded objects from ${bucket} after a failed call (${problem})`);
}

// ---------------------------------------------------------------- the seam

// Orders with an accepted results file (Processed or later, released ones too, for a new version), each with its versions.
export async function listReleaseOrders(): Promise<ReleaseOrder[]> {
  await staffSession();
  if (!live()) {
    const { state, datasets } = await demoDatasets();
    return applyDemoState(demoOrders, state).filter(order => order.stage >= PROCESSED).map(order => ({
      id: order.code, code: order.code, clientId: order.clientId, clientName: clientName(order.clientId), title: order.description, stage: order.stage,
      resultFileId: order.code, acceptedAt: (state.results ?? []).filter(result => result.orderCode === order.code).at(-1)?.acceptedAt ?? null,
      releasedAt: order.releasedAt ?? null,
      versions: datasets.filter(dataset => dataset.orderCode === order.code).map(demoVersion),
    }));
  }
  const db = (await client()).schema("admin");
  const orders = await db.from("order").select(orderSelect).in("stage", BUILD_STAGES).is("archived_at", null).order("order_number");
  if (orders.error) throw refusal(orders.error);
  const rows = (orders.data ?? []) as unknown as OrderRow[];
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const [clients, files, datasets, people] = await Promise.all([
    db.from("client").select("id, name").in("id", Array.from(new Set(rows.map(row => row.client_id)))),
    db.from("result_file").select("id, order_id, status, sha256, storage_path, sciex_os_version, processing_method, accepted_at").in("order_id", ids).eq("status", "accepted").is("archived_at", null).order("accepted_at", { ascending: false }),
    db.from("dataset").select(datasetSelect).in("order_id", ids).order("version"),
    liveStaff(db),
  ]);
  for (const result of [clients, files, datasets]) if (result.error) throw refusal(result.error);
  const records = await liveRecords(db, (datasets.data ?? []) as unknown as DatasetRow[], people);
  const clientById = new Map(((clients.data ?? []) as unknown as ClientRow[]).map(row => [row.id, row.name]));
  const fileRows = (files.data ?? []) as unknown as ResultFileRow[];
  return rows.map(row => {
    const file = fileRows.find(item => item.order_id === row.id) ?? null;
    return {
      id: row.id, code: row.code, clientId: row.client_id, clientName: clientById.get(row.client_id) ?? "Client", title: row.title ?? "", stage: stageFromDb(row.stage),
      resultFileId: file?.id ?? null, acceptedAt: file?.accepted_at ?? null,
      releasedAt: records.filter(record => record.orderId === row.id && record.status === "released").at(-1)?.releasedAt ?? null,
      versions: records.filter(record => record.orderId === row.id).map(liveVersion),
    };
  }).filter(order => order.resultFileId || order.versions.length);
}

// build_dataset: the server builds the dataset v1 workbook from the accepted TXT, splits it, stores each of the
// three files in admin-files under <client_id>/<order_code>/datasets/<its sha256>/ and records the manifest.
// Only this order's registered samples may be in the TXT; the version in the files is the one the database records.
export async function buildDataset(input: { orderId: string; actorId?: string }): Promise<{ datasetId: string; version: number }> {
  const session = await staffSession();
  requireBuilder(session.role);
  if (!live()) {
    const state = await readDemoState();
    const order = applyDemoState(demoOrders, state).find(item => item.code === input.orderId);
    if (!order) throw new DataError(`Order ${input.orderId} was not found.`);
    if (order.stage < PROCESSED) throw new DataError(`${order.code} is ${stages[order.stage]}; accept its results file before building a dataset.`);
    // An example order nobody registered in this browser stands for its example registry (Sample_001, ...).
    const registry: RegistryEntry[] = demoOrderSamples(order, state);
    const batch = order.batch ?? `B2026-0${order.code.slice(-2)}`;
    const names = registry.map((sample, i) => `${batch}_${pad3(i + 1)}_${sample.code}`);
    const sourceText = demoSourceText(order.code, names);
    const match = matchSamples(names, registry);
    const foreign = ownSamplesProblem(order.code, match);
    if (foreign) throw new DataError(foreign);
    const version = (state.datasets ?? []).filter(dataset => dataset.orderCode === order.code).reduce((max, dataset) => Math.max(max, dataset.version), 0) + 1;
    const sciexOsVersion = "3.4.5 (example)";
    const processingMethod = "Example processing method";
    const built = await buildDatasetFiles({ sourceText, metadata: match.metadata, headerMode: match.headerMode, datasetVersion: String(version), sciexOsVersion, processingMethod });
    const strip = (file: BuiltFile) => ({ sha256: file.sha256, sizeBytes: file.sizeBytes, sheets: file.sheets });
    const result = recordBuild(state, {
      order, actor: demoActor(session, input.actorId), now: new Date(), id: randomUUID(),
      files: { full: strip(built.full), analysis: strip(built.analysis), companion: strip(built.companion) },
      sourceSha256: (state.results ?? []).filter(item => item.orderCode === order.code).at(-1)?.sha256 ?? digest(Buffer.from(sourceText, "utf8")),
      headerMode: match.headerMode, matched: match.matched, samples: built.counts.samples, lipids: built.counts.lipids, sciexOsVersion, processingMethod,
    });
    storeDemoWorkbook(built.full.sha256, built.full.bytes);
    await writeDemoState(result.state);
    return { datasetId: result.dataset.id, version: result.dataset.version };
  }
  const db = (await client()).schema("admin");
  const order = await db.from("order").select(orderSelect).eq("id", input.orderId).is("archived_at", null).maybeSingle();
  if (order.error) throw refusal(order.error);
  const row = order.data as unknown as OrderRow | null;
  if (!row) throw new DataError("That order was not found.");
  const file = await db.from("result_file").select("id, order_id, status, sha256, storage_path, sciex_os_version, processing_method, accepted_at")
    .eq("order_id", row.id).eq("status", "accepted").is("archived_at", null).order("accepted_at", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (file.error) throw refusal(file.error);
  const accepted = file.data as unknown as ResultFileRow | null;
  if (!accepted) throw new DataError(`${row.code} has no accepted results file yet. Accept one in Ingest results first.`);
  const samples = await db.from("sample").select("sample_code, full_name, group1_term, group2_term, replicate_term, patient_term, time_point_term").eq("order_id", row.id).is("archived_at", null).order("sample_number");
  if (samples.error) throw refusal(samples.error);
  const bytes = await download("admin-files", accepted.storage_path);
  if (digest(bytes) !== accepted.sha256) throw new DataError("The stored results file does not match the digest recorded when it was accepted; nothing was built.");
  const sourceText = sourceTextOf(bytes);
  const registry: RegistryEntry[] = ((samples.data ?? []) as unknown as SampleRow[]).map(sample => ({ code: sample.sample_code, full_name: sample.full_name, group1_term: sample.group1_term, group2_term: sample.group2_term, replicate_term: sample.replicate_term, patient_term: sample.patient_term, time_point_term: sample.time_point_term }));
  const match = matchSamples(unknownSampleNames(sourceText), registry);
  const foreign = ownSamplesProblem(row.code, match);
  if (foreign) throw new DataError(foreign);

  // The version is written into the files, so it is fixed before they are built: build_dataset refuses the files
  // under the order lock (PT409) when another build took that version meanwhile, and they are built again.
  for (let attempt = 1; ; attempt++) {
    const latest = await db.from("dataset").select("version").eq("order_id", row.id).order("version", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) throw refusal(latest.error);
    const version = num((latest.data as unknown as { version: number } | null)?.version) + 1;
    const built = await buildDatasetFiles({
      sourceText, sourceSha256: accepted.sha256, metadata: match.metadata, headerMode: match.headerMode, datasetVersion: String(version),
      sciexOsVersion: accepted.sciex_os_version, processingMethod: accepted.processing_method,
    });
    const paths = datasetPaths(row.client_id, row.code, { full: built.full.sha256, analysis: built.analysis.sha256, companion: built.companion.sha256 });
    // If build_dataset fails (a stale version included), this attempt's own uploads are removed again (0012).
    const datasetId = await uploadThenRecord("admin-files", [
      { path: paths.full, bytes: built.full.bytes }, { path: paths.analysis, bytes: built.analysis.bytes }, { path: paths.companion, bytes: built.companion.bytes },
    ], async () => {
      const { data, error } = await db.rpc("build_dataset", {
        p_order_id: row.id, p_result_file_id: accepted.id, p_expected_version: version, p_storage_path: paths.full, p_sha256: built.full.sha256,
        p_analysis_sha256: built.analysis.sha256, p_analysis_size_bytes: built.analysis.sizeBytes,
        p_companion_sha256: built.companion.sha256, p_companion_size_bytes: built.companion.sizeBytes,
      });
      if (!error) return String(data);
      throw error.code === "PT409" ? new StaleVersion() : refusal(error);
    }).catch((error: unknown) => {
      if (error instanceof StaleVersion) return null;
      throw error;
    });
    if (datasetId !== null) {
      // 0037: how many samples and lipids this version holds, for the Datasets list. The build stands if this fails.
      try { await db.rpc("record_dataset_counts", { p_dataset_id: datasetId, p_samples: built.counts.samples, p_lipids: built.counts.lipids }); } catch { /* the list shows a dash */ }
      return { datasetId, version };
    }
    if (attempt >= BUILD_ATTEMPTS) throw new DataError(`Other builds of ${row.code} kept taking the next version; nothing was recorded. Try again.`);
  }
}

export async function getDataset(id: string): Promise<ReleaseView | null> {
  const session = await staffSession();
  if (!live()) {
    const { state, datasets } = await demoDatasets();
    const dataset = datasets.find(item => item.id === id);
    if (!dataset) return null;
    return {
      dataset: fromDemo(dataset, state), policy: demoPolicy(state), people: demoLabStaff, me: demoActor(session),
      versions: datasets.filter(item => item.orderCode === dataset.orderCode).map(demoVersion), demoActors: demoLabStaff,
    };
  }
  const db = (await client()).schema("admin");
  const row = await db.from("dataset").select(datasetSelect).eq("id", id).maybeSingle();
  if (row.error) throw refusal(row.error);
  if (!row.data) return null;
  const dataset = row.data as unknown as DatasetRow;
  const [people, policy, siblings] = await Promise.all([liveStaff(db), livePolicy(db), db.from("dataset").select(datasetSelect).eq("order_id", dataset.order_id).order("version")]);
  if (siblings.error) throw refusal(siblings.error);
  const records = await liveRecords(db, (siblings.data ?? []) as unknown as DatasetRow[], people);
  const record = records.find(item => item.id === id) ?? (await liveRecords(db, [dataset], people))[0];
  return { dataset: record, policy, people, me: liveMe(session, people), versions: records.map(liveVersion), demoActors: null };
}

// The stored dataset workbook of a version, exactly its bytes, for the release page's preview and Download Excel.
// Read only, and only when the bytes still match the SHA-256 recorded at the build; anything else fails closed.
export async function readDatasetWorkbook(dataset: Pick<DatasetRecord, "orderCode" | "version" | "full">): Promise<{ bytes: Buffer; fileName: string }> {
  await staffSession();
  const fileName = `${dataset.orderCode}_dataset_v${dataset.version}.xlsx`;
  if (!live()) {
    const bytes = readDemoWorkbook(dataset.full.sha256);
    if (!bytes) throw new DataError("The example workbook of this version is not available any more (the demo server restarted). Build a new version to preview it.");
    return { bytes: Buffer.from(bytes), fileName };
  }
  if (!dataset.full.path) throw new DataError("This version has no stored workbook on record.");
  const bytes = await download("admin-files", dataset.full.path);
  if (digest(bytes) !== dataset.full.sha256) throw new DataError("The stored workbook does not match the digest recorded when this version was built; it is not shown.");
  return { bytes, fileName };
}

// Every dataset version the signed-in person may see, by order and version.
export async function listDatasets(): Promise<DatasetRecord[]> {
  await staffSession();
  if (!live()) {
    const { state, datasets } = await demoDatasets();
    return datasets.map(dataset => fromDemo(dataset, state));
  }
  const db = (await client()).schema("admin");
  // Versions of archived orders stay out of the list, like the orders themselves (an inner embed filters the rows).
  const [rows, people] = await Promise.all([db.from("dataset").select(`${datasetSelect}, order!inner(archived_at)`).is("order.archived_at", null)
    .order("created_at", { ascending: false }), liveStaff(db)]);
  if (rows.error) throw refusal(rows.error);
  return (await liveRecords(db, (rows.data ?? []) as unknown as DatasetRow[], people)).sort(byOrderAndVersion);
}

// admin.sign_dataset(p_dataset_id, p_role, p_note) returns uuid
export async function signDataset(input: { datasetId: string; role: SignerRole; note: string | null; actorId?: string }): Promise<void> {
  const note = input.note?.trim() || null;
  if (!live()) return demoWrite((state, actor) => ({ state: recordSignature(state, { datasetId: input.datasetId, actor, role: input.role, note, now: new Date(), id: randomUUID() }), result: undefined }), input.actorId);
  await staffSession();
  await rpc("sign_dataset", { p_dataset_id: input.datasetId, p_role: input.role, p_note: note });
}
// admin.release_dataset(p_dataset_id, p_companion_path) (0030): the signed version becomes released. Nexo opens
// it from Admin's own record and admin-files; Team is retired, so nothing is copied anywhere.
export async function releaseDataset(input: { datasetId: string; actorId?: string }): Promise<void> {
  if (!live()) {
    const dataset = await demoWrite((state, actor) => ({
      state: recordRelease(state, { datasetId: input.datasetId, actor, now: new Date() }),
      result: (state.datasets ?? []).find(item => item.id === input.datasetId),
    }), input.actorId);
    if (dataset) {
      const { id, orderCode, version, clientId } = dataset;
      await notify({ kind: "dataset_released", datasetId: id, orderId: orderCode, code: orderCode, version, clientId, clientName: demoClients.find(client => client.id === clientId)?.name ?? "your client" });
    }
    return;
  }
  await staffSession();
  const db = (await client()).schema("admin");
  const row = await db.from("dataset").select(datasetSelect).eq("id", input.datasetId).maybeSingle();
  if (row.error) throw refusal(row.error);
  const dataset = row.data as unknown as DatasetRow | null;
  if (!dataset) throw new DataError("That dataset was not found.");
  if (dataset.status !== "built") throw new DataError(`Dataset v${dataset.version} is already ${dataset.status}.`);
  const order = await db.from("order").select(orderSelect).eq("id", dataset.order_id).maybeSingle();
  if (order.error) throw refusal(order.error);
  const code = (order.data as unknown as OrderRow | null)?.code;
  if (!code) throw new DataError("The order of this dataset was not found.");
  await rpc("release_dataset", { p_dataset_id: dataset.id, p_companion_path: filePaths(dataset, code).companion });
  // Every active member of the client is told (0028), after the response.
  const owner = await db.from("client").select("name").eq("id", dataset.client_id).maybeSingle();
  await notify({
    kind: "dataset_released", datasetId: dataset.id, orderId: dataset.order_id, code, version: dataset.version, clientId: dataset.client_id,
    clientName: (owner.data as { name: string } | null)?.name ?? "your client",
  });
}

// admin.withdraw_dataset(p_dataset_id, p_reason)
export async function withdrawDataset(input: { datasetId: string; reason: string; actorId?: string }): Promise<void> {
  if (!live()) return demoWrite((state, actor) => ({ state: recordWithdrawal(state, { datasetId: input.datasetId, actor, reason: input.reason, now: new Date() }), result: undefined }), input.actorId);
  await staffSession();
  await rpc("withdraw_dataset", { p_dataset_id: input.datasetId, p_reason: input.reason.trim() });
}

// admin.supersede_dataset(p_dataset_id, p_new_dataset_id)
export async function supersedeDataset(input: { datasetId: string; newDatasetId: string; actorId?: string }): Promise<void> {
  if (!live()) return demoWrite((state, actor) => ({ state: recordSupersede(state, { datasetId: input.datasetId, newDatasetId: input.newDatasetId, actor, now: new Date() }), result: undefined }), input.actorId);
  await staffSession();
  await rpc("supersede_dataset", { p_dataset_id: input.datasetId, p_new_dataset_id: input.newDatasetId });
}

export async function getReleasePolicy(): Promise<PolicyView> {
  const session = await staffSession();
  if (!live()) {
    const state = await readDemoState();
    return { policy: demoPolicy(state), staff: demoLabStaff.filter(isLabStaff), me: demoActor(session), canEdit: true, demoActors: demoLabStaff };
  }
  const db = (await client()).schema("admin");
  const [people, policy] = await Promise.all([liveStaff(db), livePolicy(db)]);
  const me = liveMe(session, people);
  return { policy, staff: people.filter(isLabStaff), me, canEdit: me?.role === "owner", demoActors: null };
}

// admin.set_release_policy(p_eligible_signers, p_required_signatures)
export async function setReleasePolicy(input: { eligibleSigners: string[]; requiredSignatures: number; actorId?: string }): Promise<void> {
  if (!live()) return demoWrite((state, actor) => ({ state: setDemoPolicy(state, { eligibleSigners: input.eligibleSigners, requiredSignatures: input.requiredSignatures, actor, now: new Date() }), result: undefined }), input.actorId);
  await staffSession();
  await rpc("set_release_policy", { p_eligible_signers: input.eligibleSigners, p_required_signatures: input.requiredSignatures });
}
