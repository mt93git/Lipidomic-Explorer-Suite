// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as nextStaticInfo from "next/dist/build/analysis/get-page-static-info";
import { config } from "@/proxy";

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
    // The deliverable upload route only (its body must not be buffered); the order page and downloads still pass.
    expect(matches("/admin/orders/ORD041/deliverables")).toBe(false);
    expect(matches("/admin/orders/ORD041")).toBe(true);
    expect(matches("/admin/orders/ORD041/deliverables-x")).toBe(true);
    expect(matches("/admin/deliverables/0b4c9b38-0000-4000-8000-000000000001")).toBe(true);
  });
});
