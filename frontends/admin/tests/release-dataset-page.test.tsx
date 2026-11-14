// The dataset version page (prototype a15): the title says where the version goes, Download Excel and a Release
// button that says what is missing, an Excel preview of the stored workbook, and Signatures as a side panel.
// Synthetic data; live-mode views (the signed-in person acts, no demo actors) unless a test says otherwise.
import ExcelJS from "exceljs";
import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import DatasetPage from "@/app/(workspace)/release/[id]/page";
import { DataError, getDataset, readDatasetWorkbook, type DatasetRecord, type ReleaseView } from "@/lib/data/release";
import { defaultPolicy, type LabPerson } from "@/lib/release";
import { demoSession } from "@/lib/demo";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => demoSession) }));
vi.mock("@/lib/data/release", () => {
  class DataError extends Error {}
  return { DataError, getDataset: vi.fn(), readDatasetWorkbook: vi.fn() };
});
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/app/(workspace)/release/actions", () => ({ signDatasetAction: vi.fn(), releaseDatasetAction: vi.fn(), withdrawDatasetAction: vi.fn(), supersedeDatasetAction: vi.fn() }));

const ana: LabPerson = { userId: "u-ana", name: "Example Ana", role: "admin" };
const ben: LabPerson = { userId: "u-ben", name: "Example Ben", role: "owner" };
const op: LabPerson = { userId: "u-op", name: "Example Operator", role: "operator" };
const file = (label: string, sha: string) => ({ label, sheets: ["Sheet"], sha256: sha.repeat(64), sizeBytes: 2048, path: null });
const signature = (person: LabPerson, note: string | null = null) => ({ id: `s-${person.userId}`, userId: person.userId, name: person.name, role: "reviewed" as const, note, signedAt: "2026-11-09T17:00:00Z" });
const dataset = (over: Partial<DatasetRecord> = {}): DatasetRecord => ({
  id: "d-1", orderId: "o-1", orderCode: "ORD900", orderTitle: "Synthetic pilot", clientId: "c-1", clientName: "Example Client",
  version: 1, status: "built", builtAt: "2026-11-09T16:57:00Z", builtBy: "Example Operator", releasedAt: null, projectId: null, projectName: null,
  full: file("Dataset v1 workbook", "a"), analysis: file("Analysis file", "b"), companion: file("Companion file", "c"),
  provenance: { sourceSha256: "d".repeat(64), sciexOsVersion: null, processingMethod: null, acceptedAt: null, headers: null },
  signatures: [], exclusions: [], archivedAt: null, archivedReason: null, ...over,
});
let workbook: Buffer;
beforeAll(async () => {
  const book = new ExcelJS.Workbook();
  const abundance = book.addWorksheet("Abundance");
  abundance.addRow(["Lipid", "Example_A", "Example_B", "Example_C"]);
  abundance.addRow(["CE(16:0)+NH4", 9612920.8, 6236944.9, 12201764.9]);
  abundance.addRow(["CE(14:0)+NH4", null, 21602.9, null]);
  book.addWorksheet("Metadata").addRow(["FullName", "Group1Term"]);
  book.getWorksheet("Metadata")!.addRow(["Example_A", "Steady state"]);
  book.addWorksheet("Internal_Standards").addRow(["Lipid", "Example_A"]);
  book.addWorksheet("QC_Injections").addRow(["Lipid", "QC_1"]);
  book.addWorksheet("Provenance").addRow(["Key", "Value"]);
  workbook = Buffer.from(await book.xlsx.writeBuffer());
});
const show = async (me: LabPerson, over: Partial<DatasetRecord> = {}, query: Record<string, string> = {}, demoActors: LabPerson[] | null = null) => {
  const view: ReleaseView = { dataset: dataset(over), policy: { ...defaultPolicy, requiredSignatures: 2 }, people: [ana, ben, op], me, versions: [], demoActors };
  vi.mocked(getDataset).mockResolvedValue(view);
  vi.mocked(readDatasetWorkbook).mockResolvedValue({ bytes: workbook, fileName: "ORD900_dataset_v1.xlsx" });
  document.body.innerHTML = "";
  render(await DatasetPage({ params: Promise.resolve({ id: "d-1" }), searchParams: Promise.resolve(query) }));
};
const signatures = () => screen.getByRole("region", { name: "Signatures" });
const preview = () => screen.getByRole("region", { name: "Excel preview" });

describe("dataset version page (prototype a15)", () => {
  it("titles the release with where it goes, Download Excel and a Release button that says what is missing", async () => {
    await show(ben, { signatures: [signature(ana)] });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Release · ORD900 · dataset v1");
    expect(screen.getByText('Goes to Example Client\'s Nexo project "ORD900 Synthetic pilot"')).toBeVisible();
    expect(screen.getByRole("link", { name: "Download Excel" })).toHaveAttribute("href", "/admin/release/d-1/workbook");
    expect(screen.getByRole("button", { name: "Release (needs 2nd signature)" })).toBeDisabled();
  });
  it("signatures side panel: who signed (role, time, note) and the pending signer with the one Sign button", async () => {
    await show(ben, { signatures: [signature(ana, "Blank relabelled after operator answer")] });
    const signed = within(signatures()).getByRole("listitem", { name: /^Example Ana/ });
    expect(signed).toHaveTextContent(/Example Ana · Admin\s*signed .+ · Reviewed · "Blank relabelled after operator answer"/);
    const pending = within(signatures()).getByRole("listitem", { name: /^Example Ben/ });
    expect(pending).toHaveTextContent(/Example Ben · Owner\s*countersign required/);
    expect(within(pending).getByRole("button", { name: "Sign" })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Sign" })).toHaveLength(1);
    expect(signatures()).toHaveTextContent("The two signers must be different people. Releasing locks v1; any change becomes v2 and v1 stays downloadable.");
  });
  it("someone who already signed is told why there is nothing to do", async () => {
    await show(ana, { signatures: [signature(ana)] });
    expect(signatures()).toHaveTextContent("You already signed. Waiting for a second signer.");
    expect(screen.queryByRole("button", { name: "Sign" })).not.toBeInTheDocument();
    expect(within(signatures()).getByRole("listitem", { name: /^Example Ben/ })).toHaveTextContent("countersign required");
  });
  it("a person outside the policy gets the reason, not a form", async () => {
    await show(op);
    expect(signatures()).toHaveTextContent("You are not an eligible signer under the current policy.");
    expect(within(signatures()).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release (needs 2 signatures)" })).toBeDisabled();
  });
  it("demo: each pending demo signer has a Sign button that acts as that person", async () => {
    await show(op, { signatures: [signature(ana)] }, {}, [ana, ben, op]);
    const pending = within(signatures()).getByRole("listitem", { name: /^Example Ben/ });
    const form = within(pending).getByRole("button", { name: "Sign" }).closest("form")!;
    expect(form.querySelector('input[name="actor"]')).toHaveValue("u-ben");
  });
  it("count met: the header Release button is enabled, once", async () => {
    await show(ana, { signatures: [signature(ana), signature(ben)] });
    expect(screen.getByRole("button", { name: "Release dataset" })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Release dataset" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Sign" })).not.toBeInTheDocument();
  });
  it("released: no Release button; Withdraw stays in its own panel", async () => {
    await show(ana, { status: "released", releasedAt: "2026-11-09T18:00:00Z", projectId: "p-1", projectName: "ORD900 Synthetic pilot", signatures: [signature(ana), signature(ben)] });
    expect(screen.getByText('Released to Example Client\'s Nexo project "ORD900 Synthetic pilot"')).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Release/ })).not.toBeInTheDocument();
    expect(signatures()).toHaveTextContent("Nothing left to sign");
    expect(within(screen.getByRole("region", { name: "Withdraw" })).getByRole("button", { name: "Withdraw" })).toBeVisible();
  });
  it("Excel preview: four sheet tabs, the selected sheet's first rows and columns from the stored workbook, NA as NA", async () => {
    await show(ben);
    const tabs = within(preview()).getByRole("navigation", { name: "Workbook sheets" });
    expect(within(tabs).getAllByRole("link").map(link => link.textContent)).toEqual(["Abundance", "Metadata", "Internal standards", "Provenance"]);
    expect(within(tabs).getByRole("link", { name: "Abundance" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "Internal standards" })).toHaveAttribute("href", "/release/d-1?sheet=Internal_Standards");
    const table = within(preview()).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Lipid", "Example_A", "Example_B", "Example_C"]);
    const rows = within(table).getAllByRole("row").slice(1).map(row => within(row).getAllByRole("cell").map(cell => cell.textContent));
    expect(rows).toEqual([["CE(16:0)+NH4", "9612920.8", "6236944.9", "12201764.9"], ["CE(14:0)+NH4", "NA", "21602.9", "NA"]]);
    expect(preview()).toHaveTextContent("2 of 2 rows · 4 of 4 columns");
    expect(readDatasetWorkbook).toHaveBeenCalledWith(expect.objectContaining({ id: "d-1" }));
  });
  it("Excel preview: ?sheet= picks the tab", async () => {
    await show(ben, {}, { sheet: "Metadata" });
    expect(within(preview()).getByRole("link", { name: "Metadata" })).toHaveAttribute("aria-current", "page");
    expect(within(preview()).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["FullName", "Group1Term"]);
  });
  it("a stored workbook that cannot be read is said so, and Download Excel is off", async () => {
    vi.mocked(readDatasetWorkbook).mockReset();
    const view: ReleaseView = { dataset: dataset(), policy: { ...defaultPolicy, requiredSignatures: 2 }, people: [ana, ben, op], me: ben, versions: [], demoActors: null };
    vi.mocked(getDataset).mockResolvedValue(view);
    vi.mocked(readDatasetWorkbook).mockRejectedValue(new DataError("The stored workbook does not match the digest recorded when this version was built; it is not shown."));
    document.body.innerHTML = "";
    render(await DatasetPage({ params: Promise.resolve({ id: "d-1" }), searchParams: Promise.resolve({}) }));
    expect(preview()).toHaveTextContent("does not match the digest recorded");
    expect(within(preview()).queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download Excel" })).not.toBeInTheDocument();
    expect(screen.getByText("Download Excel")).toHaveAttribute("aria-disabled", "true");
  });
  it("shows every digest of the manifest short with a copy button, the source TXT too", async () => {
    await show(ana);
    const manifest = screen.getByRole("region", { name: "Files of this version" });
    expect(within(manifest).getAllByRole("button", { name: /^Copy SHA-256 of / })).toHaveLength(4);
    expect(within(manifest).getByRole("button", { name: "Copy SHA-256 of Source TXT" })).toBeVisible();
  });
  it("lists the QC review's exclusions in force at the build as recorded decisions (code, reason, who, when)", async () => {
    await show(ana, { exclusions: [{ sampleCode: "ORD900-S002", reason: "haemolysed tube", decidedBy: "Example Operator", decidedAt: "2026-11-09T15:00:00Z" }] });
    const manifest = screen.getByRole("region", { name: "Files of this version" });
    const list = within(manifest).getByRole("list", { name: "Sample exclusions" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(list).toHaveTextContent(/ORD900-S002 · haemolysed tube\s*Example Operator · /);
    expect(manifest).toHaveTextContent("They are not applied to the files: every sample's data is in this version.");
    await show(ana);
    expect(within(screen.getByRole("region", { name: "Files of this version" })).getByText("None recorded when this version was built.")).toBeInTheDocument();
  });
});
