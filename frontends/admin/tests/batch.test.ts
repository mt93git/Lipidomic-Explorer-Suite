import { describe, expect, it } from "vitest";
import {
  buildBatch, toBenchSheetCsv, toSequenceCsv,
  type BatchInput, type BatchSample, type Injection,
} from "@/lib/batch";
import { toSciexBatchCsv } from "@/lib/batch/sciex-adapter";

const samples = (count: number): BatchSample[] => Array.from({ length: count }, (_, i) => ({
  code: `ORD900-S${i + 1}`, FullName: `Synthetic_${i + 1}`,
  client_id: "synthetic-client", aliquot_id: `synthetic-aliquot-${i + 1}`,
}));
const input = (count: number, rules: Partial<BatchInput["rules"]> = {}): BatchInput => ({
  samples: samples(count),
  rules: { blanksAtStart: 0, pooledQcEvery: 0, blankAfterQc: false, qcAtEnd: false, randomize: false, seed: "test", ...rules },
  plateLayout: { plate: "Plate 1", order: "column-major" },
  minutesPerInjection: 2.5,
});
const types = (value: BatchInput) => buildBatch(value).injections.map(row => row.sample_type);

describe("batch engine", () => {
  it("places starting blanks, QC after each n Unknowns, and blanks after every QC including the end QC", () => {
    const value = input(5, { blanksAtStart: 2, pooledQcEvery: 2, blankAfterQc: true, qcAtEnd: true });
    const result = buildBatch(value);
    expect(types(value)).toEqual([
      "Blank", "Blank", "Unknown", "Unknown", "Quality Control", "Blank",
      "Unknown", "Unknown", "Quality Control", "Blank", "Unknown", "Quality Control", "Blank",
    ]);
    expect(result.validationMessages).toEqual([]);
    expect(result.injections.map(row => row.seq)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    expect(result.injections.filter(row => row.sample_type !== "Unknown").every(row => row.client_id === null && row.aliquot_id === null && row.FullName === null)).toBe(true);
  });

  it.each([false, true])("does not duplicate an end QC already supplied by the interval (blankAfterQc=%s)", blankAfterQc => {
    expect(types(input(2, { pooledQcEvery: 2, blankAfterQc, qcAtEnd: true }))).toEqual([
      "Unknown", "Unknown", "Quality Control", ...(blankAfterQc ? ["Blank"] : []),
    ]);
  });

  it("supports disabled intervals, optional end QC, and an incomplete interval without an end QC", () => {
    expect(types(input(1, { blankAfterQc: true }))).toEqual(["Unknown"]);
    expect(types(input(1, { qcAtEnd: true }))).toEqual(["Unknown", "Quality Control"]);
    expect(types(input(3, { pooledQcEvery: 2 }))).toEqual(["Unknown", "Unknown", "Quality Control", "Unknown"]);
  });

  it("uses trimmed sample codes as names and keeps trimmed FullName separately for the bench sheet", () => {
    const value = input(3, { blanksAtStart: 1, qcAtEnd: true });
    value.samples[0].code = " ORD041-S037 ";
    value.samples[0].FullName = "Blank_001";
    value.samples[1].FullName = "QC_001";
    value.samples[2].FullName = " Synthetic registry name ";
    const result = buildBatch(value);
    expect(result.injections.map(row => row.sample_name)).toEqual(["Blank_001", "ORD041-S037", "ORD900-S2", "ORD900-S3", "QC_001"]);
    expect(result.injections.filter(row => row.sample_type === "Unknown")).toEqual(value.samples.map((sample, i) => ({
      seq: i + 2, sample_type: "Unknown", sample_name: sample.code.trim(), FullName: sample.FullName.trim(),
      client_id: sample.client_id, aliquot_id: sample.aliquot_id, plate: "Plate 1", vial: `${"BCD"[i]}1`,
    })));
  });

  it("uses a repeatable seeded shuffle without mutating inputs or changing QC slots", () => {
    const value = input(12, { randomize: true, seed: "wave3", pooledQcEvery: 3 });
    const before = structuredClone(value);
    const first = buildBatch(value);
    expect(buildBatch(value)).toEqual(first);
    expect(value).toEqual(before);
    expect(buildBatch({ ...value, rules: { ...value.rules, seed: "another-seed" } }).injections).not.toEqual(first.injections);
    expect(first.injections.filter(row => row.sample_type === "Quality Control").map(row => row.seq)).toEqual([4, 8, 12, 16]);
    const unknowns = first.injections.filter(row => row.sample_type === "Unknown");
    expect(unknowns.map(row => row.sample_name)).not.toEqual(value.samples.map(row => row.code));
    expect(unknowns.map(row => [row.sample_name, row.FullName, row.client_id, row.aliquot_id]).sort()).toEqual(value.samples.map(row => [row.code, row.FullName, row.client_id, row.aliquot_id]).sort());
    expect(buildBatch(input(12)).injections.map(row => row.sample_name)).toEqual(samples(12).map(row => row.code));
  });

  it.each(["column-major", "row-major"] as const)("fills exactly 96 unique wells in %s order", order => {
    const value = input(96);
    value.plateLayout.order = order;
    const result = buildBatch(value);
    const wells = result.injections.map(row => row.vial);
    expect(result.validationMessages).toEqual([]);
    expect(new Set(wells).size).toBe(96);
    expect(wells[0]).toBe("A1");
    expect(wells[1]).toBe(order === "column-major" ? "B1" : "A2");
    expect(wells[order === "column-major" ? 8 : 12]).toBe(order === "column-major" ? "A2" : "B1");
    expect(wells[95]).toBe("H12");
  });

  it.each([input(97), input(96, { blanksAtStart: 1 }), input(95, { qcAtEnd: true, blankAfterQc: true })])("rejects plate overflow, counting controls too", value => {
    expect(buildBatch(value)).toMatchObject({
      injections: [], estimatedRunTimeMinutes: 0,
      validationMessages: [{ code: "plate_overflow", message: expect.stringContaining("97") }],
    });
  });

  it("rejects duplicate sample codes after trimming, across clients", () => {
    const value = input(2);
    value.samples = [value.samples[0], { ...value.samples[1], code: ` ${value.samples[0].code} `, client_id: "another-client" }];
    expect(buildBatch(value)).toMatchObject({
      injections: [], estimatedRunTimeMinutes: 0,
      validationMessages: [{ code: "duplicate_name", message: expect.stringContaining("ORD900-S1") }],
    });
  });

  it("allows shared FullNames when sample codes differ", () => {
    const value = input(2);
    value.samples[1].FullName = ` ${value.samples[0].FullName} `;
    value.samples[1].client_id = "another-client";
    const result = buildBatch(value);
    expect(result.validationMessages).toEqual([]);
    expect(result.injections.map(row => row.sample_name)).toEqual(["ORD900-S1", "ORD900-S2"]);
    expect(result.injections.map(row => row.FullName)).toEqual(["Synthetic_1", "Synthetic_1"]);
  });

  it("skips control names colliding with normalized sample codes", () => {
    const value = input(2, { blanksAtStart: 1, qcAtEnd: true });
    value.samples[0].code = " Blank_001 ";
    value.samples[1].code = " QC_001 ";
    expect(buildBatch(value).injections.map(row => row.sample_name)).toEqual(["Blank_002", "Blank_001", "QC_001", "QC_002"]);
  });

  it("rejects empty input even when control rules are enabled", () => {
    expect(buildBatch(input(0, { blanksAtStart: 2, qcAtEnd: true }))).toMatchObject({
      injections: [], estimatedRunTimeMinutes: 0, validationMessages: [{ code: "empty_input", message: expect.any(String) }],
    });
  });

  it("estimates minutes from every injection including controls", () => {
    expect(buildBatch(input(3, { blanksAtStart: 1, pooledQcEvery: 2, blankAfterQc: true, qcAtEnd: true })).estimatedRunTimeMinutes).toBe(20);
  });

  it.each([
    ["negative blank count", input(1, { blanksAtStart: -1 }), "invalid_rules"],
    ["fractional QC interval", input(1, { pooledQcEvery: 1.5 }), "invalid_rules"],
    ["infinite blank count", input(1, { blanksAtStart: Infinity }), "invalid_rules"],
    ...[0, -1, NaN, Infinity].map(minutesPerInjection => [
      `duration ${minutesPerInjection}`, { ...input(1), minutesPerInjection }, "invalid_duration",
    ] as const),
    ["duration overflow", { ...input(2), minutesPerInjection: Number.MAX_VALUE }, "invalid_duration"],
    ["empty plate", { ...input(1), plateLayout: { plate: " ", order: "column-major" } }, "invalid_layout"],
    ["invalid order", { ...input(1), plateLayout: { plate: "Plate 1", order: "diagonal" } }, "invalid_layout"],
  ] as const)("returns the validation code for %s", (_label, value, code) => {
    expect(buildBatch(value as BatchInput)).toEqual({
      injections: [], estimatedRunTimeMinutes: 0,
      validationMessages: [{ code, message: expect.any(String) }],
    });
  });

  it.each(["code", "FullName", "client_id", "aliquot_id"] as const)("returns invalid_sample for empty or non-string %s", field => {
    for (const invalid of ["", " ", null, undefined, 42, false, {}, []]) {
      const value = input(1);
      value.samples = [{ ...value.samples[0], [field]: invalid } as BatchSample];
      expect(buildBatch(value)).toEqual({
        injections: [], estimatedRunTimeMinutes: 0,
        validationMessages: [{ code: "invalid_sample", message: expect.any(String) }],
      });
    }
  });

  it.each([undefined, null, "", " ", 42])("returns invalid_rules for randomization seed %s", seed => {
    const value = input(2, { randomize: true });
    value.rules = { ...value.rules, seed } as BatchInput["rules"];
    expect(buildBatch(value)).toEqual({
      injections: [], estimatedRunTimeMinutes: 0,
      validationMessages: [{ code: "invalid_rules", message: expect.stringMatching(/seed/i) }],
    });
  });

  it("does not require a seed when randomization is disabled", () => {
    expect(buildBatch(input(1, { seed: "" })).validationMessages).toEqual([]);
  });
});

describe("batch CSV exports", () => {
  const row: Injection = {
    seq: 1, sample_type: "Unknown", sample_name: "ORD041-S037", FullName: 'Synthetic,"quoted"\r\nsecond line',
    client_id: "synthetic-client", aliquot_id: "synthetic-aliquot", plate: "Plate 1", vial: "A1",
  };

  it("exports documented generic sequence and bench columns with RFC 4180 escaping", () => {
    const blank: Injection = { ...row, seq: 2, sample_type: "Blank", sample_name: "Blank_001", FullName: null, client_id: null, aliquot_id: null, vial: "B1" };
    expect(toSequenceCsv([row, blank])).toBe(
      'seq,sample_type,sample_name,client_id,aliquot_id,plate,vial\r\n1,Unknown,ORD041-S037,synthetic-client,synthetic-aliquot,Plate 1,A1\r\n2,Blank,Blank_001,,,Plate 1,B1\r\n',
    );
    expect(toBenchSheetCsv([row])).toBe(
      'plate,vial,seq,sample_type,sample_name,FullName,client_id,aliquot_id\r\nPlate 1,A1,1,Unknown,ORD041-S037,"Synthetic,""quoted""\r\nsecond line",synthetic-client,synthetic-aliquot\r\n',
    );
    expect(toSequenceCsv([])).toBe("seq,sample_type,sample_name,client_id,aliquot_id,plate,vial\r\n");
    expect(toBenchSheetCsv([])).toBe("plate,vial,seq,sample_type,sample_name,FullName,client_id,aliquot_id\r\n");
  });

  it.each(["=", "+", "-", "@", "\t", "\r"])("neutralizes %j in every exported text cell, retaining RFC 4180 quoting", prefix => {
    const dangerous = `${prefix}SUM(1,2)+"quoted"\r\nnext`;
    const escaped = `"'${prefix}SUM(1,2)+""quoted""\r\nnext"`;
    const textRow = {
      ...row, sample_type: dangerous, sample_name: dangerous, FullName: dangerous,
      client_id: dangerous, aliquot_id: dangerous, plate: dangerous, vial: dangerous,
    } as Injection;
    expect(toBenchSheetCsv([textRow])).toBe(
      `plate,vial,seq,sample_type,sample_name,FullName,client_id,aliquot_id\r\n${[escaped, escaped, "1", escaped, escaped, escaped, escaped, escaped].join(",")}\r\n`,
    );
    expect(toSequenceCsv([textRow])).toBe(
      `seq,sample_type,sample_name,client_id,aliquot_id,plate,vial\r\n${["1", escaped, escaped, escaped, escaped, escaped, escaped].join(",")}\r\n`,
    );
    expect(toSciexBatchCsv([textRow])).toBe(
      `PENDING_Sequence,PENDING_Sample_Type,PENDING_Sample_Name,PENDING_Plate,PENDING_Vial\r\n${["1", escaped, escaped, escaped, escaped].join(",")}\r\n`,
    );
  });

  it("protects a client FullName on the bench sheet while sequence names remain lab codes", () => {
    const value = input(1, { blanksAtStart: 1 });
    value.samples[0].FullName = ' =SUM(1,2) ';
    const result = buildBatch(value);
    expect(result.validationMessages).toEqual([]);
    expect(toBenchSheetCsv(result.injections)).toBe(
      `plate,vial,seq,sample_type,sample_name,FullName,client_id,aliquot_id\r\nPlate 1,A1,1,Blank,Blank_001,,,\r\nPlate 1,B1,2,Unknown,ORD900-S1,"'=SUM(1,2)",synthetic-client,synthetic-aliquot-1\r\n`,
    );
    expect(toSequenceCsv(result.injections)).toBe(
      'seq,sample_type,sample_name,client_id,aliquot_id,plate,vial\r\n1,Blank,Blank_001,,,Plate 1,A1\r\n2,Unknown,ORD900-S1,synthetic-client,synthetic-aliquot-1,Plate 1,B1\r\n',
    );
    expect(result.injections[1].FullName).toBe("=SUM(1,2)");
  });

  it("isolates explicitly pending SCIEX column mappings in the adapter", () => {
    expect(toSciexBatchCsv([row])).toBe(
      'PENDING_Sequence,PENDING_Sample_Type,PENDING_Sample_Name,PENDING_Plate,PENDING_Vial\r\n1,Unknown,ORD041-S037,Plate 1,A1\r\n',
    );
  });
});
