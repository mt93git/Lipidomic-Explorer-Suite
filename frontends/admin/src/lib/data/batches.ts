import "server-only";
import { createHash } from "node:crypto";
import { toBenchSheetCsv, toSequenceCsv } from "../batch";
import type { SaveInjection, StoredRules, BuilderSample } from "../batch-builder";
import { demoBuilderSamples, recordAcquired, recordBatch, recordExported, recordInjectionStatus, toBatchDetail } from "../batch-demo";
import { batchFileNames, type BatchDetail, type BatchFile, type BatchInjection, type BatchStatus, type BatchSummary } from "../batch-run";
import { demoClients, demoOrders, demoSession } from "../demo";
import { getEnvironment } from "../environment";
import { DataError } from "../samples";
import { applyDemoState } from "../samples-demo";
import { createAdminClient } from "../supabase/server";
import { readDemoState, writeDemoState } from "./demo-store";
import { notifyBatch } from "./notifications";
import { listClients, listPanels } from "./orders";

export { DataError };

// Batches: the registered samples a batch may take, the planned batches and their sequence files. Live mode reads
// admin.batch with its version and injections through the signed-in user's own client (RLS: lab staff see every
// batch) and writes only through admin.create_batch / mark_batch_exported / mark_batch_acquired (0016_batches.sql).
// Demo mode keeps this browser's batches in the demo store and lays them over the example orders.
const live = () => !getEnvironment().mock;

type One<T> = T | T[] | null;
const one = <T,>(value: One<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

async function admin() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}
function readFailure(what: string, error: { message: string }): Error {
  return new Error(`${what} could not be read: ${error.message}`);
}
// The database's refusal as a sentence ("sample X is already in a planned batch (B2026-001)" → "Sample X … ).").
function refusal(error: { message: string }): DataError {
  const text = error.message.trim();
  return new DataError(`${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? "" : "."}`);
}

// ---------------------------------------------------------------- reads

// Orders whose samples may be batched: Registered up to Acquired (the same range create_batch accepts).
const BATCHABLE = ["registered", "extracted", "in_batch", "sequence_exported", "acquired"];
type SampleRow = {
  id: string; sample_code: string; full_name: string; client_id: string;
  ord: One<{ code: string; stage: string; archived_at: string | null }>; aliquot: { id: string; archived_at: string | null }[] | null;
};
type PlannedRow = { aliquot_id: string; batch_version: One<{ archived_at: string | null; batch: One<{ status: string; archived_at: string | null }> }> };

// Registered samples that can go into a batch: not archived, order batchable, and not already in a planned batch.
export async function listBuilderSamples(): Promise<BuilderSample[]> {
  if (!live()) {
    const state = await readDemoState();
    return demoBuilderSamples(state, applyDemoState(demoOrders, state), demoClients);
  }
  const db = await admin();
  const [samples, planned, clients] = await Promise.all([
    db.from("sample").select("id, sample_code, full_name, client_id, ord:order(code, stage, archived_at), aliquot(id, archived_at)").is("archived_at", null).order("sample_code"),
    db.from("injection").select("aliquot_id, batch_version(archived_at, batch(status, archived_at))").is("archived_at", null).not("aliquot_id", "is", null),
    listClients(),
  ]);
  if (samples.error) throw readFailure("Samples", samples.error);
  if (planned.error) throw readFailure("Planned batches", planned.error);
  const busy = new Set(((planned.data ?? []) as unknown as PlannedRow[]).filter(row => {
    const version = one(row.batch_version);
    const batch = version && one(version.batch);
    return version && !version.archived_at && batch && !batch.archived_at && batch.status === "planned";
  }).map(row => row.aliquot_id));
  const names = new Map(clients.map(client => [client.id, client.name]));
  return ((samples.data ?? []) as unknown as SampleRow[]).flatMap(row => {
    const order = one(row.ord);
    if (!order || order.archived_at || !BATCHABLE.includes(order.stage)) return [];
    if ((row.aliquot ?? []).some(aliquot => !aliquot.archived_at && busy.has(aliquot.id))) return [];
    return [{ id: row.id, code: row.sample_code, fullName: row.full_name, orderCode: order.code, clientId: row.client_id, clientName: names.get(row.client_id) ?? "Client" }];
  });
}

type InjectionRow = {
  seq: number; sample_type: BatchInjection["sample_type"]; sample_name: string; client_id: string | null; aliquot_id: string | null;
  plate: string | null; vial: string | null; status: string; archived_at: string | null; client: One<{ name: string }>;
  aliquot: One<{ sample: One<{ sample_code: string; full_name: string; ord: One<{ code: string }> }> }>;
};
type VersionRow = {
  id: string; version: number; archived_at: string | null; exported_at: string | null; exported_by: string | null;
  sequence_sha256: string | null; rules: unknown; injection: InjectionRow[] | null;
};
type BatchRow = { id: string; name: string; status: BatchStatus; created_at: string; panel: One<{ name: string }>; batch_version: VersionRow[] | null };

const detailSelect = [
  "id, name, status, created_at", "panel:panel(name)",
  "batch_version(id, version, archived_at, exported_at, exported_by, sequence_sha256, rules",
  "injection(seq, sample_type, sample_name, client_id, aliquot_id, plate, vial, status, archived_at, client:client(name), aliquot:aliquot(sample:sample(sample_code, full_name, ord:order(code)))))",
].join(", "); // the commas matter: supabase-js strips whitespace from select

function toDetail(row: BatchRow, exportedBy: string | null): BatchDetail | null {
  const version = [...(row.batch_version ?? [])].filter(item => !item.archived_at).sort((a, b) => b.version - a.version)[0];
  if (!version) return null;
  const injections: BatchInjection[] = (version.injection ?? []).filter(item => !item.archived_at).sort((a, b) => a.seq - b.seq).map(item => {
    const sample = one(one(item.aliquot)?.sample ?? null);
    return {
      seq: item.seq, sample_type: item.sample_type, sample_name: item.sample_name, FullName: sample?.full_name.trim() ?? null, client_id: item.client_id, aliquot_id: item.aliquot_id,
      plate: item.plate ?? "", vial: item.vial ?? "", sampleCode: sample?.sample_code ?? null, orderCode: one(sample?.ord ?? null)?.code ?? null, status: item.status, clientName: one(item.client)?.name ?? null,
    };
  });
  return {
    id: row.id, name: row.name, status: row.status, panel: one(row.panel)?.name ?? "No panel", version: version.version, createdAt: row.created_at,
    exportedAt: version.exported_at, exportedBy, sequenceSha256: version.sequence_sha256, rules: version.rules, injections,
    orderCodes: [...new Set(injections.flatMap(item => item.orderCode ? [item.orderCode] : []))].sort(),
  };
}

// One batch with its current version and injections, or null when it does not exist or RLS hides it.
export async function getBatch(name: string): Promise<BatchDetail | null> {
  if (!live()) {
    const batch = ((await readDemoState()).batches ?? []).find(item => item.name === name);
    return batch ? toBatchDetail(batch) : null;
  }
  const db = await admin();
  const found = await db.from("batch").select(detailSelect).eq("name", name).is("archived_at", null).maybeSingle();
  if (found.error) throw readFailure("The batch", found.error);
  if (!found.data) return null;
  const row = found.data as unknown as BatchRow;
  const exporter = [...(row.batch_version ?? [])].filter(item => !item.archived_at).sort((a, b) => b.version - a.version)[0]?.exported_by;
  let exportedBy: string | null = null;
  if (exporter) {
    const person = await db.from("lab_staff").select("display_name").eq("user_id", exporter).maybeSingle();
    exportedBy = (person.data as { display_name: string | null } | null)?.display_name ?? "Lab staff";
  }
  return toDetail(row, exportedBy);
}

// Every batch the lab planned in Admin, newest first (batches imported with a results file have no sequence here).
export async function listBatches(): Promise<BatchSummary[]> {
  if (!live()) {
    return [...((await readDemoState()).batches ?? [])].reverse()
      .map(batch => ({ name: batch.name, status: batch.status, panel: batch.panel, createdAt: batch.createdAt, injectionCount: batch.injections.length }));
  }
  const { data, error } = await (await admin()).from("batch")
    .select("name, status, created_at, panel:panel(name), batch_version(version, archived_at, injection(count))")
    .eq("imported", false).is("archived_at", null).order("created_at", { ascending: false });
  if (error) throw readFailure("Batches", error);
  type Row = { name: string; status: BatchStatus; created_at: string; panel: One<{ name: string }>; batch_version: { version: number; archived_at: string | null; injection: { count: number }[] | null }[] | null };
  return ((data ?? []) as unknown as Row[]).map(row => {
    const version = [...(row.batch_version ?? [])].filter(item => !item.archived_at).sort((a, b) => b.version - a.version)[0];
    return { name: row.name, status: row.status, panel: one(row.panel)?.name ?? "No panel", createdAt: row.created_at, injectionCount: version?.injection?.[0]?.count ?? 0 };
  });
}

// ---------------------------------------------------------------- the files

// The CSV the lab downloads; the hash of the sequence file is what Mark exported records.
export function batchFileText(batch: BatchDetail, file: BatchFile): string {
  return file === "sequence" ? toSequenceCsv(batch.injections) : toBenchSheetCsv(batch.injections);
}
export const sha256Hex = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

export async function batchFile(name: string, file: BatchFile): Promise<{ filename: string; text: string } | null> {
  const batch = await getBatch(name);
  return batch ? { filename: batchFileNames[file](batch.name), text: batchFileText(batch, file) } : null;
}

// ---------------------------------------------------------------- writes

// admin.create_batch(p_name, p_panel_id, p_rules, p_injections) returns uuid; the name (B2026-033) is numbered by the
// database (p_name null) and read back.
export async function createBatch(input: { panelId: string; injections: SaveInjection[]; rules: StoredRules }): Promise<{ id: string; name: string }> {
  if (!live()) {
    const state = await readDemoState();
    const panel = (await listPanels()).find(item => item.id === input.panelId);
    if (!panel) throw new DataError("That panel was not found or is archived.");
    const { state: next, batch } = recordBatch(state, {
      panel: panel.name, injections: input.injections, rules: input.rules, orders: applyDemoState(demoOrders, state),
      actor: demoSession.displayName, now: new Date(), id: crypto.randomUUID(),
    });
    await writeDemoState(next);
    return { id: batch.id, name: batch.name };
  }
  const db = await admin();
  const { data, error } = await db.rpc("create_batch", { p_name: null, p_panel_id: input.panelId, p_rules: input.rules, p_injections: input.injections });
  if (error) throw refusal(error);
  const id = String(data);
  const created = await db.from("batch").select("name").eq("id", id).maybeSingle();
  if (created.error || !created.data) throw new DataError("The batch was saved, but its name could not be read. Find it under Batch run.");
  return { id, name: (created.data as { name: string }).name };
}

// admin.mark_batch_exported(p_batch_id, p_sequence_sha256, p_injections): the hash is computed here from the saved
// injections, the same bytes the download serves, so the recorded SHA-256 is the one of the file the lab took to the
// instrument. The rows hashed (the sequence file's columns) go along: the database locks the version and refuses (PT409)
// if its injections are not those any more, so a concurrent edit is never frozen under this hash.
export async function markBatchExported(name: string): Promise<void> {
  const batch = await getBatch(name);
  if (!batch) throw new DataError(`Batch ${name} was not found.`);
  const sha = sha256Hex(batchFileText(batch, "sequence"));
  if (!live()) {
    await writeDemoState(recordExported(await readDemoState(), name, sha, demoSession.displayName, new Date()));
    return;
  }
  const p_injections = batch.injections.map(({ seq, sample_type, sample_name, client_id, aliquot_id, plate, vial }) => ({ seq, sample_type, sample_name, client_id, aliquot_id, plate, vial }));
  const { error } = await (await admin()).rpc("mark_batch_exported", { p_batch_id: batch.id, p_sequence_sha256: sha, p_injections });
  if (error) throw refusal(error);
}

// admin.mark_batch_acquired(p_batch_id)
export async function markBatchAcquired(name: string): Promise<void> {
  const batch = await getBatch(name);
  if (!batch) throw new DataError(`Batch ${name} was not found.`);
  if (!live()) {
    await writeDemoState(recordAcquired(await readDemoState(), name, new Date()));
  } else {
    const { error } = await (await admin()).rpc("mark_batch_acquired", { p_batch_id: batch.id });
    if (error) throw refusal(error);
  }
  // Who is told is the Notifications matrix's row (0036): the lab once, each order's client for its own order.
  await notifyBatch("batch_acquired", name, batch.orderCodes);
}


// admin.record_injection_status(p_batch_id, p_rows) (0031): the run monitor's statuses, matched by injection name.
// Returns how many injections changed.
export async function recordInjectionStatuses(name: string, rows: { sample_name: string; status: string }[]): Promise<number> {
  const batch = await getBatch(name);
  if (!batch) throw new DataError(`Batch ${name} was not found.`);
  let changed: number;
  let exporter: string | null = null;
  if (!live()) {
    const result = recordInjectionStatus(await readDemoState(), name, rows);
    await writeDemoState(result.state);
    changed = result.changed;
    exporter = demoSession.userId;
  } else {
    const db = await admin();
    const { data, error } = await db.rpc("record_injection_status", { p_batch_id: batch.id, p_rows: rows });
    if (error) throw refusal(error);
    changed = Number(data ?? 0);
    const version = await db.from("batch_version").select("exported_by").eq("batch_id", batch.id).is("archived_at", null).order("version", { ascending: false }).limit(1).maybeSingle();
    exporter = (version.data as { exported_by: string | null } | null)?.exported_by ?? null;
  }
  // Injections recorded Failed turn the run's gate red (0036 "Gate failed"); the owner of the step is who exported
  // the sequence and ran the batch. Only injections that were not Failed before this call count, so pasting the same
  // status export again (with another row changed) does not announce an old failure twice.
  const wasFailed = new Set(batch.injections.filter(item => item.status.trim().toLowerCase() === "failed").map(item => item.sample_name));
  const failed = new Set(rows.filter(row => row.status.trim().toLowerCase() === "failed").map(row => row.sample_name.trim()).filter(name => !wasFailed.has(name)));
  if (changed > 0 && failed.size) {
    const perOrder = new Map<string, number>();
    for (const item of batch.injections) if (failed.has(item.sample_name) && item.orderCode) perOrder.set(item.orderCode, (perOrder.get(item.orderCode) ?? 0) + 1);
    const count = (n: number) => `${n} ${n === 1 ? "injection" : "injections"} recorded Failed`;
    // The lab reads the batch's total; each client only its own order's count, never other clients' or QC injections.
    await notifyBatch("gate_failed", name, [...perOrder.keys()].sort(), { gate: count(failed.size), orderGate: code => count(perOrder.get(code) ?? 0), stepOwner: exporter });
  }
  return changed;
}
