// Who sees Open in Nexo (docs/integration/admin-identity.md): lab staff always; client members only when
// NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1 (off in production until Nexo's own store is scoped per client). Synthetic data.
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderDetail } from "@/components/order-detail";
import { mayOpenInNexo, nexoDatasetLink } from "@/lib/release";
import type { Client, Order } from "@/lib/models";

afterEach(() => { vi.unstubAllEnvs(); });

describe("the rule", () => {
  it("lab staff may always open a dataset in Nexo, whatever the switch says", () => {
    for (const flag of [undefined, "", "0", "1"]) expect(mayOpenInNexo("staff", flag), String(flag)).toBe(true);
  });
  it("client members may only when the switch is exactly 1", () => {
    expect(mayOpenInNexo("client", "1")).toBe(true);
    expect(mayOpenInNexo("client", " 1 ")).toBe(true);
    for (const flag of [undefined, "", "0", "true", "yes", "on", "01", "11"]) expect(mayOpenInNexo("client", flag), String(flag)).toBe(false);
  });
  it("reads NEXT_PUBLIC_NEXO_CLIENT_ACCESS by default", () => {
    vi.stubEnv("NEXT_PUBLIC_NEXO_CLIENT_ACCESS", "");
    expect(mayOpenInNexo("client")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_NEXO_CLIENT_ACCESS", "1");
    expect(mayOpenInNexo("client")).toBe(true);
  });
  it("feeds nexoDatasetLink: still only a released, current dataset and only with NEXT_PUBLIC_NEXO_URL", () => {
    const current = { id: "44444444-4444-4444-8444-444444444444", status: "released" as const };
    expect(nexoDatasetLink("https://lab.example/nexo", current, mayOpenInNexo("client", "1"))).toBe(`https://lab.example/nexo/?dataset=${current.id}`);
    expect(nexoDatasetLink("https://lab.example/nexo", current, mayOpenInNexo("client", undefined))).toBeNull();
    expect(nexoDatasetLink("https://lab.example/nexo", { ...current, status: "withdrawn" }, mayOpenInNexo("client", "1"))).toBeNull();
    expect(nexoDatasetLink("", current, mayOpenInNexo("client", "1"))).toBeNull();
  });
});

describe("order detail for a client member", () => {
  const client: Client = { id: "client-cedar", name: "Cedar Lab", color: "cedar" };
  const order: Order = {
    code: "ORD045", clientId: client.id, description: "Liver study", stage: 9, sampleCount: 2, completedSamples: 2, sampleType: "Plasma", panel: "Panel A",
    due: "", received: "2026-10-02", owner: "Unassigned", released: true, releasedAt: "2026-10-21T20:20:00Z", currentDatasetId: "44444444-4444-4444-8444-444444444444",
    gates: [{ label: "Dataset v1 built", status: "ok" }, { label: "Released", status: "ok" }],
    history: [{ date: "2026-10-21T20:20:00Z", title: "Dataset v1 released", actor: "Lab" }],
  };
  const withdrawn: Order = { ...order, retired: { version: 1, status: "withdrawn", reason: "wrong sample metadata", at: "2026-11-02T10:00:00Z" } };
  const link = () => screen.queryByRole("link", { name: "Open in Nexo" });

  it("shows Open in Nexo on the current release when NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1, without the staff-only actions", () => {
    vi.stubEnv("NEXT_PUBLIC_NEXO_URL", "https://lab.example/nexo/");
    vi.stubEnv("NEXT_PUBLIC_NEXO_CLIENT_ACCESS", "1");
    render(<OrderDetail order={order} client={client} audience="client" example={false} />);
    expect(link()).toHaveAttribute("href", "https://lab.example/nexo/?dataset=44444444-4444-4444-8444-444444444444");
    expect(screen.queryByRole("link", { name: "View datasets" })).toBeNull();
  });
  it("shows nothing with the switch unset or not 1", () => {
    vi.stubEnv("NEXT_PUBLIC_NEXO_URL", "https://lab.example/nexo/");
    for (const flag of ["", "0", "true"]) {
      vi.stubEnv("NEXT_PUBLIC_NEXO_CLIENT_ACCESS", flag);
      const { unmount } = render(<OrderDetail order={order} client={client} audience="client" example={false} />);
      expect(link(), flag).toBeNull();
      unmount();
    }
  });
  it("shows nothing on a withdrawn release or without NEXT_PUBLIC_NEXO_URL, even with the switch on", () => {
    vi.stubEnv("NEXT_PUBLIC_NEXO_CLIENT_ACCESS", "1");
    vi.stubEnv("NEXT_PUBLIC_NEXO_URL", "https://lab.example/nexo/");
    const { unmount } = render(<OrderDetail order={withdrawn} client={client} audience="client" example={false} />);
    expect(link()).toBeNull();
    unmount();
    vi.stubEnv("NEXT_PUBLIC_NEXO_URL", "");
    render(<OrderDetail order={order} client={client} audience="client" example={false} />);
    expect(link()).toBeNull();
  });
  it("lab staff keep their link with the switch off", () => {
    vi.stubEnv("NEXT_PUBLIC_NEXO_URL", "https://lab.example/nexo/");
    vi.stubEnv("NEXT_PUBLIC_NEXO_CLIENT_ACCESS", "");
    render(<OrderDetail order={order} client={client} audience="staff" example={false} />);
    expect(link()).toHaveAttribute("href", "https://lab.example/nexo/?dataset=44444444-4444-4444-8444-444444444444");
  });
});
