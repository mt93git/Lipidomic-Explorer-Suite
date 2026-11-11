// @vitest-environment node
import { fakePostgrest } from "./helpers/fake-postgrest";
import { beforeEach, expect, test, vi } from "vitest";
import { cookies } from "next/headers";
import { getEnvironment } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/server";
import { archiveClient, createClient, getClient, listClientRecords, updateClient } from "@/lib/data/clients";
import { readDemoState, writeDemoState } from "@/lib/data/demo-store";
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => session) }));
let session = { userId: "example-staff", role: "Operator", view: "staff" };
const jar = new Map<string, string>();
const input = { name: "Synthetic Gamma", kind: "pi_lab", billingMethod: "charge_code", notes: null };
const actorId = "example-owner";
beforeEach(() => {
  vi.clearAllMocks(); jar.clear();
  session = { userId: "example-staff", role: "Operator", view: "staff" };
  vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" });
  vi.mocked(cookies).mockResolvedValue({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value) } as never);
});
test("demo writes enforce manager permissions, persist per browser and preserve other demo records", async () => {
  await expect(createClient(input)).rejects.toThrow(/Owner or Admin/);
  await expect(createClient({ ...input, actorId: "unknown" })).rejects.toThrow(/demo lab person/i);
  const id = await createClient({ ...input, actorId });
  await expect(createClient({ ...input, actorId })).rejects.toThrow(/already exists/);
  await expect(updateClient({ ...input, clientId: id })).rejects.toThrow(/Owner or Admin/);
  await updateClient({ ...input, clientId: id, billingMethod: "po", actorId: "example-reviewer-a" });
  // Another screen's ordinary read/spread/write must retain the client block.
  await writeDemoState({ ...await readDemoState(), results: [] });
  expect(await getClient(id)).toMatchObject({ name: input.name, billingMethod: "po", memberCount: 0, openOrders: 0, orders: [], members: [] });
  await expect(archiveClient({ clientId: id, reason: "x" })).rejects.toThrow(/Owner or Admin/);
  await expect(archiveClient({ clientId: "example-atlas", reason: "x", actorId })).rejects.toThrow(/open order/);
  await expect(archiveClient({ clientId: id, reason: "  ", actorId })).rejects.toThrow(/reason/);
  await archiveClient({ clientId: id, reason: "  Synthetic retirement  ", actorId });
  expect(await getClient(id)).toMatchObject({ archivedAt: expect.any(String), archivedReason: "Synthetic retirement" });
  await expect(updateClient({ ...input, clientId: id, actorId })).rejects.toThrow(/archived/);
  await expect(createClient({ ...input, actorId })).rejects.toThrow(/already exists/);
  jar.clear();
  expect(await getClient(id)).toBeNull();
  expect((await listClientRecords()).some(client => client.id === id)).toBe(false);
  expect(createAdminClient).not.toHaveBeenCalled();
});
test("live writes use exact RPC arguments and cannot impersonate a demo manager", async () => {
  vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.test", anonKey: "example" });
  const rpc = vi.fn().mockResolvedValue({ data: "client-id", error: null });
  vi.mocked(createAdminClient).mockResolvedValue({ schema: vi.fn(() => ({ rpc })) } as never);
  await expect(createClient({ ...input, actorId })).rejects.toThrow(/Owner or Admin/);
  session = { ...session, role: "Owner" };
  expect(await createClient({ ...input, actorId })).toBe("client-id");
  expect(rpc).toHaveBeenLastCalledWith("create_client", { p_name: input.name, p_kind: input.kind, p_billing_method: input.billingMethod, p_notes: null });
  await updateClient({ ...input, clientId: "client-id" });
  expect(rpc).toHaveBeenLastCalledWith("update_client", { p_client_id: "client-id", p_name: input.name, p_kind: input.kind, p_billing_method: input.billingMethod, p_notes: null });
  await archiveClient({ clientId: "client-id", reason: "Synthetic retirement" });
  expect(rpc).toHaveBeenLastCalledWith("archive_client", { p_client_id: "client-id", p_reason: "Synthetic retirement" });
  rpc.mockResolvedValue({ data: null, error: { message: "Client has an open order" } });
  await expect(archiveClient({ clientId: "client-id", reason: "Synthetic retirement" })).rejects.toThrow(/open order/);
});

test("live reads retain archived clients, count active members/open orders, and include order stages", async () => {
  vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.test", anonKey: "example" });
  const id = "00000000-0000-4000-8000-000000000100";
  const db = fakePostgrest({ client: [{ id, name: "Synthetic client", kind: "company", billing_method: "po", notes: null, archived_at: "2026-11-09T00:00:00Z", archived_reason: "Synthetic retirement",
    client_member: [{ user_id: "active-member", role: "requester", archived_at: null }, { user_id: "former-member", role: "viewer", archived_at: "2026-11-08T00:00:00Z" }],
    order: [{ code: "ORD001", title: "Open", stage: "request", archived_at: null }, { code: "ORD002", title: "Released", stage: "released", archived_at: null }, { code: "ORD003", title: "Cancelled", stage: "received", archived_at: "2026-11-08T00:00:00Z" }] }] });
  vi.mocked(createAdminClient).mockResolvedValue({ schema: vi.fn(() => db) } as never);
  expect(await getClient(id)).toMatchObject({ memberCount: 1, openOrders: 1, archivedReason: "Synthetic retirement", members: [{ userId: "active-member", role: "requester" }], orders: [{ code: "ORD001", stage: "Request" }, { code: "ORD002", stage: "Released" }, { code: "ORD003", stage: "Received" }] });
  expect(await listClientRecords()).toHaveLength(1);
  expect(await getClient("invalid")).toBeNull();
});
