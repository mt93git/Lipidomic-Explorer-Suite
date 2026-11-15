import { describe, expect, it } from "vitest";
import {
  arrivedPhrase, demoCheckIn, demoConfirm, discrepancySummary, headerLine, matchLabel, nextPosition, noteRequired, receiptTitle, slotOf,
  storageLabel, tally, withDemoTubes, type CheckinView, type DemoCheckinState, type ManifestTube,
} from "@/lib/shipment-checkin";

// Synthetic manifest: four tubes of ORD044, client IDs invented.
const manifest: Omit<ManifestTube, "checkIn">[] = [
  { sampleCode: "ORD044-S035", clientSampleId: "SYN-11-d0" },
  { sampleCode: "ORD044-S036", clientSampleId: "SYN-11-d3" },
  { sampleCode: "ORD044-S037", clientSampleId: "SYN-12-d0" },
  { sampleCode: "ORD044-S038", clientSampleId: null },
];
const view = (state: DemoCheckinState, receipt: CheckinView["shipment"]["receipt"] = null): CheckinView => ({
  orderId: "ORD044", orderCode: "ORD044", clientName: "Example Atlas",
  shipment: { id: "ship-1", receivedAt: "2026-11-13T15:42:00Z", carrier: "Example courier", boxCount: 1, number: 2, of: 2, receipt },
  tubes: withDemoTubes(manifest, "ship-1", state),
});
const now = new Date("2026-11-13T18:00:00Z");
const args = (state: DemoCheckinState, id = "t1") => ({ view: view(state), actor: "Demo Operator", now, id });
const scan = (state: DemoCheckinState, label: string, condition: "intact" | "hemolyzed" | "thawed" | "other" = "intact", box = "B12", position = "", note = "", id = label) =>
  demoCheckIn(state, { label, condition, box, position, note }, args(state, id)).state;

describe("check-in of a tube", () => {
  it("a scanned label marks its tube checked in with condition and box · position; unscanned tubes stay missing", () => {
    let state: DemoCheckinState = {};
    state = scan(state, "ORD044-S035", "intact", "B12", "c2");
    state = scan(state, "ord044-s036", "hemolyzed", "B12", "C 3");
    state = scan(state, "SYN-12-D0", "intact", "B12", "C4");
    const tubes = view(state).tubes;
    expect(tubes.map(tube => [tube.sampleCode, tube.checkIn?.condition ?? "missing", tube.checkIn ? `${tube.checkIn.box} · ${tube.checkIn.position}` : "—"])).toEqual([
      ["ORD044-S035", "intact", "B12 · C2"], ["ORD044-S036", "hemolyzed", "B12 · C3"], ["ORD044-S037", "intact", "B12 · C4"], ["ORD044-S038", "missing", "—"],
    ]);
    expect(tally(tubes)).toMatchObject({ expected: 4, checkedIn: 3, missing: 1, hemolyzed: 1, damaged: 1, boxes: ["B12"] });
  });

  it("unknown labels are rejected with a clear message", () => {
    expect(() => scan({}, "ORD044-S099")).toThrow("Unknown tube label ORD044-S099: it is not on the manifest of ORD044.");
    expect(() => scan({}, "ORD045-S001")).toThrow("Tube ORD045-S001 belongs to order ORD045, not to ORD044.");
    expect(() => scan({}, "  ")).toThrow("Scan or type a tube label.");
    expect(() => matchLabel(view({}).tubes.concat({ sampleCode: "ORD044-S039", clientSampleId: "syn-11-d0", checkIn: null }), "SYN-11-d0", "ORD044"))
      .toThrow("Client ID SYN-11-d0 is on 2 tubes of ORD044; scan the ORD label instead.");
  });

  it("a slot holds one tube, box and position go together, other needs a description", () => {
    const state = scan({}, "ORD044-S035", "intact", "B12", "C2");
    expect(() => scan(state, "ORD044-S036", "intact", "B12", "c2")).toThrow("Box B12 position C2 already holds tube ORD044-S035.");
    expect(() => scan(state, "ORD044-S036", "intact", "B12", "")).toThrow("Enter both a box and a position, or neither.");
    expect(() => scan(state, "ORD044-S036", "other", "", "")).toThrow("Describe the tube's condition (other).");
    expect(view(scan(state, "ORD044-S036", "other", "", "", "cap cracked")).tubes[1].checkIn).toMatchObject({ condition: "other", note: "cap cracked", box: null });
  });

  it("checking a tube in again replaces it and keeps the old record archived", () => {
    let state = scan({}, "ORD044-S035", "intact", "B12", "C2", "", "a");
    state = scan(state, "ORD044-S035", "hemolyzed", "B12", "C2", "", "b");
    expect(state.tubes?.map(tube => [tube.id, tube.archivedReason ?? null])).toEqual([["a", "checked in again"], ["b", null]]);
    expect(view(state).tubes[0].checkIn?.condition).toBe("hemolyzed");
  });
});

describe("confirm receipt", () => {
  it("with a missing or damaged tube, needs a discrepancy note; the receipt records the counts and the note", () => {
    const state = scan(scan({}, "ORD044-S035", "intact", "B12", "C2"), "ORD044-S036", "hemolyzed", "B12", "C3");
    const confirm = (note: string) => demoConfirm(state, note, { view: view(state), actor: "Demo Operator", now });
    expect(() => confirm("  ")).toThrow("2 tubes missing and 1 damaged: write a discrepancy note; the client reads it on their order.");
    const { receipt } = confirm("S037 and S038 missing from box, courier contacted.");
    expect(receipt).toMatchObject({ expected: 4, checkedIn: 2, missing: 2, damaged: 1, note: "S037 and S038 missing from box, courier contacted.", storageTemperature: "−80 °C" });
    expect(receiptTitle(receipt)).toBe("Receipt confirmed · 2 missing, 1 damaged · note: S037 and S038 missing from box, courier contacted.");
  });

  it("with every tube intact, needs no note; a confirmed receipt is closed", () => {
    let state: DemoCheckinState = {};
    for (const [i, tube] of manifest.entries()) state = scan(state, tube.sampleCode, "intact", "B12", `A${i + 1}`);
    expect(noteRequired(tally(view(state).tubes))).toBe(false);
    const { receipt, state: after } = demoConfirm(state, "", { view: view(state), actor: "Demo Operator", now });
    expect(receiptTitle(receipt)).toBe("Receipt confirmed · every tube checked in intact");
    const closed = { ...view(after), shipment: { ...view(after).shipment, receipt } };
    expect(() => demoCheckIn(after, { label: "ORD044-S035", condition: "intact", box: "", position: "", note: "" }, { view: closed, actor: "x", now, id: "z" }))
      .toThrow(/already confirmed; its tubes cannot change/);
    expect(() => demoConfirm(after, "", { view: closed, actor: "x", now })).toThrow(/already confirmed/);
  });

  it("an empty manifest cannot be confirmed tube by tube", () => {
    expect(() => demoConfirm({}, "note", { view: { ...view({}), tubes: [] }, actor: "x", now })).toThrow(/no registered samples on this shipment/);
  });
});

describe("what the screen says", () => {
  it("header, discrepancy text and storage tile", () => {
    expect(headerLine(view({}), now)).toBe("Example Atlas · shipment 2 of 2 · arrived today 10:42");
    expect(arrivedPhrase("2026-11-12T15:42:00Z", now)).toBe("arrived yesterday 10:42");
    expect(arrivedPhrase("2026-11-02T15:42:00Z", now)).toBe("arrived Nov 2, 10:42");
    const partial = tally(view(scan(scan({}, "ORD044-S035", "intact", "B12", "C2"), "ORD044-S036", "hemolyzed", "B13", "A1")).tubes);
    expect(discrepancySummary(partial)).toBe("2 tubes listed on the manifest were not in the box; 1 hemolyzed on arrival. Receipt can be confirmed with a note; the client is told automatically.");
    expect(storageLabel(partial)).toBe("stored in Box B12 and 1 more box");
    expect(storageLabel(tally([]))).toBe("no box recorded yet");
    expect(discrepancySummary(tally([]))).toMatch(/^Nothing differs from the manifest yet/);
  });

  it("positions use the Storage format and the next one is suggested", () => {
    expect(slotOf(" B12 ", "c-4")).toEqual({ box: "B12", position: "C4" });
    expect(slotOf("", "")).toEqual({ box: null, position: null });
    expect(nextPosition("C4")).toBe("C5");
    expect(nextPosition("C9")).toBe("D1");
    expect(nextPosition(null)).toBe("");
  });
});
