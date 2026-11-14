import "server-only";
import ExcelJS from "exceljs";

// The release page's Excel preview: the first rows and columns of one sheet of the stored dataset workbook, read
// on the server. Read only: values are shown as stored (a number's own shortest form, no rounding, no thousands
// separators), and an empty cell reads NA, as Nexo reads it. QC_Injections stays out of the tabs.
export const PREVIEW_SHEETS = [
  { name: "Abundance", label: "Abundance" },
  { name: "Metadata", label: "Metadata" },
  { name: "Internal_Standards", label: "Internal standards" },
  { name: "Provenance", label: "Provenance" },
] as const;
export type PreviewSheetName = (typeof PREVIEW_SHEETS)[number]["name"];
export const PREVIEW_ROWS = 20;
export const PREVIEW_COLUMNS = 8;

// The sheet a ?sheet= query asks for, or Abundance.
export function previewSheetName(query: string | string[] | undefined): PreviewSheetName {
  const asked = Array.isArray(query) ? query[0] : query;
  return PREVIEW_SHEETS.find(sheet => sheet.name === asked)?.name ?? "Abundance";
}

export type PreviewCell = { text: string; kind: "number" | "text" | "empty" };
// numeric: per column, whether every shown value is a number (or empty / NA); such columns align right.
export type SheetPreview = { name: PreviewSheetName; header: string[]; rows: PreviewCell[][]; numeric: boolean[]; totalRows: number; totalColumns: number };

function cell(value: ExcelJS.CellValue): PreviewCell {
  if (value === null || value === undefined || value === "") return { text: "NA", kind: "empty" };
  if (typeof value === "number") return { text: String(value), kind: "number" };
  if (typeof value === "string") return { text: value, kind: "text" };
  if (typeof value === "boolean") return { text: value ? "TRUE" : "FALSE", kind: "text" };
  if (value instanceof Date) return { text: value.toISOString(), kind: "text" };
  if ("richText" in value) return { text: value.richText.map(part => part.text).join(""), kind: "text" };
  if ("error" in value) return { text: String(value.error), kind: "text" };
  if ("result" in value && value.result !== undefined) return cell(value.result as ExcelJS.CellValue);
  if ("text" in value && typeof value.text === "string") return { text: value.text, kind: "text" };
  return { text: String(value), kind: "text" };
}

export async function previewSheet(bytes: Buffer, name: PreviewSheetName, rows = PREVIEW_ROWS, columns = PREVIEW_COLUMNS): Promise<SheetPreview> {
  const book = new ExcelJS.Workbook();
  // A copy: exceljs reads from it, the caller's bytes stay as they are.
  await book.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof book.xlsx.load>[0]);
  const sheet = book.getWorksheet(name);
  if (!sheet) throw new Error(`The stored workbook has no ${name} sheet.`);
  const width = Math.min(columns, sheet.columnCount);
  const read = (number: number) => Array.from({ length: width }, (_, index) => cell(sheet.getRow(number).getCell(index + 1).value));
  const last = Math.min(sheet.rowCount, rows + 1);
  const header = read(1).map(item => item.kind === "empty" ? "" : item.text);
  const body = Array.from({ length: Math.max(0, last - 1) }, (_, index) => read(index + 2));
  const numeric = header.map((_, c) => body.some(row => row[c].kind === "number") && body.every(row => row[c].kind !== "text" || row[c].text === "NA"));
  return {
    name, header, rows: body, numeric,
    totalRows: Math.max(0, sheet.rowCount - 1),
    totalColumns: sheet.columnCount,
  };
}
