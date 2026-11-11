import "server-only";
import { createClient } from "@supabase/supabase-js";
import { demoClients, demoOrders, demoSession } from "../demo";
import { getEnvironment } from "../environment";
import { answerRequest, recordRequest, type Answer, type RequestInput } from "../order-request";
import { DataError } from "../samples";
import { applyDemoState } from "../samples-demo";
import { createAdminClient } from "../supabase/server";
import { readDemoState, writeDemoState } from "./demo-store";
import { demoRequesterId, notify } from "./notifications";
import { listPanels } from "./orders";

// Client order requests (0019), the lab's shipping instructions and its contact for clients (0023). Live mode calls
// the SECURITY DEFINER functions through the signed-in user's own token, so the database decides who may (request_order:
// a client admin or requester of that client; accept_order / decline_order: lab writers; set_shipping_instructions and
// set_client_contact: lab Owner or Admin).
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
type One<T> = T | T[] | null;
const one = <T>(value: One<T>) => Array.isArray(value) ? value[0] ?? null : value;
const sentence = (text: string) => `${text.trim().charAt(0).toUpperCase()}${text.trim().slice(1)}${/[.!?]$/.test(text.trim()) ? "" : "."}`;

// admin.request_order for the selected client; the code (ORD059) is read back for Client home's notice.
export async function requestOrder(clientId: string, input: RequestInput, actor: string): Promise<{ code: string }> {
  if (!live()) {
    const state = await readDemoState();
    const { state: next, order } = recordRequest(state, {
      clientId, input, orders: applyDemoState(demoOrders, state), clients: demoClients, panels: await listPanels(), actor, now: new Date(),
    });
    await writeDemoState(next);
    await notify({ kind: "order_requested", orderId: order.code, code: order.code, title: order.description, clientId, clientName: demoClients.find(client => client.id === clientId)?.name ?? "A client" });
    return { code: order.code };
  }
  const db = await admin();
  const { data, error } = await db.rpc("request_order", {
    p_client_id: clientId, p_panel_id: input.panelId, p_title: input.title, p_matrix: input.matrix,
    p_expected_samples: input.expectedSamples, p_billing_ref: input.billingRef, p_notes: input.notes,
  });
  if (error) throw refusal(error);
  const created = await db.from("order").select("code, title, client:client(name)").eq("id", String(data)).maybeSingle();
  if (created.error || !created.data) throw new DataError("Your request was sent, but its code could not be read. It is in your orders.");
  const row = created.data as unknown as { code: string; title: string | null; client: One<{ name: string }> };
  // The lab's Owner, Admin and Operator are told (0028), after the response.
  await notify({ kind: "order_requested", orderId: String(data), code: row.code, title: row.title, clientId, clientName: one(row.client)?.name ?? "A client" });
  return { code: row.code };
}

// admin.accept_order(p_order_id, p_panel_id) or admin.decline_order(p_order_id, p_reason), by order code.
export async function answerOrderRequest(code: string, answer: Answer): Promise<void> {
  if (!live()) {
    const state = await readDemoState();
    const next = answerRequest(state, { code, answer, panels: await listPanels(), actor: demoSession.displayName, now: new Date() });
    await writeDemoState(next);
    const order = (next.orders ?? []).find(item => item.code === code);
    if (order) {
      await notify({
        kind: "request_answered", orderId: code, code, title: order.description, clientId: order.clientId,
        clientName: demoClients.find(client => client.id === order.clientId)?.name ?? "your client",
        requestedBy: await demoRequesterId(order.request?.requestedBy), accepted: answer.accept, reason: answer.accept ? null : answer.reason,
      });
    }
    return;
  }
  const db = await admin();
  const found = await db.from("order").select("id, title, client_id, requested_by, client:client(name)").eq("code", code).is("archived_at", null).maybeSingle();
  if (found.error) throw refusal(found.error);
  if (!found.data) throw new DataError(`Order ${code} was not found or is archived.`);
  const order = found.data as unknown as { id: string; title: string | null; client_id: string; requested_by: string | null; client: One<{ name: string }> };
  const { error } = answer.accept
    ? await db.rpc("accept_order", { p_order_id: order.id, p_panel_id: answer.panelId })
    : await db.rpc("decline_order", { p_order_id: order.id, p_reason: answer.reason });
  if (error) throw refusal(error);
  // The person who asked is told (0028), after the response.
  await notify({
    kind: "request_answered", orderId: order.id, code, title: order.title, clientId: order.client_id, clientName: one(order.client)?.name ?? "your client",
    requestedBy: order.requested_by, accepted: answer.accept, reason: answer.accept ? null : answer.reason.trim(),
  });
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

// ---------------------------------------------------------------- the lab's contact for clients (0023)

// The current text, or null when the lab has not set one (clients then see no contact line).
export async function getClientContact(): Promise<ShippingInstructions | null> {
  if (!live()) {
    const contact = (await readDemoState()).contact;
    return contact ? { text: contact.text, setAt: contact.setAt, setBy: contact.setBy } : null;
  }
  const { data, error } = await (await admin()).from("client_contact").select("body, created_at, set_by").is("archived_at", null).maybeSingle();
  if (error) throw new Error(`The contact for clients could not be read: ${error.message}`);
  const row = data as { body: string; created_at: string; set_by: string | null } | null;
  return row ? { text: row.body, setAt: row.created_at, setBy: row.set_by } : null;
}

// The public Request access page has no session: admin.client_contact_text() with the anon key returns the text only.
// A failure shows no contact line rather than breaking the form.
export async function publicClientContact(): Promise<string | null> {
  if (!live()) return (await readDemoState()).contact?.text ?? null;
  const env = getEnvironment();
  const anon = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { schema: "admin" } });
  const { data, error } = await anon.rpc("client_contact_text");
  return error || typeof data !== "string" || !data ? null : data;
}

// admin.set_client_contact(p_body); null clears.
export async function setClientContact(text: string | null): Promise<void> {
  if (!live()) {
    const state = await readDemoState();
    await writeDemoState({ ...state, contact: text ? { text, setAt: new Date().toISOString(), setBy: demoSession.displayName } : null });
    return;
  }
  const { error } = await (await admin()).rpc("set_client_contact", { p_body: text ?? "" });
  if (error) throw refusal(error);
}
