import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReleasePage from "@/app/(workspace)/release/page";
import { listReleaseOrders, type ReleaseOrder } from "@/lib/data/release";
import { demoSession } from "@/lib/demo";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => demoSession) }));
vi.mock("@/lib/data/release", () => ({ listReleaseOrders: vi.fn() }));
vi.mock("@/app/(workspace)/release/actions", () => ({ buildDatasetAction: vi.fn() }));

const order = (code: string, stage: number, versions: ReleaseOrder["versions"], releasedAt: string | null = null): ReleaseOrder =>
  ({ id: code, code, clientId: "example-atlas", clientName: "Example Atlas", title: `${code} synthetic order`, stage, resultFileId: code, acceptedAt: "2026-11-09T16:57:00Z", releasedAt, versions });
const built = { id: "d-048", version: 1, status: "built" as const, signatures: 1, releasedAt: null, projectId: null };
const released = { id: "d-040", version: 1, status: "released" as const, signatures: 2, releasedAt: "2026-11-05T15:00:00Z", projectId: "p-040" };
const rows = () => within(screen.getByRole("table", { name: "Orders with an accepted results file" })).getAllByRole("row").slice(1);
const row = (code: string) => rows().find(r => r.textContent?.includes(code)) as HTMLElement;

// ORD039 was released before Admin recorded versions (the demo's earlier orders): released by the order, no version.
beforeEach(() => vi.mocked(listReleaseOrders).mockResolvedValue([order("ORD039", 9, [], "2026-11-06T16:05:00Z"), order("ORD040", 9, [released], "2026-11-05T15:00:00Z"), order("ORD041", 7, []), order("ORD048", 7, [built]), order("ORD049", 8, [])]));

describe("release list", () => {
  it("orders the rows: versions in progress, then build candidates, then released", async () => {
    render(await ReleasePage());
    expect(rows().map(r => r.querySelector(".order-code")?.textContent)).toEqual(["ORD048", "ORD041", "ORD049", "ORD039", "ORD040"]);
  });
  it("shows the primary button only where the next step is building; in-progress versions link to their page", async () => {
    render(await ReleasePage());
    const build = within(row("ORD041")).getByRole("button", { name: "Build dataset v1" });
    expect(build).toHaveClass("button");
    expect(build).not.toHaveClass("secondary");
    expect(within(row("ORD049")).getByRole("button", { name: "Build dataset v1" })).not.toHaveClass("secondary");
    const open = within(row("ORD048")).getByRole("link", { name: "Open v1 →" });
    expect(open).toHaveAttribute("href", "/release/d-048");
    expect(open).toHaveClass("button", "secondary");
    expect(within(row("ORD048")).queryByRole("button")).not.toBeInTheDocument();
    expect(row("ORD048")).toHaveTextContent("v1 built · 1 signature");
  });
  it("marks released rows with a Released pill and date, and offers a secondary Build v2", async () => {
    render(await ReleasePage());
    const pill = row("ORD040").querySelector("[data-status='released']");
    expect(pill).toHaveTextContent("Released");
    expect(row("ORD040")).toHaveTextContent(/Nov 5/);
    expect(within(row("ORD040")).getByRole("button", { name: "Build v2" })).toHaveClass("secondary");
    expect(row("ORD041").querySelector("[data-status]")).toHaveTextContent("08 · Processed");
    expect(row("ORD039").querySelector("[data-status='released']")).toHaveTextContent(/Released · Nov 6/);
    expect(within(row("ORD039")).getByRole("button", { name: "Build v1" })).toHaveClass("secondary");
  });
  it("omits the Built versions panel when nothing is waiting", async () => {
    render(await ReleasePage());
    expect(screen.getByRole("heading", { name: /Built versions/ })).toBeVisible();
    vi.mocked(listReleaseOrders).mockResolvedValue([order("ORD041", 7, [])]);
    document.body.innerHTML = "";
    render(await ReleasePage());
    expect(screen.queryByRole("heading", { name: /Built versions/ })).not.toBeInTheDocument();
  });
});
