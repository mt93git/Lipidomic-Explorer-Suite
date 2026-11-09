import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { getEnvironment } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/server";
import { DataError, getRegistryOrder, listReceivableOrders, listRegistryOrders, receiveShipment, registerSamples } from "@/lib/data/samples";
import { listOrders } from "@/lib/data/orders";
import { demoStoreCookie } from "@/lib/data/demo-store";
import type { SampleInput } from "@/lib/samples";
import { fakePostgrest } from "./helpers/fake-postgrest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));

const live = { mock: false, url: "https://example.supabase.co", anonKey: "public-example" };
const sample = (full_name: string): SampleInput => ({ full_name, client_sample_id: null, group1_term: "Control", group2_term: null, replicate_term: null, patient_term: null, time_point_term: null, matrix: null, volume_ul: null });
const shipment = { orderId: "ORD042", carrier: "FedEx", trackingNumber: "7489 0000 0001", condition: "ok" as const, boxCount: 1, notes: null };

// A cookie jar standing in for the browser: the demo store is keyed by one app-scoped cookie.
const jar = new Map<string, string>();
beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => { jar.set(name, value); },
  } as never);
});

describe("live seam: the wave 2 database contract", () => {
  const rpc = vi.fn();
  const schema = vi.fn(() => ({ rpc }));
  beforeEach(() => {
    vi.mocked(getEnvironment).mockReturnValue(live);
    vi.mocked(createAdminClient).mockResolvedValue({ schema } as never);
  });
  it("calls admin.receive_shipment with the contract's argument names and returns the new shipment id", async () => {
    rpc.mockResolvedValueOnce({ data: "11111111-1111-4111-8111-111111111111", error: null });
    await expect(receiveShipment({ ...shipment, orderId: "order-uuid" })).resolves.toEqual({ shipmentId: "11111111-1111-4111-8111-111111111111" });
    expect(schema).toHaveBeenCalledWith("admin");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("receive_shipment", {
      p_order_id: "order-uuid", p_carrier: "FedEx", p_tracking_number: "7489 0000 0001", p_condition: "ok", p_box_count: 1, p_notes: null,
    });
  });
  it("calls admin.register_samples with the jsonb array as is and maps the returned sample rows", async () => {
    rpc.mockResolvedValueOnce({ data: [{
      id: "s-1", sample_code: "ORD041-S001", sample_number: 1, full_name: "Ctrl_1", client_sample_id: null, group1_term: "Control", group2_term: null,
      replicate_term: null, patient_term: null, time_point_term: null, matrix: null, volume_ul: "12.5", created_at: "2026-11-07T15:00:00+00:00",
    }], error: null });
    const saved = await registerSamples({ orderId: "order-uuid", shipmentId: "ship-uuid", samples: [sample("Ctrl_1")] });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("register_samples", { p_order_id: "order-uuid", p_shipment_id: "ship-uuid", p_samples: [sample("Ctrl_1")] });
    expect(saved).toEqual([{ ...sample("Ctrl_1"), id: "s-1", code: "ORD041-S001", sampleNumber: 1, volume_ul: 12.5 }]);
  });
  it("turns a database refusal into a message the operator can act on", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "sample_order_id_full_name_key"', details: "", hint: "" } });
    await expect(registerSamples({ orderId: "order-uuid", shipmentId: null, samples: [sample("Ctrl_1")] })).rejects.toThrow(DataError);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "duplicate full_name in order ORD041: Ctrl_1", details: "", hint: "" } });
    await expect(registerSamples({ orderId: "order-uuid", shipmentId: null, samples: [sample("Ctrl_1")] })).rejects.toThrow("duplicate full_name in order ORD041: Ctrl_1");
  });
  it("shows and registers against the arrival just received, not an older shipment that never arrived", async () => {
    const order = { id: "order-uuid", code: "ORD041", title: "Synthetic", stage: "received", matrix: null, expected_samples: 2, client_id: "client-uuid", order_number: 41, archived_at: null, client: { name: "Example Cedar" } };
    const shipment = (id: string, received_at: string | null, created_at: string) => ({ id, order_id: "order-uuid", carrier: id, tracking_number: null, condition: received_at ? "ok" : null, box_count: 1, notes: null, received_at, received_by: received_at ? "operator-uuid" : null, created_at, archived_at: null });
    const db = fakePostgrest({
      order: [order],
      shipment: [
        shipment("pending-from-client", null, "2026-11-01T10:00:00Z"),        // submitted by the client, never received
        shipment("earlier-arrival", "2026-11-03T09:00:00Z", "2026-11-03T09:00:00Z"),
        shipment("just-received", "2026-11-07T15:00:00Z", "2026-11-07T15:00:00Z"),
        shipment("pending-later", null, "2026-11-07T16:00:00Z"),
      ],
      sample: [],
    });
    schema.mockReturnValue({ rpc, from: db.from } as never);
    const detail = await getRegistryOrder("ORD041");
    expect(detail?.shipment).toMatchObject({ id: "just-received", receivedAt: "2026-11-07T15:00:00Z" });
  });
  it("fails closed when there is no authenticated client", async () => {
    vi.mocked(createAdminClient).mockResolvedValue(null);
    await expect(receiveShipment(shipment)).rejects.toThrow(DataError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("demo seam: in memory, per browser cookie", () => {
  beforeEach(() => vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" }));
  it("receives a shipment and registers samples for a request order, then shows the order at Registered everywhere", async () => {
    expect((await listReceivableOrders()).map(o => o.code)).toContain("ORD042");
    const { shipmentId } = await receiveShipment(shipment);
    expect(jar.get(demoStoreCookie)).toMatch(/^[0-9a-f-]{36}$/);
    expect((await listReceivableOrders()).map(o => o.code)).not.toContain("ORD042");
    expect((await listRegistryOrders()).map(o => o.code)).toContain("ORD042");

    const saved = await registerSamples({ orderId: "ORD042", shipmentId, samples: [sample("Ctrl_1"), sample("Ctrl_2"), sample("Trt_1")] });
    expect(saved.map(s => s.code)).toEqual(["ORD042-S001", "ORD042-S002", "ORD042-S003"]);

    const detail = await getRegistryOrder("ORD042");
    expect(detail?.order).toMatchObject({ id: "ORD042", code: "ORD042", clientName: "Example Cedar", stage: 2 });
    expect(detail?.shipment).toMatchObject({ id: shipmentId, carrier: "FedEx", condition: "ok", boxCount: 1 });
    expect(detail?.samples.map(s => s.full_name)).toEqual(["Ctrl_1", "Ctrl_2", "Trt_1"]);
    expect((await listOrders()).find(o => o.code === "ORD042")?.stage).toBe(2);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("keeps one browser's demo records apart from another's and rejects a duplicate FullName", async () => {
    const { shipmentId } = await receiveShipment(shipment);
    await registerSamples({ orderId: "ORD042", shipmentId, samples: [sample("Ctrl_1")] });
    await expect(registerSamples({ orderId: "ORD042", shipmentId, samples: [sample("Ctrl_1")] })).rejects.toThrow(/Ctrl_1/);
    jar.clear();
    expect((await listOrders()).find(o => o.code === "ORD042")?.stage).toBe(0);
    expect(await getRegistryOrder("ORD999")).toBeNull();
  });
  it("refuses an unknown order", async () => {
    await expect(receiveShipment({ ...shipment, orderId: "ORD999" })).rejects.toThrow(DataError);
  });
});
