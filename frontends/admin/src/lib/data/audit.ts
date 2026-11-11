import "server-only";
import {
  AUDIT_PAGE_SIZE, auditActor, auditChanges, auditSummary, entityLabel,
  type AuditChange, type AuditContext, type AuditEvent, type AuditFilters, type AuditRecord,
} from "../audit";
import { demoOrders } from "../demo";
import { getEnvironment } from "../environment";
import { demoLabStaff, demoPolicy, type DemoDataset } from "../release-demo";
import { DataError } from "../samples";
import { applyDemoState, type DemoState } from "../samples-demo";
import { requireWorkspace } from "../session";
import { createAdminClient } from "../supabase/server";
import { readDemoState } from "./demo-store";

// The audit log side of the data seam. Live mode reads admin.audit_event with the signed-in user's token (RLS:
// lab staff only, audit_event_read in 0004), newest first, keyset on id. Demo mode derives a few events of the same
// shape from the browser's demo records, so the screen and its filters work without Supabase.

export type AuditRow = { id: number; at: string; who: string; entity: string; summary: string; changes: AuditChange[] };
// order: the order code filter and whether such an order exists (null when not filtering by order).
export type AuditPage = { rows: AuditRow[]; older: number | null; order: { code: string; found: boolean } | null };

// Tables whose rows carry order_id (an order's own events are entity "order"); signatures carry dataset_id.
const ORDER_CHILDREN = ["shipment", "sample", "result_file", "dataset"];

const toRow = (event: AuditEvent, ctx: AuditContext): AuditRow => ({
  id: event.id, at: event.createdAt, who: auditActor(event.actor, ctx), entity: entityLabel(event.entity),
  summary: auditSummary(event, ctx), changes: auditChanges(event, ctx),
});
function page(events: AuditEvent[], ctx: AuditContext, order: AuditPage["order"]): AuditPage {
  const shown = events.slice(0, AUDIT_PAGE_SIZE);
  return { rows: shown.map(event => toRow(event, ctx)), older: events.length > AUDIT_PAGE_SIZE ? shown.at(-1)!.id : null, order };
}
const text = (value: unknown) => typeof value === "string" ? value : null;
const unique = (values: (string | null)[]) => Array.from(new Set(values.filter((value): value is string => !!value)));

export async function listAuditEvents(filters: AuditFilters): Promise<AuditPage> {
  const session = await requireWorkspace("staff");
  return getEnvironment().mock ? demoPage(filters) : livePage(filters, session);
}

// ---------------------------------------------------------------- live

type DbError = { message: string };
type EventRow = { id: number; created_at: string; actor: string | null; entity: string; entity_id: string | null; action: "INSERT" | "UPDATE"; before: AuditRecord | null; after: AuditRecord | null };
const COLUMNS = "id, created_at, actor, entity, entity_id, action, before, after";

function refusal(error: DbError): DataError {
  if (/permission denied|row-level security/i.test(error.message)) return new DataError("You do not have permission to do this.");
  return new DataError(error.message);
}
async function db() {
  const supabase = await createAdminClient();
  if (!supabase) throw new DataError("Your session is not available. Sign in again.");
  return supabase.schema("admin");
}
type Db = Awaited<ReturnType<typeof db>>;
async function read<T>(query: PromiseLike<{ data: unknown; error: DbError | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw refusal(error);
  return data as T;
}

async function livePage(filters: AuditFilters, session: { userId: string; displayName: string }): Promise<AuditPage> {
  const admin = await db();
  let scope: string | null = null;
  let order: AuditPage["order"] = null;
  if (filters.order) {
    const found = await read<{ id: string; code: string } | null>(admin.from("order").select("id, code").eq("code", filters.order).maybeSingle());
    order = { code: filters.order, found: !!found };
    if (!found) return { rows: [], older: null, order };
    const datasets = await read<{ id: string }[] | null>(admin.from("dataset").select("id, order_id, version").eq("order_id", found.id));
    // Ids come from the database (uuids), never from the URL: the code was matched with eq above.
    const clauses = [`and(entity.eq.order,entity_id.eq.${found.id})`, `and(entity.in.(${ORDER_CHILDREN.join(",")}),after->>order_id.eq.${found.id})`];
    if (datasets?.length) clauses.push(`and(entity.eq.signature,after->>dataset_id.in.(${datasets.map(row => row.id).join(",")}))`);
    scope = clauses.join(",");
  }
  let query = admin.from("audit_event").select(COLUMNS);
  if (filters.entity) query = query.eq("entity", filters.entity);
  if (filters.before) query = query.lt("id", filters.before);
  if (scope) query = query.or(scope);
  const rows = (await read<EventRow[] | null>(query.order("id", { ascending: false }).limit(AUDIT_PAGE_SIZE + 1))) ?? [];
  const events: AuditEvent[] = rows.map(row => ({
    id: Number(row.id), createdAt: row.created_at, actor: row.actor, entity: row.entity, entityId: row.entity_id, action: row.action, before: row.before, after: row.after,
  }));
  return page(events, await liveContext(admin, events.slice(0, AUDIT_PAGE_SIZE), session), order);
}

// The names the shown events need: every lab person (archived too: a signer who left still signed), and the
// datasets and orders they mention.
export async function liveContext(admin: Db, events: AuditEvent[], session: { userId: string; displayName: string }): Promise<AuditContext> {
  const datasetIds = unique(events.flatMap(event => [event.entity === "dataset" ? event.entityId : null, event.entity === "signature" ? text(event.after?.dataset_id) : null]));
  const [staff, datasets] = await Promise.all([
    read<{ user_id: string; display_name: string | null }[] | null>(admin.from("lab_staff").select("user_id, display_name")),
    datasetIds.length ? read<{ id: string; order_id: string; version: number }[] | null>(admin.from("dataset").select("id, order_id, version").in("id", datasetIds)) : Promise.resolve([]),
  ]);
  const orderIds = unique([...events.flatMap(event => [event.entity === "order" ? event.entityId : null, text(event.after?.order_id)]), ...(datasets ?? []).map(row => row.order_id)]);
  const orders = orderIds.length ? await read<{ id: string; code: string }[] | null>(admin.from("order").select("id, code").in("id", orderIds)) : [];
  const people: Record<string, string> = {};
  for (const row of staff ?? []) if (row.display_name?.trim()) people[row.user_id] = row.display_name.trim();
  // The signed-in user's own name or email (session.displayName is display_name, else the account email).
  people[session.userId] ??= session.displayName;
  return {
    people,
    orders: Object.fromEntries((orders ?? []).map(row => [row.id, row.code])),
    datasets: Object.fromEntries((datasets ?? []).map(row => [row.id, { orderId: row.order_id, version: row.version }])),
  };
}

// ---------------------------------------------------------------- demo

// Demo records keep people by name and orders by code; the context maps codes to themselves.
type Draft = Omit<AuditEvent, "id">;
export function demoEvents(state: DemoState): { events: AuditEvent[]; ctx: AuditContext } {
  const people: Record<string, string> = Object.fromEntries(demoLabStaff.map(person => [person.userId, person.name]));
  const actor = (name: string | null | undefined) => {
    if (!name) return null;
    const known = demoLabStaff.find(person => person.name === name);
    if (known) return known.userId;
    people[name] = name;
    return name;
  };
  const drafts: Draft[] = [];
  const add = (createdAt: string, who: string | null, entity: string, entityId: string, after: AuditRecord, before: AuditRecord | null = null) =>
    drafts.push({ createdAt, actor: who, entity, entityId, action: before ? "UPDATE" : "INSERT", before, after });

  const policy = demoPolicy({ datasets: [] });
  const policyRow = (p: typeof policy) => ({ eligible_signers: p.eligibleSigners, required_signatures: p.requiredSignatures, set_by: p.setBy });
  add(policy.setAt ?? "2026-11-01T00:00:00Z", policy.setBy, "release_policy", "demo-policy-1", policyRow(policy));
  if (state.releasePolicy) add(state.releasePolicy.setAt ?? new Date().toISOString(), state.releasePolicy.setBy, "release_policy", "demo-policy-2", policyRow(state.releasePolicy));
  for (const o of state.orders ?? []) add(o.history[0]?.date ?? new Date().toISOString(), actor(o.history[0]?.actor), "order", o.code, { code: o.code, title: o.description, stage: "request", client_id: o.clientId });
  for (const s of state.shipments) add(s.receivedAt, actor(s.receivedBy), "shipment", s.id, { order_id: s.orderCode, carrier: s.carrier, tracking_number: s.trackingNumber, condition: s.condition, box_count: s.boxCount, notes: s.notes });
  for (const s of state.samples) add(s.createdAt, actor(s.registeredBy), "sample", s.id, { order_id: s.orderCode, sample_code: s.code, full_name: s.full_name });
  for (const r of state.results ?? []) add(r.acceptedAt, actor(r.acceptedBy), "result_file", r.id, { order_id: r.orderCode, status: "accepted", sha256: r.sha256 });
  for (const d of state.datasets ?? []) {
    const row = { order_id: d.orderCode, version: d.version, status: "built", sha256: d.full.sha256, project_id: null as string | null };
    add(d.builtAt, actor(d.builtBy), "dataset", d.id, row);
    for (const s of d.signatures) add(s.signedAt, s.userId, "signature", s.id, { dataset_id: d.id, user_id: s.userId, role: s.role, note: s.note });
    const releasedRow = { ...row, status: "released", project_id: d.projectId };
    if (d.releasedAt) add(d.releasedAt, actor(d.releasedBy), "dataset", d.id, releasedRow, row);
    if (d.archivedAt && (d.status === "withdrawn" || d.status === "superseded")) {
      const by = (d as DemoDataset & { withdrawnBy?: string; supersededBy?: string })[d.status === "withdrawn" ? "withdrawnBy" : "supersededBy"];
      const before = d.releasedAt ? releasedRow : row;
      add(d.archivedAt, actor(by), "dataset", d.id, { ...before, status: d.status, archived_reason: d.archivedReason }, before);
    }
  }
  const events = drafts
    .map((draft, index) => ({ draft, index }))
    .sort((a, b) => a.draft.createdAt.localeCompare(b.draft.createdAt) || a.index - b.index)
    .map(({ draft }, index) => ({ ...draft, id: index + 1 }));
  const codes = applyDemoState(demoOrders, state).map(order => order.code);
  return {
    events,
    ctx: { people, orders: Object.fromEntries(codes.map(code => [code, code])), datasets: Object.fromEntries((state.datasets ?? []).map(d => [d.id, { orderId: d.orderCode, version: d.version }])) },
  };
}

async function demoPage(filters: AuditFilters): Promise<AuditPage> {
  const { events, ctx } = demoEvents(await readDemoState());
  const code = filters.order;
  const ofOrder = (event: AuditEvent) => event.entity === "order" ? event.entityId === code
    : event.entity === "signature" ? ctx.datasets[text(event.after?.dataset_id) ?? ""]?.orderId === code
      : ORDER_CHILDREN.includes(event.entity) && event.after?.order_id === code;
  const order = code ? { code, found: Object.hasOwn(ctx.orders, code) } : null;
  const matching = events
    .filter(event => (!filters.entity || event.entity === filters.entity) && (!filters.before || event.id < filters.before) && (!code || ofOrder(event)))
    .reverse();
  return page(matching.slice(0, AUDIT_PAGE_SIZE + 1), ctx, order);
}
