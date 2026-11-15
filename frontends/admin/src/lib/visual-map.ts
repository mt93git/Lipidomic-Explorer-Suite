// The colour-coded maps of Storage (a freezer box) and Batch (the 96-well plate), and the run monitor's paste parser.
// Pure functions; the screens are in app/(workspace)/storage and batch-builder / batch-run.
import type { Injection } from "./batch";

// Eight colour slots, assigned to clients (box) or orders (plate) in a stable, sorted order. The CSS for each slot is
// in components/visual-map.module.css (.c0 … .c7); more than eight groups wrap around.
export const PALETTE_SIZE = 8;
export function colourSlots(keys: Iterable<string | null | undefined>): Map<string, number> {
  const unique = [...new Set([...keys].filter((key): key is string => !!key))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return new Map(unique.map((key, index) => [key, index % PALETTE_SIZE]));
}

// ---------------------------------------------------------------- freezer box

// A position as the lab writes it: one row letter and a column number (A1, c4, "D 12", "B-3"). Anything else is kept
// in the list below the map but has no cell.
const POSITION = /^([A-Za-z])\s*-?\s*(\d{1,2})$/;
export function parsePosition(position: string): { row: number; column: number } | null {
  const match = POSITION.exec(position.trim());
  if (!match) return null;
  const column = Number(match[2]);
  if (column < 1) return null;
  return { row: match[1].toUpperCase().charCodeAt(0) - 65, column };
}
export const positionName = (row: number, column: number) => `${String.fromCharCode(65 + row)}${column}`;

export type BoxCell<T> = { position: string; item: T | null };
export type BoxGrid<T> = { rows: string[]; columns: number[]; cells: BoxCell<T>[][]; offGrid: T[]; free: number };

// The box as a grid: at least 9 × 9 (the lab's standard cryobox), larger when a position needs it. Each item sits in
// its parsed position; items whose position does not parse (or a second item in one cell) go to offGrid.
export function boxGrid<T>(items: readonly T[], positionOf: (item: T) => string | null | undefined, minimum = 9): BoxGrid<T> {
  const placed = new Map<string, T>();
  const offGrid: T[] = [];
  let rows = minimum, columns = minimum;
  for (const item of items) {
    const parsed = parsePosition(positionOf(item) ?? "");
    if (!parsed) { offGrid.push(item); continue; }
    const key = positionName(parsed.row, parsed.column);
    if (placed.has(key)) { offGrid.push(item); continue; }
    placed.set(key, item);
    rows = Math.max(rows, parsed.row + 1);
    columns = Math.max(columns, parsed.column);
  }
  const rowNames = Array.from({ length: rows }, (_, row) => String.fromCharCode(65 + row));
  const columnNumbers = Array.from({ length: columns }, (_, column) => column + 1);
  const cells = rowNames.map((_, row) => columnNumbers.map(column => {
    const position = positionName(row, column);
    return { position, item: placed.get(position) ?? null };
  }));
  return { rows: rowNames, columns: columnNumbers, cells, offGrid, free: rows * columns - placed.size };
}

// ---------------------------------------------------------------- plate

// The order an injection belongs to: the batch page knows it from the registry; a preview names an Unknown by its
// sample code (ORD042-S003) and a SCIEX name embeds it (B2026-031_017_ORD041-S037). Controls have none.
export function orderOf(row: Pick<Injection, "sample_type" | "sample_name"> & { orderCode?: string | null }): string | null {
  if (row.sample_type !== "Unknown") return null;
  return row.orderCode ?? /ORD-?\d+/.exec(row.sample_name)?.[0] ?? null;
}

// ---------------------------------------------------------------- run monitor

export type InjectionStatus = "planned" | "acquired" | "failed" | "skipped";
export const injectionStatuses: InjectionStatus[] = ["planned", "acquired", "failed", "skipped"];

// Words SCIEX OS (and people) use for a row's state, mapped to what Admin records.
const WORDS: [RegExp, InjectionStatus][] = [
  [/^(acquired|acquisition complete|complete|completed|done|ok|success(ful)?)$/i, "acquired"],
  [/^(failed|failure|error|aborted|abort|fail)$/i, "failed"],
  [/^(skipped|skip|not acquired|cancel(l)?ed)$/i, "skipped"],
  [/^(planned|waiting|pending|queued|ready|not started)$/i, "planned"],
];
const statusWord = (text: string): InjectionStatus | null => WORDS.find(([pattern]) => pattern.test(text.trim()))?.[1] ?? null;

export type PastedStatus = { sample_name: string; status: InjectionStatus };
export type PasteResult = { rows: PastedStatus[]; unmatched: string[] };

// The batch status pasted from SCIEX OS: one line per injection, columns split by tabs, commas, semicolons or two or
// more spaces. A line counts when one cell is an injection name of this batch and another cell is a known status word
// (a header line or a row of another batch is listed in `unmatched`, blank lines are ignored). The last line for a name wins.
export function parseStatusPaste(text: string, names: readonly string[]): PasteResult {
  const known = new Set(names);
  const byName = new Map<string, InjectionStatus>();
  const unmatched: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split(/\t|;|,|\s{2,}/).map(cell => cell.trim().replace(/^"|"$/g, "")).filter(Boolean);
    const name = cells.find(cell => known.has(cell));
    const status = cells.map(statusWord).find((word): word is InjectionStatus => word !== null);
    if (name && status) byName.set(name, status);
    else unmatched.push(line.trim());
  }
  return { rows: [...byName].map(([sample_name, status]) => ({ sample_name, status })), unmatched };
}

export function statusCounts(rows: readonly { status: string }[]): Record<InjectionStatus, number> {
  const counts: Record<InjectionStatus, number> = { planned: 0, acquired: 0, failed: 0, skipped: 0 };
  for (const row of rows) if (row.status in counts) counts[row.status as InjectionStatus] += 1;
  return counts;
}

// "Fri 07:15": when a run of `minutes` started at `start` would end, in the lab's time zone.
export function endsAt(start: Date, minutes: number, timeZone = "America/New_York"): string {
  const end = new Date(start.getTime() + Math.round(minutes) * 60_000);
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(end).replace(",", "");
}

// "c4", "C-4" and "C 4" are the cell C4; a position that is not a grid cell is kept as written.
export function normalPosition(position: string): string {
  const parsed = parsePosition(position);
  return parsed ? positionName(parsed.row, parsed.column) : position.trim();
}
