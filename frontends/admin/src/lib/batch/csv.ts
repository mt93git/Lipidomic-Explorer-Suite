import type { Injection } from "./index";

type Cell = string | number | null;

/** Formula-safe text, RFC 4180 quoting and CRLF records; nulls become empty cells. No BOM. */
export function serializeCsv(headers: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const escape = (value: Cell): string => {
    const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value)
      ? `'${value}`
      : value === null ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map(row => row.map(escape).join(",")).join("\r\n") + "\r\n";
}

/** Generic sequence columns match the planned admin.injection fields, in seq order supplied. */
export function toSequenceCsv(list: readonly Injection[]): string {
  const columns = ["seq", "sample_type", "sample_name", "client_id", "aliquot_id", "plate", "vial"] as const;
  return serializeCsv(columns, list.map(row => columns.map(column => row[column])));
}

/** Generic bench sheet puts physical location first; preserves the supplied injection order. */
export function toBenchSheetCsv(list: readonly Injection[]): string {
  const columns = ["plate", "vial", "seq", "sample_type", "sample_name", "FullName", "client_id", "aliquot_id"] as const;
  return serializeCsv(columns, list.map(row => columns.map(column => row[column])));
}
