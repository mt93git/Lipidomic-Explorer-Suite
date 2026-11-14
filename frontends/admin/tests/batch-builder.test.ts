import { describe, expect, it } from "vitest";
import {
  builderDefaults, formatRunTime, parseBuilderForm, planBatch, planKey, plateMap, previewMismatch, problemText, rulesRecord, saveInjections, storedMinutes,
  type BuilderSample,
} from "@/lib/batch-builder";

// Synthetic samples of two orders and two clients; the sample id stands in for the aliquot until the batch is saved.
const sample = (n: number, order = "ORD900", client = "client-a"): BuilderSample => ({
  id: `sample-${order}-${n}`, code: `${order}-S${String(n).padStart(3, "0")}`, fullName: `Synthetic_${order}_${n}`,
  orderCode: order, clientId: client, clientName: client === "client-a" ? "Example Atlas" : "Example Cedar",
});
const available = [1, 2, 3, 4, 5].map(n => sample(n)).concat([1, 2].map(n => sample(n, "ORD901", "client-b")));
const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) for (const item of [value].flat()) data.append(name, item);
  return data;
};
const base = { panelId: "panel-1", sample: available.map(item => item.id) };
const parsed = (fields: Record<string, string | string[]> = {}) => {
  const result = parseBuilderForm(form({ ...base, ...fields }), available);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};

describe("batch builder form", () => {
  it("needs a panel and at least one sample, and says so field by field", () => {
    const result = parseBuilderForm(form({}), available);
    expect(result).toEqual({ ok: false, errors: { panelId: "Choose a panel", samples: "Select at least one sample" } });
  });

  it("starts from the lab's usual rules and reads checkboxes as present or absent", () => {
    expect(builderDefaults).toMatchObject({ blanksAtStart: 1, pooledQcEvery: 6, qcAtEnd: true, randomize: true, blankAfterQc: false, minutesPerInjection: 12, plateOrder: "column-major" });
    const value = parsed({ blanksAtStart: "2", pooledQcEvery: "0", minutesPerInjection: "7.5", seed: "my seed", plateOrder: "row-major", blankAfterQc: "on" });
    expect(value).toMatchObject({ panelId: "panel-1", blanksAtStart: 2, pooledQcEvery: 0, blankAfterQc: true, qcAtEnd: false, randomize: false, seed: "my seed", minutesPerInjection: 7.5, plateOrder: "row-major" });
    expect(value.sampleIds).toHaveLength(7);
  });

  it("keeps the registry order of the samples and drops ids that are not available any more", () => {
    const value = parsed({ sample: [available[3].id, "gone", available[0].id] });
    expect(value.sampleIds).toEqual([available[0].id, available[3].id]);
    const none = parseBuilderForm(form({ ...base, sample: ["gone"] }), available);
    expect(none).toMatchObject({ ok: false, errors: { samples: expect.stringMatching(/no longer available/) } });
  });

  it.each([
    [{ blanksAtStart: "-1" }, "blanksAtStart"], [{ blanksAtStart: "1.5" }, "blanksAtStart"], [{ pooledQcEvery: "x" }, "pooledQcEvery"],
    [{ minutesPerInjection: "0" }, "minutesPerInjection"], [{ minutesPerInjection: "abc" }, "minutesPerInjection"],
  ])("rejects %j at %s", (fields, field) => {
    const result = parseBuilderForm(form({ ...base, ...fields }), available);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual([field]);
  });
});

describe("blanks between samples (instrument profile rule, 0035)", () => {
  it("reads N blanks after every M samples; empty keeps the defaults (the active profile's); both numbers or neither", () => {
    expect(builderDefaults).toMatchObject({ blanksBetween: 0, blanksBetweenEvery: 0 });
    expect(parsed({ blanksBetween: "2", blanksBetweenEvery: "4" })).toMatchObject({ blanksBetween: 2, blanksBetweenEvery: 4 });
    const fromProfile = parseBuilderForm(form(base), available, { ...builderDefaults, blanksBetween: 5, blanksBetweenEvery: 4 });
    expect(fromProfile).toMatchObject({ ok: true, value: { blanksBetween: 5, blanksBetweenEvery: 4 } });
    expect(parseBuilderForm(form({ ...base, blanksBetween: "1.5" }), available)).toEqual({ ok: false, errors: { blanksBetween: "Enter a whole number, 0 or more" } });
    expect(parseBuilderForm(form({ ...base, blanksBetween: "2", blanksBetweenEvery: "0" }), available))
      .toEqual({ ok: false, errors: { blanksBetweenEvery: "Enter both numbers (blanks, and after every how many samples), or 0 for both" } });
  });

  it("plans them and stores them with the batch, so the saved sequence is the previewed one", () => {
    const value = parsed({ sample: available.slice(0, 5).map(item => item.id), blanksAtStart: "0", pooledQcEvery: "0", blanksBetween: "1", blanksBetweenEvery: "2" });
    const plan = planBatch(value, available);
    expect(plan.injections.map(row => row.sample_type)).toEqual(["Unknown", "Unknown", "Blank", "Unknown", "Unknown", "Blank", "Unknown"]);
    expect(rulesRecord(value).rules).toMatchObject({ blanksBetween: 1, blanksBetweenEvery: 2 });
  });
});

describe("planning a batch from the form", () => {
  it("runs the engine over the chosen samples: the sample code as injection name, FullName kept apart, the sample id in the aliquot slot", () => {
    const value = parsed({ sample: available.slice(0, 3).map(item => item.id), blanksAtStart: "1", pooledQcEvery: "0", qcAtEnd: "on" });
    const plan = planBatch(value, available);
    expect(plan.problems).toEqual([]);
    expect(plan.injections.map(row => [row.seq, row.sample_type, row.sample_name, row.vial])).toEqual([
      [1, "Blank", "Blank_001", "A1"], [2, "Unknown", "ORD900-S001", "B1"], [3, "Unknown", "ORD900-S002", "C1"],
      [4, "Unknown", "ORD900-S003", "D1"], [5, "Quality Control", "QC_001", "E1"],
    ]);
    expect(plan.injections[0]).toMatchObject({ FullName: null, client_id: null, aliquot_id: null });
    expect(plan.injections[1]).toMatchObject({ FullName: "Synthetic_ORD900_1", client_id: "client-a", aliquot_id: available[0].id, plate: "Plate 1" });
    expect(plan.minutes).toBe(5 * 12);
  });

  it("is repeatable for the same seed and changes the order with another", () => {
    const value = parsed({ randomize: "on", seed: "alpha", pooledQcEvery: "0" });
    const names = (seed: string) => planBatch({ ...value, seed }, available).injections.filter(row => row.sample_type === "Unknown").map(row => row.sample_name);
    expect(names("alpha")).toEqual(names("alpha"));
    expect(names("alpha")).not.toEqual(names("beta"));
    expect([...names("alpha")].sort()).toEqual(available.map(item => item.code).sort());
  });

  it("uses row-major wells when asked", () => {
    const value = parsed({ sample: available.slice(0, 2).map(item => item.id), blanksAtStart: "0", pooledQcEvery: "0", plateOrder: "row-major" });
    expect(planBatch(value, available).injections.map(row => row.vial)).toEqual(["A1", "A2"]);
  });

  it("returns the engine's problems with their codes, and no injections, for a repeated sample code or a full plate", () => {
    const repeated = [...available, { ...sample(1, "ORD902", "client-b"), code: available[0].code }];
    const picked = parseBuilderForm(form({ ...base, sample: [available[0].id, repeated[7].id] }), repeated);
    if (!picked.ok) throw new Error(JSON.stringify(picked.errors));
    const clash = planBatch(picked.value, repeated);
    expect(clash.injections).toEqual([]);
    expect(clash.problems).toEqual([{ code: "duplicate_name", message: expect.stringMatching(/Duplicate sample code: ORD900-S001/) }]);
    const many = Array.from({ length: 100 }, (_, i) => sample(i + 1, "ORD950"));
    const full = planBatch({ ...parsed(), sampleIds: many.map(item => item.id) }, many);
    expect(full.problems.map(problem => problem.code)).toEqual(["plate_overflow"]);
    expect(problemText(full)).toMatch(/96/);
    expect(full.minutes).toBe(0);
  });

  it("lets two samples share a FullName: only the code names an injection, and the bench sheet keeps both", () => {
    const twin = { ...sample(1, "ORD902", "client-b"), fullName: available[0].fullName };
    const withTwin = [...available, twin];
    const picked = parseBuilderForm(form({ ...base, sample: [available[0].id, twin.id] }), withTwin);
    if (!picked.ok) throw new Error(JSON.stringify(picked.errors));
    const plan = planBatch({ ...picked.value, randomize: false }, withTwin);
    expect(plan.problems).toEqual([]);
    expect(plan.injections.filter(row => row.sample_type === "Unknown").map(row => [row.sample_name, row.FullName])).toEqual([
      ["ORD900-S001", "Synthetic_ORD900_1"], ["ORD902-S001", "Synthetic_ORD900_1"],
    ]);
  });
});

describe("plate map and run time", () => {
  it("lays the injections on an 8 × 12 plate by well", () => {
    const plan = planBatch(parsed({ sample: [available[0].id], blanksAtStart: "1", pooledQcEvery: "0", qcAtEnd: "on" }), available);
    const grid = plateMap(plan.injections);
    expect(grid).toHaveLength(8);
    expect(grid.every(row => row.length === 12)).toBe(true);
    expect(grid[0][0]).toMatchObject({ vial: "A1", seq: 1, type: "Blank", name: "Blank_001" });
    expect(grid[1][0]).toMatchObject({ vial: "B1", seq: 2, type: "Unknown", name: "ORD900-S001" });
    expect(grid[2][0]).toMatchObject({ vial: "C1", type: "Quality Control" });
    expect(grid[3][0]).toMatchObject({ vial: "D1", seq: null, type: null });
  });

  it("formats the run time in hours and minutes", () => {
    expect(formatRunTime(0)).toBe("0 min");
    expect(formatRunTime(45)).toBe("45 min");
    expect(formatRunTime(60)).toBe("1 h");
    expect(formatRunTime(150)).toBe("2 h 30 min");
    expect(formatRunTime(89.6)).toBe("1 h 30 min");
  });
});

describe("what is saved", () => {
  it("sends each injection with its sample id (Unknown) or none (controls), in sequence order", () => {
    const value = parsed({ sample: available.slice(0, 2).map(item => item.id), blanksAtStart: "1", pooledQcEvery: "0", qcAtEnd: "on" });
    const plan = planBatch(value, available);
    expect(saveInjections(plan.injections)).toEqual([
      { seq: 1, sample_type: "Blank", sample_name: "Blank_001", sample_id: null, plate: "Plate 1", vial: "A1" },
      { seq: 2, sample_type: "Unknown", sample_name: "ORD900-S001", sample_id: available[0].id, plate: "Plate 1", vial: "B1" },
      { seq: 3, sample_type: "Unknown", sample_name: "ORD900-S002", sample_id: available[1].id, plate: "Plate 1", vial: "C1" },
      { seq: 4, sample_type: "Quality Control", sample_name: "QC_001", sample_id: null, plate: "Plate 1", vial: "D1" },
    ]);
  });

  it("stores the rules, the seed, the plate layout and the minutes so the sequence can be explained later", () => {
    const value = parsed({ seed: "s-1", minutesPerInjection: "9" });
    const record = rulesRecord(value);
    expect(record).toEqual({
      rules: { blanksAtStart: 1, pooledQcEvery: 6, blanksBetween: 0, blanksBetweenEvery: 0, blankAfterQc: false, qcAtEnd: false, randomize: false, seed: "s-1" },
      plateLayout: { plate: "Plate 1", order: "column-major" }, minutesPerInjection: 9,
    });
    expect(storedMinutes(record)).toBe(9);
    expect(storedMinutes(null)).toBeNull();
    expect(storedMinutes({ minutesPerInjection: "x" })).toBeNull();
  });
});

describe("saving what was previewed", () => {
  const fields = { ...base, blanksAtStart: "1", pooledQcEvery: "2", qcAtEnd: "on", randomize: "on", seed: "syn" };
  const saveForm = () => form({ ...fields, plan: planKey(planBatch(parsed(fields), available).injections) });
  const replan = (data: FormData, left: readonly BuilderSample[]) => {
    const result = parseBuilderForm(data, left);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return planBatch(result.value, left);
  };

  it("accepts the save when planning again gives the previewed sequence", () => {
    expect(previewMismatch(saveForm(), replan(saveForm(), available))).toBeNull();
  });

  it("refuses when a previewed sample was taken by another batch meanwhile (it would be dropped and the wells shift)", () => {
    const left = available.filter(item => item.id !== available[1].id);
    expect(previewMismatch(saveForm(), replan(saveForm(), left))).toMatch(/changed since the preview.*Preview the sequence again/);
    expect(previewMismatch(form(fields), replan(form(fields), available))).toMatch(/Preview the sequence again/); // no preview sent
  });
});
