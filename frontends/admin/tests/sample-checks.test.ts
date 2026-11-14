import { describe, expect, it } from "vitest";
import { applyFixes, checkSamples, columnMatches, fullNameStem, matchColumns, readPaste, rowsFromPaste, summarizeChecks } from "@/lib/sample-checks";
import { emptyDraft, type SampleDraft } from "@/lib/samples";

const row = (values: Partial<SampleDraft>): SampleDraft => ({ ...emptyDraft(), patient_term: "NA", replicate_term: "1", group2_term: "WT", time_point_term: "NA", ...values });
// The prototype's example: three controls at 0h, apoptotic cells at 2h and 6h. Invented data.
const example = (): SampleDraft[] => [
  row({ client_sample_id: "MF-ctl-1", full_name: "Ctrl_0h_R1", group1_term: "Control", time_point_term: "0h" }),
  row({ client_sample_id: "MF-ctl-2", full_name: "Ctrl_0h_R2", group1_term: "Control", time_point_term: "0h", replicate_term: "2" }),
  row({ client_sample_id: "MF-ctl-3", full_name: "Ctrl_0h_R2", group1_term: "Control", time_point_term: "0h", replicate_term: "3" }),
  row({ client_sample_id: "MF-AC-1", full_name: "AC_2h_R1", group1_term: "Apoptotic cells", time_point_term: "2h" }),
  row({ client_sample_id: "MF-AC-2", full_name: "AC_2h_R2", group1_term: "Apoptotic cells", time_point_term: "", replicate_term: "2" }),
  row({ client_sample_id: "MF-AC-3", full_name: "AC_2h_R3", group1_term: "Apoptotic cel", group2_term: "KO", time_point_term: "2h", replicate_term: "3" }),
  row({ client_sample_id: "MF-AC-4", full_name: "AC_6h_R1", group1_term: "Apoptotic cells", time_point_term: "6h" }),
];

describe("automatic column matching", () => {
  it("matches the client's headers to the Metadata columns and says which ones were renamed", () => {
    const headers = ["Client ID", "FullName", "Group 1", "Group2Term", "Replicate", "Patient", "Time", "Matrix", "Notes"];
    const mapping = matchColumns(headers);
    expect(mapping).toEqual(["client_sample_id", "full_name", "group1_term", "group2_term", "replicate_term", "patient_term", "time_point_term", "matrix", null]);
    expect(columnMatches(headers, mapping)).toEqual([
      { from: "Client ID", to: "client_sample_id" }, { from: "Group 1", to: "group1_term" }, { from: "Replicate", to: "replicate_term" },
      { from: "Patient", to: "patient_term" }, { from: "Time", to: "time_point_term" },
    ]);
  });
  it("gives a column to the first header that claims it and leaves a repeat unused", () => {
    expect(matchColumns(["Time", "TimePointTerm"])).toEqual(["time_point_term", null]);
  });
  it("recognises a header row even when its first cell is not a known column", () => {
    const paste = readPaste("Box\tFullName\tGroup 1\nA1\tCtrl_1\tControl");
    expect(paste.headers).toEqual(["Box", "FullName", "Group 1"]);
    expect(paste.cells).toEqual([["A1", "Ctrl_1", "Control"]]);
  });
  it("reads a paste without a header in the grid's order and re-reads it with an overridden mapping", () => {
    const paste = readPaste("Ctrl_1\tControl\tWT");
    expect(paste.headers).toBeNull();
    expect(rowsFromPaste(paste.cells, paste.mapping)[0]).toMatchObject({ full_name: "Ctrl_1", group1_term: "Control", group2_term: "WT" });
    const swapped = rowsFromPaste(paste.cells, ["full_name", "group2_term", "group1_term"]);
    expect(swapped[0]).toMatchObject({ group1_term: "WT", group2_term: "Control" });
  });
});

describe("errors", () => {
  it("flags a FullName used twice on the later row, and one already registered in the order", () => {
    const issues = checkSamples(example(), { existingNames: ["AC_6h_R1"] }).filter(issue => issue.field === "full_name");
    expect(issues).toEqual([
      { severity: "error", row: 2, field: "full_name", message: "FullName Ctrl_0h_R2 is already used. Nexo matches samples by FullName." },
      { severity: "error", row: 6, field: "full_name", message: "FullName AC_6h_R1 is already registered in this order. Nexo matches samples by FullName." },
    ]);
  });
  it("flags an empty TimePointTerm in a time-course design and accepts NA", () => {
    const drafts = example();
    expect(checkSamples(drafts).filter(issue => issue.field === "time_point_term")).toEqual([
      { severity: "error", row: 4, field: "time_point_term", message: "TimePointTerm is empty in a time-course design. Write NA only if there is none." },
    ]);
    drafts[4].time_point_term = "NA";
    expect(checkSamples(drafts).filter(issue => issue.field === "time_point_term")).toEqual([]);
  });
  it("does not call a design time-course when every TimePointTerm is NA", () => {
    const drafts = [row({ full_name: "A_1", group1_term: "A", time_point_term: "NA" }), row({ full_name: "A_2", group1_term: "A", time_point_term: "NA" }), row({ full_name: "B_1", group1_term: "B", time_point_term: "na" }), row({ full_name: "B_2", group1_term: "B", time_point_term: "NA" })];
    expect(checkSamples(drafts)).toEqual([]);
  });
  it("flags a required Metadata column that no row fills, once for the whole list", () => {
    const drafts = example().map(draft => ({ ...draft, patient_term: "" }));
    expect(checkSamples(drafts).filter(issue => issue.field === "patient_term")).toEqual([
      { severity: "error", row: null, field: "patient_term", message: "PatientTerm column is missing. Nexo needs the six Metadata columns: map a pasted column to it, or write NA where it does not apply." },
    ]);
  });
  it("checks client IDs against the manifest only when there is one", () => {
    const drafts = example();
    expect(checkSamples(drafts).some(issue => issue.field === "client_sample_id")).toBe(false);
    const issues = checkSamples(drafts, { manifest: ["mf-ctl-1", "MF-ctl-2", "MF-ctl-3", "MF-AC-1", "MF-AC-2", "MF-AC-3", "MF-AC-04"] }).filter(issue => issue.field === "client_sample_id");
    expect(issues).toEqual([{ severity: "error", row: 6, field: "client_sample_id", message: "Client ID MF-AC-4 is not in the client's manifest." }]);
  });
  it("keeps the volume check", () => {
    const drafts = example();
    drafts[0].volume_ul = "50 µL";
    expect(checkSamples(drafts).filter(issue => issue.field === "volume_ul")).toHaveLength(1);
  });
});

describe("warnings and their fixes", () => {
  it("finds a near-duplicate label and a group term used once, and suggests both fixes from the rest of the list", () => {
    const warnings = checkSamples(example()).filter(issue => issue.severity === "warning");
    expect(warnings).toEqual([
      { severity: "warning", row: 5, field: "group1_term", message: "\"Apoptotic cel\" looks like \"Apoptotic cells\"", fix: "Apoptotic cells" },
      { severity: "warning", row: 5, field: "group2_term", message: "Group2Term \"KO\" appears once", fix: "WT" },
    ]);
  });
  it("offers no fix when the suggestion is ambiguous", () => {
    const drafts = [row({ full_name: "Ctrl_1", group1_term: "Control" }), row({ full_name: "Ctrl_2", group1_term: "control" }), row({ full_name: "Trt_1", group1_term: "Treated" }), row({ full_name: "Trt_2", group1_term: "Treated", group2_term: "KO" })];
    const warnings = checkSamples(drafts).filter(issue => issue.severity === "warning");
    expect(warnings.map(issue => [issue.row, issue.field, issue.fix])).toEqual([[0, "group1_term", undefined], [1, "group1_term", undefined], [3, "group2_term", undefined]]);
  });
  it("does not mistake numbered levels for typos", () => {
    const drafts = [row({ full_name: "D1_1", group1_term: "Dose1" }), row({ full_name: "D1_2", group1_term: "Dose1" }), row({ full_name: "D2_1", group1_term: "Dose2" }), row({ full_name: "D2_2", group1_term: "Dose2" })];
    expect(checkSamples(drafts)).toEqual([]);
  });
  it("warns once for the list when Group1Term has fewer than 2 levels", () => {
    const drafts = [row({ full_name: "Ctrl_1", group1_term: "Control" }), row({ full_name: "Ctrl_2", group1_term: "Control" })];
    expect(checkSamples(drafts)).toEqual([{ severity: "warning", row: null, field: "group1_term", message: "Group1Term has only one level (Control). A comparison needs at least 2." }]);
  });
  it("applies only the unambiguous fixes of one row", () => {
    const drafts = example();
    const fixed = applyFixes(drafts, checkSamples(drafts), 5);
    expect(fixed[5]).toMatchObject({ group1_term: "Apoptotic cells", group2_term: "WT" });
    expect(checkSamples(fixed).filter(issue => issue.severity === "warning")).toEqual([]);
    expect(drafts[5].group1_term).toBe("Apoptotic cel");
  });
  it("finds the replicate set from the FullName", () => {
    expect(["AC_2h_R3", "Ctrl_1", "Sample-12", "Plain"].map(fullNameStem)).toEqual(["AC_2h", "Ctrl", "Sample", "Plain"]);
  });
});

describe("summary", () => {
  it("counts valid rows, errors and warnings as the fix list shows them, one line per row", () => {
    const drafts = example();
    const summary = summarizeChecks(drafts, checkSamples(drafts));
    expect(summary.validRows).toEqual([0, 1, 3, 5, 6]);
    expect(summary.items.map(item => [item.severity, item.row, item.text])).toEqual([
      ["error", 2, "Row 3: FullName Ctrl_0h_R2 is already used. Nexo matches samples by FullName."],
      ["error", 4, "Row 5: TimePointTerm is empty in a time-course design. Write NA only if there is none."],
      ["warning", 5, "Row 6: \"Apoptotic cel\" looks like \"Apoptotic cells\"; Group2Term \"KO\" appears once."],
    ]);
    expect(summary.errors).toBe(2);
    expect(summary.warnings).toBe(1);
    expect(summary.items[2].fixes).toEqual([{ field: "group1_term", value: "Apoptotic cells" }, { field: "group2_term", value: "WT" }]);
  });
});
