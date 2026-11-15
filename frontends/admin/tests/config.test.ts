import { describe, expect, it } from "vitest";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import config from "../next.config";
import { getEnvironment } from "@/lib/environment";

describe("app configuration", () => {
  it("lives under /admin", () => expect(config(PHASE_PRODUCTION_BUILD).basePath).toBe("/admin"));
  it("defaults to example mode without both Supabase settings", () => {
    expect(getEnvironment({}).mock).toBe(true);
    expect(getEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" }).mock).toBe(true);
  });
  it("allows an explicit demo even with configured Supabase", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-example", ADMIN_MOCK: "1" };
    expect(getEnvironment(env).mock).toBe(true);
    expect(getEnvironment({ ...env, ADMIN_MOCK: "0" }).mock).toBe(false);
  });
});
