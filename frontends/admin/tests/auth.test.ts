import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticate, endAppSession } from "@/lib/auth-service";
import { selectClient, sessionFromUser } from "@/lib/session-model";
import { authCookieOptions } from "@/lib/auth-cookies";

function fakeAuth(needsMfa = false) {
  const auth = {
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: needsMfa ? "aal2" : "aal1" }, error: null }),
      listFactors: vi.fn().mockResolvedValue({ data: { totp: [{ id: "demo-factor", status: "verified" }] }, error: null }),
      challengeAndVerify: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  };
  return { auth, client: { auth } as unknown as SupabaseClient };
}

describe("app-scoped authentication", () => {
  it("signs in with the password and verifies an enrolled two-step factor", async () => {
    const { auth, client } = fakeAuth(true);
    expect(await authenticate(client, "demo@example.invalid", "demo-password", "123456")).toEqual({ ok: true });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "demo@example.invalid", password: "demo-password" });
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "demo-factor", code: "123456" });
  });
  it("does not leave a usable partial login when the required code is missing", async () => {
    const { auth, client } = fakeAuth(true);
    expect((await authenticate(client, "demo@example.invalid", "demo-password", "")).ok).toBe(false);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("clears the local partial session on verification failure", async () => {
    const { auth, client } = fakeAuth(true);
    auth.mfa.challengeAndVerify.mockResolvedValue({ data: null, error: new Error("invalid") });
    expect((await authenticate(client, "demo@example.invalid", "demo-password", "123456")).ok).toBe(false);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("ends only the local session and uses a dedicated /admin cookie", async () => {
    const { auth, client } = fakeAuth();
    await endAppSession(client);
    expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(authCookieOptions).toMatchObject({ name: "le-admin-auth", path: "/admin", httpOnly: true, sameSite: "lax" });
  });
  it("does not trust user-editable metadata for roles or memberships", () => {
    const session = sessionFromUser({ id: "example-user", app_metadata: {}, user_metadata: { lab_role: "Owner", clients: [{ id: "stolen", name: "Wrong" }] } });
    expect(session.view).toBe("client");
    expect(session.clients).toEqual([]);
  });
  it("accepts only a client the verified user belongs to", () => {
    const clients = [{ id: "atlas", name: "Example Atlas", color: "blue" }];
    expect(selectClient(clients, "atlas")).toEqual(clients[0]);
    expect(selectClient(clients, "another-client")).toBeNull();
  });
});
