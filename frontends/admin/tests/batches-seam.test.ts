// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { cookies } from "next/headers";
import { getEnvironment } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/server";
import { batchFile, createBatch, getBatch, listBatches, listBuilderSamples, markBatchAcquired, markBatchExported, recordInjectionStatuses } from "@/lib/data/batches";
import { listOrders } from "@/lib/data/orders";
import { readDemoNotifications, readDemoState, writeDemoNotifications, writeDemoState } from "@/lib/data/demo-store";
import { planBatch, rulesRecord, saveInjections, type BuilderValues } from "@/lib/batch-builder";
import type { DemoSample } from "@/lib/samples-demo";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
const jar = new Map<string, string>();
beforeEach(() => {
  vi.clearAllMocks(); jar.clear();
  vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" });
  vi.mocked(cookies).mockResolvedValue({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value) } as never);
});

const sample = (n: number, full_name = `Synthetic_${n}`): DemoSample => ({
  id: `s-${n}`, orderCode: "ORD041", shipmentId: null, sampleNumber: n, code: `ORD041-S00${n}`, createdAt: "2026-11-10T15:00:00Z", registeredBy: "Demo Operator",
  full_name, client_sample_id: null, group1_term: null, group2_term: null, replicate_term: null, patient_term: null, time_point_term: null, matrix: null, volume_ul: null,
});
const values = (ids: string[]): BuilderValues => ({
  panelId: "Panel A · broad lipidome", sampleIds: ids, blanksAtStart: 1, pooledQcEvery: 0, blankAfterQc: false, qcAtEnd: true, randomize: false, seed: "", minutesPerInjection: 12, plateOrder: "column-major",
});
const plan = async (ids: string[]) => {
  const samples = await listBuilderSamples();
  return { injections: saveInjections(planBatch(values(ids), samples).injections), rules: rulesRecord(values(ids)), panelId: "Panel A · broad lipidome" };
};
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

test("demo: save, download, mark exported, mark acquired; the order follows and other demo records stay", async () => {
  await writeDemoState({ ...await readDemoState(), samples: [sample(1), sample(2, '=HYPERLINK("x")')] });
  expect((await listBuilderSamples()).map(item => item.code)).toEqual(["ORD041-S001", "ORD041-S002"]);

  const { name } = await createBatch(await plan(["s-1", "s-2"]));
  expect(name).toBe("B2026-033");
  expect((await listBuilderSamples())).toEqual([]); // both samples are in a planned batch now
  expect(await listBatches()).toEqual([expect.objectContaining({ name, status: "planned", panel: "Panel A · broad lipidome", injectionCount: 4 })]);
  expect((await listOrders()).find(order => order.code === "ORD041")).toMatchObject({ stage: 4, batch: name });

  const csv = (await batchFile(name, "sequence"))!;
  expect(csv.filename).toBe(`${name}-sequence.csv`);
  expect(csv.text.split("\r\n")[0]).toBe("seq,sample_type,sample_name,client_id,aliquot_id,plate,vial");
  expect(csv.text).toContain("2,Unknown,ORD041-S001,example-atlas,aliquot-s-1,Plate 1,B1");
  expect(csv.text).not.toMatch(/Synthetic|HYPERLINK/); // the sequence never carries client-written text
  const bench = (await batchFile(name, "bench-sheet"))!.text.split("\r\n");
  expect(bench[0]).toBe("plate,vial,seq,sample_type,sample_name,FullName,client_id,aliquot_id");
  expect(bench).toContain("Plate 1,B1,2,Unknown,ORD041-S001,Synthetic_1,example-atlas,aliquot-s-1");
  expect(bench).toContain(`Plate 1,C1,3,Unknown,ORD041-S002,"'=HYPERLINK(""x"")",example-atlas,aliquot-s-2`); // formula neutralized, then quoted
  expect(await batchFile("B2026-999", "sequence")).toBeNull();

  await markBatchExported(name);
  expect(await getBatch(name)).toMatchObject({ status: "sequence_exported", sequenceSha256: sha(csv.text), exportedBy: "Demo Operator" });
  await expect(markBatchExported(name)).rejects.toThrow(/already Sequence exported/);
  expect((await listOrders()).find(order => order.code === "ORD041")?.stage).toBe(5);

  await markBatchAcquired(name);
  expect(await getBatch(name)).toMatchObject({ status: "acquired" });
  expect((await listOrders()).find(order => order.code === "ORD041")?.stage).toBe(6);
  expect((await readDemoState()).samples).toHaveLength(2);
  expect(createAdminClient).not.toHaveBeenCalled();
});

test("demo: an injection recorded Failed announces Gate failed once; pasting the same export again does not repeat it", async () => {
  await writeDemoState({ ...await readDemoState(), samples: [sample(1), sample(2)] });
  await writeDemoNotifications({ off: {}, log: [], rules: { gate_failed: { kind: "gate_failed", labRoles: ["operator"], stepOwner: false, clientAdmin: false, requester: false, days: null } } });
  const { name } = await createBatch(await plan(["s-1", "s-2"]));
  await markBatchExported(name);
  const gateRows = async () => (await readDemoNotifications()).log.filter(row => row.kind === "gate_failed");
  expect(await recordInjectionStatuses(name, [{ sample_name: "ORD041-S001", status: "failed" }])).toBe(1);
  const first = (await gateRows()).length;
  expect(first).toBeGreaterThan(0);
  // The same export with one more row changed: S001 was already Failed, so nothing new failed.
  expect(await recordInjectionStatuses(name, [{ sample_name: "ORD041-S001", status: "failed" }, { sample_name: "ORD041-S002", status: "acquired" }])).toBe(1);
  expect(await gateRows()).toHaveLength(first);
});

test("demo: an unknown panel, a second plan of the same samples and another browser's batch are refused or hidden", async () => {
  await writeDemoState({ ...await readDemoState(), samples: [sample(1)] });
  const input = await plan(["s-1"]);
  await expect(createBatch({ ...input, panelId: "No such panel" })).rejects.toThrow(/panel was not found/);
  const { name } = await createBatch(input);
  await expect(createBatch(input)).rejects.toThrow(/already in a planned batch/);
  await expect(markBatchAcquired(name)).rejects.toThrow(/export its sequence first/);
  jar.clear();
  expect(await getBatch(name)).toBeNull();
});

test("live: create_batch gets p_name null and the exact injections and rules, and the name is read back", async () => {
  vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.test", anonKey: "example" });
  const rpc = vi.fn().mockResolvedValue({ data: "batch-id", error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: { name: "B2026-044" }, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  vi.mocked(createAdminClient).mockResolvedValue({ schema: vi.fn(() => ({ rpc, from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })) })) } as never);
  const injections = [{ seq: 1, sample_type: "Blank" as const, sample_name: "Blank_001", sample_id: null, plate: "Plate 1", vial: "A1" }];
  const rules = rulesRecord(values([]));
  expect(await createBatch({ panelId: "panel-1", injections, rules })).toEqual({ id: "batch-id", name: "B2026-044" });
  expect(rpc).toHaveBeenCalledWith("create_batch", { p_name: null, p_panel_id: "panel-1", p_rules: rules, p_injections: injections });
  expect(eq).toHaveBeenCalledWith("id", "batch-id");
  rpc.mockResolvedValue({ data: null, error: { message: "sample Synthetic_1 is already in a planned batch (B2026-001)" } });
  await expect(createBatch({ panelId: "panel-1", injections, rules })).rejects.toThrow("Sample Synthetic_1 is already in a planned batch (B2026-001).");
});

test("live: mark exported sends the SHA-256 of the sequence file built from the saved injections and those injections; mark acquired sends the id", async () => {
  vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.test", anonKey: "example" });
  const row = {
    id: "batch-id", name: "B2026-044", status: "planned", created_at: "2026-11-10T15:00:00Z", panel: { name: "Panel A" },
    batch_version: [
      { id: "v0", version: 0, archived_at: "2026-11-09T00:00:00Z", exported_at: null, exported_by: null, sequence_sha256: null, rules: null, injection: [] },
      { id: "v1", version: 1, archived_at: null, exported_at: null, exported_by: null, sequence_sha256: null, rules: { minutesPerInjection: 12 }, injection: [
        { seq: 2, sample_type: "Unknown", sample_name: "ORD041-S001", client_id: "c1", aliquot_id: "a1", plate: "Plate 1", vial: "B1", status: "planned", archived_at: null, aliquot: { sample: { sample_code: "ORD041-S001", full_name: "Synthetic_1", ord: { code: "ORD041" } } } },
        { seq: 1, sample_type: "Blank", sample_name: "Blank_001", client_id: null, aliquot_id: null, plate: "Plate 1", vial: "A1", status: "planned", archived_at: null, aliquot: null },
      ] },
    ],
  };
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const chain: Record<string, unknown> = { eq: () => chain, is: () => chain, maybeSingle };
  const select = vi.fn(() => chain);
  vi.mocked(createAdminClient).mockResolvedValue({ schema: vi.fn(() => ({ rpc, from: vi.fn(() => ({ select })) })) } as never);

  const detail = (await getBatch("B2026-044"))!;
  // supabase-js strips whitespace from select: every column and embed needs its comma, or "created_at panel:panel(name)"
  // becomes one column "created_atpanel" and the versions are dropped (found on staging: every live batch page was 404).
  expect(String((select.mock.calls[0] as unknown[])[0]).replace(/\s/g, "")).toMatch(/^id,name,status,created_at,panel:panel\(name\),batch_version\(id,version,archived_at,exported_at,exported_by,sequence_sha256,rules,injection\(/);
  expect(detail).toMatchObject({ version: 1, orderCodes: ["ORD041"], status: "planned" });
  expect(detail.injections.map(item => [item.seq, item.sampleCode, item.FullName])).toEqual([[1, null, null], [2, "ORD041-S001", "Synthetic_1"]]); // seq order, archived version ignored
  const text = "seq,sample_type,sample_name,client_id,aliquot_id,plate,vial\r\n1,Blank,Blank_001,,,Plate 1,A1\r\n2,Unknown,ORD041-S001,c1,a1,Plate 1,B1\r\n";
  await markBatchExported("B2026-044");
  // The rows hashed travel with the hash, so the database can refuse if they changed in between (0016, PT409).
  expect(rpc).toHaveBeenLastCalledWith("mark_batch_exported", { p_batch_id: "batch-id", p_sequence_sha256: sha(text), p_injections: [
    { seq: 1, sample_type: "Blank", sample_name: "Blank_001", client_id: null, aliquot_id: null, plate: "Plate 1", vial: "A1" },
    { seq: 2, sample_type: "Unknown", sample_name: "ORD041-S001", client_id: "c1", aliquot_id: "a1", plate: "Plate 1", vial: "B1" },
  ] });
  await markBatchAcquired("B2026-044");
  expect(rpc).toHaveBeenLastCalledWith("mark_batch_acquired", { p_batch_id: "batch-id" });
  rpc.mockResolvedValue({ data: null, error: { message: "batch B2026-044 is planned; export its sequence first" } });
  await expect(markBatchAcquired("B2026-044")).rejects.toThrow("Batch B2026-044 is planned; export its sequence first.");
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(markBatchExported("B2026-999")).rejects.toThrow(/not found/);
});
