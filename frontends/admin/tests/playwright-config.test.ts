// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// playwright.config.ts reads the environment when it is loaded: load it fresh for each case.
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return (await import("../playwright.config")).default;
}
afterEach(() => vi.unstubAllEnvs());

describe("Playwright configuration", () => {
  it("runs the demo suite against its own dev server by default", async () => {
    const config = await load({ ADMIN_E2E_PILOT: undefined, ADMIN_E2E_IDENTITY: undefined });
    expect(config.use?.baseURL).toBe("http://127.0.0.1:3110/admin");
    expect(config.webServer).toMatchObject({ command: "npm run dev -- --port 3110" });
    expect(config.testMatch).toBeUndefined();
  });

  it("in pilot mode runs only the pilot spec against the given origin, with no dev server", async () => {
    const config = await load({ ADMIN_E2E_PILOT: "1", ADMIN_E2E_IDENTITY: undefined, ADMIN_PILOT_BASE_URL: "https://staging.example.test" });
    expect(config.webServer).toBeUndefined();
    expect(config.use?.baseURL).toBe("https://staging.example.test");
    expect(config.testMatch).toBe("live/pilot.spec.ts");
  });

  it("in identity mode runs only the identity spec against the given origin, with no dev server", async () => {
    const config = await load({ ADMIN_E2E_PILOT: undefined, ADMIN_E2E_IDENTITY: "1", ADMIN_PILOT_BASE_URL: "https://staging.example.test" });
    expect(config.webServer).toBeUndefined();
    expect(config.use?.baseURL).toBe("https://staging.example.test");
    expect(config.testMatch).toBe("live/identity.spec.ts");
  });
});
