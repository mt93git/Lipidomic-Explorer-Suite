// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import teardown from "../e2e/live/teardown.mjs";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function seedFile(content: Record<string, unknown>) {
  const file = join(mkdtempSync(join(tmpdir(), "live-teardown-")), ".seed.local.json");
  writeFileSync(file, JSON.stringify(content));
  return file;
}
function liveEnv(file: string) {
  for (const [name, value] of Object.entries({
    ADMIN_E2E_LIVE: "1", ADMIN_E2E_SEED_FILE: file, NEXT_PUBLIC_SUPABASE_URL: "https://staging.example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    ADMIN_E2E_OPERATOR_EMAIL: "operator@e2e.test", ADMIN_E2E_OPERATOR_PASSWORD: "synthetic", ADMIN_E2E_AUTH_URL: "", ADMIN_E2E_REST_URL: "",
  })) vi.stubEnv(name, value);
}
afterEach(() => vi.unstubAllEnvs());

describe("live E2E teardown", () => {
  it("does nothing outside a live run", async () => {
    vi.stubEnv("ADMIN_E2E_LIVE", "");
    const fetch = vi.spyOn(globalThis, "fetch");
    await teardown();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("archives the run's two orders with the operator's own token, then drops them from the seed file", async () => {
    const file = seedFile({ orderCode: "ORD101", ownOrderCode: "ORD102", totpSecret: "S" });
    liveEnv(file);
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ access_token: "operator-token" }))
      .mockResolvedValueOnce(json([{ code: "ORD101" }, { code: "ORD102" }]));
    await teardown();
    expect(fetch.mock.calls[0][0]).toBe("https://staging.example.test/auth/v1/token?grant_type=password");
    const [url, init] = fetch.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://staging.example.test/rest/v1/order?code=in.(ORD101,ORD102)&archived_at=is.null");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer operator-token");
    expect((init.headers as Record<string, string>)["Content-Profile"]).toBe("admin");
    expect(JSON.parse(String(init.body))).toMatchObject({ archived_reason: "E2E live run finished", archived_at: expect.any(String) });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ totpSecret: "S" });
  });

  it("fails loudly and keeps the seed file when the archive is refused", async () => {
    const file = seedFile({ orderCode: "ORD101", ownOrderCode: "ORD102" });
    liveEnv(file);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ access_token: "t" })).mockResolvedValueOnce(json({ message: "permission denied" }, 403));
    await expect(teardown()).rejects.toThrow(/403/);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ orderCode: "ORD101", ownOrderCode: "ORD102" });
  });
});
