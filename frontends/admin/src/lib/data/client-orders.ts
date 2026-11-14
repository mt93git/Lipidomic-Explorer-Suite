import "server-only";
import type { ClientOrder, DbStage, Review } from "../client-portal";
import { demoOrders } from "../demo";
import { applyDemoState } from "../samples-demo";
import { readDemoState } from "./demo-store";
import { getEnvironment } from "../environment";
import type { Order } from "../models";
import { dbStages, DataError } from "../samples";
import { createAdminClient } from "../supabase/server";

// What the client portal reads. Live mode asks for a narrow column list through the signed-in user's own token, so
// RLS (can_read_client; datasets once released) decides the rows; no batch, result file, staff name or note is
// selected, and the notes only of a client's own request. These are reads the policies already allow (proposal, section 4). Archived orders stay hidden, except a
// request the lab declined (0019): the client reads it with the lab's reason (archived_reason).

type One<T> = T | T[] | null;
type DatasetRow = { id: string; version: number; status: string; released_at: string | null; archived_at: string | null; archived_reason: string | null };
export type ClientOrderRow = {
  code: string; title: string | null; stage: string; matrix: string | null; expected_samples: number | null; billing_ref: string | null;
  client_id: string; created_at: string; review?: string; reviewed_at?: string | null; archived_reason?: string | null; panel: One<{ name: string }>;
  requested_by?: string | null; notes?: string | null;
  sample: { archived_at: string | null }[] | null;
  shipment: { received_at: string | null; archived_at: string | null; receipt_confirmed_at?: string | null; receipt_note?: string | null; receipt_missing?: number | null; receipt_damaged?: number | null }[] | null;
  dataset: DatasetRow[] | null;
};

const select = [
  "code, title, stage, matrix, expected_samples, billing_ref, client_id, created_at, review, reviewed_at, archived_reason, requested_by, notes",
  "panel:panel(name)",
  "sample(archived_at)",
  "shipment(received_at, archived_at, receipt_confirmed_at, receipt_note, receipt_missing, receipt_damaged)",
  "dataset(id, version, status, released_at, archived_at, archived_reason)",
].join(", ");

const isStage = (value: string): value is DbStage => (dbStages as readonly string[]).includes(value);
const retiredStatus = (status: string): status is "withdrawn" | "superseded" => status === "withdrawn" || status === "superseded";

// A client's request (pending, declined, or accepted with an answer); an order the lab opened has no answer.
const isRequest = (row: Pick<ClientOrderRow, "review" | "reviewed_at">) => (row.review !== undefined && row.review !== "accepted") || Boolean(row.reviewed_at);

// names: client members' display names (0023) by user id, for "Requested by".
export function clientOrderFromRow(row: ClientOrderRow, names: Map<string, string> = new Map()): ClientOrder {
  if (!isStage(row.stage)) throw new DataError(`Order ${row.code} has an unknown stage.`);
  const received = (row.shipment ?? []).filter(item => !item.archived_at && item.received_at).map(item => item.received_at!).sort();
  // The newest confirmed receipt (0032): the lab's discrepancy note and counts, which the client is shown.
  const receipt = (row.shipment ?? []).filter(item => !item.archived_at && item.receipt_confirmed_at)
    .sort((a, b) => b.receipt_confirmed_at!.localeCompare(a.receipt_confirmed_at!))[0];
  const datasets = row.dataset ?? [];
  const current = datasets.find(item => item.status === "released" && !item.archived_at);
  const retired = datasets.filter(item => retiredStatus(item.status)).sort((a, b) => b.version - a.version)[0];
  const shown = current ?? (row.stage === "released" ? retired : undefined);
  const panel = Array.isArray(row.panel) ? row.panel[0] : row.panel;
  const review: Review = row.review === "pending" || row.review === "declined" ? row.review : "accepted";
  return {
    code: row.code, clientId: row.client_id, title: row.title ?? "", stage: row.stage, review,
    acceptedAt: review === "accepted" ? row.reviewed_at ?? row.created_at : null,
    declineReason: review === "declined" ? row.archived_reason ?? "" : null,
    panel: panel?.name ?? null, matrix: row.matrix, billingRef: row.billing_ref, expectedSamples: row.expected_samples,
    requestedBy: isRequest(row) ? (row.requested_by && names.get(row.requested_by)) || "A member of your client" : null,
    notes: isRequest(row) ? row.notes ?? null : null,
    registeredSamples: (row.sample ?? []).filter(item => !item.archived_at).length,
    requestedAt: row.created_at, receivedAt: received[0] ?? null,
    receipt: receipt ? { confirmedAt: receipt.receipt_confirmed_at!, note: receipt.receipt_note ?? null, missing: receipt.receipt_missing ?? 0, damaged: receipt.receipt_damaged ?? 0 } : null,
    release: shown ? {
      version: shown.version, releasedAt: shown.released_at, datasetId: current ? current.id : null,
      ...(!current && retiredStatus(shown.status) ? { retired: { status: shown.status, reason: shown.archived_reason ?? "", at: shown.archived_at ?? "" } } : {}),
    } : null,
  };
}

// Demo mode: the example orders (with this browser's recorded work laid over them), told the same way.
function fromDemo(order: Order): ClientOrder {
  const stage: DbStage = order.released ? "released" : dbStages[Math.min(order.stage, dbStages.length - 2)];
  const reached = order.stage >= 1 || order.released;
  const dates = [...order.history.map(event => event.date), ...(reached && order.received ? [order.received] : [])].sort();
  const request = order.request;
  const review: Review = request?.status ?? "accepted";
  const requestedAt = request?.requestedAt ?? dates[0] ?? "";
  return {
    code: order.code, clientId: order.clientId, title: order.description, stage, review,
    acceptedAt: review === "accepted" ? request?.reviewedAt ?? requestedAt : null,
    declineReason: review === "declined" ? request?.reason ?? "" : null,
    panel: request && order.panel === "No panel" ? null : order.panel, matrix: order.sampleType, billingRef: request?.billingRef ?? null, expectedSamples: order.sampleCount,
    requestedBy: request?.requestedBy ?? null, notes: request?.notes ?? null,
    registeredSamples: order.stage >= 2 || order.released ? order.sampleCount : 0,
    requestedAt, receivedAt: reached ? order.received || null : null,
    receipt: order.receipt ?? null,
    release: order.released ? {
      version: order.retired?.version ?? 1, releasedAt: order.releasedAt ?? null, datasetId: order.retired ? null : order.currentDatasetId ?? null,
      ...(order.retired ? { retired: { status: order.retired.status, reason: order.retired.reason, at: order.retired.at } } : {}),
    } : null,
  };
}

// listOrders (the lab's) leaves declined requests out, as archived; the client still reads them.
const demoOrdersWithDeclined = async () => applyDemoState(demoOrders, await readDemoState());
const liveOrDeclined = "archived_at.is.null,review.eq.declined";

async function db() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}

// The client's members' names (client_member.display_name, 0023), which every member of the client reads.
async function memberNames(clientId: string, userIds: string[]): Promise<Map<string, string>> {
  const { data, error } = await (await db()).from("client_member").select("user_id, display_name").eq("client_id", clientId).in("user_id", userIds);
  if (error) throw new Error(`The client's members could not be read: ${error.message}`);
  return new Map(((data ?? []) as { user_id: string; display_name: string | null }[]).filter(row => row.display_name).map(row => [row.user_id, row.display_name!]));
}

// The selected client's open orders, newest first.
export async function listClientOrders(clientId: string): Promise<ClientOrder[]> {
  if (getEnvironment().mock) {
    return (await demoOrdersWithDeclined()).filter(order => order.clientId === clientId).map(fromDemo).sort((a, b) => b.code.localeCompare(a.code));
  }
  const { data, error } = await (await db()).from("order").select(select)
    .eq("client_id", clientId).or(liveOrDeclined).order("order_number", { ascending: false });
  if (error) throw new Error(`Orders could not be read: ${error.message}`);
  return ((data ?? []) as unknown as ClientOrderRow[]).map(row => clientOrderFromRow(row));
}

// One order of one of these clients, or null (not found, archived, another client's, or hidden by RLS).
export async function getClientOrder(code: string, clientIds: string[]): Promise<ClientOrder | null> {
  if (!clientIds.length) return null;
  if (getEnvironment().mock) {
    const order = (await demoOrdersWithDeclined()).find(item => item.code === code && clientIds.includes(item.clientId));
    return order ? fromDemo(order) : null;
  }
  const { data, error } = await (await db()).from("order").select(select)
    .eq("code", code).in("client_id", clientIds).or(liveOrDeclined).maybeSingle();
  if (error) throw new Error(`The order could not be read: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as ClientOrderRow;
  return clientOrderFromRow(row, isRequest(row) && row.requested_by ? await memberNames(row.client_id, [row.requested_by]) : new Map());
}
