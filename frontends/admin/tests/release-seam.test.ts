// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { getEnvironment } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/server";
import { listOrders } from "@/lib/data/orders";
import {
  DataError, buildDataset, getDataset, getReleasePolicy, listDatasets, listReleaseOrders, readDatasetWorkbook, releaseDataset, setReleasePolicy, signDataset, supersedeDataset, withdrawDataset,
} from "@/lib/data/release";
import { demoDefaultPolicy } from "@/lib/release-demo";
import { fakePostgrest } from "./helpers/fake-postgrest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => session) }));

let session = { userId: "example-staff", displayName: "Demo Operator", role: "Operator", view: "staff", mock: true };
const live = { mock: false, url: "https://example.supabase.co", anonKey: "public-example" };
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sourceText = readFileSync(new URL("../e2e/fixtures/sciex-synthetic.txt", import.meta.url), "utf8");

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

describe("demo seam: the whole release flow in memory, per browser", () => {
  beforeEach(() => vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" }));
  it("builds for an order at Processed, takes two demo signers, releases a version the pipeline shows, then withdraws", async () => {
    const orders = await listReleaseOrders();
    expect(orders.find(order => order.code === "ORD048")).toMatchObject({ id: "ORD048", clientName: "Example Atlas", stage: 7, versions: [] });
    expect(orders.map(order => order.code)).not.toContain("ORD041"); // Registered: no results file yet

    const built = await buildDataset({ orderId: "ORD048" });
    expect(built.version).toBe(1);
    expect(built.datasetId).toMatch(UUID);
    const view = (await getDataset(built.datasetId))!;
    expect(view.dataset).toMatchObject({ orderCode: "ORD048", clientName: "Example Atlas", version: 1, status: "built", builtBy: "Demo Operator", signatures: [], projectId: null });
    expect(view.dataset.full.sheets).toEqual(["Abundance", "Metadata", "Internal_Standards", "QC_Injections", "Provenance"]);
    expect(view.dataset.analysis.sheets).toEqual(["Abundance", "Metadata"]);
    expect(view.dataset.companion.sheets).toEqual(["Internal_Standards", "QC_Injections", "Provenance"]);
    for (const file of [view.dataset.full, view.dataset.analysis, view.dataset.companion]) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(file.sizeBytes).toBeGreaterThan(1000);
    }
    expect(view.dataset.full.path).toBe(`example-atlas/ORD048/datasets/${view.dataset.full.sha256}/dataset-v1.xlsx`);
    // No samples registered in this browser: the example registry stands in, so every injection is this order's own.
    expect(view.dataset.provenance).toMatchObject({ headers: "FullName from the registry (40 of 40 samples matched)", sourceSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(view.policy).toEqual(demoDefaultPolicy);
    expect(view.me).toMatchObject({ userId: "example-staff", role: "operator" });
    expect(view.demoActors?.map(person => person.name)).toEqual(["Demo Lab Owner", "Demo Reviewer A", "Demo Reviewer B", "Demo Operator"]);
    expect((await listOrders()).find(order => order.code === "ORD048")).toMatchObject({ stage: 9, released: false });

    await expect(signDataset({ datasetId: built.datasetId, role: "reviewed", note: "x" })).rejects.toThrow(/not an eligible/); // the demo operator
    await signDataset({ datasetId: built.datasetId, role: "reviewed", note: "Reviewed the synthetic export", actorId: "example-reviewer-a" });
    await expect(signDataset({ datasetId: built.datasetId, role: "approved", note: null, actorId: "example-reviewer-a" })).rejects.toThrow(/already signed/);
    await expect(releaseDataset({ datasetId: built.datasetId, actorId: "example-reviewer-a" })).rejects.toThrow(/needs 2 signatures/);
    await signDataset({ datasetId: built.datasetId, role: "approved", note: null, actorId: "example-reviewer-b" });
    await releaseDataset({ datasetId: built.datasetId, actorId: "example-reviewer-b" });

    const released = (await getDataset(built.datasetId))!;
    expect(released.dataset).toMatchObject({ status: "released", releasedAt: expect.any(String) });
    expect(released.dataset.signatures.map(s => [s.name, s.role, s.note])).toEqual([["Demo Reviewer A", "reviewed", "Reviewed the synthetic export"], ["Demo Reviewer B", "approved", null]]);
    expect((await listOrders()).find(order => order.code === "ORD048")).toMatchObject({ released: true, stage: 9 });
    expect((await listDatasets()).map(d => [d.orderCode, d.version, d.status, d.projectId])).toEqual([["ORD048", 1, "released", null]]);
    expect((await listReleaseOrders()).find(order => order.code === "ORD048")?.versions).toEqual([{ id: built.datasetId, version: 1, status: "released", signatures: 2, releasedAt: expect.any(String), projectId: null }]);

    await expect(withdrawDataset({ datasetId: built.datasetId, reason: "wrong metadata" })).rejects.toThrow(/not an eligible/);
    await withdrawDataset({ datasetId: built.datasetId, reason: "wrong metadata", actorId: "example-reviewer-a" });
    expect((await getDataset(built.datasetId))!.dataset).toMatchObject({ status: "withdrawn", archivedReason: "wrong metadata" });

    jar.clear(); // another browser
    expect(await getDataset(built.datasetId)).toBeNull();
    expect(await listDatasets()).toEqual([]);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("keeps the built workbook's bytes so the release page can preview and download exactly the stored file", async () => {
    const built = await buildDataset({ orderId: "ORD048" });
    const { dataset } = (await getDataset(built.datasetId))!;
    const stored = await readDatasetWorkbook(dataset);
    expect(sha(stored.bytes)).toBe(dataset.full.sha256);
    expect(stored.bytes.byteLength).toBe(dataset.full.sizeBytes);
    expect(stored.fileName).toBe("ORD048_dataset_v1.xlsx");
    await expect(readDatasetWorkbook({ ...dataset, full: { ...dataset.full, sha256: "0".repeat(64) } })).rejects.toThrow(/not available/);
  });
  it("supersedes version 1 by a released version 2", async () => {
    const v1 = await buildDataset({ orderId: "ORD053" });
    for (const actorId of ["example-reviewer-a", "example-reviewer-b"]) await signDataset({ datasetId: v1.datasetId, role: "approved", note: null, actorId });
    await releaseDataset({ datasetId: v1.datasetId, actorId: "example-reviewer-a" });
    const v2 = await buildDataset({ orderId: "ORD053" });
    expect(v2.version).toBe(2);
    await expect(supersedeDataset({ datasetId: v1.datasetId, newDatasetId: v2.datasetId, actorId: "example-reviewer-a" })).rejects.toThrow(/is built/);
    for (const actorId of ["example-reviewer-a", "example-reviewer-b"]) await signDataset({ datasetId: v2.datasetId, role: "approved", note: null, actorId });
    await releaseDataset({ datasetId: v2.datasetId, actorId: "example-reviewer-b" });
    await supersedeDataset({ datasetId: v1.datasetId, newDatasetId: v2.datasetId, actorId: "example-reviewer-a" });
    expect((await listDatasets()).map(d => [d.version, d.status])).toEqual([[1, "superseded"], [2, "released"]]);
    expect((await getDataset(v2.datasetId))!.versions.map(v => [v.version, v.status])).toEqual([[1, "superseded"], [2, "released"]]);
  });
  it("lets the demo Owner set the policy; everyone reads it", async () => {
    const view = await getReleasePolicy();
    expect(view).toMatchObject({ policy: demoDefaultPolicy, canEdit: true, me: { userId: "example-staff" } });
    expect(view.staff.map(person => person.role)).toEqual(["owner", "admin", "admin", "operator"]);
    await expect(setReleasePolicy({ eligibleSigners: ["example-reviewer-a", "example-reviewer-b"], requiredSignatures: 2, actorId: "example-reviewer-a" })).rejects.toThrow(/lab owner/i);
    await expect(setReleasePolicy({ eligibleSigners: ["example-reviewer-a"], requiredSignatures: 2, actorId: "example-owner" })).rejects.toThrow(/fewer eligible signers/i);
    await setReleasePolicy({ eligibleSigners: ["example-reviewer-a", "example-staff"], requiredSignatures: 2, actorId: "example-owner" });
    expect((await getReleasePolicy()).policy).toMatchObject({ eligibleSigners: ["example-reviewer-a", "example-staff"], requiredSignatures: 2, setBy: "example-owner" });
    const built = await buildDataset({ orderId: "ORD048" });
    await signDataset({ datasetId: built.datasetId, role: "prepared", note: null }); // the demo operator is now eligible
    await expect(signDataset({ datasetId: built.datasetId, role: "approved", note: null, actorId: "example-reviewer-b" })).rejects.toThrow(/not an eligible/);
  });
});

describe("live seam: the release contract through rpc and storage", () => {
  const rpc = vi.fn();
  type Stored = Map<string, Buffer>;
  const buckets: Record<string, Stored> = {};
  const uploads: { bucket: string; path: string; bytes: Buffer; options: unknown }[] = [];
  // An object the bucket already holds at a path the next upload targets (the review's 46 wrong bytes, say).
  let preexisting: (path: string, bytes: Buffer) => Buffer | undefined = () => undefined;
  let unreadable: (path: string) => boolean = () => false;
  // Every remove() call, and how the next ones fail (a thrown error, or an error in the result like supabase-js).
  const removes: { bucket: string; paths: string[] }[] = [];
  let removeFails: "throw" | "error" | null = null;
  // Like Storage: objects are immutable (upsert false); a second write to a path is refused as a duplicate.
  const storage = {
    from: (bucket: string) => ({
      download: async (path: string) => {
        const bytes = unreadable(path) ? undefined : buckets[bucket]?.get(path);
        return bytes ? { data: new Blob([new Uint8Array(bytes)]), error: null } : { data: null, error: { message: "Object not found" } };
      },
      upload: async (path: string, bytes: Buffer | Uint8Array, options: unknown) => {
        const store = (buckets[bucket] ??= new Map());
        const planted = preexisting(path, Buffer.from(bytes));
        if (planted) store.set(path, planted);
        if (store.has(path)) return { data: null, error: { statusCode: "409", message: "The resource already exists" } };
        uploads.push({ bucket, path, bytes: Buffer.from(bytes), options });
        store.set(path, Buffer.from(bytes));
        return { data: { path }, error: null };
      },
      remove: async (paths: string[]) => {
        removes.push({ bucket, paths: [...paths] });
        if (removeFails === "throw") throw new Error("network down");
        if (removeFails === "error") return { data: null, error: { message: "storage unavailable" } };
        const gone = paths.filter(path => buckets[bucket]?.delete(path));
        return { data: gone.map(name => ({ name })), error: null };
      },
    }),
  };
  // build_dataset as the database runs it (0008): under the order lock the caller's expected version must be the next one.
  const databaseBuild = async (name: string, args: Record<string, unknown>) => {
    if (name !== "build_dataset") return { data: null, error: null };
    const next = tables.dataset.filter(row => row.order_id === args.p_order_id).reduce((max, row) => Math.max(max, Number(row.version)), 0) + 1;
    if (args.p_expected_version !== next) return { data: null, error: { code: "PT409", message: `version ${next} is next for order ORD048, but these files were built for version ${args.p_expected_version}; build them again` } };
    const id = `ds-v${next}`;
    tables.dataset.push({
      id, order_id: args.p_order_id, client_id: "client-uuid", result_file_id: args.p_result_file_id, version: next, status: "built", storage_path: args.p_storage_path, sha256: args.p_sha256,
      analysis_sha256: args.p_analysis_sha256, analysis_size_bytes: args.p_analysis_size_bytes, companion_sha256: args.p_companion_sha256, companion_size_bytes: args.p_companion_size_bytes,
      project_id: null, companion_path: null, released_at: null, archived_at: null, archived_reason: null, created_at: "2026-11-08T12:00:00Z",
    });
    return { data: id, error: null };
  };
  async function provenance(bytes: Buffer): Promise<Record<string, unknown>> {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
    const out: Record<string, unknown> = {};
    book.getWorksheet("Provenance")!.eachRow((row, n) => { if (n > 1) out[String(row.getCell(1).value)] = row.getCell(2).value; });
    return out;
  }
  async function sheetRows(bytes: Buffer, name: string): Promise<unknown[][]> {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
    const rows: unknown[][] = [];
    book.getWorksheet(name)!.eachRow(row => rows.push((row.values as unknown[]).slice(1)));
    return rows;
  }
  // The accepted TXT on record: its bytes in admin-files and its digest on the results file row.
  function accepted(bytes: Buffer, samples?: { code: string; full_name: string }[]) {
    tables.result_file[0].sha256 = sha(bytes);
    buckets["admin-files"].set("client-uuid/ORD048/review-1/results.txt", bytes);
    if (samples) tables.sample = samples.map((sample, i) => ({ id: `s-${i}`, order_id: "order-uuid", sample_code: sample.code, sample_number: i + 1, full_name: sample.full_name, group1_term: "G", group2_term: null, replicate_term: String(i + 1), patient_term: null, time_point_term: null, archived_at: null }));
  }
  const rows = () => ({
    order: [{ id: "order-uuid", code: "ORD048", title: "Example processing review", stage: "processed", client_id: "client-uuid", archived_at: null, order_number: 48 }],
    client: [{ id: "client-uuid", name: "Example Atlas", archived_at: null }],
    result_file: [{ id: "rf-uuid", order_id: "order-uuid", status: "accepted", sha256: sha(sourceText), storage_path: "client-uuid/ORD048/review-1/results.txt", sciex_os_version: "3.4.5", processing_method: "Global v1", accepted_at: "2026-11-07T15:00:00Z", archived_at: null, created_at: "2026-11-07T15:00:00Z" }],
    sample: ["S1", "S2", "S3"].map((code, i) => ({ id: `s-${i}`, order_id: "order-uuid", sample_code: code, sample_number: i + 1, full_name: `Group_${i + 1}`, group1_term: "G", group2_term: null, replicate_term: String(i + 1), patient_term: null, time_point_term: null, archived_at: null })),
    dataset: [] as Record<string, unknown>[],
    signature: [] as Record<string, unknown>[],
    lab_staff: [
      { user_id: "u-owner", display_name: "Lab Owner", role: "owner", archived_at: null },
      { user_id: "u-admin", display_name: "Lab Admin", role: "admin", archived_at: null },
      { user_id: "u-operator", display_name: "Lab Operator", role: "operator", archived_at: null },
    ],
    release_policy: [] as Record<string, unknown>[],
  });
  let tables: ReturnType<typeof rows>;
  beforeEach(() => {
    rpc.mockReset();
    uploads.length = 0;
    removes.length = 0;
    removeFails = null;
    preexisting = () => undefined;
    unreadable = () => false;
    for (const key of Object.keys(buckets)) delete buckets[key];
    tables = rows();
    const db = fakePostgrest(tables);
    session = { userId: "u-admin", displayName: "Lab Admin", role: "Admin", view: "staff", mock: false };
    vi.mocked(getEnvironment).mockReturnValue(live);
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ rpc, from: db.from }), storage } as never);
    (buckets["admin-files"] ??= new Map()).set("client-uuid/ORD048/review-1/results.txt", Buffer.from(sourceText));
  });
  it("signs, withdraws, supersedes and sets the policy with the contract's function and argument names", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await signDataset({ datasetId: "ds-uuid", role: "reviewed", note: "ok", actorId: "ignored-in-live" });
    expect(rpc).toHaveBeenLastCalledWith("sign_dataset", { p_dataset_id: "ds-uuid", p_role: "reviewed", p_note: "ok" });
    await withdrawDataset({ datasetId: "ds-uuid", reason: "wrong metadata" });
    expect(rpc).toHaveBeenLastCalledWith("withdraw_dataset", { p_dataset_id: "ds-uuid", p_reason: "wrong metadata" });
    await supersedeDataset({ datasetId: "ds-uuid", newDatasetId: "ds-2" });
    expect(rpc).toHaveBeenLastCalledWith("supersede_dataset", { p_dataset_id: "ds-uuid", p_new_dataset_id: "ds-2" });
    await setReleasePolicy({ eligibleSigners: ["u-owner", "u-admin"], requiredSignatures: 2 });
    expect(rpc).toHaveBeenLastCalledWith("set_release_policy", { p_eligible_signers: ["u-owner", "u-admin"], p_required_signatures: 2 });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "you are not an eligible release signer under the current policy" } });
    await expect(signDataset({ datasetId: "ds-uuid", role: "reviewed", note: null })).rejects.toThrow(/not an eligible release signer/);
  });
  it("builds: downloads the accepted TXT, uploads the three files under the order, records their digests through build_dataset", async () => {
    rpc.mockResolvedValueOnce({ data: "ds-uuid", error: null });
    expect(await buildDataset({ orderId: "order-uuid" })).toEqual({ datasetId: "ds-uuid", version: 1 });
    expect(uploads.map(u => u.bucket)).toEqual(["admin-files", "admin-files", "admin-files"]);
    const [full, analysis, companion] = uploads;
    // Each file under its own digest (finding 6): a path never names bytes it does not hold.
    const folder = "client-uuid/ORD048/datasets";
    expect(uploads.map(u => u.path)).toEqual([`${folder}/${sha(full.bytes)}/dataset-v1.xlsx`, `${folder}/${sha(analysis.bytes)}/analysis.xlsx`, `${folder}/${sha(companion.bytes)}/companion.xlsx`]);
    for (const upload of uploads) expect(upload.options).toMatchObject({ upsert: false, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "build_dataset", {
      p_order_id: "order-uuid", p_result_file_id: "rf-uuid", p_expected_version: 1, p_storage_path: `${folder}/${sha(full.bytes)}/dataset-v1.xlsx`, p_sha256: sha(full.bytes),
      p_analysis_sha256: sha(analysis.bytes), p_analysis_size_bytes: analysis.bytes.byteLength,
      p_companion_sha256: sha(companion.bytes), p_companion_size_bytes: companion.bytes.byteLength,
    });
    // 0037: then the version's sample and lipid counts, for the Datasets list (the build stands if this fails).
    expect(rpc).toHaveBeenNthCalledWith(2, "record_dataset_counts", { p_dataset_id: "ds-uuid", p_samples: expect.any(Number), p_lipids: expect.any(Number) });
    const counted = rpc.mock.calls[1][1] as { p_samples: number; p_lipids: number };
    expect(counted.p_samples).toBeGreaterThan(0);
    expect(counted.p_lipids).toBeGreaterThan(0);
    // The TXT on record is checked against its accepted digest before anything is built.
    tables.result_file[0].sha256 = "0".repeat(64);
    await expect(buildDataset({ orderId: "order-uuid" })).rejects.toThrow(/does not match/);
    expect(uploads).toHaveLength(3);
    expect(removes).toEqual([]); // the call succeeded: nothing to clean up
  });
  it("releases: stages the analysis file in case-files at <project_id>/<analysis_sha256> with the user's own token, then calls release_dataset with the recorded manifest", async () => {
    rpc.mockResolvedValueOnce({ data: "ds-uuid", error: null });
    await buildDataset({ orderId: "order-uuid" });
    const [full, analysis] = uploads;
    tables.dataset.push({
      id: "ds-uuid", order_id: "order-uuid", client_id: "client-uuid", result_file_id: "rf-uuid", version: 1, status: "built", storage_path: full.path, sha256: sha(full.bytes),
      analysis_sha256: sha(analysis.bytes), analysis_size_bytes: analysis.bytes.byteLength, companion_sha256: sha(uploads[2].bytes), companion_size_bytes: uploads[2].bytes.byteLength,
      project_id: null, companion_path: null, released_at: null, archived_at: null, archived_reason: null, created_at: "2026-11-07T16:00:00Z",
    });
    tables.signature.push({ id: "sig-1", dataset_id: "ds-uuid", user_id: "u-owner", role: "prepared", note: null, signed_at: "2026-11-07T16:10:00Z", archived_at: null },
      { id: "sig-2", dataset_id: "ds-uuid", user_id: "u-admin", role: "approved", note: "ok", signed_at: "2026-11-07T16:20:00Z", archived_at: null });
    const view = (await getDataset("ds-uuid"))!;
    expect(view.dataset).toMatchObject({ orderCode: "ORD048", orderTitle: "Example processing review", clientName: "Example Atlas", status: "built", version: 1, projectId: null, projectName: null });
    expect(view.dataset.provenance).toMatchObject({ sourceSha256: sha(sourceText), sciexOsVersion: "3.4.5", processingMethod: "Global v1", acceptedAt: "2026-11-07T15:00:00Z" });
    expect(view.dataset.signatures.map(s => [s.name, s.role])).toEqual([["Lab Owner", "prepared"], ["Lab Admin", "approved"]]);
    expect(view.me).toEqual({ userId: "u-admin", name: "Lab Admin", role: "admin" });
    expect(view.demoActors).toBeNull();

    rpc.mockImplementationOnce(async () => ({ data: null, error: null }));
    await releaseDataset({ datasetId: "ds-uuid" });
    // Team is retired (0030): nothing is copied anywhere; the release only records the companion path.
    expect(uploads).toHaveLength(3);
    expect(rpc).toHaveBeenLastCalledWith("release_dataset", {
      p_dataset_id: "ds-uuid", p_companion_path: `client-uuid/ORD048/datasets/${sha(uploads[2].bytes)}/companion.xlsx`,
    });
  });
  // Finding 4: a shared batch of two clients. Only this order's registered samples may reach its files.
  const shared = (columns: [string, string, string][]) => Buffer.from([
    ["Sample Name", ...columns.map(c => c[0])], ["Sample Type", ...columns.map(c => c[1])],
    ["PC(16:0_18:1)+AcO", ...columns.map(c => c[2])], ["PE(18:0_20:4)-H", ...columns.map(() => "250")], ["PC(15:0_18:1)_SPLASH.IS", ...columns.map(() => "77")],
  ].map(line => line.join("\t")).join("\n") + "\n");
  const ownSamples = [{ code: "ORD048-S001", full_name: "Ctrl_1" }, { code: "ORD048-S002", full_name: "Trt_1" }];
  it("refuses to build when an Unknown injection of the accepted TXT is not a registered sample of this order: nothing uploaded, nothing recorded", async () => {
    rpc.mockImplementation(databaseBuild);
    accepted(shared([["B2026-031_001_ORD048-S001", "Unknown", "111"], ["B2026-031_002_ORD049-S001", "Unknown", "999"], ["B2026-031_003_ORD048-S002", "Unknown", "112"],
      ["B2026-031_004_Blank", "Blank", "N/A"], ["B2026-031_005_PQC", "Quality Control", "500"]]), ownSamples);
    await expect(buildDataset({ orderId: "order-uuid" })).rejects.toThrow(/1 Unknown injection is not a registered sample of ORD048: B2026-031_002_ORD049-S001/);
    expect(uploads).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    // A sample of this order that is not registered (yet) is refused the same way, not published under its SCIEX name.
    accepted(shared([["B2026-031_001_ORD048-S001", "Unknown", "111"], ["B2026-031_003_ORD048-S003", "Unknown", "113"]]));
    await expect(buildDataset({ orderId: "order-uuid" })).rejects.toThrow(/not a registered sample of ORD048: B2026-031_003_ORD048-S003/);
    expect(uploads).toEqual([]);
  });
  it("builds a shared-batch export once it holds only this order's samples: no foreign column, blanks and QC only in QC_Injections", async () => {
    rpc.mockImplementation(databaseBuild);
    accepted(shared([["B2026-031_001_ORD048-S001", "Unknown", "111"], ["B2026-031_003_ORD048-S002", "Unknown", "112"],
      ["B2026-031_004_Blank", "Blank", "N/A"], ["B2026-031_005_PQC", "Quality Control", "500"]]), ownSamples);
    expect(await buildDataset({ orderId: "order-uuid" })).toEqual({ datasetId: "ds-v1", version: 1 });
    const [, analysis, companion] = uploads;
    expect(await sheetRows(analysis.bytes, "Abundance")).toEqual([["Lipid", "Ctrl_1", "Trt_1"], ["PC(16:0_18:1)+AcO", 111, 112], ["PE(18:0_20:4)-H", 250, 250]]);
    expect((await sheetRows(analysis.bytes, "Metadata")).map(row => row[0])).toEqual(["FullName", "Ctrl_1", "Trt_1"]);
    expect((await sheetRows(companion.bytes, "QC_Injections"))[0]).toEqual(["Lipid", "B2026-031_004_Blank", "B2026-031_005_PQC"]);
    expect((await sheetRows(companion.bytes, "Internal_Standards"))[0]).toEqual(["Lipid", "Ctrl_1", "Trt_1"]);
  });
  // Finding 6: an object already at a path is accepted only when it holds exactly the intended bytes.
  it("fails closed when a path already holds other bytes, and accepts an identical existing object", async () => {
    rpc.mockImplementation(databaseBuild);
    preexisting = path => (path.endsWith("/companion.xlsx") ? Buffer.from("x".repeat(46)) : undefined);
    await expect(buildDataset({ orderId: "order-uuid" })).rejects.toThrow(/admin-files already holds .*companion\.xlsx.* other bytes/);
    expect(rpc).not.toHaveBeenCalled();
    // (The planted object stays at its path for good; a rebuild of the same bytes keeps failing there. Start clean.)
    for (const path of [...buckets["admin-files"].keys()]) if (path.includes("/datasets/")) buckets["admin-files"].delete(path);
    preexisting = (path, bytes) => (path.endsWith("/analysis.xlsx") ? bytes : undefined);
    expect(await buildDataset({ orderId: "order-uuid" })).toMatchObject({ version: 1 });
    // An existing object that cannot be read back is not trusted either.
    tables.dataset.length = 0;
    preexisting = (path, bytes) => (path.endsWith("/dataset-v1.xlsx") ? bytes : undefined);
    unreadable = path => path.endsWith("/dataset-v1.xlsx");
    await expect(buildDataset({ orderId: "order-uuid" })).rejects.toThrow(/could not be read back/);
  });
  // Finding 7: two builds that read the same next version; the database refuses the stale one, which is built again.
  it("two concurrent builds record versions 1 and 2, and each file's Provenance carries its own database version", async () => {
    rpc.mockImplementation(databaseBuild);
    const results = await Promise.all([buildDataset({ orderId: "order-uuid" }), buildDataset({ orderId: "order-uuid" })]);
    expect(results.map(r => r.version).sort()).toEqual([1, 2]);
    expect(rpc.mock.calls.filter(([name]) => name === "build_dataset").map(([, args]) => args.p_expected_version)).toEqual([1, 1, 2]);
    for (const { datasetId, version } of results) {
      const row = tables.dataset.find(item => item.id === datasetId)!;
      expect(row.version).toBe(version);
      for (const digest of [row.sha256, row.companion_sha256]) {
        const file = uploads.find(upload => sha(upload.bytes) === digest)!;
        expect((await provenance(file.bytes)).dataset_version, `v${version}`).toBe(String(version));
      }
    }
  });
  // Finding 8: Provenance names the accepted bytes, BOM included.
  it("records the digest of the accepted bytes as source_txt_sha256, also when the TXT starts with a UTF-8 BOM", async () => {
    rpc.mockImplementation(databaseBuild);
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(sourceText)]);
    accepted(bom);
    await buildDataset({ orderId: "order-uuid" });
    const [full, , companion] = uploads;
    expect((await provenance(full.bytes)).source_txt_sha256).toBe(sha(bom));
    expect((await provenance(companion.bytes)).source_txt_sha256).toBe(sha(bom));
    expect(sha(bom)).not.toBe(sha(sourceText));
  });
  // 0012: a failed call removes, with the same token, exactly what this call uploaded, and still throws its own error.
  it("removes this build's uploads when build_dataset fails, then throws the function's error", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "results file rf-uuid is superseded; only an accepted file is built into a dataset" } });
    await expect(buildDataset({ orderId: "order-uuid" })).rejects.toThrow(/results file rf-uuid is superseded/);
    expect(removes).toEqual([{ bucket: "admin-files", paths: uploads.map(u => u.path) }]);
    expect(uploads).toHaveLength(3);
    expect([...buckets["admin-files"].keys()]).toEqual(["client-uuid/ORD048/review-1/results.txt"]);
  });
  it("never removes an identical object that was already there, only what this call wrote", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied for function build_dataset" } });
    preexisting = (path, bytes) => (path.endsWith("/analysis.xlsx") ? bytes : undefined);
    await expect(buildDataset({ orderId: "order-uuid" })).rejects.toThrow("You do not have permission to do this.");
    expect(uploads.map(u => u.path.split("/").at(-1))).toEqual(["dataset-v1.xlsx", "companion.xlsx"]);
    expect(removes).toEqual([{ bucket: "admin-files", paths: uploads.map(u => u.path) }]);
    expect([...buckets["admin-files"].keys()].filter(path => path.includes("/datasets/"))).toEqual([expect.stringMatching(/\/analysis\.xlsx$/)]);
  });
  it("removes what it wrote when a later upload fails closed", async () => {
    preexisting = path => (path.endsWith("/companion.xlsx") ? Buffer.from("x".repeat(46)) : undefined);
    await expect(buildDataset({ orderId: "order-uuid" })).rejects.toThrow(/companion\.xlsx.* other bytes/);
    expect(rpc).not.toHaveBeenCalled();
    expect(removes).toEqual([{ bucket: "admin-files", paths: uploads.map(u => u.path) }]);
    expect(uploads.map(u => u.path.split("/").at(-1))).toEqual(["dataset-v1.xlsx", "analysis.xlsx"]);
  });
  it("a failed or erroring remove never replaces the function's error; it logs a short warning without paths", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const failure of ["throw", "error"] as const) {
      for (const path of [...buckets["admin-files"].keys()]) if (path.includes("/datasets/")) buckets["admin-files"].delete(path); // what the failed remove left
      removeFails = failure;
      rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: `order ORD048 is archived (${failure})` } });
      await expect(buildDataset({ orderId: "order-uuid" })).rejects.toThrow(`order ORD048 is archived (${failure})`);
    }
    expect(removes).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(2);
    for (const [message] of warn.mock.calls) {
      expect(message).toMatch(/^release: could not remove 3 uploaded objects from admin-files/);
      expect(message).not.toMatch(/client-uuid|ORD048|[0-9a-f]{64}/);
    }
    warn.mockRestore();
  });
  it("removes the stale attempt's files when another build took the version, and keeps the recorded ones", async () => {
    rpc.mockImplementation(databaseBuild);
    await Promise.all([buildDataset({ orderId: "order-uuid" }), buildDataset({ orderId: "order-uuid" })]);
    // (Both first attempts may build identical bytes; the loser then wrote nothing of its own and removes nothing.)
    expect(removes.length).toBeLessThanOrEqual(1);
    const recorded = tables.dataset.flatMap(row => [row.storage_path, `client-uuid/ORD048/datasets/${row.analysis_sha256}/analysis.xlsx`, `client-uuid/ORD048/datasets/${row.companion_sha256}/companion.xlsx`]);
    for (const path of removes.flatMap(r => r.paths)) expect(recorded).not.toContain(path);
    for (const path of recorded) expect(buckets["admin-files"].has(path as string), String(path)).toBe(true);
  });
  it("reads the stored workbook from admin-files and refuses bytes that do not match the recorded digest", async () => {
    rpc.mockImplementation(databaseBuild);
    await buildDataset({ orderId: "order-uuid" });
    const { dataset } = (await getDataset("ds-v1"))!;
    const stored = await readDatasetWorkbook(dataset);
    expect(stored.bytes.equals(uploads[0].bytes)).toBe(true);
    expect(stored.fileName).toBe("ORD048_dataset_v1.xlsx");
    buckets["admin-files"].set(dataset.full.path!, Buffer.from("other bytes"));
    await expect(readDatasetWorkbook(dataset)).rejects.toThrow(/does not match the digest recorded/);
    await expect(readDatasetWorkbook({ ...dataset, full: { ...dataset.full, path: null } })).rejects.toThrow(/no stored workbook/);
  });
  it("fails closed without an authenticated client", async () => {
    vi.mocked(createAdminClient).mockResolvedValue(null);
    await expect(signDataset({ datasetId: "ds-uuid", role: "reviewed", note: null })).rejects.toThrow(DataError);
    expect(rpc).not.toHaveBeenCalled();
    expect(randomUUID()).toMatch(UUID);
  });
});
