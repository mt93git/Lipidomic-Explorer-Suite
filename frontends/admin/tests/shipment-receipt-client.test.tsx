import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClientOrder } from "@/lib/client-portal";
import { clientOrderFromRow, type ClientOrderRow } from "@/lib/data/client-orders";
import { ClientOrderDetail } from "@/components/client-order-detail";

vi.mock("server-only", () => ({}));
vi.mock("@/components/companion/screen", () => ({ CompanionScreen: () => null }));

// The tube check-in's receipt (0032), as the client is told: the counts and the lab's discrepancy note on their order.
const row: ClientOrderRow = {
  code: "ORD051", title: "Synthetic shipment", stage: "registered", matrix: "Plasma", expected_samples: 36, billing_ref: null,
  client_id: "client-harbor", created_at: "2026-10-30T13:00:00Z", panel: null, sample: [{ archived_at: null }], dataset: [],
  shipment: [
    { received_at: "2026-11-02T15:42:00Z", archived_at: null, receipt_confirmed_at: "2026-11-02T18:00:00Z", receipt_note: "S020 and S036 missing from box, courier contacted.", receipt_missing: 2, receipt_damaged: 2 },
    { received_at: "2026-11-01T15:42:00Z", archived_at: "2026-11-01T16:00:00Z", receipt_confirmed_at: "2026-11-01T16:00:00Z", receipt_note: "archived shipment", receipt_missing: 1, receipt_damaged: 0 },
  ],
};

describe("the shipment receipt on the client's order", () => {
  it("a live row carries the newest confirmed receipt of a live shipment", () => {
    expect(clientOrderFromRow(row).receipt).toEqual({ confirmedAt: "2026-11-02T18:00:00Z", note: "S020 and S036 missing from box, courier contacted.", missing: 2, damaged: 2 });
    expect(clientOrderFromRow({ ...row, shipment: [{ received_at: "2026-11-02T15:42:00Z", archived_at: null }] }).receipt).toBeNull();
  });

  it("the client reads what was missing or damaged and the lab's note", () => {
    const order: ClientOrder = clientOrderFromRow(row);
    render(<ClientOrderDetail order={order} clientName="Example Harbor" example={false} />);
    const panel = screen.getByRole("region", { name: "Discrepancy on arrival" });
    expect(panel.textContent).toContain("2 tubes on your manifest were not in the shipment; 2 tubes arrived damaged");
    expect(panel.textContent).toContain("Note from the lab. S020 and S036 missing from box, courier contacted.");
  });

  it("an order without a confirmed receipt shows no such panel", () => {
    render(<ClientOrderDetail order={clientOrderFromRow({ ...row, shipment: [] })} clientName="Example Harbor" example={false} />);
    expect(screen.queryByRole("region", { name: /Discrepancy on arrival|Every tube arrived/ })).toBeNull();
  });
});
