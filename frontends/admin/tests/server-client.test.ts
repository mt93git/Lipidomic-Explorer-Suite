// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/server";
import { updateSession } from "@/lib/supabase/middleware";
import { config as proxyConfig, proxy } from "@/proxy";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

type CookieAdapter = { getAll: () => { name: string; value: string }[]; setAll: (cookies: { name: string; value: string; options: { path: string } }[], headers?: Record<string, string>) => void };
const chunks = [
  { name: "le-admin-auth.0", value: "example-chunk-a", options: { path: "/" } },
  { name: "le-admin-auth.1", value: "example-chunk-b", options: { path: "/" } },
];
function adapter() {
  return (vi.mocked(createServerClient).mock.calls.at(-1)![2] as { cookies: CookieAdapter }).cookies;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_MOCK", "0");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-example-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("cookie-backed client", () => {
  it("runs refresh in Next 16's proxy, which is always on the Node runtime this Supabase release needs", () => {
    expect(typeof proxy).toBe("function");
    // Next 16 rejects a runtime option in proxy files; an edge runtime can no longer be selected.
    expect(proxyConfig).not.toHaveProperty("runtime");
  });
  it("uses the anon key, admin schema, and the request's cookies", async () => {
    const response = new NextResponse();
    response.cookies.set("le-admin-auth.0", "example-session");
    vi.mocked(cookies).mockResolvedValue(response.cookies as never);
    await createAdminClient();
    expect(createServerClient).toHaveBeenCalledWith("https://example.supabase.co", "public-example-key", expect.objectContaining({ db: { schema: "admin" } }));
    expect(adapter().getAll()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "le-admin-auth.0", value: "example-session" })]));
  });
  it("preserves separate chunk names when writing the app's cookies", async () => {
    const response = new NextResponse();
    vi.mocked(cookies).mockResolvedValue(response.cookies as never);
    await createAdminClient();
    adapter().setAll(chunks);
    expect(response.cookies.get("le-admin-auth.0")?.value).toBe("example-chunk-a");
    expect(response.cookies.get("le-admin-auth.1")?.value).toBe("example-chunk-b");
    expect(response.cookies.get("le-admin-auth.1")?.path).toBe("/admin");
  });
  it("does not create a backend client in mock mode", async () => {
    vi.stubEnv("ADMIN_MOCK", "1");
    expect(await createAdminClient()).toBeNull();
    expect(createServerClient).not.toHaveBeenCalled();
  });
  it("refreshes both the request and browser cookies and preserves no-store headers", async () => {
    vi.mocked(createServerClient).mockImplementation(() => ({ auth: { getUser: async () => {
      adapter().setAll(chunks, { "Cache-Control": "private, no-store", "Pragma": "no-cache" });
      return { data: { user: null }, error: null };
    } } }) as never);
    const request = new NextRequest("https://example.invalid/admin/pipeline");
    const response = await updateSession(request);
    expect(request.cookies.get("le-admin-auth.0")?.value).toBe("example-chunk-a");
    expect(response.cookies.get("le-admin-auth.0")?.value).toBe("example-chunk-a");
    expect(response.cookies.get("le-admin-auth.1")?.value).toBe("example-chunk-b");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });
  it("leaves GET /admin/api/session-token with exactly Cache-Control: no-store (its contract), with and without a refresh", async () => {
    const refreshing = { auth: { getUser: async () => {
      adapter().setAll(chunks, { "Cache-Control": "private, no-store" });
      return { data: { user: null }, error: null };
    } } };
    const quiet = { auth: { getUser: async () => ({ data: { user: null }, error: null }) } };
    for (const client of [refreshing, quiet]) {
      vi.mocked(createServerClient).mockImplementation(() => client as never);
      // With basePath applied (Next strips /admin from nextUrl.pathname) and without it.
      for (const url of ["https://example.invalid/admin/api/session-token", "https://example.invalid/api/session-token"]) {
        expect((await updateSession(new NextRequest(url))).headers.get("Cache-Control"), url).toBe("no-store");
      }
      expect((await updateSession(new NextRequest("https://example.invalid/admin/pipeline"))).headers.get("Cache-Control")).toBe("private, no-store");
    }
    vi.stubEnv("ADMIN_MOCK", "1");
    expect((await updateSession(new NextRequest("https://example.invalid/admin/api/session-token"))).headers.get("Cache-Control")).toBe("no-store");
  });
});
