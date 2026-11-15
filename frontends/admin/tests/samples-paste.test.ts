import { describe, expect, it } from "vitest";
import { columns, parsePaste } from "@/lib/samples";

const header = "FullName\tGroup1Term\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm";

describe("paste from Excel", () => {
  it("reads tab-separated rows in the grid's column order when there is no header", () => {
    const result = parsePaste("Ctrl_1\tControl\tWildType\t1\tP01\t0h\tTube-01\tPlasma\t50\nTrt_1\tTreated\tWildType\t1\tP02\t24h\tTube-02\tPlasma\t50\n");
    expect(result.headerDetected).toBe(false);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      full_name: "Ctrl_1", group1_term: "Control", group2_term: "WildType", replicate_term: "1", patient_term: "P01", time_point_term: "0h",
      client_sample_id: "Tube-01", matrix: "Plasma", volume_ul: "50",
    });
  });
  it("recognises the Metadata sheet header and maps columns by name, in any order and spelling", () => {
    const result = parsePaste("TimePointTerm\tFull name\tGroup 1 Term\n0h\tCtrl_1\tControl\n24h\tTrt_1\tTreated");
    expect(result.headerDetected).toBe(true);
    expect(result.rows.map(r => [r.full_name, r.group1_term, r.time_point_term])).toEqual([["Ctrl_1", "Control", "0h"], ["Trt_1", "Treated", "24h"]]);
    expect(result.rows[0].group2_term).toBe("");
    expect(result.ignoredHeaders).toEqual([]);
  });
  it("reports header columns it does not know and drops their cells", () => {
    const result = parsePaste(`${header}\tNotes\nCtrl_1\tControl\tWildType\t1\tP01\t0h\tkeep cold`);
    expect(result.ignoredHeaders).toEqual(["Notes"]);
    expect(result.rows[0].full_name).toBe("Ctrl_1");
    expect(JSON.stringify(result.rows[0])).not.toContain("keep cold");
  });
  it("skips blank lines and Excel's trailing newline, trims cells and unquotes Excel quoting", () => {
    const result = parsePaste('\r\n Ctrl_1 \t"Control, early"\t"say ""hi"""\r\n\r\nTrt_1\tTreated\r\n');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ full_name: "Ctrl_1", group1_term: "Control, early", group2_term: 'say "hi"' });
    expect(result.rows[1]).toMatchObject({ full_name: "Trt_1", group1_term: "Treated", group2_term: "" });
  });
  it("ignores cells beyond the known columns and returns nothing for an empty paste or a lone header", () => {
    expect(parsePaste("").rows).toEqual([]);
    expect(parsePaste("   \n\n").rows).toEqual([]);
    expect(parsePaste(header)).toMatchObject({ rows: [], headerDetected: true });
    const result = parsePaste("A\tb\tc\td\te\tf\tg\th\t1\textra");
    expect(result.rows).toHaveLength(1);
    expect(Object.keys(result.rows[0])).toHaveLength(columns.length);
  });
  it("lists the six Metadata columns first, in the dataset order, with FullName the only required one", () => {
    expect(columns.slice(0, 6).map(c => c.label)).toEqual(["FullName", "Group1Term", "Group2Term", "ReplicateTerm", "PatientTerm", "TimePointTerm"]);
    expect(columns.filter(c => c.required).map(c => c.field)).toEqual(["full_name"]);
    expect(columns.map(c => c.field)).toEqual(["full_name", "group1_term", "group2_term", "replicate_term", "patient_term", "time_point_term", "client_sample_id", "matrix", "volume_ul"]);
  });
});
