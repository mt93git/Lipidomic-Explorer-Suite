"use server";

import { revalidatePath } from "next/cache";
import { redirectAfterAction } from "@/lib/action-redirect";
import { checkInTube, confirmReceipt } from "@/lib/data/shipment-checkin";
import { isTubeCondition, nextPosition } from "@/lib/shipment-checkin";
import { normalPosition } from "@/lib/visual-map";
import { DataError, receiveShipment } from "@/lib/data/samples";
import { parseShipmentForm, shipmentFormValues, type ShipmentField, type ShipmentFormErrors } from "@/lib/samples";
import { getAppSession } from "@/lib/session";

export type ReceiveShipmentState = { error?: string; errors?: ShipmentFormErrors; values?: Record<ShipmentField, string> };

// Records the arrival, then opens the order's sample registry. Field problems come back next to the fields
// with what was typed; a database refusal comes back as one message.
export async function receiveShipmentAction(_previous: ReceiveShipmentState, form: FormData): Promise<ReceiveShipmentState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  const values = shipmentFormValues(form);
  const parsed = parseShipmentForm(form);
  if (!parsed.ok) return { errors: parsed.errors, values };
  let shipmentId: string;
  try {
    ({ shipmentId } = await receiveShipment(parsed.value));
  } catch (error) {
    if (error instanceof DataError) return { error: error.message, values };
    throw error;
  }
  // The code only picks the registry page to open; the record itself was keyed by the order id.
  const code = String(form.get("orderCode") ?? "");
  return redirectAfterAction(/^ORD\d{3,}$/.test(code) ? `/sample-registry?order=${code}&received=${encodeURIComponent(shipmentId)}` : "/sample-registry");
}

// ---------------------------------------------------------------- tube by tube (0032)

export type CheckInValues = { condition: string; box: string; position: string };
// done: the tube just checked in; seq changes on every success so the form resets its fields to `values`.
export type CheckInState = { error?: string; done?: string; seq?: number; values?: CheckInValues };
const text = (form: FormData, name: string) => String(form.get(name) ?? "");

// Marks one scanned or typed tube checked in. On success the box stays and the next position is suggested; a refusal
// (unknown label, slot taken…) comes back as one message with what was chosen.
export async function checkInTubeAction(previous: CheckInState, form: FormData): Promise<CheckInState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  const values: CheckInValues = { condition: text(form, "condition") || "intact", box: text(form, "box"), position: text(form, "position") };
  const condition = values.condition;
  if (!isTubeCondition(condition)) return { error: "Choose the tube's condition: intact, hemolyzed, thawed or other.", values };
  let sampleCode: string;
  try {
    ({ sampleCode } = await checkInTube(text(form, "orderCode"), text(form, "shipmentId"), { label: text(form, "label"), condition, box: values.box, position: values.position, note: text(form, "note") }));
  } catch (error) {
    if (error instanceof DataError) return { error: error.message, values, seq: previous.seq };
    throw error;
  }
  revalidatePath("/receive-shipment");
  const box = values.box.trim();
  return { done: sampleCode, seq: (previous.seq ?? 0) + 1, values: { condition: "intact", box, position: box ? nextPosition(normalPosition(values.position).toUpperCase()) : "" } };
}

export type ConfirmState = { error?: string; note?: string };

// Confirms the receipt; missing or damaged tubes need the note (the database refuses otherwise). Then the same
// screen opens, closed, with the confirmation.
export async function confirmReceiptAction(_previous: ConfirmState, form: FormData): Promise<ConfirmState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  const code = text(form, "orderCode"), shipmentId = text(form, "shipmentId"), note = text(form, "note");
  try {
    await confirmReceipt(code, shipmentId, note);
  } catch (error) {
    if (error instanceof DataError) return { error: error.message, note };
    throw error;
  }
  return redirectAfterAction(`/receive-shipment?order=${encodeURIComponent(code)}&shipment=${encodeURIComponent(shipmentId)}&confirmed=1`);
}
