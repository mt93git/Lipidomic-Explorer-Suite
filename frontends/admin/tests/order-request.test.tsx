// Client order requests (F2, 0019): the request form, the lab's answer in demo mode, the Pipeline notice, the client's
// view of a pending, accepted and declined request. Synthetic data only.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { clientSteps, homeCounts, reachedOn, stepOf, type ClientOrder } from "@/lib/client-portal";
import { clientOrderFromRow, type ClientOrderRow } from "@/lib/data/client-orders";
import { ClientOrderDetail } from "@/components/client-order-detail";
import { OrderCard } from "@/components/order-card";
import { auditSummary, type AuditEvent } from "@/lib/audit";
import { demoClients, demoOrders } from "@/lib/demo";
import type { Order } from "@/lib/models";
import {
  answerRequest, mayRequestOrders, parseDeclineReason, parseRequestForm, parseShippingText, recordRequest, requestNotice, SHIPPING_LIMIT, type RequestInput,
} from "@/lib/order-request";
import { emptyDemoState, recordShipment } from "@/lib/samples-demo";
import { sidebarNavigation } from "@/lib/navigation";

vi.mock("server-only", () => ({}));

const form = (entries: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(entries)) data.set(k, v); return data; };
const panels = [{ id: "Panel A · broad lipidome", name: "Panel A · broad lipidome" }, { id: "Panel B · sphingolipids", name: "Panel B · sphingolipids" }];
const input: RequestInput = { panelId: null, title: "Plasma lipidome · diet study", matrix: "Plasma", expectedSamples: 24, billingRef: null, notes: "Two diets, 12 animals each." };
const now = new Date("2026-11-10T14:31:00Z");
const cedar = demoClients[1];

describe("who may request, and the form", () => {
  it("only a Requester or Client admin requests", () => {
    expect(mayRequestOrders("Requester")).toBe(true);
    expect(mayRequestOrders("Client admin")).toBe(true);
    for (const role of ["Viewer", "Operator", "Owner", "", null, undefined]) expect(mayRequestOrders(role), String(role)).toBe(false);
  });
  it("needs a title; the panel may be left to the lab; blank optional fields are null", () => {
    expect(parseRequestForm(form({ title: " ", expectedSamples: "-1" }))).toEqual({ ok: false, errors: { title: "Enter a title", expectedSamples: "Enter a whole number, 0 or more" } });
    expect(parseRequestForm(form({ panelId: "", title: " Diet study ", matrix: "", expectedSamples: "", billingRef: " ", notes: "" })))
      .toEqual({ ok: true, value: { panelId: null, title: "Diet study", matrix: null, expectedSamples: null, billingRef: null, notes: null } });
  });
  it("a decline needs a reason; a blank shipping text clears it; a long one is refused", () => {
    expect(parseDeclineReason(form({ reason: "  " })).ok).toBe(false);
    expect(parseDeclineReason(form({ reason: " Not before March. " }))).toEqual({ ok: true, reason: "Not before March." });
    expect(parseShippingText(form({ text: "  " }))).toEqual({ ok: true, text: null });
    expect(parseShippingText(form({ text: "x".repeat(SHIPPING_LIMIT + 1) })).ok).toBe(false);
  });
  it("shows Request an order in the client menu only to roles that may request", () => {
    const labels = (role: string) => sidebarNavigation("client", role).groups.flatMap(group => group.items.map(item => item.label));
    expect(labels("Requester")).toEqual(["Home", "Request an order", "Notifications"]);
    expect(labels("Viewer")).toEqual(["Home", "Notifications"]);
    expect(sidebarNavigation("staff", "Operator").groups.flatMap(group => group.items).some(item => item.href === "/shipping-instructions")).toBe(true);
  });
});

describe("demo: request, accept, decline", () => {
  const requested = () => recordRequest(emptyDemoState(), { clientId: cedar.id, input, orders: demoOrders, clients: demoClients, panels, actor: "rowan@cedar.example.test", now });

  it("a request takes the next code, at Request, pending, with the client's notes", () => {
    const { state, order } = requested();
    expect(order).toMatchObject({ code: "ORD059", clientId: cedar.id, stage: 0, panel: "No panel", sampleCount: 24,
      request: { status: "pending", requestedBy: "rowan@cedar.example.test", notes: "Two diets, 12 animals each.", panelId: null, reviewedAt: null } });
    expect(state.orders).toHaveLength(1);
  });
  it("cannot be received while pending; accepting sets the panel; then it can arrive", () => {
    const { state, order } = requested();
    expect(() => recordShipment(state, { order, shipment: { carrier: "courier", trackingNumber: null, condition: "ok", boxCount: 1, notes: null }, actor: "x", now, id: "s1" }))
      .toThrow(/Accept the request first/);
    const accepted = answerRequest(state, { code: order.code, answer: { accept: true, panelId: "Panel B · sphingolipids" }, panels, actor: "Demo Operator", now });
    const next = accepted.orders![0];
    expect(next).toMatchObject({ panel: "Panel B · sphingolipids", request: { status: "accepted", reviewedAt: now.toISOString(), panelId: "Panel B · sphingolipids" } });
    expect(next.history[0].title).toBe("Request accepted");
    expect(() => recordShipment(accepted, { order: next, shipment: { carrier: "courier", trackingNumber: null, condition: "ok", boxCount: 1, notes: null }, actor: "x", now, id: "s1" })).not.toThrow();
    expect(() => answerRequest(accepted, { code: order.code, answer: { accept: false, reason: "late" }, panels, actor: "x", now })).toThrow(/not waiting for an answer/);
  });
  it("declining needs a reason and closes the request; it cannot be answered again", () => {
    const { state, order } = requested();
    expect(() => answerRequest(state, { code: order.code, answer: { accept: false, reason: "  " }, panels, actor: "x", now })).toThrow(/needs a reason/);
    const declined = answerRequest(state, { code: order.code, answer: { accept: false, reason: "Not before March." }, panels, actor: "x", now });
    expect(declined.orders![0].request).toMatchObject({ status: "declined", reason: "Not before March." });
    expect(() => answerRequest(declined, { code: order.code, answer: { accept: true, panelId: null }, panels, actor: "x", now })).toThrow(/not found or is archived/);
  });
  it("refuses an unknown panel and an example order (the lab opened it: nothing to answer)", () => {
    const { state, order } = requested();
    expect(() => answerRequest(state, { code: order.code, answer: { accept: true, panelId: "Panel Z" }, panels, actor: "x", now })).toThrow(/panel was not found/);
    expect(() => answerRequest(state, { code: "ORD042", answer: { accept: true, panelId: null }, panels, actor: "x", now })).toThrow(/not found/);
  });
});

describe("Pipeline", () => {
  const pending = (code: string, clientId: string, at: string): Order => ({ ...demoOrders[1], code, clientId, request: { status: "pending", requestedAt: at, requestedBy: "rowan@cedar.example.test", notes: null, billingRef: null, panelId: null, reviewedAt: null, reason: null } });
  it("names the waiting requests, oldest first, and links the first", () => {
    expect(requestNotice(demoOrders, demoClients)).toBeNull();
    const notice = requestNotice([...demoOrders, pending("ORD060", "example-harbor", "2026-11-10T15:00:00Z"), pending("ORD059", "example-cedar", "2026-11-10T14:00:00Z")], demoClients);
    expect(notice).toEqual({ count: 2, first: "ORD059", text: "ORD059 · Example Cedar and ORD060 · Example Harbor" });
  });
  it("labels a waiting request's card instead of its gate state", () => {
    render(<OrderCard order={pending("ORD059", "example-cedar", "2026-11-10T14:00:00Z")} client={cedar} />);
    expect(screen.getByRole("article", { name: "ORD059" })).toHaveAttribute("data-review", "pending");
    expect(screen.getByText("Client request · needs an answer")).toBeVisible();
    expect(screen.getByText("Requested Nov 10 by rowan@cedar.example.test")).toBeVisible();
    expect(screen.queryByText("Awaiting checks")).toBeNull();
  });
  it("the audit log tells a request and its answer", () => {
    const event = (action: "INSERT" | "UPDATE", after: Record<string, unknown>, before?: Record<string, unknown>) => ({ id: 1, at: "", actor: null, clientId: null, entity: "order", entityId: "o1", action, before: before ?? null, after }) as unknown as AuditEvent;
    const ctx = { people: {}, orders: {}, datasets: {} } as never;
    expect(auditSummary(event("INSERT", { code: "ORD059", review: "pending" }), ctx)).toBe("Order ORD059 requested by the client");
    expect(auditSummary(event("UPDATE", { code: "ORD059", review: "declined" }, { code: "ORD059", review: "pending" }), ctx)).toBe("Order ORD059: request declined");
  });
});

describe("the client's view of a request", () => {
  const row: ClientOrderRow = {
    code: "ORD059", title: "Plasma lipidome · diet study", stage: "request", matrix: "Plasma", expected_samples: 24, billing_ref: null,
    client_id: "client-cedar", created_at: "2026-11-10T14:31:00Z", review: "pending", reviewed_at: null, archived_reason: null,
    panel: null, sample: [], shipment: [], dataset: [],
  };
  it("maps the live review: pending, accepted on its answer day, declined with the reason", () => {
    expect(clientOrderFromRow(row)).toMatchObject({ review: "pending", acceptedAt: null, declineReason: null });
    expect(clientOrderFromRow({ ...row, review: "accepted", reviewed_at: "2026-11-11T13:00:00Z" })).toMatchObject({ review: "accepted", acceptedAt: "2026-11-11T13:00:00Z" });
    expect(clientOrderFromRow({ ...row, review: undefined })).toMatchObject({ review: "accepted", acceptedAt: "2026-11-10T14:31:00Z" }); // lab-opened
    expect(clientOrderFromRow({ ...row, review: "declined", reviewed_at: "2026-11-11T13:00:00Z", archived_reason: "Not before March." })).toMatchObject({ review: "declined", declineReason: "Not before March.", acceptedAt: null });
  });
  const pending = clientOrderFromRow(row);
  const accepted = clientOrderFromRow({ ...row, review: "accepted", reviewed_at: "2026-11-11T13:00:00Z" });
  const declined = clientOrderFromRow({ ...row, review: "declined", reviewed_at: "2026-11-11T13:00:00Z", archived_reason: "The custom list needs a method we cannot run before March." });

  it("steps: pending is step 1, accepted step 2 dated by the answer; tiles count none of a declined one", () => {
    expect(stepOf(pending)).toBe(1);
    expect(clientSteps(pending).slice(0, 2).map(step => [step.state, step.date])).toEqual([["current", "2026-11-10T14:31:00Z"], ["upcoming", null]]);
    expect(clientSteps(accepted)[1]).toMatchObject({ state: "current", date: "2026-11-11T13:00:00Z" });
    expect(reachedOn(accepted)).toEqual({ word: "accepted", date: "2026-11-11T13:00:00Z" });
    expect(homeCounts([pending, accepted, declined] as ClientOrder[])).toEqual({ waitingForLab: 1, waitingForSamples: 1, withLab: 0, released: 0 });
  });
  it("pending: waiting for the lab, do not ship", () => {
    render(<ClientOrderDetail order={pending} clientName="Example Cedar" example={false} />);
    expect(screen.getByRole("heading", { level: 2, name: "Waiting for the lab" })).toBeVisible();
    expect(screen.getByText(/Do not ship samples yet/)).toBeVisible();
  });
  it("accepted: the lab's shipping instructions when set, the generic sentence when not", () => {
    const { unmount } = render(<ClientOrderDetail order={accepted} clientName="Example Cedar" example={false} shipping={"Dry ice.\nMonday to Wednesday."} />);
    expect(screen.getByRole("heading", { level: 2, name: "Send your samples" })).toBeVisible();
    expect(screen.getByText("Accepted Nov 11")).toBeVisible();
    expect(screen.getByRole("note", { name: "Shipping instructions" })).toHaveTextContent("Dry ice. Monday to Wednesday.");
    expect(screen.queryByText(/ship as agreed/)).toBeNull();
    unmount();
    render(<ClientOrderDetail order={accepted} clientName="Example Cedar" example={false} />);
    expect(screen.getByText(/ship as agreed with the lab/)).toBeVisible();
    expect(screen.queryByRole("note", { name: "Shipping instructions" })).toBeNull();
  });
  it("declined: the lab's reason, no steps, and another request only for roles that may", () => {
    const { unmount } = render(<ClientOrderDetail order={declined} clientName="Example Cedar" example={false} mayRequest />);
    expect(screen.getByRole("heading", { level: 2, name: "Declined by the lab" })).toBeVisible();
    expect(screen.getByText(/cannot run before March/)).toBeVisible();
    expect(screen.queryByRole("list", { name: "Order progress" })).toBeNull();
    expect(screen.getByRole("link", { name: "Request another order →" })).toHaveAttribute("href", "/client/request-order");
    unmount();
    render(<ClientOrderDetail order={declined} clientName="Example Cedar" example={false} />);
    expect(screen.queryByRole("link", { name: /Request another order/ })).toBeNull();
  });
});
