// Storage (0025): which box and position holds each aliquot. Pure: the types the screen shows, the checks the actions
// make before calling the database, and the demo's version of place_aliquot / move_aliquot / remove_aliquot (same
// rules, same wording). The data seam is data/storage.ts.
import type { Order } from "./models";
import { DataError } from "./samples";

// One aliquot as the Storage screen lists it. location is its live placement; archivedReason is set when the aliquot
// itself is archived (it may still sit in a box until someone removes it).
export type StorageLocation = { box: string; position: string; placedAt: string };
export type StoredAliquot = {
  id: string; code: string; sampleCode: string; clientName: string; orderCode: string; archivedReason: string | null; location: StorageLocation | null;
};
export type BoxSummary = { box: string; occupied: number };

export const ALIQUOT_CODE = /^ORD\d{3,}-S\d{3,}-A\d+$/;
export const ALIQUOT_ID = /^[A-Za-z0-9-]{1,64}$/;
export const MAX_REASON = 500;
export const MAX_SEARCH = 40;

// A1, A2, … A10 in the lab's order, not the alphabet's.
const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export const byPosition = (a: StoredAliquot, b: StoredAliquot) => natural.compare(a.location?.position ?? "", b.location?.position ?? "") || natural.compare(a.code, b.code);
export const byBox = (a: BoxSummary, b: BoxSummary) => natural.compare(a.box, b.box);

export const describeLocation = (location: StorageLocation) => `box ${location.box}, position ${location.position}`;

// a09's selected position: what is known about the aliquot beyond where it is. volumeUl: admin.aliquot.volume_ul when
// recorded. nextBatch: the batch it will be injected in next. kind: admin.aliquot.kind (0041), the prototype's "Type".
export type AliquotKind = "original" | "re_extraction";
export const aliquotKindLabels: Record<AliquotKind, string> = { original: "Original", re_extraction: "Re-extraction" };
export const isAliquotKind = (value: unknown): value is AliquotKind => value === "original" || value === "re_extraction";
// The demo's rule, as assign_aliquot_code's: a sample's first aliquot (-A1) is the original, a later one a re-extraction.
export const kindFromCode = (code: string): AliquotKind => /-A1$/.test(code) ? "original" : "re_extraction";
export type AliquotPlans = { volumeUl: number | null; nextBatch: string | null; kind: AliquotKind | null };
export type PlannedInjection = { batch: string; batchStatus: string; batchArchived: boolean; versionArchived: boolean; injectionStatus: string };
// The first (in name order) live batch, planned or with its sequence exported, in which the aliquot's injection is
// still planned. Acquired and later batches, archived batches or versions and done injections do not count.
export function nextBatchOf(rows: readonly PlannedInjection[]): string | null {
  const open = rows.filter(row => !row.batchArchived && !row.versionArchived && row.injectionStatus === "planned"
    && (row.batchStatus === "planned" || row.batchStatus === "sequence_exported"));
  return open.map(row => row.batch).sort(natural.compare)[0] ?? null;
}

// The form's box and position, trimmed; blank refused (the database checks again).
export function parseSlot(form: FormData): { ok: true; box: string; position: string } | { ok: false; error: string } {
  const box = String(form.get("box") ?? "").trim();
  const position = String(form.get("position") ?? "").trim();
  if (!box) return { ok: false, error: "Enter a box." };
  if (!position) return { ok: false, error: "Enter a position in the box." };
  return { ok: true, box, position };
}

export function parseReason(form: FormData): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason || reason.length > MAX_REASON) return { ok: false, error: `Say why the aliquot leaves its box (${MAX_REASON} characters at most).` };
  return { ok: true, reason };
}

export const normalizeSearch = (value: string | undefined) => (value ?? "").trim().slice(0, MAX_SEARCH);

// ---------------------------------------------------------------- demo

// The demo's aliquots are fixed synthetic examples of example orders (demo.ts) that are past arrival; the demo store
// keeps only the placements, so a fresh browser starts with two boxes and a few aliquots waiting for one.
export type DemoAliquot = { id: string; code: string; sampleCode: string; orderCode: string; archivedReason?: string };
export type DemoPlacement = { id: string; aliquotId: string; box: string; position: string; placedAt: string; archivedAt: string | null; archivedReason: string | null };

const demoAliquot = (order: string, sample: number): DemoAliquot => {
  const sampleCode = `${order}-S${String(sample).padStart(3, "0")}`;
  return { id: `example-aliquot-${sampleCode.toLowerCase()}-a1`, code: `${sampleCode}-A1`, sampleCode, orderCode: order };
};
export const demoAliquots: DemoAliquot[] = [
  ...[1, 2, 3, 4, 5, 6].map(n => demoAliquot("ORD044", n)),
  ...[1, 2, 3, 4].map(n => demoAliquot("ORD046", n)),
  ...[1, 2, 3].map(n => demoAliquot("ORD058", n)),
];
const PLACED_AT = "2026-11-05T15:10:00Z";
const slot = (aliquot: DemoAliquot, box: string, position: string): DemoPlacement =>
  ({ id: `example-placement-${aliquot.code.toLowerCase()}`, aliquotId: aliquot.id, box, position, placedAt: PLACED_AT, archivedAt: null, archivedReason: null });
export const initialDemoPlacements = (): DemoPlacement[] => [
  ...demoAliquots.filter(item => item.orderCode === "ORD046").map((item, index) => slot(item, "F1-R1-B01", `A${index + 1}`)),
  ...demoAliquots.filter(item => item.orderCode === "ORD044").slice(0, 3).map((item, index) => slot(item, "F1-R1-B02", `A${index + 1}`)),
];

// The demo's rows: every example aliquot with its live placement, its order's client and stage.
export function demoStorageRows(placements: DemoPlacement[], orders: Order[], clientName: (id: string) => string): (StoredAliquot & { orderStage: number })[] {
  return demoAliquots.flatMap(item => {
    const order = orders.find(candidate => candidate.code === item.orderCode);
    if (!order) return [];
    const live = placements.find(placement => placement.aliquotId === item.id && !placement.archivedAt);
    return [{
      id: item.id, code: item.code, sampleCode: item.sampleCode, clientName: clientName(order.clientId), orderCode: item.orderCode, orderStage: order.stage,
      archivedReason: item.archivedReason ?? null, location: live ? { box: live.box, position: live.position, placedAt: live.placedAt } : null,
    }];
  });
}

type Change = { placements: DemoPlacement[]; aliquotId: string; now: Date; id: string };
const findAliquot = (aliquotId: string) => {
  const found = demoAliquots.find(item => item.id === aliquotId);
  if (!found) throw new DataError("Aliquot not found.");
  return found;
};
const livePlacement = (placements: DemoPlacement[], aliquotId: string) => placements.find(item => item.aliquotId === aliquotId && !item.archivedAt);
function requireFreeSlot(placements: DemoPlacement[], box: string, position: string) {
  const holder = placements.find(item => !item.archivedAt && item.box === box && item.position === position);
  if (holder) throw new DataError(`Box ${box} position ${position} already holds ${findAliquot(holder.aliquotId).code}.`);
}
function cleanSlot(box: string, position: string) {
  const b = box.trim();
  const p = position.trim();
  if (!b) throw new DataError("Enter a box.");
  if (!p) throw new DataError("Enter a position in the box.");
  return { box: b, position: p };
}

export function demoPlace({ placements, aliquotId, now, id, box, position }: Change & { box: string; position: string }): DemoPlacement[] {
  const target = cleanSlot(box, position);
  const aliquot = findAliquot(aliquotId);
  if (aliquot.archivedReason) throw new DataError(`Aliquot ${aliquot.code} is archived (${aliquot.archivedReason}); it cannot be placed.`);
  const current = livePlacement(placements, aliquotId);
  if (current) throw new DataError(`Aliquot ${aliquot.code} is already in box ${current.box} position ${current.position}; move it instead.`);
  requireFreeSlot(placements, target.box, target.position);
  return [...placements, { id, aliquotId, ...target, placedAt: now.toISOString(), archivedAt: null, archivedReason: null }];
}

export function demoMove({ placements, aliquotId, now, id, box, position }: Change & { box: string; position: string }): DemoPlacement[] {
  const target = cleanSlot(box, position);
  const aliquot = findAliquot(aliquotId);
  if (aliquot.archivedReason) throw new DataError(`Aliquot ${aliquot.code} is archived (${aliquot.archivedReason}); remove it from its box instead.`);
  const current = livePlacement(placements, aliquotId);
  if (!current) throw new DataError(`Aliquot ${aliquot.code} is not in a box; place it instead.`);
  if (current.box === target.box && current.position === target.position) throw new DataError(`Aliquot ${aliquot.code} is already in box ${current.box} position ${current.position}.`);
  requireFreeSlot(placements, target.box, target.position);
  const at = now.toISOString();
  return [...placements.map(item => item === current ? { ...item, archivedAt: at, archivedReason: "moved" } : item),
    { id, aliquotId, ...target, placedAt: at, archivedAt: null, archivedReason: null }];
}

export function demoRemove({ placements, aliquotId, now, reason }: Omit<Change, "id"> & { reason: string }): DemoPlacement[] {
  const why = reason.trim();
  if (!why || why.length > MAX_REASON) throw new DataError(`Say why the aliquot leaves its box (${MAX_REASON} characters at most).`);
  const aliquot = findAliquot(aliquotId);
  const current = livePlacement(placements, aliquotId);
  if (!current) throw new DataError(`Aliquot ${aliquot.code} is not in a box.`);
  return placements.map(item => item === current ? { ...item, archivedAt: now.toISOString(), archivedReason: why } : item);
}
