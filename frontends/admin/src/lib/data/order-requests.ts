import "server-only";
import { demoClients, demoOrders, demoSession } from "../demo";
import { getEnvironment } from "../environment";
import { answerRequest, recordRequest, type Answer, type RequestInput } from "../order-request";
import { DataError } from "../samples";
import { applyDemoState } from "../samples-demo";
import { createAdminClient } from "../supabase/server";
import { readDemoState, writeDemoState } from "./demo-store";
import { listPanels } from "./orders";

// Client order requests (0019) and the lab's shipping instructions. Live mode calls the SECURITY DEFINER functions
// through the signed-in user's own token, so the database decides who may (request_order: a client admin or requester
// of that client; accept_order / decline_order: lab writers; set_shipping_instructions: lab Owner or Admin).
const live = () => !getEnvironment().mock;

async function admin() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}

// The database's refusal as a sentence the person can act on.
function refusal(error: { code?: string; message: string }): DataError {
  if (error.code === "PT409") return new DataError("Someone in the lab has already answered this request. Reload the order to see the answer.");
  if (error.code === "42501") return new DataError(error.message.includes("permission denied") ? "You do not have permission to do this." : sentence(error.message));
  return new DataError(sentence(error.message));
}
const sentence = (text: string) => `${text.trim().charAt(0).toUpperCase()}${text.trim().slice(1)}${/[.!?]$/.test(text.trim()) ? "" : "."}`;

// admin.request_order for the selected client; the code (ORD059) is read back for Client home's notice.
export async function requestOrder(clientId: string, input: RequestInput, actor: string): Promise<{ code: string }> {
  if (!live()) {
    const state = await readDemoState();
    const { state: next, order } = recordRequest(state, {
      clientId, input, orders: applyDemoState(demoOrders, state), clients: demoClients, panels: await listPanels(), actor, now: new Date(),
    });
    await writeDemoState(next);
    return { code: order.code };
  }
  const db = await admin();
  const { data, error } = await db.rpc("request_order", {
    p_client_id: clientId, p_panel_id: input.panelId, p_title: input.title, p_matrix: input.matrix,
    p_expected_samples: input.expectedSamples, p_billing_ref: input.billingRef, p_notes: input.notes,
  });
  if (error) throw refusal(error);
  const created = await db.from("order").select("code").eq("id", String(data)).maybeSingle();
  if (created.error || !created.data) throw new DataError("Your request was sent, but its code could not be read. It is in your orders.");
  return { code: (created.data as { code: string }).code };
}

// admin.accept_order(p_order_id, p_panel_id) or admin.decline_order(p_order_id, p_reason), by order code.
export async function answerOrderRequest(code: string, answer: Answer): Promise<void> {
  if (!live()) {
    const state = await readDemoState();
    await writeDemoState(answerRequest(state, { code, answer, panels: await listPanels(), actor: demoSession.displayName, now: new Date() }));
    return;
  }
  const db = await admin();
  const found = await db.from("order").select("id").eq("code", code).is("archived_at", null).maybeSingle();
  if (found.error) throw refusal(found.error);
  if (!found.data) throw new DataError(`Order ${code} was not found or is archived.`);
  const id = (found.data as { id: string }).id;
  const { error } = answer.accept
    ? await db.rpc("accept_order", { p_order_id: id, p_panel_id: answer.panelId })
    : await db.rpc("decline_order", { p_order_id: id, p_reason: answer.reason });
  if (error) throw refusal(error);
}

// ---------------------------------------------------------------- shipping instructions

export type ShippingInstructions = { text: string; setAt: string; setBy: string | null };

// The current text, or null when the lab has not set one (clients then read the generic sentence).
export async function getShippingInstructions(): Promise<ShippingInstructions | null> {
  if (!live()) {
    const shipping = (await readDemoState()).shipping;
    return shipping ? { text: shipping.text, setAt: shipping.setAt, setBy: shipping.setBy } : null;
  }
  const { data, error } = await (await admin()).from("shipping_instructions").select("body, created_at, set_by").is("archived_at", null).maybeSingle();
  if (error) throw new Error(`The shipping instructions could not be read: ${error.message}`);
  const row = data as { body: string; created_at: string; set_by: string | null } | null;
  return row ? { text: row.body, setAt: row.created_at, setBy: row.set_by } : null;
}

// admin.set_shipping_instructions(p_body); null clears.
export async function setShippingInstructions(text: string | null): Promise<void> {
  if (!live()) {
    const state = await readDemoState();
    await writeDemoState({ ...state, shipping: text ? { text, setAt: new Date().toISOString(), setBy: demoSession.displayName } : null });
    return;
  }
  const { error } = await (await admin()).rpc("set_shipping_instructions", { p_body: text ?? "" });
  if (error) throw refusal(error);
}
