import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SampleRegistryPage from "@/app/(workspace)/sample-registry/page";
import { getRegistryOrder, listRegistryOrders } from "@/lib/data/samples";
import { demoSession } from "@/lib/demo";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => demoSession) }));
vi.mock("@/lib/data/samples", () => ({ getRegistryOrder: vi.fn(), listRegistryOrders: vi.fn() }));
// The grid owns the screen's heading (it shows the column matches); the page hands it the breadcrumb, the banners and the facts.
vi.mock("@/components/sample-registry-grid", () => ({
  SampleRegistryGrid: ({ order, eyebrow, children, nextSampleNumber }: { order: { code: string }; eyebrow: ReactNode; children: ReactNode; nextSampleNumber: number }) =>
    <div data-testid="grid">{eyebrow}<h1>Register samples · {order.code}</h1>{children}<label>Paste from Excel<textarea /></label><span>next {nextSampleNumber}</span></div>,
}));

const order = { id: "ORD042", code: "ORD042", clientId: "example-cedar", clientName: "Example Cedar", description: "Example lipid panel · feasibility", stage: 1, expectedSamples: 12, sampleType: "Synthetic plasma" };
const shipment = { id: "ship-1", carrier: "FedEx", trackingNumber: "7489 0000 0001", condition: "ok" as const, boxCount: 1, notes: "Dry ice present on arrival.", receivedAt: "2026-11-09T17:03:00Z", receivedBy: "Demo Operator" };
const page = (params: Record<string, string>) => SampleRegistryPage({ searchParams: Promise.resolve(params) });

beforeEach(() => {
  vi.mocked(listRegistryOrders).mockResolvedValue([order]);
  vi.mocked(getRegistryOrder).mockResolvedValue({ order, shipment, samples: [] });
});

describe("sample registry page", () => {
  it("opens the registration screen for the order and puts the paste box right after one compact facts strip", async () => {
    render(await page({ order: "ORD042", received: "ship-1" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Register samples · ORD042");
    expect(screen.getByRole("link", { name: "Lab work / Pipeline" })).toHaveAttribute("href", "/pipeline");
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Shipment recorded for ORD042 · FedEx 7489 0000 0001 · 1 box · intact and cold");
    expect(banner).toHaveTextContent("Now paste the Metadata sheet");
    // One strip, not two panels: no "At a glance" / "Shipment" panel headings.
    expect(screen.queryByRole("heading", { name: "Shipment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "ORD042" })).not.toBeInTheDocument();
    const strip = screen.getByRole("region", { name: "Order facts" });
    expect(strip).toHaveTextContent("Example Cedar");
    expect(strip).toHaveTextContent("Received");
    expect(strip).toHaveTextContent("12 samples");
    const details = within(strip).getByText("Shipment details").closest("details") as HTMLDetailsElement;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("7489 0000 0001")).toBeInTheDocument();
    expect(within(details).getByText("Dry ice present on arrival.")).toBeInTheDocument();
    // Document order: banner, strip, then the register panel with the paste box.
    const register = screen.getByRole("region", { name: "Samples to register" });
    const paste = within(register).getByLabelText("Paste from Excel");
    expect(within(register).getByRole("heading", { level: 1 }).compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(paste) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("next 1")).toBeInTheDocument();
  });
  it("marks a save as a success: bold lead, the codes assigned, and the next step as a button", async () => {
    const sample = (n: number, name: string) => ({ id: `s${n}`, code: `ORD042-S00${n}`, sampleNumber: n, full_name: name, group1_term: null, group2_term: null, replicate_term: null, patient_term: null, time_point_term: null, client_sample_id: null, matrix: null, volume_ul: null });
    vi.mocked(getRegistryOrder).mockResolvedValue({ order: { ...order, stage: 2 }, shipment, samples: [sample(1, "Ctrl_1"), sample(2, "Ctrl_2"), sample(3, "Trt_1")] });
    render(await page({ order: "ORD042", saved: "3" }));
    const banner = screen.getByRole("status");
    expect(banner).toHaveClass("notice", "success");
    expect(banner.querySelector("strong")).toHaveTextContent("3 samples registered.");
    expect(banner).toHaveTextContent("ORD042 is now Registered · codes ORD042-S001 to ORD042-S003");
    expect(within(banner).getByRole("link", { name: /Order detail/ })).toHaveClass("button");
    expect(within(banner).getByRole("link", { name: /Order detail/ })).toHaveAttribute("href", "/orders/ORD042");
    expect(within(banner).getByRole("link", { name: "see it in the pipeline" })).toHaveAttribute("href", "/pipeline?q=ORD042");
    expect(screen.getByRole("region", { name: "Order facts" })).toHaveTextContent(/Registered\s*3/);
    // The next sample takes the number after the last one registered.
    expect(screen.getByText("next 4")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Registered samples" })).toBeInTheDocument();
  });
  it("keeps the plain heading and no paste box when the order's registry is closed", async () => {
    vi.mocked(getRegistryOrder).mockResolvedValue({ order: { ...order, stage: 4 }, shipment, samples: [] });
    render(await page({ order: "ORD042" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sample registry · ORD042");
    expect(screen.getByText(/its registry is closed/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Paste from Excel")).not.toBeInTheDocument();
  });
  it("keeps the choose-an-order view and the plain title without an order", async () => {
    render(await page({}));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Sample registry$/);
    expect(screen.getByRole("heading", { name: "Choose an order" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Order facts" })).not.toBeInTheDocument();
  });
});
