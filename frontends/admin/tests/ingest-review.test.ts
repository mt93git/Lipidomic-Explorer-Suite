// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { summarizeResults } from "@/lib/results";
import { diffCounts, fileCheckRows, openStops, parseNameList, resultCounts, statTiles } from "@/lib/ingest-review";

const source = readFileSync(new URL("../e2e/fixtures/sciex-synthetic.txt", import.meta.url), "utf8");
const flagged = source.split("\n").map((line, i) => {
  if (i < 2 || !line) return line;
  const cells = line.split("\t"); cells[4] = "1"; return cells.join("\t");
}).join("\n");

describe("ingest review presentation", () => {
  it("builds the five tiles: samples with their type split, lipids, standards, N/A share and names to map", () => {
    const tiles = statTiles(summarizeResults(source), 12);
    expect(tiles.map(t => [t.value, t.label])).toEqual([
      ["5", "samples · 3 Unknown, 1 Blank, 1 QC"], ["33", "lipids"], ["6", "internal standards"],
      [expect.stringMatching(/^\d+\.\d %$/), "cells N/A → NA"], ["12", "names to map"],
    ]);
    expect(tiles[4]!.tone).toBe("warn");
  });
  it("lists the file checks in the prototype's order with ok/stop results", () => {
    const rows = fileCheckRows(summarizeResults(flagged));
    expect(rows.map(r => r.check)).toEqual(["Row 1 is Sample Name", "Row 2 is Sample Type", "Sample Names unique and in registry", "Sample Type matches the batch", "Rows ending in .IS", "ISTD kits", "Rows on the drop list", "Lipids never detected", "Pooled QC injections", "Blanks detect few lipids"]);
    expect(rows[2]).toMatchObject({ result: "5 / 5", status: "ok" });
    expect(rows[4]).toMatchObject({ result: "6 → ISTD sheet" });
    expect(rows.at(-1)).toMatchObject({ result: "1 like a sample", status: "stop" });
    expect(openStops(summarizeResults(flagged).checks)).toBe(1);
    expect(openStops(summarizeResults(source).checks)).toBe(0);
  });
  it("shows the detection bars: min, median, max and the blank flagged when it behaves like a sample", () => {
    expect(summarizeResults(source).detection.at(-1)).toMatchObject({ kind: "blank", likeSample: false });
    expect(summarizeResults(flagged).detection.at(-1)).toMatchObject({ kind: "blank", likeSample: true });
    expect(summarizeResults(source).detection.map(bar => bar.kind)).toEqual(["min", "median", "max", "blank"]);
  });
  it("diffs counts against the previously accepted file, also an older summary without the profile", () => {
    const current = resultCounts(summarizeResults(source));
    const previous = resultCounts({ injections: { Unknown: 2, Blank: 1 }, analytes: ["a"], internalStandards: 6, naShare: 0.5 });
    const diff = diffCounts(current, previous);
    expect(diff.find(d => d.label === "Samples")).toMatchObject({ previous: "3", current: "5", change: "+2", changed: true });
    expect(diff.find(d => d.label === "Internal standards")).toMatchObject({ change: "=", changed: false });
    expect(diff.find(d => d.label === "Median detected lipids")).toBeUndefined();
    expect(diff.at(-1)!.label).toBe("Cells N/A");
  });
  it("reads an import list: header optional, quotes, tabs, duplicates and blanks reported", () => {
    const result = parseNameList('export name,clean name\nCE 24:4 +NH4,CE(24:4)+NH4\n"PC(16:0,18:1)+H","PC(16:0_18:1)+H"\n\nTG 52:2\tTAG(52:2)+NH4\nCE 24:4 +NH4,dup\nonly one cell\n');
    expect(result.rows).toEqual([
      { export_name: "CE 24:4 +NH4", clean_name: "CE(24:4)+NH4" },
      { export_name: "PC(16:0,18:1)+H", clean_name: "PC(16:0_18:1)+H" },
      { export_name: "TG 52:2", clean_name: "TAG(52:2)+NH4" },
    ]);
    expect(result.errors).toEqual(["Row 6: CE 24:4 +NH4 appears twice in the list.", "Row 7: needs an export name and a clean name."]);
  });
});
