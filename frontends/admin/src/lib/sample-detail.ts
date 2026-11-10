// The sample detail page's shapes and its history: the audit events about one sample, read in plain words.
// Pure: no React, no server imports. The wording of a change, the actor and the fields come from the audit log
// (audit.ts); this file only decides which events belong to the sample and how each one reads from its side.
import { auditActor, auditChanges, auditSummary, type AuditChange, type AuditContext, type AuditEvent } from "./audit";
import type { OrderSummary, RegisteredSample, ShipmentRecord } from "./samples";

export type SampleAliquot = { id: string; volumeUl: number | null; extractedAt: string | null; extractedBy: string | null; archived: boolean };
// batch and version are null only when the batch row is not readable.
export type SampleInjection = { id: string; seq: number; name: string; batch: string | null; version: number | null; status: string; plate: string | null; vial: string | null };
export type HistoryRow = { id: number; at: string; who: string; summary: string; changes: AuditChange[] };
export type SampleDetail = {
  sample: RegisteredSample & { archivedReason: string | null };
  order: OrderSummary | null;
  shipment: ShipmentRecord | null;
  aliquots: SampleAliquot[];
  injections: SampleInjection[];
  history: HistoryRow[];
};
// What identifies the sample in the audit trail: its own row, its aliquots (and through them its injections).
export type HistorySubject = { id: string; code: string; aliquotIds: string[] };

const text = (value: unknown) => typeof value === "string" && value ? value : null;
const touched = (event: AuditEvent, key: string) => event.action === "UPDATE" && JSON.stringify(event.before?.[key]) !== JSON.stringify(event.after?.[key]);

function belongs(event: AuditEvent, subject: HistorySubject): boolean {
  const after = event.after;
  switch (event.entity) {
    case "sample": return event.entityId === subject.id;
    case "aliquot": return !!event.entityId && subject.aliquotIds.includes(event.entityId);
    case "exclusion": return after?.sample_id === subject.id;
    case "injection": return typeof after?.aliquot_id === "string" && subject.aliquotIds.includes(after.aliquot_id);
    default: return false;
  }
}

function summary(event: AuditEvent, ctx: AuditContext, subject: HistorySubject): string {
  const row = event.after ?? {};
  const insert = event.action === "INSERT";
  switch (event.entity) {
    case "sample": {
      if (insert) return `Sample ${text(row.sample_code) ?? subject.code} registered`;
      if (touched(event, "archived_at") && text(row.archived_at)) return `Sample archived${text(row.archived_reason) ? `: ${row.archived_reason}` : ""}`;
      const fields = auditChanges(event, ctx).map(change => change.field);
      return fields.length ? `Sample details changed: ${fields.join(", ")}` : "Sample updated";
    }
    case "aliquot": {
      if (insert) return typeof row.volume_ul === "number" ? `Aliquot created (${row.volume_ul} µL)` : "Aliquot created";
      if (touched(event, "extracted_at") && text(row.extracted_at)) return "Aliquot extracted";
      if (touched(event, "archived_at") && text(row.archived_at)) return `Aliquot archived${text(row.archived_reason) ? `: ${row.archived_reason}` : ""}`;
      return auditSummary(event, ctx);
    }
    case "exclusion":
      return insert ? `Sample excluded${text(row.reason) ? `: ${row.reason}` : ""}` : auditSummary(event, ctx);
    case "injection": {
      const name = text(row.sample_name) ?? "";
      if (insert) return `Planned as injection ${name}`.trim();
      if (touched(event, "status") && text(row.status)) return `Injection ${name} ${row.status}`;
      return auditSummary(event, ctx);
    }
    default: return auditSummary(event, ctx);
  }
}

// Newest first (ties by id, which grows with time).
export function sampleHistory(events: AuditEvent[], ctx: AuditContext, subject: HistorySubject): HistoryRow[] {
  return events.filter(event => belongs(event, subject))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    .map(event => ({ id: event.id, at: event.createdAt, who: auditActor(event.actor, ctx), summary: summary(event, ctx, subject), changes: auditChanges(event, ctx) }));
}
