import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReleasePolicyPage from "@/app/(workspace)/release-policy/page";
import { demoSession } from "@/lib/demo";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => demoSession) }));
vi.mock("@/app/(workspace)/release-policy/actions", () => ({ setReleasePolicyAction: vi.fn() }));
vi.mock("@/lib/data/release", () => ({ getReleasePolicy: vi.fn(async () => ({
  policy: { eligibleSigners: ["u-a", "u-b"], requiredSignatures: 2, setBy: "u-owner", setAt: "2026-11-09T16:00:00Z" },
  staff: [{ userId: "u-owner", name: "Demo Lab Owner", role: "owner" }, { userId: "u-a", name: "Demo Reviewer A", role: "admin" }, { userId: "u-b", name: "Demo Reviewer B", role: "admin" }],
  me: null, canEdit: false, demoActors: null,
})) }));

describe("release policy page", () => {
  it("confirms a save as a success with the way on to Release", async () => {
    render(await ReleasePolicyPage({ searchParams: Promise.resolve({ saved: "1" }) }));
    const banner = screen.getByRole("status");
    expect(banner).toHaveClass("notice", "success");
    expect(banner.querySelector("strong")).toHaveTextContent("Release policy saved.");
    expect(within(banner).getByRole("link", { name: /Release/ })).toHaveClass("button");
    expect(within(banner).getByRole("link", { name: /Release/ })).toHaveAttribute("href", "/release");
  });
  it("shows no banner without a save", async () => {
    render(await ReleasePolicyPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
