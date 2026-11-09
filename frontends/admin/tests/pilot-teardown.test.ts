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
const credentials = { steph: { email: "steph@example.test", password: "synthetic" }, paula: { email: "paula@example.test", password: "synthetic" }, clientName: "Pilot Simulation Client (synthetic)" };
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pilot-teardown-"));
  file = join(dir, "credentials.json");
  writeFileSync(file, JSON.stringify({ ...credentials, orderCode: "ORD101" }), { mode: 0o600 });
  for (const [name, value] of Object.entries({ ADMIN_E2E_PILOT: "1", ADMIN_PILOT_CREDENTIALS: file,
    NEXT_PUBLIC_SUPABASE_URL: "https://staging.example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    ADMIN_E2E_AUTH_URL: "", ADMIN_E2E_REST_URL: "", ADMIN_PILOT_RUN_ORDER_CODE: "", SUPABASE_SERVICE_ROLE_KEY: "never-use-this" })) vi.stubEnv(name, value);
  await setup();
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });

describe("pilot teardown", () => {
  it("keeps the starting order and preserves an overlapping run marker", async () => {
    writeFileSync(file, JSON.stringify({ ...credentials, orderCode: "ORD202" }));
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ access_token: "t" }))
      .mockResolvedValueOnce(json([{ id: "order-uuid" }])).mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([{ id: "order-uuid", archived_at: "2026-11-09" }]));
    await teardown();
    expect(String(fetch.mock.calls[1][0])).toContain("code=eq.ORD101");
    expect(JSON.parse(readFileSync(file, "utf8")).orderCode).toBe("ORD202");
  });
  it("does nothing outside pilot mode or without a run's order", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    vi.stubEnv("ADMIN_E2E_PILOT", "");
    await teardown();
    vi.stubEnv("ADMIN_E2E_PILOT", "1");
    writeFileSync(file, JSON.stringify(credentials));
    await setup();
    await teardown();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("withdraws the run's released dataset before archiving its order, with a persona token", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ access_token: "steph-token" }))
      .mockResolvedValueOnce(json([{ id: "order-uuid" }]))
      .mockResolvedValueOnce(json([{ id: "dataset-uuid" }]))
      .mockResolvedValueOnce(json(null))
      .mockResolvedValueOnce(json([{ id: "order-uuid", archived_at: "2026-11-09" }]));
    await teardown();
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://staging.example.test/auth/v1/token?grant_type=password",
      "https://staging.example.test/rest/v1/order?select=id&code=eq.ORD101&archived_at=is.null",
      "https://staging.example.test/rest/v1/dataset?select=id&order_id=eq.order-uuid&status=eq.released",
      "https://staging.example.test/rest/v1/rpc/withdraw_dataset",
      "https://staging.example.test/rest/v1/order?id=eq.order-uuid&archived_at=is.null",
    ]);
    const withdraw = fetch.mock.calls[3][1]!;
    expect(withdraw.method).toBe("POST");
    expect(JSON.parse(String(withdraw.body))).toEqual({ p_dataset_id: "dataset-uuid", p_reason: "E2E pilot run finished" });
    for (const [, init] of fetch.mock.calls.slice(1)) {
      expect(init?.headers).toMatchObject({ apikey: "anon", Authorization: "Bearer steph-token", "Content-Profile": "admin" });

    }
    expect(fetch.mock.calls[4][1]?.method).toBe("PATCH");
    expect(fetch.mock.calls[4][1]?.headers).toMatchObject({ Prefer: "return=representation" });
    expect(JSON.parse(String(fetch.mock.calls[4][1]?.body))).toEqual({ archived_at: expect.any(String), archived_reason: "E2E pilot run finished" });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(credentials);
  });
  it("archives a failed run that did not release a dataset, using the configured direct URLs", async () => {
    vi.stubEnv("ADMIN_E2E_AUTH_URL", "https://auth.example.test/");
    vi.stubEnv("ADMIN_E2E_REST_URL", "https://rest.example.test/");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ access_token: "t" }))
      .mockResolvedValueOnce(json([{ id: "order-uuid" }])).mockResolvedValueOnce(json([])).mockResolvedValueOnce(json([{ id: "order-uuid", archived_at: "2026-11-09" }]));
    await teardown();
    expect(fetch.mock.calls).toHaveLength(4);
    expect(fetch.mock.calls[0][0]).toBe("https://auth.example.test/token?grant_type=password");
    expect(fetch.mock.calls[3][0]).toBe("https://rest.example.test/order?id=eq.order-uuid&archived_at=is.null");
  });
  it.each(["selection", "archive result"])("fails on empty %s and retains the retry marker", async step => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ access_token: "t" }))
      .mockResolvedValueOnce(json(step === "selection" ? [] : [{ id: "order-uuid" }]))
      .mockResolvedValueOnce(json([])).mockResolvedValueOnce(json([]));
    await expect(teardown()).rejects.toThrow(/not confirmed/);
    expect(JSON.parse(readFileSync(file, "utf8")).orderCode).toBe("ORD101");
  });
  it.each(["withdraw", "archive"])("reports a refused %s and keeps the run code for retry", async step => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ access_token: "t" }))
      .mockResolvedValueOnce(json([{ id: "order-uuid" }])).mockResolvedValueOnce(json(step === "withdraw" ? [{ id: "dataset-uuid" }] : []))
      .mockResolvedValue(json({}, 403));
    await expect(teardown()).rejects.toThrow(/403/);
    expect(JSON.parse(readFileSync(file, "utf8")).orderCode).toBe("ORD101");
    if (step === "withdraw") expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });
});
