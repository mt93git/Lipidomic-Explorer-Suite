// @vitest-environment node
// The release page's Excel preview reads the stored workbook as it is: the first rows and columns of one sheet,
// every value shown exactly as stored (no rounding, no separators), an empty cell as NA. Synthetic data only.
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { PREVIEW_SHEETS, previewSheet, previewSheetName } from "@/lib/workbook-preview";

async function workbook(): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const abundance = book.addWorksheet("Abundance");
  abundance.addRow(["Lipid", ...Array.from({ length: 11 }, (_, i) => `Example_${i + 1}`)]);
  abundance.addRow(["CE(16:0)+NH4", 9612920.8, 6236944.9, 12201764.9, 0.000123456789, 1e21, ...Array(6).fill(1)]);
  abundance.addRow(["CE(14:0)+NH4", null, 21602.9, "NA", 0, -4.5]);
  for (let i = 0; i < 30; i++) abundance.addRow([`PC(${i}:0)`, i]);
  book.addWorksheet("Metadata").addRow(["FullName", "Group1Term", "Group2Term"]);
  book.getWorksheet("Metadata")!.addRow(["Example_1", "G1", null]);
  book.addWorksheet("Internal_Standards").addRow(["Lipid", "Example_1"]);
  book.addWorksheet("QC_Injections").addRow(["Lipid", "QC_1"]);
  const provenance = book.addWorksheet("Provenance");
  provenance.addRow(["Key", "Value"]);
  provenance.addRow(["dataset_format", 1]);
  provenance.addRow(["value_type", "raw peak area"]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe("workbook preview", () => {
  it("offers Abundance, Metadata, Internal standards and Provenance as tabs, never QC_Injections", () => {
    expect(PREVIEW_SHEETS.map(sheet => [sheet.name, sheet.label])).toEqual([
      ["Abundance", "Abundance"], ["Metadata", "Metadata"], ["Internal_Standards", "Internal standards"], ["Provenance", "Provenance"],
    ]);
    expect(previewSheetName("Metadata")).toBe("Metadata");
    expect(previewSheetName("QC_Injections")).toBe("Abundance");
    expect(previewSheetName(undefined)).toBe("Abundance");
    expect(previewSheetName(["Provenance", "Metadata"])).toBe("Provenance");
  });
  it("reads the first 20 rows and 8 columns, with the sheet's full size", async () => {
    const preview = await previewSheet(await workbook(), "Abundance");
    expect(preview.header).toEqual(["Lipid", ...Array.from({ length: 7 }, (_, i) => `Example_${i + 1}`)]);
    expect(preview.rows).toHaveLength(20);
    expect(preview.rows.every(row => row.length === 8)).toBe(true);
    expect(preview).toMatchObject({ totalRows: 32, totalColumns: 12 });
  });
  it("shows each value exactly as stored and an empty cell as NA", async () => {
    const preview = await previewSheet(await workbook(), "Abundance");
    expect(preview.rows[0].map(cell => cell.text)).toEqual(["CE(16:0)+NH4", "9612920.8", "6236944.9", "12201764.9", "0.000123456789", "1e+21", "1", "1"]);
    expect(preview.rows[1].map(cell => [cell.text, cell.kind])).toEqual([
      ["CE(14:0)+NH4", "text"], ["NA", "empty"], ["21602.9", "number"], ["NA", "text"], ["0", "number"], ["-4.5", "number"], ["NA", "empty"], ["NA", "empty"],
    ]);
  });
  it("reads Metadata and Provenance; a sheet the workbook lacks is reported, not invented", async () => {
    const bytes = await workbook();
    expect((await previewSheet(bytes, "Metadata")).rows.map(row => row.map(cell => cell.text))).toEqual([["Example_1", "G1", "NA"]]);
    expect((await previewSheet(bytes, "Provenance")).rows.map(row => row.map(cell => cell.text))).toEqual([["dataset_format", "1"], ["value_type", "raw peak area"]]);
    const book = new ExcelJS.Workbook();
    book.addWorksheet("Abundance").addRow(["Lipid"]);
    await expect(previewSheet(Buffer.from(await book.xlsx.writeBuffer()), "Provenance")).rejects.toThrow("The stored workbook has no Provenance sheet.");
  });
  it("never changes the bytes it reads", async () => {
    const bytes = await workbook();
    const copy = Buffer.from(bytes);
    await previewSheet(bytes, "Abundance");
    expect(bytes.equals(copy)).toBe(true);
  });
});
