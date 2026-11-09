import "server-only";
import { demoClients, demoOrders, demoSession } from "../demo";
import { getEnvironment } from "../environment";
import type { Order } from "../models";
import {
  DataError, registryClosedProblem, stageFromDb, type Condition, type OrderSummary, type RegisteredSample, type RegistryDetail, type SampleInput, type ShipmentInput, type ShipmentRecord,
} from "../samples";
import { applyDemoState, recordSamples, recordShipment, type DemoSample, type DemoShipment } from "../samples-demo";
import { createAdminClient } from "../supabase/server";
import { readDemoState, writeDemoState } from "./demo-store";

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

async function liveOrders(stageList: string[]): Promise<OrderSummary[]> {
  const db = await admin();
  const { data, error } = await db.from("order").select(orderSelect).in("stage", stageList).is("archived_at", null).order("order_number");
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
  return applyDemoState(demoOrders, await readDemoState()).filter(order => order.stage === 0 && !order.released).map(demoSummary);
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

// admin.receive_shipment(p_order_id, p_carrier, p_tracking_number, p_condition, p_box_count, p_notes) returns uuid
export async function receiveShipment(input: ShipmentInput): Promise<{ shipmentId: string }> {
  if (live()) {
    const db = await admin();
    const { data, error } = await db.rpc("receive_shipment", {
      p_order_id: input.orderId, p_carrier: input.carrier, p_tracking_number: input.trackingNumber, p_condition: input.condition, p_box_count: input.boxCount, p_notes: input.notes,
    });
    if (error) throw refusal(error);
    return { shipmentId: String(data) };
  }
  const { state, order } = await demoOrder(input.orderId);
  const result = recordShipment(state, { order, shipment: input, actor: demoActor, now: new Date(), id: crypto.randomUUID() });
  await writeDemoState(result.state);
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
