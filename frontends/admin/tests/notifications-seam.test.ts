// @vitest-environment node
// The live wiring of email notifications (0028): each event's data function schedules the email with after() only once
// its RPC succeeded; the scheduled step reads admin.notification_audience and writes admin.notification_log with the
// server's service client. Fakes only: no database, no Resend (sending is off unless a test turns it on, and fetch is
// a spy that must not be called).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { submitAccessRequest } from "@/lib/data/access-requests";
import { notify } from "@/lib/data/notifications";
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
    from: vi.fn((table: string) => ({ insert: async (rows: Row[]) => { if (table === "notification_log") logged.push(rows); return { error: null }; } })),
  };
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
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 }));
    vi.mocked(createServiceClient).mockReturnValue({ ...service, rpc: vi.fn(async () => ({ data: [...audienceRows, { user_id: "u-sky", email: "sky@lab.example.test", lab_role: null, client_role: "viewer", off: [] }], error: null })) } as never);
    await notify({ kind: "dataset_released", datasetId: "d-1", orderId: "o-59", code: "ORD059", version: 1, clientId: "c-1", clientName: "Example Cedar" });
    await runScheduled();
    expect(logged[0].map(row => [row.user_id, row.status, row.error])).toEqual([
      ["u-rowan", "skipped", "Not on ADMIN_NOTIFY_ALLOW"],
      ["u-sky", "failed", "Resend answered 403: domain not verified"],
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
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
