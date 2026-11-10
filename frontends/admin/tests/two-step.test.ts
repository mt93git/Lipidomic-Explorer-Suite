// @vitest-environment node
// Security review finding 2: a lab-role account must enroll an app authenticator before it can use Admin. A session at
// aal1 with no verified factor gets no app session (so no workspace page, server action or session token) and is
// sent to /two-step-setup. All ids, codes and secrets here are synthetic.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { twoStepState } from "@/lib/two-step";
import { startTotpEnrollment, verifyTotpEnrollment } from "@/lib/auth-service";
import { fakePostgrest } from "./helpers/fake-postgrest";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers({ "next-action": "x" }) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/environment", () => ({ getEnvironment: () => ({ mock: false, url: "https://example.invalid", anonKey: "anon" }) }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient }));

type Level = "aal1" | "aal2";
type Row = Record<string, unknown>;
const user = { id: "user-1", email: "person@example.test" };
function fakeAuth(levels: { current: Level; next: Level }, factors: { id: string; status: "verified" | "unverified" }[] = []) {
  return {
    getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel: levels.current, nextLevel: levels.next }, error: null }),
      listFactors: vi.fn().mockResolvedValue({ data: { all: factors.map(f => ({ ...f, factor_type: "totp" })), totp: factors.filter(f => f.status === "verified") }, error: null }),
      unenroll: vi.fn().mockResolvedValue({ data: {}, error: null }),
      enroll: vi.fn().mockResolvedValue({ data: { id: "factor-new", type: "totp", totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "SYNTHETICSECRET", uri: "otpauth://totp/x" } }, error: null }),
      challengeAndVerify: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  };
}
function liveClient(levels: { current: Level; next: Level }, labRole: string | null, member = false) {
  const tables: Record<string, Row[]> = {
    lab_staff: labRole ? [{ user_id: user.id, role: labRole, display_name: "Person", archived_at: null }] : [],
    client_member: member ? [{ user_id: user.id, role: "viewer", archived_at: null, client: { id: "c-1", name: "Cedar Lab", archived_at: null } }] : [],
    client: [{ id: "c-1", name: "Cedar Lab", archived_at: null }],
  };
  const db = fakePostgrest(tables);
  const auth = fakeAuth(levels);
  return { auth, schema: (name: string) => (name === "admin" ? { from: db.from } : null) };
}
async function sessionModule() {
  vi.resetModules();
  return import("@/lib/session");
}

describe("the two-step rule", () => {
  it("lets an aal2 session through, sends an unverified factor back to sign-in, and a lab role with no factor to enroll", () => {
    for (const lab of [true, false]) expect(twoStepState({ currentLevel: "aal2", nextLevel: "aal2" }, lab)).toBe("ok");
    for (const lab of [true, false]) expect(twoStepState({ currentLevel: "aal1", nextLevel: "aal2" }, lab)).toBe("verify");
    expect(twoStepState({ currentLevel: "aal1", nextLevel: "aal1" }, true)).toBe("enroll");
    expect(twoStepState({ currentLevel: "aal1", nextLevel: "aal1" }, false)).toBe("ok");
    expect(twoStepState({ currentLevel: null, nextLevel: null }, true)).toBe("enroll");
  });
});

describe("the session gate", () => {
  beforeEach(() => createAdminClient.mockReset());

  for (const role of ["owner", "admin", "operator", "member"]) {
    it(`gives a ${role} at aal1 without a factor no app session and sends every workspace page to enroll`, async () => {
      createAdminClient.mockResolvedValue(liveClient({ current: "aal1", next: "aal1" }, role, role === "member"));
      const { getAppSession, needsTwoStepEnrollment, requireSession, requireWorkspace } = await sessionModule();
      expect(await getAppSession()).toBeNull();
      expect(await needsTwoStepEnrollment()).toBe(true);
      await expect(requireSession()).rejects.toThrow("redirect:/two-step-setup");
      await expect(requireWorkspace("staff")).rejects.toThrow("redirect:/two-step-setup");
    });
  }

  it("lets lab staff in once the session is aal2", async () => {
    createAdminClient.mockResolvedValue(liveClient({ current: "aal2", next: "aal2" }, "operator"));
    const { getAppSession, needsTwoStepEnrollment } = await sessionModule();
    expect(await getAppSession()).toMatchObject({ userId: "user-1", view: "staff", role: "Operator" });
    expect(await needsTwoStepEnrollment()).toBe(false);
  });

  it("keeps password-only sign-in for client users, and sends a half-verified session to sign-in, not enroll", async () => {
    createAdminClient.mockResolvedValue(liveClient({ current: "aal1", next: "aal1" }, null, true));
    let mod = await sessionModule();
    expect(await mod.getAppSession()).toMatchObject({ view: "client" });
    createAdminClient.mockResolvedValue(liveClient({ current: "aal1", next: "aal2" }, "operator"));
    mod = await sessionModule();
    expect(await mod.getAppSession()).toBeNull();
    expect(await mod.needsTwoStepEnrollment()).toBe(false);
    await expect(mod.requireSession()).rejects.toThrow("redirect:/sign-in");
  });

  it("signed out: no session, nothing to enroll", async () => {
    const client = liveClient({ current: "aal1", next: "aal1" }, "operator");
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    createAdminClient.mockResolvedValue(client);
    const { getAppSession, needsTwoStepEnrollment } = await sessionModule();
    expect(await getAppSession()).toBeNull();
    expect(await needsTwoStepEnrollment()).toBe(false);
  });
});

describe("TOTP enrollment (auth-service)", () => {
  const client = (auth: ReturnType<typeof fakeAuth>) => ({ auth } as unknown as SupabaseClient);

  it("clears stale unverified factors, enrolls a TOTP factor and returns its QR code and secret", async () => {
    const auth = fakeAuth({ current: "aal1", next: "aal1" }, [{ id: "stale", status: "unverified" }]);
    expect(await startTotpEnrollment(client(auth))).toEqual({ ok: true, factorId: "factor-new", qrCode: "data:image/svg+xml;utf-8,<svg/>", secret: "SYNTHETICSECRET" });
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: "stale" });
    expect(auth.mfa.enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: "totp" }));
  });

  it("refuses to enroll a second factor or when the factors cannot be read", async () => {
    const verified = fakeAuth({ current: "aal1", next: "aal2" }, [{ id: "existing", status: "verified" }]);
    expect(await startTotpEnrollment(client(verified))).toMatchObject({ ok: false });
    expect(verified.mfa.enroll).not.toHaveBeenCalled();
    const broken = fakeAuth({ current: "aal1", next: "aal1" });
    broken.mfa.listFactors.mockResolvedValue({ data: null, error: new Error("down") });
    expect(await startTotpEnrollment(client(broken))).toMatchObject({ ok: false });
    expect(broken.mfa.enroll).not.toHaveBeenCalled();
  });

  it("verifies the six-digit code against the new factor; anything else is refused", async () => {
    const auth = fakeAuth({ current: "aal1", next: "aal1" });
    expect(await verifyTotpEnrollment(client(auth), "factor-new", "12345")).toMatchObject({ ok: false });
    expect(await verifyTotpEnrollment(client(auth), "", "123456")).toMatchObject({ ok: false });
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
    expect(await verifyTotpEnrollment(client(auth), "factor-new", "123456")).toEqual({ ok: true });
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "factor-new", code: "123456" });
    auth.mfa.challengeAndVerify.mockResolvedValue({ data: null, error: new Error("invalid") });
    expect(await verifyTotpEnrollment(client(auth), "factor-new", "654321")).toMatchObject({ ok: false });
  });
});

describe("the enrollment page's action", () => {
  beforeEach(() => createAdminClient.mockReset());
  const form = (values: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };
  async function action() {
    vi.resetModules();
    return (await import("@/app/two-step-setup/actions")).twoStepSetupAction;
  }

  it("shows the QR code, then verifies the code and continues to the workspace", async () => {
    const client = liveClient({ current: "aal1", next: "aal1" }, "operator");
    createAdminClient.mockResolvedValue(client);
    const run = await action();
    expect(await run({}, form({}))).toEqual({ factorId: "factor-new", qrCode: "data:image/svg+xml;utf-8,<svg/>", secret: "SYNTHETICSECRET" });
    await expect(run({}, form({ factorId: "factor-new", code: "123456" }))).rejects.toThrow("redirect:/choose-client");
    expect(client.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "factor-new", code: "123456" });
  });

  it("keeps the QR code on a wrong code, and does nothing for a session that does not need to enroll", async () => {
    const client = liveClient({ current: "aal1", next: "aal1" }, "operator");
    client.auth.mfa.challengeAndVerify.mockResolvedValue({ data: null, error: new Error("invalid") });
    createAdminClient.mockResolvedValue(client);
    const run = await action();
    const shown = { factorId: "factor-new", qrCode: "data:image/svg+xml;utf-8,<svg/>", secret: "SYNTHETICSECRET" };
    expect(await run(shown, form({ factorId: "factor-new", code: "000000" }))).toMatchObject({ ...shown, error: expect.stringMatching(/not accepted/) });

    const enrolled = liveClient({ current: "aal2", next: "aal2" }, "operator");
    createAdminClient.mockResolvedValue(enrolled);
    const again = await action();
    await expect(again({}, form({}))).rejects.toThrow("redirect:/");
    expect(enrolled.auth.mfa.enroll).not.toHaveBeenCalled();
  });
});
