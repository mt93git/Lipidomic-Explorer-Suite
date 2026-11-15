// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { summarizeResults } from "@/lib/results";
import { matchSamples } from "@/lib/release";
import { toBenchSheetCsv, toSequenceCsv } from "@/lib/batch/csv";
import type { Injection } from "@/lib/batch";
import { resultsForBatch } from "../e2e/live/pilot-results.mjs";

// The pilot (e2e/live/pilot.spec.ts) uploads the synthetic SCIEX export renamed to the injections of the batch it
// planned: Unknown columns by sample code (through the bench sheet's FullName), controls by the batch's own names.
const fixture = readFileSync(join(__dirname, "../../../packages/admin-ingest/test/fixtures/sciex-synthetic.txt"), "utf8");
const unknown = (seq: number, code: string, fullName: string, vial: string): Injection =>
  ({ seq, sample_type: "Unknown", sample_name: code, FullName: fullName, client_id: "client-1", aliquot_id: `sample-${seq}`, plate: "Plate 1", vial });
const control = (seq: number, sample_type: "Blank" | "Quality Control", sample_name: string, vial: string): Injection =>
  ({ seq, sample_type, sample_name, FullName: null, client_id: null, aliquot_id: null, plate: "Plate 1", vial });
// A randomized plan: the registry gave S1 → S001 …, the seed put them in another order.
const batch = [control(1, "Blank", "Blank_001", "A1"), unknown(2, "ORD321-S002", "S2", "B1"), unknown(3, "ORD321-S003", "S3", "C1"),
  unknown(4, "ORD321-S001", "S1", "D1"), control(5, "Quality Control", "QC_001", "E1")];
const files = { fixture, sequence: toSequenceCsv(batch), benchSheet: toBenchSheetCsv(batch) };

describe("pilot results file", () => {
  it("names every injection as the batch did, and changes nothing else", () => {
    const { text, unknownNames } = resultsForBatch(files);
    const [header, ...rest] = text.split("\n");
    expect(header.split("\t")).toEqual(["Sample Name", "ORD321-S001", "ORD321-S002", "ORD321-S003", "Blank_001", "QC_001"]);
    expect(rest).toEqual(fixture.split("\n").slice(1));
    expect(unknownNames).toEqual(["ORD321-S001", "ORD321-S002", "ORD321-S003"]);
  });

  it("parses as before and matches the registry by code, so the dataset keeps the FullName headers S1–S3", () => {
    const { text, unknownNames } = resultsForBatch(files);
    expect(summarizeResults(text).checks.filter(check => check.status === "stop")).toEqual([]);
    const registry = ["S1", "S2", "S3"].map((name, i) => ({ code: `ORD321-S00${i + 1}`, full_name: name, group1_term: null, group2_term: null, replicate_term: null, patient_term: null, time_point_term: null }));
    const match = matchSamples(unknownNames, registry);
    expect(match).toMatchObject({ matched: 3, headerMode: "fullName", unmatched: [] });
    expect(match.metadata.map(row => row.FullName)).toEqual(["S1", "S2", "S3"]);
  });

  it("refuses a batch that does not hold exactly the export's samples and controls", () => {
    const without = (type: Injection["sample_type"]) => batch.filter(row => row.sample_type !== type);
    const csv = (rows: Injection[]) => ({ fixture, sequence: toSequenceCsv(rows), benchSheet: toBenchSheetCsv(rows) });
    expect(() => resultsForBatch(csv(batch.filter(row => row.FullName !== "S3")))).toThrow(/S3/);
    expect(() => resultsForBatch(csv([...batch, unknown(6, "ORD321-S004", "S4", "F1")]))).toThrow(/ORD321-S004/);
    expect(() => resultsForBatch(csv(without("Blank")))).toThrow(/Blank/);
    expect(() => resultsForBatch(csv(without("Quality Control")))).toThrow(/Quality Control/);
  });
});
