import { describe, expect, it } from "vitest";
import { boxGrid, colourSlots, orderOf, parsePosition, parseStatusPaste, statusCounts } from "@/lib/visual-map";

describe("colour slots", () => {
  it("gives each distinct key a stable slot in sorted order and wraps after eight", () => {
    const slots = colourSlots(["Cedar", "Atlas", null, "Cedar", "Harbor"]);
    expect([...slots]).toEqual([["Atlas", 0], ["Cedar", 1], ["Harbor", 2]]);
    const many = colourSlots(Array.from({ length: 10 }, (_, i) => `ORD${700 + i}`));
    expect(many.get("ORD708")).toBe(0);
    expect(many.get("ORD709")).toBe(1);
  });
});

describe("freezer box grid", () => {
  it("parses a row letter and column number in the forms the lab writes", () => {
    expect(parsePosition("A1")).toEqual({ row: 0, column: 1 });
    expect(parsePosition(" c4 ")).toEqual({ row: 2, column: 4 });
    expect(parsePosition("D 12")).toEqual({ row: 3, column: 12 });
    expect(parsePosition("B-3")).toEqual({ row: 1, column: 3 });
    expect(parsePosition("shelf 2")).toBeNull();
    expect(parsePosition("A0")).toBeNull();
  });

  it("lays items on a 9 × 9 box, counts the free positions and keeps the rest off the grid", () => {
    const items = [{ p: "A1" }, { p: "C4" }, { p: "top shelf" }, { p: "a1" }];
    const grid = boxGrid(items, item => item.p);
    expect(grid.rows).toHaveLength(9);
    expect(grid.columns).toHaveLength(9);
    expect(grid.cells[0][0].item).toBe(items[0]);
    expect(grid.cells[2][3]).toEqual({ position: "C4", item: items[1] });
    expect(grid.offGrid).toEqual([items[2], items[3]]);
    expect(grid.free).toBe(79);
  });

  it("grows when a position lies outside 9 × 9", () => {
    const grid = boxGrid([{ p: "J10" }], item => item.p);
    expect(grid.rows.at(-1)).toBe("J");
    expect(grid.columns.at(-1)).toBe(10);
  });
});

describe("plate groups", () => {
  it("finds the order of an Unknown from the registry, the sample code or a SCIEX name; controls have none", () => {
    expect(orderOf({ sample_type: "Unknown", sample_name: "ORD699-S001", orderCode: "ORD699" })).toBe("ORD699");
    expect(orderOf({ sample_type: "Unknown", sample_name: "ORD042-S003" })).toBe("ORD042");
    expect(orderOf({ sample_type: "Unknown", sample_name: "B2026-031_017_ORD041-S037" })).toBe("ORD041");
    expect(orderOf({ sample_type: "Quality Control", sample_name: "QC_001" })).toBeNull();
  });
});

describe("run monitor paste", () => {
  const names = ["Blank_001", "ORD699-S001", "ORD699-S002", "QC_001"];
  it("matches each line by injection name and status word, whatever the separator", () => {
    const text = [
      "Sample Name\tStatus\tData File",
      "Blank_001\tAcquired\tB2026-337.wiff2",
      "ORD699-S001, Failed, ",
      "ORD699-S002   Waiting",
      "QC_001;Completed",
      "",
      "Other_009\tAcquired",
    ].join("\n");
    const { rows, unmatched } = parseStatusPaste(text, names);
    expect(rows).toEqual([
      { sample_name: "Blank_001", status: "acquired" }, { sample_name: "ORD699-S001", status: "failed" },
      { sample_name: "ORD699-S002", status: "planned" }, { sample_name: "QC_001", status: "acquired" },
    ]);
    expect(unmatched).toEqual(["Sample Name\tStatus\tData File", "Other_009\tAcquired"]);
  });

  it("keeps the last line for a name and counts statuses", () => {
    const { rows } = parseStatusPaste("QC_001\tfailed\nQC_001\tacquired", names);
    expect(rows).toEqual([{ sample_name: "QC_001", status: "acquired" }]);
    expect(statusCounts([{ status: "acquired" }, { status: "failed" }, { status: "acquired" }, { status: "planned" }]))
      .toEqual({ planned: 1, acquired: 2, failed: 1, skipped: 0 });
  });
});
