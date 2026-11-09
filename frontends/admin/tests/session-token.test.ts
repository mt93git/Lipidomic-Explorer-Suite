// @vitest-environment node
// GET /admin/api/session-token (docs/integration/admin-identity.md): the same-origin rule, the exact responses and
// the wiring to the signed-in session. All tokens and ids here are synthetic.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { sameOriginRequest, sessionTokenResponse, tokenSubject, type SessionToken } from "@/lib/session-token";
import { getAppSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { GET } from "@/app/api/session-token/route";

vi.mock("@/lib/session", () => ({ getAppSession: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));

const userId = "00000000-0000-4000-8000-000000000011";
const token: SessionToken = { accessToken: "synthetic.access.token", expiresAt: 1_900_000_000, userId, view: "client" };
const headers = (values: Record<string, string>) => new Headers(values);
// A JWT-shaped synthetic token (unsigned: only its subject is read here; GoTrue and PostgREST verify real ones).
const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (sub: string) => `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub, role: "authenticated" })}.synthetic-signature`;

describe("token subject", () => {
  it("reads sub from a JWT payload and nothing from anything else", () => {
    expect(tokenSubject(jwt(userId))).toBe(userId);
    for (const bad of ["", "synthetic", "a.b", `${part({})}.${part({ sub: 7 })}.x`, `x.${Buffer.from("not json").toString("base64url")}.y`]) expect(tokenSubject(bad), bad).toBeNull();
  });
});

describe("same-origin rule", () => {
  it("accepts Sec-Fetch-Site: same-origin whatever the other headers say", () => {
    expect(sameOriginRequest(headers({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(sameOriginRequest(headers({ "sec-fetch-site": "same-origin", origin: "https://lab.example", host: "lab.example" }))).toBe(true);
  });
  it("refuses any other Sec-Fetch-Site value, even with the app's own Origin", () => {
    for (const site of ["cross-site", "same-site", "none", ""]) {
      expect(sameOriginRequest(headers({ "sec-fetch-site": site, origin: "https://lab.example", host: "lab.example" })), site).toBe(false);
    }
  });
  it("without Sec-Fetch-Site, accepts no Origin or the app's own (Host, or the proxy's X-Forwarded-Host)", () => {
    expect(sameOriginRequest(headers({ host: "lab.example" }))).toBe(true);
    expect(sameOriginRequest(headers({}))).toBe(true);
    expect(sameOriginRequest(headers({ origin: "https://lab.example", host: "lab.example" }))).toBe(true);
    expect(sameOriginRequest(headers({ origin: "https://LAB.example", host: "lab.example" }))).toBe(true);
    expect(sameOriginRequest(headers({ origin: "https://lab.example", host: "127.0.0.1:3000", "x-forwarded-host": "lab.example" }))).toBe(true);
    expect(sameOriginRequest(headers({ origin: "http://127.0.0.1:3110", host: "127.0.0.1:3110" }))).toBe(true);
  });
  it("without Sec-Fetch-Site, refuses another Origin, an opaque or malformed Origin, and an Origin with no host to compare", () => {
    expect(sameOriginRequest(headers({ origin: "https://evil.example", host: "lab.example" }))).toBe(false);
    expect(sameOriginRequest(headers({ origin: "https://lab.example.evil.example", host: "lab.example" }))).toBe(false);
    expect(sameOriginRequest(headers({ origin: "https://lab.example:8443", host: "lab.example" }))).toBe(false);
    expect(sameOriginRequest(headers({ origin: "https://evil.example", host: "evil.example", "x-forwarded-host": "lab.example" }))).toBe(false);
    expect(sameOriginRequest(headers({ origin: "null", host: "lab.example" }))).toBe(false);
    expect(sameOriginRequest(headers({ origin: "not a url", host: "lab.example" }))).toBe(false);
    expect(sameOriginRequest(headers({ origin: "https://lab.example" }))).toBe(false);
  });
});

describe("responses", () => {
  const same = headers({ "sec-fetch-site": "same-origin" });
  it("200 with exactly accessToken, expiresAt, userId and view, never cached", async () => {
    const response = await sessionTokenResponse(same, async () => token);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.json()).toEqual({ accessToken: "synthetic.access.token", expiresAt: 1_900_000_000, userId, view: "client" });
  });
  it("401 {error: signed_out} when nobody is signed in, never cached", async () => {
    const response = await sessionTokenResponse(same, async () => null);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "signed_out" });
  });
  it("403 for a cross-origin request, before the session is read (no refresh, no token)", async () => {
    const load = vi.fn(async () => token);
    const response = await sessionTokenResponse(headers({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }), load);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "cross_origin" });
    expect(load).not.toHaveBeenCalled();
  });
  it("503 {error: unavailable} when the session cannot be read (not reported as signed out)", async () => {
    const response = await sessionTokenResponse(same, async () => { throw new Error("database down"); });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
});

describe("GET /admin/api/session-token", () => {
  const getSession = vi.fn();
  const request = (init: Record<string, string> = { "sec-fetch-site": "same-origin" }) =>
    new NextRequest("http://127.0.0.1:3110/admin/api/session-token", { headers: init });
  const appSession = (view: "staff" | "client", mock = false) =>
    ({ userId, displayName: "Synthetic user", role: view === "staff" ? "Operator" : "Viewer", view, mock, clients: [], selectedClient: null });

  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: { access_token: jwt(userId), expires_at: 1_900_000_000 } }, error: null });
    vi.mocked(createAdminClient).mockResolvedValue({ auth: { getSession } } as never);
  });

  it("answers the signed-in user's GoTrue access token, its expiry, id and view", async () => {
    vi.mocked(getAppSession).mockResolvedValue(appSession("staff"));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ accessToken: jwt(userId), expiresAt: 1_900_000_000, userId, view: "staff" });
  });
  it("is signed_out with no session, an incomplete second factor (getAppSession is null) or no stored token", async () => {
    vi.mocked(getAppSession).mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(getSession).not.toHaveBeenCalled();
    vi.mocked(getAppSession).mockResolvedValue(appSession("client"));
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "signed_out" });
  });
  it("is signed_out when the stored token's subject is someone else (or unreadable) or it has no expiry", async () => {
    vi.mocked(getAppSession).mockResolvedValue(appSession("client"));
    getSession.mockResolvedValue({ data: { session: { access_token: jwt("00000000-0000-4000-8000-000000000099"), expires_at: 1_900_000_000 } }, error: null });
    expect((await GET(request())).status).toBe(401);
    getSession.mockResolvedValue({ data: { session: { access_token: "synthetic.not-a-jwt", expires_at: 1_900_000_000 } }, error: null });
    expect((await GET(request())).status).toBe(401);
    getSession.mockResolvedValue({ data: { session: { access_token: jwt(userId) } }, error: null });
    expect((await GET(request())).status).toBe(401);
  });
  it("is signed_out in demo mode: there is no Admin account and no GoTrue token to hand over", async () => {
    vi.mocked(getAppSession).mockResolvedValue(appSession("staff", true));
    vi.mocked(createAdminClient).mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "signed_out" });
  });
  it("refuses a cross-origin request with 403 without reading the session", async () => {
    vi.mocked(getAppSession).mockResolvedValue(appSession("staff"));
    const response = await GET(request({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(getAppSession).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("is a dynamic, uncached route", async () => {
    const route = await import("@/app/api/session-token/route");
    expect(route.dynamic).toBe("force-dynamic");
  });
});
