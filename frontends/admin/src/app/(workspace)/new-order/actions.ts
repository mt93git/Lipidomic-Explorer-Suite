"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { createOrder } from "@/lib/data/orders";
import { orderFormValues, parseOrderForm, type OrderField, type OrderFormErrors } from "@/lib/new-order";
import { DataError } from "@/lib/samples";
import { getAppSession } from "@/lib/session";

export type NewOrderState = { error?: string; errors?: OrderFormErrors; values?: Record<OrderField, string> };

// Creates the order (admin.create_order), then shows its code with the next steps. Field problems come back next
// to the fields with what was typed; a database refusal comes back as one message.
export async function createOrderAction(_previous: NewOrderState, form: FormData): Promise<NewOrderState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  const values = orderFormValues(form);
  const parsed = parseOrderForm(form);
  if (!parsed.ok) return { errors: parsed.errors, values };
  let code: string;
  try {
    ({ code } = await createOrder(parsed.value));
  } catch (error) {
    if (error instanceof DataError) return { error: error.message, values };
    throw error;
  }
  return redirectAfterAction(`/new-order?created=${encodeURIComponent(code)}`);
}
