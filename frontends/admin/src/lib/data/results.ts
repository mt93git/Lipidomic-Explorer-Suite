import "server-only";
import { uploadThenRecord } from "./upload-then-record";
import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { requireWorkspace } from "@/lib/session";
import { getEnvironment } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/server";
import { demoOrders, demoSession } from "@/lib/demo";
import { appCookieScope } from "@/lib/auth-cookies";
import { summarizeResults, canAcceptResults, type NameEntry, type ResultsSummary } from "@/lib/results";
import { applyDemoState, recordResultFile } from "@/lib/samples-demo";
import { readDemoState, writeDemoState } from "./demo-store";

export type ResultOrder = { id: string; code: string; client_id: string; stage: string };
type Review = { id: string; order: ResultOrder; bytes: Uint8Array; sha256: string; summary: ResultsSummary; sciexOsVersion: string; processingMethod: string; accepted?: boolean; accepting?: boolean };
// Per browser and user: the dictionary (demo) and the file under review. Order progress is not kept here: in
// demo mode it lives in the shared demo store (receive, registry, pipeline and results read the same record).
type State = { userId: string; entries: NameEntry[]; review?: Review; touched: number };
const globalState = globalThis as typeof globalThis & { adminResults?: Map<string, State> };
const states = globalState.adminResults ??= new Map<string, State>();
async function context(write = false) {
  const session = await requireWorkspace("staff");
  if (!["Owner", "Admin", "Operator"].includes(session.role)) throw new Error("Lab Operator access is required.");
  const store = await cookies();
  let key = store.get("le-admin-results")?.value;
  if (!key && write) {
    key = randomUUID();
    store.set("le-admin-results", key, appCookieScope);
  }
  for (const [id, value] of states) if (Date.now() - value.touched > 60 * 60 * 1000) states.delete(id);
  let state = key ? states.get(key) : undefined;
  if (!state || state.userId !== session.userId) {
    state = { userId: session.userId, entries: [], touched: Date.now() };
    if (key) states.set(key, state);
  }
  state.touched = Date.now();
  return state;
}
export async function listResultOrders(): Promise<ResultOrder[]> {
  await context();
  if (getEnvironment().mock) return applyDemoState(demoOrders, await readDemoState())
    .filter(order => !order.released && (order.stage === 2 || order.stage === 6))
    .map(order => ({ id: order.code, code: order.code, client_id: order.clientId, stage: order.stage === 2 ? "registered" : "acquired" }));
  const client = (await createAdminClient())!;
  const { data, error } = await client.schema("admin").from("order").select("id, code, client_id, stage").in("stage", ["acquired", "registered"]).is("archived_at", null);
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function parseResultFile(form: FormData) {
  const state = await context(true);
  const order = (await listResultOrders()).find(item => item.id === form.get("orderId"));
  if (!order) throw new Error("Choose an acquired or registered order.");
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".txt") || !file.size || file.size > 5_000_000) throw new Error("Choose a nonempty SCIEX OS TXT up to 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const summary = summarizeResults(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  state.review = { id: randomUUID(), order, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), summary,
    sciexOsVersion: String(form.get("sciexOsVersion") ?? "").trim(), processingMethod: String(form.get("processingMethod") ?? "").trim() };
  return { id: state.review.id, summary };
}
export async function acceptResultFile(reviewId: string, reason: string) {
  const state = await context();
  const review = state.review;
  if (!review || review.id !== reviewId) throw new Error("Upload the file again; this review expired or was replaced.");
  if (review.accepted) throw new Error("This file is already accepted.");
  if (review.accepting) throw new Error("Acceptance is already in progress.");
  if (reason.length > 2000) throw new Error("Keep the override reason within 2000 characters.");
  if (!canAcceptResults(review.summary.checks, reason)) throw new Error("A reason is required to override stop checks.");
  review.accepting = true;
  try {
    if (!(await listResultOrders()).some(order => order.id === review.order.id)) throw new Error("The order is no longer acquired or registered.");
    const summary = { ...review.summary, overrideReason: reason.trim() || null };
    const path = `${review.order.client_id}/${review.order.code}/${review.id}/${randomUUID()}-${review.sha256}.txt`;
    let resultId = review.id;
    if (getEnvironment().mock) {
      const demo = await readDemoState();
      const order = applyDemoState(demoOrders, demo).find(item => item.code === review.order.code);
      if (!order) throw new Error("The order is no longer acquired or registered.");
      await writeDemoState(recordResultFile(demo, { order, id: resultId, sha256: review.sha256, actor: demoSession.displayName, now: new Date() }));
    } else {
      const client = (await createAdminClient())!;
      const storage = client.storage.from("admin-files");
      resultId = await uploadThenRecord([{ path, bytes: review.bytes }], async file => {
        const { error } = await storage.upload(file.path, file.bytes, { contentType: "text/plain", upsert: false });
        if (error) throw new Error(error.message);
        return true;
      }, paths => storage.remove(paths), async () => {
        const { data, error } = await client.schema("admin").rpc("accept_result_file", {
          p_order_id: review.order.id, p_storage_path: path, p_sha256: review.sha256,
          p_sciex_os_version: review.sciexOsVersion, p_processing_method: review.processingMethod, p_summary: summary,
        });
        if (error) throw new Error(error.message);
        return data;
      });
    }
    review.accepted = true;
    return { id: resultId, code: review.order.code, stage: "Processed" };
  } finally { review.accepting = false; }
}
export async function getNameDictionary() {
  const state = await context();
  if (getEnvironment().mock) return { entries: state.entries, analytes: state.review?.summary.analytes ?? [] };
  const client = (await createAdminClient())!;
  const { data, error } = await client.schema("admin").from("name_map").select("id, export_name, clean_name").is("archived_at", null).is("client_id", null).order("export_name");
  if (error) throw new Error(error.message);
  return { entries: (data ?? []) as NameEntry[], analytes: state.review?.summary.analytes ?? [] };
}
export async function saveNameEntry(form: FormData) {
  const state = await context(true);
  const export_name = String(form.get("export_name") ?? "");
  const clean_name = String(form.get("clean_name") ?? "").trim();
  const id = String(form.get("id") ?? "");
  if (!export_name.trim() || !clean_name || export_name.length > 500 || clean_name.length > 500) throw new Error("Both names are required (up to 500 characters).");
  // One live lab-wide entry per export name (admin.name_map_lab_wide_export_name): adding a name that is already
  // there, or renaming an entry onto another one, is refused in both modes; the existing entry is edited instead.
  const duplicate = `${export_name} is already in the dictionary. Edit its entry instead of adding it again.`;
  if (getEnvironment().mock) {
    if (state.entries.some(entry => entry.export_name === export_name && entry.id !== id)) throw new Error(duplicate);
    const existing = id ? state.entries.find(entry => entry.id === id) : undefined;
    if (existing) Object.assign(existing, { export_name, clean_name });
    else state.entries.push({ id: randomUUID(), export_name, clean_name });
    return;
  }
  const client = (await createAdminClient())!;
  const table = client.schema("admin").from("name_map");
  const { error } = id ? await table.update({ export_name, clean_name }).eq("id", id).is("client_id", null).is("archived_at", null) : await table.insert({ export_name, clean_name });
  if (error?.code === "23505") throw new Error(duplicate);
  if (error) throw new Error(error.message);
}
