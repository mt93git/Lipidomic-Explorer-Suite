// @vitest-environment node
// The live wiring of the 2026-11-14 corrections (migration 0040): the Client members cell read from the matrix, the
// receipt-discrepancy email after confirm_shipment_receipt, and the results check (the cron route and no lost email).
// Fakes only: no database, no Resend (fetch is a spy; sending is off unless a test turns it on).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { readDemoNotifications } from "@/lib/data/demo-store";
import { notify } from "@/lib/data/notifications";
import { confirmReceipt, getShipmentCheckin } from "@/lib/data/shipment-checkin";
import { getEnvironment } from "@/lib/environment";
import { DEMO_OFF_REASON } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fakePostgrest } from "./helpers/fake-postgrest";

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn(), createAnonAuthClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

type Row = Record<string, unknown>;
// notification_audience(c-1): lab staff and client c-1's members (a viewer among them).
const audienceRows = [
  { user_id: "u-admin", email: "admin@lab.example.test", lab_role: "admin", client_role: null, off: [] },
  { user_id: "u-operator", email: "operator@lab.example.test", lab_role: "operator", client_role: null, off: [] },
  { user_id: "u-rowan", email: "rowan@cedar.example.test", lab_role: null, client_role: "requester", off: [] },
  { user_id: "u-quinn", email: "quinn@cedar.example.test", lab_role: null, client_role: "viewer", off: [] },
];

let scheduled: (() => Promise<void>)[];
let logged: Row[][];
let rules: Record<string, Row>;
let rpc: ReturnType<typeof vi.fn>;
const fetchSpy = vi.fn();
const runScheduled = async () => { for (const task of scheduled.splice(0)) await task(); };
const jar = new Map<string, string>();

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  vi.stubGlobal("fetch", fetchSpy);
  for (const name of ["ADMIN_NOTIFY_ENABLED", "ADMIN_NOTIFY_ALLOW", "RESEND_API_KEY", "ADMIN_MAIL_FROM", "ADMIN_PUBLIC_ORIGIN", "ADMIN_CRON_SECRET"]) vi.stubEnv(name, "");
  vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
  vi.mocked(cookies).mockResolvedValue({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value) } as never);
  vi.mocked(headers).mockResolvedValue(new Headers() as never);
  scheduled = [];
  vi.mocked(after).mockImplementation(task => { scheduled.push(task as () => Promise<void>); });
  logged = [];
  rules = {};
  rpc = vi.fn(async (fn: string) => fn === "notification_audience" ? { data: audienceRows, error: null } : { data: null, error: null });
  vi.mocked(createServiceClient).mockReturnValue({
    rpc: (...args: unknown[]) => rpc(...args),
    from: vi.fn((table: string) => ({
      insert: async (rows: Row[]) => { if (table === "notification_log") logged.push(rows); return { error: null }; },
      select: () => ({ eq: (_column: string, kind: string) => ({ maybeSingle: async () => ({ data: rules[kind] ?? null, error: null }) }) }),
    })),
  } as never);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const released = { kind: "dataset_released", datasetId: "d-1", orderId: "o-59", code: "ORD059", version: 1, clientId: "c-1", clientName: "Example Cedar", requestedBy: "u-rowan" } as const;
const ruleRow = (kind: string, cells: Partial<Row>) => ({ kind, lab_roles: [], step_owner: false, client_admin: false, requester: false, client_members: false, days: null, ...cells });

describe("item 2: Client members, live", () => {
  it("a viewer gets the released dataset (stored row: client_members on); only the order's client is asked for", async () => {
    rules.dataset_released = ruleRow("dataset_released", { lab_roles: ["operator"], client_members: true });
    await notify(released);
    await runScheduled();
    expect(rpc).toHaveBeenCalledWith("notification_audience", { p_client_id: "c-1" });
    expect(logged[0].map(row => row.user_id)).toEqual(["u-operator", "u-rowan", "u-quinn"]);
  });

  it("the Owner turned the column off: the viewer no longer gets it", async () => {
    rules.dataset_released = ruleRow("dataset_released", { lab_roles: ["operator"], client_admin: true, requester: true, client_members: false });
    await notify(released);
    await runScheduled();
    expect(logged[0].map(row => row.user_id)).toEqual(["u-operator", "u-rowan"]);
  });
});

describe("item 3: a receipt with tubes missing or not intact", () => {
  let tables: Record<string, Row[]>;
  let userRpc: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    tables = { order: [
      { id: "o-59", code: "ORD059", title: "Plasma lipids", client_id: "c-1", requested_by: "u-rowan", client: { name: "Example Cedar" }, archived_at: null },
      { id: "o-61", code: "ORD061", title: "Liver", client_id: "c-2", requested_by: "u-ash", client: { name: "Example Larch" }, archived_at: null },
    ] };
    userRpc = vi.fn(async () => ({ data: { expected: 4, checked_in: 3, missing: 1, damaged: 1 }, error: null }));
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ ...fakePostgrest(tables), rpc: userRpc }) } as never);
  });

  it("emails the order's client audience under the Shipment received row (and its lab cells), with the counts and the note", async () => {
    await confirmReceipt("ORD059", "ship-1", "S004 was not in the box; S002 arrived thawed.");
    expect(userRpc).toHaveBeenCalledWith("confirm_shipment_receipt", expect.objectContaining({ p_shipment_id: "ship-1" }));
    await runScheduled();
    expect(rpc.mock.calls.filter(([fn]) => fn === "notification_audience").map(([, args]) => args)).toEqual([{ p_client_id: "c-1" }]);
    // Default row: the lab's Admins, the client's admins and the requester (no client admin in c-1 here).
    expect(logged[0].map(row => [row.kind, row.user_id, row.subject, row.order_id])).toEqual([
      ["shipment_received", "u-admin", "Receipt of ORD059: 1 tube missing, 1 not intact", "o-59"],
      ["shipment_received", "u-rowan", "Receipt of ORD059: 1 tube missing, 1 not intact", "o-59"],
    ]);
  });

  it("the lab turned Shipment received off for clients: only the lab cells remain; each person's switch applies", async () => {
    rules.shipment_received = ruleRow("shipment_received", { lab_roles: ["admin"] });
    await confirmReceipt("ORD059", "ship-1", "S004 missing.");
    await runScheduled();
    expect(logged[0].map(row => row.user_id)).toEqual(["u-admin"]);
  });

  it("no discrepancy: no email at all", async () => {
    userRpc.mockResolvedValue({ data: { expected: 4, checked_in: 4, missing: 0, damaged: 0 }, error: null });
    await confirmReceipt("ORD059", "ship-1", "");
    expect(after).not.toHaveBeenCalled();
    await runScheduled();
    expect(logged).toEqual([]);
  });

  it("a refused confirmation emails nothing", async () => {
    userRpc.mockResolvedValue({ data: null, error: { code: "55000", message: "the receipt of this shipment of ORD059 is already confirmed" } });
    await expect(confirmReceipt("ORD059", "ship-1", "x")).rejects.toThrow();
    expect(after).not.toHaveBeenCalled();
  });

  it("demo: logs the email as skipped instead of sending it", async () => {
    vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" });
    const view = await getShipmentCheckin("ORD051");
    expect(view).not.toBeNull();
    await confirmReceipt("ORD051", view!.shipment.id, "Nothing checked in yet: synthetic test note.");
    const log = (await readDemoNotifications()).log;
    expect(log.length).toBeGreaterThan(0);
    expect(log.every(row => row.kind === "shipment_received" && row.status === "skipped" && row.error === DEMO_OFF_REASON && row.reference === "ORD051")).toBe(true);
    expect(log[0].subject).toMatch(/^Receipt of ORD051: \d+ tubes missing, 0 not intact$/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("item 4: the results check", () => {
  const due = [{ order_id: "o-59", code: "ORD059", title: "Plasma lipids", client_id: "c-1", client_name: "Example Cedar", requested_by: "u-rowan", acquired_at: "2026-11-09T15:00:00Z", days: 3 }];
  const call = async (secret?: string) => (await import("@/app/api/cron/results-missing/route")).POST(new Request("http://localhost/admin/api/cron/results-missing", { method: "POST", headers: secret === undefined ? {} : { authorization: `Bearer ${secret}` } }));
  const claimRpc = () => vi.fn(async (fn: string) => fn === "claim_results_missing" ? { data: due, error: null } : fn === "notification_audience" ? { data: audienceRows, error: null } : { data: null, error: null });

  it("the route: 404 while no secret is configured, 401 without the right secret; nothing is claimed", async () => {
    rpc = claimRpc();
    expect((await call("anything")).status).toBe(404);
    vi.stubEnv("ADMIN_CRON_SECRET", "synthetic-cron-secret-0001");
    expect((await call()).status).toBe(401);
    expect((await call("wrong")).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("the route with the secret runs the check now and marks the order sent", async () => {
    vi.stubEnv("ADMIN_CRON_SECRET", "synthetic-cron-secret-0001");
    rpc = claimRpc();
    const response = await call("synthetic-cron-secret-0001");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 1, sent: 1, retry: 0 });
    expect(rpc.mock.calls.map(([fn]) => fn)).toEqual(["claim_results_missing", "notification_audience", "mark_results_missing_sent"]);
    expect(rpc).toHaveBeenCalledWith("mark_results_missing_sent", { p_order_id: "o-59" });
    expect(logged[0].map(row => [row.kind, row.user_id])).toEqual([["results_missing", "u-admin"], ["results_missing", "u-operator"]]);
    expect(after).not.toHaveBeenCalled();
  });

  it("every send failed: the order is not marked, so the next run sends it again", async () => {
    vi.stubEnv("ADMIN_CRON_SECRET", "synthetic-cron-secret-0001");
    for (const [name, value] of [["ADMIN_NOTIFY_ENABLED", "true"], ["RESEND_API_KEY", "re_test"], ["ADMIN_MAIL_FROM", "lab@example.test"]]) vi.stubEnv(name, value);
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ message: "unavailable" }), { status: 503 }));
    rpc = claimRpc();
    const response = await call("synthetic-cron-secret-0001");
    expect(await response.json()).toEqual({ claimed: 1, sent: 0, retry: 1 });
    expect(rpc.mock.calls.map(([fn]) => fn)).not.toContain("mark_results_missing_sent");
    expect(logged[0].map(row => row.status)).toEqual(["failed", "failed"]);
    // The next run: Resend is back, the same order is handed out again and is marked once it went out.
    fetchSpy.mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await (await call("synthetic-cron-secret-0001")).json()).toEqual({ claimed: 1, sent: 1, retry: 0 });
    expect(rpc).toHaveBeenCalledWith("mark_results_missing_sent", { p_order_id: "o-59" });
  });

  it("the audience could not be read: nothing sent, not marked", async () => {
    vi.stubEnv("ADMIN_CRON_SECRET", "synthetic-cron-secret-0001");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc = vi.fn(async (fn: string) => fn === "claim_results_missing" ? { data: due, error: null } : { data: null, error: { code: "57014" } });
    expect(await (await call("synthetic-cron-secret-0001")).json()).toEqual({ claimed: 1, sent: 0, retry: 1 });
    expect(rpc.mock.calls.map(([fn]) => fn)).toEqual(["claim_results_missing", "notification_audience"]);
    error.mockRestore();
  });
});
