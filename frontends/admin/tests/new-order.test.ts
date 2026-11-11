import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { getEnvironment } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/server";
import { createOrder, listOrders, listPanels } from "@/lib/data/orders";
import { listReceivableOrders, receiveShipment, registerSamples } from "@/lib/data/samples";
import { listAuditEvents } from "@/lib/data/audit";
import { getDataset, releaseDataset } from "@/lib/data/release";
import { readDemoState, writeDemoState } from "@/lib/data/demo-store";
import type { DemoDataset } from "@/lib/release-demo";
import { DataError, type SampleInput } from "@/lib/samples";
import { parseOrderForm } from "@/lib/new-order";
import { fakePostgrest } from "./helpers/fake-postgrest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => ({ userId: "example-staff", displayName: "Demo Operator", role: "Operator", view: "staff", mock: true })) }));

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};
const complete = { clientId: "example-cedar", panelId: "Panel B · sphingolipids", title: " Synthetic plasma lipidome ", matrix: "Plasma", expectedSamples: "24", billingRef: "PO-SYN-1", notes: "" };
const input = { clientId: "example-cedar", panelId: "Panel B · sphingolipids", title: "Synthetic plasma lipidome", matrix: "Plasma", expectedSamples: 24, billingRef: "PO-SYN-1", notes: null };

const jar = new Map<string, string>();
beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => { jar.set(name, value); },
  } as never);
});

describe("the New order form", () => {
  it("trims the fields and turns blank optional ones into null", () => {
    expect(parseOrderForm(form(complete))).toEqual({ ok: true, value: input });
    expect(parseOrderForm(form({ ...complete, matrix: " ", expectedSamples: "", billingRef: "" }))).toEqual({ ok: true, value: { ...input, matrix: null, expectedSamples: null, billingRef: null } });
  });
  it("names every missing or invalid field", () => {
    expect(parseOrderForm(form({ clientId: "", panelId: "", title: "  ", expectedSamples: "-2" }))).toEqual({ ok: false, errors: {
      clientId: "Choose a client", panelId: "Choose a panel", title: "Enter a title", expectedSamples: "Enter a whole number, 0 or more",
    } });
    expect(parseOrderForm(form({ ...complete, expectedSamples: "2.5" }))).toMatchObject({ ok: false, errors: { expectedSamples: expect.any(String) } });
  });
});

describe("createOrder, live: admin.create_order", () => {
  const rpc = vi.fn();
  const schema = vi.fn();
  beforeEach(() => {
    vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
    vi.mocked(createAdminClient).mockResolvedValue({ schema } as never);
  });
  it("calls the function with the contract's argument names and returns the new order's code", async () => {
    const db = fakePostgrest({ order: [{ id: "new-uuid", code: "ORD077", archived_at: null }] });
    schema.mockReturnValue({ rpc, from: db.from });
    rpc.mockResolvedValueOnce({ data: "new-uuid", error: null });
    await expect(createOrder({ ...input, clientId: "client-uuid", panelId: "panel-uuid" })).resolves.toEqual({ id: "new-uuid", code: "ORD077" });
    expect(schema).toHaveBeenCalledWith("admin");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("create_order", {
      p_client_id: "client-uuid", p_panel_id: "panel-uuid", p_title: "Synthetic plasma lipidome", p_matrix: "Plasma",
      p_expected_samples: 24, p_billing_ref: "PO-SYN-1", p_notes: null,
    });
  });
  it("turns a refusal into a message (archived client, not lab staff)", async () => {
    schema.mockReturnValue({ rpc });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "55000", message: "client Synthetic Lab is archived; it cannot receive new orders" } });
    await expect(createOrder(input)).rejects.toThrow(new DataError("Client Synthetic Lab is archived; it cannot receive new orders."));
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "only lab staff (owner, admin, operator) may create orders" } });
    await expect(createOrder(input)).rejects.toThrow("Only lab staff (owner, admin, operator) may create orders.");
  });
  it("lists the active panels by name", async () => {
    const db = fakePostgrest({ panel: [
      { id: "p2", name: "Sphingolipids", archived_at: null }, { id: "p1", name: "Broad lipidome", archived_at: null }, { id: "p0", name: "Retired", archived_at: "2026-01-01" },
    ] });
    schema.mockReturnValue({ from: db.from });
    await expect(listPanels()).resolves.toEqual([{ id: "p1", name: "Broad lipidome" }, { id: "p2", name: "Sphingolipids" }]);
  });
});

describe("createOrder, demo: in memory, per browser", () => {
  beforeEach(() => vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" }));
  it("gives the next order code and puts the order at Request on the pipeline and in Receive shipment", async () => {
    const before = await listOrders();
    const highest = Math.max(...before.map(order => Number(order.code.slice(3))));
    const { code } = await createOrder(input);
    const ord = (n: number) => `ORD${String(n).padStart(3, "0")}`;
    expect(code).toBe(ord(highest + 1));
    const created = (await listOrders()).find(order => order.code === code);
    expect(created).toMatchObject({ clientId: "example-cedar", description: "Synthetic plasma lipidome", stage: 0, sampleCount: 24, sampleType: "Plasma", panel: "Panel B · sphingolipids" });
    expect(created?.history[0]).toMatchObject({ title: "Order created", actor: "Demo Operator" });
    expect((await listReceivableOrders()).map(order => order.code)).toContain(code);
    expect((await createOrder(input)).code).toBe(ord(highest + 2));
    jar.clear();
    expect((await listOrders()).some(order => order.code === code)).toBe(false);
  });
  it("refuses an unknown client or panel and offers the demo panels", async () => {
    await expect(createOrder({ ...input, clientId: "nobody" })).rejects.toThrow(DataError);
    await expect(createOrder({ ...input, panelId: "No such panel" })).rejects.toThrow(DataError);
    expect((await listPanels()).map(panel => panel.name)).toContain("Panel B · sphingolipids");
  });
});

// The demo screens that read orders see an order created in this browser like an example one.
describe("an order created in the demo, on the other demo screens", () => {
  beforeEach(() => vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" }));
  const sample = (full_name: string): SampleInput => ({ full_name, client_sample_id: null, group1_term: "Control", group2_term: null, replicate_term: null, patient_term: null, time_point_term: null, matrix: null, volume_ul: null });

  it("counts the registered samples when no expected count was given (pipeline: 2 of 2, like live)", async () => {
    const { code } = await createOrder({ ...input, expectedSamples: null });
    const { shipmentId } = await receiveShipment({ orderId: code, carrier: "FedEx", trackingNumber: null, condition: "ok", boxCount: 1, notes: null });
    await registerSamples({ orderId: code, shipmentId, samples: [sample("Ctrl_1"), sample("Ctrl_2")] });
    expect((await listOrders()).find(order => order.code === code)).toMatchObject({ sampleCount: 2, completedSamples: 2 });
  });

  it("the audit log finds the order and shows its creation", async () => {
    const { code } = await createOrder(input);
    const page = await listAuditEvents({ entity: null, order: code, before: null });
    expect(page.order).toEqual({ code, found: true });
    expect(page.rows.map(row => [row.who, row.summary])).toEqual([["Demo Operator", `Order ${code} created`]]);
  });

  it("a dataset of the order carries its title, before and after release", async () => {
    const { code } = await createOrder(input);
    const file = { sha256: "a".repeat(64), sizeBytes: 2000, sheets: ["Abundance"] };
    const dataset: DemoDataset = {
      id: "demo-dataset-new", orderCode: code, clientId: "example-cedar", version: 1, status: "built",
      builtAt: "2026-11-09T15:00:00Z", builtBy: "Demo Operator", sourceSha256: "b".repeat(64), sciexOsVersion: null, processingMethod: null,
      storagePath: `example-cedar/${code}/datasets/x/dataset-v1.xlsx`, full: file, analysis: file, companion: file,
      headerMode: "fullName", matched: 2, samples: 2, lipids: 3,
      signatures: [
        { id: "sig-a", userId: "example-reviewer-a", name: "Demo Reviewer A", role: "reviewed", note: null, signedAt: "2026-11-09T16:00:00Z" },
        { id: "sig-b", userId: "example-reviewer-b", name: "Demo Reviewer B", role: "approved", note: null, signedAt: "2026-11-09T17:00:00Z" },
      ],
      releasedAt: null, releasedBy: null, projectId: null, projectName: null, archivedAt: null, archivedReason: null,
    };
    const state = await readDemoState();
    await writeDemoState({ ...state, datasets: [...(state.datasets ?? []), dataset] });
    expect((await getDataset(dataset.id))?.dataset.orderTitle).toBe("Synthetic plasma lipidome");
    await releaseDataset({ datasetId: dataset.id, actorId: "example-reviewer-b" });
    expect((await getDataset(dataset.id))?.dataset).toMatchObject({ status: "released", orderTitle: "Synthetic plasma lipidome" });
  });
});
