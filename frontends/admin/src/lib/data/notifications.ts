import "server-only";
import { after } from "next/server";
import { demoClientSession } from "../demo";
import { getEnvironment } from "../environment";
import type { AppSession } from "../models";
import {
  DEMO_OFF_REASON, notifyConfig, resendTransport, runNotification, switchesFor, type AudiencePerson, type LogEntry, type LogKind, type NotificationEvent,
  type NotificationKind, type NotifyConfig, type NotifyDeps, type Transport,
} from "../notifications";
import { demoPeopleSeed } from "../people";
import { clientRoleNames } from "../roles";
import { DataError } from "../samples";
import { createAdminClient } from "../supabase/server";
import { createServiceClient } from "../supabase/service";
import { readDemoNotifications, readDemoPeople, writeDemoNotifications } from "./demo-store";

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

function liveDeps(): NotifyDeps {
  const service = createServiceClient();
  const need = () => { if (!service) throw new Error("this server has no service key"); return service; };
  return {
    ...mailDeps(),
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

async function demoNotify(event: NotificationEvent) {
  const { log, ...deps } = mailDeps();
  await log(await runNotification(event, { ...deps, audience: demoAudience, log: async () => undefined }));
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
