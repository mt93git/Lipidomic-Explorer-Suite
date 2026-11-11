// The QC review screen (/qc-review): the orders at Processed or QC reviewed, one order's samples with Exclude and
// Withdraw (each with a reason), "Mark QC reviewed" behind a short confirm, the link to Release; viewers read only.
// Synthetic data; the seam is mocked.
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QcReviewPage from "@/app/(workspace)/qc-review/page";
import { getQcOrder, listQcOrders } from "@/lib/data/qc-review";
import { demoSession } from "@/lib/demo";
import type { QcDetail, QcOrder } from "@/lib/qc-review";
import { requireWorkspace } from "@/lib/session";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn() }));
vi.mock("@/lib/data/qc-review", () => ({ listQcOrders: vi.fn(), getQcOrder: vi.fn() }));
vi.mock("@/app/(workspace)/qc-review/actions", () => ({ addExclusionAction: vi.fn(), withdrawExclusionAction: vi.fn(), markQcReviewedAction: vi.fn() }));

const order = (code: string, stage: number, over: Partial<QcOrder> = {}): QcOrder => ({
  id: `id-${code}`, code, clientId: "example-atlas", clientName: "Example Atlas", title: `${code} synthetic order`, stage,
  resultFile: { sha256: "a".repeat(64), acceptedAt: "2026-11-09T16:57:00Z" }, sampleCount: 3, exclusionCount: 0, ...over,
});
const detail = (stage: number, reviewed: QcDetail["reviewed"] = null): QcDetail => ({
  order: order("ORD048", stage, { exclusionCount: 1 }),
  samples: [
    { id: "s-1", code: "ORD048-S001", fullName: "Ctrl_1", exclusion: null },
    { id: "s-2", code: "ORD048-S002", fullName: "Trt_1", exclusion: { id: "e-1", sampleId: "s-2", sampleCode: "ORD048-S002", reason: "haemolysed tube", decidedBy: "Example Operator", decidedAt: "2026-11-10T14:00:00Z", withdrawnAt: null, withdrawnReason: null } },
    { id: "s-3", code: "ORD048-S003", fullName: "Trt_2", exclusion: null },
  ],
  reviewed,
});
const show = async (query: Record<string, string> = {}) => render(await QcReviewPage({ searchParams: Promise.resolve(query) }));
const sampleRow = (code: string) => within(screen.getByRole("table", { name: "Samples of ORD048" })).getAllByRole("row").find(row => row.textContent?.includes(code)) as HTMLElement;

beforeEach(() => {
  vi.mocked(requireWorkspace).mockResolvedValue(demoSession);
  vi.mocked(listQcOrders).mockResolvedValue([order("ORD048", 7, { exclusionCount: 2 }), order("ORD049", 8, { resultFile: { sha256: "", acceptedAt: null } })]);
  vi.mocked(getQcOrder).mockResolvedValue(detail(7));
});

describe("QC review list", () => {
  it("lists each order with client, stage, results file, sample count and exclusions count, and opens it", async () => {
    await show();
    expect(screen.getByRole("heading", { level: 1, name: "QC review" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Orders at Processed or QC reviewed" });
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Order", "Client", "Stage", "Results file", "Samples", "Exclusions", "Open"]);
    const [first, second] = within(table).getAllByRole("row").slice(1);
    expect(first).toHaveTextContent("ORD048");
    expect(first).toHaveTextContent("Example Atlas");
    expect(first).toHaveTextContent("08 · Processed");
    expect(first).toHaveTextContent(`SHA-256 ${"a".repeat(12)}…`);
    expect(within(first).getAllByRole("cell").map(cell => cell.textContent).slice(4, 6)).toEqual(["3", "2"]);
    expect(second).toHaveTextContent("09 · QC reviewed");
    expect(second).toHaveTextContent("Example file");
    expect(within(second).getAllByRole("cell")[5]).toHaveTextContent("None");
    expect(within(first).getByRole("link", { name: "Open ORD048" })).toHaveAttribute("href", "/qc-review?order=ORD048");
    expect(screen.getAllByRole("link", { name: "Release" })[0]).toHaveAttribute("href", "/release");
    expect(getQcOrder).not.toHaveBeenCalled();
  });
  it("says so when no order is waiting", async () => {
    vi.mocked(listQcOrders).mockResolvedValue([]);
    await show();
    expect(screen.getByText(/No order is at Processed or QC reviewed/)).toBeInTheDocument();
  });
});

describe("QC review of one order", () => {
  it("shows each sample's decision: Exclude with a required reason, Withdraw on the excluded one", async () => {
    await show({ order: "ORD048" });
    expect(getQcOrder).toHaveBeenCalledWith("ORD048");
    expect(screen.getByRole("heading", { level: 2, name: "3 samples · 1 excluded" })).toBeInTheDocument();
    const included = sampleRow("ORD048-S001");
    expect(included).toHaveTextContent("Included");
    expect(within(included).getByText("Exclude", { exact: false, selector: "summary" })).toBeInTheDocument();
    expect(within(included).getByRole("textbox", { name: "Reason", hidden: true })).toBeRequired();
    expect(within(included).getByRole("button", { name: "Exclude sample", hidden: true })).toBeInTheDocument();
    expect((included.querySelector("input[name=sampleId]") as HTMLInputElement).value).toBe("s-1");
    expect((included.querySelector("input[name=orderCode]") as HTMLInputElement).value).toBe("ORD048");

    const excluded = sampleRow("ORD048-S002");
    expect(excluded).toHaveTextContent("Excluded haemolysed tube");
    expect(excluded).toHaveTextContent("Example Operator");
    expect(excluded).toHaveAttribute("data-excluded", "true");
    expect(within(excluded).getByRole("button", { name: "Withdraw exclusion", hidden: true })).toBeInTheDocument();
    expect(within(excluded).getByRole("textbox", { name: "Reason", hidden: true })).toBeRequired();
    expect((excluded.querySelector("input[name=exclusionId]") as HTMLInputElement).value).toBe("e-1");
    expect(within(excluded).queryByRole("button", { name: "Exclude sample", hidden: true })).not.toBeInTheDocument();
  });
  it("puts Mark QC reviewed behind a short confirm on a Processed order, and links to Release", async () => {
    await show({ order: "ORD048" });
    const section = screen.getByRole("region", { name: "QC reviewed" });
    const details = section.querySelector("details") as HTMLDetailsElement;
    expect(details).not.toHaveAttribute("open");
    expect(within(section).getByText("Mark QC reviewed", { selector: "summary" })).toBeInTheDocument();
    expect(within(section).getByText(/Move ORD048 from Processed to QC reviewed\?/)).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Yes, mark QC reviewed", hidden: true })).toBeInTheDocument();
    expect((section.querySelector("input[name=orderId]") as HTMLInputElement).value).toBe("id-ORD048");
    expect(within(section).getByText(/Release builds the dataset from Processed too/)).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Go to Release →" })).toHaveAttribute("href", "/release");
  });
  it("a QC reviewed order says who marked it and when; exclusions stay open", async () => {
    vi.mocked(getQcOrder).mockResolvedValue(detail(8, { at: "2026-11-10T15:30:00Z", by: "Example Admin" }));
    await show({ order: "ORD048", reviewed: "1" });
    expect(screen.getByRole("status")).toHaveTextContent("ORD048 is QC reviewed. Build its dataset in Release.");
    const section = screen.getByRole("region", { name: "QC reviewed" });
    expect(section).toHaveTextContent(/QC reviewed .*Example Admin\./);
    expect(within(section).queryByRole("button", { hidden: true })).not.toBeInTheDocument();
    expect(within(sampleRow("ORD048-S001")).getByRole("button", { name: "Exclude sample", hidden: true })).toBeInTheDocument();
  });
  it("closes the decisions once the dataset is built: no Exclude, Withdraw or Mark", async () => {
    vi.mocked(getQcOrder).mockResolvedValue(detail(9));
    await show({ order: "ORD048" });
    expect(screen.getByText(/ORD048 is Excel built; its QC decisions are closed/)).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { hidden: true })).toEqual([]);
    expect(sampleRow("ORD048-S002")).toHaveTextContent("Excluded haemolysed tube");
  });
  it("a viewer reads the decisions only", async () => {
    vi.mocked(requireWorkspace).mockResolvedValue({ ...demoSession, role: "Viewer" });
    await show({ order: "ORD048" });
    expect(screen.getByText(/You can read QC decisions; recording them needs a lab Owner, Admin or Operator/)).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { hidden: true })).toEqual([]);
    expect(screen.queryByText("Mark QC reviewed")).not.toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Samples of ORD048" })).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Code", "FullName", "Decision"]);
    expect(sampleRow("ORD048-S002")).toHaveTextContent("Excluded haemolysed tube");
  });
  it("an unknown order falls back to the list with a notice", async () => {
    vi.mocked(getQcOrder).mockResolvedValue(null);
    await show({ order: "ORD999" });
    expect(screen.getByRole("status")).toHaveTextContent("No order ORD999 was found. Choose one below.");
    expect(screen.getByRole("table", { name: "Orders at Processed or QC reviewed" })).toBeInTheDocument();
  });
});
