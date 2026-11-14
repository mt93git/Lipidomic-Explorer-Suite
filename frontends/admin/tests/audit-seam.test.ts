// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { getEnvironment } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/session";
import { exportAuditEvents, listAuditEvents, recordAuditExport } from "@/lib/data/audit";
import { writeDemoState } from "@/lib/data/demo-store";
import { emptyDemoState, type DemoState } from "@/lib/samples-demo";
import type { DemoDataset } from "@/lib/release-demo";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => session) }));

let session = { userId: "example-staff", displayName: "Demo Operator", role: "Operator", view: "staff", mock: true };
const none = { entity: null, order: null, before: null };

const jar = new Map<string, string>();
beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => { jar.set(name, value); },
  } as never);
});

// ---------------------------------------------------------------- live: the query shape

// Records every builder call per table and answers from `respond`; enough to see the exact PostgREST request.
type Call = [string, ...unknown[]];
type Answer = { data: unknown; error: { message: string } | null };
function recorder(respond: (table: string, calls: Call[]) => Answer) {
  const queries: { table: string; calls: Call[] }[] = [];
  const builder = (table: string) => {
    const calls: Call[] = [];
    queries.push({ table, calls });
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "is", "not", "lt", "or", "order", "limit", "range", "maybeSingle"]) chain[method] = (...args: unknown[]) => { calls.push([method, ...args]); return chain; };
    chain.then = (resolve: (value: Answer) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(respond(table, calls)).then(resolve, reject);
    return chain;
  };
  return { queries, client: { schema: (name: string) => { expect(name).toBe("admin"); return { from: builder }; } } };
}
const of = (queries: { table: string; calls: Call[] }[], table: string) => queries.filter(query => query.table === table).map(query => query.calls);

const STEPH = "5e5e5e5e-0000-4000-8000-000000000001";
const ME = "5e5e5e5e-0000-4000-8000-0000000000aa";
const ORDER = "0d0d0d0d-0000-4000-8000-000000000080";
const D1 = "da7a0000-0000-4000-8000-000000000001";
const D2 = "da7a0000-0000-4000-8000-000000000002";
const COLUMNS = "id, created_at, actor, client_id, entity, entity_id, action, before, after";
const auditRow = (id: number, patch: Record<string, unknown> = {}) => ({
  id, created_at: "2026-11-08T15:00:00Z", actor: STEPH, entity: "dataset", entity_id: D1, action: "UPDATE",
  before: { id: D1, order_id: ORDER, version: 1, status: "built" }, after: { id: D1, order_id: ORDER, version: 1, status: "released" }, ...patch,
});
function liveDb(audit: unknown[], extra: Partial<Record<string, Answer>> = {}) {
  return recorder((table, calls) => {
    if (extra[table]) return extra[table]!;
    if (table === "audit_event") return { data: audit, error: null };
    if (table === "lab_staff") return { data: [{ user_id: STEPH, display_name: "Stephania (simulated)" }, { user_id: ME, display_name: null }], error: null };
    if (table === "order") return calls.some(call => call[0] === "maybeSingle") ? { data: { id: ORDER, code: "ORD080" }, error: null } : { data: [{ id: ORDER, code: "ORD080" }], error: null };
    if (table === "dataset") return { data: [{ id: D1, order_id: ORDER, version: 1 }, { id: D2, order_id: ORDER, version: 2 }], error: null };
    return { data: [], error: null };
  });
}

describe("live seam: admin.audit_event through the signed-in user's token", () => {
  beforeEach(() => {
    vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
    session = { userId: ME, displayName: "me@admin-staging.test", role: "Owner", view: "staff", mock: false };
  });

  it("asks for the newest 51 events (50 shown, one to know there are older), keyset on id, and names them", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => auditRow(200 - index));
    const db = liveDb(rows);
    vi.mocked(createAdminClient).mockResolvedValue(db.client as never);
    const page = await listAuditEvents(none);
    expect(requireWorkspace).toHaveBeenCalledWith("staff");
    expect(of(db.queries, "audit_event")).toEqual([[["select", COLUMNS], ["order", "id", { ascending: false }], ["limit", 51]]]);
    expect(page.rows).toHaveLength(50);
    expect(page.older).toBe(151);
    expect(page.order).toBeNull();
    expect(page.rows[0]).toMatchObject({ id: 200, at: "2026-11-08T15:00:00Z", who: "Stephania (simulated)", entity: "Dataset", summary: "Dataset ORD080 v1 released" });
    expect(page.rows[0].changes).toEqual([{ field: "Status", before: "built", after: "released" }]);
    // Names: every lab person, archived or not (a signer who left still signed); datasets and orders the page mentions.
    expect(of(db.queries, "lab_staff")).toEqual([[["select", "user_id, display_name"]]]);
    expect(of(db.queries, "order")).toEqual([[["select", "id, code"], ["in", "id", [ORDER]], ["order", "id"], ["range", 0, 999]]]);
  });

  it("filters by entity and continues below the cursor; the last page has no Older", async () => {
    const db = liveDb([auditRow(119), auditRow(118)]);
    vi.mocked(createAdminClient).mockResolvedValue(db.client as never);
    const page = await listAuditEvents({ entity: "dataset", order: null, before: 120 });
    expect(of(db.queries, "audit_event")).toEqual([[["select", COLUMNS], ["eq", "entity", "dataset"], ["lt", "id", 120], ["order", "id", { ascending: false }], ["limit", 51]]]);
    expect(page.rows.map(row => row.id)).toEqual([119, 118]);
    expect(page.older).toBeNull();
  });

  it("an order code matches the order and its shipments, samples, result files, datasets and their signatures", async () => {
    const signature = auditRow(90, { entity: "signature", entity_id: "51900000-0000-4000-8000-000000000001", action: "INSERT", before: null, after: { dataset_id: D2, user_id: STEPH, role: "approved" } });
    const db = liveDb([signature]);
    vi.mocked(createAdminClient).mockResolvedValue(db.client as never);
    const page = await listAuditEvents({ entity: null, order: "ORD080", before: null });
    expect(of(db.queries, "order")[0]).toEqual([["select", "id, code"], ["eq", "code", "ORD080"], ["maybeSingle"]]);
    expect(of(db.queries, "dataset")[0]).toEqual([["select", "id, order_id, version"], ["eq", "order_id", ORDER]]);
    expect(of(db.queries, "audit_event")).toEqual([[
      ["select", COLUMNS],
      ["or", `and(entity.eq.order,entity_id.eq.${ORDER}),and(entity.in.(shipment,sample,result_file,dataset),after->>order_id.eq.${ORDER}),and(entity.eq.signature,after->>dataset_id.in.(${D1},${D2}))`],
      ["order", "id", { ascending: false }], ["limit", 51],
    ]]);
    expect(page.order).toEqual({ code: "ORD080", found: true });
    expect(page.rows[0].summary).toBe("Signature added to ORD080 v2 (Approved)");
  });

  it("an order without datasets leaves the signature clause out; an unknown order code reads nothing", async () => {
    const db = liveDb([], { dataset: { data: [], error: null } });
    vi.mocked(createAdminClient).mockResolvedValue(db.client as never);
    await listAuditEvents({ entity: null, order: "ORD080", before: null });
    expect(of(db.queries, "audit_event")[0]).toContainEqual(["or", `and(entity.eq.order,entity_id.eq.${ORDER}),and(entity.in.(shipment,sample,result_file,dataset),after->>order_id.eq.${ORDER})`]);

    const missing = liveDb([], { order: { data: null, error: null } });
    vi.mocked(createAdminClient).mockResolvedValue(missing.client as never);
    expect(await listAuditEvents({ entity: null, order: "ORD999", before: null })).toEqual({ rows: [], older: null, order: { code: "ORD999", found: false } });
    expect(of(missing.queries, "audit_event")).toEqual([]);
  });

  it("who: lab staff name, the signed-in user's own email when they have no name, a short id, else System", async () => {
    const db = liveDb([auditRow(3, { actor: ME }), auditRow(2, { actor: "abcdef12-0000-4000-8000-000000000009" }), auditRow(1, { actor: null })]);
    vi.mocked(createAdminClient).mockResolvedValue(db.client as never);
    expect((await listAuditEvents(none)).rows.map(row => row.who)).toEqual(["me@admin-staging.test", "User abcdef12…", "System"]);
  });

  it("a refusal reads as one", async () => {
    const db = liveDb([], { audit_event: { data: null, error: { message: "permission denied for table audit_event" } } });
    vi.mocked(createAdminClient).mockResolvedValue(db.client as never);
    await expect(listAuditEvents(none)).rejects.toThrow("You do not have permission to do this.");
  });

  it("a21 Client column: the event's client by name and colour; a batch names every client with an injection in it", async () => {
    const HEME = "c1000000-0000-4000-8000-000000000001";
    const LIB = "c1000000-0000-4000-8000-000000000002";
    const BATCH = "ba000000-0000-4000-8000-000000000031";
    const db = liveDb([
      auditRow(3, { client_id: HEME }),
      auditRow(2, { client_id: null, entity: "batch", entity_id: BATCH, action: "UPDATE", before: { name: "B2026-031", status: "planned" }, after: { name: "B2026-031", status: "sequence_exported" } }),
      auditRow(1, { client_id: null, entity: "release_policy", entity_id: null, action: "INSERT", before: null, after: { required_signatures: 2, eligible_signers: [] } }),
    ], {
      client: { data: [{ id: LIB, name: "Libreros lab" }, { id: HEME, name: "Hematology group" }], error: null },
      injection: { data: [{ client_id: LIB, batch_version: { batch_id: BATCH } }, { client_id: HEME, batch_version: { batch_id: BATCH } }, { client_id: LIB, batch_version: { batch_id: BATCH } }], error: null },
    });
    vi.mocked(createAdminClient).mockResolvedValue(db.client as never);
    const page = await listAuditEvents(none);
    expect(page.rows.map(row => row.clients)).toEqual([
      [{ name: "Hematology group", slot: 0 }],
      [{ name: "Hematology group", slot: 0 }, { name: "Libreros lab", slot: 1 }],
      [],
    ]);
    expect(of(db.queries, "client")).toEqual([[["select", "id, name"]]]);
    expect(of(db.queries, "injection")).toEqual([[["select", "client_id, batch_version!inner(batch_id)"], ["in", "batch_version.batch_id", [BATCH]], ["not", "client_id", "is", null], ["order", "id"], ["range", 0, 999]]]);
  });

  it("context reads stay whole past PostgREST's row cap and short in the URL: 100 ids per request, 1000 rows per page", async () => {
    const LIB = "c1000000-0000-4000-8000-000000000002";
    const HEME = "c1000000-0000-4000-8000-000000000001";
    const batches = Array.from({ length: 150 }, (_, index) => `ba000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    const audit = batches.map((batch, index) => auditRow(1000 - index, { client_id: null, entity: "batch", entity_id: batch, before: null, action: "INSERT", after: { name: `B2026-${String(index).padStart(3, "0")}`, status: "planned" } }));
    // The first chunk's batches hold 1200 injections: LIB in the first 1000 rows, HEME only in the next page.
    const db = recorder((table, calls) => {
      if (table === "client") return { data: [{ id: LIB, name: "Libreros lab" }, { id: HEME, name: "Hematology group" }], error: null };
      if (table !== "injection") return { data: table === "audit_event" ? audit : [], error: null };
      const chunk = calls.find(call => call[0] === "in")?.[2] as string[];
      const [, from] = calls.find(call => call[0] === "range") as [string, number, number];
      if (chunk[0] !== batches[0]) return { data: [], error: null };
      const rows = Array.from({ length: 1200 }, (_, index) => ({ client_id: index < 1000 ? LIB : HEME, batch_version: { batch_id: batches[49] } }));
      return { data: rows.slice(from, from + 1000), error: null };
    });
    vi.mocked(createAdminClient).mockResolvedValue(db.client as never);
    const file = await exportAuditEvents(none);
    expect(file.rows.find(row => row.id === 1000 - 49)?.clients.map(client => client.name)).toEqual(["Hematology group", "Libreros lab"]);
    const injections = of(db.queries, "injection");
    expect(injections.map(calls => (calls.find(call => call[0] === "in")?.[2] as string[]).length)).toEqual([100, 100, 50]);
    expect(injections.map(calls => calls.find(call => call[0] === "range"))).toEqual([["range", 0, 999], ["range", 1000, 1999], ["range", 0, 999]]);
  });

  it("export: every event of the filter, 1000 per request on the same keyset, up to the cap; the page cursor is ignored", async () => {
    const all = Array.from({ length: 1500 }, (_, index) => auditRow(1500 - index));
    const db = recorder((table, calls) => {
      if (table !== "audit_event") return { data: [], error: null };
      const below = calls.find(call => call[0] === "lt")?.[2] as number | undefined;
      return { data: all.filter(row => below === undefined || row.id < below).slice(0, 1000), error: null };
    });
    vi.mocked(createAdminClient).mockResolvedValue(db.client as never);
    const file = await exportAuditEvents({ entity: "dataset", order: null, before: 700 });
    expect(requireWorkspace).toHaveBeenCalledWith("staff");
    expect(file.rows).toHaveLength(1500);
    expect(file.truncated).toBe(false);
    expect(file.rows[0]).toMatchObject({ id: 1500, action: "UPDATE", entity: "Dataset" });
    expect(of(db.queries, "audit_event")).toEqual([
      [["select", COLUMNS], ["eq", "entity", "dataset"], ["order", "id", { ascending: false }], ["limit", 1000]],
      [["select", COLUMNS], ["eq", "entity", "dataset"], ["lt", "id", 501], ["order", "id", { ascending: false }], ["limit", 1000]],
    ]);
  });
});

// ---------------------------------------------------------------- demo: events derived from the demo store

const file = { sha256: "a".repeat(64), sizeBytes: 2000, sheets: ["Abundance"] };
const released: DemoDataset = {
  id: "demo-dataset-1", orderCode: "ORD048", clientId: "example-atlas", version: 1, status: "released",
  builtAt: "2026-11-03T15:00:00Z", builtBy: "Demo Operator", sourceSha256: "b".repeat(64), sciexOsVersion: null, processingMethod: null,
  storagePath: "example-atlas/ORD048/datasets/x/dataset-v1.xlsx", full: file, analysis: file, companion: file,
  headerMode: "fullName", matched: 40, samples: 40, lipids: 33,
  signatures: [
    { id: "sig-a", userId: "example-reviewer-a", name: "Demo Reviewer A", role: "reviewed", note: "Checked", signedAt: "2026-11-04T15:00:00Z" },
    { id: "sig-b", userId: "example-reviewer-b", name: "Demo Reviewer B", role: "approved", note: null, signedAt: "2026-11-05T15:00:00Z" },
  ],
  releasedAt: "2026-11-05T16:00:00Z", releasedBy: "Demo Reviewer B", projectId: "7e470000-0000-4000-8000-000000000001", projectName: "ORD048 Example",
  archivedAt: null, archivedReason: null,
};
const demoState = (): DemoState => ({
  ...emptyDemoState(),
  shipments: [{ id: "ship-1", orderCode: "ORD048", carrier: "FedEx", trackingNumber: null, condition: "ok", boxCount: 1, notes: null, receivedAt: "2026-11-02T15:00:00Z", receivedBy: "Demo Operator" }],
  datasets: [released],
});

describe("recording an export (0042)", () => {
  it("live: admin.record_audit_export with the filter and the row count, as the signed-in user; a refusal reads as one", async () => {
    vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    vi.mocked(createAdminClient).mockResolvedValue({ schema: (name: string) => { expect(name).toBe("admin"); return { rpc }; } } as never);
    await recordAuditExport({ entity: "order", order: "ORD080", before: 12 }, 12, false);
    expect(requireWorkspace).toHaveBeenCalledWith("staff");
    expect(rpc).toHaveBeenCalledWith("record_audit_export", { p_entity: "order", p_order: "ORD080", p_rows: 12, p_truncated: false });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Lab staff access is required to export the audit log" } } as never);
    await expect(recordAuditExport({ entity: null, order: null, before: null }, 0, false)).rejects.toThrow("Lab staff access is required to export the audit log");
  });

  it("demo: the export shows in this browser's audit log, by the person exporting", async () => {
    vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" });
    session = { userId: "example-staff", displayName: "Demo Operator", role: "Operator", view: "staff", mock: true };
    await recordAuditExport({ entity: "order", order: "ORD080", before: null }, 12, false);
    const page = await listAuditEvents(none);
    expect(page.rows[0]).toMatchObject({ who: "Demo Operator", entity: "Audit log export", summary: "Audit log exported: 12 rows, entity order, ORD080" });
    expect((await listAuditEvents({ entity: "audit_export", order: null, before: null })).rows).toHaveLength(1);
  });
});

describe("demo seam: the same screen over the demo store", () => {
  beforeEach(() => {
    vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" });
    session = { userId: "example-staff", displayName: "Demo Operator", role: "Operator", view: "staff", mock: true };
  });

  it("a fresh browser sees the demo release policy", async () => {
    const page = await listAuditEvents(none);
    expect(requireWorkspace).toHaveBeenCalledWith("staff");
    expect(page.rows.map(row => [row.who, row.summary])).toEqual([["Demo Lab Owner", "Release policy changed: 2 of Demo Reviewer A, Demo Reviewer B"]]);
    expect(vi.mocked(createAdminClient)).not.toHaveBeenCalled();
  });

  it("derives shipment, build, signatures and release, newest first, filtered like live", async () => {
    await writeDemoState(demoState());
    const all = await listAuditEvents(none);
    expect(all.rows.map(row => [row.id, row.who, row.summary])).toEqual([
      [6, "Demo Reviewer B", "Dataset ORD048 v1 released"],
      [5, "Demo Reviewer B", "Signature added to ORD048 v1 (Approved)"],
      [4, "Demo Reviewer A", "Signature added to ORD048 v1 (Reviewed)"],
      [3, "Demo Operator", "Dataset ORD048 v1 built"],
      [2, "Demo Operator", "Shipment received for ORD048"],
      [1, "Demo Lab Owner", "Release policy changed: 2 of Demo Reviewer A, Demo Reviewer B"],
    ]);
    expect(all.rows[0].changes).toEqual(expect.arrayContaining([{ field: "Status", before: "built", after: "released" }]));
    expect(all.older).toBeNull();

    const order = await listAuditEvents({ entity: null, order: "ORD048", before: null });
    expect(order.rows.map(row => row.id)).toEqual([6, 5, 4, 3, 2]);
    expect(order.order).toEqual({ code: "ORD048", found: true });
    expect((await listAuditEvents({ entity: null, order: "ORD041", before: null })).rows).toEqual([]);
    expect((await listAuditEvents({ entity: null, order: "ORD999", before: null })).order).toEqual({ code: "ORD999", found: false });
    expect((await listAuditEvents({ entity: "signature", order: null, before: null })).rows.map(row => row.id)).toEqual([5, 4]);
    expect((await listAuditEvents({ entity: null, order: null, before: 4 })).rows.map(row => row.id)).toEqual([3, 2, 1]);
  });
  it("a21 Client column in the demo: each order's client; the release policy is lab-wide", async () => {
    await writeDemoState(demoState());
    const all = await listAuditEvents(none);
    expect(all.rows.map(row => row.clients.map(client => client.name))).toEqual([
      ["Example Atlas"], ["Example Atlas"], ["Example Atlas"], ["Example Atlas"], ["Example Atlas"], [],
    ]);
    const file = await exportAuditEvents({ entity: "signature", order: null, before: 5 });
    expect(file.rows.map(row => row.id)).toEqual([5, 4]);
  });
});
