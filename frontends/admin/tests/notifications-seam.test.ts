// @vitest-environment node
// The live wiring of email notifications (0028): each event's data function schedules the email with after() only once
// its RPC succeeded; the scheduled step reads admin.notification_audience and writes admin.notification_log with the
// server's service client. Fakes only: no database, no Resend (sending is off unless a test turns it on, and fetch is
// a spy that must not be called).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { submitAccessRequest } from "@/lib/data/access-requests";
import { checkResultsMissing, notify, notifyBatch, resetResultsCheck } from "@/lib/data/notifications";
import { receiveShipment } from "@/lib/data/samples";
import { answerOrderRequest, requestOrder } from "@/lib/data/order-requests";
import { getEnvironment } from "@/lib/environment";
import { DataError } from "@/lib/samples";
import { createAdminClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fakePostgrest } from "./helpers/fake-postgrest";

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn(), createAnonAuthClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

type Row = Record<string, unknown>;
const audienceRows = [
  { user_id: "u-owner", email: "owner@lab.example.test", lab_role: "owner", client_role: null, off: [] },
  { user_id: "u-operator", email: "operator@lab.example.test", lab_role: "operator", client_role: null, off: ["order_requested"] },
  { user_id: "u-member", email: "member@lab.example.test", lab_role: "member", client_role: null, off: [] },
  { user_id: "u-rowan", email: "rowan@cedar.example.test", lab_role: null, client_role: "requester", off: [] },
];

let scheduled: (() => Promise<void>)[];
let service: { rpc: ReturnType<typeof vi.fn>; from: ReturnType<typeof vi.fn>; schema?: () => unknown };
let logged: Row[][];
// admin.notification_rule rows the test changed (0036); a kind not here reads no row, so its default applies.
let rules: Record<string, Row>;
let ruleError: { code: string } | null;
const fetchSpy = vi.fn();
const runScheduled = async () => { for (const task of scheduled.splice(0)) await task(); };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchSpy);
  for (const name of ["ADMIN_NOTIFY_ENABLED", "ADMIN_NOTIFY_ALLOW", "RESEND_API_KEY", "ADMIN_MAIL_FROM", "ADMIN_PUBLIC_ORIGIN"]) vi.stubEnv(name, "");
  vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
  vi.mocked(cookies).mockResolvedValue({ get: () => undefined, set: () => undefined } as never);
  vi.mocked(headers).mockResolvedValue(new Headers() as never);
  scheduled = [];
  vi.mocked(after).mockImplementation(task => { scheduled.push(task as () => Promise<void>); });
  logged = [];
  service = {
    rpc: vi.fn(async (fn: string) => fn === "notification_audience" ? { data: audienceRows, error: null } : { data: "AR-0012", error: null }),
    from: vi.fn((table: string) => ({
      insert: async (rows: Row[]) => { if (table === "notification_log") logged.push(rows); return { error: null }; },
      select: () => ({ eq: (_column: string, kind: string) => ({ maybeSingle: async () => ({ data: ruleError ? null : rules[kind] ?? null, error: ruleError }) }) }),
    })),
  };
  rules = {};
  ruleError = null;
  resetResultsCheck();
  // submit_access_request is called as service.schema("admin").rpc(...) (data/access-requests.ts).
  Object.assign(service, { schema: () => service });
  vi.mocked(createServiceClient).mockReturnValue(service as never);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("notify (live)", () => {
  const event = { kind: "order_requested", orderId: "o-60", code: "ORD060", title: "Plasma", clientId: "c-1", clientName: "Example Cedar" } as const;

  it("only schedules: nothing is read or sent until after the response; then audience, recipients and one log insert", async () => {
    await notify(event);
    expect(after).toHaveBeenCalledTimes(1);
    expect(service.rpc).not.toHaveBeenCalled();
    await runScheduled();
    expect(service.rpc).toHaveBeenCalledWith("notification_audience", { p_client_id: "c-1" });
    expect(logged).toHaveLength(1);
    expect(logged[0].map(row => [row.user_id, row.status, row.error])).toEqual([
      ["u-owner", "skipped", "Sending is off (ADMIN_NOTIFY_ENABLED is not true)"],
      ["u-operator", "skipped", "Turned off by the recipient"],
    ]);
    expect(logged[0][0]).toEqual({
      kind: "order_requested", user_id: "u-owner", email: "owner@lab.example.test", subject: "New order request ORD060 from Example Cedar",
      status: "skipped", error: "Sending is off (ADMIN_NOTIFY_ENABLED is not true)", client_id: "c-1", order_id: "o-60", dataset_id: null, reference: "ORD060",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("with sending on, an address outside ADMIN_NOTIFY_ALLOW is skipped and a Resend refusal is logged as failed", async () => {
    vi.stubEnv("ADMIN_NOTIFY_ENABLED", "true");
    vi.stubEnv("ADMIN_NOTIFY_ALLOW", "lab.example.test");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("ADMIN_MAIL_FROM", "lab@lab.example.test");
    fetchSpy.mockImplementation(async () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 }));
    vi.mocked(createServiceClient).mockReturnValue({ ...service, rpc: vi.fn(async () => ({ data: [...audienceRows, { user_id: "u-sky", email: "sky@lab.example.test", lab_role: null, client_role: "client_admin", off: [] }], error: null })) } as never);
    // The default row (0036): the lab's Operators, the client's admins and the requester.
    await notify({ kind: "dataset_released", datasetId: "d-1", orderId: "o-59", code: "ORD059", version: 1, clientId: "c-1", clientName: "Example Cedar", requestedBy: "u-rowan" });
    await runScheduled();
    expect(logged[0].map(row => [row.user_id, row.status, row.error])).toEqual([
      ["u-operator", "failed", "Resend answered 403: domain not verified"],
      ["u-rowan", "skipped", "Not on ADMIN_NOTIFY_ALLOW"],
      ["u-sky", "failed", "Resend answered 403: domain not verified"],
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://api.resend.com/emails");
  });

  it("without a service client or with a failing audience call nothing is thrown and nothing is logged", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(createServiceClient).mockReturnValue(null);
    await notify(event);
    await expect(runScheduled()).resolves.toBeUndefined();
    vi.mocked(createServiceClient).mockReturnValue({ ...service, rpc: vi.fn(async () => ({ data: null, error: { code: "42501", message: "permission denied" } })) } as never);
    await notify(event);
    await runScheduled();
    expect(logged).toEqual([]);
    expect(error.mock.calls.map(([text]) => String(text))).toEqual([
      "[notifications] order_requested: nothing sent (this server has no service key)",
      "[notifications] order_requested: nothing sent (notification_audience failed (42501))",
    ]);
    error.mockRestore();
  });
});

describe("the matrix decides who is told (0036)", () => {
  const event = { kind: "order_requested", orderId: "o-60", code: "ORD060", title: "Plasma", clientId: "c-1", clientName: "Example Cedar" } as const;

  it("a row the Admin changed is read with the service client when the email goes out", async () => {
    rules.order_requested = { kind: "order_requested", lab_roles: ["owner"], step_owner: false, client_admin: false, requester: false, days: null };
    await notify(event);
    await runScheduled();
    expect(service.from).toHaveBeenCalledWith("notification_rule");
    expect(logged[0].map(row => row.user_id)).toEqual(["u-owner"]);
  });

  it("every cell off: nobody is emailed and nothing is logged; a failed read of the row sends nothing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rules.order_requested = { kind: "order_requested", lab_roles: [], step_owner: false, client_admin: false, requester: false, days: null };
    await notify(event);
    await runScheduled();
    expect(logged).toEqual([]);
    ruleError = { code: "42501" };
    await notify(event);
    await runScheduled();
    expect(logged).toEqual([]);
    expect(error.mock.calls.map(([text]) => String(text))).toEqual(["[notifications] order_requested: nothing sent (notification_rule failed (42501))"]);
    error.mockRestore();
  });
});

describe("the new events (0036)", () => {
  let tables: Record<string, Row[]>;
  let rpc: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    tables = { order: [
      { id: "o-59", code: "ORD059", title: "Plasma lipids", client_id: "c-1", requested_by: "u-rowan", client: { name: "Example Cedar" }, archived_at: null },
      { id: "o-61", code: "ORD061", title: "Liver", client_id: "c-2", requested_by: "u-ash", client: { name: "Example Larch" }, archived_at: null },
    ] };
    rpc = vi.fn(async () => ({ data: "s-1", error: null }));
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ ...fakePostgrest(tables), rpc }), auth: { getUser: async () => ({ data: { user: null }, error: null }) } } as never);
  });
  const shipment = { orderId: "o-59", carrier: "Courier", trackingNumber: null, condition: "ok" as const, boxCount: 2, notes: null };

  it("a recorded shipment tells the lab's Admins and the requester; a refused one schedules nothing", async () => {
    vi.mocked(createServiceClient).mockReturnValue({ ...service, rpc: vi.fn(async () => ({ data: [...audienceRows, { user_id: "u-admin", email: "admin@lab.example.test", lab_role: "admin", client_role: null, off: [] }], error: null })) } as never);
    await receiveShipment(shipment);
    await runScheduled();
    expect(logged).toHaveLength(1);
    expect(logged[0].map(row => [row.kind, row.user_id, row.subject, row.order_id])).toEqual([
      ["shipment_received", "u-rowan", "Shipment received for ORD059", "o-59"], ["shipment_received", "u-admin", "Shipment received for ORD059", "o-59"],
    ]);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "only lab staff" } });
    vi.mocked(after).mockClear();
    await expect(receiveShipment(shipment)).rejects.toBeInstanceOf(DataError);
    expect(after).not.toHaveBeenCalled();
  });

  it("a shipment that arrived thawed also fails its gate, for the matrix's gate row", async () => {
    rules.gate_failed = { kind: "gate_failed", lab_roles: ["owner"], step_owner: true, client_admin: false, requester: false, days: null };
    await receiveShipment({ ...shipment, condition: "thawed" });
    await runScheduled();
    expect(logged.map(rows => rows.map(row => [row.kind, row.user_id, row.subject]))).toEqual([
      [["shipment_received", "u-rowan", "Shipment received for ORD059"]],
      [["gate_failed", "u-owner", "Gate failed: ORD059"]],
    ]);
  });

  it("a batch event goes once to the lab, naming the batch, and once per order to its own client only", async () => {
    rules.batch_acquired = { kind: "batch_acquired", lab_roles: ["operator"], step_owner: false, client_admin: false, requester: true, days: null };
    const audienceFor = vi.fn(async (_fn: string, args: { p_client_id: string | null }) => ({
      data: args.p_client_id === "c-2" ? [{ user_id: "u-ash", email: "ash@larch.example.test", lab_role: null, client_role: "requester", off: [] }, audienceRows[1]] : audienceRows, error: null,
    }));
    vi.mocked(createServiceClient).mockReturnValue({ ...service, rpc: audienceFor } as never);
    await notifyBatch("batch_acquired", "B2026-031", ["ORD059", "ORD061"]);
    await runScheduled();
    expect(audienceFor.mock.calls.map(([, args]) => args.p_client_id)).toEqual([null, "c-1", "c-2"]);
    expect(logged.map(rows => rows.map(row => [row.user_id, row.subject, row.reference]))).toEqual([
      [["u-operator", "Batch acquired: B2026-031", "B2026-031"]],
      [["u-rowan", "Samples of ORD059 acquired", "ORD059"]],
      [["u-ash", "Samples of ORD061 acquired", "ORD061"]],
    ]);
  });

  it("a failed gate in a shared batch is lab-only (0040): one email to the lab with the batch's total, no client copy", async () => {
    for (const [name, value] of [["ADMIN_NOTIFY_ENABLED", "true"], ["RESEND_API_KEY", "re_test"], ["ADMIN_MAIL_FROM", "lab@example.test"]]) vi.stubEnv(name, value);
    fetchSpy.mockResolvedValue(new Response("{}", { status: 200 }));
    rules.gate_failed = { kind: "gate_failed", lab_roles: ["owner"], step_owner: false, client_admin: false, requester: false, client_members: false, days: null };
    const audienceFor = vi.fn(async (_fn: string, _args: { p_client_id: string | null }) => ({ data: audienceRows, error: null }));
    vi.mocked(createServiceClient).mockReturnValue({ ...service, rpc: audienceFor } as never);
    await notifyBatch("gate_failed", "B2026-031", ["ORD059", "ORD061"], { gate: "5 injections recorded Failed", stepOwner: null });
    await runScheduled();
    expect(audienceFor.mock.calls.map(([, args]) => args.p_client_id)).toEqual([null]);
    const bodies = fetchSpy.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)) as { to: string[]; text: string });
    expect(bodies.map(body => [body.to[0], body.text.match(/\d+ injections recorded Failed/)?.[0]])).toEqual([["owner@lab.example.test", "5 injections recorded Failed"]]);
  });
});

describe("the scheduled results check (0036)", () => {
  const due = [{ order_id: "o-59", code: "ORD059", title: "Plasma lipids", client_id: "c-1", client_name: "Example Cedar", requested_by: "u-rowan", acquired_at: "2026-11-09T15:00:00Z", days: 3 }];

  it("claims the due orders with the service role after the response and emails Operators and Admins; runs at most every 10 minutes", async () => {
    const calls = vi.fn(async (fn: string) => fn === "claim_results_missing" ? { data: due, error: null } : { data: audienceRows, error: null });
    vi.mocked(createServiceClient).mockReturnValue({ ...service, rpc: calls } as never);
    expect(checkResultsMissing(1_000_000)).toBe(true);
    expect(calls).not.toHaveBeenCalled();
    await runScheduled();
    expect(calls.mock.calls.map(([fn]) => fn)).toEqual(["claim_results_missing", "notification_audience", "mark_results_missing_sent"]);
    expect(logged[0].map(row => [row.kind, row.user_id, row.subject, row.reference])).toEqual([["results_missing", "u-operator", "No results TXT for ORD059 after 3 days", "ORD059"]]);
    expect(checkResultsMissing(1_000_000 + 9 * 60_000)).toBe(false);
    expect(checkResultsMissing(1_000_000 + 10 * 60_000)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a failed claim is reported without throwing; the example workspace never runs it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(createServiceClient).mockReturnValue({ ...service, rpc: vi.fn(async () => ({ data: null, error: { code: "42501" } })) } as never);
    checkResultsMissing(5_000_000);
    await expect(runScheduled()).resolves.toBeUndefined();
    expect(logged).toEqual([]);
    expect(error.mock.calls.map(([text]) => String(text))).toEqual(["[notifications] results_missing: check failed (claim_results_missing failed (42501))"]);
    error.mockRestore();
    resetResultsCheck();
    vi.mocked(after).mockClear();
    vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" });
    expect(checkResultsMissing(9_000_000)).toBe(false);
    expect(after).not.toHaveBeenCalled();
  });
});

describe("each event notifies only after its RPC succeeded", () => {
  let tables: Record<string, Row[]>;
  let rpc: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    tables = { order: [{ id: "o-59", code: "ORD059", title: "Plasma lipids", client_id: "c-1", requested_by: "u-rowan", client: { name: "Example Cedar" }, archived_at: null }] };
    rpc = vi.fn(async () => ({ data: null, error: null }));
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ ...fakePostgrest(tables), rpc }) } as never);
  });

  it("accept and decline tell the person who asked; the decline carries the lab's reason", async () => {
    await answerOrderRequest("ORD059", { accept: true, panelId: null });
    await runScheduled();
    expect(logged[0].map(row => [row.user_id, row.subject])).toEqual([["u-rowan", "Your order request ORD059 was accepted"]]);
    expect(service.rpc).toHaveBeenLastCalledWith("notification_audience", { p_client_id: "c-1" });
    await answerOrderRequest("ORD059", { accept: false, reason: "  Not this quarter  " });
    await runScheduled();
    expect(logged[1].map(row => [row.user_id, row.subject, row.order_id])).toEqual([["u-rowan", "Your order request ORD059 was declined", "o-59"]]);
  });

  it("a refused answer schedules nothing", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "already answered" } });
    await expect(answerOrderRequest("ORD059", { accept: true, panelId: null })).rejects.toBeInstanceOf(DataError);
    expect(after).not.toHaveBeenCalled();
  });

  it("a client's request tells lab Owner, Admin and Operator; a refused request schedules nothing", async () => {
    tables.order.push({ id: "o-60", code: "ORD060", title: "Diet study", client_id: "c-1", client: { name: "Example Cedar" }, archived_at: null });
    rpc.mockResolvedValue({ data: "o-60", error: null });
    const input = { panelId: null, title: "Diet study", matrix: null, expectedSamples: 4, billingRef: null, notes: null };
    await expect(requestOrder("c-1", input, "rowan@cedar.example.test")).resolves.toEqual({ code: "ORD060" });
    await runScheduled();
    expect(logged[0].map(row => [row.user_id, row.subject])).toEqual([["u-owner", "New order request ORD060 from Example Cedar"], ["u-operator", "New order request ORD060 from Example Cedar"]]);
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "only a client admin or requester of this client may request orders for it" } });
    vi.mocked(after).mockClear();
    await expect(requestOrder("c-1", input, "x")).rejects.toBeInstanceOf(DataError);
    expect(after).not.toHaveBeenCalled();
  });

  it("an access request tells the lab; one refused by the queue schedules nothing", async () => {
    const form = { fullName: "Kai Sample", email: "kai@larch.example.test", organisation: "Example Larch", kind: "company" as const, message: null };
    await expect(submitAccessRequest(form)).resolves.toBe("AR-0012");
    await runScheduled();
    expect(service.rpc).toHaveBeenLastCalledWith("notification_audience", { p_client_id: null });
    expect(logged[0].map(row => [row.user_id, row.subject, row.reference])).toEqual([["u-owner", "New access request AR-0012", "AR-0012"], ["u-operator", "New access request AR-0012", "AR-0012"]]);
    service.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "pending" } });
    vi.mocked(after).mockClear();
    await expect(submitAccessRequest(form)).rejects.toThrow();
    expect(after).not.toHaveBeenCalled();
  });
});
