"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
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
