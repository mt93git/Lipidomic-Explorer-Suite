// The demo's record of shipments and samples, kept apart from the fixed example orders in demo.ts and laid
// over them for the screens. Pure functions over an immutable DemoState; the server-side store is in data/.
import { LAB_TIME_ZONE } from "./lab-time";
import { stages, type Gate, type HistoryEvent, type Order } from "./models";
import { conditionLabels, DataError, plural, registryClosedProblem, type SampleInput, type ShipmentInput } from "./samples";
import { applyReleaseState, demoPolicy, type DemoDataset } from "./release-demo";
import type { ReleasePolicy } from "./release";
import { applyBatchState, type DemoBatch } from "./batch-demo";

export type DemoShipment = {
  id: string; orderCode: string; carrier: string; trackingNumber: string | null; condition: ShipmentInput["condition"];
  boxCount: number; notes: string | null; receivedAt: string; receivedBy: string;
};
export type DemoSample = SampleInput & { id: string; orderCode: string; shipmentId: string | null; sampleNumber: number; code: string; createdAt: string; registeredBy: string };
// An accepted SCIEX OS results file (accept_result_file): the order then reads Processed.
export type DemoResult = { id: string; orderCode: string; sha256: string; acceptedAt: string; acceptedBy: string };
// One record set per browser, shared by every demo screen (receive, registry, results, release, pipeline, detail).
// Datasets, their signatures and releases, and the release policy are the release side's records (release-demo.ts).
// Orders created with New order (create_order) join the example orders in applyDemoState, so every screen sees them.
export type DemoState = { shipments: DemoShipment[]; samples: DemoSample[]; results: DemoResult[]; datasets: DemoDataset[]; releasePolicy?: ReleasePolicy; orders?: Order[]; batches?: DemoBatch[] };

export const emptyDemoState = (): DemoState => ({ shipments: [], samples: [], results: [], datasets: [] });

// Order.received is a calendar day as the lab reads it (America/New_York), like the example orders' dates.
const labDay = new Intl.DateTimeFormat("en-CA", { timeZone: LAB_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

const REQUEST = 0;
const RECEIVED = 1;
const REGISTERED = 2;
const ACQUIRED = 6;
const PROCESSED = 7;

// ORD042-S037: order code + per-order number, three digits minimum, never a client name (admin.assign_sample_code).
export function sampleCode(orderCode: string, sampleNumber: number): string {
  return `${orderCode}-S${sampleNumber < 1000 ? String(sampleNumber).padStart(3, "0") : String(sampleNumber)}`;
}

type ShipmentArgs = { order: Pick<Order, "code" | "stage">; shipment: Omit<ShipmentInput, "orderId">; actor: string; now: Date; id: string };

// receive_shipment: only an order at Request can arrive; the order then reads Received.
export function recordShipment(state: DemoState, { order, shipment, actor, now, id }: ShipmentArgs): { state: DemoState; shipment: DemoShipment } {
  if (order.stage !== REQUEST) throw new DataError(`${order.code} is already ${stages[order.stage]}; a shipment can only be received for an order at Request.`);
  const saved: DemoShipment = {
    id, orderCode: order.code, carrier: shipment.carrier, trackingNumber: shipment.trackingNumber, condition: shipment.condition,
    boxCount: shipment.boxCount, notes: shipment.notes, receivedAt: now.toISOString(), receivedBy: actor,
  };
  return { state: { ...state, shipments: [...state.shipments, saved] }, shipment: saved };
}

type SamplesArgs = { order: Pick<Order, "code" | "stage">; shipmentId: string | null; samples: SampleInput[]; actor: string; now: Date; nextId: () => string };

// register_samples: all-or-nothing, codes assigned in sequence per order, duplicate FullName refused with
// the name in the message; the order reads Registered.
export function recordSamples(state: DemoState, { order, shipmentId, samples, actor, now, nextId }: SamplesArgs): { state: DemoState; samples: DemoSample[] } {
  const closed = registryClosedProblem(order.code, order.stage);
  if (closed) throw new DataError(closed);
  if (!samples.length) throw new DataError("Add at least one sample.");
  const existing = state.samples.filter(sample => sample.orderCode === order.code);
  const taken = new Set(existing.map(sample => sample.full_name));
  const seen = new Set<string>();
  for (const sample of samples) {
    const name = sample.full_name.trim();
    if (!name) throw new DataError("Every sample needs a FullName.");
    if (taken.has(name)) throw new DataError(`A sample named ${name} is already registered in ${order.code}.`);
    if (seen.has(name)) throw new DataError(`FullName ${name} appears more than once in this list.`);
    seen.add(name);
  }
  let number = existing.reduce((max, sample) => Math.max(max, sample.sampleNumber), 0);
  const created = samples.map(sample => {
    number += 1;
    return { ...sample, full_name: sample.full_name.trim(), id: nextId(), orderCode: order.code, shipmentId, sampleNumber: number, code: sampleCode(order.code, number), createdAt: now.toISOString(), registeredBy: actor };
  });
  return { state: { ...state, samples: [...state.samples, ...created] }, samples: created };
}

type ResultArgs = { order: Pick<Order, "code" | "stage" | "released">; id: string; sha256: string; actor: string; now: Date };

// accept_result_file: a results file is accepted for a Registered or Acquired order; the order reads Processed.
export function recordResultFile(state: DemoState, { order, id, sha256, actor, now }: ResultArgs): DemoState {
  if (order.released || (order.stage !== REGISTERED && order.stage !== ACQUIRED)) throw new DataError("The order is no longer acquired or registered.");
  return { ...state, results: [...(state.results ?? []), { id, orderCode: order.code, sha256, acceptedAt: now.toISOString(), acceptedBy: actor }] };
}

function shipmentTitle(shipment: DemoShipment): string {
  const tracking = shipment.trackingNumber ? ` ${shipment.trackingNumber}` : "";
  return `Shipment received · ${shipment.carrier}${tracking} · ${plural(shipment.boxCount, "box", "boxes")} · ${conditionLabels[shipment.condition].toLowerCase()}`;
}

// The example orders with the demo's shipments and samples applied: stage, received date, gates, history and
// progress follow what was recorded. Orders without records are returned untouched.
export function applyDemoState(examples: Order[], state: DemoState): Order[] {
  return applyBatchState(applyRecordedState(examples, state), state);
}

function applyRecordedState(examples: Order[], state: DemoState): Order[] {
  const orders = state.orders?.length ? [...examples, ...state.orders] : examples;
  const results = state.results ?? [];
  const datasets = state.datasets ?? [];
  if (!state.shipments.length && !state.samples.length && !results.length && !datasets.length) return orders;
  const policy = demoPolicy(state);
  return orders.map(order => applyReleaseState(applyRecords(order), datasets.filter(dataset => dataset.orderCode === order.code), policy));
  function applyRecords(order: Order): Order {
    const shipment = state.shipments.filter(item => item.orderCode === order.code).at(-1);
    const samples = state.samples.filter(item => item.orderCode === order.code);
    const result = results.filter(item => item.orderCode === order.code).at(-1);
    if (!shipment && !samples.length && !result) return order;
    if (!shipment && !samples.length && result) {
      // An example order that was already registered or acquired: only the results file is new.
      return { ...order, stage: Math.max(order.stage, PROCESSED), gates: resultGates, history: [resultEvent(result), ...order.history] };
    }
    const stage = Math.max(order.stage, result ? PROCESSED : samples.length ? REGISTERED : RECEIVED);
    const conditionGate: Gate = !shipment ? { label: "Arrival condition", status: "pending" }
      : shipment.condition === "ok" ? { label: "Arrival condition recorded · intact and cold", status: "ok" }
      : { label: `Arrived ${conditionLabels[shipment.condition].toLowerCase()} · condition review`, status: "fail" };
    const gates: Gate[] = result ? resultGates : [
      { label: "Shipment logged", status: shipment ? "ok" : "pending" },
      conditionGate,
      samples.length ? { label: `${plural(samples.length, "sample")} registered with metadata`, status: "ok" } : { label: "Sample registry", status: "pending" },
      ...(samples.length ? [{ label: "Operator approval of the sample registry", status: "pending" as const }] : []),
    ];
    const events: HistoryEvent[] = [];
    if (shipment) events.push({ date: shipment.receivedAt, title: shipmentTitle(shipment), actor: shipment.receivedBy });
    const batches = new Map<string, DemoSample[]>();
    for (const sample of samples) batches.set(sample.createdAt, [...(batches.get(sample.createdAt) ?? []), sample]);
    for (const [date, batch] of batches) {
      const range = batch.length > 1 ? `${batch[0].code} to ${batch[batch.length - 1].code}` : batch[0].code;
      events.push({ date, title: `${plural(batch.length, "sample")} registered · ${range}`, actor: batch[0].registeredBy });
    }
    if (result) events.push(resultEvent(result));
    // As live: the expected count, or more when more samples were registered (an order created without one).
    const sampleCount = Math.max(order.sampleCount, samples.length);
    return {
      ...order, stage, gates, sampleCount,
      received: shipment ? labDay.format(new Date(shipment.receivedAt)) : order.received,
      completedSamples: samples.length ? Math.min(sampleCount, samples.length) : Math.min(sampleCount, Math.round(sampleCount * (stage + 1) / 10)),
      history: [...events.reverse(), ...order.history],
    };
  }
}

const resultGates: Gate[] = [{ label: "Results file accepted", status: "ok" }, { label: "QC review", status: "pending" }];
function resultEvent(result: DemoResult): HistoryEvent {
  return { date: result.acceptedAt, title: `Results file accepted · SHA-256 ${result.sha256.slice(0, 12)}…`, actor: result.acceptedBy };
}
