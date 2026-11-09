import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderDetail } from "@/components/order-detail";
import type { Client, Order } from "@/lib/models";

const client: Client = { id: "client-cedar", name: "Cedar Lab", color: "cedar" };
const base: Order = {
  code: "ORD045", clientId: client.id, description: "Liver study", stage: 9, sampleCount: 2, completedSamples: 2, sampleType: "Plasma", panel: "Panel A",
  due: "", received: "2026-10-02", owner: "Unassigned", released: true, releasedAt: "2026-10-21T20:20:00Z",
  gates: [{ label: "Dataset v1 built", status: "ok" }, { label: "Released", status: "ok" }],
  history: [{ date: "2026-10-21T20:20:00Z", title: "Dataset v1 released", actor: "Lab" }],
};
const withdrawn: Order = {
  ...base, releasedAt: undefined, retired: { version: 1, status: "withdrawn", reason: "wrong sample metadata", at: "2026-11-02T10:00:00Z" },
  gates: [{ label: "Dataset v1 built", status: "ok" }, { label: "Dataset v1 withdrawn · wrong sample metadata", status: "fail" }],
  history: [{ date: "2026-11-02T10:00:00Z", title: "Dataset v1 withdrawn · wrong sample metadata", actor: "Lab" }, ...base.history],
};

describe("order detail: a current release and a release that was withdrawn (finding 2)", () => {
  it("shows a current release as complete", () => {
    render(<OrderDetail order={base} client={client} audience="client" example={false} />);
    expect(screen.getByRole("heading", { level: 2, name: "Release complete" })).toBeVisible();
    expect(screen.queryByText(/withdrawn/i)).toBeNull();
  });
  for (const audience of ["client", "staff"] as const) {
    it(`tells the ${audience} view that the released version was withdrawn, why and when, and that no version is available`, () => {
      render(<OrderDetail order={withdrawn} client={client} audience={audience} example={false} />);
      expect(screen.queryByRole("heading", { name: "Release complete" })).toBeNull();
      expect(screen.getByRole("heading", { level: 2, name: "Released, then withdrawn" })).toBeVisible();
      expect(screen.getByText("Withdrawn", { selector: ".pill" })).toBeVisible();
      expect(screen.getByText(/Dataset v1 was withdrawn on Nov 2, 2026: wrong sample metadata\. No version of this order is available now\./)).toBeVisible();
      expect(screen.queryByText(/two distinct reviewer signatures/)).toBeNull();
      expect(screen.getAllByText("Dataset v1 withdrawn · wrong sample metadata").length).toBeGreaterThan(0);
    });
  }
});

describe("order detail: Open in Nexo on the current released version (lab staff only)", () => {
  const current: Order = { ...base, currentDatasetId: "33333333-3333-4333-8333-333333333333" };
  afterEach(() => { vi.unstubAllEnvs(); });

  it("shows lab staff a link to <NEXT_PUBLIC_NEXO_URL>/?dataset=<id>", () => {
    vi.stubEnv("NEXT_PUBLIC_NEXO_URL", "https://lab.example/nexo/");
    render(<OrderDetail order={current} client={client} audience="staff" example={false} />);
    expect(screen.getByRole("link", { name: "Open in Nexo" })).toHaveAttribute("href", "https://lab.example/nexo/?dataset=33333333-3333-4333-8333-333333333333");
  });
  it("shows no link to a client user, on a withdrawn release, or without the setting", () => {
    vi.stubEnv("NEXT_PUBLIC_NEXO_URL", "https://lab.example/nexo/");
    const { unmount } = render(<OrderDetail order={current} client={client} audience="client" example={false} />);
    expect(screen.queryByRole("link", { name: "Open in Nexo" })).toBeNull();
    unmount();
    const second = render(<OrderDetail order={withdrawn} client={client} audience="staff" example={false} />);
    expect(screen.queryByRole("link", { name: "Open in Nexo" })).toBeNull();
    second.unmount();
    vi.stubEnv("NEXT_PUBLIC_NEXO_URL", "");
    render(<OrderDetail order={current} client={client} audience="staff" example={false} />);
    expect(screen.queryByRole("link", { name: "Open in Nexo" })).toBeNull();
  });
});
