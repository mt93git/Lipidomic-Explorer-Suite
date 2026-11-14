import "server-only";
import { demoClients, demoOrders, demoSession } from "../demo";
import { getEnvironment } from "../environment";
import type { Order } from "../models";
import {
  DataError, registryClosedProblem, stageFromDb, type Condition, type OrderSummary, type RegisteredSample, type RegistryDetail, type SampleInput, type ShipmentInput, type ShipmentRecord,
} from "../samples";
import { sampleHistory, type SampleAliquot, type SampleDetail, type SampleInjection } from "../sample-detail";
import { applyDemoState, recordSamples, recordShipment, type DemoSample, type DemoShipment } from "../samples-demo";
import { getAppSession, requireWorkspace } from "../session";
import { createAdminClient } from "../supabase/server";
import { demoEvents, liveContext } from "./audit";
import { readDemoState, writeDemoState } from "./demo-store";
import { notifyShipment } from "./notifications";

export { DataError };

// Receive shipment and sample registry: one function per database contract call plus the reads the two
// screens need. Live mode talks to the admin schema through the signed-in user's Supabase client (RLS
// applies); demo mode lays the browser's demo records over the example orders. A plain `if (live)` each.
const live = () => !getEnvironment().mock;

// ---------------------------------------------------------------- live

type DbError = { code?: string; message: string };
type OrderRow = { id: string; code: string; title: string | null; stage: string; matrix: string | null; expected_samples: number | null; client_id: string; client: { name: string } | { name: string }[] | null };
type ShipmentRow = { id: string; carrier: string | null; tracking_number: string | null; condition: string | null; box_count: number | null; notes: string | null; received_at: string | null; received_by: string | null };
type SampleRow = {
  id: string; sample_code: string; sample_number: number; full_name: string; client_sample_id: string | null; group1_term: string | null; group2_term: string | null;
  replicate_term: string | null; patient_term: string | null; time_point_term: string | null; matrix: string | null; volume_ul: number | string | null;
};
const orderSelect = "id, code, title, stage, matrix, expected_samples, client_id, client:client(name)";
const shipmentSelect = "id, carrier, tracking_number, condition, box_count, notes, received_at, received_by";
const sampleSelect = "id, sample_code, sample_number, full_name, client_sample_id, group1_term, group2_term, replicate_term, patient_term, time_point_term, matrix, volume_ul";

async function admin() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}

// Postgres speaks in constraints; the operator needs the row-level meaning.
function refusal(error: DbError): DataError {
  const closed = /^(ORD\d{3,}) is at stage (\w+);/.exec(error.message);
  if (error.code === "55000" && closed) return new DataError(registryClosedProblem(closed[1], stageFromDb(closed[2])) ?? error.message);
  if (error.code === "23505" && /full_name/.test(error.message)) return new DataError("A sample with that FullName is already registered in this order.");
  if (error.code === "23505") return new DataError("That record already exists.");
  if (error.code === "42501" || /permission denied|row-level security/i.test(error.message)) return new DataError("You do not have permission to do this for this client.");
  return new DataError(error.message);
}

function toSummary(row: OrderRow): OrderSummary {
  const client = Array.isArray(row.client) ? row.client[0] : row.client;
  return { id: row.id, code: row.code, clientId: row.client_id, clientName: client?.name ?? "Client", description: row.title ?? "", stage: stageFromDb(row.stage), expectedSamples: row.expected_samples, sampleType: row.matrix };
}
function toShipment(row: ShipmentRow): ShipmentRecord {
  return { id: row.id, carrier: row.carrier, trackingNumber: row.tracking_number, condition: row.condition as Condition | null, boxCount: row.box_count, notes: row.notes, receivedAt: row.received_at, receivedBy: row.received_by };
}
function toSample(row: SampleRow): RegisteredSample {
  return {
    id: row.id, code: row.sample_code, sampleNumber: row.sample_number, full_name: row.full_name, client_sample_id: row.client_sample_id,
    group1_term: row.group1_term, group2_term: row.group2_term, replicate_term: row.replicate_term, patient_term: row.patient_term,
    time_point_term: row.time_point_term, matrix: row.matrix, volume_ul: row.volume_ul === null ? null : Number(row.volume_ul),
  };
}

// A client request still waiting for the lab's answer cannot arrive (receive_shipment refuses it), so it is not offered.
async function liveOrders(stageList: string[]): Promise<OrderSummary[]> {
  const db = await admin();
  const { data, error } = await db.from("order").select(orderSelect).in("stage", stageList).is("archived_at", null).neq("review", "pending").order("order_number");
  if (error) throw refusal(error);
  return ((data ?? []) as unknown as OrderRow[]).map(toSummary);
}

async function liveDetail(code: string): Promise<RegistryDetail | null> {
  const db = await admin();
  const order = await db.from("order").select(orderSelect).eq("code", code).is("archived_at", null).maybeSingle();
  if (order.error) throw refusal(order.error);
  if (!order.data) return null;
  const row = order.data as unknown as OrderRow;
  const [shipment, samples] = await Promise.all([
    // The arrival on record: shipments the client submitted but the lab has not received (received_at NULL)
    // are not arrivals, and Postgres would sort them first in a descending order. Newest arrival, stable ties.
    db.from("shipment").select(shipmentSelect).eq("order_id", row.id).is("archived_at", null).not("received_at", "is", null)
      .order("received_at", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
    db.from("sample").select(sampleSelect).eq("order_id", row.id).is("archived_at", null).order("sample_number"),
  ]);
  if (shipment.error) throw refusal(shipment.error);
  if (samples.error) throw refusal(samples.error);
  return {
    order: toSummary(row),
    shipment: shipment.data ? toShipment(shipment.data as unknown as ShipmentRow) : null,
    samples: ((samples.data ?? []) as unknown as SampleRow[]).map(toSample),
  };
}

// ---------------------------------------------------------------- sample detail (live)

type AliquotRow = { id: string; volume_ul: number | string | null; extracted_at: string | null; extracted_by: string | null; archived_at: string | null };
type Embedded<T> = T | T[] | null;
type InjectionRow = {
  id: string; seq: number; sample_name: string; status: string; plate: string | null; vial: string | null;
  batch_version: Embedded<{ version: number; batch: Embedded<{ name: string }> }>;
};
const one = <T,>(value: Embedded<T>): T | null => (Array.isArray(value) ? value[0] : value) ?? null;
export const SAMPLE_EVENT_LIMIT = 200;
const EVENT_LIMIT = SAMPLE_EVENT_LIMIT;
type EventRow = { id: number; created_at: string; actor: string | null; entity: string; entity_id: string | null; action: "INSERT" | "UPDATE"; before: Record<string, unknown> | null; after: Record<string, unknown> | null };

async function liveSampleDetail(code: string, session: { userId: string; displayName: string }): Promise<SampleDetail | null> {
  const db = await admin();
  const found = await db.from("sample").select(`${sampleSelect}, order_id, shipment_id, archived_reason`).eq("sample_code", code).maybeSingle();
  if (found.error) throw refusal(found.error);
  if (!found.data) return null;
  const row = found.data as unknown as SampleRow & { order_id: string; shipment_id: string | null; archived_reason: string | null };
  const [order, shipment, aliquots] = await Promise.all([
    db.from("order").select(orderSelect).eq("id", row.order_id).maybeSingle(),
    row.shipment_id ? db.from("shipment").select(shipmentSelect).eq("id", row.shipment_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    db.from("aliquot").select("id, volume_ul, extracted_at, extracted_by, archived_at").eq("sample_id", row.id).order("created_at"),
  ]);
  for (const result of [order, shipment, aliquots]) if (result.error) throw refusal(result.error);
  const aliquotRows = (aliquots.data ?? []) as unknown as AliquotRow[];
  const aliquotIds = aliquotRows.map(item => item.id);
  // Ids in the filters come from the database (uuids), never from the URL: the code was matched with eq above.
  const clauses = [`and(entity.eq.sample,entity_id.eq.${row.id})`, `and(entity.eq.exclusion,after->>sample_id.eq.${row.id})`];
  if (aliquotIds.length) clauses.push(`and(entity.eq.aliquot,entity_id.in.(${aliquotIds.join(",")}))`, `and(entity.eq.injection,after->>aliquot_id.in.(${aliquotIds.join(",")}))`);
  const [injections, events] = await Promise.all([
    aliquotIds.length
      ? db.from("injection").select("id, seq, sample_name, status, plate, vial, batch_version:batch_version(version, batch:batch(name))").in("aliquot_id", aliquotIds).is("archived_at", null)
      : Promise.resolve({ data: [], error: null }),
    db.from("audit_event").select("id, created_at, actor, entity, entity_id, action, before, after").or(clauses.join(",")).order("id", { ascending: false }).limit(EVENT_LIMIT),
  ]);
  if (injections.error) throw refusal(injections.error);
  if (events.error) throw refusal(events.error);
  const audit = ((events.data ?? []) as unknown as EventRow[]).map(item => ({
    id: Number(item.id), createdAt: item.created_at, actor: item.actor, entity: item.entity, entityId: item.entity_id, action: item.action, before: item.before, after: item.after,
  }));
  const ctx = await liveContext(db, audit, session);
  const shipmentRecord = shipment.data ? toShipment(shipment.data as unknown as ShipmentRow) : null;
  const sample = toSample(row);
  return {
    sample: { ...sample, archivedReason: row.archived_reason },
    order: order.data ? toSummary(order.data as unknown as OrderRow) : null,
    shipment: shipmentRecord && { ...shipmentRecord, receivedBy: shipmentRecord.receivedBy ? ctx.people[shipmentRecord.receivedBy] ?? "Lab staff" : null },
    aliquots: aliquotRows.map((item): SampleAliquot => ({
      id: item.id, volumeUl: item.volume_ul === null ? null : Number(item.volume_ul), extractedAt: item.extracted_at,
      extractedBy: item.extracted_by ? ctx.people[item.extracted_by] ?? "Lab staff" : null, archived: item.archived_at !== null,
    })),
    injections: ((injections.data ?? []) as unknown as InjectionRow[]).map((item): SampleInjection => {
      const version = one(item.batch_version);
      return { id: item.id, seq: item.seq, name: item.sample_name, batch: one(version?.batch ?? null)?.name ?? null, version: version?.version ?? null, status: item.status, plate: item.plate, vial: item.vial };
    }).sort((a, b) => (a.batch ?? "").localeCompare(b.batch ?? "") || (a.version ?? 0) - (b.version ?? 0) || a.seq - b.seq),
    history: sampleHistory(audit, ctx, { id: row.id, code, aliquotIds }),
  };
}

// ---------------------------------------------------------------- demo

const demoActor = demoSession.displayName;
const clientName = (id: string) => demoClients.find(client => client.id === id)?.name ?? "Client";
function demoSummary(order: Order): OrderSummary {
  return { id: order.code, code: order.code, clientId: order.clientId, clientName: clientName(order.clientId), description: order.description, stage: order.stage, expectedSamples: order.sampleCount, sampleType: order.sampleType };
}
function demoShipment(shipment: DemoShipment): ShipmentRecord {
  return { id: shipment.id, carrier: shipment.carrier, trackingNumber: shipment.trackingNumber, condition: shipment.condition, boxCount: shipment.boxCount, notes: shipment.notes, receivedAt: shipment.receivedAt, receivedBy: shipment.receivedBy };
}
function demoSample(sample: DemoSample): RegisteredSample {
  return {
    id: sample.id, code: sample.code, sampleNumber: sample.sampleNumber, full_name: sample.full_name, client_sample_id: sample.client_sample_id, group1_term: sample.group1_term,
    group2_term: sample.group2_term, replicate_term: sample.replicate_term, patient_term: sample.patient_term, time_point_term: sample.time_point_term, matrix: sample.matrix, volume_ul: sample.volume_ul,
  };
}
async function demoOrder(orderId: string) {
  const state = await readDemoState();
  const order = applyDemoState(demoOrders, state).find(item => item.code === orderId && !item.released);
  if (!order) throw new DataError(`Order ${orderId} was not found.`);
  return { state, order };
}

// ---------------------------------------------------------------- the seam

// Orders waiting to arrive (stage Request): what Receive shipment offers.
export async function listReceivableOrders(): Promise<OrderSummary[]> {
  if (live()) return liveOrders(["request"]);
  return applyDemoState(demoOrders, await readDemoState())
    .filter(order => order.stage === 0 && !order.released && (!order.request || order.request.status === "accepted")).map(demoSummary);
}

// Orders whose registry is open (Received, or Registered with more to add): what Sample registry offers.
export async function listRegistryOrders(): Promise<OrderSummary[]> {
  if (live()) return liveOrders(["received", "registered"]);
  return applyDemoState(demoOrders, await readDemoState()).filter(order => (order.stage === 1 || order.stage === 2) && !order.released).map(demoSummary);
}

export async function getRegistryOrder(code: string): Promise<RegistryDetail | null> {
  if (live()) return liveDetail(code);
  const state = await readDemoState();
  const order = applyDemoState(demoOrders, state).find(item => item.code === code);
  if (!order) return null;
  const shipment = state.shipments.filter(item => item.orderCode === code).at(-1);
  return { order: demoSummary(order), shipment: shipment ? demoShipment(shipment) : null, samples: state.samples.filter(item => item.orderCode === code).map(demoSample) };
}

// One sample by its code (ORD041-S001) with its order, shipment, aliquots, injections and audit history, or null when
// there is no such sample or RLS hides it. Lab staff only. The demo has no aliquots or injections: those sections are empty.
export async function getSampleDetail(code: string): Promise<SampleDetail | null> {
  const session = await requireWorkspace("staff");
  if (live()) return liveSampleDetail(code, session);
  const state = await readDemoState();
  const found = state.samples.find(item => item.code === code);
  if (!found) return null;
  const order = applyDemoState(demoOrders, state).find(item => item.code === found.orderCode);
  const shipment = state.shipments.find(item => item.id === found.shipmentId);
  const { events, ctx } = demoEvents(state);
  return {
    sample: { ...demoSample(found), archivedReason: null },
    order: order ? demoSummary(order) : null,
    shipment: shipment ? demoShipment(shipment) : null,
    aliquots: [], injections: [],
    history: sampleHistory(events, ctx, { id: found.id, code, aliquotIds: [] }),
  };
}

// admin.receive_shipment(p_order_id, p_carrier, p_tracking_number, p_condition, p_box_count, p_notes) returns uuid
export async function receiveShipment(input: ShipmentInput): Promise<{ shipmentId: string }> {
  if (live()) {
    const db = await admin();
    const { data, error } = await db.rpc("receive_shipment", {
      p_order_id: input.orderId, p_carrier: input.carrier, p_tracking_number: input.trackingNumber, p_condition: input.condition, p_box_count: input.boxCount, p_notes: input.notes,
    });
    if (error) throw refusal(error);
    // Who is told is the Notifications matrix's row (0036), after the response.
    await notifyShipment(input.orderId, { boxCount: input.boxCount, condition: input.condition }, (await getAppSession())?.userId ?? null);
    return { shipmentId: String(data) };
  }
  const { state, order } = await demoOrder(input.orderId);
  const result = recordShipment(state, { order, shipment: input, actor: demoActor, now: new Date(), id: crypto.randomUUID() });
  await writeDemoState(result.state);
  await notifyShipment(input.orderId, { boxCount: input.boxCount, condition: input.condition }, demoSession.userId);
  return { shipmentId: result.shipment.id };
}

// admin.register_samples(p_order_id, p_shipment_id, p_samples jsonb) returns setof admin.sample
export async function registerSamples(input: { orderId: string; shipmentId: string | null; samples: SampleInput[] }): Promise<RegisteredSample[]> {
  if (live()) {
    const db = await admin();
    const { data, error } = await db.rpc("register_samples", { p_order_id: input.orderId, p_shipment_id: input.shipmentId, p_samples: input.samples });
    if (error) throw refusal(error);
    return ((data ?? []) as unknown as SampleRow[]).map(toSample);
  }
  const { state, order } = await demoOrder(input.orderId);
  const result = recordSamples(state, { order, shipmentId: input.shipmentId, samples: input.samples, actor: demoActor, now: new Date(), nextId: () => crypto.randomUUID() });
  await writeDemoState(result.state);
  return result.samples.map(demoSample);
}
