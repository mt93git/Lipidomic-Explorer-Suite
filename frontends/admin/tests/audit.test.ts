// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  auditActor, auditChanges, auditEntities, auditHref, auditSummary, parseAuditFilters, type AuditContext, type AuditEvent,
} from "@/lib/audit";

// Synthetic ids and people only.
const STEPH = "5e5e5e5e-0000-4000-8000-000000000001";
const PAULA = "5e5e5e5e-0000-4000-8000-000000000002";
const ORDER = "0d0d0d0d-0000-4000-8000-000000000080";
const DATASET = "da7a0000-0000-4000-8000-000000000001";
const ctx: AuditContext = {
  people: { [STEPH]: "Stephania (simulated)", [PAULA]: "Paula (simulated)" },
  orders: { [ORDER]: "ORD080" },
  datasets: { [DATASET]: { orderId: ORDER, version: 1 } },
};
const event = (patch: Partial<AuditEvent>): AuditEvent => ({
  id: 1, createdAt: "2026-11-08T15:00:00Z", actor: STEPH, entity: "dataset", entityId: DATASET, action: "INSERT", before: null, after: null, ...patch,
});
const builtRow = { id: DATASET, order_id: ORDER, client_id: "c1", version: 1, status: "built", project_id: null, companion_path: null, released_at: null, created_at: "2026-11-08T14:00:00Z" };
const release = event({
  action: "UPDATE",
  before: builtRow,
  after: { ...builtRow, status: "released", project_id: "7e470000-0000-4000-8000-000000000001", companion_path: "c1/ORD080/companion.xlsx", released_at: "2026-11-08T15:00:00Z" },
});

describe("auditSummary: one human line per event", () => {
  it("names a dataset release, a build and a withdrawal by order code and version", () => {
    expect(auditSummary(release, ctx)).toBe("Dataset ORD080 v1 released");
    expect(auditSummary(event({ after: builtRow }), ctx)).toBe("Dataset ORD080 v1 built");
    const withdrawn = event({ action: "UPDATE", before: { ...builtRow, status: "released" }, after: { ...builtRow, status: "withdrawn", archived_at: "2026-11-09T10:00:00Z", archived_reason: "wrong metadata" } });
    expect(auditSummary(withdrawn, ctx)).toBe("Dataset ORD080 v1 withdrawn");
  });

  it("names a signature by its dataset and role", () => {
    const signed = event({ entity: "signature", entityId: "51900000-0000-4000-8000-000000000001", after: { dataset_id: DATASET, user_id: STEPH, role: "approved", note: null } });
    expect(auditSummary(signed, ctx)).toBe("Signature added to ORD080 v1 (Approved)");
  });

  it("names an order's stage change and its creation", () => {
    const moved = event({ entity: "order", entityId: ORDER, action: "UPDATE", before: { id: ORDER, code: "ORD080", stage: "received" }, after: { id: ORDER, code: "ORD080", stage: "registered" } });
    expect(auditSummary(moved, ctx)).toBe("Order ORD080 moved to Registered");
    expect(auditSummary({ ...moved, before: { ...moved.before, stage: "excel_built" }, after: { ...moved.after, stage: "released" } }, ctx)).toBe("Order ORD080 moved to Released");
    expect(auditSummary(event({ entity: "order", entityId: ORDER, after: { id: ORDER, code: "ORD080", stage: "request" } }), ctx)).toBe("Order ORD080 created");
  });

  it("names a release policy by its count and signers, or any lab owner or admin when nobody is listed", () => {
    const policy = event({ entity: "release_policy", after: { eligible_signers: [PAULA, STEPH], required_signatures: 2, set_by: STEPH } });
    expect(auditSummary(policy, ctx)).toBe("Release policy changed: 2 of Paula (simulated), Stephania (simulated)");
    expect(auditSummary(event({ entity: "release_policy", after: { eligible_signers: [], required_signatures: 3 } }), ctx)).toBe("Release policy changed: 3 of any lab owner or admin");
  });

  it("names the pilot's earlier steps: shipment, samples and the results file", () => {
    expect(auditSummary(event({ entity: "shipment", after: { order_id: ORDER, carrier: "FedEx" } }), ctx)).toBe("Shipment received for ORD080");
    expect(auditSummary(event({ entity: "sample", after: { order_id: ORDER, sample_code: "ORD080-S001", full_name: "S1" } }), ctx)).toBe("Sample ORD080-S001 registered");
    expect(auditSummary(event({ entity: "result_file", after: { order_id: ORDER, status: "accepted" } }), ctx)).toBe("Results file accepted for ORD080");
  });

  it("falls back to <Entity> <inserted|updated> for every other shape", () => {
    expect(auditSummary(event({ entity: "batch_version", after: { version: 1 } }), ctx)).toBe("Batch version inserted");
    expect(auditSummary(event({ entity: "instrument", action: "UPDATE", before: { name: "A" }, after: { name: "B" } }), ctx)).toBe("Instrument updated");
    expect(auditSummary(event({ entity: "widget_part", action: "UPDATE", before: {}, after: {} }), ctx)).toBe("Widget part updated");
    // A dataset update that is not a status change, or an event whose row is missing.
    expect(auditSummary(event({ action: "UPDATE", before: builtRow, after: { ...builtRow, companion_path: "x" } }), ctx)).toBe("Dataset updated");
    expect(auditSummary(event({ entity: "signature", after: null }), ctx)).toBe("Signature inserted");
    expect(auditSummary(event({ entity: "client", action: "UPDATE", before: { name: "A", nexo_access: false }, after: { name: "B", nexo_access: false } }), ctx)).toBe("Client updated");
  });

  it("names deliverables (F4) by title and order, and the per-client Nexo switch", () => {
    const file = { title: "Study report", order_id: "o-1", visible_to_client: false, archived_at: null };
    const fctx = { ...ctx, orders: { ...ctx.orders, "o-1": "ORD040" } };
    expect(auditSummary(event({ entity: "deliverable", after: file }), fctx)).toBe('File "Study report" for ORD040 added');
    expect(auditSummary(event({ entity: "deliverable", after: { ...file, visible_to_client: true } }), fctx)).toBe('File "Study report" for ORD040 added and shown to the client');
    expect(auditSummary(event({ entity: "deliverable", action: "UPDATE", before: file, after: { ...file, visible_to_client: true } }), fctx)).toBe('File "Study report" for ORD040 shown to the client');
    expect(auditSummary(event({ entity: "deliverable", action: "UPDATE", before: { ...file, visible_to_client: true }, after: file }), fctx)).toBe('File "Study report" for ORD040 hidden from the client');
    expect(auditSummary(event({ entity: "deliverable", action: "UPDATE", before: file, after: { ...file, archived_at: "2026-11-10T10:00:00Z" } }), fctx)).toBe('File "Study report" for ORD040 retired');
    expect(auditSummary(event({ entity: "client", action: "UPDATE", before: { name: "Example Cedar", nexo_access: false }, after: { name: "Example Cedar", nexo_access: true } }), ctx)).toBe("Nexo access turned on for Example Cedar");
  });

  it("still reads when the order or dataset is not in the context", () => {
    expect(auditSummary(event({ after: { ...builtRow, order_id: "unknown" } }), ctx)).toBe("Dataset v1 built");
    expect(auditSummary(event({ entity: "shipment", after: { order_id: "unknown" } }), ctx)).toBe("Shipment received");
  });
});

describe("auditChanges: the changed fields only, never whole JSON", () => {
  it("lists an update's changed fields before → after, people and orders by name, instants in lab time", () => {
    expect(auditChanges(release, ctx)).toEqual([
      { field: "Status", before: "built", after: "released" },
      { field: "Project id", before: "—", after: "7e470000-0000-4000-8000-000000000001" },
      { field: "Companion path", before: "—", after: "c1/ORD080/companion.xlsx" },
      { field: "Released at", before: "—", after: "Nov 8, 2026, 10:00 EST" },
    ]);
  });

  it("lists an insert's set fields without a before, skipping the row's id and creation time", () => {
    const signed = event({ entity: "signature", after: { id: "s1", created_at: "2026-11-08T15:00:00Z", archived_at: null, dataset_id: DATASET, user_id: STEPH, role: "approved", note: null } });
    expect(auditChanges(signed, ctx)).toEqual([
      { field: "Dataset", before: null, after: "ORD080 v1" },
      { field: "User", before: null, after: "Stephania (simulated)" },
      { field: "Role", before: null, after: "approved" },
    ]);
    const policy = event({ entity: "release_policy", after: { eligible_signers: [PAULA, STEPH], required_signatures: 2 } });
    expect(auditChanges(policy, ctx)).toEqual([
      { field: "Eligible signers", before: null, after: "Paula (simulated), Stephania (simulated)" },
      { field: "Required signatures", before: null, after: "2" },
    ]);
  });

  it("shows nested objects and long text as a short placeholder", () => {
    const file = event({ entity: "result_file", after: { order_id: ORDER, summary: { checks: [1, 2], analytes: ["a"] }, rows: [{ a: 1 }, { b: 2 }], notes: "x".repeat(300) } });
    const changes = auditChanges(file, ctx);
    expect(changes).toContainEqual({ field: "Order", before: null, after: "ORD080" });
    expect(changes).toContainEqual({ field: "Summary", before: null, after: "{2 fields}" });
    expect(changes).toContainEqual({ field: "Rows", before: null, after: "[2 items]" });
    const notes = changes.find(change => change.field === "Notes")!;
    expect(notes.after.length).toBeLessThanOrEqual(121);
    expect(notes.after.endsWith("…")).toBe(true);
    expect(JSON.stringify(changes)).not.toContain("analytes");
  });
});

describe("auditActor", () => {
  it("is the lab staff name, else a short user id, else System", () => {
    expect(auditActor(STEPH, ctx)).toBe("Stephania (simulated)");
    expect(auditActor("abcdef12-0000-4000-8000-000000000009", ctx)).toBe("User abcdef12…");
    expect(auditActor(null, ctx)).toBe("System");
  });
});

describe("filters in the URL", () => {
  it("reads entity, order code and the keyset cursor, dropping what is not valid", () => {
    expect(parseAuditFilters({ entity: "dataset", order: " ord080 ", before: "120" })).toEqual({ entity: "dataset", order: "ORD080", before: 120 });
    expect(parseAuditFilters({ entity: "drop table", order: "", before: "abc" })).toEqual({ entity: null, order: null, before: null });
    expect(parseAuditFilters({ entity: "toString" }).entity).toBeNull();
    expect(parseAuditFilters({ before: "-1" }).before).toBeNull();
    expect(parseAuditFilters({ before: "1.5" }).before).toBeNull();
    expect(parseAuditFilters({ entity: ["dataset", "order"] }).entity).toBe("dataset");
  });

  it("writes them back, omitting what is empty", () => {
    expect(auditHref({ entity: "dataset", order: "ORD080", before: null })).toBe("/audit-log?entity=dataset&order=ORD080");
    expect(auditHref({ entity: null, order: null, before: 51 })).toBe("/audit-log?before=51");
    expect(auditHref({ entity: null, order: null, before: null })).toBe("/audit-log");
  });

  it("offers every audited table as an entity", () => {
    expect(auditEntities.map(item => item.value)).toEqual(expect.arrayContaining(["order", "shipment", "sample", "result_file", "dataset", "signature", "release_policy", "lab_staff"]));
    expect(auditEntities.find(item => item.value === "result_file")?.label).toBe("Results file");
  });
});
