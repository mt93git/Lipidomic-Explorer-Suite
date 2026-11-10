// Client order requests (F2, 0019): the client's Request an order form, the lab's answer, the Pipeline notice and the
// lab's shipping instructions. Pure functions; the database calls (request_order, accept_order, decline_order,
// set_shipping_instructions) and the demo store are in data/order-requests.ts.
import type { Client, Gate, Order } from "./models";
import { DataError } from "./samples";
import type { DemoState } from "./samples-demo";
import type { Panel } from "./new-order";

// Who may request: a client admin or requester of the selected client (request_order checks the same).
export const mayRequestOrders = (role: string | null | undefined): boolean => role === "Requester" || role === "Client admin";

// admin.request_order(p_client_id, p_panel_id, p_title, p_matrix, p_expected_samples, p_billing_ref, p_notes); the
// client is the selected one, never a form field. panelId null: "Let the lab advise".
export type RequestInput = { panelId: string | null; title: string; matrix: string | null; expectedSamples: number | null; billingRef: string | null; notes: string | null };
export const requestFields = ["panelId", "title", "matrix", "expectedSamples", "billingRef", "notes"] as const;
export type RequestField = typeof requestFields[number];
export type RequestFormErrors = Partial<Record<RequestField, string>>;
export const SHIPPING_LIMIT = 2000;
export const CONTACT_LIMIT = 500;
export const REASON_LIMIT = 1000;

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export function requestFormValues(form: FormData): Record<RequestField, string> {
  return Object.fromEntries(requestFields.map(name => [name, field(form, name)])) as Record<RequestField, string>;
}

export function parseRequestForm(form: FormData): { ok: true; value: RequestInput } | { ok: false; errors: RequestFormErrors } {
  const errors: RequestFormErrors = {};
  const title = field(form, "title");
  const expected = field(form, "expectedSamples");
  if (!title) errors.title = "Enter a title";
  const expectedSamples = expected ? Number(expected) : null;
  if (expectedSamples !== null && (!Number.isInteger(expectedSamples) || expectedSamples < 0)) errors.expectedSamples = "Enter a whole number, 0 or more";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: {
    panelId: field(form, "panelId") || null, title, matrix: field(form, "matrix") || null, expectedSamples,
    billingRef: field(form, "billingRef") || null, notes: field(form, "notes") || null,
  } };
}

// The decline reason the client reads; required, like decline_order.
export function parseDeclineReason(form: FormData): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = field(form, "reason");
  if (!reason) return { ok: false, error: "Write the reason. The client reads it on the order." };
  if (reason.length > REASON_LIMIT) return { ok: false, error: `Keep the reason under ${REASON_LIMIT} characters.` };
  return { ok: true, reason };
}

// A blank text clears the instructions (clients then read the generic sentence), like set_shipping_instructions.
export function parseShippingText(form: FormData): { ok: true; text: string | null } | { ok: false; error: string } {
  const text = field(form, "text");
  if (text.length > SHIPPING_LIMIT) return { ok: false, error: `Keep the instructions under ${SHIPPING_LIMIT} characters (now ${text.length}).` };
  return { ok: true, text: text || null };
}

// The lab's contact for clients (0023): the same rule, 500 characters (set_client_contact).
export function parseContactText(form: FormData): { ok: true; text: string | null } | { ok: false; error: string } {
  const text = field(form, "text");
  if (text.length > CONTACT_LIMIT) return { ok: false, error: `Keep the contact under ${CONTACT_LIMIT} characters (now ${text.length}).` };
  return { ok: true, text: text || null };
}

export const pendingGates: Gate[] = [{ label: "Client request · needs an answer", status: "pending" }];
export const isPending = (order: Pick<Order, "request">) => order.request?.status === "pending";

// The Pipeline notice: how many client requests wait, which ones, and the first to review.
export function requestNotice(orders: Order[], clients: Client[]): { count: number; text: string; first: string } | null {
  const pending = orders.filter(isPending).sort((a, b) => (a.request?.requestedAt ?? "").localeCompare(b.request?.requestedAt ?? "") || a.code.localeCompare(b.code));
  if (!pending.length) return null;
  const name = (order: Order) => `${order.code} · ${clients.find(client => client.id === order.clientId)?.name ?? "Client"}`;
  const shown = pending.slice(0, 3).map(name);
  const list = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(", ")}${pending.length > 3 ? ", " : " and "}${shown.at(-1)}${pending.length > 3 ? ` and ${pending.length - 3} more` : ""}`;
  return { count: pending.length, first: pending[0].code, text: list };
}

// ---------------------------------------------------------------- demo records

type RequestArgs = { clientId: string; input: RequestInput; orders: Order[]; clients: Client[]; panels: Panel[]; actor: string; now: Date };

// request_order in the demo: the next ORD number, at Request, waiting for the lab's answer.
export function recordRequest(state: DemoState, { clientId, input, orders, clients, panels, actor, now }: RequestArgs): { state: DemoState; order: Order } {
  if (!clients.some(client => client.id === clientId)) throw new DataError("That client was not found or is archived.");
  const panel = input.panelId ? panels.find(item => item.id === input.panelId) : null;
  if (input.panelId && !panel) throw new DataError("That panel was not found or is archived.");
  const next = orders.reduce((max, order) => Math.max(max, Number(/^ORD(\d+)$/.exec(order.code)?.[1] ?? 0)), 0) + 1;
  const at = now.toISOString();
  const order: Order = {
    code: `ORD${String(next).padStart(3, "0")}`, clientId, description: input.title, stage: 0,
    sampleCount: input.expectedSamples ?? 0, completedSamples: 0, sampleType: input.matrix ?? "Not specified", panel: panel?.name ?? "No panel",
    due: "", received: "", owner: "Unassigned", gates: pendingGates,
    history: [{ date: at, title: "Requested by the client", actor }],
    request: { status: "pending", requestedAt: at, requestedBy: actor, notes: input.notes, billingRef: input.billingRef, panelId: panel?.id ?? null, reviewedAt: null, reason: null },
  };
  return { state: { ...state, orders: [...(state.orders ?? []), order] }, order };
}

export type Answer = { accept: true; panelId: string | null } | { accept: false; reason: string };
type AnswerArgs = { code: string; answer: Answer; panels: Panel[]; actor: string; now: Date };

// accept_order / decline_order in the demo: only a pending request; declining needs a reason and archives it.
export function answerRequest(state: DemoState, { code, answer, panels, actor, now }: AnswerArgs): DemoState {
  const order = (state.orders ?? []).find(item => item.code === code);
  if (!order || order.request?.status === "declined") throw new DataError(`Order ${code} was not found or is archived.`);
  if (order.request?.status !== "pending") throw new DataError(`${code} is not waiting for an answer; it is already accepted.`);
  const at = now.toISOString();
  let next: Order;
  if (answer.accept) {
    const panel = answer.panelId ? panels.find(item => item.id === answer.panelId) : null;
    if (answer.panelId && !panel) throw new DataError("That panel was not found or is archived.");
    next = {
      ...order, panel: panel?.name ?? order.panel, gates: [{ label: "Shipment received", status: "pending" }],
      history: [{ date: at, title: "Request accepted", actor }, ...order.history],
      request: { ...order.request, status: "accepted", reviewedAt: at, panelId: panel?.id ?? order.request.panelId },
    };
  } else {
    const reason = answer.reason.trim();
    if (!reason) throw new DataError("Declining a request needs a reason; the client reads it.");
    next = { ...order, history: [{ date: at, title: "Request declined", actor }, ...order.history], request: { ...order.request, status: "declined", reviewedAt: at, reason } };
  }
  return { ...state, orders: (state.orders ?? []).map(item => item.code === code ? next : item) };
}
