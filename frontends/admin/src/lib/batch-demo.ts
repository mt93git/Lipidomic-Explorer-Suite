// The demo's record of batches (admin.create_batch, mark_batch_exported, mark_batch_acquired), kept in the same
// per-browser DemoState as the shipments and samples and laid over the example orders. Pure functions over an
// immutable state; the server-side store is in data/. The rules mirror 0016_batches.sql so the demo refuses what
// the database refuses.
import type { BatchDetail, BatchInjection, BatchStatus } from "./batch-run";
import { batchStatusLabel } from "./batch-run";
import type { BuilderSample, SaveInjection, StoredRules } from "./batch-builder";
import { LAB_TIME_ZONE } from "./lab-time";
import type { Client, Gate, HistoryEvent, Order } from "./models";
import { DataError, dbStages } from "./samples";
import type { DemoState } from "./samples-demo";

export type DemoBatch = {
  id: string; name: string; panel: string; status: BatchStatus; createdAt: string; createdBy: string;
  exportedAt?: string; exportedBy?: string; sequenceSha256?: string; acquiredAt?: string;
  rules: StoredRules; injections: BatchInjection[]; orderCodes: string[];
};

// Stage numbers as the demo orders carry them (see models.stages).
const REGISTERED = 2;
const IN_BATCH = 4;
const SEQUENCE_EXPORTED = 5;
const ACQUIRED = 6;
const PROCESSED = 7;
const STAGE: Record<string, number> = { planned: IN_BATCH, sequence_exported: SEQUENCE_EXPORTED, acquired: ACQUIRED };

const batches = (state: DemoState): DemoBatch[] => state.batches ?? [];
const aliquotOf = (sampleId: string) => `aliquot-${sampleId}`;
const labYear = (now: Date) => new Intl.DateTimeFormat("en", { timeZone: LAB_TIME_ZONE, year: "numeric" }).format(now);
const find = (state: DemoState, name: string): DemoBatch => {
  const batch = batches(state).find(item => item.name === name);
  if (!batch) throw new DataError(`Batch ${name} was not found.`);
  return batch;
};
const replace = (state: DemoState, next: DemoBatch): DemoState => ({ ...state, batches: batches(state).map(item => item.id === next.id ? next : item) });

// The registered samples a batch may take: orders from Registered to In batch, and not already in a batch of any status
// (the demo cannot cancel a batch), as the live builder (data/batches.ts listBuilderSamples) offers them.
export function demoBuilderSamples(state: DemoState, orders: Order[], clients: Client[]): BuilderSample[] {
  const taken = new Set(batches(state).flatMap(batch => batch.injections.map(row => row.aliquot_id)));
  return state.samples.flatMap(item => {
    const order = orders.find(candidate => candidate.code === item.orderCode);
    const client = order && clients.find(candidate => candidate.id === order.clientId);
    if (!order || !client || order.released || order.stage < REGISTERED || order.stage > IN_BATCH || taken.has(aliquotOf(item.id))) return [];
    return [{ id: item.id, code: item.code, fullName: item.full_name, orderCode: order.code, clientId: client.id, clientName: client.name }];
  }).sort((a, b) => a.code.localeCompare(b.code));
}

type CreateArgs = { panel: string; injections: SaveInjection[]; rules: StoredRules; orders: Order[]; actor: string; now: Date; id: string };

// create_batch: the next free B<yyyy>-<nnn> (after the example orders' batches too), version 1 with its rules, every
// Unknown tied to its sample's aliquot, the orders In batch. All or nothing.
export function recordBatch(state: DemoState, { panel, injections, rules, orders, actor, now, id }: CreateArgs): { state: DemoState; batch: DemoBatch } {
  if (!panel) throw new DataError("A panel is required to build a batch.");
  if (!injections.length) throw new DataError("Add at least one injection.");
  const planned = batches(state).filter(batch => batch.status === "planned");
  const rows: BatchInjection[] = injections.map(row => {
    if (row.sample_type === "Unknown") {
      const found = state.samples.find(item => item.id === row.sample_id);
      const order = found && orders.find(candidate => candidate.code === found.orderCode);
      if (!found || !order) throw new DataError(`Sample ${row.sample_id ?? "(none)"} was not found or is archived.`);
      if (order.released || order.stage < REGISTERED || order.stage > ACQUIRED) throw new DataError(`Order ${order.code} is at ${dbStages[order.stage] ?? "released"}; samples can be batched from Registered to Acquired.`);
      const clash = planned.find(batch => batch.injections.some(item => item.aliquot_id === aliquotOf(found.id)));
      if (clash) throw new DataError(`Sample ${found.full_name} is already in a planned batch (${clash.name}).`);
      return { seq: row.seq, sample_type: row.sample_type, sample_name: row.sample_name, FullName: found.full_name.trim(), client_id: order.clientId, aliquot_id: aliquotOf(found.id), plate: row.plate, vial: row.vial, sampleCode: found.code, orderCode: order.code, status: "planned" };
    }
    return { seq: row.seq, sample_type: row.sample_type, sample_name: row.sample_name, FullName: null, client_id: null, aliquot_id: null, plate: row.plate, vial: row.vial, sampleCode: null, orderCode: null, status: "planned" };
  });
  const year = labYear(now);
  const taken = [...orders.map(order => order.batch), ...batches(state).map(batch => batch.name)]
    .map(name => new RegExp(`^B${year}-(\\d+)$`).exec(name ?? "")?.[1]).filter((value): value is string => Boolean(value)).map(Number);
  const name = `B${year}-${String(Math.max(0, ...taken) + 1).padStart(3, "0")}`;
  const batch: DemoBatch = {
    id, name, panel, status: "planned", createdAt: now.toISOString(), createdBy: actor, rules, injections: rows,
    orderCodes: [...new Set(rows.flatMap(row => row.orderCode ? [row.orderCode] : []))].sort(),
  };
  return { state: { ...state, batches: [...batches(state), batch] }, batch };
}

// mark_batch_exported: freezes the sequence with its hash; only a planned batch can be exported.
export function recordExported(state: DemoState, name: string, sha256: string, actor: string, now: Date): DemoState {
  const batch = find(state, name);
  if (batch.status !== "planned") throw new DataError(`Batch ${name} is already ${batchStatusLabel(batch.status)}; only a planned batch can be exported.`);
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new DataError("The sequence hash must be 64 lowercase hex characters.");
  return replace(state, { ...batch, status: "sequence_exported", sequenceSha256: sha256, exportedAt: now.toISOString(), exportedBy: actor });
}

// mark_batch_acquired: only an exported sequence can be marked acquired.
export function recordAcquired(state: DemoState, name: string, now: Date): DemoState {
  const batch = find(state, name);
  if (batch.status === "planned") throw new DataError(`Batch ${name} is planned; export its sequence first.`);
  if (batch.status !== "sequence_exported") throw new DataError(`Batch ${name} is already ${batchStatusLabel(batch.status)}; only an exported sequence can be marked acquired.`);
  return replace(state, { ...batch, status: "acquired", acquiredAt: now.toISOString(), injections: batch.injections.map(row => row.status === "planned" ? { ...row, status: "acquired" } : row) });
}

export function toBatchDetail(batch: DemoBatch): BatchDetail {
  return {
    id: batch.id, name: batch.name, status: batch.status, panel: batch.panel, version: 1, createdAt: batch.createdAt,
    exportedAt: batch.exportedAt ?? null, exportedBy: batch.exportedBy ?? null, sequenceSha256: batch.sequenceSha256 ?? null,
    rules: batch.rules, injections: batch.injections, orderCodes: batch.orderCodes,
  };
}

const gatesFor = (batch: DemoBatch): Gate[] => batch.status === "planned"
  ? [{ label: `In batch ${batch.name}`, status: "ok" }, { label: "Sequence exported", status: "pending" }]
  : batch.status === "sequence_exported"
    ? [{ label: `Sequence exported · ${batch.name}`, status: "ok" }, { label: "Acquisition recorded", status: "pending" }]
    : [{ label: `Acquired · ${batch.name}`, status: "ok" }, { label: "Results file accepted", status: "pending" }];

function eventsFor(batch: DemoBatch): HistoryEvent[] {
  const events: HistoryEvent[] = [{ date: batch.createdAt, title: `Batch ${batch.name} planned · ${batch.injections.length} injections`, actor: batch.createdBy }];
  if (batch.exportedAt) events.push({ date: batch.exportedAt, title: `Sequence exported · ${batch.name} · SHA-256 ${batch.sequenceSha256?.slice(0, 12)}…`, actor: batch.exportedBy ?? "Lab staff" });
  if (batch.acquiredAt) events.push({ date: batch.acquiredAt, title: `Batch ${batch.name} acquired`, actor: "Lab staff" });
  return events;
}

// The orders with the demo's batches applied: the stage follows the furthest batch (never lowering an order that a
// results file already moved on), the gates and history say what happened. Orders in no batch are returned untouched.
export function applyBatchState(orders: Order[], state: DemoState): Order[] {
  const all = batches(state);
  if (!all.length) return orders;
  return orders.map(order => {
    const mine = all.filter(batch => batch.orderCodes.includes(order.code));
    if (!mine.length) return order;
    const furthest = mine.reduce((best, batch) => (STAGE[batch.status] >= STAGE[best.status] ? batch : best));
    const stage = Math.max(order.stage, STAGE[furthest.status]);
    const events = mine.flatMap(eventsFor).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    return { ...order, stage, batch: mine.at(-1)!.name, gates: stage < PROCESSED ? gatesFor(furthest) : order.gates, history: [...events, ...order.history] };
  });
}

// record_injection_status (0031): per-injection status on an exported or acquired batch, matched by injection name.
export function recordInjectionStatus(state: DemoState, name: string, rows: readonly { sample_name: string; status: string }[]): { state: DemoState; changed: number } {
  const batch = find(state, name);
  if (batch.status !== "sequence_exported" && batch.status !== "acquired") {
    throw new DataError(`Batch ${name} is ${batchStatusLabel(batch.status)}; injection status is recorded once its sequence is exported and until results are accepted.`);
  }
  if (!rows.length) throw new DataError("Send at least one injection and its status.");
  const wanted = new Map<string, string>();
  for (const row of rows) {
    if (!["planned", "acquired", "failed", "skipped"].includes(row.status)) throw new DataError(`Status "${row.status}" for ${row.sample_name} is not one of planned, acquired, failed, skipped.`);
    if (!batch.injections.some(item => item.sample_name === row.sample_name)) throw new DataError(`Batch ${name} has no injection named ${row.sample_name}.`);
    wanted.set(row.sample_name, row.status);
  }
  let changed = 0;
  const injections = batch.injections.map(item => {
    const status = wanted.get(item.sample_name);
    if (!status || status === item.status) return item;
    changed += 1;
    return { ...item, status };
  });
  return { state: replace(state, { ...batch, injections }), changed };
}
