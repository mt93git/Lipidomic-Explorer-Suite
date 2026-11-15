import { beforeEach, describe, expect, it, vi } from "vitest";
import { chooseClient, enterDemo, signIn, signOut, switchView } from "@/app/actions";
import { getEnvironment } from "@/lib/environment";
import { getAppSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { authenticate, endAppSession } from "@/lib/auth-service";
import { demoSession } from "@/lib/demo";
import { clientCookie, signedOutCookie } from "@/lib/auth-cookies";
import { signInLimits } from "@/lib/app-sign-in";

const { setCookie, requestHeaders } = vi.hoisted(() => ({ setCookie: vi.fn(), requestHeaders: { current: new Headers() } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: setCookie }), headers: async () => requestHeaders.current }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/session", () => ({ getAppSession: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/auth-service", () => ({ authenticate: vi.fn(), endAppSession: vi.fn() }));
vi.mock("@/lib/action-redirect", () => ({ redirectAfterAction: async (url: string) => { throw new Error(`redirect:${url}`); } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" });
  vi.mocked(getAppSession).mockResolvedValue(demoSession);
  vi.mocked(endAppSession).mockResolvedValue({ error: null });
  requestHeaders.current = new Headers();
  signInLimits.ip.reset();
  signInLimits.email.reset();
});
function choice(id: string) { const form = new FormData(); form.set("clientId", id); return form; }

describe("server action boundaries", () => {
  it("persists an allowed client in an HttpOnly /admin cookie for a client user", async () => {
    vi.mocked(getAppSession).mockResolvedValue({ ...demoSession, view: "client", role: "Client admin" });
    await expect(chooseClient(choice("example-cedar"))).rejects.toThrow("redirect:/client/home");
    expect(setCookie).toHaveBeenCalledWith(clientCookie, "example-cedar", expect.objectContaining({ path: "/admin", httpOnly: true }));
  });
  it("turns a staff client choice into an overview filter without persisting it", async () => {
    await expect(chooseClient(choice("example-cedar"))).rejects.toThrow("redirect:/pipeline?client=example-cedar");
    expect(setCookie).not.toHaveBeenCalled();
  });
  it("rejects a forged client id before writing any cookie", async () => {
    await expect(chooseClient(choice("unrelated-client"))).rejects.toThrow("redirect:/choose-client?error=membership");
    expect(setCookie).not.toHaveBeenCalled();
  });
  it("requires a session before accepting a client selection", async () => {
    vi.mocked(getAppSession).mockResolvedValue(null);
    await expect(chooseClient(choice("example-cedar"))).rejects.toThrow("redirect:/sign-in");
    expect(setCookie).not.toHaveBeenCalled();
  });
  it("refuses the view switch in live mode", async () => {
    vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
    const form = new FormData(); form.set("view", "staff");
    await expect(switchView(form)).rejects.toThrow("redirect:/");
    expect(setCookie).not.toHaveBeenCalled();
  });
  it("does not permit demo entry when live authentication is configured", async () => {
    vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
    await expect(enterDemo()).rejects.toThrow("redirect:/sign-in");
    expect(setCookie).not.toHaveBeenCalled();
  });
  it("keeps the example user signed out without contacting Supabase", async () => {
    await expect(signOut()).rejects.toThrow("redirect:/sign-in");
    expect(setCookie).toHaveBeenCalledWith(signedOutCookie, "1", expect.objectContaining({ path: "/admin" }));
    expect(endAppSession).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("after sign-in, returns to an invitation link (and only that) given as next", async () => {
    vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
    vi.mocked(createAdminClient).mockResolvedValue({ auth: {} } as never);
    vi.mocked(authenticate).mockResolvedValue({ ok: true });
    const form = (next?: string) => { const data = new FormData(); data.set("email", "person@example.test"); data.set("password", "synthetic"); if (next !== undefined) data.set("next", next); return data; };
    const invite = `/invite/${"a".repeat(64)}`;
    await expect(signIn({}, form(invite))).rejects.toThrow(`redirect:${invite}`);
    for (const other of [undefined, "", "/people", "https://evil.example/invite/" + "a".repeat(64), "//evil.example", `${invite}/x`, "/invite/abc"]) {
      await expect(signIn({}, form(other)), String(other)).rejects.toThrow(/^redirect:\/choose-client$/);
    }
  });
  it("after too many failed sign-ins, the form says so without asking GoTrue; per email (any case) and per address", async () => {
    vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
    vi.mocked(createAdminClient).mockResolvedValue({ auth: {} } as never);
    const refused = { ok: false as const, error: "Sign-in failed. Check your email and password.", reason: "invalid_credentials" as const };
    const form = (email: string) => { const data = new FormData(); data.set("email", email); data.set("password", "synthetic"); return data; };
    const limited = { error: "Too many sign-in attempts. Wait a few minutes and try again, or reset your password." };
    vi.mocked(authenticate).mockResolvedValue(refused);
    for (let i = 0; i < 5; i += 1) {
      requestHeaders.current = new Headers({ "x-real-ip": `198.51.100.${i}` });
      expect(await signIn({}, form("person@example.test"))).toEqual({ error: refused.error });
    }
    vi.mocked(authenticate).mockClear();
    expect(await signIn({}, form("Person@Example.test"))).toEqual(limited);
    expect(authenticate).not.toHaveBeenCalled();
    requestHeaders.current = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    for (let i = 0; i < 10; i += 1) expect(await signIn({}, form(`other${i}@example.test`))).toEqual({ error: refused.error });
    vi.mocked(authenticate).mockClear();
    expect(await signIn({}, form("fresh@example.test"))).toEqual(limited);
    expect(authenticate).not.toHaveBeenCalled();
  });
  it("uses the app-scoped sign-out service for a live session", async () => {
    const client = { auth: {} } as never;
    vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
    vi.mocked(createAdminClient).mockResolvedValue(client);
    await expect(signOut()).rejects.toThrow("redirect:/sign-in");
    expect(endAppSession).toHaveBeenCalledExactlyOnceWith(client);
  });
});
