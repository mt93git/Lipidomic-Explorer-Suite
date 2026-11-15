// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import setup from "../e2e/live/pilot-setup.mjs";
import teardown from "../e2e/live/pilot-teardown.mjs";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let dir: string;
let file: string;
const credentials = { steph: { email: "steph@example.test", password: "synthetic" }, paula: { email: "paula@example.test", password: "synthetic" }, clientName: "Pilot Simulation Client (synthetic)", panelName: "Pilot Simulation Panel (synthetic)" };
const TITLE = "Admin pilot simulation 2026-11-10 12:00 · run 0a1b2c3d";
const OTHER = "Admin pilot simulation 2026-11-10 12:05 · run ffffffff";
const REASON = "E2E pilot run finished";
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pilot-teardown-"));
  file = join(dir, "credentials.json");
  writeFileSync(file, JSON.stringify({ ...credentials, orderTitle: TITLE }), { mode: 0o600 });
  for (const [name, value] of Object.entries({ ADMIN_E2E_PILOT: "1", ADMIN_PILOT_CREDENTIALS: file,
    NEXT_PUBLIC_SUPABASE_URL: "https://staging.example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    ADMIN_E2E_AUTH_URL: "", ADMIN_E2E_REST_URL: "", ADMIN_PILOT_RUN_ORDER_CODE: "", ADMIN_PILOT_RUN_ORDER_TITLE: "", SUPABASE_SERVICE_ROLE_KEY: "never-use-this" })) vi.stubEnv(name, value);
  await setup();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });

// A staging stand-in answering by method and path: the run created one order through New order, its three samples went
// into one batch (one version, five injections: three Unknown, a blank and a QC), and v1 was released.
type Answer = unknown | ((url: URL, init: RequestInit) => Response);
function stack(overrides: Record<string, Answer> = {}) {
  const answers: Record<string, Answer> = {
    "POST /auth/v1/token": { access_token: "steph-token" },
    "GET /rest/v1/order": [{ id: "order-uuid", code: "ORD301" }],
    "GET /rest/v1/dataset": [{ id: "dataset-uuid" }],
    "POST /rest/v1/rpc/withdraw_dataset": null,
    "GET /rest/v1/sample": [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
    "GET /rest/v1/aliquot": [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
    "GET /rest/v1/injection": (url: URL) => json(url.searchParams.has("aliquot_id")
      ? [{ batch_version_id: "v1" }, { batch_version_id: "v1" }, { batch_version_id: "v1" }]
      : [{ aliquot_id: null }, { aliquot_id: "a2" }, { aliquot_id: "a3" }, { aliquot_id: "a1" }, { aliquot_id: null }]),
    "GET /rest/v1/batch_version": (url: URL) => json(url.searchParams.has("id") ? [{ batch_id: "batch-uuid" }] : [{ id: "v1" }]),
    "PATCH /rest/v1/injection": [], "PATCH /rest/v1/batch_version": [], "PATCH /rest/v1/batch": [], "PATCH /rest/v1/aliquot": [],
    "PATCH /rest/v1/order": [{ id: "order-uuid", archived_at: "2026-11-10" }],
    ...overrides,
  };
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
    // Direct GoTrue / PostgREST URLs (ADMIN_E2E_AUTH_URL / ADMIN_E2E_REST_URL) have no /auth/v1 or /rest/v1 prefix.
    const path = url.pathname.startsWith("/token") ? `/auth/v1${url.pathname}` : url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/") ? url.pathname : `/rest/v1${url.pathname}`;
    const answer = answers[`${init.method ?? "GET"} ${path}`];
    if (answer === undefined) throw new Error(`unexpected ${init.method ?? "GET"} ${url.pathname}`);
    return typeof answer === "function" ? (answer as (u: URL, i: RequestInit) => Response)(url, init) : json(answer);
  });
}
const calls = (fetch: ReturnType<typeof stack>) => fetch.mock.calls.map(([url, init]) => {
  const u = new URL(String(url));
  return `${init?.method ?? "GET"} ${u.pathname.replace(/^\/(rest|auth)\/v1/, "")}${decodeURIComponent(u.search)}`;
});
const marker = () => JSON.parse(readFileSync(file, "utf8")).orderTitle;

describe("pilot teardown", () => {
  it("withdraws the release, archives the batch, its versions and injections, the aliquots and last the order, with a persona token", async () => {
    const fetch = stack();
    await teardown();
    expect(calls(fetch)).toEqual([
      "POST /token?grant_type=password",
      `GET /order?select=id,code&title=eq.${TITLE}&archived_at=is.null`,
      "GET /dataset?select=id&order_id=in.(order-uuid)&status=eq.released",
      "POST /rpc/withdraw_dataset",
      "GET /sample?select=id&order_id=in.(order-uuid)",
      "GET /aliquot?select=id&sample_id=in.(s1,s2,s3)",
      "GET /injection?select=batch_version_id&aliquot_id=in.(a1,a2,a3)",
      "GET /batch_version?select=batch_id&id=in.(v1)",
      "GET /batch_version?select=id,exported_at&batch_id=in.(batch-uuid)",
      "GET /injection?select=aliquot_id&batch_version_id=in.(v1)",
      "PATCH /injection?batch_version_id=in.(v1)&archived_at=is.null",
      "PATCH /batch_version?batch_id=in.(batch-uuid)&archived_at=is.null",
      "PATCH /batch?id=in.(batch-uuid)&archived_at=is.null",
      "PATCH /aliquot?id=in.(a1,a2,a3)&archived_at=is.null",
      "PATCH /order?id=in.(order-uuid)&archived_at=is.null",
    ]);
    expect(JSON.parse(String(fetch.mock.calls[3][1]!.body))).toEqual({ p_dataset_id: "dataset-uuid", p_reason: REASON });
    for (const [, init] of fetch.mock.calls.slice(1)) {
      expect(init?.headers).toMatchObject({ apikey: "anon", Authorization: "Bearer steph-token", "Content-Profile": "admin", Prefer: "return=representation" });
    }
    for (const [, init] of fetch.mock.calls.filter(([, init]) => init?.method === "PATCH")) {
      expect(JSON.parse(String(init!.body))).toEqual({ archived_at: expect.any(String), archived_reason: REASON });
    }
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(credentials);
  });

  it("archives only the order of a run that stopped before the batch, using the configured direct URLs", async () => {
    vi.stubEnv("ADMIN_E2E_AUTH_URL", "https://auth.example.test/");
    vi.stubEnv("ADMIN_E2E_REST_URL", "https://rest.example.test/");
    const fetch = stack({ "GET /rest/v1/dataset": [], "GET /rest/v1/sample": [] });
    await teardown();
    expect(String(fetch.mock.calls[0][0])).toBe("https://auth.example.test/token?grant_type=password");
    expect(fetch.mock.calls.slice(1).map(([url]) => new URL(String(url)).pathname)).toEqual(["/order", "/dataset", "/sample", "/order"]);
    expect(marker()).toBeUndefined();
  });

  it("leaves the injections of an exported version to the version's archive (they are frozen)", async () => {
    const fetch = stack({ "GET /rest/v1/batch_version": (url: URL) => json(url.searchParams.has("id") ? [{ batch_id: "batch-uuid" }] : [{ id: "v1", exported_at: "2026-11-10" }]) });
    await teardown();
    expect(calls(fetch).filter(call => call.startsWith("PATCH"))).toEqual([
      "PATCH /batch_version?batch_id=in.(batch-uuid)&archived_at=is.null",
      "PATCH /batch?id=in.(batch-uuid)&archived_at=is.null",
      "PATCH /aliquot?id=in.(a1,a2,a3)&archived_at=is.null",
      "PATCH /order?id=in.(order-uuid)&archived_at=is.null",
    ]);
  });

  it("finds a batch whose injections an earlier attempt archived (the lookups do not filter on archived_at)", async () => {
    const fetch = stack();
    await teardown();
    const lookups = calls(fetch).filter(call => /^GET \/(sample|aliquot|injection|batch_version)/.test(call));
    expect(lookups.some(call => call.includes("archived_at"))).toBe(false);
  });

  it("clears the marker when the run created no order (it stopped before New order)", async () => {
    const fetch = stack({ "GET /rest/v1/order": [] });
    await teardown();
    expect(calls(fetch)).toHaveLength(2);
    expect(marker()).toBeUndefined();
  });

  it("keeps the starting run's title and preserves an overlapping run marker", async () => {
    writeFileSync(file, JSON.stringify({ ...credentials, orderTitle: OTHER }));
    const fetch = stack();
    await teardown();
    expect(calls(fetch)[1]).toContain(`title=eq.${TITLE}`);
    expect(marker()).toBe(OTHER);
  });

  it("still archives a run order recorded by an older seed (orderCode)", async () => {
    writeFileSync(file, JSON.stringify({ ...credentials, orderCode: "ORD101" }));
    await setup();
    const fetch = stack({ "GET /rest/v1/dataset": [], "GET /rest/v1/sample": [] });
    await teardown();
    expect(calls(fetch)[1]).toBe("GET /order?select=id,code&code=eq.ORD101&archived_at=is.null");
    expect(JSON.parse(readFileSync(file, "utf8")).orderCode).toBeUndefined();
  });

  it("does nothing outside pilot mode or without a run marker", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    vi.stubEnv("ADMIN_E2E_PILOT", "");
    await teardown();
    vi.stubEnv("ADMIN_E2E_PILOT", "1");
    writeFileSync(file, JSON.stringify(credentials));
    await setup();
    await teardown();
    writeFileSync(file, JSON.stringify({ ...credentials, orderTitle: "Someone's real order" }));
    await setup();
    await teardown();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses to archive a batch shared with another order's samples, and keeps the marker", async () => {
    const fetch = stack({ "GET /rest/v1/injection": (url: URL) => json(url.searchParams.has("aliquot_id")
      ? [{ batch_version_id: "v1" }] : [{ aliquot_id: "a1" }, { aliquot_id: "foreign" }]) });
    await expect(teardown()).rejects.toThrow(/another order/);
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    expect(marker()).toBe(TITLE);
  });

  it("fails when the order archive is not confirmed and keeps the marker for retry", async () => {
    stack({ "PATCH /rest/v1/order": [] });
    await expect(teardown()).rejects.toThrow(/not confirmed/);
    expect(marker()).toBe(TITLE);
  });

  it.each(["POST /rest/v1/rpc/withdraw_dataset", "PATCH /rest/v1/batch", "PATCH /rest/v1/aliquot"])("reports a refused %s, leaves the order live and keeps the marker", async step => {
    const fetch = stack({ [step]: () => json({ message: "refused" }, 403) });
    await expect(teardown()).rejects.toThrow(/403/);
    expect(calls(fetch).some(call => call.startsWith("PATCH /order"))).toBe(false);
    expect(marker()).toBe(TITLE);
  });
});
