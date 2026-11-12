import { describe, expect, it, vi } from "vitest";
import { CHECK_EVERY_MS, FIRST_CHECK_MS, deployedCommit, readDeployStatus, updateNoticeConfig, updateToAnnounce } from "@/lib/update-notice";

// Synthetic commits only.
const BUILT = "a".repeat(40);
const NEWER = "b".repeat(40);
const LATER = "c".repeat(40);

describe("update notice config", () => {
  it("is on only when both the build commit and the status path are set", () => {
    expect(updateNoticeConfig({ NEXT_PUBLIC_BUILD_COMMIT: BUILT, NEXT_PUBLIC_DEPLOY_STATUS_PATH: "/nexo-example/deploy-status.json" }))
      .toEqual({ buildCommit: BUILT, statusPath: "/nexo-example/deploy-status.json" });
  });

  it("is off when either value is empty, blank or unset", () => {
    expect(updateNoticeConfig({})).toBeNull();
    expect(updateNoticeConfig({ NEXT_PUBLIC_BUILD_COMMIT: BUILT })).toBeNull();
    expect(updateNoticeConfig({ NEXT_PUBLIC_DEPLOY_STATUS_PATH: "/nexo-example/deploy-status.json" })).toBeNull();
    expect(updateNoticeConfig({ NEXT_PUBLIC_BUILD_COMMIT: "", NEXT_PUBLIC_DEPLOY_STATUS_PATH: "/x.json" })).toBeNull();
    expect(updateNoticeConfig({ NEXT_PUBLIC_BUILD_COMMIT: BUILT, NEXT_PUBLIC_DEPLOY_STATUS_PATH: "  " })).toBeNull();
  });

  it("checks after about 10 seconds, then every 2 minutes", () => {
    expect(FIRST_CHECK_MS).toBe(10_000);
    expect(CHECK_EVERY_MS).toBe(120_000);
  });
});

describe("which deployed commit to announce", () => {
  it("announces a deployed commit that differs from the build", () => {
    expect(updateToAnnounce(BUILT, { state: "deployed", commit: NEWER }, null)).toBe(NEWER);
  });

  it("says nothing when the deployed commit is this build", () => {
    expect(updateToAnnounce(BUILT, { state: "deployed", commit: BUILT }, null)).toBeNull();
  });

  it("only counts the deployed state", () => {
    for (const state of ["deploying", "failed", "rolled-back", "", undefined]) {
      expect(updateToAnnounce(BUILT, { state, commit: NEWER }, null)).toBeNull();
    }
  });

  it("ignores a status that is not an object or has no usable commit", () => {
    for (const status of [null, undefined, "deployed", 42, [], { state: "deployed" }, { state: "deployed", commit: "" }, { state: "deployed", commit: 7 }]) {
      expect(updateToAnnounce(BUILT, status, null)).toBeNull();
    }
  });

  it("stays quiet for the dismissed commit only", () => {
    expect(updateToAnnounce(BUILT, { state: "deployed", commit: NEWER }, NEWER)).toBeNull();
    expect(updateToAnnounce(BUILT, { state: "deployed", commit: LATER }, NEWER)).toBe(LATER);
  });
});

describe("the deployed commit in a status", () => {
  it("is the commit of a deployed status, else null", () => {
    expect(deployedCommit({ state: "deployed", commit: NEWER, finished: "2026-01-01T00:00:00Z" })).toBe(NEWER);
    expect(deployedCommit({ state: "deployed", commit: BUILT })).toBe(BUILT);
    for (const status of [null, "x", { state: "deploying", commit: NEWER }, { state: "deployed" }, { state: "deployed", commit: "" }]) {
      expect(deployedCommit(status)).toBeNull();
    }
  });
});

describe("reading the deploy status", () => {
  const ok = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "application/json" } });

  it("fetches the same-origin path without the cache and returns the JSON", async () => {
    const fetcher = vi.fn(async () => ok(JSON.stringify({ state: "deployed", commit: NEWER })));
    await expect(readDeployStatus("/nexo-example/deploy-status.json", fetcher)).resolves.toEqual({ state: "deployed", commit: NEWER });
    expect(fetcher).toHaveBeenCalledWith("/nexo-example/deploy-status.json", { cache: "no-store" });
  });

  it("returns nothing for a non-200, bad JSON or a network error", async () => {
    await expect(readDeployStatus("/s.json", async () => ok("{}", 404))).resolves.toBeNull();
    await expect(readDeployStatus("/s.json", async () => ok("{}", 204))).resolves.toBeNull();
    await expect(readDeployStatus("/s.json", async () => ok("<html>not json"))).resolves.toBeNull();
    await expect(readDeployStatus("/s.json", async () => { throw new TypeError("network down"); })).resolves.toBeNull();
  });
});
