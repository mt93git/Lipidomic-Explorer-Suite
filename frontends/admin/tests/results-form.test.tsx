import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResultsForm } from "@/app/(workspace)/ingest-results/results-form";
import { acceptUpload, parseUpload } from "@/app/(workspace)/ingest-results/actions";

vi.mock("@/app/(workspace)/ingest-results/actions", () => ({ parseUpload: vi.fn(), acceptUpload: vi.fn() }));

const orders = [{ id: "ORD041", code: "ORD041", client_id: "example-atlas", stage: "registered" }];
const summary = {
  injections: { Unknown: 3, Blank: 1, "Quality Control": 1 }, analytes: Array.from({ length: 33 }, (_, i) => `Lipid ${i + 1}`), internalStandards: 6, duplicatesDropped: 1, naShare: 0.313,
  checks: [
    { id: "header-rows", status: "ok" as const, message: "Sample Name and Sample Type rows parsed; matrix structure is valid" },
    { id: "pooled-qc", status: "warn" as const, message: "No pooled QC injection" },
    { id: "blank-detection", status: "stop" as const, message: "Blank injection(s) BLANK1 have sample-like detection" },
  ],
};
async function parse() {
  fireEvent.submit(screen.getByRole("button", { name: "Parse file" }).closest("form") as HTMLFormElement);
  return await screen.findByRole("region", { name: "Parse summary" });
}
beforeEach(() => {
  vi.mocked(parseUpload).mockResolvedValue({ review: { id: "review-1", summary } });
  vi.mocked(acceptUpload).mockResolvedValue({ accepted: { id: "review-1", code: "ORD041", stage: "Processed" } });
});

describe("ingest results form", () => {
  it("uses the shell's field pattern for the upload form", () => {
    render(<ResultsForm orders={orders} />);
    for (const label of ["Order", "SCIEX OS results TXT", "SCIEX OS version", "Processing method"]) expect(screen.getByLabelText(label).closest(".field")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Upload results TXT" })).toBeVisible();
  });
  it("shows the parse summary as tiles and the checks as rows with an icon and a word", async () => {
    render(<ResultsForm orders={orders} />);
    const region = await parse();
    const tiles = region.querySelectorAll(".summary-tile");
    expect(tiles.length).toBeGreaterThanOrEqual(6);
    expect(within(region).getByText("Unknown injections").closest(".summary-tile")).toHaveTextContent("3");
    expect(within(region).getByText("N/A share").closest(".summary-tile")).toHaveTextContent("31.3%");
    const rows = region.querySelectorAll(".check-row");
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelector(".check-status")).toHaveClass("ok");
    expect(rows[0]).toHaveTextContent("OK");
    expect(rows[1].querySelector(".check-status")).toHaveClass("pending");
    expect(rows[1]).toHaveTextContent("Warning");
    expect(rows[2].querySelector(".check-status")).toHaveClass("fail");
    expect(rows[2]).toHaveTextContent("Stop");
    expect(within(region).getByText(/Blank injection\(s\).*sample-like detection/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
  });
  it("after Accept, hides the form and the Accept control and points to building the dataset", async () => {
    render(<ResultsForm orders={orders} />);
    await parse();
    fireEvent.change(screen.getByLabelText("Override reason"), { target: { value: "Reviewed synthetic blank; approved for demonstration." } });
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("Results accepted for ORD041");
    expect(notice).toHaveTextContent("Processed");
    expect(within(notice).getByRole("link", { name: /Build dataset v1/ })).toHaveAttribute("href", "/release");
    expect(within(notice).getByRole("link", { name: "Order detail" })).toHaveAttribute("href", "/orders/ORD041");
    await waitFor(() => expect(acceptUpload).toHaveBeenCalledWith("review-1", "Reviewed synthetic blank; approved for demonstration."));
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Parse file" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Parse summary" })).toBeVisible();
    expect(screen.getByText(/Override recorded/)).toHaveTextContent("Reviewed synthetic blank");
  });
  it("focuses a refusal so it is not missed", async () => {
    vi.mocked(parseUpload).mockResolvedValue({ error: "Choose a nonempty SCIEX OS TXT up to 5 MB." });
    render(<ResultsForm orders={orders} />);
    fireEvent.submit(screen.getByRole("button", { name: "Parse file" }).closest("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Choose a nonempty SCIEX OS TXT up to 5 MB.");
    expect(alert).toHaveFocus();
  });
});
