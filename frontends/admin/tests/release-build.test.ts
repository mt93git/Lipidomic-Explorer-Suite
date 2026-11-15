// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ANALYSIS_SHEETS, COMPANION_SHEETS, buildDatasetFiles, splitDatasetV1 } from "@/lib/release-build";
import { matchSamples } from "@/lib/release";

const sourceText = readFileSync(new URL("../e2e/fixtures/sciex-synthetic.txt", import.meta.url), "utf8");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function read(bytes: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
  return book;
}
// Every cell of `name` in both workbooks, as [address, value] pairs.
function cells(book: ExcelJS.Workbook, name: string) {
  const out: [string, unknown][] = [];
  book.getWorksheet(name)!.eachRow({ includeEmpty: true }, row => row.eachCell({ includeEmpty: true }, cell => out.push([cell.address, cell.value])));
  return out;
}

describe("the server-side build: one dataset v1, split into the analysis file and the companion", () => {
  it("keeps sheet names, order and every cell value; records sha256 and size of each file", async () => {
    const built = await buildDatasetFiles({ sourceText, metadata: [], headerMode: "sampleName", datasetVersion: "1", sciexOsVersion: "3.4.5", processingMethod: "Global v1" });
    const [full, analysis, companion] = await Promise.all([read(built.full.bytes), read(built.analysis.bytes), read(built.companion.bytes)]);
    expect(full.worksheets.map(s => s.name)).toEqual(["Abundance", "Metadata", "Internal_Standards", "QC_Injections", "Provenance"]);
    expect(analysis.worksheets.map(s => s.name)).toEqual([...ANALYSIS_SHEETS]);
    expect(companion.worksheets.map(s => s.name)).toEqual([...COMPANION_SHEETS]);
    expect(built.full.sheets).toEqual(["Abundance", "Metadata", "Internal_Standards", "QC_Injections", "Provenance"]);
    expect(built.analysis.sheets).toEqual(["Abundance", "Metadata"]);
    expect(built.companion.sheets).toEqual(["Internal_Standards", "QC_Injections", "Provenance"]);
    for (const name of ANALYSIS_SHEETS) expect(cells(analysis, name), name).toEqual(cells(full, name));
    for (const name of COMPANION_SHEETS) expect(cells(companion, name), name).toEqual(cells(full, name));
    expect(cells(full, "Abundance").length).toBeGreaterThan(100);
    expect(cells(full, "Abundance")).toContainEqual(["A1", "Lipid"]);
    expect(cells(full, "Abundance")).toContainEqual(["A2", "PC(14:0_16:0)+AcO"]); // the SCIEX name as written
    expect(cells(full, "Abundance")).toContainEqual(["B2", 1400.123456789]); // a double, unchanged
    expect(cells(full, "Abundance")).toContainEqual(["D2", 0]); // zero stays zero
    expect(cells(full, "Abundance")).toContainEqual(["C2", null]); // N/A stays empty
    expect(cells(companion, "Provenance")).toContainEqual(["B2", 1]); // dataset_format
    expect(cells(companion, "Provenance")).toContainEqual(["B4", createHash("sha256").update(sourceText, "utf8").digest("hex")]);
    for (const file of [built.full, built.analysis, built.companion]) {
      expect(file.sha256).toBe(sha(file.bytes));
      expect(file.sizeBytes).toBe(file.bytes.byteLength);
      expect(file.sizeBytes).toBeGreaterThan(0);
    }
    expect(new Set([built.full.sha256, built.analysis.sha256, built.companion.sha256]).size).toBe(3);
    expect(built.counts).toEqual({ samples: 3, lipids: 33, internalStandards: 6, qcInjections: 2, dropped: 1 });
  });
  it("renames headers from the registry when every sample is matched", async () => {
    const registry = ["S1", "S2", "S3"].map((code, i) => ({ code, full_name: `Group_${i + 1}`, group1_term: "G", group2_term: null, replicate_term: String(i + 1), patient_term: null, time_point_term: null }));
    const match = matchSamples(["S1", "S2", "S3"], registry);
    const built = await buildDatasetFiles({ sourceText, metadata: match.metadata, headerMode: match.headerMode, datasetVersion: "2" });
    const analysis = await read(built.analysis.bytes);
    expect(analysis.getWorksheet("Abundance")!.getRow(1).values).toEqual([, "Lipid", "Group_1", "Group_2", "Group_3"]);
    const metadata = analysis.getWorksheet("Metadata")!;
    expect(metadata.getRow(1).values).toEqual([, "FullName", "Group1Term", "Group2Term", "ReplicateTerm", "PatientTerm", "TimePointTerm"]);
    expect(["A2", "B2", "C2", "D2", "E2", "F2"].map(address => metadata.getCell(address).value)).toEqual(["Group_1", "G", null, "1", null, null]);
  });
  it("refuses to split a workbook that is not dataset v1", async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet("Sheet1").addRow(["x"]);
    await expect(splitDatasetV1(Buffer.from(await book.xlsx.writeBuffer()))).rejects.toThrow(/dataset v1/);
  });
});
