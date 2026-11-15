import "server-only";
import { after } from "next/server";
import { demoClients, demoClientSession, demoOrders } from "../demo";
import { getEnvironment } from "../environment";
import type { AppSession } from "../models";
import {
  DEMO_OFF_REASON, defaultRules, matrixRows, normalizeRule, notifyConfig, notificationKinds, resendTransport, runNotification, runNotificationOutcome, storedRule, switchesFor,
  type AudiencePerson, type Checkin, type LogEntry, type LogKind, type NotificationEvent, type NotificationKind, type NotificationRule, type NotifyConfig, type NotifyDeps, type Transport,
} from "../notifications";
import { demoPeopleSeed } from "../people";
import { clientRoleNames } from "../roles";
import { conditionLabels, DataError, type Condition } from "../samples";
import { createAdminClient } from "../supabase/server";
import { createServiceClient } from "../supabase/service";
import { applyDemoState } from "../samples-demo";
import { readDemoNotifications, readDemoPeople, readDemoState, writeDemoNotifications } from "./demo-store";

// The server side of email notifications (0028). notify() is called by the data functions right after the event's
// RPC succeeded. Live, the whole step (audience, Resend, log) runs in after(), once the person's response is sent, with
// the service-role client: admin.notification_audience and INSERT on admin.notification_log are the service role's
// only. Nothing it does can fail or slow the action. The demo sends nothing: it writes skipped rows to the browser's
// demo log at once (no network, and after() could not set the demo cookie).
const live = () => !getEnvironment().mock;
const DEMO_LOG_LIMIT = 100;

export async function notify(event: NotificationEvent): Promise<void> {
  try {
    if (!live()) { await demoNotify(event); return; }
    const deps = liveDeps();
    after(async () => { await runNotification(event, deps); });
  } catch (error) {
    console.error(`[notifications] ${event.kind}: not scheduled (${error instanceof Error ? error.message : error})`);
  }
}

type AudienceRow = { user_id: string; email: string | null; lab_role: string | null; client_role: string | null; off: string[] | null };
const logRow = (entry: LogEntry) => ({
  kind: entry.kind, user_id: entry.userId, email: entry.email, subject: entry.subject, status: entry.status, error: entry.error,
  client_id: entry.clientId, order_id: entry.orderId, dataset_id: entry.datasetId, reference: entry.reference,
});

// Configuration, transport and log of every email (the account emails of data/activation.ts too). Live: Resend and the
// service role's insert; the demo: sending off, a transport that never runs, the browser's demo log.
export function mailDeps(): { config: NotifyConfig; transport: Transport; log: (entries: LogEntry[]) => Promise<void> } {
  if (!live()) return { config: { ...notifyConfig({}), send: false, offReason: DEMO_OFF_REASON }, transport: async () => { throw new Error(DEMO_OFF_REASON); }, log: demoLog };
  const config = notifyConfig();
  const service = createServiceClient();
  return {
    config, transport: resendTransport(config.apiKey ?? ""),
    log: async entries => {
      if (!service) throw new Error("this server has no service key");
      const { error } = await service.from("notification_log").insert(entries.map(logRow));
      if (error) throw new Error(`insert failed (${error.code ?? "no code"})`);
    },
  };
}

type RuleRow = { kind: string; lab_roles: string[] | null; step_owner: boolean; client_admin: boolean; requester: boolean; client_members: boolean; days: number | null };
const fromRow = (row: RuleRow) => normalizeRule({
  kind: row.kind, labRoles: row.lab_roles ?? [], stepOwner: row.step_owner, clientAdmin: row.client_admin, requester: row.requester, clientMembers: row.client_members, days: row.days,
});
const RULE_COLUMNS = "kind, lab_roles, step_owner, client_admin, requester, client_members, days";

function liveDeps(): NotifyDeps {
  const service = createServiceClient();
  const need = () => { if (!service) throw new Error("this server has no service key"); return service; };
  return {
    ...mailDeps(),
    // The event's row of the matrix (0036); a read failure sends nothing rather than guess who wanted the email.
    rule: async kind => {
      const { data, error } = await need().from("notification_rule").select(RULE_COLUMNS).eq("kind", kind).maybeSingle();
      if (error) throw new Error(`notification_rule failed (${error.code ?? "no code"})`);
      return (data && fromRow(data as RuleRow)) || defaultRules[kind];
    },
    audience: async clientId => {
      const { data, error } = await need().rpc("notification_audience", { p_client_id: clientId });
      if (error) throw new Error(`notification_audience failed (${error.code ?? "no code"})`);
      return ((data ?? []) as AudienceRow[]).map(row => ({ userId: row.user_id, email: row.email ?? "", labRole: row.lab_role, clientRole: row.client_role, off: row.off ?? [] }));
    },
  };
}

// ---------------------------------------------------------------- demo

const clientRoleKey = (label: string | undefined) => Object.entries(clientRoleNames).find(([, name]) => name === label)?.[0] ?? null;

// The demo's people (People's records, else the seed) and the example client user, as notification_audience returns them.
export async function demoAudience(clientId: string | null): Promise<AudiencePerson[]> {
  const { off } = await readDemoNotifications();
  const people = ((await readDemoPeople()) ?? demoPeopleSeed()).people.filter(person => !person.archivedAt && person.email);
  const rows: AudiencePerson[] = people.filter(person => person.kind === "lab_staff" || (clientId && person.clientId === clientId)).map(person => ({
    userId: person.userId, email: person.email as string, off: off[person.userId] ?? [],
    labRole: person.kind === "lab_staff" ? person.role : null, clientRole: person.kind === "client_member" ? person.role : null,
  }));
  const example = demoClientSession.clients.find(client => client.id === clientId);
  if (example) rows.push({ userId: demoClientSession.userId, email: demoClientSession.displayName, labRole: null, clientRole: clientRoleKey(example.role), off: off[demoClientSession.userId] ?? [] });
  return rows;
}

// The demo records who asked by name or email (the example client user's name is its email); the person's id, if any.
export async function demoRequesterId(requestedBy: string | null | undefined): Promise<string | null> {
  if (!requestedBy) return null;
  if (requestedBy === demoClientSession.displayName) return demoClientSession.userId;
  const people = ((await readDemoPeople()) ?? demoPeopleSeed()).people;
  return people.find(person => person.kind === "client_member" && (person.name === requestedBy || person.email === requestedBy))?.userId ?? null;
}

async function demoRule(kind: NotificationKind): Promise<NotificationRule> {
  return storedRule(kind, (await readDemoNotifications()).rules?.[kind]);
}
async function demoNotify(event: NotificationEvent) {
  const { log, ...deps } = mailDeps();
  await log(await runNotification(event, { ...deps, rule: demoRule, audience: demoAudience, log: async () => undefined }));
}
async function demoLog(entries: LogEntry[]) {
  if (!entries.length) return;
  const state = await readDemoNotifications();
  const at = new Date().toISOString();
  const rows = entries.map(entry => ({ ...entry, id: crypto.randomUUID(), at }));
  await writeDemoNotifications({ ...state, log: [...rows, ...state.log].slice(0, DEMO_LOG_LIMIT) });
}

// ---------------------------------------------------------------- the screen

async function admin() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}

// The person's own switches for the kinds that apply to their view (no row = on).
export async function myNotificationSwitches(session: AppSession) {
  if (!live()) return switchesFor(session.view, (await readDemoNotifications()).off[session.userId] ?? []);
  const { data, error } = await (await admin()).from("notification_pref").select("kind, enabled").eq("user_id", session.userId);
  if (error) throw new Error(`Your notification settings could not be read: ${error.message}`);
  return switchesFor(session.view, ((data ?? []) as { kind: string; enabled: boolean }[]).filter(row => !row.enabled).map(row => row.kind));
}

// admin.set_my_notification_pref(p_kind, p_enabled): for the signed-in person only.
export async function setMyNotification(session: AppSession, kind: NotificationKind, enabled: boolean): Promise<void> {
  if (!live()) {
    const state = await readDemoNotifications();
    const mine = (state.off[session.userId] ?? []).filter(item => item !== kind);
    await writeDemoNotifications({ ...state, off: { ...state.off, [session.userId]: enabled ? mine : [...mine, kind] } });
    return;
  }
  const { error } = await (await admin()).rpc("set_my_notification_pref", { p_kind: kind, p_enabled: enabled });
  if (error) throw new DataError(error.code === "42501" ? "Sign in again to change your notifications." : "Your notification setting could not be saved. Try again.");
}

// Lab Owner and Admin read the send log (RLS: is_lab_manager); the example workspace shows the demo log to its lab view.
export const mayReadNotificationLog = (session: AppSession) => session.view === "staff" && (session.mock || session.role === "Owner" || session.role === "Admin");

export type NotificationLogRow = { id: string; at: string; kind: LogKind; email: string; subject: string; status: LogEntry["status"]; error: string | null; reference: string | null };
export const LOG_ROWS = 50;

export async function recentNotificationLog(): Promise<NotificationLogRow[]> {
  if (!live()) return (await readDemoNotifications()).log.slice(0, LOG_ROWS).map(row => ({ id: row.id, at: row.at, kind: row.kind, email: row.email, subject: row.subject, status: row.status, error: row.error, reference: row.reference }));
  const { data, error } = await (await admin()).from("notification_log").select("id, created_at, kind, email, subject, status, error, reference")
    .order("created_at", { ascending: false }).limit(LOG_ROWS);
  if (error) throw new Error(`The send log could not be read: ${error.message}`);
  return ((data ?? []) as { id: string; created_at: string; kind: LogKind; email: string; subject: string; status: LogEntry["status"]; error: string | null; reference: string | null }[])
    .map(row => ({ id: row.id, at: row.created_at, kind: row.kind, email: row.email, subject: row.subject, status: row.status, error: row.error, reference: row.reference }));
}

// ---------------------------------------------------------------- the matrix (0036)

// Lab Owner and Admin change the matrix (admin.set_notification_rule: is_lab_manager); the example workspace lets its
// lab view try it, in this browser only.
export const mayEditNotificationRules = (session: AppSession) => session.view === "staff" && (session.mock || session.role === "Owner" || session.role === "Admin");

// Every row of the matrix in display order (lab staff read admin.notification_rule; a missing row is at its default).
export async function notificationMatrix(): Promise<NotificationRule[]> {
  if (!live()) {
    const stored = (await readDemoNotifications()).rules ?? {};
    return matrixRows(notificationKinds.filter(kind => stored[kind]).map(kind => storedRule(kind, stored[kind])));
  }
  const { data, error } = await (await admin()).from("notification_rule").select(RULE_COLUMNS);
  if (error) throw new Error(`Who gets which email could not be read: ${error.message}`);
  return matrixRows(((data ?? []) as RuleRow[]).map(fromRow).filter((row): row is NotificationRule => !!row));
}

// admin.set_notification_rule: one whole row (Owner or Admin; the database checks it again).
export async function setNotificationRule(row: NotificationRule): Promise<void> {
  if (!live()) {
    const state = await readDemoNotifications();
    await writeDemoNotifications({ ...state, rules: { ...state.rules, [row.kind]: row } });
    return;
  }
  const { error } = await (await admin()).rpc("set_notification_rule", {
    p_kind: row.kind, p_lab_roles: row.labRoles, p_step_owner: row.stepOwner, p_client_admin: row.clientAdmin, p_requester: row.requester, p_client_members: row.clientMembers, p_days: row.days,
  });
  if (error) throw new DataError(error.code === "42501" ? "Only a lab Owner or Admin changes who gets which email." : "This row could not be saved. Try again.");
}

// ---------------------------------------------------------------- the orders an event is about

export type OrderFact = { orderId: string; code: string; title: string | null; clientId: string; clientName: string; requestedBy: string | null };
type OrderFactRow = { id: string; code: string; title: string | null; client_id: string; requested_by: string | null; client: { name: string } | { name: string }[] | null };

// The orders by code, with what an email needs (lab staff read every order). Demo: the example orders, and the
// requester as the demo records them.
// by "id": admin.order's uuid live (the demo's order id is its code).
export async function orderFacts(codes: readonly string[], by: "code" | "id" = "code"): Promise<OrderFact[]> {
  if (!codes.length) return [];
  if (!live()) {
    const orders = applyDemoState(demoOrders, await readDemoState()).filter(order => codes.includes(order.code));
    return Promise.all(orders.map(async order => ({
      orderId: order.code, code: order.code, title: order.description || null, clientId: order.clientId,
      clientName: demoClients.find(client => client.id === order.clientId)?.name ?? "the client", requestedBy: await demoRequesterId(order.request?.requestedBy),
    })));
  }
  const { data, error } = await (await admin()).from("order").select("id, code, title, client_id, requested_by, client:client(name)").in(by, [...codes]);
  if (error) throw new Error(`The orders could not be read: ${error.message}`);
  return ((data ?? []) as OrderFactRow[]).map(row => ({
    orderId: row.id, code: row.code, title: row.title, clientId: row.client_id, requestedBy: row.requested_by,
    clientName: (Array.isArray(row.client) ? row.client[0]?.name : row.client?.name) ?? "the client",
  }));
}

// gate: what failed, for the lab's email.
type GateExtra = { gate: string; stepOwner: string | null };
// A batch event: once to the lab (scope "lab", the batch and its order codes) and, for an acquired batch, once per order
// to its client (scope "client"), so a client's email never names another client's order. A failed gate is lab-only
// (0040): the lab's email only. Never throws (notify reports).
export async function notifyBatch(kind: "batch_acquired", batch: string, codes: readonly string[]): Promise<void>;
export async function notifyBatch(kind: "gate_failed", batch: string, codes: readonly string[], extra: GateExtra): Promise<void>;
export async function notifyBatch(kind: "batch_acquired" | "gate_failed", batch: string, codes: readonly string[], extra?: GateExtra): Promise<void> {
  if (kind === "gate_failed") {
    const { gate, stepOwner } = extra!;
    await notify({ kind, scope: "lab", gate: `${gate} (batch ${batch})`, stepOwner, orderId: null, code: batch, clientId: null, clientName: null });
    return;
  }
  let facts: OrderFact[] = [];
  try {
    facts = await orderFacts(codes);
  } catch (error) {
    console.error(`[notifications] ${kind}: the batch's orders could not be read (${error instanceof Error ? error.message : error})`);
  }
  await notify({ kind, scope: "lab", batch, orderId: null, code: batch, clientId: null, clientName: null, orders: [...codes] });
  for (const fact of facts) await notify({ kind, scope: "client", batch, ...fact });
}

// ---------------------------------------------------------------- the scheduled check: no results TXT N days after acquisition

// Runs from the hourly timer (POST /api/cron/results-missing with ADMIN_CRON_SECRET, frontends/deploy/results-check) and
// when lab staff open the Pipeline (checkResultsMissing, at most once every 10 minutes per server process, after the
// response). admin.claim_results_missing (service role) hands out each due order to one caller at a time; the order is
// marked sent (mark_results_missing_sent) only once its email is done with, so a failed send or a stopped server is
// retried by a later run once the 15-minute claim runs out (0040). Live only: the example workspace has no acquisition
// dates, so it never runs there.
export const RESULTS_CHECK_EVERY_MS = 10 * 60 * 1000;
let lastResultsCheck = 0;
type ClaimRow = { order_id: string; code: string; title: string | null; client_id: string; client_name: string | null; requested_by: string | null; acquired_at: string; days: number };
export type ResultsCheck = { claimed: number; sent: number; retry: number };

// One run, awaited: claims, emails, marks. Throws when the claim itself fails.
export async function runResultsMissingCheck(): Promise<ResultsCheck> {
  if (!live()) return { claimed: 0, sent: 0, retry: 0 };
  const service = createServiceClient();
  if (!service) throw new Error("this server has no service key");
  const deps = liveDeps();
  const { data, error } = await service.rpc("claim_results_missing");
  if (error) throw new Error(`claim_results_missing failed (${error.code ?? "no code"})`);
  const rows = (data ?? []) as ClaimRow[];
  let sent = 0;
  for (const row of rows) {
    const { done } = await runNotificationOutcome({
      kind: "results_missing", orderId: row.order_id, code: row.code, title: row.title, clientId: row.client_id, clientName: row.client_name ?? "the client",
      requestedBy: row.requested_by, days: row.days, acquiredAt: row.acquired_at,
    }, deps);
    if (!done) continue;
    const marked = await service.rpc("mark_results_missing_sent", { p_order_id: row.order_id });
    if (marked.error) console.error(`[notifications] results_missing: ${row.code} sent but not marked (${marked.error.code ?? "no code"}); it may be sent again`);
    else sent++;
  }
  return { claimed: rows.length, sent, retry: rows.length - sent };
}

export function checkResultsMissing(now = Date.now()): boolean {
  if (!live() || now - lastResultsCheck < RESULTS_CHECK_EVERY_MS) return false;
  lastResultsCheck = now;
  try {
    after(async () => {
      try {
        await runResultsMissingCheck();
      } catch (error) {
        console.error(`[notifications] results_missing: check failed (${error instanceof Error ? error.message : error})`);
      }
    });
  } catch (error) {
    console.error(`[notifications] results_missing: not scheduled (${error instanceof Error ? error.message : error})`);
  }
  return true;
}
// Tests start each case with a fresh throttle.
export const resetResultsCheck = () => { lastResultsCheck = 0; };

// A recorded shipment (receive_shipment): "Shipment received" for the order, and "Gate failed" when it did not arrive
// intact (the arrival gate turns red; the owner of the step is who recorded it). Never throws.
export async function notifyShipment(orderId: string, shipment: { boxCount: number | null; condition: Condition }, stepOwner: string | null): Promise<void> {
  try {
    const [fact] = await orderFacts([orderId], "id");
    if (!fact) return;
    const { title, ...order } = fact;
    await notify({ kind: "shipment_received", ...order, title, boxes: shipment.boxCount, condition: conditionLabels[shipment.condition].toLowerCase() });
    if (shipment.condition !== "ok") {
      await notify({ kind: "gate_failed", ...order, gate: `arrived ${conditionLabels[shipment.condition].toLowerCase()}, condition review`, stepOwner });
    }
  } catch (error) {
    console.error(`[notifications] shipment_received: not scheduled (${error instanceof Error ? error.message : error})`);
  }
}

// A receipt confirmed with tubes missing or not intact (confirm_shipment_receipt): the order's client hears about it
// under the Shipment received row (and its lab cells), with the counts and the lab's note. Never throws.
export async function notifyReceiptDiscrepancy(orderCode: string, checkin: Checkin): Promise<void> {
  if (!checkin.missing && !checkin.notIntact) return;
  try {
    const [fact] = await orderFacts([orderCode]);
    if (!fact) return;
    await notify({ kind: "shipment_received", ...fact, boxes: null, condition: null, checkin });
  } catch (error) {
    console.error(`[notifications] shipment_received: receipt not scheduled (${error instanceof Error ? error.message : error})`);
  }
}

// The order's requester for an event that did not read it (a released dataset); null when it cannot be read.
export async function requesterOf(order: string, by: "code" | "id"): Promise<string | null> {
  try {
    return (await orderFacts([order], by))[0]?.requestedBy ?? null;
  } catch {
    return null;
  }
}
