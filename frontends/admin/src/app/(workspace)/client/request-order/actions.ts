"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { requestOrder } from "@/lib/data/order-requests";
import { mayRequestOrders, parseRequestForm, requestFormValues, type RequestField, type RequestFormErrors } from "@/lib/order-request";
import { DataError } from "@/lib/samples";
import { getAppSession } from "@/lib/session";

export type RequestState = { error?: string; errors?: RequestFormErrors; values?: Record<RequestField, string> };

// Sends the request for the selected client (admin.request_order), then returns to Client home with its code. The
// client is never a form field: it is the session's selected client, and the database checks the role in it again.
export async function requestOrderAction(_previous: RequestState, form: FormData): Promise<RequestState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "client") return redirectAfterAction("/pipeline");
  const client = session.selectedClient;
  if (!client) return redirectAfterAction("/choose-client");
  const values = requestFormValues(form);
  if (!mayRequestOrders(client.role)) return { error: `As a ${client.role ?? "Viewer"} at ${client.name} you can follow orders but not request them. Ask your client admin.`, values };
  const parsed = parseRequestForm(form);
  if (!parsed.ok) return { errors: parsed.errors, values };
  let code: string;
  try {
    ({ code } = await requestOrder(client.id, parsed.value, session.displayName));
  } catch (error) {
    if (error instanceof DataError) return { error: error.message, values };
    throw error;
  }
  return redirectAfterAction(`/client/home?requested=${encodeURIComponent(code)}`);
}
