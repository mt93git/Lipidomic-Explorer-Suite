"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { setShippingInstructions } from "@/lib/data/order-requests";
import { parseShippingText } from "@/lib/order-request";
import { DataError } from "@/lib/samples";
import { getAppSession } from "@/lib/session";

export type ShippingState = { error?: string; text?: string };

// Saves the lab's one shipping text (admin.set_shipping_instructions: lab Owner or Admin); a blank text clears it.
export async function setShippingAction(_previous: ShippingState, form: FormData): Promise<ShippingState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  const parsed = parseShippingText(form);
  const typed = String(form.get("text") ?? "");
  if (!parsed.ok) return { error: parsed.error, text: typed };
  try {
    await setShippingInstructions(parsed.text);
  } catch (error) {
    if (error instanceof DataError) return { error: error.message, text: typed };
    throw error;
  }
  return redirectAfterAction(`/shipping-instructions?saved=${parsed.text ? "1" : "cleared"}`);
}
