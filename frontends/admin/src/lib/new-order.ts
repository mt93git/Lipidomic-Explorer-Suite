// New order: the form's fields and their checks, and the demo's record of a created order. Pure functions; the
// database call (admin.create_order) and the demo store are in data/orders.ts.
import type { Client, Order } from "./models";
import { DataError } from "./samples";
import type { DemoState } from "./samples-demo";

export type Panel = { id: string; name: string };
// admin.create_order(p_client_id, p_panel_id, p_title, p_matrix, p_expected_samples, p_billing_ref, p_notes)
export type OrderInput = { clientId: string; panelId: string; title: string; matrix: string | null; expectedSamples: number | null; billingRef: string | null; notes: string | null };

export const orderFields = ["clientId", "panelId", "title", "matrix", "expectedSamples", "billingRef", "notes"] as const;
export type OrderField = typeof orderFields[number];
export type OrderFormErrors = Partial<Record<OrderField, string>>;

const field = (form: FormData, name: OrderField) => String(form.get(name) ?? "").trim();

// What was typed, to put back into the form when the server refuses it.
export function orderFormValues(form: FormData): Record<OrderField, string> {
  return Object.fromEntries(orderFields.map(name => [name, field(form, name)])) as Record<OrderField, string>;
}

export function parseOrderForm(form: FormData): { ok: true; value: OrderInput } | { ok: false; errors: OrderFormErrors } {
  const errors: OrderFormErrors = {};
  const [clientId, panelId, title, expected] = [field(form, "clientId"), field(form, "panelId"), field(form, "title"), field(form, "expectedSamples")];
  if (!clientId) errors.clientId = "Choose a client";
  if (!panelId) errors.panelId = "Choose a panel";
  if (!title) errors.title = "Enter a title";
  const expectedSamples = expected ? Number(expected) : null;
  if (expectedSamples !== null && (!Number.isInteger(expectedSamples) || expectedSamples < 0)) errors.expectedSamples = "Enter a whole number, 0 or more";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { clientId, panelId, title, matrix: field(form, "matrix") || null, expectedSamples, billingRef: field(form, "billingRef") || null, notes: field(form, "notes") || null } };
}

type RecordArgs = { input: OrderInput; orders: Order[]; clients: Client[]; panels: Panel[]; actor: string; now: Date };

// create_order in the demo: the next ORD number after every order this browser sees, at Request, waiting for its shipment.
export function recordOrder(state: DemoState, { input, orders, clients, panels, actor, now }: RecordArgs): { state: DemoState; order: Order } {
  if (!clients.some(client => client.id === input.clientId)) throw new DataError("That client was not found or is archived.");
  const panel = panels.find(item => item.id === input.panelId);
  if (!panel) throw new DataError("That panel was not found or is archived.");
  const next = orders.reduce((max, order) => Math.max(max, Number(/^ORD(\d+)$/.exec(order.code)?.[1] ?? 0)), 0) + 1;
  const order: Order = {
    code: `ORD${String(next).padStart(3, "0")}`, clientId: input.clientId, description: input.title, stage: 0,
    sampleCount: input.expectedSamples ?? 0, completedSamples: 0, sampleType: input.matrix ?? "Not specified", panel: panel.name,
    due: "", received: "", owner: "Unassigned",
    gates: [{ label: "Shipment received", status: "pending" }],
    history: [{ date: now.toISOString(), title: "Order created", actor }],
  };
  return { state: { ...state, orders: [...(state.orders ?? []), order] }, order };
}
