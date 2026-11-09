// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { summarizeResults, canAcceptResults, unmappedAnalytes } from "@/lib/results";
const source = readFileSync(new URL("../e2e/fixtures/sciex-synthetic.txt", import.meta.url), "utf8");
describe("results summary and gate", () => {
  it("counts types, retained analytes, standards, drops and missing share", () => {
    const result = summarizeResults(source);
    expect(result.injections).toEqual({ Unknown: 3, Blank: 1, "Quality Control": 1 });
    expect(result.analytes).toHaveLength(33);
    expect(result.internalStandards).toBe(6);
    expect(result.duplicatesDropped).toBe(1);
    expect(result.naShare).toBeGreaterThan(0);
  });
  it("requires a nonblank reason for a sample-like blank", () => {
    const flagged = source.split("\n").map((line, i) => {
      if (i < 2 || !line) return line;
      const cells = line.split("\t"); cells[4] = "1"; return cells.join("\t");
    }).join("\n");
    const result = summarizeResults(flagged);
    expect(result.checks.find(c => c.id === "blank-detection")?.status).toBe("stop");
    expect(canAcceptResults(result.checks, "  ")).toBe(false);
    expect(canAcceptResults(result.checks, "Reviewed synthetic blank")).toBe(true);
    expect(canAcceptResults([{ id: "qc", status: "warn", message: "QC absent" }], "")).toBe(true);
  });
  it("matches dictionary names exactly", () => {
    expect(unmappedAnalytes(["PC", "CE"], [{ export_name: "PC", clean_name: "Phosphatidylcholine" }])).toEqual(["CE"]);
  });
});
