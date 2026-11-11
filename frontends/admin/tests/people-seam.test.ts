// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getEnvironment } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { acceptInvitation, acceptMyInvitation, archiveMember, createInvitation, listPeople, previewInvitation, revokeInvitation, setRole, signedInEmail } from "@/lib/data/people";
import { readDemoState } from "@/lib/data/demo-store";
import { fakePostgrest } from "./helpers/fake-postgrest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => session) }));
let session = { userId: "example-staff", role: "Operator", view: "staff" };
const jar = new Map<string, string>();
const owner = "example-owner";
const admin = "example-reviewer-a";
beforeEach(() => {
  vi.clearAllMocks(); jar.clear();
  session = { userId: "example-staff", role: "Operator", view: "staff" };
  vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" });
  vi.mocked(cookies).mockResolvedValue({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value) } as never);
});

test("demo: invite, preview, accept with a password, then the person is listed; the raw token is never stored", async () => {
  await expect(createInvitation({ email: "new@example.test", labRole: null, clientId: "example-atlas", clientRole: "viewer" })).rejects.toThrow(/Owner or Admin/);
  await expect(createInvitation({ email: "lab@example.test", labRole: "operator", clientId: null, clientRole: null, actorId: admin })).rejects.toThrow(/Only the lab Owner/);
  const token = await createInvitation({ email: " New.Member@Example.test ", labRole: null, clientId: "example-atlas", clientRole: "requester", actorId: owner });
  expect(token).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(await readDemoState())).not.toContain(token);
  await expect(createInvitation({ email: "new.member@example.test", labRole: null, clientId: "example-atlas", clientRole: "viewer", actorId: admin })).rejects.toThrow(/pending invitation/);
  expect((await listPeople()).invitations).toEqual([expect.objectContaining({ email: "new.member@example.test", target: "Requester at Example Atlas" })]);

  expect(await previewInvitation(token)).toEqual({ email: "new.member@example.test", target: "Requester at Example Atlas", expiresAt: expect.any(String), hasAccount: false });
  expect(await previewInvitation("0".repeat(64))).toBeNull();
  await expect(acceptInvitation({ token, password: "short" })).rejects.toThrow(/at least 12/);
  expect(await acceptInvitation({ token, password: "a synthetic passphrase" })).toEqual({ email: "new.member@example.test" });
  await expect(acceptInvitation({ token, password: "a synthetic passphrase" })).rejects.toThrow(/not valid any more/);
  expect(JSON.stringify(await readDemoState())).not.toContain("a synthetic passphrase");

  const view = await listPeople();
  expect(view.invitations).toEqual([]);
  expect(view.people).toContainEqual(expect.objectContaining({ kind: "client_member", name: "new.member@example.test", role: "requester", clientName: "Example Atlas" }));
  expect(createServiceClient).not.toHaveBeenCalled();
  expect(createAdminClient).not.toHaveBeenCalled();
});

test("demo: revoke, change roles and archive follow the matrix and keep one Owner", async () => {
  const token = await createInvitation({ email: "lab.new@example.test", labRole: "operator", clientId: null, clientRole: null, actorId: owner });
  const [pending] = (await listPeople()).invitations;
  await expect(revokeInvitation({ invitationId: pending.id, actorId: admin })).rejects.toThrow(/Only the lab Owner/);
  await revokeInvitation({ invitationId: pending.id, actorId: owner });
  expect(await previewInvitation(token)).toBeNull();
  await expect(revokeInvitation({ invitationId: pending.id, actorId: owner })).rejects.toThrow(/already revoked/);

  const people = (await listPeople()).people;
  const ownerRow = people.find(person => person.userId === owner)!;
  const operatorRow = people.find(person => person.userId === "example-staff")!;
  const member = people.find(person => person.kind === "client_member")!;
  await expect(setRole({ ...ownerRow, role: "admin", actorId: owner })).rejects.toThrow(/at least one active Owner/);
  await expect(setRole({ ...operatorRow, role: "admin", actorId: admin })).rejects.toThrow(/Only the lab Owner/);
  await setRole({ ...operatorRow, role: "admin", actorId: owner });
  await setRole({ ...member, role: "viewer", actorId: admin });
  await expect(archiveMember({ kind: "lab_staff", id: ownerRow.id, reason: "Synthetic", actorId: owner })).rejects.toThrow(/at least one active Owner/);
  await expect(archiveMember({ kind: "client_member", id: member.id, reason: " ", actorId: admin })).rejects.toThrow(/needs a reason/);
  await archiveMember({ kind: "client_member", id: member.id, reason: "Synthetic departure", actorId: admin });
  const after = (await listPeople()).people;
  expect(after.find(person => person.id === operatorRow.id)?.role).toBe("admin");
  expect(after.some(person => person.id === member.id)).toBe(false);
});

test("live: exact RPC arguments with the user's token; preview with anon; accept creates the user with the service client", async () => {
  vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.test", anonKey: "anon-example" });
  session = { userId: "u-owner", role: "Owner", view: "staff" };
  const rpc = vi.fn().mockResolvedValue({ data: "f".repeat(64), error: null });
  vi.mocked(createAdminClient).mockResolvedValue({ schema: vi.fn(() => ({ rpc })) } as never);
  expect(await createInvitation({ email: "A@Example.test", labRole: null, clientId: "c-1", clientRole: "viewer", actorId: owner })).toBe("f".repeat(64));
  expect(rpc).toHaveBeenLastCalledWith("create_invitation", { p_email: "a@example.test", p_lab_role: null, p_client_id: "c-1", p_client_role: "viewer" });
  await revokeInvitation({ invitationId: "i-1" });
  expect(rpc).toHaveBeenLastCalledWith("revoke_invitation", { p_invitation_id: "i-1" });
  await setRole({ kind: "lab_staff", id: "row-1", userId: "u-1", role: "admin" });
  expect(rpc).toHaveBeenLastCalledWith("set_lab_role", { p_user_id: "u-1", p_role: "admin" });
  await setRole({ kind: "client_member", id: "row-2", userId: "u-2", role: "viewer" });
  expect(rpc).toHaveBeenLastCalledWith("set_client_member_role", { p_member_id: "row-2", p_role: "viewer" });
  await archiveMember({ kind: "client_member", id: "row-2", reason: " Synthetic " });
  expect(rpc).toHaveBeenLastCalledWith("archive_member", { p_kind: "client_member", p_id: "row-2", p_reason: "Synthetic" });
  session = { ...session, role: "Admin" };
  await expect(createInvitation({ email: "a@example.test", labRole: "operator", clientId: null, clientRole: null })).rejects.toThrow(/Only the lab Owner/);

  const token = "a".repeat(64);
  const anonRpc = vi.fn().mockResolvedValue({ data: [{ email: "a@example.test", target: "Viewer at Synthetic", expires_at: "2026-11-17T00:00:00Z" }], error: null });
  vi.mocked(createClient).mockReturnValue({ rpc: anonRpc } as never);
  const createUser = vi.fn().mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
  const deleteUser = vi.fn().mockResolvedValue({ data: {}, error: null });
  const serviceRpc = vi.fn().mockResolvedValue({ data: null, error: null });
  vi.mocked(createServiceClient).mockReturnValue({ auth: { admin: { createUser, deleteUser } }, schema: vi.fn(() => ({ rpc: serviceRpc })) } as never);
  expect(await acceptInvitation({ token, password: "a synthetic passphrase" })).toEqual({ email: "a@example.test" });
  expect(createClient).toHaveBeenCalledWith("https://example.test", "anon-example", expect.anything());
  expect(anonRpc).toHaveBeenCalledWith("invitation_preview", { p_token: token });
  expect(createUser).toHaveBeenCalledWith({ email: "a@example.test", password: "a synthetic passphrase", email_confirm: true });
  expect(serviceRpc).toHaveBeenCalledWith("accept_invitation", { p_token: token, p_user_id: "new-user" });
  expect(deleteUser).not.toHaveBeenCalled();

  // A refused accept removes the account it just created; an existing account is reported, not overwritten.
  serviceRpc.mockResolvedValueOnce({ data: null, error: { message: "This invitation was revoked" } });
  await expect(acceptInvitation({ token, password: "a synthetic passphrase" })).rejects.toThrow(/revoked/);
  expect(deleteUser).toHaveBeenCalledWith("new-user");
  createUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 422, message: "A user with this email address has already been registered" } });
  await expect(acceptInvitation({ token, password: "a synthetic passphrase" })).rejects.toThrow(/already exists/);
  anonRpc.mockResolvedValueOnce({ data: [], error: null });
  await expect(acceptInvitation({ token, password: "a synthetic passphrase" })).rejects.toThrow(/not valid any more/);
  vi.mocked(createServiceClient).mockReturnValue(null);
  await expect(acceptInvitation({ token, password: "a synthetic passphrase" })).rejects.toThrow(/not configured/);
});

test("live: one list of lab staff and client members, emails from accepted invitations, pending invitations only", async () => {
  vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.test", anonKey: "anon-example" });
  session = { userId: "u-admin", role: "Admin", view: "staff" };
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const db = fakePostgrest({
    lab_staff: [{ id: "s1", user_id: "u-op", role: "operator", display_name: null, archived_at: null }, { id: "s2", user_id: "u-owner", role: "owner", display_name: "Synthetic Owner", archived_at: null }],
    client_member: [{ id: "m1", user_id: "u-member", role: "viewer", client: { id: "c1", name: "Synthetic Client" }, archived_at: null },
      // Named on accepting the invitation (0023).
      { id: "m2", user_id: "u-named", role: "requester", display_name: "Robin Example", client: { id: "c1", name: "Synthetic Client" }, archived_at: null }],
    invitation: [
      { id: "i1", email: "member@example.test", lab_role: null, client_id: "c1", client_role: "viewer", created_at: "2026-11-01T00:00:00Z", expires_at: future, accepted_by: "u-member", revoked_at: null, archived_at: null, client: { name: "Synthetic Client" } },
      { id: "i2", email: "pending@example.test", lab_role: "operator", client_id: null, client_role: null, created_at: "2026-11-02T00:00:00Z", expires_at: future, accepted_by: null, revoked_at: null, archived_at: null, client: null },
      { id: "i3", email: "old@example.test", lab_role: "operator", client_id: null, client_role: null, created_at: "2026-10-01T00:00:00Z", expires_at: "2026-10-08T00:00:00Z", accepted_by: null, revoked_at: null, archived_at: null, client: null },
    ],
    client: [{ id: "c1", name: "Synthetic Client", archived_at: null }],
  });
  // admin.account_state (0029), read by a lab Owner or Admin: the Owner has a factor; the Operator signed in (to Team) only.
  const rpc = vi.fn().mockResolvedValue({ data: [
    { user_id: "u-owner", email: "owner@example.test", signed_in_at: "2026-10-01T08:00:00Z", two_step: true, has_password: true, activation_sent_at: null },
    { user_id: "u-op", email: "op@example.test", signed_in_at: "2026-10-01T08:00:00Z", two_step: false, has_password: true, activation_sent_at: null },
    { user_id: "u-member", email: "member@example.test", signed_in_at: "2026-10-02T08:00:00Z", two_step: false, has_password: true, activation_sent_at: null },
    { user_id: "u-named", email: "robin@example.test", signed_in_at: null, two_step: false, has_password: false, activation_sent_at: "2026-11-11T09:00:00Z" },
  ], error: null });
  vi.mocked(createAdminClient).mockResolvedValue({ schema: vi.fn(() => Object.assign(db, { rpc })) } as never);
  const view = await listPeople();
  expect(rpc).toHaveBeenCalledWith("account_state");
  expect(view.people.map(person => [person.kind, person.name, person.role, person.email, person.twoStep, person.activation?.active])).toEqual([
    ["lab_staff", "Synthetic Owner", "owner", "owner@example.test", true, true], ["lab_staff", "op@example.test", "operator", "op@example.test", false, true],
    ["client_member", "member@example.test", "viewer", "member@example.test", false, true], ["client_member", "Robin Example", "requester", "robin@example.test", false, false],
  ]);
  expect(view.people[3].activation).toEqual({ active: false, hasPassword: false, lastSentAt: "2026-11-11T09:00:00Z" });
  expect(view.invitations.map(item => [item.email, item.target])).toEqual([["pending@example.test", "Lab Operator"]]);
  expect(view).toMatchObject({ canInviteLab: false, canInviteClient: true, demoActors: null });

  // An Operator reads no account state: People says "Not readable" (null), and account_state is not called.
  rpc.mockClear();
  session = { userId: "u-op", role: "Operator", view: "staff" };
  const operatorView = await listPeople();
  expect(rpc).not.toHaveBeenCalled();
  expect(operatorView.people.map(person => [person.name, person.twoStep, person.activation])).toEqual([
    ["Synthetic Owner", null, null], ["User u-op", null, null], ["member@example.test", null, null], ["Robin Example", null, null],
  ]);
});

// Security review findings 4 and 5: an existing account accepts while signed in; a failed cleanup is surfaced.
test("live: preview says whether the email has an account; the signed-in person accepts with their own token", async () => {
  vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.test", anonKey: "anon-example" });
  const token = "b".repeat(64);
  const anonRpc = vi.fn().mockResolvedValue({ data: [{ email: "known@example.test", target: "Lab Operator", expires_at: "2026-11-17T00:00:00Z", has_account: true }], error: null });
  vi.mocked(createClient).mockReturnValue({ rpc: anonRpc } as never);
  expect(await previewInvitation(token)).toEqual({ email: "known@example.test", target: "Lab Operator", expiresAt: "2026-11-17T00:00:00Z", hasAccount: true });

  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "u-known", email: "Known@Example.test" } }, error: null });
  vi.mocked(createAdminClient).mockResolvedValue({ auth: { getUser }, schema: vi.fn(() => ({ rpc })) } as never);
  expect(await signedInEmail()).toBe("known@example.test");
  expect(await acceptMyInvitation(token)).toEqual({ email: "known@example.test" });
  expect(rpc).toHaveBeenCalledWith("accept_my_invitation", { p_token: token });
  expect(createServiceClient).not.toHaveBeenCalled();

  rpc.mockResolvedValueOnce({ data: null, error: { message: "This invitation is for a different email address" } });
  await expect(acceptMyInvitation(token)).rejects.toThrow(/different email/);
  await expect(acceptMyInvitation("not-a-token")).rejects.toThrow(/not valid/);
  getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect(await signedInEmail()).toBeNull();
  await expect(acceptMyInvitation(token)).rejects.toThrow(/Sign in/);
  expect(rpc).toHaveBeenCalledTimes(2);
});

test("demo: no accounts exist, so signed-in accept is not offered", async () => {
  expect(await signedInEmail()).toBeNull();
  await expect(acceptMyInvitation("c".repeat(64))).rejects.toThrow(/demo/);
});

test("live: when accepting fails and the new account cannot be removed, the person is told to contact the lab and the server logs it", async () => {
  vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.test", anonKey: "anon-example" });
  const token = "d".repeat(64);
  vi.mocked(createClient).mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [{ email: "late@example.test", target: "Viewer at Synthetic", expires_at: "2026-11-17T00:00:00Z", has_account: false }], error: null }) } as never);
  const createUser = vi.fn().mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
  const deleteUser = vi.fn().mockResolvedValue({ data: null, error: { message: "GoTrue unavailable" } });
  const serviceRpc = vi.fn().mockResolvedValue({ data: null, error: { message: "The client of this invitation is archived" } });
  vi.mocked(createServiceClient).mockReturnValue({ auth: { admin: { createUser, deleteUser } }, schema: vi.fn(() => ({ rpc: serviceRpc })) } as never);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(acceptInvitation({ token, password: "a synthetic passphrase" })).rejects.toThrow(/archived[^]*contact the lab/);
  expect(deleteUser).toHaveBeenCalledWith("new-user");
  expect(log).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(log.mock.calls)).toContain("new-user");
  expect(JSON.stringify(log.mock.calls)).toContain("GoTrue unavailable");
  expect(JSON.stringify(log.mock.calls)).not.toContain("a synthetic passphrase");

  // A cleanup that throws is handled the same way.
  deleteUser.mockRejectedValueOnce(new Error("network down"));
  await expect(acceptInvitation({ token, password: "a synthetic passphrase" })).rejects.toThrow(/contact the lab/);
  expect(log).toHaveBeenCalledTimes(2);
  // A successful cleanup keeps the plain message (the person can retry with the link).
  deleteUser.mockResolvedValueOnce({ data: {}, error: null });
  await expect(acceptInvitation({ token, password: "a synthetic passphrase" })).rejects.toThrow(/^The client of this invitation is archived$/);
  expect(log).toHaveBeenCalledTimes(2);
});
