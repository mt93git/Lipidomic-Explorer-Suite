// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AuditContext, AuditEvent } from "@/lib/audit";
import { sampleHistory } from "@/lib/sample-detail";

// Synthetic ids and people only.
const STEPH = "5e5e5e5e-0000-4000-8000-000000000001";
const ORDER = "0d0d0d0d-0000-4000-8000-000000000041";
const SAMPLE = "5a5a0000-0000-4000-8000-000000000001";
const OTHER = "5a5a0000-0000-4000-8000-000000000002";
const ALIQUOT = "a11a0000-0000-4000-8000-000000000001";
const ctx: AuditContext = { people: { [STEPH]: "Stephania (simulated)" }, orders: { [ORDER]: "ORD041" }, datasets: {} };
const subject = { id: SAMPLE, code: "ORD041-S001", aliquotIds: [ALIQUOT] };

let next = 1;
const event = (patch: Partial<AuditEvent>): AuditEvent => ({
  id: next++, createdAt: "2026-11-04T10:15:00Z", actor: STEPH, entity: "sample", entityId: SAMPLE, action: "INSERT", before: null, after: null, ...patch,
});
const sampleRow = { id: SAMPLE, order_id: ORDER, sample_code: "ORD041-S001", full_name: "Ctrl_1", matrix: "Plasma", volume_ul: 50, archived_at: null, archived_reason: null };

describe("sampleHistory: this sample's audit events, newest first, in plain words", () => {
  it("keeps only this sample's events: its row, its aliquots, its exclusions and the injections of its aliquots", () => {
    const events = [
      event({ after: sampleRow }),
      event({ entityId: OTHER, after: { ...sampleRow, id: OTHER, sample_code: "ORD041-S002" } }),
      event({ entity: "aliquot", entityId: ALIQUOT, after: { id: ALIQUOT, sample_id: SAMPLE, volume_ul: 20, extracted_at: null } }),
      event({ entity: "aliquot", entityId: "a11a0000-0000-4000-8000-000000000009", after: { sample_id: OTHER } }),
      event({ entity: "exclusion", entityId: "e0000000-0000-4000-8000-000000000001", after: { sample_id: SAMPLE, reason: "tube cracked" } }),
      event({ entity: "exclusion", entityId: "e0000000-0000-4000-8000-000000000002", after: { sample_id: OTHER, reason: "x" } }),
      event({ entity: "injection", entityId: "10000000-0000-4000-8000-000000000001", after: { aliquot_id: ALIQUOT, sample_name: "B2026-031_017_ORD041-S001" } }),
      event({ entity: "injection", entityId: "10000000-0000-4000-8000-000000000002", after: { aliquot_id: null, sample_name: "B2026-031_001_Blank" } }),
      event({ entity: "order", entityId: ORDER, after: { code: "ORD041", stage: "registered" } }),
    ];
    expect(sampleHistory(events, ctx, subject)).toHaveLength(4);
  });

  it("orders newest first and names the actor, with System for a write that has no user", () => {
    const rows = sampleHistory([
      event({ createdAt: "2026-11-04T10:15:00Z", after: sampleRow }),
      event({ createdAt: "2026-11-05T09:00:00Z", actor: null, action: "UPDATE", before: sampleRow, after: { ...sampleRow, volume_ul: 40 } }),
    ], ctx, subject);
    expect(rows.map(row => row.who)).toEqual(["System", "Stephania (simulated)"]);
    expect(rows.map(row => row.at)).toEqual(["2026-11-05T09:00:00Z", "2026-11-04T10:15:00Z"]);
  });

  it("says what happened to the sample, not that a row was updated", () => {
    const text = (event_: AuditEvent) => sampleHistory([event_], ctx, subject)[0].summary;
    expect(text(event({ after: sampleRow }))).toBe("Sample ORD041-S001 registered");
    expect(text(event({ action: "UPDATE", before: sampleRow, after: { ...sampleRow, volume_ul: 40, matrix: "Serum" } }))).toBe("Sample details changed: Matrix, Volume (µL)");
    expect(text(event({ action: "UPDATE", before: sampleRow, after: { ...sampleRow, archived_at: "2026-11-06T10:00:00Z", archived_reason: "duplicate tube" } }))).toBe("Sample archived: duplicate tube");
  });

  it("describes aliquots, exclusions and injections by what they mean for the sample", () => {
    const text = (event_: AuditEvent) => sampleHistory([event_], ctx, subject)[0].summary;
    const aliquot = { id: ALIQUOT, sample_id: SAMPLE, volume_ul: 20, extracted_at: null, extracted_by: null };
    expect(text(event({ entity: "aliquot", entityId: ALIQUOT, after: aliquot }))).toBe("Aliquot created (20 µL)");
    expect(text(event({ entity: "aliquot", entityId: ALIQUOT, action: "UPDATE", before: aliquot, after: { ...aliquot, extracted_at: "2026-11-06T14:00:00Z", extracted_by: STEPH } }))).toBe("Aliquot extracted");
    expect(text(event({ entity: "exclusion", entityId: "e0000000-0000-4000-8000-000000000001", after: { sample_id: SAMPLE, reason: "tube cracked" } }))).toBe("Sample excluded: tube cracked");
    expect(text(event({ entity: "injection", entityId: "10000000-0000-4000-8000-000000000001", after: { aliquot_id: ALIQUOT, sample_name: "B2026-031_017_ORD041-S001", status: "planned" } }))).toBe("Planned as injection B2026-031_017_ORD041-S001");
    expect(text(event({ entity: "injection", entityId: "10000000-0000-4000-8000-000000000001", action: "UPDATE", before: { aliquot_id: ALIQUOT, sample_name: "B2026-031_017_ORD041-S001", status: "planned" }, after: { aliquot_id: ALIQUOT, sample_name: "B2026-031_017_ORD041-S001", status: "acquired" } })))
      .toBe("Injection B2026-031_017_ORD041-S001 acquired");
  });

  it("carries the changed fields for the expandable detail, and falls back to the audit wording for anything else", () => {
    const [row] = sampleHistory([event({ action: "UPDATE", before: sampleRow, after: { ...sampleRow, volume_ul: 40 } })], ctx, subject);
    expect(row.changes).toEqual([{ field: "Volume (µL)", before: "50", after: "40" }]);
    const [other] = sampleHistory([event({ entity: "aliquot", entityId: ALIQUOT, action: "UPDATE", before: { sample_id: SAMPLE, notes: "a" }, after: { sample_id: SAMPLE, notes: "b" } })], ctx, subject);
    expect(other.summary).toBe("Aliquot updated");
  });
});
