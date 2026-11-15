import "server-only";
import { demoClients, demoOrders, demoSession } from "../demo";
import { getEnvironment } from "../environment";
import type { Order } from "../models";
import { DataError } from "../samples";
import { applyDemoState, demoOrderSamples, type DemoState } from "../samples-demo";
import {
  checkinProblem, demoCheckIn, demoConfirm, isTubeCondition, STORAGE_TEMPERATURE, withDemoTubes,
  type CheckInInput, type CheckinShipment, type CheckinView, type ManifestTube, type Receipt,
} from "../shipment-checkin";
import { createAdminClient } from "../supabase/server";
import { initialDemoPlacements, storedSlots } from "../storage";
import { readDemoPlacements, readDemoState, writeDemoState } from "./demo-store";
import { notifyReceiptDiscrepancy } from "./notifications";

// Receive shipment, tube by tube. Live mode reads the order's received shipments through the signed-in user's own
// client (RLS) and the manifest through admin.shipment_checkin (lab staff); writes go through check_in_tube and
// confirm_shipment_receipt (0032). Demo mode keeps tubes and receipts in this browser's demo state.
const live = () => !getEnvironment().mock;

// ---------------------------------------------------------------- live

type ShipmentRow = {
  id: string; carrier: string | null; box_count: number | null; received_at: string; created_at: string;
  receipt_confirmed_at: string | null; receipt_confirmed_by: string | null; receipt_note: string | null; receipt_missing: number | null; receipt_damaged: number | null; storage_temperature: string | null;
};
type CheckinRow = { sample_code: string; client_sample_id: string | null; condition: string | null; condition_note: string | null; box: string | null; position: string | null; checked_in_at: string | null };
type OrderRow = { id: string; code: string; client: { name: string } | { name: string }[] | null };
type WaitingRow = { id: string; received_at: string; order: { code: string; title: string | null; archived_at: string | null; client: { name: string } | { name: string }[] | null } | null };

const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

async function admin() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}
function refusal(error: { code?: string; message: string }): DataError {
  if (error.code === "42501" || /permission denied|row-level security/i.test(error.message)) return new DataError("You do not have permission to do this for this client.");
  return new DataError(checkinProblem(error.message));
}
const toReceipt = (row: ShipmentRow): Receipt | null => row.receipt_confirmed_at ? {
  confirmedAt: row.receipt_confirmed_at, confirmedBy: row.receipt_confirmed_by, note: row.receipt_note,
  missing: row.receipt_missing ?? 0, damaged: row.receipt_damaged ?? 0, storageTemperature: row.storage_temperature,
} : null;

function pickShipment<T extends { id: string; receivedAt: string }>(shipments: T[], wanted?: string | null) {
  const index = wanted ? shipments.findIndex(item => item.id === wanted) : shipments.length - 1;
  return index < 0 ? null : { shipment: shipments[index], number: index + 1, of: shipments.length };
}

async function liveCheckin(code: string, shipmentId?: string | null): Promise<CheckinView | null> {
  const db = await admin();
  const order = await db.from("order").select("id, code, client:client(name)").eq("code", code).is("archived_at", null).maybeSingle();
  if (order.error) throw refusal(order.error);
  if (!order.data) return null;
  const row = order.data as unknown as OrderRow;
  const shipments = await db.from("shipment")
    .select("id, carrier, box_count, received_at, created_at, receipt_confirmed_at, receipt_confirmed_by, receipt_note, receipt_missing, receipt_damaged, storage_temperature")
    .eq("order_id", row.id).is("archived_at", null).not("received_at", "is", null)
    .order("received_at").order("created_at").order("id");
  if (shipments.error) throw refusal(shipments.error);
  const rows = ((shipments.data ?? []) as unknown as ShipmentRow[]).map(item => ({ ...item, receivedAt: item.received_at }));
  const picked = pickShipment(rows, shipmentId);
  if (!picked) return null;
  const tubes = await db.rpc("shipment_checkin", { p_shipment_id: picked.shipment.id });
  if (tubes.error) throw refusal(tubes.error);
  const s = picked.shipment;
  return {
    orderId: row.id, orderCode: row.code, clientName: one(row.client)?.name ?? "Client",
    shipment: { id: s.id, receivedAt: s.received_at, carrier: s.carrier, boxCount: s.box_count, number: picked.number, of: picked.of, receipt: toReceipt(s) },
    tubes: ((tubes.data ?? []) as CheckinRow[]).map((item): ManifestTube => ({
      sampleCode: item.sample_code, clientSampleId: item.client_sample_id,
      checkIn: item.condition && isTubeCondition(item.condition)
        ? { condition: item.condition, note: item.condition_note, box: item.box, position: item.position, at: item.checked_in_at ?? "" } : null,
    })),
  };
}

// ---------------------------------------------------------------- demo

const clientName = (id: string) => demoClients.find(client => client.id === id)?.name ?? "Client";
// An example order already Received or Registered arrived in one example shipment at 10:42 on its received day.
const exampleShipmentId = (code: string) => `example-shipment-${code}`;
const isExampleReceived = (order: Order) => !order.released && (order.stage === 1 || order.stage === 2);
function exampleArrival(order: Order): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(order.received) ? order.received : "2026-11-02";
  return new Date(`${day}T10:42:00-05:00`).toISOString();
}
// Invented client IDs for an example manifest: two time points per subject (SYN-01-d0, SYN-01-d3, SYN-02-d0, …).
const exampleClientId = (index: number) => `SYN-${String(Math.floor(index / 2) + 1).padStart(2, "0")}-d${index % 2 ? 3 : 0}`;

function demoShipments(order: Order, state: DemoState) {
  const recorded = state.shipments.filter(item => item.orderCode === order.code).map(item => ({ id: item.id, receivedAt: item.receivedAt, carrier: item.carrier, boxCount: item.boxCount, example: false }));
  if (recorded.length || !isExampleReceived(order)) return recorded;
  return [{ id: exampleShipmentId(order.code), receivedAt: exampleArrival(order), carrier: "Example courier", boxCount: 1, example: true }];
}

function demoView(order: Order, state: DemoState, shipmentId?: string | null): CheckinView | null {
  const picked = pickShipment(demoShipments(order, state), shipmentId);
  if (!picked) return null;
  const s = picked.shipment;
  const recorded = state.samples.filter(item => item.orderCode === order.code && (item.shipmentId === s.id || item.shipmentId === null));
  const manifest = recorded.length
    ? recorded.map(item => ({ sampleCode: item.code, clientSampleId: item.client_sample_id ?? null }))
    : s.example ? demoOrderSamples(order, state).map((item, index) => ({ sampleCode: item.code, clientSampleId: exampleClientId(index) })) : [];
  const receipt = (state.receipts ?? []).find(item => item.shipmentId === s.id) ?? null;
  return {
    orderId: order.code, orderCode: order.code, clientName: clientName(order.clientId),
    shipment: { id: s.id, receivedAt: s.receivedAt, carrier: s.carrier, boxCount: s.boxCount, number: picked.number, of: picked.of, receipt } satisfies CheckinShipment,
    tubes: withDemoTubes(manifest, s.id, state),
  };
}

async function demoOrder(code: string) {
  const state = await readDemoState();
  const order = applyDemoState(demoOrders, state).find(item => item.code === code);
  return { state, order };
}

// ---------------------------------------------------------------- the seam

// The check-in of one received shipment of an order (the newest when none is named), or null when the order has
// no received shipment (or is not visible).
export async function getShipmentCheckin(orderCode: string, shipmentId?: string | null): Promise<CheckinView | null> {
  if (live()) return liveCheckin(orderCode, shipmentId);
  const { state, order } = await demoOrder(orderCode);
  return order ? demoView(order, state, shipmentId) : null;
}

export type AwaitingCheckin = { orderCode: string; shipmentId: string; description: string; clientName: string; receivedAt: string };

// Received shipments whose receipt is not confirmed yet: what Receive shipment lists for the tube check-in.
export async function listAwaitingCheckin(): Promise<AwaitingCheckin[]> {
  if (live()) {
    const db = await admin();
    const { data, error } = await db.from("shipment").select("id, received_at, order:order(code, title, archived_at, client:client(name))")
      .is("archived_at", null).not("received_at", "is", null).is("receipt_confirmed_at", null).order("received_at", { ascending: false }).limit(50);
    if (error) throw refusal(error);
    return ((data ?? []) as unknown as WaitingRow[]).flatMap(row => {
      const order = one(row.order);
      return order && !order.archived_at ? [{ orderCode: order.code, shipmentId: row.id, description: order.title ?? "", clientName: one(order.client)?.name ?? "Client", receivedAt: row.received_at }] : [];
    });
  }
  const state = await readDemoState();
  return applyDemoState(demoOrders, state).flatMap(order => {
    const view = order.stage >= 1 && !order.released ? demoView(order, state) : null;
    return view && !view.shipment.receipt ? [{ orderCode: order.code, shipmentId: view.shipment.id, description: order.description, clientName: view.clientName, receivedAt: view.shipment.receivedAt }] : [];
  }).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

// admin.check_in_tube(p_shipment_id, p_label, p_condition, p_box, p_position, p_note) returns uuid
export async function checkInTube(orderCode: string, shipmentId: string, input: CheckInInput): Promise<{ sampleCode: string }> {
  if (live()) {
    const db = await admin();
    const { error } = await db.rpc("check_in_tube", {
      p_shipment_id: shipmentId, p_label: input.label, p_condition: input.condition, p_box: input.box, p_position: input.position, p_note: input.note,
    });
    if (error) throw refusal(error);
    return { sampleCode: input.label.trim().toUpperCase() };
  }
  const { state, order } = await demoOrder(orderCode);
  const view = order ? demoView(order, state, shipmentId) : null;
  if (!view) throw new DataError(`Order ${orderCode} has no received shipment to check in.`);
  const stored = storedSlots((await readDemoPlacements()) ?? initialDemoPlacements()); // Storage's positions are taken too (0041)
  const result = demoCheckIn(state, input, { view, actor: demoSession.displayName, now: new Date(), id: crypto.randomUUID(), stored });
  await writeDemoState(result.state);
  return { sampleCode: result.tube.sampleCode };
}

// admin.confirm_shipment_receipt(p_shipment_id, p_note, p_storage_temperature) returns jsonb
// A receipt with tubes missing or not intact emails the order's client (notifyReceiptDiscrepancy, 0040); the demo logs it.
type ReceiptCounts = { expected: number; checked_in: number; missing: number; damaged: number };
export async function confirmReceipt(orderCode: string, shipmentId: string, note: string): Promise<void> {
  if (live()) {
    const db = await admin();
    const { data, error } = await db.rpc("confirm_shipment_receipt", { p_shipment_id: shipmentId, p_note: note, p_storage_temperature: STORAGE_TEMPERATURE });
    if (error) throw refusal(error);
    const counts = data as ReceiptCounts | null;
    if (counts) await notifyReceiptDiscrepancy(orderCode, { expected: counts.expected, checkedIn: counts.checked_in, missing: counts.missing, notIntact: counts.damaged, note: note.trim() || null });
    return;
  }
  const { state, order } = await demoOrder(orderCode);
  const view = order ? demoView(order, state, shipmentId) : null;
  if (!view) throw new DataError(`Order ${orderCode} has no received shipment to confirm.`);
  const { state: next, receipt } = demoConfirm(state, note, { view, actor: demoSession.displayName, now: new Date() });
  await writeDemoState(next);
  await notifyReceiptDiscrepancy(orderCode, { expected: receipt.expected, checkedIn: receipt.checkedIn, missing: receipt.missing, notIntact: receipt.damaged, note: receipt.note });
}
