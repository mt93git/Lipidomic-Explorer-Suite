import { describe, expect, it } from "vitest";
import { demoOrders } from "@/lib/demo";
import { gateStatus } from "@/lib/models";
import { applyDemoState, emptyDemoState, type DemoState } from "@/lib/samples-demo";
import { parseSciexTxt, classify } from "@lipidomic/admin-ingest";
import {
  demoDefaultPolicy, demoLabStaff, demoPolicy, demoSourceText, recordBuild, recordRelease, recordSignature, recordSupersede, recordWithdrawal, setDemoPolicy,
  type BuildRecord,
} from "@/lib/release-demo";

const now = new Date("2026-11-07T15:00:00Z");
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
const [owner, reviewerA, reviewerB, operator] = demoLabStaff;
const sha = (c: string) => c.repeat(64);
const files = { full: { sha256: sha("b"), sizeBytes: 9000, sheets: ["Abundance", "Metadata", "Internal_Standards", "QC_Injections", "Provenance"] }, analysis: { sha256: sha("9"), sizeBytes: 5000, sheets: ["Abundance", "Metadata"] }, companion: { sha256: sha("7"), sizeBytes: 4000, sheets: ["Internal_Standards", "QC_Injections", "Provenance"] } };
const build: Omit<BuildRecord, "id" | "now" | "order"> = { actor: operator, files, sourceSha256: sha("a"), headerMode: "sampleName", matched: 0, samples: 40, lipids: 33, sciexOsVersion: "3.4.5", processingMethod: "Global v1" };
const order = (code: string, state: DemoState = emptyDemoState()) => applyDemoState(demoOrders, state).find(o => o.code === code)!;
const built = (state = emptyDemoState(), code = "ORD048", id = "ds-1") => recordBuild(state, { ...build, id, now, order: order(code, state) });
const signedTwice = () => {
  const { state } = built();
  const a = recordSignature(state, { datasetId: "ds-1", actor: reviewerA, role: "reviewed", note: "Synthetic review", now: later(1), id: "sig-a" });
  return recordSignature(a, { datasetId: "ds-1", actor: reviewerB, role: "approved", note: null, now: later(2), id: "sig-b" });
};
const released = () => recordRelease(signedTwice(), { datasetId: "ds-1", actor: reviewerB, now: later(3), projectId: "11111111-1111-4111-8111-111111111111", projectName: "ORD048 Example processing review" });

describe("demo release records", () => {
  it("builds a dataset for an order at Processed or later, numbering versions per order, and the order reads Excel built", () => {
    const { state, dataset } = built();
    expect(dataset).toMatchObject({ id: "ds-1", orderCode: "ORD048", clientId: "example-atlas", version: 1, status: "built", builtBy: "Demo Operator", builtAt: now.toISOString(), signatures: [], projectId: null });
    expect(dataset.storagePath).toBe(`example-atlas/ORD048/datasets/${sha("b")}/dataset-v1.xlsx`);
    const after = order("ORD048", state);
    expect(after.stage).toBe(9);
    expect(after.released).toBeFalsy();
    expect(gateStatus(after.gates)).toBe("pending");
    expect(after.gates[0]).toEqual({ label: "Frozen dataset v1 built", status: "ok" });
    expect(after.history[0]).toMatchObject({ title: "Dataset v1 built · 3 files recorded", actor: "Demo Operator" });
    expect(recordBuild(state, { ...build, id: "ds-2", now: later(1), order: after }).dataset.version).toBe(2);
    expect(() => recordBuild(state, { ...build, id: "ds-3", now, order: order("ORD041", state) })).toThrow(/ORD041 is Registered; accept its results file/);
    expect(order("ORD053", state)).toEqual(demoOrders.find(o => o.code === "ORD053"));
  });
  it("accepts signatures only from eligible people, once each, while the dataset is built", () => {
    const { state } = built();
    expect(() => recordSignature(state, { datasetId: "ds-1", actor: operator, role: "prepared", note: null, now, id: "x" })).toThrow(/not an eligible release signer/);
    expect(() => recordSignature(state, { datasetId: "ds-1", actor: owner, role: "prepared", note: null, now, id: "x" })).toThrow(/not an eligible release signer/);
    const once = recordSignature(state, { datasetId: "ds-1", actor: reviewerA, role: "reviewed", note: "ok", now: later(1), id: "sig-a" });
    expect(() => recordSignature(once, { datasetId: "ds-1", actor: reviewerA, role: "approved", note: null, now, id: "y" })).toThrow(/already signed/);
    expect(() => recordSignature(once, { datasetId: "nope", actor: reviewerB, role: "approved", note: null, now, id: "y" })).toThrow(/not found/);
    const after = order("ORD048", once);
    expect(after.gates.map(gate => gate.label)).toEqual(["Frozen dataset v1 built", "Signature · Demo Reviewer A (Reviewed)", "1 more signature by a different eligible person"]);
    expect(after.history[0]).toMatchObject({ title: "Dataset v1 signed · Reviewed · Synthetic review".replace("Synthetic review", "ok"), actor: "Demo Reviewer A" });
  });
  it("releases only when the policy count is met by distinct eligible people; the order then reads Released with the Team project", () => {
    const { state } = built();
    const one = recordSignature(state, { datasetId: "ds-1", actor: reviewerA, role: "reviewed", note: null, now, id: "sig-a" });
    expect(() => recordRelease(one, { datasetId: "ds-1", actor: reviewerA, now, projectId: "p", projectName: "p" })).toThrow(/needs 2 signatures by different eligible people \(has 1\)/);
    expect(() => recordRelease(signedTwice(), { datasetId: "ds-1", actor: operator, now, projectId: "p", projectName: "p" })).toThrow(/not an eligible/);
    const done = released();
    const dataset = done.datasets[0];
    expect(dataset).toMatchObject({ status: "released", releasedBy: "Demo Reviewer B", projectId: "11111111-1111-4111-8111-111111111111", projectName: "ORD048 Example processing review", releasedAt: later(3).toISOString() });
    const after = order("ORD048", done);
    expect(after).toMatchObject({ stage: 9, released: true, releasedAt: later(3).toISOString(), completedSamples: after.sampleCount, currentDatasetId: "ds-1" });
    expect(gateStatus(after.gates)).toBe("ok");
    expect(after.history[0]).toMatchObject({ title: "Dataset v1 released · Team project 11111111-1111-4111-8111-111111111111", actor: "Demo Reviewer B" });
    expect(() => recordSignature(done, { datasetId: "ds-1", actor: reviewerA, role: "approved", note: null, now, id: "z" })).toThrow(/released; it can no longer be signed/);
    expect(() => recordRelease(done, { datasetId: "ds-1", actor: reviewerB, now, projectId: "q", projectName: "q" })).toThrow(/already released/);
  });
  it("withdraws a released dataset with a reason, by an eligible person only, and keeps the order released", () => {
    const done = released();
    expect(() => recordWithdrawal(done, { datasetId: "ds-1", actor: operator, reason: "wrong", now })).toThrow(/not an eligible/);
    expect(() => recordWithdrawal(done, { datasetId: "ds-1", actor: reviewerA, reason: "  ", now })).toThrow(/needs a reason/);
    expect(() => recordWithdrawal(signedTwice(), { datasetId: "ds-1", actor: reviewerA, reason: "x", now })).toThrow(/is built; only a released dataset/);
    const withdrawn = recordWithdrawal(done, { datasetId: "ds-1", actor: reviewerA, reason: " wrong sample metadata ", now: later(10) });
    expect(withdrawn.datasets[0]).toMatchObject({ status: "withdrawn", archivedReason: "wrong sample metadata", archivedAt: later(10).toISOString(), projectId: "11111111-1111-4111-8111-111111111111" });
    const after = order("ORD048", withdrawn);
    expect(after.released).toBe(true);
    // Released, then withdrawn: not a current release (finding 2).
    expect(after).toMatchObject({ retired: { version: 1, status: "withdrawn", reason: "wrong sample metadata", at: later(10).toISOString() }, releasedAt: undefined });
    expect(after.currentDatasetId).toBeUndefined();
    expect(after.gates.at(-1)).toEqual({ label: "Dataset v1 withdrawn · wrong sample metadata", status: "fail" });
    expect(after.history[0]).toMatchObject({ title: "Dataset v1 withdrawn · wrong sample metadata", actor: "Demo Reviewer A" });
    expect(() => recordWithdrawal(withdrawn, { datasetId: "ds-1", actor: reviewerA, reason: "again", now })).toThrow(/is withdrawn; only a released dataset/);
  });
  it("supersedes a released version by a newer released version of the same order", () => {
    const first = released();
    const second = recordBuild(first, { ...build, id: "ds-2", now: later(20), order: order("ORD048", first), files: { ...files, full: { ...files.full, sha256: sha("c") }, analysis: { ...files.analysis, sha256: sha("8") } } });
    expect(() => recordSupersede(second.state, { datasetId: "ds-1", newDatasetId: "ds-2", actor: reviewerA, now })).toThrow(/version 2\) is built; a dataset is superseded only by a released version/);
    const signed = recordSignature(recordSignature(second.state, { datasetId: "ds-2", actor: reviewerA, role: "reviewed", note: null, now: later(21), id: "s3" }), { datasetId: "ds-2", actor: reviewerB, role: "approved", note: null, now: later(22), id: "s4" });
    const both = recordRelease(signed, { datasetId: "ds-2", actor: reviewerA, now: later(23), projectId: "22222222-2222-4222-8222-222222222222", projectName: "ORD048 v2" });
    expect(() => recordSupersede(both, { datasetId: "ds-2", newDatasetId: "ds-1", actor: reviewerA, now })).toThrow(/not newer/);
    expect(() => recordSupersede(both, { datasetId: "ds-1", newDatasetId: "ds-1", actor: reviewerA, now })).toThrow(/itself/);
    expect(() => recordSupersede(both, { datasetId: "ds-1", newDatasetId: "ds-2", actor: operator, now })).toThrow(/not an eligible/);
    const done = recordSupersede(both, { datasetId: "ds-1", newDatasetId: "ds-2", actor: reviewerA, now: later(30) });
    expect(done.datasets.map(d => [d.version, d.status])).toEqual([[1, "superseded"], [2, "released"]]);
    expect(done.datasets[0].archivedReason).toBe("superseded by version 2 (ds-2)");
    const after = order("ORD048", done);
    expect(after).toMatchObject({ released: true, releasedAt: later(23).toISOString(), currentDatasetId: "ds-2" });
    expect(after.history[0]).toMatchObject({ title: "Dataset v1 superseded by version 2", actor: "Demo Reviewer A" });
  });
  it("lets only the demo Owner change the policy, with the database's checks", () => {
    const state = emptyDemoState();
    expect(demoPolicy(state)).toEqual(demoDefaultPolicy);
    expect(() => setDemoPolicy(state, { eligibleSigners: [owner.userId, reviewerA.userId], requiredSignatures: 2, actor: reviewerA, now })).toThrow(/only a lab owner/i);
    expect(() => setDemoPolicy(state, { eligibleSigners: [owner.userId, reviewerA.userId], requiredSignatures: 1, actor: owner, now })).toThrow(/at least 2/);
    expect(() => setDemoPolicy(state, { eligibleSigners: [owner.userId], requiredSignatures: 2, actor: owner, now })).toThrow(/fewer eligible signers/i);
    const next = setDemoPolicy(state, { eligibleSigners: [owner.userId, reviewerA.userId, operator.userId], requiredSignatures: 3, actor: owner, now });
    expect(demoPolicy(next)).toEqual({ eligibleSigners: [owner.userId, reviewerA.userId, operator.userId], requiredSignatures: 3, setBy: owner.userId, setAt: now.toISOString() });
    // Under the new policy the operator may sign; the release then needs three people.
    const { state: withDataset } = built(next);
    const signed = recordSignature(withDataset, { datasetId: "ds-1", actor: operator, role: "prepared", note: null, now, id: "s1" });
    expect(() => recordRelease(recordSignature(signed, { datasetId: "ds-1", actor: owner, role: "approved", note: null, now, id: "s2" }), { datasetId: "ds-1", actor: owner, now, projectId: "p", projectName: "p" })).toThrow(/needs 3 signatures.*\(has 2\)/);
  });
  it("writes a synthetic SCIEX export shaped like the real one, which the parser accepts", () => {
    const text = demoSourceText("ORD048", ["B2026-029_001_ORD048-S001", "B2026-029_002_ORD048-S002", "B2026-029_003_ORD048-S003"]);
    const parsed = parseSciexTxt(text);
    expect(parsed.samples.map(s => s.type)).toEqual(["Unknown", "Unknown", "Unknown", "Quality Control", "Blank"]);
    const classified = classify(parsed);
    expect(classified.lipids.length).toBeGreaterThanOrEqual(24);
    expect(classified.internalStandards.length).toBeGreaterThanOrEqual(4);
    expect(classified.droppedRows).toEqual(["DAG(20:0_20:4)+NH4 b"]);
    expect(classified.counts.nullCellShare).toBeGreaterThan(0.1);
    expect(text).toMatch(/\tN\/A\t/);
    expect(demoSourceText("ORD048", ["a"])).toBe(demoSourceText("ORD048", ["a"])); // deterministic
  });
});
