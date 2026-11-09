import { describe, expect, it } from "vitest";
import { emptyDraft, parseShipmentForm, toSampleInput, validateSamples, type SampleDraft } from "@/lib/samples";

const draft = (full_name: string, extra: Partial<SampleDraft> = {}): SampleDraft => ({ ...emptyDraft(), full_name, ...extra });

describe("sample validation", () => {
  it("requires FullName", () => {
    expect(validateSamples([draft(""), draft("   ")])).toEqual([
      { row: 0, field: "full_name", message: "FullName is required" },
      { row: 1, field: "full_name", message: "FullName is required" },
    ]);
  });
  it("flags every row that repeats a FullName in the list, ignoring surrounding spaces", () => {
    const issues = validateSamples([draft("Ctrl_1"), draft("Trt_1"), draft(" Ctrl_1 ")]);
    expect(issues.map(i => [i.row, i.message])).toEqual([[0, "FullName appears twice in this list"], [2, "FullName appears twice in this list"]]);
  });
  it("flags a FullName that is already registered in the order", () => {
    expect(validateSamples([draft("Ctrl_1")], ["Ctrl_1"])).toEqual([{ row: 0, field: "full_name", message: "Already registered in this order" }]);
  });
  it("accepts a volume with a decimal comma and rejects anything that is not a non-negative number", () => {
    const issues = validateSamples([draft("A", { volume_ul: "12,5" }), draft("B", { volume_ul: "" }), draft("C", { volume_ul: "-1" }), draft("D", { volume_ul: "50 µL" })]);
    expect(issues.map(i => [i.row, i.field])).toEqual([[2, "volume_ul"], [3, "volume_ul"]]);
    expect(toSampleInput(draft("A", { volume_ul: "12,5" })).volume_ul).toBe(12.5);
  });
  it("converts a draft to the contract shape: trimmed strings, empty cells as null", () => {
    expect(toSampleInput(draft(" Ctrl_1 ", { group1_term: "Control", matrix: "  " }))).toEqual({
      full_name: "Ctrl_1", client_sample_id: null, group1_term: "Control", group2_term: null, replicate_term: null, patient_term: null, time_point_term: null, matrix: null, volume_ul: null,
    });
  });
});

describe("shipment form", () => {
  const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
  const valid = { orderId: "ORD042", carrier: " FedEx ", trackingNumber: "7489 0000 0001", condition: "ok", boxCount: "2", notes: "" };
  it("accepts a complete form and normalises it to the contract's arguments", () => {
    expect(parseShipmentForm(form(valid))).toEqual({ ok: true, value: { orderId: "ORD042", carrier: "FedEx", trackingNumber: "7489 0000 0001", condition: "ok", boxCount: 2, notes: null } });
  });
  it("names every missing or invalid field", () => {
    const result = parseShipmentForm(form({ ...valid, orderId: "", carrier: "", condition: "wet", boxCount: "1.5" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["boxCount", "carrier", "condition", "orderId"]);
  });
  it("lets a hand-delivered shipment have no tracking number and zero boxes", () => {
    expect(parseShipmentForm(form({ ...valid, trackingNumber: "", boxCount: "0", carrier: "Hand delivered" })))
      .toMatchObject({ ok: true, value: { trackingNumber: null, boxCount: 0, carrier: "Hand delivered" } });
  });
});
