import "server-only";
import { randomUUID } from "node:crypto";
import { demoClients, demoOrders } from "../demo";
import { getEnvironment } from "../environment";
import type { Order } from "../models";
import {
  exclusionsClosedProblem, markProblem, qcOpen, recordExclusion, recordExclusionWithdrawal, recordQcReviewed,
  type Exclusion, type QcDetail, type QcOrder, type QcSample,
} from "../qc-review";
import { allows, labRoleKey } from "../roles";
import { DataError, stageFromDb } from "../samples";
import { applyDemoState, demoOrderSamples, type DemoState } from "../samples-demo";
import { requireWorkspace } from "../session";
import { createAdminClient } from "../supabase/server";
import { readDemoState, writeDemoState } from "./demo-store";

export { DataError };

// QC review: orders at Processed or QC reviewed, their samples and the lab's exclusions, and the three 0027 writes.
// Live mode reads through the signed-in user's Supabase client (RLS applies) and writes through the admin functions;
// demo mode works on the browser's demo records. A plain `if (live)` each, like data/samples.ts.
const live = () => !getEnvironment().mock;

async function staff() {
  return requireWorkspace("staff");
}
async function writer() {
  const session = await staff();
  if (!allows("qc_review", labRoleKey(session.role))) throw new DataError("Lab Operator access is required to record QC decisions.");
  return session;
}

// ---------------------------------------------------------------- live

type DbError = { code?: string; message: string };
type Many<T> = T[] | null;
type ExclusionRow = { id: string; reason: string; decided_by: string | null; created_at: string; archived_at: string | null; archived_reason: string | null };
type SampleRow = { id: string; sample_code?: string; full_name?: string; sample_number?: number; archived_at: string | null; exclusion: Many<ExclusionRow> };
type ResultRow = { sha256: string; status: string; accepted_at: string | null; archived_at: string | null };
type OrderRow = {
  id: string; code: string; title: string | null; stage: string; client_id: string; client: { name: string } | { name: string }[] | null;
  sample: Many<SampleRow>; result_file: Many<ResultRow>;
};
const QC_STAGES = ["processed", "qc_checked"];
const listSelect = "id, code, title, stage, client_id, client:client(name), sample(id, archived_at, exclusion(id, archived_at)), result_file(sha256, status, accepted_at, archived_at)";
const detailSelect = "id, code, title, stage, client_id, client:client(name), sample(id, sample_code, full_name, sample_number, archived_at, exclusion(id, reason, decided_by, created_at, archived_at, archived_reason)), result_file(sha256, status, accepted_at, archived_at)";

async function admin() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}
// The functions' refusals name the database stage; the screen speaks in the pipeline's labels.
function refusal(error: DbError): DataError {
  if (error.code === "42501" || /permission denied|row-level security/i.test(error.message)) return new DataError("You do not have permission to do this.");
  const stage = /^(ORD\d{3,}) is at stage (\w+);/.exec(error.message);
  if (error.code === "55000" && stage) {
    const problem = /exclusions/.test(error.message) ? exclusionsClosedProblem(stage[1], stageFromDb(stage[2])) : markProblem(stage[1], stageFromDb(stage[2]));
    if (problem) return new DataError(`${problem} Reload the page to see the order as it is now.`);
  }
  return new DataError(error.message.charAt(0).toUpperCase() + error.message.slice(1) + (/[.;]$/.test(error.message) ? "" : "."));
}
const liveRows = <T,>(rows: Many<T>) => rows ?? [];
const liveSamples = (row: OrderRow) => liveRows(row.sample).filter(sample => !sample.archived_at);
const liveExclusion = (sample: SampleRow) => liveRows(sample.exclusion).find(item => !item.archived_at) ?? null;

function toOrder(row: OrderRow): QcOrder {
  const client = Array.isArray(row.client) ? row.client[0] : row.client;
  const file = liveRows(row.result_file).filter(item => item.status === "accepted" && !item.archived_at)
    .sort((a, b) => (b.accepted_at ?? "").localeCompare(a.accepted_at ?? ""))[0];
  const samples = liveSamples(row);
  return {
    id: row.id, code: row.code, clientId: row.client_id, clientName: client?.name ?? "Client", title: row.title ?? "", stage: stageFromDb(row.stage),
    resultFile: file ? { sha256: file.sha256, acceptedAt: file.accepted_at } : null,
    sampleCount: samples.length, exclusionCount: samples.filter(liveExclusion).length,
  };
}

async function liveNames(db: Awaited<ReturnType<typeof admin>>): Promise<Map<string, string>> {
  const { data, error } = await db.from("lab_staff").select("user_id, display_name");
  if (error) throw refusal(error);
  return new Map(((data ?? []) as unknown as { user_id: string; display_name: string | null }[]).map(row => [row.user_id, row.display_name?.trim() || "Lab staff"]));
}

async function liveList(): Promise<QcOrder[]> {
  const db = await admin();
  const { data, error } = await db.from("order").select(listSelect).in("stage", QC_STAGES).is("archived_at", null).order("order_number");
  if (error) throw refusal(error);
  return ((data ?? []) as unknown as OrderRow[]).map(toOrder);
}

async function liveDetail(code: string): Promise<QcDetail | null> {
  const db = await admin();
  const { data, error } = await db.from("order").select(detailSelect).eq("code", code).is("archived_at", null).maybeSingle();
  if (error) throw refusal(error);
  const row = data as unknown as OrderRow | null;
  if (!row) return null;
  const names = await liveNames(db);
  const name = (id: string | null) => id ? names.get(id) ?? "Lab staff" : null;
  const samples = liveSamples(row).sort((a, b) => (a.sample_number ?? 0) - (b.sample_number ?? 0)).map((sample): QcSample => {
    const found = liveExclusion(sample);
    const exclusion: Exclusion | null = found ? {
      id: found.id, sampleId: sample.id, sampleCode: sample.sample_code ?? "", reason: found.reason, decidedBy: name(found.decided_by), decidedAt: found.created_at, withdrawnAt: null, withdrawnReason: null,
    } : null;
    return { id: sample.id, code: sample.sample_code ?? "", fullName: sample.full_name ?? "", exclusion };
  });
  // Who marked it QC reviewed: the audit log (staff-only); a missing name is not a failure.
  let reviewed: QcDetail["reviewed"] = null;
  if (row.stage !== "processed") {
    try {
      const audit = await db.from("audit_event").select("created_at, actor").eq("entity", "order").eq("entity_id", row.id).eq("after->>stage", "qc_checked")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const event = audit.data as unknown as { created_at: string; actor: string | null } | null;
      if (event) reviewed = { at: event.created_at, by: name(event.actor) };
    } catch { /* see above */ }
  }
  return { order: toOrder(row), samples, reviewed };
}

async function liveRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const db = await admin();
  const { data, error } = await db.rpc(name, args);
  if (error) throw refusal(error);
  return data;
}

// ---------------------------------------------------------------- demo

const clientName = (id: string) => demoClients.find(client => client.id === id)?.name ?? "Client";
const liveDemoExclusions = (state: DemoState, code: string) => (state.exclusions ?? []).filter(item => item.orderCode === code && !item.withdrawnAt);

function demoOrder(order: Order, state: DemoState): QcOrder {
  const result = (state.results ?? []).filter(item => item.orderCode === order.code).at(-1);
  return {
    id: order.code, code: order.code, clientId: order.clientId, clientName: clientName(order.clientId), title: order.description, stage: order.stage,
    // An example order at Processed stands for an accepted example file whose digest the demo does not keep.
    resultFile: result ? { sha256: result.sha256, acceptedAt: result.acceptedAt } : { sha256: "", acceptedAt: null },
    sampleCount: demoOrderSamples(order, state).length, exclusionCount: liveDemoExclusions(state, order.code).length,
  };
}
async function demoFind(code: string) {
  const state = await readDemoState();
  const order = applyDemoState(demoOrders, state).find(item => item.code === code && !item.released);
  return { state, order };
}
async function demoWrite(code: string, write: (state: DemoState, order: Order, actor: string) => DemoState): Promise<void> {
  const session = await writer();
  const { state, order } = await demoFind(code);
  if (!order) throw new DataError(`Order ${code} was not found.`);
  await writeDemoState(write(state, order, session.displayName));
}

// ---------------------------------------------------------------- the seam

// Orders at Processed or QC reviewed (an accepted results file, no dataset built yet), by order number.
export async function listQcOrders(): Promise<QcOrder[]> {
  await staff();
  if (live()) return liveList();
  const state = await readDemoState();
  return applyDemoState(demoOrders, state).filter(order => qcOpen(order.stage) && !order.released).map(order => demoOrder(order, state))
    .sort((a, b) => a.code.localeCompare(b.code));
}

// One order with its live samples, each with its live exclusion, and who marked it QC reviewed; null when not found.
export async function getQcOrder(code: string): Promise<QcDetail | null> {
  await staff();
  if (live()) return liveDetail(code);
  const { state, order } = await demoFind(code);
  if (!order) return null;
  const exclusions = liveDemoExclusions(state, code);
  const samples = demoOrderSamples(order, state).map((sample): QcSample => ({
    id: sample.id, code: sample.code, fullName: sample.full_name, exclusion: exclusions.find(item => item.sampleId === sample.id) ?? null,
  }));
  const review = (state.qcReviews ?? []).find(item => item.orderCode === code);
  return { order: demoOrder(order, state), samples, reviewed: review ? { at: review.at, by: review.by } : null };
}

// admin.add_exclusion(p_sample_id, p_reason) returns uuid
export async function addExclusion(input: { orderCode: string; sampleId: string; reason: string }): Promise<void> {
  if (live()) {
    await writer();
    await liveRpc("add_exclusion", { p_sample_id: input.sampleId, p_reason: input.reason.trim() });
    return;
  }
  return demoWrite(input.orderCode, (state, order, actor) => {
    const sample = demoOrderSamples(order, state).find(item => item.id === input.sampleId);
    if (!sample) throw new DataError("That sample was not found. Reload the page.");
    return recordExclusion(state, { order, sample, reason: input.reason, actor, now: new Date(), id: randomUUID() });
  });
}

// admin.withdraw_exclusion(p_exclusion_id, p_reason)
export async function withdrawExclusion(input: { orderCode: string; exclusionId: string; reason: string }): Promise<void> {
  if (live()) {
    await writer();
    await liveRpc("withdraw_exclusion", { p_exclusion_id: input.exclusionId, p_reason: input.reason.trim() });
    return;
  }
  return demoWrite(input.orderCode, (state, order) => recordExclusionWithdrawal(state, { order, exclusionId: input.exclusionId, reason: input.reason, now: new Date() }));
}

// admin.mark_qc_checked(p_order_id)
export async function markQcReviewed(input: { orderCode: string; orderId: string }): Promise<void> {
  if (live()) {
    await writer();
    await liveRpc("mark_qc_checked", { p_order_id: input.orderId });
    return;
  }
  return demoWrite(input.orderCode, (state, order, actor) => recordQcReviewed(state, { order, actor, now: new Date() }));
}
