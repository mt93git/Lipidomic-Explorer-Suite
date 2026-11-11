// @vitest-environment node
// The server wiring of the account emails (data/activation.ts, 0029). Live: the recovery link comes from GoTrue's
// admin generate_link with the service client (GoTrue's own recover email is never used), the email goes through
// the Resend transport (fetch is a fake here), the log through the service client and the audit row through the
// sender's own token. The demo sends nothing and makes no link. Fakes only: no database, no GoTrue, no Resend.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { emailInvitation, sendActivation } from "@/lib/data/activation";
import { readDemoNotifications } from "@/lib/data/demo-store";
import { createInvitation, listPeople } from "@/lib/data/people";
import { getEnvironment } from "@/lib/environment";
import { DEMO_OFF_REASON } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fakePostgrest } from "./helpers/fake-postgrest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => session) }));

let session: Record<string, unknown> = { userId: "example-staff", role: "Operator", view: "staff" };
const jar = new Map<string, string>();
const fetchSpy = vi.fn();
const owner = "example-owner";
beforeEach(() => {
  vi.clearAllMocks(); jar.clear();
  vi.stubGlobal("fetch", fetchSpy);
  for (const name of ["ADMIN_NOTIFY_ENABLED", "ADMIN_NOTIFY_ALLOW", "RESEND_API_KEY", "ADMIN_MAIL_FROM", "ADMIN_PUBLIC_ORIGIN"]) vi.stubEnv(name, "");
  session = { userId: "example-staff", role: "Operator", view: "staff" };
  vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" });
  vi.mocked(cookies).mockResolvedValue({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value) } as never);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("demo", () => {
  it("the seed's Requester is not activated; an Owner's send is logged as skipped, an Operator's refused; no link, no network", async () => {
    const requester = (await listPeople()).people.find(person => person.name === "Demo Requester");
    expect(requester?.activation).toEqual({ active: false, hasPassword: false, lastSentAt: null });
    expect((await listPeople()).people.filter(person => person.activation?.active === false).map(person => person.name)).toEqual(["Demo Requester"]);
    await expect(sendActivation({ kind: "client_member", id: requester!.id })).rejects.toThrow("Only a lab Owner or Admin can send activation emails.");
    expect(await sendActivation({ kind: "client_member", id: requester!.id, actorId: owner })).toEqual({ status: "skipped", error: DEMO_OFF_REASON, email: "requester@example.test" });
    expect((await readDemoNotifications()).log.map(row => [row.kind, row.userId, row.email, row.subject, row.status])).toEqual([
      ["activation", "example-requester", "requester@example.test", "Welcome to Lipidomics · Choose your password", "skipped"],
    ]);
    await expect(sendActivation({ kind: "client_member", id: "member-example-client-member", actorId: owner })).rejects.toThrow(/already signed in/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("an invitation is logged as skipped, without a user", async () => {
    const token = await createInvitation({ email: "new@example.test", labRole: null, clientId: "example-atlas", clientRole: "viewer", actorId: owner });
    expect(await emailInvitation(token, false, owner)).toEqual({ status: "skipped", error: DEMO_OFF_REASON, email: "new@example.test" });
    expect((await readDemoNotifications()).log.map(row => [row.kind, row.userId, row.email, row.status])).toEqual([["invitation", null, "new@example.test", "skipped"]]);
    expect(await emailInvitation("0".repeat(64), false, owner)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("live", () => {
  const HASH = "c".repeat(56);
  function setUp(account: Record<string, unknown>) {
    vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
    for (const [name, value] of Object.entries({ ADMIN_NOTIFY_ENABLED: "true", RESEND_API_KEY: "re_test", ADMIN_MAIL_FROM: "lab@lab.example.test", ADMIN_PUBLIC_ORIGIN: "https://lipidomics.example.test" })) vi.stubEnv(name, value);
    session = { userId: "u-admin", role: "Admin", view: "staff", displayName: "Robin Admin" };
    const db = fakePostgrest({
      lab_staff: [{ id: "s1", user_id: "u-op", role: "operator", display_name: "Sam Operator", archived_at: null }],
      client_member: [], invitation: [], client: [],
    });
    const rpc = vi.fn(async (fn: string) => fn === "account_state"
      ? { data: [{ user_id: "u-op", email: "sam@lab.example.test", signed_in_at: "2026-10-01T08:00:00Z", two_step: false, has_password: true, activation_sent_at: null, ...account }], error: null }
      : { data: null, error: null });
    vi.mocked(createAdminClient).mockResolvedValue({ schema: vi.fn(() => Object.assign(db, { rpc })) } as never);
    const logged: unknown[] = [];
    const generateLink = vi.fn().mockResolvedValue({ data: { properties: { hashed_token: HASH } }, error: null });
    const resetPasswordForEmail = vi.fn();
    vi.mocked(createServiceClient).mockReturnValue({
      auth: { admin: { generateLink }, resetPasswordForEmail },
      from: vi.fn(() => ({ insert: async (rows: unknown[]) => { logged.push(...rows); return { error: null }; } })),
    } as never);
    fetchSpy.mockResolvedValue(new Response("{}", { status: 200 }));
    return { rpc, logged, generateLink, resetPasswordForEmail };
  }

  it("a lab person copied from Team (password, no factor): generate_link recovery, the Team-password email, the log and the audit", async () => {
    const { rpc, logged, generateLink, resetPasswordForEmail } = setUp({});
    expect(await sendActivation({ kind: "lab_staff", id: "s1" })).toEqual({ status: "sent", error: null, email: "sam@lab.example.test" });
    expect(generateLink).toHaveBeenCalledWith({ type: "recovery", email: "sam@lab.example.test" });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: "Lipidomics · Libreros Lab <lab@lab.example.test>", to: ["sam@lab.example.test"], subject: "Welcome to Lipidomics · Sign in to Admin" });
    expect(body.text).toContain("Robin Admin set up your account in Lipidomics Admin, the Libreros Lab's lipidomics service, as Lab Operator.");
    expect(body.text).toContain("Your Lipidomics Team password already works here.");
    expect(body.text).toContain(`https://lipidomics.example.test/admin/activate?token_hash=${HASH}&type=recovery`);
    expect(logged).toEqual([expect.objectContaining({ kind: "activation", user_id: "u-op", email: "sam@lab.example.test", status: "sent", error: null })]);
    expect(rpc).toHaveBeenCalledWith("record_activation_email", { p_user_id: "u-op" });
  });

  it("within 10 minutes of a sent one: refused, nothing made or sent", async () => {
    const { generateLink, logged } = setUp({ activation_sent_at: new Date(Date.now() - 60_000).toISOString() });
    await expect(sendActivation({ kind: "lab_staff", id: "s1" })).rejects.toThrow(/less than 10 minutes ago/);
    expect([generateLink.mock.calls, fetchSpy.mock.calls, logged]).toEqual([[], [], []]);
  });

  it("an Operator is refused even though People lists the person", async () => {
    const { generateLink } = setUp({});
    session = { ...session, role: "Operator" };
    await expect(sendActivation({ kind: "lab_staff", id: "s1" })).rejects.toThrow("Only a lab Owner or Admin can send activation emails.");
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("an invitation: read back with anon invitation_preview, then emailed with the invite link; logged without a user", async () => {
    const { logged } = setUp({});
    const token = "d".repeat(64);
    vi.mocked(createClient).mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [{ email: "new@cedar.example.test", target: "Viewer at Example Cedar", expires_at: "2026-11-18T00:00:00Z", has_account: false }], error: null }) } as never);
    expect(await emailInvitation(token, false)).toEqual({ status: "sent", error: null, email: "new@cedar.example.test" });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.subject).toBe("Welcome to Lipidomics · Activate your account");
    expect(body.text).toContain("Robin Admin invited you to Lipidomics Admin, the Libreros Lab's lipidomics service, as Viewer at Example Cedar.");
    expect(body.text).toContain(`https://lipidomics.example.test/admin/invite/${token}`);
    expect(logged).toEqual([expect.objectContaining({ kind: "invitation", user_id: null, email: "new@cedar.example.test", status: "sent" })]);
  });
});
