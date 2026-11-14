import { describe, expect, it } from "vitest";
import { demoBuilderSamples, recordAcquired, recordBatch, recordExported, recordInjectionStatus } from "@/lib/batch-demo";
import { planBatch, rulesRecord, saveInjections, type BuilderValues } from "@/lib/batch-builder";
import { demoClients, demoOrders } from "@/lib/demo";
import { applyDemoState, emptyDemoState, type DemoSample, type DemoState } from "@/lib/samples-demo";
import { DataError } from "@/lib/samples";

const now = new Date("2026-11-10T15:00:00Z");
const sample = (orderCode: string, n: number): DemoSample => ({
  id: `s-${orderCode}-${n}`, orderCode, shipmentId: null, sampleNumber: n, code: `${orderCode}-S00${n}`, createdAt: now.toISOString(), registeredBy: "Demo Operator",
  full_name: `Synthetic_${orderCode}_${n}`, client_sample_id: null, group1_term: null, group2_term: null, replicate_term: null, patient_term: null, time_point_term: null, matrix: null, volume_ul: null,
});
// ORD041 (Example Atlas) is at Registered in the examples; ORD048 is already Processed, so its samples are not batchable.
const withSamples = (): DemoState => ({ ...emptyDemoState(), samples: [sample("ORD041", 1), sample("ORD041", 2), sample("ORD048", 1)] });
const orders = (state: DemoState) => applyDemoState(demoOrders, state);
const values = (ids: string[]): BuilderValues => ({
  panelId: "Panel A · broad lipidome", sampleIds: ids, blanksAtStart: 1, pooledQcEvery: 0, blankAfterQc: false, qcAtEnd: true, randomize: false, seed: "", minutesPerInjection: 12, plateOrder: "column-major",
});
const injectionsFor = (state: DemoState, ids: string[]) => {
  const list = demoBuilderSamples(state, orders(state), demoClients);
  return { list, injections: saveInjections(planInjections(ids, list)) };
};
const planInjections = (ids: string[], list: ReturnType<typeof demoBuilderSamples>) => planBatch(values(ids), list).injections;
const save = (state: DemoState, ids: string[], opts: { panel?: string; at?: Date } = {}) => {
  const { injections } = injectionsFor(state, ids);
  return recordBatch(state, {
    panel: opts.panel ?? "Panel A · broad lipidome", injections, rules: rulesRecord(values(ids)), orders: orders(state), actor: "Demo Operator", now: opts.at ?? now, id: "batch-1",
  });
};

describe("demo batch builder samples", () => {
  it("offers the registered samples of orders from Registered to In batch, with their client", () => {
    const list = demoBuilderSamples(withSamples(), orders(withSamples()), demoClients);
    expect(list.map(item => item.code)).toEqual(["ORD041-S001", "ORD041-S002"]);
    expect(list[0]).toMatchObject({ id: "s-ORD041-1", fullName: "Synthetic_ORD041_1", orderCode: "ORD041", clientId: "example-atlas", clientName: "Example Atlas" });
  });

  it("stops offering an order's samples once its batch is exported or acquired, as the live builder does", () => {
    const { state: planned } = save(withSamples(), ["s-ORD041-1"]);
    // In batch: the sample not yet batched is still offered; the batched one is not.
    expect(demoBuilderSamples(planned, orders(planned), demoClients).map(item => item.code)).toEqual(["ORD041-S002"]);
    const exported = recordExported(planned, "B2026-033", "a".repeat(64), "Demo Operator", now);
    expect(demoBuilderSamples(exported, orders(exported), demoClients)).toEqual([]);
    const acquired = recordAcquired(exported, "B2026-033", now);
    expect(demoBuilderSamples(acquired, orders(acquired), demoClients)).toEqual([]);
  });
});

describe("demo create_batch", () => {
  it("numbers the batch after the example batches, plans version 1 and moves the orders to In batch", () => {
    const state = withSamples();
    const { state: next, batch } = save(state, ["s-ORD041-1", "s-ORD041-2"]);
    expect(batch).toMatchObject({ name: "B2026-033", status: "planned", panel: "Panel A · broad lipidome", createdBy: "Demo Operator", orderCodes: ["ORD041"] });
    expect(batch.injections.map(row => row.sample_name)).toEqual(["Blank_001", "ORD041-S001", "ORD041-S002", "QC_001"]);
    expect(batch.injections[1]).toMatchObject({ client_id: "example-atlas", aliquot_id: "aliquot-s-ORD041-1", FullName: "Synthetic_ORD041_1", sampleCode: "ORD041-S001", orderCode: "ORD041" });
    expect(batch.injections[0]).toMatchObject({ FullName: null, client_id: null, aliquot_id: null, sampleCode: null });
    expect(orders(next).find(order => order.code === "ORD041")).toMatchObject({ stage: 4, batch: "B2026-033" });
  });

  it("refuses an unknown sample, a missing panel and a sample already in a planned batch", () => {
    const state = withSamples();
    const { injections } = injectionsFor(state, ["s-ORD041-1"]);
    const args = { panel: "Panel A", injections, rules: rulesRecord(values([])), orders: orders(state), actor: "x", now, id: "b" };
    expect(() => recordBatch(state, { ...args, panel: "" })).toThrow(DataError);
    expect(() => recordBatch(state, { ...args, injections: saveInjections([{ ...planInjections(["s-ORD041-1"], injectionsFor(state, []).list)[1], aliquot_id: "gone" }]) })).toThrow(/not found/);
    const { state: planned } = save(state, ["s-ORD041-1"]);
    expect(() => recordBatch(planned, { ...args, orders: orders(planned) })).toThrow(/already in a planned batch \(B2026-033\)/);
  });
});

describe("demo export and acquisition", () => {
  const planned = () => save(withSamples(), ["s-ORD041-1", "s-ORD041-2"]).state;
  const sha = "a".repeat(64);

  it("freezes the sequence with its hash and moves the orders to Sequence exported, then Acquired", () => {
    const exported = recordExported(planned(), "B2026-033", sha, "Demo Operator", now);
    expect(exported.batches?.[0]).toMatchObject({ status: "sequence_exported", sequenceSha256: sha, exportedAt: now.toISOString() });
    expect(orders(exported).find(order => order.code === "ORD041")?.stage).toBe(5);
    const acquired = recordAcquired(exported, "B2026-033", now);
    expect(acquired.batches?.[0]).toMatchObject({ status: "acquired" });
    expect(acquired.batches?.[0].injections.every(row => row.status === "acquired")).toBe(true);
    expect(orders(acquired).find(order => order.code === "ORD041")?.stage).toBe(6);
  });

  it("refuses a bad hash, a second export, acquiring a planned batch, a second acquisition and an unknown batch", () => {
    expect(() => recordExported(planned(), "B2026-033", "xyz", "x", now)).toThrow(/64 lowercase hex/);
    expect(() => recordAcquired(planned(), "B2026-033", now)).toThrow(/export its sequence first/);
    expect(() => recordExported(planned(), "B2026-999", sha, "x", now)).toThrow(/not found/);
    const exported = recordExported(planned(), "B2026-033", sha, "x", now);
    expect(() => recordExported(exported, "B2026-033", sha, "x", now)).toThrow(/already Sequence exported/);
    expect(() => recordAcquired(recordAcquired(exported, "B2026-033", now), "B2026-033", now)).toThrow(/already Acquired/);
  });

  it("never lowers an order: one already Processed by a results file stays Processed", () => {
    const processed: DemoState = { ...planned(), results: [{ id: "r", orderCode: "ORD041", sha256: "b".repeat(64), acceptedAt: now.toISOString(), acceptedBy: "x" }] };
    expect(orders(processed).find(order => order.code === "ORD041")?.stage).toBe(7);
  });
});

describe("demo run monitor", () => {
  const sha = "a".repeat(64);
  const exported = () => recordExported(save(withSamples(), ["s-ORD041-1", "s-ORD041-2"]).state, "B2026-033", sha, "Demo Operator", now);

  it("records per-injection status on an exported batch, by name, as the database does", () => {
    const state = exported();
    const [first, second] = state.batches![0].injections;
    const { state: next, changed } = recordInjectionStatus(state, "B2026-033", [{ sample_name: first.sample_name, status: "acquired" }, { sample_name: second.sample_name, status: "failed" }]);
    expect(changed).toBe(2);
    expect(next.batches![0].injections.slice(0, 2).map(row => row.status)).toEqual(["acquired", "failed"]);
    expect(recordInjectionStatus(next, "B2026-033", [{ sample_name: first.sample_name, status: "acquired" }]).changed).toBe(0);
    // Mark acquired afterwards turns only the planned ones acquired; the failed one stays failed (as 0016 does).
    const acquired = recordAcquired(next, "B2026-033", now).batches![0];
    expect(acquired.status).toBe("acquired");
    expect(acquired.injections[1].status).toBe("failed");
    expect(acquired.injections.slice(2).every(row => row.status === "acquired")).toBe(true);
  });

  it("refuses a planned batch, an unknown name or status and an empty list", () => {
    const planned = save(withSamples(), ["s-ORD041-1"]).state;
    expect(() => recordInjectionStatus(planned, "B2026-033", [{ sample_name: "x", status: "failed" }])).toThrow(/injection status is recorded once/);
    expect(() => recordInjectionStatus(exported(), "B2026-033", [{ sample_name: "Nope", status: "failed" }])).toThrow(/no injection named Nope/);
    expect(() => recordInjectionStatus(exported(), "B2026-033", [{ sample_name: "Blank_001", status: "running" }])).toThrow(/not one of/);
    expect(() => recordInjectionStatus(exported(), "B2026-033", [])).toThrow(/at least one/);
  });
});
