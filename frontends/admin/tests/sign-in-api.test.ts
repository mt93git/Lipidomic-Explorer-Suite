// @vitest-environment node
// POST <base path>/api/sign-in and /api/sign-out for Nexo's own sign-in page (same origin, Admin's accounts). The real
// route, the real authenticate and the real cookie-backed client; only GoTrue is faked (through @supabase/ssr's
// createServerClient, whose cookie adapter is the app's own). Every email, password, code and token is synthetic.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "@/lib/supabase/middleware";
import { POST as signIn } from "@/app/api/sign-in/route";
import { POST as signOut } from "@/app/api/sign-out/route";
import { signInLimits } from "@/lib/app-sign-in";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

type Adapter = { setAll: (values: { name: string; value: string; options: Record<string, unknown> }[], headers?: Record<string, string>) => void };
const adapter = () => (vi.mocked(createServerClient).mock.calls.at(-1)![2] as { cookies: Adapter }).cookies;

const EMAIL = "rowan@cedar.example.test";
const PASSWORD = "synthetic-Pa55word-7f3c";
const CODE = "482913";
const SESSION = { name: "le-admin-auth.0", value: "synthetic-session-chunk", options: { path: "/", maxAge: 3600 } };

type Failure = { name?: string; status?: number; code?: string; message?: string } | null;
function fakeGoTrue({ login = null as Failure, mfa = false, assurance = null as Failure, verify = null as Failure, throws = false, signOutError = null as Failure } = {}) {
  const auth = {
    signInWithPassword: vi.fn(async () => {
      if (throws) throw new Error("network down");
      if (login) return { data: { user: null, session: null }, error: login };
      adapter().setAll([SESSION]);
      return { data: { user: { id: "example-user" }, session: {} }, error: null };
    }),
    signOut: vi.fn(async () => {
      if (signOutError) return { error: signOutError };
      adapter().setAll([{ name: SESSION.name, value: "", options: { path: "/", maxAge: 0 } }]);
      return { error: null };
    }),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn(async () => assurance ? { data: null, error: assurance } : { data: { currentLevel: "aal1", nextLevel: mfa ? "aal2" : "aal1" }, error: null }),
      listFactors: vi.fn(async () => ({ data: { totp: [{ id: "example-factor", status: "verified" }], all: [] }, error: null })),
      challengeAndVerify: vi.fn(async () => verify ? { data: null, error: verify } : { data: {}, error: null }),
    },
  };
  vi.mocked(createServerClient).mockImplementation(() => ({ auth }) as never);
  return auth;
}

let jar: NextResponse["cookies"];
const ORIGIN = "https://lab.example.test";
const same = { "sec-fetch-site": "same-origin", "content-type": "application/json" };
const post = (path: string, body?: unknown, headers: Record<string, string> = same) =>
  new NextRequest(`${ORIGIN}/admin/api/${path}`, { method: "POST", headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const answer = async (response: Response) => ({ status: response.status, cache: response.headers.get("cache-control"), body: await response.text() });
const cookie = (name: string) => jar.get(name);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_MOCK", "0");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-example-key");
  jar = new NextResponse().cookies;
  jar.set("le-admin-client", "example-previous-client");
  vi.mocked(cookies).mockResolvedValue(jar as never);
  signInLimits.ip.reset();
  signInLimits.email.reset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("POST /api/sign-in", () => {
  it("200 {ok:true}: signs in with the trimmed email, sets the session cookie on the base path and clears the client preference", async () => {
    const auth = fakeGoTrue();
    const response = await signIn(post("sign-in", { email: `  ${EMAIL} `, password: PASSWORD }));
    expect(await answer(response)).toEqual({ status: 200, cache: "no-store", body: JSON.stringify({ ok: true }) });
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({ email: EMAIL, password: PASSWORD });
    expect(cookie(SESSION.name)).toMatchObject({ value: SESSION.value, path: "/admin", httpOnly: true, sameSite: "lax" });
    expect(cookie("le-admin-client")).toMatchObject({ value: "", maxAge: 0, path: "/admin" });
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it("200 with two-step on and the right code", async () => {
    const auth = fakeGoTrue({ mfa: true });
    expect((await signIn(post("sign-in", { email: EMAIL, password: PASSWORD, code: ` ${CODE} ` }))).status).toBe(200);
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledExactlyOnceWith({ factorId: "example-factor", code: CODE });
    expect(cookie(SESSION.name)?.value).toBe(SESSION.value);
  });
  it("401 invalid_credentials when GoTrue refuses the email and password; no session, the preference kept", async () => {
    fakeGoTrue({ login: { name: "AuthApiError", status: 400, code: "invalid_credentials", message: "Invalid login credentials" } });
    expect(await answer(await signIn(post("sign-in", { email: EMAIL, password: PASSWORD })))).toEqual({ status: 401, cache: "no-store", body: JSON.stringify({ error: "invalid_credentials" }) });
    expect(cookie(SESSION.name)).toBeUndefined();
    expect(cookie("le-admin-client")?.value).toBe("example-previous-client");
  });
  it("401 code_required when two-step sign-in is on and no code was sent; the half-made session is ended", async () => {
    for (const body of [{ email: EMAIL, password: PASSWORD }, { email: EMAIL, password: PASSWORD, code: "" }, { email: EMAIL, password: PASSWORD, code: "  " }]) {
      const auth = fakeGoTrue({ mfa: true });
      expect(await answer(await signIn(post("sign-in", body)))).toEqual({ status: 401, cache: "no-store", body: JSON.stringify({ error: "code_required" }) });
      expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
      expect(cookie(SESSION.name)?.value).toBe("");
    }
  });
  it("401 invalid_code for a code GoTrue does not accept, or one that is not six digits; the session is ended", async () => {
    for (const [code, verify] of [[CODE, { name: "AuthApiError", status: 422, code: "mfa_verification_failed" }], ["12ab56", null], ["1234567", null]] as const) {
      const auth = fakeGoTrue({ mfa: true, verify });
      expect(await answer(await signIn(post("sign-in", { email: EMAIL, password: PASSWORD, code }))), code).toEqual({ status: 401, cache: "no-store", body: JSON.stringify({ error: "invalid_code" }) });
      expect(auth.signOut).toHaveBeenCalledOnce();
      expect(cookie(SESSION.name)?.value).toBe("");
    }
  });
  it("400 missing_fields for no email, no password, a non-string field or a body that is not a JSON object, without asking GoTrue", async () => {
    const auth = fakeGoTrue();
    for (const body of [{}, { email: EMAIL }, { password: PASSWORD }, { email: "  ", password: PASSWORD }, { email: EMAIL, password: "" },
      { email: 7, password: PASSWORD }, { email: EMAIL, password: PASSWORD, code: 482913 }, "not json", "null", "[]", ""]) {
      expect(await answer(await signIn(post("sign-in", body))), JSON.stringify(body)).toEqual({ status: 400, cache: "no-store", body: JSON.stringify({ error: "missing_fields" }) });
    }
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("503 unavailable when GoTrue cannot be reached, cannot read the two-step settings, or throws", async () => {
    const cases = [{ login: { name: "AuthRetryableFetchError", status: 0 } }, { login: { name: "AuthRetryableFetchError", status: 502 } }, { assurance: { name: "AuthApiError", status: 500 } }, { throws: true }];
    for (const options of cases) {
      fakeGoTrue(options);
      expect(await answer(await signIn(post("sign-in", { email: EMAIL, password: PASSWORD }))), JSON.stringify(options)).toEqual({ status: 503, cache: "no-store", body: JSON.stringify({ error: "unavailable" }) });
    }
  });
  it("503 unavailable in mock mode (the demo has no accounts), without a backend client", async () => {
    vi.stubEnv("ADMIN_MOCK", "1");
    expect(await answer(await signIn(post("sign-in", { email: EMAIL, password: PASSWORD })))).toEqual({ status: 503, cache: "no-store", body: JSON.stringify({ error: "unavailable" }) });
    expect(createServerClient).not.toHaveBeenCalled();
  });
  it("403 for a cross-origin request (the session-token rule), before the body or GoTrue is touched", async () => {
    const auth = fakeGoTrue();
    const refused: Record<string, string>[] = [{ "sec-fetch-site": "cross-site", origin: "https://evil.example" }, { "sec-fetch-site": "same-site" }, { origin: "https://evil.example", host: "lab.example.test" }];
    for (const headers of refused) {
      expect(await answer(await signIn(post("sign-in", { email: EMAIL, password: PASSWORD }, { ...headers, "content-type": "application/json" }))), JSON.stringify(headers))
        .toEqual({ status: 403, cache: "no-store", body: JSON.stringify({ error: "cross_origin" }) });
    }
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(cookie(SESSION.name)).toBeUndefined();
  });
  it("never logs or echoes the password or the code, whatever the answer", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(level => vi.spyOn(console, level).mockImplementation(() => undefined));
    const bodies: string[] = [];
    const runs: [Parameters<typeof fakeGoTrue>[0], Record<string, unknown>][] = [
      [{}, { email: EMAIL, password: PASSWORD, code: CODE }],
      [{ login: { status: 400, code: "invalid_credentials" } }, { email: EMAIL, password: PASSWORD, code: CODE }],
      [{ mfa: true, verify: { status: 422 } }, { email: EMAIL, password: PASSWORD, code: CODE }],
      [{ throws: true }, { email: EMAIL, password: PASSWORD, code: CODE }],
      [{}, { email: "", password: PASSWORD, code: CODE }],
    ];
    for (const [options, body] of runs) {
      fakeGoTrue(options);
      const response = await signIn(post("sign-in", body));
      bodies.push(await response.text(), JSON.stringify([...response.headers]));
    }
    const logged = spies.flatMap(spy => spy.mock.calls).map(call => JSON.stringify(call, (_key, value) => value instanceof Error ? `${value.message} ${value.stack}` : value));
    for (const text of [...bodies, ...logged]) {
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain(CODE);
    }
  });
  it("is a dynamic, uncached route", async () => {
    expect((await import("@/app/api/sign-in/route")).dynamic).toBe("force-dynamic");
  });
  describe("the failed-attempt limit", () => {
    const refused = { login: { name: "AuthApiError", status: 400, code: "invalid_credentials", message: "Invalid login credentials" } };
    const from = (ip: string) => ({ ...same, "x-forwarded-for": `${ip}, 10.0.0.1` });
    const limited = async (response: Response) => ({ ...(await answer(response)), retryAfter: response.headers.get("retry-after") });

    it("429 rate_limited with Retry-After after 5 failures for one email (any case), without asking GoTrue", async () => {
      vi.useFakeTimers({ now: Date.parse("2026-11-10T12:00:00Z"), toFake: ["Date"] });
      fakeGoTrue(refused);
      for (let i = 0; i < 5; i += 1) expect((await signIn(post("sign-in", { email: EMAIL, password: "wrong" }, from(`198.51.100.${i}`)))).status).toBe(401);
      const auth = fakeGoTrue();
      vi.setSystemTime(Date.parse("2026-11-10T12:05:00Z"));
      const response = await signIn(post("sign-in", { email: EMAIL.toUpperCase(), password: PASSWORD }, from("198.51.100.99")));
      expect(await limited(response)).toEqual({ status: 429, cache: "no-store", body: JSON.stringify({ error: "rate_limited" }), retryAfter: "600" });
      expect(auth.signInWithPassword).not.toHaveBeenCalled();
      expect(cookie(SESSION.name)).toBeUndefined();
      vi.setSystemTime(Date.parse("2026-11-10T12:15:00Z"));
      expect((await signIn(post("sign-in", { email: EMAIL, password: PASSWORD }, from("198.51.100.99")))).status).toBe(200);
    });
    it("429 after 10 failures from one address (first X-Forwarded-For hop, else X-Real-IP), whatever the email; other addresses go on", async () => {
      fakeGoTrue(refused);
      for (let i = 0; i < 10; i += 1) expect((await signIn(post("sign-in", { email: `p${i}@cedar.example.test`, password: "wrong" }, from("203.0.113.7")))).status).toBe(401);
      const auth = fakeGoTrue();
      expect((await signIn(post("sign-in", { email: EMAIL, password: PASSWORD }, from("203.0.113.7")))).status).toBe(429);
      expect((await signIn(post("sign-in", { email: EMAIL, password: PASSWORD }, { ...same, "x-real-ip": "203.0.113.7" }))).status).toBe(429);
      expect(auth.signInWithPassword).not.toHaveBeenCalled();
      expect((await signIn(post("sign-in", { email: EMAIL, password: PASSWORD }, from("203.0.113.8")))).status).toBe(200);
    });
    it("counts invalid_code but not code_required, unavailable or missing fields; a success clears the email's count", async () => {
      for (let i = 0; i < 4; i += 1) {
        fakeGoTrue({ mfa: true, verify: { name: "AuthApiError", status: 422 } });
        expect((await signIn(post("sign-in", { email: EMAIL, password: PASSWORD, code: CODE }, from(`198.51.100.${i}`)))).status).toBe(401);
      }
      fakeGoTrue({ mfa: true });
      for (let i = 0; i < 3; i += 1) expect((await signIn(post("sign-in", { email: EMAIL, password: PASSWORD }, from("198.51.100.50")))).status).toBe(401);
      fakeGoTrue({ throws: true });
      for (let i = 0; i < 3; i += 1) expect((await signIn(post("sign-in", { email: EMAIL, password: PASSWORD }, from("198.51.100.51")))).status).toBe(503);
      fakeGoTrue();
      expect((await signIn(post("sign-in", { email: EMAIL, password: PASSWORD }, from("198.51.100.52")))).status).toBe(200);
      fakeGoTrue(refused);
      for (let i = 0; i < 5; i += 1) expect((await signIn(post("sign-in", { email: EMAIL, password: "wrong" }, from(`198.51.100.${60 + i}`)))).status).toBe(401);
      expect((await signIn(post("sign-in", { email: EMAIL, password: "wrong" }, from("198.51.100.70")))).status).toBe(429);
    });
  });
});

describe("POST /api/sign-out", () => {
  it("204: ends the session as Admin's own sign-out does (local scope) and clears the client and view preferences", async () => {
    const auth = fakeGoTrue();
    jar.set(SESSION.name, SESSION.value);
    jar.set("le-admin-demo-view", "staff");
    const response = await signOut(post("sign-out"));
    expect(await answer(response)).toEqual({ status: 204, cache: "no-store", body: "" });
    expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(cookie(SESSION.name)).toMatchObject({ value: "", maxAge: 0, path: "/admin" });
    expect(cookie("le-admin-demo-signed-out")).toMatchObject({ value: "1", path: "/admin" });
    expect(cookie("le-admin-client")).toMatchObject({ value: "", maxAge: 0 });
    expect(cookie("le-admin-demo-view")).toMatchObject({ value: "", maxAge: 0 });
  });
  it("204 in mock mode without a backend client, signing the example user out like the action", async () => {
    vi.stubEnv("ADMIN_MOCK", "1");
    expect((await signOut(post("sign-out"))).status).toBe(204);
    expect(createServerClient).not.toHaveBeenCalled();
    expect(cookie("le-admin-demo-signed-out")?.value).toBe("1");
  });
  it("503 unavailable when GoTrue cannot end the session (it may still be active), and the preferences are left", async () => {
    fakeGoTrue({ signOutError: { name: "AuthRetryableFetchError", status: 0 } });
    expect(await answer(await signOut(post("sign-out")))).toEqual({ status: 503, cache: "no-store", body: JSON.stringify({ error: "unavailable" }) });
    expect(cookie("le-admin-demo-signed-out")).toBeUndefined();
    expect(cookie("le-admin-client")?.value).toBe("example-previous-client");
  });
  it("403 for a cross-origin request, before the session is touched", async () => {
    const auth = fakeGoTrue();
    expect(await answer(await signOut(post("sign-out", undefined, { "sec-fetch-site": "cross-site", origin: "https://evil.example" })))).toEqual({ status: 403, cache: "no-store", body: JSON.stringify({ error: "cross_origin" }) });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
  });
  it("is a dynamic, uncached route", async () => {
    expect((await import("@/app/api/sign-out/route")).dynamic).toBe("force-dynamic");
  });
});

describe("the proxy on these routes", () => {
  it("leaves exactly Cache-Control: no-store on both (their contract), with and without basePath in the pathname", async () => {
    vi.mocked(createServerClient).mockImplementation(() => ({ auth: { getUser: async () => {
      adapter().setAll([SESSION], { "Cache-Control": "private, no-store" });
      return { data: { user: null }, error: null };
    } } }) as never);
    for (const path of ["sign-in", "sign-out"]) {
      for (const url of [`${ORIGIN}/admin/api/${path}`, `${ORIGIN}/api/${path}`]) {
        expect((await updateSession(new NextRequest(url, { method: "POST" }))).headers.get("Cache-Control"), url).toBe("no-store");
      }
    }
    expect((await updateSession(new NextRequest(`${ORIGIN}/admin/sign-in`))).headers.get("Cache-Control")).toBe("private, no-store");
  });
});
