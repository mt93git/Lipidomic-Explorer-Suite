import { afterEach, describe, expect, it, vi } from "vitest";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import config from "../next.config";
import { DEFAULT_BASE_PATH, parseBasePath, servedBasePath } from "@/lib/base-path";

// Staging builds with ADMIN_BASE_PATH=/admin-staging; next.config.ts inlines it as NEXT_PUBLIC_ADMIN_BASE_PATH.
const STAGING = "/admin-staging";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getAppSession: vi.fn(async () => ({ view: "staff" })) }));
vi.mock("@/lib/data/people", async original => ({ ...await original<object>(), createInvitation: vi.fn(async () => "example-token") }));
vi.mock("@/lib/data/access-requests", async original => ({ ...await original<object>(), approveAccessRequest: vi.fn(async () => "example-token") }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

async function underStaging() {
  vi.stubEnv("NEXT_PUBLIC_ADMIN_BASE_PATH", STAGING);
  vi.resetModules();
  return {
    basePath: await import("@/lib/base-path"),
    cookies: await import("@/lib/auth-cookies"),
    sessionToken: await import("@/lib/session-token"),
    actionRedirect: await import("@/lib/action-redirect"),
    people: await import("@/app/(workspace)/people/actions"),
    headers: (await import("next/headers")).headers,
  };
}

describe("parseBasePath", () => {
  it("defaults to /admin when unset or empty", () => {
    expect(DEFAULT_BASE_PATH).toBe("/admin");
    expect(parseBasePath(undefined)).toBe("/admin");
    expect(parseBasePath("")).toBe("/admin");
  });
  it("accepts one or more segments that start with / and do not end with /", () => {
    expect(parseBasePath("/admin-staging")).toBe("/admin-staging");
    expect(parseBasePath("/lab/admin_2")).toBe("/lab/admin_2");
  });
  it.each(["admin", "/", "/admin/", "//admin", "/a//b", "/admin staging", "/..", "/a/./b", "https://example.org/admin", "/admin?x=1"])("refuses %j", value => {
    expect(() => parseBasePath(value)).toThrow(/ADMIN_BASE_PATH must start with "\/" and not end with "\/"/);
  });
});

describe("next.config.ts", () => {
  it("sets basePath and the public value from ADMIN_BASE_PATH at build, default /admin", () => {
    vi.stubEnv("ADMIN_BASE_PATH", "");
    expect([config(PHASE_PRODUCTION_BUILD).basePath, config(PHASE_PRODUCTION_BUILD).env?.NEXT_PUBLIC_ADMIN_BASE_PATH]).toEqual(["/admin", "/admin"]);
    vi.stubEnv("ADMIN_BASE_PATH", STAGING);
    expect([config(PHASE_PRODUCTION_BUILD).basePath, config(PHASE_PRODUCTION_BUILD).env?.NEXT_PUBLIC_ADMIN_BASE_PATH]).toEqual([STAGING, STAGING]);
  });
  it("fails the build on an invalid ADMIN_BASE_PATH", () => {
    vi.stubEnv("ADMIN_BASE_PATH", "/admin-staging/");
    expect(() => config(PHASE_PRODUCTION_BUILD)).toThrow(/ADMIN_BASE_PATH/);
  });
});

describe("servedBasePath (next start)", () => {
  it("serves what the build recorded, with ADMIN_BASE_PATH unset or the same", () => {
    expect(servedBasePath(STAGING, undefined)).toBe(STAGING);
    expect(servedBasePath(STAGING, "")).toBe(STAGING);
    expect(servedBasePath(STAGING, STAGING)).toBe(STAGING);
  });
  it("refuses a different ADMIN_BASE_PATH than the build's", () => {
    expect(() => servedBasePath(STAGING, "/admin")).toThrow("This build serves /admin-staging; rebuild with ADMIN_BASE_PATH=/admin");
  });
  it("without a build, reads ADMIN_BASE_PATH like the build does", () => {
    expect(servedBasePath(undefined, undefined)).toBe("/admin");
    expect(servedBasePath(undefined, STAGING)).toBe(STAGING);
  });
});

describe("a non-default base path (/admin-staging)", () => {
  it("is the module's value, and the app's paths are stripped of it", async () => {
    const { basePath } = await underStaging();
    expect(basePath.BASE_PATH).toBe(STAGING);
    expect(basePath.withBasePath("/pipeline")).toBe("/admin-staging/pipeline");
    expect(basePath.stripBasePath("/admin-staging")).toBe("/");
    expect(basePath.stripBasePath("/admin-staging/client/home")).toBe("/client/home");
    expect(basePath.stripBasePath("/pipeline")).toBe("/pipeline");
    expect(basePath.stripBasePath("/admin-stagingx/pipeline")).toBe("/admin-stagingx/pipeline");
  });
  it("scopes every app cookie to it, so /admin and /admin-staging sessions never mix", async () => {
    const { cookies } = await underStaging();
    expect(cookies.appCookieScope.path).toBe(STAGING);
    expect(cookies.authCookieOptions.path).toBe(STAGING);
    expect(cookies.preferenceCookieOptions.path).toBe(STAGING);
  });
  it("matches the session-token route with it, and not with /admin", async () => {
    const { sessionToken } = await underStaging();
    expect(sessionToken.isSessionTokenPath("/api/session-token")).toBe(true);
    expect(sessionToken.isSessionTokenPath("/admin-staging/api/session-token")).toBe(true);
    expect(sessionToken.isSessionTokenPath("/admin/api/session-token")).toBe(false);
  });
  it("puts it in a plain form's redirect, and leaves it to the router for an enhanced action", async () => {
    const { actionRedirect, headers } = await underStaging();
    vi.mocked(headers).mockResolvedValue(new Headers() as never);
    await expect(actionRedirect.redirectAfterAction("/pipeline")).rejects.toThrow("redirect:/admin-staging/pipeline");
    vi.mocked(headers).mockResolvedValue(new Headers({ "next-action": "example-action" }) as never);
    await expect(actionRedirect.redirectAfterAction("/pipeline")).rejects.toThrow("redirect:/pipeline");
  });
  it("starts the invitation links shown to copy (invite and approved access request)", async () => {
    const { people } = await underStaging();
    const invite = new FormData();
    invite.set("email", "New.Member@example.test");
    invite.set("target", "client:viewer");
    invite.set("clientId", "example-atlas");
    expect(await people.inviteAction({}, invite)).toMatchObject({ link: "/admin-staging/invite/example-token", email: "new.member@example.test" });
    const approve = new FormData();
    for (const [key, value] of Object.entries({ intent: "approve", requestId: "r-1", target: "existing", clientId: "example-atlas", role: "viewer" })) approve.set(key, value);
    expect(await people.answerAccessAction({}, approve)).toMatchObject({ requestId: "r-1", link: "/admin-staging/invite/example-token" });
  });
});
