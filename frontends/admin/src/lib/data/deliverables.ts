import "server-only";
import { createHash } from "node:crypto";
import { demoOrders } from "../demo";
import {
  clientMaySee, deliverablePath, downloadDecision, forClient, type CheckedUpload, type ClientDeliverable, type Deliverable, type DeliverableKind,
} from "../deliverables";
import { getEnvironment } from "../environment";
import { labRoleKey } from "../roles";
import { applyDemoState } from "../samples-demo";
import { DataError } from "../samples";
import { getAppSession, requireWorkspace } from "../session";
import { createAdminClient } from "../supabase/server";
import { readDemoDeliverables, readDemoState, writeDemoDeliverables, type DemoDeliverable } from "./demo-store";
import { uploadThenRecord } from "./upload-then-record";

// Deliverables (0021). Live mode works with the signed-in user's own token only: the lab writer uploads to admin-files
// and calls add_deliverable / set_deliverable_visibility / retire_deliverable; a client reads rows and objects that
// RLS and Storage's admin_files_client_deliverable_read let them read. Demo mode keeps the files of this browser in
// the demo store (memory), 5 MB each at most.
const BUCKET = "admin-files";
export const DEMO_MAX_BYTES = 5 * 1024 * 1024;
const DEMO_MAX_FILES = 40;
const live = () => !getEnvironment().mock;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function db() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client;
}

type Row = {
  id: string; order_id: string; client_id: string; dataset_id: string | null; title: string; kind: DeliverableKind; file_name: string; content_type: string;
  size_bytes: number | string; sha256: string; storage_path: string; visible_to_client: boolean; added_at: string; added_by: string | null;
  archived_at: string | null; archived_reason: string | null;
};
const rowSelect = "id, order_id, client_id, dataset_id, title, kind, file_name, content_type, size_bytes, sha256, storage_path, visible_to_client, added_at, added_by, archived_at, archived_reason";
const fromRow = (row: Row, orderCode: string, versions: Map<string, number>): Deliverable => ({
  id: row.id, orderCode, clientId: row.client_id, datasetVersion: row.dataset_id ? versions.get(row.dataset_id) ?? null : null, title: row.title, kind: row.kind,
  fileName: row.file_name, contentType: row.content_type, sizeBytes: Number(row.size_bytes), sha256: row.sha256, storagePath: row.storage_path,
  visibleToClient: row.visible_to_client, addedAt: row.added_at, addedBy: row.added_by, retiredAt: row.archived_at, retiredReason: row.archived_reason,
});

// The order a deliverable is added to: its id, client, whether it takes files, and its current released dataset.
type Target = { id: string; clientId: string; code: string; open: boolean; dataset: { id: string; version: number } | null; versions: Map<string, number> };
async function target(code: string): Promise<Target | null> {
  if (!live()) {
    const order = applyDemoState(demoOrders, await readDemoState()).find(item => item.code === code);
    if (!order) return null;
    const dataset = order.released && !order.retired && order.currentDatasetId ? { id: order.currentDatasetId, version: 1 } : null;
    return { id: order.code, clientId: order.clientId, code: order.code, open: (order.request?.status ?? "accepted") === "accepted", dataset, versions: new Map(dataset ? [[dataset.id, dataset.version]] : []) };
  }
  const { data, error } = await (await db()).schema("admin").from("order")
    .select("id, client_id, code, review, archived_at, dataset(id, version, status, archived_at)").eq("code", code).maybeSingle();
  if (error) throw new DataError(`The order could not be read: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as { id: string; client_id: string; code: string; review: string; archived_at: string | null; dataset: { id: string; version: number; status: string; archived_at: string | null }[] | null };
  const datasets = row.dataset ?? [];
  const current = datasets.find(item => item.status === "released" && !item.archived_at);
  return { id: row.id, clientId: row.client_id, code: row.code, open: !row.archived_at && row.review === "accepted",
    dataset: current ? { id: current.id, version: current.version } : null, versions: new Map(datasets.map(item => [item.id, item.version])) };
}

async function requireLabWriter() {
  const session = await requireWorkspace("staff");
  const role = labRoleKey(session.role);
  if (role !== "owner" && role !== "admin" && role !== "operator") throw new DataError("Only lab Owner, Admin or Operator may change deliverables.");
  return session;
}

// ---------------------------------------------------------------- reads

const withoutBytes = (item: DemoDeliverable): Deliverable => {
  const copy: Partial<DemoDeliverable> = { ...item };
  delete copy.data;
  return copy as Deliverable;
};

// The lab's list for an order: every deliverable, retired ones last.
export async function listOrderDeliverables(code: string): Promise<{ items: Deliverable[]; dataset: Target["dataset"]; open: boolean }> {
  await requireWorkspace("staff");
  const order = await target(code);
  if (!order) return { items: [], dataset: null, open: false };
  let items: Deliverable[];
  if (!live()) {
    items = ((await readDemoDeliverables()) ?? []).filter(item => item.orderCode === code).map(withoutBytes);
  } else {
    const { data, error } = await (await db()).schema("admin").from("deliverable").select(rowSelect).eq("order_id", order.id).order("added_at", { ascending: false });
    if (error) throw new DataError(`Deliverables could not be read: ${error.message}`);
    items = ((data ?? []) as unknown as Row[]).map(row => fromRow(row, code, order.versions));
  }
  items.sort((a, b) => Number(Boolean(a.retiredAt)) - Number(Boolean(b.retiredAt)) || b.addedAt.localeCompare(a.addedAt));
  return { items, dataset: order.dataset, open: order.open };
}

// A client's list for one of its orders: only live, visible deliverables (RLS in live mode, the same rule in demo).
export async function listClientDeliverables(code: string, clientIds: string[]): Promise<ClientDeliverable[]> {
  if (!clientIds.length) return [];
  if (!live()) {
    return ((await readDemoDeliverables()) ?? []).filter(item => item.orderCode === code && clientIds.includes(item.clientId) && clientMaySee(item))
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt)).map(forClient);
  }
  const client = (await db()).schema("admin");
  const order = await client.from("order").select("id").eq("code", code).in("client_id", clientIds).maybeSingle();
  if (order.error) throw new DataError(`The order could not be read: ${order.error.message}`);
  if (!order.data) return [];
  const { data, error } = await client.from("deliverable").select("id, title, kind, file_name, content_type, size_bytes, added_at")
    .eq("order_id", (order.data as { id: string }).id).order("added_at", { ascending: false });
  if (error) throw new DataError(`Your files could not be read: ${error.message}`);
  return ((data ?? []) as { id: string; title: string; kind: DeliverableKind; file_name: string; content_type: string; size_bytes: number | string; added_at: string }[])
    .map(row => ({ id: row.id, title: row.title, kind: row.kind, fileName: row.file_name, contentType: row.content_type, sizeBytes: Number(row.size_bytes), addedAt: row.added_at }));
}

// Client home's Datasets rows: how many files the client sees, by order code (the same read rule as above).
export async function countClientDeliverables(clientId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const add = (code: string) => counts.set(code, (counts.get(code) ?? 0) + 1);
  if (!live()) {
    for (const item of (await readDemoDeliverables()) ?? []) if (item.clientId === clientId && clientMaySee(item)) add(item.orderCode);
    return counts;
  }
  const client = (await db()).schema("admin");
  const { data, error } = await client.from("deliverable").select("order_id").eq("client_id", clientId);
  if (error) throw new DataError(`Your files could not be read: ${error.message}`);
  const orderIds = [...new Set(((data ?? []) as { order_id: string }[]).map(row => row.order_id))];
  if (!orderIds.length) return counts;
  const orders = await client.from("order").select("id, code").in("id", orderIds);
  if (orders.error) throw new DataError(`Your orders could not be read: ${orders.error.message}`);
  const codes = new Map(((orders.data ?? []) as { id: string; code: string }[]).map(row => [row.id, row.code]));
  for (const row of (data ?? []) as { order_id: string }[]) { const code = codes.get(row.order_id); if (code) add(code); }
  return counts;
}

// Client detail's Documents card (lab staff): the client's current deliverables across its orders, newest first; retired
// ones stay out. visibleToClient says whether the client can read each one yet.
export type ClientDocument = { id: string; orderCode: string; title: string; kind: DeliverableKind; visibleToClient: boolean; addedAt: string };
export async function listClientDocuments(clientId: string): Promise<ClientDocument[]> {
  await requireWorkspace("staff");
  if (!live()) {
    return ((await readDemoDeliverables()) ?? []).filter(item => item.clientId === clientId && !item.retiredAt)
      .map(item => ({ id: item.id, orderCode: item.orderCode, title: item.title, kind: item.kind, visibleToClient: item.visibleToClient, addedAt: item.addedAt }))
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }
  const { data, error } = await (await db()).schema("admin").from("deliverable").select("id, title, kind, visible_to_client, added_at, order:order(code)")
    .eq("client_id", clientId).is("archived_at", null).order("added_at", { ascending: false });
  if (error) throw new DataError(`Documents could not be read: ${error.message}`);
  type DocumentRow = { id: string; title: string; kind: DeliverableKind; visible_to_client: boolean; added_at: string; order: { code: string } | { code: string }[] | null };
  return ((data ?? []) as unknown as DocumentRow[]).map(row => {
    const order = Array.isArray(row.order) ? row.order[0] : row.order;
    return { id: row.id, orderCode: order?.code ?? "", title: row.title, kind: row.kind, visibleToClient: row.visible_to_client, addedAt: row.added_at };
  });
}

// ---------------------------------------------------------------- writes (lab writers)

export type AddResult = "added" | "added-visible" | "duplicate" | "closed" | "failed" | "not-found" | "demo-size";
export async function addDeliverable(code: string, file: CheckedUpload): Promise<AddResult> {
  const session = await requireLabWriter();
  const order = await target(code);
  if (!order) return "not-found";
  if (!order.open) return "closed";
  const digest = sha256(file.bytes);
  const path = deliverablePath(order.clientId, order.code, digest, file.fileName);
  const ok: AddResult = file.visible ? "added-visible" : "added";
  if (!live()) {
    if (file.bytes.byteLength > DEMO_MAX_BYTES) return "demo-size";
    const stored = (await readDemoDeliverables()) ?? [];
    if (stored.some(item => item.storagePath === path && !item.retiredAt)) return "duplicate";
    const item: DemoDeliverable = {
      id: crypto.randomUUID(), orderCode: order.code, clientId: order.clientId, datasetVersion: order.dataset?.version ?? null, title: file.title, kind: file.kind,
      fileName: file.fileName, contentType: file.contentType, sizeBytes: file.bytes.byteLength, sha256: digest, storagePath: path, visibleToClient: file.visible,
      addedAt: new Date().toISOString(), addedBy: session.displayName, retiredAt: null, retiredReason: null, data: Buffer.from(file.bytes).toString("base64"),
    };
    await writeDemoDeliverables([item, ...stored].slice(0, DEMO_MAX_FILES));
    return ok;
  }
  const client = await db();
  const bucket = client.storage.from(BUCKET);
  try {
    await uploadThenRecord([{ path }], async () => {
      const { error } = await bucket.upload(path, file.bytes, { contentType: file.contentType, upsert: false });
      if (!error) return true;
      if (!/already exists|duplicate/i.test(error.message)) throw new DataError("upload refused");
      // The same path holds these bytes only if its digest matches; anything else fails closed.
      const existing = await bucket.download(path);
      if (existing.error || !existing.data || sha256(new Uint8Array(await existing.data.arrayBuffer())) !== digest) throw new DataError("a different object holds this path");
      return false;
    }, paths => bucket.remove(paths), async () => {
      const { error } = await client.schema("admin").rpc("add_deliverable", {
        p_order_id: order.id, p_dataset_id: order.dataset?.id ?? null, p_title: file.title, p_kind: file.kind, p_file_name: file.fileName,
        p_content_type: file.contentType, p_size_bytes: file.bytes.byteLength, p_sha256: digest, p_visible: file.visible,
      });
      if (error) throw Object.assign(new DataError(error.message), { code: error.code });
    });
  } catch (error) {
    const sqlstate = (error as { code?: string }).code;
    if (sqlstate === "PT409") return "duplicate";
    if (sqlstate === "55000") return "closed";
    // Counts only: the message may name the client's folder.
    console.warn(`deliverables: add failed (${sqlstate ?? "storage"})`);
    return "failed";
  }
  return ok;
}

function refusal(error: { message: string; code?: string }): DataError {
  if (error.code === "PT409") return new DataError("Someone retired this file already. Reload the page.");
  return new DataError(error.message);
}

export async function setDeliverableVisibility(id: string, visible: boolean): Promise<void> {
  await requireLabWriter();
  if (live()) {
    const { error } = await (await db()).schema("admin").rpc("set_deliverable_visibility", { p_deliverable_id: id, p_visible: visible });
    if (error) throw refusal(error);
    return;
  }
  const stored = (await readDemoDeliverables()) ?? [];
  const item = stored.find(entry => entry.id === id);
  if (!item) throw new DataError("File not found.");
  if (item.retiredAt) throw new DataError("Someone retired this file already. Reload the page.");
  await writeDemoDeliverables(stored.map(entry => entry.id === id ? { ...entry, visibleToClient: visible } : entry));
}

export async function retireDeliverable(id: string, reason: string): Promise<void> {
  await requireLabWriter();
  const why = reason.trim();
  if (!why || why.length > 500) throw new DataError("Retiring a file needs a reason (500 characters at most).");
  if (live()) {
    const { error } = await (await db()).schema("admin").rpc("retire_deliverable", { p_deliverable_id: id, p_reason: why });
    if (error) throw refusal(error);
    return;
  }
  const stored = (await readDemoDeliverables()) ?? [];
  const item = stored.find(entry => entry.id === id);
  if (!item) throw new DataError("File not found.");
  if (item.retiredAt) throw new DataError("Someone retired this file already. Reload the page.");
  await writeDemoDeliverables(stored.map(entry => entry.id === id ? { ...entry, retiredAt: new Date().toISOString(), retiredReason: why } : entry));
}

// ---------------------------------------------------------------- download

// The file for the download route, after downloadDecision; null with the status to answer otherwise. Live mode reads
// the row and the object with the user's own token (RLS and Storage decide again) and serves only bytes whose size
// and sha256 are the recorded ones.
export async function deliverableDownload(id: string): Promise<{ item: Deliverable; bytes: Uint8Array } | { status: 401 | 403 | 404 | 502 }> {
  const session = await getAppSession();
  if (!session) return { status: 401 };
  if (!live()) {
    const item = ((await readDemoDeliverables()) ?? []).find(entry => entry.id === id) ?? null;
    const decision = downloadDecision(session, item);
    if (!decision.ok) return { status: decision.status };
    return { item: withoutBytes(item!), bytes: new Uint8Array(Buffer.from(item!.data, "base64")) };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return { status: 404 };
  const client = await db();
  const { data, error } = await client.schema("admin").from("deliverable").select(rowSelect).eq("id", id).maybeSingle();
  if (error) return { status: 502 };
  const item = data ? fromRow(data as unknown as Row, "", new Map()) : null;
  const decision = downloadDecision(session, item);
  if (!decision.ok) return { status: decision.status };
  const object = await client.storage.from(BUCKET).download(item!.storagePath);
  if (object.error || !object.data) return { status: 404 };
  const bytes = new Uint8Array(await object.data.arrayBuffer());
  if (bytes.byteLength !== item!.sizeBytes || sha256(bytes) !== item!.sha256) {
    console.warn("deliverables: a stored object does not match its recorded digest");
    return { status: 502 };
  }
  return { item: item!, bytes };
}
