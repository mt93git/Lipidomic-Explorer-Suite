import "server-only";
import { demoClients, demoOrders, demoPanels, demoSession } from "../demo";
import { getEnvironment } from "../environment";
import { LAB_TIME_ZONE } from "../lab-time";
import type { Client, Gate, HistoryEvent, Order, Retirement } from "../models";
import { recordOrder, type OrderInput, type Panel } from "../new-order";
import { conditionLabels, DataError, plural, stageFromDb, type Condition } from "../samples";
import { applyDemoState } from "../samples-demo";
import { createAdminClient } from "../supabase/server";
import { readDemoState, writeDemoState } from "./demo-store";

// The orders the overview and the order detail show. Live mode reads admin.order with its children through
// the signed-in user's own Supabase client, so RLS decides what each person sees (lab staff: every client;
// a client member: only their clients; results files are staff-only, datasets are visible to clients once
// released). Demo mode lays this browser's recorded shipments, samples and results over the example orders.
const live = () => !getEnvironment().mock;

// ---------------------------------------------------------------- live rows

type One<T> = T | T[] | null;
type ShipmentRow = { received_at: string | null; received_by: string | null; carrier: string | null; tracking_number: string | null; box_count: number | null; condition: string | null; archived_at: string | null };
type SampleRow = { created_at: string; archived_at: string | null };
type ResultRow = { sha256: string; status: string; accepted_at: string | null; accepted_by: string | null; archived_at: string | null; batch: One<{ name: string }> };
type SignatureRow = { user_id: string; signed_at: string; archived_at: string | null };
type DatasetRow = { id: string; version: number; status: string; created_at: string; released_at: string | null; archived_at: string | null; archived_reason?: string | null; signature: SignatureRow[] | null };
type OrderRow = {
  id: string; code: string; title: string | null; stage: string; matrix: string | null; expected_samples: number | null; client_id: string; created_at: string;
  requested_by: string | null; panel: One<{ name: string }>; sample: SampleRow[] | null; shipment: ShipmentRow[] | null; result_file: ResultRow[] | null; dataset: DatasetRow[] | null;
};
type Names = Map<string, string>;

// One request per screen: the order rows with their children embedded (PostgREST follows the foreign keys).
// Archived children are filtered here so the select stays a plain column list.
const orderSelect = [
  "id, code, title, stage, matrix, expected_samples, client_id, created_at, requested_by",
  "panel:panel(name)",
  "sample(created_at, archived_at)",
  "shipment(received_at, received_by, carrier, tracking_number, box_count, condition, archived_at)",
  "result_file(sha256, status, accepted_at, accepted_by, archived_at, batch:batch(name))",
  "dataset(id, version, status, created_at, released_at, archived_at, archived_reason, signature(user_id, signed_at, archived_at))",
].join(", ");

const palette = ["atlas", "cedar", "meridian", "harbor", "juniper"];
const labDay = new Intl.DateTimeFormat("en-CA", { timeZone: LAB_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const EXCEL_BUILT = stageFromDb("excel_built");
const one = <T,>(value: One<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);
const active = <T extends { archived_at: string | null }>(rows: T[] | null) => (rows ?? []).filter(row => !row.archived_at);
const newest = <T,>(rows: T[], at: (row: T) => string | null) => [...rows].sort((a, b) => (at(b) ?? "").localeCompare(at(a) ?? ""))[0];
// withdraw_dataset and supersede_dataset retire a released version: it stays in the record, archived with its reason.
const isRetired = (dataset: DatasetRow) => dataset.status === "withdrawn" || dataset.status === "superseded";
const retirementTitle = (dataset: DatasetRow) => `Dataset v${dataset.version} ${dataset.status}${dataset.archived_reason ? ` · ${dataset.archived_reason}` : ""}`;

async function admin() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}
function readFailure(what: string, error: { message: string }): Error {
  return new Error(`${what} could not be read: ${error.message}`);
}

function arrivalTitle(shipment: ShipmentRow): string {
  const parts = [`Shipment received · ${shipment.carrier ?? "carrier not recorded"}${shipment.tracking_number ? ` ${shipment.tracking_number}` : ""}`];
  if (shipment.box_count !== null) parts.push(plural(shipment.box_count, "box", "boxes"));
  if (shipment.condition) parts.push(conditionLabels[shipment.condition as Condition]?.toLowerCase() ?? shipment.condition);
  return parts.join(" · ");
}

function arrivalGates(arrival: ShipmentRow | undefined, samples: number): Gate[] {
  const condition = arrival?.condition as Condition | null | undefined;
  return [
    { label: arrival?.carrier ? `Shipment logged · ${arrival.carrier}` : "Shipment logged", status: arrival ? "ok" : "pending" },
    !condition ? { label: "Arrival condition", status: "pending" }
      : condition === "ok" ? { label: "Arrival condition recorded · intact and cold", status: "ok" }
      : { label: `Arrived ${conditionLabels[condition].toLowerCase()} · condition review`, status: "fail" },
    samples ? { label: `${plural(samples, "sample")} registered with metadata`, status: "ok" } : { label: "Sample registry", status: "pending" },
  ];
}

// What the database records for the order's current stage, as the checklist the board and detail show. `current`:
// a released version is available now (not only that the order once reached Released).
function gatesFor(stage: number, current: boolean, facts: { arrival?: ShipmentRow; samples: number; result?: ResultRow; dataset?: DatasetRow }, names: Names): Gate[] {
  if (stage === 0) return [{ label: "Shipment received", status: "pending" }];
  if (stage <= 2) return arrivalGates(facts.arrival, facts.samples);
  if (stage < 7) return [{ label: "Stage checks", status: "pending" }];
  if (stage < EXCEL_BUILT) {
    return [
      { label: "Results file accepted", status: facts.result ? "ok" : "pending" },
      { label: "QC review", status: stage >= 8 ? "ok" : "pending" },
      ...(stage >= 8 ? [{ label: "Dataset built", status: "pending" as const }] : []),
    ];
  }
  const dataset = facts.dataset;
  if (!dataset) return [{ label: "Dataset built", status: "pending" }];
  const signatures = active(dataset.signature).sort((a, b) => a.signed_at.localeCompare(b.signed_at));
  return [
    { label: `Dataset v${dataset.version} built`, status: "ok" },
    ...signatures.map(signature => ({ label: `Signature · ${names.get(signature.user_id) ?? "Lab staff"}`, status: "ok" as const })),
    current ? { label: "Released", status: "ok" }
      : isRetired(dataset) ? { label: retirementTitle(dataset), status: "fail" }
      : { label: "Release signatures", status: "pending" },
  ];
}

function historyFor(row: OrderRow, arrivals: ShipmentRow[], samples: SampleRow[], results: ResultRow[], datasets: DatasetRow[], names: Names): HistoryEvent[] {
  const who = (id: string | null, fallback: string) => (id && names.get(id)) || fallback;
  const events: HistoryEvent[] = [{ date: row.created_at, title: "Order created", actor: who(row.requested_by, "Client") }];
  for (const shipment of arrivals) events.push({ date: shipment.received_at!, title: arrivalTitle(shipment), actor: who(shipment.received_by, "Lab staff") });
  const batches = new Map<string, number>();
  for (const sample of samples) batches.set(sample.created_at, (batches.get(sample.created_at) ?? 0) + 1);
  for (const [date, count] of batches) events.push({ date, title: `${plural(count, "sample")} registered`, actor: "Lab staff" });
  for (const result of results) if (result.accepted_at) events.push({ date: result.accepted_at, title: `Results file accepted · SHA-256 ${result.sha256.slice(0, 12)}…`, actor: who(result.accepted_by, "Lab staff") });
  for (const dataset of [...datasets].sort((a, b) => a.version - b.version)) {
    events.push({ date: dataset.created_at, title: `Dataset v${dataset.version} built`, actor: "Lab" });
    for (const signature of active(dataset.signature)) events.push({ date: signature.signed_at, title: `Dataset v${dataset.version} signed`, actor: who(signature.user_id, "Lab staff") });
    if (dataset.released_at) events.push({ date: dataset.released_at, title: `Dataset v${dataset.version} released`, actor: "Lab" });
    if (isRetired(dataset) && dataset.archived_at) events.push({ date: dataset.archived_at, title: retirementTitle(dataset), actor: "Lab" });
  }
  // Newest first; at the same instant the later step (a release after its last signature) comes first.
  return events.map((event, index) => ({ event, index }))
    .sort((a, b) => Date.parse(b.event.date) - Date.parse(a.event.date) || b.index - a.index)
    .map(({ event }) => event);
}

export function toOrder(row: OrderRow, names: Names): Order {
  const released = row.stage === "released";
  const stage = stageFromDb(row.stage);
  const arrivals = active(row.shipment).filter(shipment => shipment.received_at);
  const arrival = newest(arrivals, shipment => shipment.received_at);
  const samples = active(row.sample);
  const results = active(row.result_file).filter(result => result.status === "accepted" || result.status === "superseded");
  const result = newest(results.filter(item => item.status === "accepted"), item => item.accepted_at);
  // Retired versions stay (status and reason); a build archived before release was discarded and is not shown.
  const datasets = (row.dataset ?? []).filter(dataset => !dataset.archived_at || isRetired(dataset));
  const releasedDataset = datasets.find(dataset => dataset.status === "released");
  const lastRetired = newest(datasets.filter(isRetired), dataset => dataset.archived_at);
  const retired: Retirement | undefined = released && !releasedDataset && lastRetired
    ? { version: lastRetired.version, status: lastRetired.status as Retirement["status"], reason: lastRetired.archived_reason ?? "", at: lastRetired.archived_at! }
    : undefined;
  const dataset = releasedDataset ?? [...datasets].filter(item => item.status === "built").sort((a, b) => b.version - a.version)[0] ?? lastRetired;
  const sampleCount = Math.max(row.expected_samples ?? 0, samples.length);
  return {
    code: row.code, clientId: row.client_id, description: row.title ?? "", stage, released,
    sampleCount, completedSamples: released ? sampleCount : Math.min(sampleCount, samples.length),
    sampleType: row.matrix ?? "Not specified", panel: one(row.panel)?.name ?? "No panel",
    // The schema has no target date or assignee yet; the detail shows them as not set.
    due: "", owner: "Unassigned",
    received: arrival?.received_at ? labDay.format(new Date(arrival.received_at)) : "",
    batch: result ? one(result.batch)?.name : undefined,
    gates: gatesFor(stage, Boolean(released && releasedDataset), { arrival, samples: samples.length, result, dataset }, names),
    history: historyFor(row, arrivals, samples, results, datasets, names),
    releasedAt: releasedDataset?.released_at ?? undefined,
    ...(released && releasedDataset ? { currentDatasetId: releasedDataset.id } : {}),
    ...(retired ? { retired } : {}),
  };
}

// Display names of lab staff (staff read every row; anyone else only their own).
async function staffNames(db: Awaited<ReturnType<typeof admin>>): Promise<Names> {
  const { data, error } = await db.from("lab_staff").select("user_id, display_name").is("archived_at", null);
  if (error) throw readFailure("Lab staff", error);
  return new Map(((data ?? []) as { user_id: string; display_name: string | null }[]).filter(row => row.display_name).map(row => [row.user_id, row.display_name!]));
}

async function liveClients(db: Awaited<ReturnType<typeof admin>>): Promise<Client[]> {
  const { data, error } = await db.from("client").select("id, name").is("archived_at", null).order("name");
  if (error) throw readFailure("Clients", error);
  return ((data ?? []) as { id: string; name: string }[]).map((row, index) => ({ id: row.id, name: row.name, color: palette[index % palette.length] }));
}

// ---------------------------------------------------------------- the seam

export async function listOrders(): Promise<Order[]> {
  if (!live()) return applyDemoState(demoOrders, await readDemoState());
  const db = await admin();
  const [orders, names] = await Promise.all([
    db.from("order").select(orderSelect).is("archived_at", null).order("order_number"),
    staffNames(db),
  ]);
  if (orders.error) throw readFailure("Orders", orders.error);
  return ((orders.data ?? []) as unknown as OrderRow[]).map(row => toOrder(row, names));
}

export async function listClients(): Promise<Client[]> {
  if (!live()) return demoClients;
  return liveClients(await admin());
}

// One order and its client, or null when it does not exist or RLS hides it from this user.
export async function getOrder(code: string): Promise<{ order: Order; client: Client } | null> {
  if (!live()) {
    const order = (await listOrders()).find(item => item.code === code);
    const client = order && demoClients.find(item => item.id === order.clientId);
    return order && client ? { order, client } : null;
  }
  const db = await admin();
  const found = await db.from("order").select(orderSelect).eq("code", code).is("archived_at", null).maybeSingle();
  if (found.error) throw readFailure("The order", found.error);
  if (!found.data) return null;
  const row = found.data as unknown as OrderRow;
  const [names, clients] = await Promise.all([staffNames(db), liveClients(db)]);
  const client = clients.find(item => item.id === row.client_id) ?? { id: row.client_id, name: "Client", color: "shared" };
  return { order: toOrder(row, names), client };
}

// ---------------------------------------------------------------- New order

// The panels an order may request: active ones (panels are reference data every signed-in user reads).
export async function listPanels(): Promise<Panel[]> {
  if (!live()) return demoPanels.map(name => ({ id: name, name }));
  const { data, error } = await (await admin()).from("panel").select("id, name").is("archived_at", null).order("name");
  if (error) throw readFailure("Panels", error);
  return ((data ?? []) as Panel[]).map(row => ({ id: row.id, name: row.name }));
}

// The database's refusal as a sentence ("client X is archived; ..." → "Client X is archived; ....").
function orderRefusal(error: { message: string }): DataError {
  const text = error.message.trim();
  return new DataError(`${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? "" : "."}`);
}

// admin.create_order(p_client_id, p_panel_id, p_title, p_matrix, p_expected_samples, p_billing_ref, p_notes) returns uuid;
// the code (ORD055) is generated by the database and read back for the success notice.
export async function createOrder(input: OrderInput): Promise<{ id: string; code: string }> {
  if (!live()) {
    const state = await readDemoState();
    const { state: next, order } = recordOrder(state, {
      input, orders: applyDemoState(demoOrders, state), clients: demoClients, panels: await listPanels(), actor: demoSession.displayName, now: new Date(),
    });
    await writeDemoState(next);
    return { id: order.code, code: order.code };
  }
  const db = await admin();
  const { data, error } = await db.rpc("create_order", {
    p_client_id: input.clientId, p_panel_id: input.panelId, p_title: input.title, p_matrix: input.matrix,
    p_expected_samples: input.expectedSamples, p_billing_ref: input.billingRef, p_notes: input.notes,
  });
  if (error) throw orderRefusal(error);
  const id = String(data);
  const created = await db.from("order").select("code").eq("id", id).maybeSingle();
  if (created.error || !created.data) throw new DataError("The order was created, but its code could not be read. Find it on the pipeline at Request.");
  return { id, code: (created.data as { code: string }).code };
}
