// a09 Storage: "Print box map" (a print-friendly page of one box: header with the box and the date, the grid, the
// legend and the free count) and the selected position's Volume and Next batch when they are known. Synthetic data.
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StoragePage from "@/app/(workspace)/storage/page";
import PrintBoxPage from "@/app/(workspace)/storage/print/page";
import { aliquotPlans, listBox, listBoxes, listUnplaced, searchAliquots, storageAccess } from "@/lib/data/storage";
import { requireWorkspace } from "@/lib/session";
import { nextBatchOf, type StoredAliquot } from "@/lib/storage";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => ({ view: "staff", role: "Operator" })) }));
vi.mock("@/app/(workspace)/storage/actions", () => ({ placeAliquotAction: vi.fn(), moveAliquotAction: vi.fn(), removeAliquotAction: vi.fn() }));
vi.mock("@/lib/data/freezers", () => ({ freezerCatalog: vi.fn(async () => ({ freezers: [], locations: [], canManage: false })) }));
vi.mock("@/app/(workspace)/storage/freezer-actions", () => ({
  createFreezerAction: vi.fn(), createRackAction: vi.fn(), archiveFreezerAction: vi.fn(), archiveRackAction: vi.fn(), setBoxLocationAction: vi.fn(),
}));
vi.mock("@/lib/data/storage", () => ({
  storageAccess: vi.fn(), listBoxes: vi.fn(), listBox: vi.fn(), listUnplaced: vi.fn(), searchAliquots: vi.fn(), aliquotPlans: vi.fn(),
}));

const at = (position: string) => ({ box: "F1-R1-B02", position, placedAt: "2026-11-05T15:10:00Z" });
const item = (code: string, position: string, clientName: string): StoredAliquot => ({
  id: `id-${code}`, code, sampleCode: code.replace(/-A\d+$/, ""), clientName, orderCode: code.slice(0, 6), archivedReason: null, location: at(position),
});
const box = [item("ORD043-S022-A1", "C4", "Example Atlas"), item("ORD043-S023-A1", "C5", "Example Atlas"), item("ORD058-S001-A1", "E1", "Example Meridian")];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(storageAccess).mockResolvedValue({ canWrite: true });
  vi.mocked(listBoxes).mockResolvedValue([{ box: "F1-R1-B02", occupied: 3 }]);
  vi.mocked(listBox).mockResolvedValue(box);
  vi.mocked(listUnplaced).mockResolvedValue([]);
  vi.mocked(searchAliquots).mockResolvedValue([]);
  vi.mocked(aliquotPlans).mockResolvedValue({ volumeUl: null, nextBatch: null });
});

describe("nextBatchOf: the batch an aliquot will be injected in next", () => {
  const row = (batch: string, patch: Partial<Parameters<typeof nextBatchOf>[0][number]> = {}) =>
    ({ batch, batchStatus: "planned", batchArchived: false, versionArchived: false, injectionStatus: "planned", ...patch });
  it("is the first live batch, planned or exported, whose injection is still planned", () => {
    expect(nextBatchOf([row("B2026-040"), row("B2026-032", { batchStatus: "sequence_exported" })])).toBe("B2026-032");
  });
  it("skips acquired and later batches, archived batches or versions, and injections already acquired, failed or skipped", () => {
    expect(nextBatchOf([
      row("B2026-001", { batchStatus: "acquired" }), row("B2026-002", { batchArchived: true }), row("B2026-003", { versionArchived: true }),
      row("B2026-004", { batchStatus: "sequence_exported", injectionStatus: "acquired" }), row("B2026-005", { injectionStatus: "skipped" }),
    ])).toBeNull();
  });
});

describe("storage page: Print box map and the selected panel", () => {
  const page = async (params: Record<string, string>) => render(await StoragePage({ searchParams: Promise.resolve(params) }));

  it("offers Print box map for the open box (with the selected position), and nothing to print without a box", async () => {
    await page({ box: "F1-R1-B02", slot: "c4" });
    expect(screen.getByRole("link", { name: "Print box map" })).toHaveAttribute("href", "/storage/print?box=F1-R1-B02&slot=c4");
    document.body.innerHTML = "";
    await page({});
    expect(screen.queryByRole("link", { name: "Print box map" })).toBeNull();
  });

  it("shows Volume and Next batch for the selected aliquot when they are known", async () => {
    vi.mocked(aliquotPlans).mockResolvedValue({ volumeUl: 200, nextBatch: "B2026-032" });
    await page({ box: "F1-R1-B02", slot: "C4" });
    expect(aliquotPlans).toHaveBeenCalledWith(box[0]);
    const panel = screen.getByRole("complementary", { name: "Selected · C4" });
    const terms = within(panel).getAllByRole("term").map(term => term.textContent);
    expect(terms).toEqual(["Aliquot", "Sample", "Client", "Order", "Volume", "Since", "Next"]);
    expect(within(panel).getByText("200 µL")).toBeVisible();
    expect(within(panel).getByRole("link", { name: "Batch B2026-032" })).toHaveAttribute("href", "/batch-run/B2026-032");
  });

  it("leaves Volume and Next out when nothing is recorded, and asks nothing for a free position", async () => {
    await page({ box: "F1-R1-B02", slot: "C4" });
    const panel = screen.getByRole("complementary", { name: "Selected · C4" });
    expect(within(panel).getAllByRole("term").map(term => term.textContent)).toEqual(["Aliquot", "Sample", "Client", "Order", "Since"]);
    vi.mocked(aliquotPlans).mockClear();
    document.body.innerHTML = "";
    await page({ box: "F1-R1-B02", slot: "A1" });
    expect(aliquotPlans).not.toHaveBeenCalled();
  });
});

describe("print box map page", () => {
  const print = async (params: Record<string, string>) => render(await PrintBoxPage({ searchParams: Promise.resolve(params) }));

  it("is a lab page: a header with the box and the date, the grid with each aliquot, the legend and the free count", async () => {
    await print({ box: "F1-R1-B02", slot: "C4" });
    expect(requireWorkspace).toHaveBeenCalledWith("staff");
    expect(listBox).toHaveBeenCalledWith("F1-R1-B02");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Box F1-R1-B02");
    expect(screen.getByText(/^Printed /)).toHaveTextContent(/Printed \w{3} \d{1,2}, \d{4}, \d{2}:\d{2} E[SD]T/);
    expect(screen.getByText(/9 × 9 · 3 taken · 78 free/)).toBeVisible();
    const grid = screen.getByRole("table", { name: "Box F1-R1-B02 map" });
    expect(within(grid).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    const c4 = within(grid).getByRole("cell", { name: /C4 ORD043-S022-A1/ });
    expect(c4).toHaveAttribute("aria-current", "true");
    expect(within(grid).getByRole("cell", { name: /E1 ORD058-S001-A1/ })).toBeVisible();
    const legend = screen.getByRole("list", { name: "Box map legend" });
    expect(within(legend).getAllByRole("listitem").map(li => li.textContent)).toEqual(["Example Atlas · 2", "Example Meridian · 1", "78 positions free"]);
    const list = screen.getByRole("table", { name: "Positions in box F1-R1-B02" });
    expect(within(list).getAllByRole("row")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Print" })).toBeVisible();
    expect(screen.getByRole("link", { name: "← Back to box F1-R1-B02" })).toHaveAttribute("href", "/storage?box=F1-R1-B02&slot=C4");
  });

  it("asks for a box when none is given, and says so for an empty box", async () => {
    await print({});
    expect(listBox).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a box in Storage first.")).toBeVisible();
    vi.mocked(listBox).mockResolvedValue([]);
    document.body.innerHTML = "";
    await print({ box: "F9" });
    expect(screen.getByText("Box F9 holds no aliquot.")).toBeVisible();
  });
});
