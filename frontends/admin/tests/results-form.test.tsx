import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResultsForm } from "@/app/(workspace)/ingest-results/results-form";
import { acceptUpload, compareUpload, parseUpload } from "@/app/(workspace)/ingest-results/actions";

vi.mock("@/app/(workspace)/ingest-results/actions", () => ({ parseUpload: vi.fn(), acceptUpload: vi.fn(), compareUpload: vi.fn() }));

const orders = [{ id: "ORD041", code: "ORD041", client_id: "example-atlas", stage: "registered" }];
const summary = {
  injections: { Unknown: 3, Blank: 1, "Quality Control": 1 }, analytes: Array.from({ length: 33 }, (_, i) => `Lipid ${i + 1}`),
  internalStandards: 6, internalStandardNames: [], internalStandardsByKit: { Ultimate_SPLASH_ONE: 4, SPLASH: 2, SphingoSPLASH_ONE: 0, Sigma: 0, other: 0 },
  duplicatesDropped: 1, droppedRows: ["DAG(20:0_20:4)+NH4 b"], naShare: 0.313, neverDetected: ["Lipid 9"],
  detection: [
    { kind: "min" as const, sample: "S1", detected: 20 }, { kind: "median" as const, detected: 25 }, { kind: "max" as const, sample: "S3", detected: 30 },
    { kind: "blank" as const, sample: "BLANK1", detected: 28, likeSample: true },
  ],
  checks: [
    { id: "header-rows", status: "ok" as const, message: "Sample Name and Sample Type rows parsed; matrix structure is valid" },
    { id: "sample-names-unique", status: "ok" as const, message: "Sample names are unique." },
    { id: "sample-registry", status: "ok" as const, message: "No registry supplied; membership not checked." },
    { id: "planned-sample-types", status: "stop" as const, message: "Sample Type differs from plan: S2 (planned Blank, observed Unknown)." },
    { id: "pooled-qc", status: "ok" as const, message: "1 pooled QC injection(s)." },
    { id: "blank-detection", status: "stop" as const, message: "Blank injection(s) BLANK1 (28 detected lipids) have sample-like detection" },
  ],
};
async function parse() {
  fireEvent.submit(screen.getByRole("button", { name: "Parse file" }).closest("form") as HTMLFormElement);
  const region = await screen.findByRole("region", { name: "Parse summary" });
  // The summary can show while the parse transition is still pending, and the heading buttons stay disabled until it
  // ends: a click then does nothing. Wait for them, as a person would.
  await waitFor(() => expect(screen.getByRole("button", { name: "Compare with previous" })).toBeEnabled());
  return region;
}
beforeEach(() => {
  vi.mocked(parseUpload).mockResolvedValue({ review: { id: "review-1", summary, toMap: 12, orderCode: "ORD041", fileName: "synthetic.txt" } });
  vi.mocked(acceptUpload).mockResolvedValue({ accepted: { id: "review-1", code: "ORD041", stage: "Processed" } });
  vi.mocked(compareUpload).mockReset();
});

describe("ingest results form", () => {
  it("uses the shell's field pattern for the upload form", () => {
    render(<ResultsForm orders={orders} />);
    for (const label of ["Order", "SCIEX OS results TXT", "SCIEX OS version", "Processing method"]) expect(screen.getByLabelText(label).closest(".field")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Upload results TXT" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ingest results TXT");
  });
  it("after Parse file names the order and shows the five tiles", async () => {
    render(<ResultsForm orders={orders} />);
    const region = await parse();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ingest results TXT · ORD041");
    const tiles = within(within(region).getByRole("list", { name: "File summary" })).getAllByRole("listitem");
    expect(tiles.map(tile => tile.textContent)).toEqual(["5samples · 3 Unknown, 1 Blank, 1 QC", "33lipids", "6internal standards", "31.3 %cells N/A → NA", "12names to map"]);
    expect(tiles[4]!.className).toMatch(/warn/);
    expect(screen.queryByRole("button", { name: "Parse file" })).not.toBeInTheDocument();
  });
  it("shows the file check table with ok and stop pills", async () => {
    render(<ResultsForm orders={orders} />);
    await parse();
    const table = screen.getByRole("table", { name: "File check" });
    const rows = within(table).getAllByRole("row").slice(1) as HTMLTableRowElement[];
    const cells = (name: string) => rows.find(row => row.cells[0]!.textContent === name)!;
    expect(cells("Row 1 is Sample Name").cells[1]).toHaveTextContent("ok");
    expect(cells("Sample Names unique and in registry").cells[1]).toHaveTextContent("5 / 5ok");
    expect(cells("Sample Type matches the batch").cells[1]).toHaveTextContent("1 mismatchstop");
    expect(cells("Rows ending in .IS").cells[1]).toHaveTextContent("6 → ISTD sheet");
    expect(cells("ISTD kits").cells[1]).toHaveTextContent("Ultimate SPLASH ONE 4 · SPLASH 2");
    expect(cells("Lipids never detected").cells[1]).toHaveTextContent("1 → kept, listed");
    expect(cells("Pooled QC injections").cells[1]).toHaveTextContent("1ok");
    expect(within(table).getByText(/Blank injection\(s\).*sample-like detection/)).toBeVisible();
  });
  it("draws min, median, max and each blank, the sample-like blank in red with the explanation", async () => {
    render(<ResultsForm orders={orders} />);
    await parse();
    const bars = within(screen.getByRole("list", { name: "Detected lipids per sample" })).getAllByRole("listitem");
    expect(bars.map(bar => bar.textContent)).toEqual(["min · S120", "median25", "max · S330", "Blank · BLANK128"]);
    expect(bars[3]).toHaveAttribute("data-like-sample", "true");
    expect(screen.getByRole("img", { name: "Blank · BLANK1: 28 lipids detected, like a sample" })).toBeVisible();
    expect(screen.getByText("A real blank detects a handful of lipids. This one behaves like a sample.")).toBeVisible();
  });
  it("keeps Accept disabled while stops are open; an override reason closes them", async () => {
    render(<ResultsForm orders={orders} />);
    await parse();
    expect(screen.getByRole("button", { name: "Accept (2 open)" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Override reason"), { target: { value: "Reviewed synthetic blank; approved for demonstration." } });
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    const notice = await screen.findByText(/Results accepted for ORD041/);
    const status = notice.closest("[role=status]") as HTMLElement;
    expect(status).toHaveTextContent("Processed");
    expect(within(status).getByRole("link", { name: "QC review →" })).toHaveAttribute("href", "/qc-review?order=ORD041");
    expect(within(status).getByRole("link", { name: /Build dataset v1/ })).toHaveAttribute("href", "/release");
    expect(within(status).getByRole("link", { name: "Order detail" })).toHaveAttribute("href", "/orders/ORD041");
    await waitFor(() => expect(acceptUpload).toHaveBeenCalledWith("review-1", "Reviewed synthetic blank; approved for demonstration."));
    expect(screen.queryByRole("button", { name: /^Accept/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Parse summary" })).toBeVisible();
    expect(screen.getByText(/Override recorded/)).toHaveTextContent("Reviewed synthetic blank");
  });
  it("compares counts with the previously accepted file of the order", async () => {
    const counts = { samples: 5, unknown: 3, blank: 1, qc: 1, lipids: 33, internalStandards: 6, naShare: 0.313, neverDetected: 1, medianDetected: 25 };
    vi.mocked(compareUpload).mockResolvedValue({ comparison: { orderCode: "ORD041", current: counts, previous: { acceptedAt: "2026-11-01T10:00:00Z", counts: { ...counts, lipids: 30, naShare: 0.3 } } } });
    render(<ResultsForm orders={orders} />);
    await parse();
    fireEvent.click(screen.getByRole("button", { name: "Compare with previous" }));
    const panel = await screen.findByRole("region", { name: "Compare with previous" });
    expect(compareUpload).toHaveBeenCalledWith("review-1");
    expect(panel).toHaveTextContent("accepted for ORD041 on 2026-11-01");
    const lipids = within(panel).getByText("Lipids").closest("tr")!;
    expect(lipids).toHaveTextContent("Lipids3033+3");
    expect(within(panel).getByText("Cells N/A").closest("tr")).toHaveTextContent("+1.3 pt");
  });
  it("says so when the order has no previously accepted file", async () => {
    const counts = { samples: 5, unknown: 3, blank: 1, qc: 1, lipids: 33, internalStandards: 6, naShare: 0.313 };
    vi.mocked(compareUpload).mockResolvedValue({ comparison: { orderCode: "ORD041", current: counts, previous: null } });
    render(<ResultsForm orders={orders} />);
    await parse();
    fireEvent.click(screen.getByRole("button", { name: "Compare with previous" }));
    expect(await screen.findByText("No earlier file was accepted for ORD041; there is nothing to compare with.")).toBeVisible();
  });
  it("focuses a refusal so it is not missed", async () => {
    vi.mocked(parseUpload).mockResolvedValue({ error: "Choose a nonempty SCIEX OS TXT up to 5 MB." });
    render(<ResultsForm orders={orders} />);
    fireEvent.submit(screen.getByRole("button", { name: "Parse file" }).closest("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Choose a nonempty SCIEX OS TXT up to 5 MB.");
    // FormAlert takes the focus in an effect that can run a tick after the alert is in the DOM.
    await waitFor(() => expect(alert).toHaveFocus());
  });
});
