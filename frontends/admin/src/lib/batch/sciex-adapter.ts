import type { Injection } from "./index";
import { serializeCsv } from "./csv";

// PENDING: Usman's blank SCIEX OS template
// These are placeholder columns, NOT a verified SCIEX OS import format.
// Replace this mapping and validate against the supplied template before instrument use.
export function toSciexBatchCsv(list: readonly Injection[]): string {
  return serializeCsv(
    ["PENDING_Sequence", "PENDING_Sample_Type", "PENDING_Sample_Name", "PENDING_Plate", "PENDING_Vial"],
    list.map(row => [row.seq, row.sample_type, row.sample_name, row.plate, row.vial]),
  );
}
