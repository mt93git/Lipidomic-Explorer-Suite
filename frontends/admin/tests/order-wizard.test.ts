import { describe, expect, it } from "vitest";
import { buildBatch } from "@/lib/batch";
import { builderDefaults } from "@/lib/batch-builder";
import {
  approxRunTime, checkSampleList, controlsText, countInjections, emptyWizard, estimateOrder, formatMoney, metadataColumns, nextLabel,
  normalizeWizard, sampleCount, sampleTemplateCsv, stepErrors, toOrderInput, type WizardData,
} from "@/lib/order-wizard";

const wizard = (fields: Partial<WizardData>): WizardData => ({ ...emptyWizard(), ...fields });

describe("order wizard: run time follows the batch builder's rules", () => {
  it("counts the same injections as the batch engine for every one-plate order", () => {
    for (const rules of [builderDefaults, { ...builderDefaults, blankAfterQc: true }, { ...builderDefaults, pooledQcEvery: 0 }, { ...builderDefaults, qcAtEnd: false, blanksAtStart: 2 },
      { ...builderDefaults, blanksBetween: 2, blanksBetweenEvery: 4 }, { ...builderDefaults, blanksBetween: 1, blanksBetweenEvery: 1, blankAfterQc: true, pooledQcEvery: 3 }]) {
      for (let n = 1; n <= 70; n += 1) {
        const samples = Array.from({ length: n }, (_, i) => ({ code: `ORD900-S${String(i + 1).padStart(3, "0")}`, FullName: `S${i + 1}`, client_id: "c", aliquot_id: `a${i}` }));
        const engine = buildBatch({ samples, rules: { ...rules, randomize: false, seed: "" }, plateLayout: { plate: "Plate 1", order: "column-major" }, minutesPerInjection: 12 });
        if (engine.validationMessages.length) continue; // more than one plate: the engine refuses, the estimate still counts
        expect(countInjections(n, rules).injections, `n=${n}`).toBe(engine.injections.length);
      }
    }
  });

  it("67 samples: 1 blank, 12 QCs, 80 injections, 16 h at the builder's 12 min", () => {
    expect(countInjections(67)).toEqual({ injections: 80, blanks: 1, blanksAtStart: 1, blanksBetween: 0, blanksAfterQc: 0, qcs: 12 });
    const estimate = estimateOrder(67, null);
    expect(estimate.minutes).toBe(960);
    expect(estimate.minutesFromRateSheet).toBe(false);
    expect(approxRunTime(estimate.minutes!)).toBe("≈ 16 h");
  });

  it("counts the active profile's blanks between samples, and the run time from every injection", () => {
    const rules = { ...builderDefaults, blanksBetween: 2, blanksBetweenEvery: 4 };
    expect(countInjections(67, rules)).toEqual({ injections: 112, blanks: 33, blanksAtStart: 1, blanksBetween: 32, blanksAfterQc: 0, qcs: 12 });
    const estimate = estimateOrder(67, null, rules);
    expect(estimate).toMatchObject({ injections: 112, blanksAtStart: 1, blanksBetween: 32, qcs: 12, minutes: 112 * 12, plates: 2 });
    expect(controlsText(estimate, true)).toBe("1 blank at start, 32 between samples and 12 pooled QCs, by the active profile's rules");
    expect(controlsText(estimateOrder(67, null), false)).toBe("1 blank at start and 12 pooled QCs, by the batch builder's rules");
    expect(controlsText(estimateOrder(5, null, { ...rules, blanksAtStart: 4, blankAfterQc: true }), true))
      .toBe("4 blanks at start, 2 between samples, 1 after QC and 1 pooled QC, by the active profile's rules");
  });

  it("uses the panel's minutes per injection from the rate sheet when set", () => {
    const estimate = estimateOrder(67, { panelId: "p", ratePerSample: null, currency: null, minutesPerInjection: 33 });
    expect(estimate.minutes).toBe(80 * 33);
    expect(estimate.minutesFromRateSheet).toBe(true);
    expect(approxRunTime(estimate.minutes!)).toBe("≈ 44 h");
  });

  it("no samples: no injections and no run time", () => {
    expect(estimateOrder(null, null)).toMatchObject({ injections: 0, minutes: null, amount: null });
    expect(approxRunTime(45)).toBe("≈ 45 min");
  });
});

describe("order wizard: money only from the rate sheet", () => {
  it("panel rate × samples, in the sheet's currency", () => {
    const estimate = estimateOrder(67, { panelId: "p", ratePerSample: 70.5, currency: "USD", minutesPerInjection: null });
    expect(estimate.amount).toBe(4723.5);
    expect(formatMoney(estimate.amount!, estimate.currency!)).toBe("USD 4,723.50");
  });

  it("a missing rate is not set, never zero", () => {
    expect(estimateOrder(67, null).amount).toBeNull();
    expect(estimateOrder(67, { panelId: "p", ratePerSample: null, currency: null, minutesPerInjection: 12 }).amount).toBeNull();
    expect(estimateOrder(null, { panelId: "p", ratePerSample: 10, currency: "EUR", minutesPerInjection: null }).amount).toBeNull();
  });
});

describe("order wizard: steps and what create_order receives", () => {
  it("names the next step on the primary button", () => {
    expect(nextLabel[2]).toBe("Next: sample list");
    expect(nextLabel[4]).toBe("Place order");
  });

  it("checks each step's own fields", () => {
    expect(stepErrors(emptyWizard(), 1)).toEqual({ clientId: "Choose a client", title: "Enter a title" });
    expect(stepErrors(wizard({ clientId: "c", expectedSamples: "6.5" }), 2)).toEqual({ panelId: "Choose a panel", expectedSamples: "Enter a whole number, 0 or more" });
    expect(stepErrors(wizard({ sampleList: "FullName\tGroup1Term\nS1\tA\nS1\tB" }), 3).sampleList).toBe("Row 1: FullName appears twice in this list");
    expect(stepErrors(wizard({}), 3)).toEqual({});
    expect(stepErrors(wizard({ clientId: "c", title: "x".repeat(301) }), 1)).toEqual({ title: "Keep the title under 300 characters" });
    expect(stepErrors(wizard({ clientId: "c", title: "x".repeat(300) }), 1)).toEqual({});
  });

  it("puts the study design in the notes and the billing method in the billing reference", () => {
    const input = toOrderInput(wizard({ clientId: "c", panelId: "p", title: " Diet study ", matrix: "Serum", expectedSamples: "67", studyDesign: "Groups + repeated visits", billingMethod: "charge_code", billingRef: "CC-0001", notes: "Dry ice." }));
    expect(input).toEqual({ clientId: "c", panelId: "p", title: "Diet study", matrix: "Serum", expectedSamples: 67, billingRef: "Internal charge code · CC-0001", notes: "Study design: Groups + repeated visits.\nDry ice." });
    expect(toOrderInput(wizard({ clientId: "c", panelId: "p", title: "t" }))).toMatchObject({ billingRef: null, notes: null, matrix: null, expectedSamples: null });
  });

  it("counts the pasted list when the number of samples is blank", () => {
    const list = "FullName\tGroup1Term\nS1\tControl\nS2\tTreated\nS3\tTreated";
    expect(checkSampleList(list)).toMatchObject({ headerDetected: true, issues: [] });
    expect(sampleCount(wizard({ sampleList: list }))).toBe(3);
    expect(sampleCount(wizard({ sampleList: list, expectedSamples: "10" }))).toBe(10);
  });

  it("keeps only known text fields from an untrusted draft", () => {
    expect(normalizeWizard({ title: "x", expectedSamples: 5, evil: "y", notes: { a: 1 } })).toEqual(wizard({ title: "x", expectedSamples: "5" }));
    expect(normalizeWizard(null)).toEqual(emptyWizard());
  });

  it("offers the registry's columns as the template, the six metadata columns first", () => {
    expect(metadataColumns).toEqual(["FullName", "Group1Term", "Group2Term", "ReplicateTerm", "PatientTerm", "TimePointTerm"]);
    expect(sampleTemplateCsv().split("\r\n")[0].split(",").slice(0, 6)).toEqual(metadataColumns);
  });
});
