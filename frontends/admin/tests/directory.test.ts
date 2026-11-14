// Datasets, Clients and Client detail (prototypes a16/a17/a18): the pure presentation rules. Synthetic values only.
import { describe, expect, it } from "vitest";
import { datasetPill, lastActive, lowerFirst, personLabel, releasedDay, stageTone } from "@/lib/directory";

describe("dataset status pill", () => {
  it("a built version waits for its next signature, then to be released", () => {
    expect(datasetPill({ status: "built", signatures: 0 }, 2)).toEqual({ tone: "awaiting", label: "awaiting 1st signature" });
    expect(datasetPill({ status: "built", signatures: 1 }, 2)).toEqual({ tone: "awaiting", label: "awaiting 2nd signature" });
    expect(datasetPill({ status: "built", signatures: 2 }, 3)).toEqual({ tone: "awaiting", label: "awaiting 3rd signature" });
    expect(datasetPill({ status: "built", signatures: 2 }, 2)).toEqual({ tone: "ready", label: "signed · ready to release" });
  });
  it("released, superseded and withdrawn read as their status; an order still processing reads processing", () => {
    expect(datasetPill({ status: "released", signatures: 2 }, 2)).toEqual({ tone: "released", label: "released" });
    expect(datasetPill({ status: "superseded", signatures: 2 }, 2)).toEqual({ tone: "superseded", label: "superseded" });
    expect(datasetPill({ status: "withdrawn", signatures: 2 }, 2)).toEqual({ tone: "withdrawn", label: "withdrawn" });
    expect(datasetPill("processing", 2)).toEqual({ tone: "processing", label: "processing" });
  });
});

describe("people and dates", () => {
  it("a member is named by name, else email, never by user id", () => {
    expect(personLabel({ name: "Rowan Example", email: "rowan@example.test" })).toBe("Rowan Example");
    expect(personLabel({ name: "  ", email: "kai@example.test" })).toBe("kai@example.test");
    expect(personLabel({ name: null, email: null })).toBe("Name not recorded");
  });
  it("last active counts lab days: today, N d, then the date; never without a sign-in", () => {
    const now = new Date("2026-11-13T15:00:00Z");
    expect(lastActive("2026-11-13T13:00:00Z", now)).toBe("today");
    expect(lastActive("2026-11-11T15:00:00Z", now)).toBe("2 d");
    expect(lastActive("2026-11-04T15:00:00Z", now)).toBe("9 d");
    expect(lastActive("2026-08-01T15:00:00Z", now)).toBe("1 Aug 2026");
    expect(lastActive(null, now)).toBe("never");
  });
  it("the released day reads day then month, in the lab's zone", () => {
    expect(releasedDay("2026-10-28T16:00:00Z")).toBe("28 Oct");
    expect(releasedDay("2026-11-03T02:00:00Z")).toBe("2 Nov"); // 21:00 on 2 Nov in New York
  });
  it("labels read lower case as the prototype writes them; acronyms stay", () => {
    expect(lowerFirst("Charge code")).toBe("charge code");
    expect(lowerFirst("QC reviewed")).toBe("QC reviewed");
    expect(stageTone("Released")).toBe("released");
    expect(stageTone("Request")).toBe("processing");
    expect(stageTone("QC reviewed")).toBe("awaiting");
  });
});
