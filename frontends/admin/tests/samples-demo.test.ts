import { describe, expect, it } from "vitest";
import { demoOrders } from "@/lib/demo";
import { gateStatus } from "@/lib/models";
import type { SampleInput } from "@/lib/samples";
import { applyDemoState, emptyDemoState, recordSamples, recordShipment, sampleCode, type DemoState } from "@/lib/samples-demo";

const now = new Date("2026-11-07T15:00:00Z");
const counter = () => { let n = 0; return () => `id-${++n}`; };
const shipment = { carrier: "FedEx", trackingNumber: "7489", condition: "ok" as const, boxCount: 1, notes: null };
const sample = (full_name: string): SampleInput => ({ full_name, client_sample_id: null, group1_term: "Control", group2_term: null, replicate_term: null, patient_term: null, time_point_term: null, matrix: null, volume_ul: null });
const order = (code: string, state: DemoState = emptyDemoState()) => applyDemoState(demoOrders, state).find(o => o.code === code)!;
const received = () => recordShipment(emptyDemoState(), { order: order("ORD042"), shipment, actor: "Demo Operator", now, id: "ship-1" }).state;

describe("demo store", () => {
  it("formats sample codes as order code + S + three digits, keeping longer numbers whole", () => {
    expect(sampleCode("ORD042", 1)).toBe("ORD042-S001");
    expect(sampleCode("ORD042", 37)).toBe("ORD042-S037");
    expect(sampleCode("ORD1042", 1000)).toBe("ORD1042-S1000");
  });
  it("moves an order from Request to Received when its shipment is recorded, and tells the story on the order", () => {
    const { state, shipment: saved } = recordShipment(emptyDemoState(), { order: order("ORD042"), shipment, actor: "Demo Operator", now, id: "ship-1" });
    expect(saved).toMatchObject({ id: "ship-1", orderCode: "ORD042", carrier: "FedEx", receivedAt: now.toISOString(), receivedBy: "Demo Operator" });
    const after = order("ORD042", state);
    expect(after.stage).toBe(1);
    expect(after.received).toBe("2026-11-07");
    // An arrival at 22:55 EST is already the 8th in UTC; the order keeps the lab's day.
    const late = recordShipment(emptyDemoState(), { order: order("ORD042"), shipment, actor: "Demo Operator", now: new Date("2026-11-08T03:55:00Z"), id: "ship-2" }).state;
    expect(order("ORD042", late).received).toBe("2026-11-07");
    expect(gateStatus(after.gates)).toBe("pending");
    expect(after.history[0]).toMatchObject({ date: now.toISOString(), title: expect.stringContaining("FedEx"), actor: "Demo Operator" });
    expect(order("ORD043", state)).toEqual(demoOrders.find(o => o.code === "ORD043"));
    expect(applyDemoState(demoOrders, emptyDemoState())).toEqual(demoOrders);
  });
  it("refuses a shipment for an order that is not waiting to arrive", () => {
    expect(() => recordShipment(emptyDemoState(), { order: order("ORD043"), shipment, actor: "Demo Operator", now, id: "ship-1" })).toThrow(/ORD043 .*Received/);
  });
  it("blocks the gate when the samples arrived thawed, damaged or partial", () => {
    const { state } = recordShipment(emptyDemoState(), { order: order("ORD042"), shipment: { ...shipment, condition: "thawed" }, actor: "Demo Operator", now, id: "ship-1" });
    const after = order("ORD042", state);
    expect(gateStatus(after.gates)).toBe("fail");
    expect(after.gates.find(g => g.status === "fail")?.label).toMatch(/thawed/i);
  });
  it("registers samples all-or-nothing with sequential codes and moves the order to Registered", () => {
    const start = received();
    const nextId = counter();
    const { state, samples } = recordSamples(start, { order: order("ORD042", start), shipmentId: "ship-1", samples: [sample("Ctrl_1"), sample("Ctrl_2"), sample("Trt_1")], actor: "Demo Operator", now, nextId });
    expect(samples.map(s => s.code)).toEqual(["ORD042-S001", "ORD042-S002", "ORD042-S003"]);
    expect(samples[0]).toMatchObject({ id: "id-1", orderCode: "ORD042", shipmentId: "ship-1", sampleNumber: 1, full_name: "Ctrl_1", group1_term: "Control" });
    const after = order("ORD042", state);
    expect(after.stage).toBe(2);
    expect(after.history[0].title).toContain("3 samples registered");
    expect(after.history[0].title).toContain("ORD042-S001");
    // A later registration continues the numbering and keeps the order at Registered.
    const more = recordSamples(state, { order: after, shipmentId: "ship-1", samples: [sample("Trt_2")], actor: "Demo Operator", now, nextId });
    expect(more.samples.map(s => s.code)).toEqual(["ORD042-S004"]);
    expect(order("ORD042", more.state).stage).toBe(2);
    expect(more.state.samples).toHaveLength(4);
  });
  it("rejects duplicates against the list and against registered samples with a clear message, changing nothing", () => {
    const start = received();
    expect(() => recordSamples(start, { order: order("ORD042", start), shipmentId: "ship-1", samples: [sample("Ctrl_1"), sample("Ctrl_1")], actor: "Demo Operator", now, nextId: counter() })).toThrow(/Ctrl_1/);
    const { state } = recordSamples(start, { order: order("ORD042", start), shipmentId: "ship-1", samples: [sample("Ctrl_1")], actor: "Demo Operator", now, nextId: counter() });
    expect(() => recordSamples(state, { order: order("ORD042", state), shipmentId: "ship-1", samples: [sample("Trt_1"), sample("Ctrl_1")], actor: "Demo Operator", now, nextId: counter() })).toThrow(/Ctrl_1.*already registered/i);
    expect(state.samples).toHaveLength(1);
  });
  it("refuses to register samples before the shipment arrived and requires a FullName even without the grid", () => {
    expect(() => recordSamples(emptyDemoState(), { order: order("ORD042"), shipmentId: null, samples: [sample("Ctrl_1")], actor: "Demo Operator", now, nextId: counter() })).toThrow(/Receive the shipment/);
    const start = received();
    expect(() => recordSamples(start, { order: order("ORD042", start), shipmentId: "ship-1", samples: [sample("  ")], actor: "Demo Operator", now, nextId: counter() })).toThrow(/FullName/);
  });
});
