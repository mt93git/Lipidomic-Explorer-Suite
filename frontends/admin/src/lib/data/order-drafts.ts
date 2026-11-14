import "server-only";
import { demoSession } from "../demo";
import { getEnvironment } from "../environment";
import {
  closeDemoDraft, demoDraftSummaries, isWizardStep, normalizeWizard, placedSampleList, saveDemoDraft, toOrderInput,
  type OrderDraft, type OrderDraftSummary, type WizardData, type WizardPanel, type WizardStep,
} from "../order-wizard";
import { DataError } from "../samples";
import { requireWorkspace } from "../session";
import { createAdminClient } from "../supabase/server";
import { readDemoOrderDrafts, writeDemoOrderDrafts } from "./demo-store";
import { demoWizardPanels, rateFromRow } from "./instruments-panels";
import { createOrder } from "./orders";

// New order wizard (0033): the panels it offers with their rate sheet line, and the drafts the lab saves, resumes,
// discards and places. Live mode goes through the signed-in user's own client: lab staff read admin.panel_rate and
// admin.order_draft (RLS), lab writers change drafts only through save_order_draft, discard_order_draft and
// place_order_draft. Demo mode keeps this browser's drafts in the demo store.
const live = () => !getEnvironment().mock;
async function admin() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}
// The database's refusal as a sentence.
function refusal(error: { message: string }): DataError {
  const text = error.message.trim();
  return new DataError(`${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? "" : "."}`);
}
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await (await admin()).rpc(name, args);
  if (error) throw refusal(error);
  return data;
}

type One<T> = T | T[] | null;
const one = <T,>(value: One<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);
type PanelRow = {
  id: string; name: string; instrument: One<{ name: string }>;
  panel_rate: One<{ panel_id: string; rate_per_sample: number | string | null; currency: string | null; minutes_per_injection: number | string | null }>;
};

export async function listWizardPanels(): Promise<WizardPanel[]> {
  await requireWorkspace("staff");
  if (!live()) return demoWizardPanels();
  const { data, error } = await (await admin()).from("panel")
    .select("id, name, instrument:instrument(name), panel_rate(panel_id, rate_per_sample, currency, minutes_per_injection)")
    .is("archived_at", null).order("name");
  if (error) throw new DataError(`Panels could not be read: ${error.message}`);
  return ((data ?? []) as unknown as PanelRow[]).map(row => {
    const rate = one(row.panel_rate);
    return { id: row.id, name: row.name, instrumentName: one(row.instrument)?.name ?? null, rate: rate ? rateFromRow(rate) : null };
  });
}

type DraftRow = { id: string; step: number; client_id: string | null; title: string | null; updated_at: string; updated_by: string | null; data: unknown };
const step = (value: number): WizardStep => isWizardStep(value) ? value : 1;

async function labNames(db: Awaited<ReturnType<typeof admin>>): Promise<Map<string, string>> {
  const { data } = await db.from("lab_staff").select("user_id, display_name");
  return new Map(((data ?? []) as { user_id: string; display_name: string | null }[]).filter(row => row.display_name).map(row => [row.user_id, row.display_name!]));
}

// Open drafts (neither placed nor discarded), the most recently saved first.
export async function listOpenDrafts(): Promise<OrderDraftSummary[]> {
  await requireWorkspace("staff");
  if (!live()) return demoDraftSummaries(await readDemoOrderDrafts());
  const db = await admin();
  const [drafts, names] = await Promise.all([
    db.from("order_draft").select("id, step, client_id, title, updated_at, updated_by").is("order_id", null).is("discarded_at", null).order("updated_at", { ascending: false }),
    labNames(db),
  ]);
  if (drafts.error) throw new DataError(`Drafts could not be read: ${drafts.error.message}`);
  return ((drafts.data ?? []) as DraftRow[]).map(row => ({
    id: row.id, step: step(row.step), clientId: row.client_id, title: row.title, updatedAt: row.updated_at, updatedBy: (row.updated_by && names.get(row.updated_by)) || "Lab staff",
  }));
}

// One open draft to resume, or null when it does not exist, was placed or was discarded.
export async function getOpenDraft(id: string): Promise<OrderDraft | null> {
  await requireWorkspace("staff");
  if (!id) return null;
  if (!live()) {
    const draft = (await readDemoOrderDrafts()).find(item => item.id === id && !item.orderCode && !item.discardedAt);
    return draft ? { id: draft.id, step: draft.step, data: normalizeWizard(draft.data) } : null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await (await admin()).from("order_draft").select("id, step, data").eq("id", id).is("order_id", null).is("discarded_at", null).maybeSingle();
  if (error) throw new DataError(`The draft could not be read: ${error.message}`);
  if (!data) return null;
  const row = data as DraftRow;
  return { id: row.id, step: step(row.step), data: normalizeWizard(row.data) };
}

// The sample list pasted in the New order wizard for this order (its placed draft), or null: the Sample registry
// offers it prefilled while the order has no samples. Live: admin.order_draft by order_id (RLS: lab staff). A failed
// read offers nothing instead of failing the registry.
export async function getPlacedSampleList(order: { id: string; code: string }): Promise<string | null> {
  await requireWorkspace("staff");
  if (!live()) return placedSampleList(await readDemoOrderDrafts(), order.code);
  if (!/^[0-9a-f-]{36}$/i.test(order.id)) return null;
  const { data, error } = await (await admin()).from("order_draft").select("data").eq("order_id", order.id).maybeSingle();
  if (error) {
    console.error("[sample-registry] order draft read failed", { code: error.code });
    return null;
  }
  return data ? normalizeWizard((data as { data: unknown }).data).sampleList.trim() || null : null;
}

export async function saveOrderDraft(input: { id: string | null; step: WizardStep; data: WizardData }): Promise<string> {
  const session = await requireWorkspace("staff");
  const data = normalizeWizard(input.data);
  if (live()) {
    return String(await rpc("save_order_draft", { p_id: input.id, p_step: input.step, p_client_id: data.clientId.trim() || null, p_title: data.title, p_data: data }));
  }
  const saved = saveDemoDraft(await readDemoOrderDrafts(), { id: input.id, step: input.step, data, actor: session.displayName || demoSession.displayName, now: new Date(), newId: () => crypto.randomUUID() });
  await writeDemoOrderDrafts(saved.drafts);
  return saved.id;
}

export async function discardOrderDraft(id: string): Promise<void> {
  const session = await requireWorkspace("staff");
  if (live()) { await rpc("discard_order_draft", { p_id: id }); return; }
  await writeDemoOrderDrafts(closeDemoDraft(await readDemoOrderDrafts(), id, { discard: true }, session.displayName || demoSession.displayName, new Date()));
}

// Places the order: from its draft (place_order_draft: the order and the draft's link in one transaction) or, without
// a draft, through create_order as before. Returns the new order's code.
export async function placeOrder(input: { draftId: string | null; data: WizardData }): Promise<string> {
  const session = await requireWorkspace("staff");
  const data = normalizeWizard(input.data);
  const order = toOrderInput(data);
  if (!input.draftId) return (await createOrder(order)).code;
  if (!live()) {
    const drafts = await readDemoOrderDrafts();
    closeDemoDraft(drafts, input.draftId, { discard: true }, "", new Date()); // refuses a closed draft before anything is written
    const { code } = await createOrder(order);
    await writeDemoOrderDrafts(closeDemoDraft(await readDemoOrderDrafts(), input.draftId, { orderCode: code, data }, session.displayName || demoSession.displayName, new Date()));
    return code;
  }
  const db = await admin();
  const id = String(await rpc("place_order_draft", {
    p_id: input.draftId, p_client_id: order.clientId, p_panel_id: order.panelId, p_title: order.title, p_matrix: order.matrix,
    p_expected_samples: order.expectedSamples, p_billing_ref: order.billingRef, p_notes: order.notes, p_data: data,
  }));
  const created = await db.from("order").select("code").eq("id", id).maybeSingle();
  if (created.error || !created.data) throw new DataError("The order was placed, but its code could not be read. Find it on the pipeline at Request.");
  return (created.data as { code: string }).code;
}
