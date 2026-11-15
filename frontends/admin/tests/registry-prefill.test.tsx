// The Sample registry offers the sample list pasted in the New order wizard (0033's placed draft) when the order has
// no samples yet: the paste box is filled and labelled, the lab reviews and registers; nothing is saved by itself.
// Invented example data only.
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SampleRegistryPage from "@/app/(workspace)/sample-registry/page";
import { registerSamplesAction } from "@/app/(workspace)/sample-registry/actions";
import { SampleRegistryGrid } from "@/components/sample-registry-grid";
import { getPlacedSampleList } from "@/lib/data/order-drafts";
import { getRegistryOrder, listRegistryOrders } from "@/lib/data/samples";
import { demoSession } from "@/lib/demo";
import { emptyWizard, placedSampleList, type DemoOrderDraft } from "@/lib/order-wizard";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => demoSession) }));
vi.mock("@/lib/data/samples", () => ({ getRegistryOrder: vi.fn(), listRegistryOrders: vi.fn() }));
vi.mock("@/lib/data/order-drafts", () => ({ getPlacedSampleList: vi.fn() }));
vi.mock("@/app/(workspace)/sample-registry/actions", () => ({ registerSamplesAction: vi.fn() }));

const order = { id: "ORD042", code: "ORD042", clientId: "example-cedar", clientName: "Example Cedar", description: "Example lipid panel", stage: 1, expectedSamples: 4, sampleType: "Synthetic plasma" };
const list = ["FullName\tGroup1Term\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm", "Ctrl_1\tControl\tWT\t1\tP01\t0h", "Trt_1\tTreated\tWT\t1\tP02\t0h"].join("\n");
const LABEL = "From the order's sample list — review and register";

describe("placedSampleList: the list pasted in the wizard, on the draft placed as this order", () => {
  const draft = (orderCode: string | null, sampleList: string, discardedAt: string | null = null): DemoOrderDraft => ({
    id: `d-${orderCode}-${sampleList.length}`, step: 4, data: { ...emptyWizard(), sampleList }, createdAt: "", createdBy: "", updatedAt: "", updatedBy: "", orderCode, discardedAt,
  });
  it("finds the placed draft's list, and nothing for an open draft, a blank list or another order", () => {
    expect(placedSampleList([draft(null, list), draft("ORD041", "x"), draft("ORD042", `  ${list}\n `)], "ORD042")).toBe(list);
    expect(placedSampleList([draft("ORD042", "   ")], "ORD042")).toBeNull();
    expect(placedSampleList([draft(null, list)], "ORD042")).toBeNull();
  });
});

describe("sample registry grid with the order's sample list", () => {
  beforeEach(() => vi.mocked(registerSamplesAction).mockResolvedValue({}));
  it("fills the paste box with the list, labelled; Add rows reads it and nothing is saved until the lab clicks Save", () => {
    render(<SampleRegistryGrid order={order} shipmentId="ship-1" existingNames={[]} prefill={list} />);
    const box = screen.getByLabelText("Paste from Excel");
    expect(box).toHaveValue(list);
    expect(screen.getByText(LABEL)).toBeInTheDocument();
    expect(box).toHaveAccessibleDescription(expect.stringContaining(LABEL));
    expect(screen.queryByRole("table", { name: "Samples to register" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add rows" }));
    expect(within(screen.getByRole("table", { name: "Samples to register" })).getAllByRole("row")).toHaveLength(3);
    expect(registerSamplesAction).not.toHaveBeenCalled();
  });
  it("shows no label without a list", () => {
    render(<SampleRegistryGrid order={order} shipmentId="ship-1" existingNames={[]} />);
    expect(screen.getByLabelText("Paste from Excel")).toHaveValue("");
    expect(screen.queryByText(LABEL)).toBeNull();
  });
});

describe("sample registry page", () => {
  const page = (params: Record<string, string>) => SampleRegistryPage({ searchParams: Promise.resolve(params) });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listRegistryOrders).mockResolvedValue([order]);
    vi.mocked(getRegistryOrder).mockResolvedValue({ order, shipment: null, samples: [] });
    vi.mocked(getPlacedSampleList).mockResolvedValue(list);
  });
  it("offers the order's sample list when no sample is registered yet", async () => {
    render(await page({ order: "ORD042" }) as ReactNode);
    expect(getPlacedSampleList).toHaveBeenCalledWith(order);
    expect(screen.getByLabelText("Paste from Excel")).toHaveValue(list);
    expect(screen.getByText(LABEL)).toBeInTheDocument();
  });
  it("does not offer it once samples are registered", async () => {
    const sample = { id: "s1", code: "ORD042-S001", sampleNumber: 1, full_name: "Ctrl_1", group1_term: null, group2_term: null, replicate_term: null, patient_term: null, time_point_term: null, client_sample_id: null, matrix: null, volume_ul: null };
    vi.mocked(getRegistryOrder).mockResolvedValue({ order: { ...order, stage: 2 }, shipment: null, samples: [sample] });
    render(await page({ order: "ORD042" }) as ReactNode);
    expect(getPlacedSampleList).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Paste from Excel")).toHaveValue("");
  });
});
