// a21 Audit log: the Client column (a colour square per client, or "N clients"), the short When, and the CSV export of
// the current filter (UTF-8, ISO time plus lab time, lab staff only). Pure parts here; the seam and the route below.
import { describe, expect, it } from "vitest";
import { formatLabInstant } from "@/lib/lab-time";
import {
  AUDIT_EXPORT_MAX, auditClientIds, auditClientTags, auditCsv, auditExportFilename, auditExportHref, formatAuditWhen,
  type AuditContext, type AuditEvent,
} from "@/lib/audit";

const ctx = (patch: Partial<AuditContext> = {}): AuditContext => ({
  people: {}, orders: { "o-1": "ORD080" }, datasets: { "d-1": { orderId: "o-1", version: 1 } },
  clients: { "c-heme": "Hematology group", "c-lib": "Libreros lab", "c-uni": "Partner univ." },
  ...patch,
});
const event = (patch: Partial<AuditEvent>): AuditEvent => ({ id: 1, createdAt: "2026-11-13T14:14:00Z", actor: null, entity: "order", entityId: "o-1", action: "INSERT", before: null, after: {}, ...patch });

describe("auditClientIds: which clients an event is about", () => {
  it("is the event's own client_id when the trigger recorded one", () => {
    expect(auditClientIds(event({ clientId: "c-lib" }), ctx())).toEqual(["c-lib"]);
  });
  it("is every client with an injection in the batch for a batch or batch version event (they carry no client)", () => {
    const batches = { "b-1": ["c-heme", "c-lib"] };
    expect(auditClientIds(event({ entity: "batch", entityId: "b-1", clientId: null }), ctx({ batchClients: batches }))).toEqual(["c-heme", "c-lib"]);
    expect(auditClientIds(event({ entity: "batch_version", entityId: "v-1", after: { batch_id: "b-1" } }), ctx({ batchClients: batches }))).toEqual(["c-heme", "c-lib"]);
    expect(auditClientIds(event({ entity: "batch", entityId: "b-2" }), ctx({ batchClients: batches }))).toEqual([]);
  });
  it("falls back to the order's client (the demo keeps orders by code), a signature through its dataset", () => {
    const orders = { orderClients: { "o-1": "c-heme" } };
    expect(auditClientIds(event({ entity: "shipment", entityId: "s-1", after: { order_id: "o-1" } }), ctx(orders))).toEqual(["c-heme"]);
    expect(auditClientIds(event({ entity: "signature", entityId: "g-1", after: { dataset_id: "d-1" } }), ctx(orders))).toEqual(["c-heme"]);
    expect(auditClientIds(event({ entity: "order", entityId: "o-1" }), ctx(orders))).toEqual(["c-heme"]);
  });
  it("is none for a lab-wide event (release policy, invitation of lab staff)", () => {
    expect(auditClientIds(event({ entity: "release_policy", entityId: "p-1", after: { required_signatures: 2 } }), ctx())).toEqual([]);
  });
});

describe("auditClientTags: name and colour slot", () => {
  it("names each client once, sorted, with a colour slot that is stable across the page (sorted over every client)", () => {
    expect(auditClientTags(["c-uni", "c-heme", "c-heme"], ctx())).toEqual([{ name: "Hematology group", slot: 0 }, { name: "Partner univ.", slot: 2 }]);
    expect(auditClientTags(["c-lib"], ctx())).toEqual([{ name: "Libreros lab", slot: 1 }]);
  });
  it("drops a client whose name is not readable", () => {
    expect(auditClientTags(["c-gone"], ctx())).toEqual([]);
  });
});

describe("formatAuditWhen: short lab time like the prototype", () => {
  const now = new Date("2026-11-13T20:00:00Z"); // 15:00 EST on 13 Nov
  it("today: the clock; yesterday: Yesterday and the clock; this year: day, month and clock; else with the year", () => {
    expect(formatAuditWhen("2026-11-13T14:14:00Z", now)).toBe("09:14");
    expect(formatAuditWhen("2026-11-12T23:12:00Z", now)).toBe("Yesterday 18:12");
    expect(formatAuditWhen("2026-11-05T15:10:00Z", now)).toBe("5 Nov 10:10");
    expect(formatAuditWhen("2025-11-05T15:10:00Z", now)).toBe("5 Nov 2025 10:10");
  });
  it("uses the lab's day, not UTC's: 03:00 UTC on the 13th is still the 12th in New Haven", () => {
    expect(formatAuditWhen("2026-11-13T03:00:00Z", now)).toBe("Yesterday 22:00");
  });
  it("is empty for an unreadable instant", () => {
    expect(formatAuditWhen("not a date", now)).toBe("");
  });
});

describe("auditCsv: the export file", () => {
  const rows = [{
    id: 12, at: "2026-11-13T14:14:00.000Z", who: "Paula", clients: [{ name: "Hematology group", slot: 0 }], entity: "Signature", action: "INSERT" as const,
    summary: "Signature added to ORD080 v1 (Analyst)", changes: [{ field: "Role", before: null, after: "analyst" }, { field: "Note", before: "a, \"b\"", after: "=SUM(A1)" }],
  }, {
    id: 11, at: "2026-11-12T23:12:00.000Z", who: "Usman", clients: [{ name: "Hematology group", slot: 0 }, { name: "Libreros lab", slot: 1 }], entity: "Batch", action: "UPDATE" as const,
    summary: "Batch updated", changes: [],
  }];
  const text = auditCsv(rows);
  const lines = text.slice(1).split("\r\n");
  it("starts with a UTF-8 byte order mark and a header row; lines end in CRLF", () => {
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]).toBe('"Event","When (ISO 8601, UTC)","When (lab time, America/New_York)","Who","Client","Entity","Action","What","Changes"');
    expect(text.endsWith("\r\n")).toBe(true);
  });
  it("writes the ISO instant and the lab time, every client, the sentence and the changed fields", () => {
    expect(lines[1]).toBe(`"12","2026-11-13T14:14:00.000Z","${formatLabInstant("2026-11-13T14:14:00.000Z")}","Paula","Hematology group","Signature","Insert","Signature added to ORD080 v1 (Analyst)","Role: analyst; Note: a, ""b"" → =SUM(A1)"`);
    expect(lines[2]).toBe(`"11","2026-11-12T23:12:00.000Z","${formatLabInstant("2026-11-12T23:12:00.000Z")}","Usman","Hematology group; Libreros lab","Batch","Update","Batch updated",""`);
  });
  it("neutralises a cell a spreadsheet would run as a formula", () => {
    const evil = auditCsv([{ ...rows[1], who: "=HYPERLINK(\"x\")", summary: "+1", clients: [{ name: "-2", slot: 0 }], changes: [] }]);
    expect(evil).toContain('"\'=HYPERLINK(""x"")"');
    expect(evil).toContain('"\'+1"');
    expect(evil).toContain('"\'-2"');
  });
  it("adds a closing line when the export stopped at the cap", () => {
    const capped = auditCsv(rows, { truncated: true }).slice(1).split("\r\n");
    expect(capped.at(-2)).toBe(`"","","","","","","","Only the newest ${AUDIT_EXPORT_MAX} events are in this file. Filter by entity or order code to export older ones.",""`);
  });
});

describe("export link and file name", () => {
  it("keeps the filter and drops the page cursor (the file has every page)", () => {
    expect(auditExportHref({ entity: "dataset", order: "ORD080", before: 120 })).toBe("/audit-log/export?entity=dataset&order=ORD080");
    expect(auditExportHref({ entity: null, order: null, before: null })).toBe("/audit-log/export");
  });
  it("names the file by lab day and filter", () => {
    const now = new Date("2026-11-14T03:00:00Z"); // 13 Nov in the lab
    expect(auditExportFilename({ entity: null, order: null, before: null }, now)).toBe("audit-log-2026-11-13.csv");
    expect(auditExportFilename({ entity: "dataset", order: "ORD080", before: null }, now)).toBe("audit-log-2026-11-13-ORD080-dataset.csv");
  });
});
