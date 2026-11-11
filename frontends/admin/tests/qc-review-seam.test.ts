// @vitest-environment node
// The QC review seam (data/qc-review.ts) and the pure rules (qc-review.ts): demo mode end to end in one browser's
// records, through a build that keeps every sample; live mode with the 0027 function and argument names, the
// refusals in the pipeline's words, and the exclusions a dataset version lists. Synthetic data only.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { getEnvironment } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/server";
import { listOrders } from "@/lib/data/orders";
import { addExclusion, getQcOrder, listQcOrders, markQcReviewed, withdrawExclusion } from "@/lib/data/qc-review";
import { buildDataset, getDataset, listDatasets } from "@/lib/data/release";
import { exclusionsAt, recordExclusion, recordQcReviewed, type Exclusion } from "@/lib/qc-review";
import { emptyDemoState } from "@/lib/samples-demo";
import { fakePostgrest } from "./helpers/fake-postgrest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => session) }));

let session = { userId: "example-staff", displayName: "Demo Operator", role: "Operator", view: "staff", mock: true };
const jar = new Map<string, string>();
beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  session = { userId: "example-staff", displayName: "Demo Operator", role: "Operator", view: "staff", mock: true };
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => { jar.set(name, value); },
  } as never);
});

describe("pure rules", () => {
  const exclusion = (code: string, decidedAt: string, withdrawnAt: string | null = null): Exclusion =>
    ({ id: code, sampleId: code, sampleCode: code, reason: `${code} reason`, decidedBy: "Example Operator", decidedAt, withdrawnAt, withdrawnReason: withdrawnAt ? "reversed" : null });
  it("a version lists the exclusions in force at its build: decided by then, not withdrawn by then", () => {
    const all = [
      exclusion("ORD1-S003", "2026-11-10T10:00:00Z"),
      exclusion("ORD1-S001", "2026-11-10T09:00:00Z", "2026-11-10T13:00:00Z"), // withdrawn after the build: in force then
      exclusion("ORD1-S002", "2026-11-10T09:00:00Z", "2026-11-10T11:00:00Z"), // withdrawn before the build
      exclusion("ORD1-S004", "2026-11-10T12:30:00Z"), // decided after the build
    ];
    expect(exclusionsAt(all, "2026-11-10T12:00:00Z").map(item => item.sampleCode)).toEqual(["ORD1-S001", "ORD1-S003"]);
    expect(exclusionsAt(all, "2026-11-10T12:00:00Z")[0]).toEqual({ sampleCode: "ORD1-S001", reason: "ORD1-S001 reason", decidedBy: "Example Operator", decidedAt: "2026-11-10T09:00:00Z" });
  });
  it("the demo rules use the database's refusals", () => {
    const state = emptyDemoState();
    const at = (stage: number) => ({ code: "ORD1", stage });
    const sample = { id: "s-1", code: "ORD1-S001" };
    const now = new Date("2026-11-10T12:00:00Z");
    expect(() => recordExclusion(state, { order: at(7), sample, reason: "  ", actor: "A", now, id: "e-1" })).toThrow("Give the reason for excluding this sample.");
    expect(() => recordExclusion(state, { order: at(9), sample, reason: "x", actor: "A", now, id: "e-1" })).toThrow("ORD1 is Excel built; exclusions are recorded only while an order is Processed or QC reviewed.");
    const once = recordExclusion(state, { order: at(8), sample, reason: " haemolysed ", actor: "A", now, id: "e-1" });
    expect(once.exclusions).toEqual([{ id: "e-1", orderCode: "ORD1", sampleId: "s-1", sampleCode: "ORD1-S001", reason: "haemolysed", decidedBy: "A", decidedAt: now.toISOString(), withdrawnAt: null, withdrawnReason: null }]);
    expect(() => recordExclusion(once, { order: at(7), sample, reason: "x", actor: "A", now, id: "e-2" })).toThrow("ORD1-S001 is already excluded; withdraw that exclusion first.");
    expect(() => recordQcReviewed(state, { order: at(8), actor: "A", now })).toThrow("ORD1 is QC reviewed; only a Processed order can be marked QC reviewed.");
    expect(() => recordQcReviewed(state, { order: at(6), actor: "A", now })).toThrow("ORD1 is Acquired; only a Processed order can be marked QC reviewed.");
  });
});

describe("demo seam", () => {
  beforeEach(() => vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" }));
  it("excludes, withdraws, marks QC reviewed and builds: the version lists the decision and keeps every sample", async () => {
    expect((await listQcOrders()).map(order => [order.code, order.stage, order.sampleCount, order.exclusionCount])).toEqual([
      ["ORD048", 7, 40, 0], ["ORD049", 8, 24, 0], ["ORD053", 7, 22, 0], ["ORD056", 8, 26, 0],
    ]);
    const before = (await getQcOrder("ORD048"))!;
    expect(before.samples).toHaveLength(40);
    expect(before.samples[1]).toEqual({ id: "ORD048-S002", code: "ORD048-S002", fullName: "Sample_002", exclusion: null });
    expect(before.reviewed).toBeNull();

    await addExclusion({ orderCode: "ORD048", sampleId: "ORD048-S002", reason: "pooled QC drift" });
    await expect(addExclusion({ orderCode: "ORD048", sampleId: "ORD048-S002", reason: "again" })).rejects.toThrow("ORD048-S002 is already excluded");
    await expect(addExclusion({ orderCode: "ORD048", sampleId: "ORD048-S999", reason: "x" })).rejects.toThrow("That sample was not found");
    await expect(addExclusion({ orderCode: "ORD050", sampleId: "ORD050-S001", reason: "x" })).rejects.toThrow("ORD050 is Excel built; exclusions are recorded only");
    const first = (await getQcOrder("ORD048"))!.samples[1].exclusion!;
    expect(first).toMatchObject({ sampleCode: "ORD048-S002", reason: "pooled QC drift", decidedBy: "Demo Operator", withdrawnAt: null });
    await withdrawExclusion({ orderCode: "ORD048", exclusionId: first.id, reason: "re-read the QC" });
    await expect(withdrawExclusion({ orderCode: "ORD048", exclusionId: first.id, reason: "again" })).rejects.toThrow("already withdrawn");
    expect((await getQcOrder("ORD048"))!.samples[1].exclusion).toBeNull();
    await addExclusion({ orderCode: "ORD048", sampleId: "ORD048-S002", reason: "haemolysed tube" });
    expect((await listQcOrders()).find(order => order.code === "ORD048")?.exclusionCount).toBe(1);

    await markQcReviewed({ orderCode: "ORD048", orderId: "ORD048" });
    await expect(markQcReviewed({ orderCode: "ORD048", orderId: "ORD048" })).rejects.toThrow("ORD048 is QC reviewed; only a Processed order can be marked QC reviewed.");
    const reviewed = (await getQcOrder("ORD048"))!;
    expect(reviewed.order.stage).toBe(8);
    expect(reviewed.reviewed).toMatchObject({ by: "Demo Operator", at: expect.any(String) });
    const piped = (await listOrders()).find(order => order.code === "ORD048")!;
    expect(piped.stage).toBe(8);
    expect(piped.history[0]).toMatchObject({ title: "QC reviewed", actor: "Demo Operator" });

    // Release builds from QC reviewed; the exclusion is a recorded decision, every sample is still in the files.
    const built = await buildDataset({ orderId: "ORD048" });
    const view = (await getDataset(built.datasetId))!;
    expect(view.dataset.provenance.headers).toBe("FullName from the registry (40 of 40 samples matched)");
    expect(view.dataset.exclusions).toEqual([{ sampleCode: "ORD048-S002", reason: "haemolysed tube", decidedBy: "Demo Operator", decidedAt: expect.any(String) }]);
    expect((await listDatasets()).find(dataset => dataset.id === built.datasetId)?.exclusions).toHaveLength(1);
    expect((await listQcOrders()).map(order => order.code)).not.toContain("ORD048");
    await expect(addExclusion({ orderCode: "ORD048", sampleId: "ORD048-S003", reason: "late" })).rejects.toThrow("ORD048 is Excel built");

    // Without the step: ORD053 builds from Processed with no exclusion listed.
    const plain = await buildDataset({ orderId: "ORD053" });
    expect((await getDataset(plain.datasetId))!.dataset.exclusions).toEqual([]);
  });
  it("refuses a non-writer before touching the records", async () => {
    session = { ...session, role: "Viewer" };
    await expect(addExclusion({ orderCode: "ORD048", sampleId: "ORD048-S001", reason: "x" })).rejects.toThrow("Lab Operator access is required to record QC decisions.");
    await expect(markQcReviewed({ orderCode: "ORD048", orderId: "ORD048" })).rejects.toThrow("Lab Operator access is required");
    expect(jar.size).toBe(0);
  });
});

describe("live seam", () => {
  const rpc = vi.fn();
  const exclusionRow = (id: string, sampleCode: string, created: string, archived: string | null = null) => ({
    id, sample_id: `s-${sampleCode}`, client_id: "client-uuid", reason: `${sampleCode} reason`, decided_by: "u-op", created_at: created, archived_at: archived,
    archived_reason: archived ? "reversed" : null, sample: { order_id: "order-uuid", sample_code: sampleCode },
  });
  const tables = () => ({
    order: [{
      id: "order-uuid", code: "ORD048", title: "Synthetic review", stage: "qc_checked", client_id: "client-uuid", archived_at: null, order_number: 48, client: { name: "Example Atlas" },
      sample: [
        { id: "s-2", sample_code: "ORD048-S002", full_name: "Trt_1", sample_number: 2, archived_at: null, exclusion: [
          { id: "e-old", reason: "first look", decided_by: "u-op", created_at: "2026-11-10T09:00:00Z", archived_at: "2026-11-10T10:00:00Z", archived_reason: "reversed" },
          { id: "e-live", reason: "haemolysed", decided_by: "u-op", created_at: "2026-11-10T11:00:00Z", archived_at: null, archived_reason: null },
        ] },
        { id: "s-1", sample_code: "ORD048-S001", full_name: "Ctrl_1", sample_number: 1, archived_at: null, exclusion: [] },
        { id: "s-x", sample_code: "ORD048-S003", full_name: "Gone", sample_number: 3, archived_at: "2026-11-09T00:00:00Z", exclusion: [] },
      ],
      result_file: [
        { sha256: "b".repeat(64), status: "accepted", accepted_at: "2026-11-08T12:00:00Z", archived_at: null },
        { sha256: "c".repeat(64), status: "accepted", accepted_at: "2026-11-09T12:00:00Z", archived_at: null },
      ],
    }],
    lab_staff: [{ user_id: "u-op", display_name: "Lab Operator", role: "operator", archived_at: null }, { user_id: "u-admin", display_name: "Lab Admin", role: "admin", archived_at: null }],
    audit_event: [{ entity: "order", entity_id: "order-uuid", "after->>stage": "qc_checked", created_at: "2026-11-10T12:00:00Z", actor: "u-admin" }],
    client: [{ id: "client-uuid", name: "Example Atlas" }],
    dataset: [{
      id: "ds-1", order_id: "order-uuid", client_id: "client-uuid", result_file_id: null, version: 1, status: "built", storage_path: "x.xlsx", sha256: "d".repeat(64),
      analysis_sha256: null, analysis_size_bytes: null, companion_sha256: null, companion_size_bytes: null, project_id: null, companion_path: null, released_at: null,
      archived_at: null, archived_reason: null, created_at: "2026-11-10T12:00:00Z",
    }],
    exclusion: [
      exclusionRow("x-1", "ORD048-S002", "2026-11-10T11:00:00Z"),
      exclusionRow("x-2", "ORD048-S001", "2026-11-10T09:00:00Z", "2026-11-10T10:00:00Z"),
      exclusionRow("x-3", "ORD048-S004", "2026-11-10T13:00:00Z"),
    ],
  });
  beforeEach(() => {
    rpc.mockReset();
    session = { userId: "u-op", displayName: "Lab Operator", role: "Operator", view: "staff", mock: false };
    vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
    const db = fakePostgrest(tables());
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ rpc, from: db.from }) } as never);
  });
  it("calls the 0027 functions with the contract's argument names, the reasons trimmed", async () => {
    rpc.mockResolvedValue({ data: "e-new", error: null });
    await addExclusion({ orderCode: "ORD048", sampleId: "s-1", reason: "  carry-over  " });
    expect(rpc).toHaveBeenLastCalledWith("add_exclusion", { p_sample_id: "s-1", p_reason: "carry-over" });
    await withdrawExclusion({ orderCode: "ORD048", exclusionId: "e-live", reason: " ruled out " });
    expect(rpc).toHaveBeenLastCalledWith("withdraw_exclusion", { p_exclusion_id: "e-live", p_reason: "ruled out" });
    await markQcReviewed({ orderCode: "ORD048", orderId: "order-uuid" });
    expect(rpc).toHaveBeenLastCalledWith("mark_qc_checked", { p_order_id: "order-uuid" });
  });
  it("puts the functions' refusals in the pipeline's words", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "55000", message: "ORD048 is at stage excel_built; exclusions are recorded only while an order is processed or QC reviewed" } });
    await expect(addExclusion({ orderCode: "ORD048", sampleId: "s-1", reason: "x" })).rejects.toThrow("ORD048 is Excel built; exclusions are recorded only while an order is Processed or QC reviewed. Reload the page to see the order as it is now.");
    rpc.mockResolvedValueOnce({ data: null, error: { code: "55000", message: "ORD048 is at stage qc_checked; only a processed order can be marked QC reviewed" } });
    await expect(markQcReviewed({ orderCode: "ORD048", orderId: "order-uuid" })).rejects.toThrow("ORD048 is QC reviewed; only a Processed order can be marked QC reviewed.");
    rpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "ORD048-S002 is already excluded; withdraw that exclusion first" } });
    await expect(addExclusion({ orderCode: "ORD048", sampleId: "s-2", reason: "x" })).rejects.toThrow("ORD048-S002 is already excluded; withdraw that exclusion first");
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "only lab staff (owner, admin, operator) may exclude samples" } });
    await expect(addExclusion({ orderCode: "ORD048", sampleId: "s-2", reason: "x" })).rejects.toThrow("You do not have permission to do this.");
  });
  it("reads the order's live samples by number, each with its live exclusion, the newest accepted file and who marked it", async () => {
    const detail = (await getQcOrder("ORD048"))!;
    expect(detail.order).toMatchObject({ code: "ORD048", stage: 8, clientName: "Example Atlas", sampleCount: 2, exclusionCount: 1, resultFile: { sha256: "c".repeat(64), acceptedAt: "2026-11-09T12:00:00Z" } });
    expect(detail.samples.map(sample => [sample.code, sample.exclusion?.reason ?? null, sample.exclusion?.decidedBy ?? null])).toEqual([["ORD048-S001", null, null], ["ORD048-S002", "haemolysed", "Lab Operator"]]);
    expect(detail.reviewed).toEqual({ at: "2026-11-10T12:00:00Z", by: "Lab Admin" });
    expect((await listQcOrders()).map(order => [order.code, order.sampleCount, order.exclusionCount])).toEqual([["ORD048", 2, 1]]);
  });
  it("a dataset version lists the exclusions in force at its build, with the decider's name", async () => {
    const [record] = await listDatasets();
    expect(record.exclusions).toEqual([{ sampleCode: "ORD048-S002", reason: "ORD048-S002 reason", decidedBy: "Lab Operator", decidedAt: "2026-11-10T11:00:00Z" }]);
  });
});
