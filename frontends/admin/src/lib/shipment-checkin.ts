// Receive shipment, tube by tube (0032_shipment_tubes.sql): the manifest of a received shipment, each tube's
// check-in, the tallies the four tiles show and the rule for the discrepancy note. Pure functions; the database
// contract is admin.check_in_tube / admin.confirm_shipment_receipt / admin.shipment_checkin, and the demo's records
// (demoCheckIn, demoConfirm) follow the same rules so both modes behave alike.
import { LAB_TIME_ZONE } from "./lab-time";
import { DataError, plural } from "./samples";
import { normalPosition, parsePosition, positionName } from "./visual-map";

export const tubeConditions = ["intact", "hemolyzed", "thawed", "other"] as const;
export type TubeCondition = (typeof tubeConditions)[number];
export const isTubeCondition = (value: unknown): value is TubeCondition => tubeConditions.includes(value as TubeCondition);
export const tubeConditionNotes: Record<TubeCondition, string> = {
  intact: "Sealed, frozen, label readable.",
  hemolyzed: "Red or pink plasma or serum.",
  thawed: "Arrived liquid or partly thawed.",
  other: "Cracked, leaking, unreadable… describe it.",
};
// The lab stores received tubes at −80 °C; the temperature is recorded on the receipt.
export const STORAGE_TEMPERATURE = "−80 °C";

// One tube on the manifest (a registered sample of the order) and its live check-in, if any.
export type ManifestTube = {
  sampleCode: string; clientSampleId: string | null;
  checkIn: { condition: TubeCondition; note: string | null; box: string | null; position: string | null; at: string } | null;
};
export type Receipt = { confirmedAt: string; confirmedBy: string | null; note: string | null; missing: number; damaged: number; storageTemperature: string | null };
export type CheckinShipment = {
  id: string; receivedAt: string; carrier: string | null; boxCount: number | null;
  // 1-based place among the order's received shipments, and how many there are.
  number: number; of: number; receipt: Receipt | null;
};
export type CheckinView = { orderId: string; orderCode: string; clientName: string; shipment: CheckinShipment; tubes: ManifestTube[] };

export type Tally = { expected: number; checkedIn: number; missing: number; hemolyzed: number; thawed: number; other: number; damaged: number; boxes: string[] };
export function tally(tubes: readonly ManifestTube[]): Tally {
  const checked = tubes.filter(tube => tube.checkIn);
  const count = (condition: TubeCondition) => checked.filter(tube => tube.checkIn!.condition === condition).length;
  const boxes = new Map<string, number>();
  for (const tube of checked) if (tube.checkIn!.box) boxes.set(tube.checkIn!.box, (boxes.get(tube.checkIn!.box) ?? 0) + 1);
  return {
    expected: tubes.length, checkedIn: checked.length, missing: tubes.length - checked.length,
    hemolyzed: count("hemolyzed"), thawed: count("thawed"), other: count("other"), damaged: checked.length - count("intact"),
    // Most used first, so the tile names the box most tubes went into.
    boxes: [...boxes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en", { numeric: true })).map(([box]) => box),
  };
}

// A note is required once a tube is missing or arrived in any condition other than intact.
export const noteRequired = (t: Pick<Tally, "missing" | "damaged">) => t.missing > 0 || t.damaged > 0;

// The sentence above the note box: what differs from the manifest and what confirming does.
export function discrepancySummary(t: Tally): string {
  const parts: string[] = [];
  if (t.missing) parts.push(`${plural(t.missing, "tube")} listed on the manifest ${t.missing === 1 ? "was" : "were"} not in the box`);
  const damaged = [[t.hemolyzed, "hemolyzed"], [t.thawed, "thawed"], [t.other, "in another condition"]] as const;
  const arrived = damaged.filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}`);
  if (arrived.length) parts.push(`${arrived.join(", ")} on arrival`);
  if (!parts.length) {
    return t.expected && !t.missing
      ? "Every tube on the manifest is checked in and intact. A note is optional; the client sees it on their order."
      : "Nothing differs from the manifest yet. A note is optional; the client sees it on their order.";
  }
  const first = parts.join("; ");
  return `${first[0].toUpperCase()}${first.slice(1)}. Receipt can be confirmed with a note; the client is told automatically.`;
}

// The storage tile: "stored in Box B12" (the box most tubes went into), "stored in B12 and 2 more boxes", or not yet.
export function storageLabel(t: Pick<Tally, "boxes">): string {
  if (!t.boxes.length) return "no box recorded yet";
  if (t.boxes.length === 1) return `stored in Box ${t.boxes[0]}`;
  return `stored in Box ${t.boxes[0]} and ${plural(t.boxes.length - 1, "more box", "more boxes")}`;
}

// "arrived today 10:42", "arrived Nov 12, 10:42", as the lab's clock reads it.
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: LAB_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: LAB_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: LAB_TIME_ZONE, month: "short", day: "numeric" });
export function arrivedPhrase(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "arrival time not recorded";
  const yesterday = new Date(now.getTime() - 86_400_000);
  const when = dayKey.format(at) === dayKey.format(now) ? "today" : dayKey.format(at) === dayKey.format(yesterday) ? "yesterday" : monthDay.format(at) + ",";
  return `arrived ${when} ${hhmm.format(at)}`;
}

export const headerLine = (view: Pick<CheckinView, "clientName" | "shipment">, now?: Date) =>
  `${view.clientName} · shipment ${view.shipment.number} of ${view.shipment.of} · ${arrivedPhrase(view.shipment.receivedAt, now)}`;

// A box and a position, as the Storage screen writes them: the box trimmed, the position a grid cell (c4 → C4).
export function slotOf(box: string, position: string): { box: string | null; position: string | null } {
  const b = box.trim(), p = position.trim();
  if (!b && !p) return { box: null, position: null };
  if (!b || !p) throw new DataError("Enter both a box and a position, or neither.");
  return { box: b, position: normalPosition(p).toUpperCase() };
}

// The cell after this one in a 9-column cryobox (C9 → D1), so the next tube's position is filled in.
export function nextPosition(position: string | null, columns = 9): string {
  const parsed = parsePosition(position ?? "");
  if (!parsed) return position ?? "";
  return parsed.column >= columns ? positionName(parsed.row + 1, 1) : positionName(parsed.row, parsed.column + 1);
}

// Which tube of the manifest a scanned or typed label means: its sample code (any case), or else the client's own
// sample id when only one tube carries it. The database (check_in_tube) applies the same rule.
export function matchLabel(tubes: readonly ManifestTube[], label: string, orderCode: string): ManifestTube {
  const text = label.trim();
  if (!text) throw new DataError("Scan or type a tube label.");
  const byCode = tubes.find(tube => tube.sampleCode === text.toUpperCase());
  if (byCode) return byCode;
  const byClient = tubes.filter(tube => tube.clientSampleId && tube.clientSampleId.toLowerCase() === text.toLowerCase());
  if (byClient.length > 1) throw new DataError(`Client ID ${text} is on ${byClient.length} tubes of ${orderCode}; scan the ORD label instead.`);
  if (byClient.length === 1) return byClient[0];
  const other = /^ORD\d{3,}/i.exec(text)?.[0].toUpperCase();
  if (other && other !== orderCode) throw new DataError(`Tube ${text.toUpperCase()} belongs to order ${other}, not to ${orderCode}.`);
  throw new DataError(`Unknown tube label ${text}: it is not on the manifest of ${orderCode}.`);
}

// What the database says, told the way the screen says it.
export function checkinProblem(message: string): string {
  const text = message.replace(/^./, first => first.toUpperCase());
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

// ---------------------------------------------------------------- demo records

export type DemoTube = {
  id: string; shipmentId: string; orderCode: string; sampleCode: string; condition: TubeCondition; note: string | null;
  box: string | null; position: string | null; checkedInAt: string; checkedInBy: string; archivedReason?: string;
};
export type DemoReceipt = Receipt & { shipmentId: string; orderCode: string; expected: number; checkedIn: number };
export type DemoCheckinState = { tubes?: DemoTube[]; receipts?: DemoReceipt[] };

export type CheckInInput = { label: string; condition: TubeCondition; box: string; position: string; note: string };
// stored: the live placements of Storage (box, position, aliquot code); their positions are taken too (0041).
type DemoArgs = { view: CheckinView; actor: string; now: Date; id: string; stored?: { box: string; position: string; code: string }[] };

// check_in_tube in the demo: same refusals, same "checked in again" history.
export function demoCheckIn<S extends DemoCheckinState>(state: S, input: CheckInInput, { view, actor, now, id, stored = [] }: DemoArgs): { state: S; tube: DemoTube } {
  if (view.shipment.receipt) throw new DataError(`The receipt of this shipment of ${view.orderCode} is already confirmed; its tubes cannot change.`);
  if (!isTubeCondition(input.condition)) throw new DataError("Choose the tube's condition: intact, hemolyzed, thawed or other.");
  const note = input.note.trim() || null;
  if (input.condition === "other" && !note) throw new DataError("Describe the tube's condition (other).");
  const tube = matchLabel(view.tubes, input.label, view.orderCode);
  const slot = slotOf(input.box, input.position);
  const live = (state.tubes ?? []).filter(item => !item.archivedReason);
  if (slot.box) {
    const holder = live.find(item => item.box === slot.box && item.position === slot.position && item.sampleCode !== tube.sampleCode);
    if (holder) throw new DataError(`Box ${slot.box} position ${slot.position} already holds tube ${holder.sampleCode}.`);
    const box = slot.box, position = slot.position ?? "";
    const aliquot = stored.find(item => item.box.trim().toUpperCase() === box.toUpperCase() && item.position.trim().toUpperCase() === position.toUpperCase());
    if (aliquot) throw new DataError(`Box ${box} position ${position} already holds aliquot ${aliquot.code} in Storage; choose another position.`);
  }
  const saved: DemoTube = { id, shipmentId: view.shipment.id, orderCode: view.orderCode, sampleCode: tube.sampleCode, condition: input.condition, note, ...slot, checkedInAt: now.toISOString(), checkedInBy: actor };
  const tubes = (state.tubes ?? []).map(item => !item.archivedReason && item.shipmentId === view.shipment.id && item.sampleCode === tube.sampleCode ? { ...item, archivedReason: "checked in again" } : item);
  return { state: { ...state, tubes: [...tubes, saved] }, tube: saved };
}

// confirm_shipment_receipt in the demo.
export function demoConfirm<S extends DemoCheckinState>(state: S, noteText: string, { view, actor, now }: Omit<DemoArgs, "id">): { state: S; receipt: DemoReceipt } {
  if (view.shipment.receipt) throw new DataError(`The receipt of this shipment of ${view.orderCode} is already confirmed.`);
  if (!view.tubes.length) throw new DataError(`Order ${view.orderCode} has no registered samples on this shipment; register them before confirming the receipt tube by tube.`);
  const t = tally(view.tubes);
  const note = noteText.trim() || null;
  if (noteRequired(t) && !note) throw new DataError(`${plural(t.missing, "tube")} missing and ${t.damaged} damaged: write a discrepancy note; the client reads it on their order.`);
  if (note && note.length > 2000) throw new DataError("The discrepancy note is longer than 2000 characters.");
  const receipt: DemoReceipt = {
    shipmentId: view.shipment.id, orderCode: view.orderCode, confirmedAt: now.toISOString(), confirmedBy: actor, note,
    expected: t.expected, checkedIn: t.checkedIn, missing: t.missing, damaged: t.damaged, storageTemperature: STORAGE_TEMPERATURE,
  };
  return { state: { ...state, receipts: [...(state.receipts ?? []), receipt] }, receipt };
}

// The demo's live check-ins laid over a manifest.
export function withDemoTubes(manifest: readonly Omit<ManifestTube, "checkIn">[], shipmentId: string, state: DemoCheckinState): ManifestTube[] {
  const live = (state.tubes ?? []).filter(item => item.shipmentId === shipmentId && !item.archivedReason);
  return manifest.map(tube => {
    const found = live.find(item => item.sampleCode === tube.sampleCode);
    return { ...tube, checkIn: found ? { condition: found.condition, note: found.note, box: found.box, position: found.position, at: found.checkedInAt } : null };
  });
}

// The order history line for a confirmed receipt (lab side), live and demo alike.
export function receiptTitle(receipt: Pick<Receipt, "missing" | "damaged" | "note">): string {
  const counts = receipt.missing || receipt.damaged
    ? [receipt.missing ? `${receipt.missing} missing` : "", receipt.damaged ? `${receipt.damaged} damaged` : ""].filter(Boolean).join(", ")
    : "every tube checked in intact";
  return `Receipt confirmed · ${counts}${receipt.note ? ` · note: ${receipt.note}` : ""}`;
}
