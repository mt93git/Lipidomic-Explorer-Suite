// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as nextStaticInfo from "next/dist/build/analysis/get-page-static-info";
import { config } from "@/middleware";

// Exercise the pinned Next release's real basePath compiler, including its root special case.
const { getMiddlewareMatchers } = nextStaticInfo as unknown as {
  getMiddlewareMatchers: (patterns: string[], config: { basePath: string }) => { regexp: string }[];
};

describe("session middleware routing", () => {
  it("refreshes the bare basePath and app pages while skipping static assets", () => {
    const matchers = getMiddlewareMatchers(config.matcher, { basePath: "/admin" });
    const matches = (path: string) => matchers.some(matcher => new RegExp(matcher.regexp).test(path));
    expect(matches("/admin")).toBe(true);
    expect(matches("/admin/pipeline")).toBe(true);
    expect(matches("/admin/sign-in")).toBe(true);
    expect(matches("/admin/_next/static/app.js")).toBe(false);
  });
});
