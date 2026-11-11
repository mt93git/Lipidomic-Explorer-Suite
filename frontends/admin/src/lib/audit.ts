// The audit log's reading of admin.audit_event (db/admin/migrations/0001, 0003): a one-line human summary and the
// changed fields of each event. Pure: no React, no server imports; both sides of the data seam (data/audit.ts) use it.
import { accessReference } from "./access-requests";
import { formatLabInstant } from "./lab-time";
import { stages } from "./models";
import { datasetStatusLabels, signerRoleLabels, type DatasetStatus, type SignerRole } from "./release";
import { dbStages } from "./samples";

export type AuditRecord = Record<string, unknown>;
// One admin.audit_event row: the audited row after the write, and before it for an UPDATE.
export type AuditEvent = {
  id: number; createdAt: string; actor: string | null; entity: string; entityId: string | null;
  action: "INSERT" | "UPDATE"; before: AuditRecord | null; after: AuditRecord | null;
};
// What the summaries name things by: lab people (user id → name), orders (id → code), datasets (id → order and version).
export type AuditContext = { people: Record<string, string>; orders: Record<string, string>; datasets: Record<string, { orderId: string; version: number }> };
// before is null for an INSERT (the row did not exist).
export type AuditChange = { field: string; before: string | null; after: string };
export type AuditFilters = { entity: string | null; order: string | null; before: number | null };

export const AUDIT_PAGE_SIZE = 50;

// Every table the audit trigger is attached to (0003, release_policy in 0005, shipping_instructions in 0019, access_request
// in 0020, recorded without its personal data, deliverable in 0021, client_contact in 0023), in the order the menu lists them.
const entityLabels: Record<string, string> = {
  order: "Order", shipment: "Shipment", sample: "Sample", aliquot: "Aliquot", box_position: "Box position", exclusion: "Exclusion",
  batch: "Batch", batch_version: "Batch version", injection: "Injection", result_file: "Results file", name_map: "Name dictionary entry",
  dataset: "Dataset", signature: "Signature", release_policy: "Release policy", shipping_instructions: "Shipping instructions", client_contact: "Contact for clients", job: "Job",
  client: "Client", client_member: "Client member", lab_staff: "Lab staff", instrument: "Instrument", panel: "Panel",
  access_request: "Access request", deliverable: "Deliverable",
};
export const auditEntities = Object.entries(entityLabels).map(([value, label]) => ({ value, label }));

const humanize = (name: string) => {
  const words = name.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
export const entityLabel = (entity: string) => Object.hasOwn(entityLabels, entity) ? entityLabels[entity] : humanize(entity);

const text = (value: unknown) => typeof value === "string" ? value : null;
const changed = (event: AuditEvent, key: string) => event.action === "UPDATE" && JSON.stringify(event.before?.[key]) !== JSON.stringify(event.after?.[key]);
const orderCode = (id: unknown, ctx: AuditContext) => { const key = text(id); return key ? ctx.orders[key] ?? null : null; };
const named = (code: string | null, version: unknown) => [code, typeof version === "number" ? `v${version}` : null].filter(Boolean).join(" ");
const datasetName = (id: unknown, ctx: AuditContext) => {
  const dataset = text(id) ? ctx.datasets[id as string] : undefined;
  return dataset ? named(orderCode(dataset.orderId, ctx), dataset.version) : null;
};
const stageLabel = (stage: string) => stage === "released" ? "Released" : stages[(dbStages as readonly string[]).indexOf(stage)] ?? stage;
const personName = (id: unknown, ctx: AuditContext) => { const key = text(id); return key ? ctx.people[key] ?? null : null; };
const forOrder = (row: AuditRecord, ctx: AuditContext) => { const code = orderCode(row.order_id, ctx); return code ? ` for ${code}` : ""; };

function specific(event: AuditEvent, ctx: AuditContext): string | null {
  const row = event.after;
  if (!row) return null;
  const insert = event.action === "INSERT";
  switch (event.entity) {
    case "dataset": {
      const name = ["Dataset", named(orderCode(row.order_id, ctx), row.version)].filter(Boolean).join(" ");
      if (insert) return `${name} built`;
      if (changed(event, "status") && text(row.status) && Object.hasOwn(datasetStatusLabels, row.status as string)) return `${name} ${datasetStatusLabels[row.status as DatasetStatus].toLowerCase()}`;
      return null;
    }
    case "signature": {
      if (!insert) return null;
      const role = signerRoleLabels[row.role as SignerRole];
      const dataset = datasetName(row.dataset_id, ctx);
      return `Signature added${dataset ? ` to ${dataset}` : ""}${role ? ` (${role})` : ""}`;
    }
    case "order": {
      const code = text(row.code) ?? orderCode(event.entityId, ctx);
      const name = code ? `Order ${code}` : "Order";
      if (insert) return row.review === "pending" ? `${name} requested by the client` : `${name} created`;
      if (changed(event, "review") && (row.review === "accepted" || row.review === "declined")) return `${name}: request ${row.review}`;
      if (changed(event, "stage") && text(row.stage)) return `${name} moved to ${stageLabel(row.stage as string)}`;
      return null;
    }
    case "release_policy": {
      if (!insert) return null;
      const signers = Array.isArray(row.eligible_signers) ? row.eligible_signers.map(id => personName(id, ctx) ?? shortUser(String(id))) : [];
      return `Release policy changed: ${row.required_signatures} of ${signers.length ? signers.join(", ") : "any lab owner or admin"}`;
    }
    case "shipping_instructions": return insert ? "Shipping instructions changed" : null;
    case "client_contact": return insert ? "Contact for clients changed" : null;
    case "access_request": {
      const name = typeof row.number === "number" ? `Access request ${accessReference(row.number)}` : "Access request";
      if (insert) return `${name} received`;
      if (changed(event, "erased_at") && row.erased_at) return `${name}: personal data erased (90 days after it was declined)`;
      if (changed(event, "status") && (row.status === "approved" || row.status === "declined")) return `${name} ${row.status}`;
      return null;
    }
    case "deliverable": {
      const name = `File${text(row.title) ? ` "${row.title}"` : ""}${forOrder(row, ctx)}`;
      if (insert) return `${name} added${row.visible_to_client ? " and shown to the client" : ""}`;
      if (changed(event, "archived_at") && row.archived_at) return `${name} retired`;
      if (changed(event, "visible_to_client")) return `${name} ${row.visible_to_client ? "shown to" : "hidden from"} the client`;
      return null;
    }
    case "client":
      if (changed(event, "nexo_access")) return `Nexo access turned ${row.nexo_access ? "on" : "off"}${text(row.name) ? ` for ${row.name}` : ""}`;
      if (changed(event, "members_prepare")) return `Members may prepare in Nexo turned ${row.members_prepare ? "on" : "off"}${text(row.name) ? ` for ${row.name}` : ""}`;
      return null;
    case "shipment": return insert ? `Shipment received${forOrder(row, ctx)}` : null;
    case "sample": return insert ? `Sample${text(row.sample_code) ? ` ${row.sample_code}` : ""} registered` : null;
    case "result_file":
      if (insert) return `Results file ${row.status === "accepted" ? "accepted" : "uploaded"}${forOrder(row, ctx)}`;
      if (changed(event, "status") && text(row.status)) return `Results file${forOrder(row, ctx)} ${row.status}`;
      return null;
    default: return null;
  }
}

export function auditSummary(event: AuditEvent, ctx: AuditContext): string {
  return specific(event, ctx) ?? `${entityLabel(event.entity)} ${event.action === "INSERT" ? "inserted" : "updated"}`;
}

// ---------------------------------------------------------------- changed fields

const fieldLabels: Record<string, string> = {
  volume_ul: "Volume (µL)", order_id: "Order", dataset_id: "Dataset", user_id: "User", sha256: "SHA-256",
  nexo_access: "Nexo access", members_prepare: "Members may prepare in Nexo",
};
// The client's Nexo switches (0021, 0024) read on/off, not true/false.
const switches = new Set(["nexo_access", "members_prepare"]);
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const MAX_TEXT = 120;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function shown(key: string, value: unknown, ctx: AuditContext): string {
  if (value === null || value === undefined) return "—";
  if (switches.has(key) && typeof value === "boolean") return value ? "on" : "off";
  if (key === "order_id") return orderCode(value, ctx) ?? String(value);
  if (key === "dataset_id") return datasetName(value, ctx) ?? String(value);
  if (Array.isArray(value)) {
    if (value.some(item => item !== null && typeof item === "object")) return `[${plural(value.length, "item")}]`;
    return value.length ? value.map(item => shown("", item, ctx)).join(", ") : "none";
  }
  if (typeof value === "object") return `{${plural(Object.keys(value).length, "field")}}`;
  if (typeof value === "string") {
    const person = personName(value, ctx);
    if (person) return person;
    if (ISO_INSTANT.test(value)) return formatLabInstant(value) || value;
    return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
  }
  return String(value);
}

const skippedOnInsert = new Set(["id", "created_at"]);

export function auditChanges(event: AuditEvent, ctx: AuditContext): AuditChange[] {
  const after = event.after ?? {};
  const field = (key: string) => fieldLabels[key] ?? humanize(key);
  if (event.action === "INSERT") {
    return Object.entries(after)
      .filter(([key, value]) => !skippedOnInsert.has(key) && value !== null && value !== undefined)
      .map(([key, value]) => ({ field: field(key), before: null, after: shown(key, value, ctx) }));
  }
  const before = event.before ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(key => ({ field: field(key), before: shown(key, before[key], ctx), after: shown(key, after[key], ctx) }));
}

// ---------------------------------------------------------------- who

const shortUser = (id: string) => `User ${id.slice(0, 8)}…`;
// Lab staff by display name (the data side adds the signed-in user's own email when they have none); a write with
// no signed-in user (the service role, a migration) is the System.
export function auditActor(actor: string | null, ctx: AuditContext): string {
  if (!actor) return "System";
  return ctx.people[actor] ?? shortUser(actor);
}

// ---------------------------------------------------------------- URL

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export function parseAuditFilters(params: Params): AuditFilters {
  const entity = first(params.entity);
  const order = first(params.order).trim().toUpperCase().slice(0, 40);
  const before = first(params.before);
  return {
    entity: Object.hasOwn(entityLabels, entity) ? entity : null,
    order: order || null,
    before: /^[1-9]\d{0,15}$/.test(before) ? Number(before) : null,
  };
}

export function auditHref(filters: AuditFilters): string {
  const query = new URLSearchParams();
  if (filters.entity) query.set("entity", filters.entity);
  if (filters.order) query.set("order", filters.order);
  if (filters.before) query.set("before", String(filters.before));
  const search = query.toString();
  return search ? `/audit-log?${search}` : "/audit-log";
}
