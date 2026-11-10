// The client portal's six steps (docs/admin/client-zone-proposal/proposal.html, section 6) and the client order view.
// Synthetic data only.
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientDay, clientStep, clientSteps, homeCounts, reachedOn, type ClientOrder, type DbStage } from "@/lib/client-portal";
import { clientOrderFromRow, type ClientOrderRow } from "@/lib/data/client-orders";
import { ClientOrderDetail } from "@/components/client-order-detail";
import { dbStages } from "@/lib/samples";

vi.mock("server-only", () => ({}));
afterEach(() => { vi.unstubAllEnvs(); });

describe("internal stage → client step", () => {
  it("maps every one of the eleven stages exactly as the proposal's table", () => {
    const expected: Record<DbStage, number> = {
      request: 2, received: 3, registered: 3, extracted: 4, in_batch: 4, sequence_exported: 4, acquired: 4,
      processed: 5, qc_checked: 5, excel_built: 5, released: 6,
    };
    expect(dbStages).toHaveLength(11);
    for (const stage of dbStages) expect(clientStep(stage), stage).toBe(expected[stage]);
  });
  it("puts a request still waiting for the lab's answer at step 1, an accepted one at step 2", () => {
    expect(clientStep("request", "pending")).toBe(1);
    expect(clientStep("request", "accepted")).toBe(2);
    expect(clientStep("request")).toBe(2);
    expect(clientStep("received", "pending")).toBe(3);
  });
  it("refuses a stage it does not know", () => {
    expect(() => clientStep("frozen" as DbStage)).toThrow(/Unknown order stage/);
  });
});

const order = (over: Partial<ClientOrder> = {}): ClientOrder => ({
  code: "ORD044", clientId: "client-cedar", title: "Example extraction series", stage: "extracted", review: "accepted", acceptedAt: "2026-10-28T14:00:00Z", declineReason: null,
  panel: "Panel A · broad lipidome", matrix: "Plasma", billingRef: "PO-EXAMPLE-0044", expectedSamples: 32, registeredSamples: 32,
  requestedAt: "2026-10-28T14:00:00Z", receivedAt: "2026-11-02T15:41:00Z", release: null, ...over,
});

describe("the six steps with their dates", () => {
  it("dates only requested, accepted, received and released; nothing between received and released", () => {
    const steps = clientSteps(order());
    expect(steps.map(step => [step.label, step.state, step.date])).toEqual([
      ["Requested", "done", "2026-10-28T14:00:00Z"],
      ["Accepted", "done", "2026-10-28T14:00:00Z"],
      ["Samples received", "done", "2026-11-02T15:41:00Z"],
      ["In analysis", "current", null],
      ["Quality review", "upcoming", null],
      ["Released", "upcoming", null],
    ]);
  });
  it("marks every step done once released, with the release date", () => {
    const steps = clientSteps(order({ stage: "released", release: { version: 1, releasedAt: "2026-11-05T21:20:00Z", datasetId: "d1" } }));
    expect(steps.every(step => step.state === "done")).toBe(true);
    expect(steps[5].date).toBe("2026-11-05T21:20:00Z");
  });
  it("tells Client home the step reached and its date", () => {
    expect(reachedOn(order({ stage: "request", receivedAt: null }))).toEqual({ word: "accepted", date: "2026-10-28T14:00:00Z" });
    expect(reachedOn(order({ stage: "qc_checked" }))).toEqual({ word: "received", date: "2026-11-02T15:41:00Z" });
    expect(reachedOn(order({ stage: "released", release: { version: 2, releasedAt: "2026-11-05T21:20:00Z", datasetId: "d1" } }))?.word).toBe("released");
  });
  it("counts the four tiles", () => {
    const stages: DbStage[] = ["request", "received", "acquired", "excel_built", "released"];
    expect(homeCounts(stages.map(stage => order({ stage })))).toEqual({ waitingForLab: 0, waitingForSamples: 1, withLab: 3, released: 1 });
  });
  it("formats days in the lab's zone, and a plain lab day as written", () => {
    expect(clientDay("2026-11-02T03:00:00Z")).toBe("Nov 1");
    expect(clientDay("2026-11-02")).toBe("Nov 2");
    expect(clientDay("2026-11-05T21:20:00Z", true)).toBe("Nov 5, 2026");
    expect(clientDay(null)).toBe("");
  });
});

describe("a live row as a client order", () => {
  const row: ClientOrderRow = {
    code: "ORD040", title: "Released example dataset", stage: "released", matrix: "Plasma", expected_samples: 12, billing_ref: null,
    client_id: "client-cedar", created_at: "2026-10-08T13:00:00Z", panel: [{ name: "Panel A" }],
    sample: [{ archived_at: null }, { archived_at: "2026-10-13T00:00:00Z" }, { archived_at: null }],
    shipment: [{ received_at: "2026-10-12T14:00:00Z", archived_at: null }, { received_at: "2026-10-11T14:00:00Z", archived_at: "2026-10-11T15:00:00Z" }],
    dataset: [
      { id: "d1", version: 1, status: "superseded", released_at: "2026-11-01T12:00:00Z", archived_at: "2026-11-05T12:00:00Z", archived_reason: "replaced" },
      { id: "d2", version: 2, status: "released", released_at: "2026-11-05T21:20:00Z", archived_at: null, archived_reason: null },
    ],
  };
  it("keeps the current release, counts only active samples, dates arrival from the first active shipment", () => {
    const result = clientOrderFromRow(row);
    expect(result).toMatchObject({ panel: "Panel A", registeredSamples: 2, receivedAt: "2026-10-12T14:00:00Z", requestedAt: "2026-10-08T13:00:00Z" });
    expect(result.release).toEqual({ version: 2, releasedAt: "2026-11-05T21:20:00Z", datasetId: "d2" });
  });
  it("shows the last retired version, with no dataset to open, when none is current", () => {
    const result = clientOrderFromRow({ ...row, dataset: [{ id: "d1", version: 1, status: "withdrawn", released_at: "2026-11-01T12:00:00Z", archived_at: "2026-11-03T12:00:00Z", archived_reason: "wrong metadata" }] });
    expect(result.release).toEqual({ version: 1, releasedAt: "2026-11-01T12:00:00Z", datasetId: null, retired: { status: "withdrawn", reason: "wrong metadata", at: "2026-11-03T12:00:00Z" } });
  });
});

describe("client order detail", () => {
  const released = order({ code: "ORD040", stage: "released", release: { version: 1, releasedAt: "2026-11-05T21:20:00Z", datasetId: "44444444-4444-4444-8444-444444444444" } });
  const nexo = () => screen.queryByRole("link", { name: "Open in Nexo" });

  it("shows the current step, the six steps and the order's facts, with no lab-internal words", () => {
    const { container } = render(<ClientOrderDetail order={order()} clientName="Example Cedar" example={false} />);
    expect(screen.getByRole("heading", { level: 2, name: "In analysis" })).toBeVisible();
    expect(screen.getByRole("list", { name: "Order progress" }).querySelectorAll("li")).toHaveLength(6);
    expect(screen.getByText("32 registered · 32 expected")).toBeVisible();
    for (const word of [/batch/i, /gate/i, /sequence/i, /QC checked/i, /excel/i, /operator/i, /stage/i]) expect(container.textContent, String(word)).not.toMatch(word);
  });
  it("Released: version and date; Open in Nexo only with the environment gate and the client's own switch (F4)", () => {
    vi.stubEnv("NEXT_PUBLIC_NEXO_URL", "https://lab.example/nexo/");
    vi.stubEnv("NEXT_PUBLIC_NEXO_CLIENT_ACCESS", "");
    const { unmount } = render(<ClientOrderDetail order={released} clientName="Example Cedar" example={false} />);
    expect(screen.getByText("Dataset v1 · Nov 5, 2026")).toBeVisible();
    expect(nexo()).toBeNull();
    unmount();
    vi.stubEnv("NEXT_PUBLIC_NEXO_CLIENT_ACCESS", "1");
    const off = render(<ClientOrderDetail order={released} clientName="Example Cedar" example={false} />);
    expect(nexo()).toBeNull(); // the lab has not turned Nexo on for this client
    off.unmount();
    render(<ClientOrderDetail order={released} clientName="Example Cedar" example={false} nexoAccess />);
    expect(nexo()).toHaveAttribute("href", "https://lab.example/nexo/?dataset=44444444-4444-4444-8444-444444444444");
  });
  it("a withdrawn release says so and offers nothing to open", () => {
    vi.stubEnv("NEXT_PUBLIC_NEXO_URL", "https://lab.example/nexo/");
    vi.stubEnv("NEXT_PUBLIC_NEXO_CLIENT_ACCESS", "1");
    render(<ClientOrderDetail order={{ ...released, release: { version: 1, releasedAt: "2026-11-01T12:00:00Z", datasetId: null, retired: { status: "withdrawn", reason: "wrong metadata", at: "2026-11-03T12:00:00Z" } } }} clientName="Example Cedar" example={false} nexoAccess />);
    expect(screen.getByRole("heading", { level: 2, name: "Released, then withdrawn" })).toBeVisible();
    expect(screen.getByText(/wrong metadata/)).toBeVisible();
    expect(nexo()).toBeNull();
  });
});
