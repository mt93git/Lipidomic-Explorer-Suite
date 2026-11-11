// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newRunId, RUN_ID, runNames, SHIPPING_TEXT } from "../e2e/live/journey-run.mjs";
import setup from "../e2e/live/journey-setup.mjs";
import teardown from "../e2e/live/journey-teardown.mjs";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const RUN = "20261110-2244-3fa9";
const REASON = "E2E golden journey finished";
let dir: string;
let file: string;
const persona = (name: string) => ({ email: `${name}@example.test`, password: "synthetic", name, userId: `${name}-id` });
const base = { steph: persona("steph"), paula: persona("paula"), clientName: runNames(RUN).clientName };
const write = (extra: Record<string, unknown>) => writeFileSync(file, JSON.stringify({ ...base, ...extra }), { mode: 0o600 });
const read = () => JSON.parse(readFileSync(file, "utf8"));
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "journey-teardown-"));
  file = join(dir, "credentials.json");
  for (const [name, value] of Object.entries({ ADMIN_E2E_JOURNEY: "1", ADMIN_JOURNEY_CREDENTIALS: file, ADMIN_JOURNEY_RUN_ID: RUN,
    NEXT_PUBLIC_SUPABASE_URL: "https://staging.example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    ADMIN_E2E_AUTH_URL: "", ADMIN_E2E_REST_URL: "", SUPABASE_SERVICE_ROLE_KEY: "never-use-this" })) vi.stubEnv(name, value);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });

type Answer = unknown | ((url: URL, init: RequestInit) => Response);
// A staging stand-in answering by method and path: the run's client has one order (its batch and released v1), Dana as
// a member, Lee's invitation still pending, and the journey's release policy and shipping text in force.
function stack(overrides: Record<string, Answer> = {}) {
  const answers: Record<string, Answer> = {
    "POST /auth/v1/token": { access_token: "steph-token" },
    "GET /rest/v1/client": [{ id: "client-uuid", archived_at: null }],
    "GET /rest/v1/order": [{ id: "order-uuid", code: "ORD401" }],
    "GET /rest/v1/dataset": [{ id: "dataset-uuid" }],
    "POST /rest/v1/rpc/withdraw_dataset": null,
    "GET /rest/v1/sample": [{ id: "s1" }],
    "GET /rest/v1/aliquot": [{ id: "a1" }],
    "GET /rest/v1/injection": (url: URL) => json(url.searchParams.has("aliquot_id") ? [{ batch_version_id: "v1" }] : [{ aliquot_id: null }, { aliquot_id: "a1" }]),
    "GET /rest/v1/batch_version": (url: URL) => json(url.searchParams.has("id") ? [{ batch_id: "batch-uuid" }] : [{ id: "v1", exported_at: "2026-11-10" }]),
    "PATCH /rest/v1/batch_version": [], "PATCH /rest/v1/batch": [], "PATCH /rest/v1/aliquot": [],
    "PATCH /rest/v1/order": [{ id: "order-uuid", archived_at: "2026-11-10" }],
    "GET /rest/v1/client_member": [{ id: "m-dana" }],
    "POST /rest/v1/rpc/archive_member": null,
    "GET /rest/v1/invitation": [{ id: "i-lee" }],
    "POST /rest/v1/rpc/revoke_invitation": null,
    "POST /rest/v1/rpc/archive_client": null,
    "GET /rest/v1/shipping_instructions": [{ body: SHIPPING_TEXT }],
    "POST /rest/v1/rpc/set_shipping_instructions": null,
    "GET /rest/v1/release_policy": [{ eligible_signers: ["steph-id", "paula-id"], required_signatures: 2 }],
    "POST /rest/v1/rpc/set_release_policy": null,
    ...overrides,
  };
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
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
const body = (fetch: ReturnType<typeof stack>, path: string) => {
  const call = fetch.mock.calls.find(([url]) => new URL(String(url)).pathname.endsWith(path));
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
};

describe("journey run names", () => {
  it("makes a run id of the UTC minute and 4 hex, and names that carry it and look synthetic", () => {
    const id = newRunId(new Date("2026-11-10T22:44:59Z"));
    expect(id).toMatch(RUN_ID);
    expect(id.startsWith("20261110-2244-")).toBe(true);
    const names = runNames(id);
    expect(names.clientName).toBe(`Northwind Lipid Lab (synthetic) ${id}`);
    expect(names.dana).toEqual({ name: "Dana Reyes (simulated)", email: `dana.sim+${id}@admin-staging.test` });
    expect(names.lee).toEqual({ name: "Lee Park (simulated)", email: `lee.sim+${id}@admin-staging.test` });
  });
});

describe("journey teardown", () => {
  it("archives the order tree, the members, the pending invitations and the client, then restores the shipping text and the policy, with a persona token", async () => {
    write({ runId: RUN, previousPolicy: { eligible_signers: [], required_signatures: 3 }, previousShipping: null });
    const fetch = stack();
    await teardown();
    expect(calls(fetch)).toEqual([
      "POST /token?grant_type=password",
      `GET /client?select=id,archived_at&name=eq.${runNames(RUN).clientName}`,
      "GET /order?select=id,code&client_id=eq.client-uuid&archived_at=is.null",
      "GET /dataset?select=id&order_id=in.(order-uuid)&status=eq.released",
      "POST /rpc/withdraw_dataset",
      "GET /sample?select=id&order_id=in.(order-uuid)",
      "GET /aliquot?select=id&sample_id=in.(s1)",
      "GET /injection?select=batch_version_id&aliquot_id=in.(a1)",
      "GET /batch_version?select=batch_id&id=in.(v1)",
      "GET /batch_version?select=id,exported_at&batch_id=in.(batch-uuid)",
      "GET /injection?select=aliquot_id&batch_version_id=in.(v1)",
      "PATCH /batch_version?batch_id=in.(batch-uuid)&archived_at=is.null",
      "PATCH /batch?id=in.(batch-uuid)&archived_at=is.null",
      "PATCH /aliquot?id=in.(a1)&archived_at=is.null",
      "PATCH /order?id=in.(order-uuid)&archived_at=is.null",
      "GET /client_member?select=id&client_id=eq.client-uuid&archived_at=is.null",
      "POST /rpc/archive_member",
      "GET /invitation?select=id&client_id=eq.client-uuid&accepted_at=is.null&revoked_at=is.null",
      "POST /rpc/revoke_invitation",
      "POST /rpc/archive_client",
      "GET /shipping_instructions?select=body&archived_at=is.null",
      "POST /rpc/set_shipping_instructions",
      "GET /release_policy?select=eligible_signers,required_signatures&archived_at=is.null",
      "POST /rpc/set_release_policy",
    ]);
    expect(fetch.mock.calls.every(([, init]) => (init?.headers as Record<string, string>).apikey === "anon")).toBe(true);
    expect(fetch.mock.calls.every(([, init]) => !JSON.stringify(init?.headers).includes("never-use-this"))).toBe(true);
    expect(body(fetch, "/archive_member")).toEqual({ p_kind: "client_member", p_id: "m-dana", p_reason: REASON });
    expect(body(fetch, "/archive_client")).toEqual({ p_client_id: "client-uuid", p_reason: REASON });
    expect(body(fetch, "/set_shipping_instructions")).toEqual({ p_body: "" }); // none before: cleared
    expect(body(fetch, "/set_release_policy")).toEqual({ p_eligible_signers: [], p_required_signatures: 3 });
    expect(read().runId).toBeUndefined(); // cleanup succeeded: the marker is gone
  });

  it("leaves the lab's own shipping text and a policy someone else set meanwhile alone", async () => {
    write({ runId: RUN, previousPolicy: null, previousShipping: "The lab's own text" });
    const fetch = stack({
      "GET /rest/v1/shipping_instructions": [{ body: "The lab's own text" }],
      "GET /rest/v1/release_policy": [{ eligible_signers: ["someone-else"], required_signatures: 2 }],
      "GET /rest/v1/client_member": [], "GET /rest/v1/invitation": [],
    });
    await teardown();
    expect(calls(fetch).some(call => call.includes("set_shipping_instructions") || call.includes("set_release_policy"))).toBe(false);
    expect(read().runId).toBeUndefined();
  });

  it("skips the policy when the recorded one already matches the journey's", async () => {
    write({ runId: RUN, previousPolicy: { eligible_signers: ["paula-id", "steph-id"], required_signatures: 2 }, previousShipping: null });
    const fetch = stack({ "GET /rest/v1/shipping_instructions": [] });
    await teardown();
    expect(calls(fetch).some(call => call.includes("set_release_policy"))).toBe(false);
  });

  it("with no client lab made (the run stopped at Request access) archives nothing and clears the marker", async () => {
    write({ runId: RUN, previousPolicy: null, previousShipping: null });
    const fetch = stack({ "GET /rest/v1/client": [], "GET /rest/v1/shipping_instructions": [], "GET /rest/v1/release_policy": [] });
    await teardown();
    expect(calls(fetch).filter(call => call.startsWith("POST /rpc") || call.startsWith("PATCH"))).toEqual([]);
    expect(read().runId).toBeUndefined();
  });

  it("keeps the retry marker, and still tries every part, when one part is refused; the client is not archived over a live order", async () => {
    write({ runId: RUN, previousPolicy: null, previousShipping: null });
    const fetch = stack({ "PATCH /rest/v1/order": [] });
    await expect(teardown()).rejects.toThrow(/orders: order archive not confirmed.*client: not archived because its orders are not.*retry marker kept/);
    expect(calls(fetch)).toContain("POST /rpc/archive_member");
    expect(calls(fetch)).toContain("POST /rpc/revoke_invitation");
    expect(calls(fetch)).not.toContain("POST /rpc/archive_client");
    expect(read().runId).toBe(RUN);
  });

  it("refuses a batch that also holds another order's injections, and does nothing without a marker or outside journey mode", async () => {
    write({ runId: RUN, previousPolicy: null, previousShipping: null });
    stack({ "GET /rest/v1/injection": (url: URL) => json(url.searchParams.has("aliquot_id") ? [{ batch_version_id: "v1" }] : [{ aliquot_id: "someone-elses" }]) });
    await expect(teardown()).rejects.toThrow(/another order/);
    vi.restoreAllMocks();
    const quiet = stack();
    vi.stubEnv("ADMIN_JOURNEY_RUN_ID", "");
    await teardown();
    vi.stubEnv("ADMIN_JOURNEY_RUN_ID", RUN);
    vi.stubEnv("ADMIN_E2E_JOURNEY", "");
    await teardown();
    expect(quiet).not.toHaveBeenCalled();
  });
});

describe("journey setup", () => {
  it("captures the run id, then records the current policy and shipping text once, with Stephania's token", async () => {
    write({ runId: RUN });
    vi.stubEnv("ADMIN_JOURNEY_RUN_ID", "");
    const fetch = stack({ "GET /rest/v1/shipping_instructions": [] });
    await setup();
    expect(process.env.ADMIN_JOURNEY_RUN_ID).toBe(RUN);
    expect(calls(fetch)).toEqual(["POST /token?grant_type=password", "GET /release_policy?select=eligible_signers,required_signatures&archived_at=is.null", "GET /shipping_instructions?select=body&archived_at=is.null"]);
    expect(read()).toMatchObject({ runId: RUN, previousPolicy: { eligible_signers: ["steph-id", "paula-id"], required_signatures: 2 }, previousShipping: null });
    await setup(); // recorded already: not read again, never overwritten
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not touch the staging stack when the file names no run", async () => {
    write({});
    const fetch = stack();
    await setup();
    expect(process.env.ADMIN_JOURNEY_RUN_ID).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
