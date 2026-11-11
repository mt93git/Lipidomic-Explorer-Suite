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
    const config = await load({ ADMIN_E2E_LIVE: undefined, ADMIN_E2E_PILOT: undefined, ADMIN_E2E_IDENTITY: undefined, ADMIN_E2E_JOURNEY: undefined });
    expect(config.use?.baseURL).toBe("http://127.0.0.1:3110/admin");
    expect(config.projects?.[0].use?.video).toBeUndefined();
    expect(config.webServer).toMatchObject({ command: "npm run dev -- --port 3110" });
    expect(config.testMatch).toBeUndefined();
    expect(config.globalTeardown).toBeUndefined();
  });

  it("in a live staging run archives the orders the live seed created, after the run, even a failed one", async () => {
    const config = await load({ ADMIN_E2E_LIVE: "1", ADMIN_E2E_PILOT: undefined, ADMIN_E2E_IDENTITY: undefined });
    expect(config.globalTeardown).toBe("./e2e/live/teardown.mjs");
  });

  it("in pilot mode runs only the pilot spec against the given origin, with no dev server", async () => {
    const config = await load({ ADMIN_E2E_PILOT: "1", ADMIN_E2E_IDENTITY: undefined, ADMIN_E2E_JOURNEY: undefined, ADMIN_PILOT_BASE_URL: "https://staging.example.test" });
    expect(config.webServer).toBeUndefined();
    expect(config.use?.baseURL).toBe("https://staging.example.test");
    expect(config.testMatch).toBe("live/pilot.spec.ts");
    expect(config.globalTeardown).toBe("./e2e/live/pilot-teardown.mjs");
  });

  it("in identity mode runs only the identity spec against the given origin, with no dev server", async () => {
    const config = await load({ ADMIN_E2E_PILOT: undefined, ADMIN_E2E_IDENTITY: "1", ADMIN_PILOT_BASE_URL: "https://staging.example.test" });
    expect(config.webServer).toBeUndefined();
    expect(config.use?.baseURL).toBe("https://staging.example.test");
    expect(config.testMatch).toBe("live/identity.spec.ts");
  });

  it("in journey mode runs only the journey spec against the given origin, with no dev server, at 1440x900 with video", async () => {
    const config = await load({ ADMIN_E2E_JOURNEY: "1", ADMIN_E2E_PILOT: undefined, ADMIN_E2E_IDENTITY: undefined, ADMIN_PILOT_BASE_URL: "https://staging.example.test" });
    expect(config.webServer).toBeUndefined();
    expect(config.use?.baseURL).toBe("https://staging.example.test");
    expect(config.testMatch).toBe("live/journey.spec.ts");
    expect(config.globalSetup).toBe("./e2e/live/journey-setup.mjs");
    expect(config.globalTeardown).toBe("./e2e/live/journey-teardown.mjs");
    expect(config.workers).toBe(1);
    expect(config.projects?.[0].use).toMatchObject({ video: "on", viewport: { width: 1440, height: 900 } });
  });

  it("keeps the pilot and identity modes as they were when the journey flag is also set", async () => {
    const config = await load({ ADMIN_E2E_JOURNEY: "1", ADMIN_E2E_PILOT: "1", ADMIN_E2E_IDENTITY: undefined, ADMIN_PILOT_BASE_URL: "https://staging.example.test" });
    expect(config.testMatch).toBe("live/pilot.spec.ts");
    expect(config.globalTeardown).toBe("./e2e/live/pilot-teardown.mjs");
    expect(config.projects?.[0].use?.video).toBeUndefined();
  });
});
