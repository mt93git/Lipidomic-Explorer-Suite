// @vitest-environment node
// Access requests through the data seam (F3, 0020): demo approve into a new client with a chosen role (client,
// invitation and request together), decline, the counter; live RPC arguments, the service key for submits and the
// mapping of the database's caps. Synthetic data only.
import { beforeEach, expect, test, vi } from "vitest";
import { cookies } from "next/headers";
import { getEnvironment } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  AccessRefusal, approveAccessRequest, declineAccessRequest, listAccessRequests, pendingAccessCount, submitAccessRequest,
} from "@/lib/data/access-requests";
import { listClientRecords } from "@/lib/data/clients";
import { listPeople, previewInvitation } from "@/lib/data/people";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => session), getAppSession: vi.fn(async () => session) }));
let session = { userId: "example-staff", role: "Operator", view: "staff" };
const jar = new Map<string, string>();
const owner = "example-owner";
const clean = { fullName: "Ada Example", email: "ada@birch.example.test", organisation: "Example Birch", kind: "company" as const, message: null };
beforeEach(() => {
  vi.clearAllMocks(); jar.clear();
  session = { userId: "example-staff", role: "Operator", view: "staff" };
  vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" });
  vi.mocked(cookies).mockResolvedValue({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value) } as never);
});

test("demo: a request sent on the public form reaches People; approving into a new client creates it and a 7-day link with the chosen role", async () => {
  expect(await pendingAccessCount()).toBe(2);
  const reference = await submitAccessRequest(clean);
  expect(reference).toBe("AR-0013");
  await expect(submitAccessRequest({ ...clean, fullName: "Ada Again" })).rejects.toBeInstanceOf(AccessRefusal);
  expect(await pendingAccessCount()).toBe(3);
  const request = (await listAccessRequests()).requests.find(item => item.reference === reference)!;
  expect(request).toMatchObject({ status: "pending", email: "ada@birch.example.test", matchingClientId: null });

  const target = { newClientName: "Example Birch", newClientKind: "company" as const };
  await expect(approveAccessRequest({ requestId: request.id, target, role: "viewer" })).rejects.toThrow(/Owner or Admin/); // the Operator by default
  await expect(approveAccessRequest({ requestId: request.id, target: { newClientName: "Example Atlas", newClientKind: "pi_lab" }, role: "viewer", actorId: owner })).rejects.toThrow(/already exists/);
  expect((await listClientRecords()).some(client => client.name === "Example Birch")).toBe(false);

  const token = await approveAccessRequest({ requestId: request.id, target, role: "viewer", actorId: owner });
  expect(token).toMatch(/^[0-9a-f]{64}$/);
  const client = (await listClientRecords()).find(item => item.name === "Example Birch");
  expect(client).toMatchObject({ kind: "company" });
  expect((await listAccessRequests()).requests.find(item => item.id === request.id)).toMatchObject({ status: "approved", clientId: client!.id });
  expect(await previewInvitation(token)).toMatchObject({ email: "ada@birch.example.test", target: "Viewer at Example Birch" });
  expect((await listPeople()).invitations).toEqual([expect.objectContaining({ email: "ada@birch.example.test", target: "Viewer at Example Birch" })]);
  await expect(approveAccessRequest({ requestId: request.id, target: { clientId: client!.id }, role: "requester", actorId: owner })).rejects.toThrow(/already answered/);
  expect(await pendingAccessCount()).toBe(2);
});

test("demo: approve into an existing client; decline with a reason", async () => {
  const seeded = (await listAccessRequests()).requests;
  const kai = seeded.find(item => item.fullName === "Kai Sample")!;
  expect(kai.matchingClientId).toBe("example-cedar");
  await approveAccessRequest({ requestId: kai.id, target: { clientId: "example-cedar" }, role: "requester", actorId: owner });
  const robin = seeded.find(item => item.fullName === "Robin Example")!;
  await expect(declineAccessRequest({ requestId: robin.id, reason: " ", actorId: owner })).rejects.toThrow(/needs a reason/);
  await declineAccessRequest({ requestId: robin.id, reason: "Synthetic: not a service we run", actorId: "example-reviewer-a" });
  const after = (await listAccessRequests()).requests;
  expect(after.find(item => item.id === robin.id)).toMatchObject({ status: "declined", declineReason: "Synthetic: not a service we run", decidedBy: "example-reviewer-a" });
  expect(after.find(item => item.id === kai.id)).toMatchObject({ status: "approved", clientId: "example-cedar" });
  expect(await pendingAccessCount()).toBe(0);
});

test("live: submits with the service key only; maps PT409 and 54000; a failure says nothing about the person", async () => {
  vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.test", anonKey: "anon-example" });
  vi.mocked(createServiceClient).mockReturnValue(null);
  await expect(submitAccessRequest(clean)).rejects.toThrow(/not configured/);
  const rpc = vi.fn().mockResolvedValue({ data: "AR-0042", error: null });
  vi.mocked(createServiceClient).mockReturnValue({ schema: vi.fn(() => ({ rpc })) } as never);
  expect(await submitAccessRequest(clean)).toBe("AR-0042");
  expect(rpc).toHaveBeenLastCalledWith("submit_access_request", { p_full_name: "Ada Example", p_email: "ada@birch.example.test", p_organisation: "Example Birch", p_kind: "company", p_message: null });
  expect(createAdminClient).not.toHaveBeenCalled();
  rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "already waiting" } });
  await expect(submitAccessRequest(clean)).rejects.toMatchObject({ code: "pending" });
  rpc.mockResolvedValueOnce({ data: null, error: { code: "54000", message: "full" } });
  await expect(submitAccessRequest(clean)).rejects.toMatchObject({ code: "full" });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom ada@birch.example.test" } });
  await expect(submitAccessRequest(clean)).rejects.toThrow("Your request could not be sent.");
  expect(JSON.stringify(log.mock.calls)).not.toContain("ada@");
  log.mockRestore();
});

test("live: the lab's calls with the user's token; an Operator gets no list and no counter", async () => {
  vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.test", anonKey: "anon-example" });
  session = { userId: "u-admin", role: "Admin", view: "staff" };
  const rpc = vi.fn().mockResolvedValue({ data: "e".repeat(64), error: null });
  vi.mocked(createAdminClient).mockResolvedValue({ schema: vi.fn(() => ({ rpc })) } as never);
  expect(await approveAccessRequest({ requestId: "r-1", target: { newClientName: "Example Birch", newClientKind: "company" }, role: "client_admin" })).toBe("e".repeat(64));
  expect(rpc).toHaveBeenLastCalledWith("approve_access_request", { p_request_id: "r-1", p_client_id: null, p_new_client_name: "Example Birch", p_new_client_kind: "company", p_client_role: "client_admin" });
  await approveAccessRequest({ requestId: "r-2", target: { clientId: "c-1" }, role: "requester" });
  expect(rpc).toHaveBeenLastCalledWith("approve_access_request", { p_request_id: "r-2", p_client_id: "c-1", p_new_client_name: null, p_new_client_kind: null, p_client_role: "requester" });
  await declineAccessRequest({ requestId: "r-3", reason: "Synthetic" });
  expect(rpc).toHaveBeenLastCalledWith("decline_access_request", { p_request_id: "r-3", p_reason: "Synthetic" });
  rpc.mockResolvedValueOnce({ data: 4, error: null });
  expect(await pendingAccessCount()).toBe(4);
  rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "Access request AR-0003 was already answered: it is approved" } });
  await expect(declineAccessRequest({ requestId: "r-3", reason: "Synthetic" })).rejects.toThrow(/already answered/);

  session = { userId: "u-op", role: "Operator", view: "staff" };
  rpc.mockClear();
  expect(await listAccessRequests()).toEqual({ requests: [], clients: [], canAnswer: false, demoActors: null });
  expect(await pendingAccessCount()).toBe(0);
  expect(rpc).not.toHaveBeenCalled();
  session = { userId: "u-admin", role: "Admin", view: "staff" };
  vi.mocked(createAdminClient).mockRejectedValueOnce(new Error("network"));
  expect(await pendingAccessCount()).toBe(0); // never breaks the page around it
});
