// Email notifications (decision of 2026-11-10, migration 0028; the event x audience matrix of 2026-11-13, migration
// 0036): after each event below the Admin app server emails the people its matrix row names, through Resend's HTTP API.
// Pure and injectable: the rule, the audience, the log and the transport are passed in, so tests never reach Resend
// (the server wiring is data/notifications.ts).
//
// The matrix (admin.notification_rule, edited by a lab Owner or Admin on the Notifications page): one row per event,
// one cell per audience. Lab staff by lab role (Owner, Admin, Operator); the owner of the step (a failed gate: who
// recorded the step); the client's admins; the requester (the client member who asked for the order); every member of the
// order's client (0040, viewers too). The lab-only events never reach a client's people (0040). Everyone may still
// turn a kind off for themselves (no row in admin.notification_pref = on). Sending happens only with
// ADMIN_NOTIFY_ENABLED=true; ADMIN_NOTIFY_ALLOW (comma-separated email domains) limits who receives mail, on staging say;
// every recipient gets one log row: sent, failed or skipped, with why.
import { BASE_PATH } from "./base-path";
import type { View } from "./models";

// In the order the matrix shows them: the five pipeline events, then the 0028 requests.
export const notificationKinds = [
  "shipment_received", "gate_failed", "batch_acquired", "results_missing", "dataset_released", "order_requested", "request_answered", "access_requested",
] as const;
export type NotificationKind = (typeof notificationKinds)[number];
export const isNotificationKind = (value: unknown): value is NotificationKind => notificationKinds.includes(value as NotificationKind);

// Written for the lab (lab wording, links to lab pages): no client cell, and no switch for a client's people (0040).
export const labOnlyKinds: readonly NotificationKind[] = ["order_requested", "gate_failed", "results_missing", "access_requested"];
const isLabOnly = (kind: NotificationKind) => labOnlyKinds.includes(kind);

// label: the person's own switch; event: the matrix row; views: who may have a switch for it (a client's people or lab
// staff), depending on the matrix's audiences.
export const kindInfo: Record<NotificationKind, { label: string; event: string; description: string; views: View[] }> = {
  shipment_received: { label: "A shipment is received", event: "Shipment received", description: "When the lab records the arrival of samples for an order, and when tubes are missing or not intact at the check-in.", views: ["staff", "client"] },
  gate_failed: { label: "A gate fails", event: "Gate failed", description: "When a step's check turns red: a shipment arrived not intact, or injections were recorded Failed in the run monitor.", views: ["staff"] },
  batch_acquired: { label: "A batch is acquired", event: "Batch acquired", description: "When a batch with an order's samples is marked acquired on the instrument.", views: ["staff", "client"] },
  results_missing: { label: "Results are late", event: "No results TXT N days after acquisition", description: "When an order is still waiting for its results TXT some days after it was acquired.", views: ["staff"] },
  dataset_released: { label: "A dataset is released", event: "Dataset released", description: "When the lab releases a dataset to a client.", views: ["staff", "client"] },
  order_requested: { label: "A client requests an order", event: "Order requested", description: "When a client asks for a new order. You accept or decline it on the order.", views: ["staff"] },
  request_answered: { label: "My order request is answered", event: "Order request answered", description: "When the lab accepts or declines an order you asked for. A decline gives the lab's reason; an accept links to the shipping instructions.", views: ["staff", "client"] },
  access_requested: { label: "Someone requests access", event: "Access requested", description: "When someone asks for access on the public Request access page. A lab Owner or Admin answers it in People.", views: ["staff"] },
};
// The matrix's event label; the results check names its delay ("No results TXT 3 days after acquisition").
export const eventLabel = (kind: NotificationKind, days: number | null = null) =>
  kind === "results_missing" ? `No results TXT ${days ?? 3} ${(days ?? 3) === 1 ? "day" : "days"} after acquisition` : kindInfo[kind].event;

// ---------------------------------------------------------------- the matrix (admin.notification_rule)

export const ruleLabRoles = ["operator", "admin", "owner"] as const;
export type RuleLabRole = (typeof ruleLabRoles)[number];
export const ruleLabRoleNames: Record<RuleLabRole, string> = { operator: "Operator", admin: "Admin", owner: "Owner" };
export type NotificationRule = { kind: NotificationKind; labRoles: RuleLabRole[]; stepOwner: boolean; clientAdmin: boolean; requester: boolean; clientMembers: boolean; days: number | null };
export const DEFAULT_RESULTS_DAYS = 3;
const rule = (kind: NotificationKind, labRoles: RuleLabRole[], stepOwner: boolean, clientAdmin: boolean, requester: boolean, days: number | null = null, clientMembers = false): NotificationRule =>
  ({ kind, labRoles, stepOwner, clientAdmin, requester, clientMembers, days });
// The defaults of 0036 (the prototype's "Analyst" is the lab's Operator role), with 0040's Client members on for a
// released dataset (every member of the client, as before 0036).
export const defaultRules: Record<NotificationKind, NotificationRule> = {
  shipment_received: rule("shipment_received", ["admin"], false, true, true),
  gate_failed: rule("gate_failed", [], true, false, false),
  batch_acquired: rule("batch_acquired", ["operator"], false, false, true),
  results_missing: rule("results_missing", ["operator", "admin"], false, false, false, DEFAULT_RESULTS_DAYS),
  dataset_released: rule("dataset_released", ["operator"], false, true, true, null, true),
  order_requested: rule("order_requested", ["operator", "admin", "owner"], false, false, false),
  request_answered: rule("request_answered", [], false, false, true),
  access_requested: rule("access_requested", ["operator", "admin", "owner"], false, false, false),
};
// Which cells a row may have: only a failed gate has a step owner; the lab-only events have no client cell (0040).
export const ruleAllows = (kind: NotificationKind) => ({ stepOwner: kind === "gate_failed", client: !isLabOnly(kind), days: kind === "results_missing" });

// The lab staff cell as the matrix writes it: "Operator, Admin", "owner of the step", or "—" when nobody.
export function labCell(value: NotificationRule): string {
  const names = ruleLabRoles.filter(role => value.labRoles.includes(role)).map(role => ruleLabRoleNames[role]);
  if (value.stepOwner) names.unshift(names.length ? "Owner of the step" : "owner of the step");
  return names.length ? names.join(", ") : "—";
}
// Every row of the matrix, the stored ones over the defaults, in display order.
export const matrixRows = (stored: readonly NotificationRule[]) =>
  notificationKinds.map(kind => stored.find(item => item.kind === kind) ?? defaultRules[kind]);

// A row as the database or the form gives it, checked like admin.set_notification_rule; null when it is not valid.
export function normalizeRule(input: { kind: unknown; labRoles: unknown; stepOwner: unknown; clientAdmin: unknown; requester: unknown; clientMembers?: unknown; days: unknown }): NotificationRule | null {
  if (!isNotificationKind(input.kind)) return null;
  const kind = input.kind;
  const allows = ruleAllows(kind);
  const roles = Array.isArray(input.labRoles) ? input.labRoles.map(String) : [];
  if (roles.some(role => !ruleLabRoles.includes(role as RuleLabRole))) return null;
  const labRoles = ruleLabRoles.filter(role => roles.includes(role));
  const stepOwner = input.stepOwner === true, clientAdmin = input.clientAdmin === true, requester = input.requester === true, clientMembers = input.clientMembers === true;
  if (stepOwner && !allows.stepOwner) return null;
  if (!allows.client && (clientAdmin || requester || clientMembers)) return null;
  const days = input.days === null || input.days === undefined || input.days === "" ? null : Number(input.days);
  if (allows.days !== (days !== null)) return null;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 60)) return null;
  return { kind, labRoles, stepOwner, clientAdmin, requester, clientMembers, days };
}
// A row the example workspace stored, checked again: one saved before 0040 takes the new column's default, and one
// that 0040 no longer allows (a client cell on a lab-only event) falls back to the default row.
export const storedRule = (kind: NotificationKind, stored: Partial<NotificationRule> | null | undefined): NotificationRule =>
  (stored && normalizeRule({ ...defaultRules[kind], ...stored, kind })) || defaultRules[kind];

// The person's own switches, for their view: lab staff get a switch for every kind; a client's people for the kinds
// their client may hear about. A kind is on unless the person turned it off.
export const kindsFor = (view: View): NotificationKind[] => notificationKinds.filter(kind => kindInfo[kind].views.includes(view));
export const switchesFor = (view: View, off: readonly string[]) => kindsFor(view).map(kind => ({ kind, ...kindInfo[kind], enabled: !off.includes(kind) }));

// ---------------------------------------------------------------- events

// The order an event is about. requestedBy: admin.order.requested_by (the client member who asked; for an order the
// lab opened, the lab person, who is then no requester).
type OrderFacts = { orderId: string; code: string; clientId: string; clientName: string; requestedBy?: string | null };
// scope: an event about many orders (a batch) is sent once to the lab ("lab") and once per order to its client
// ("client"), so no client reads another client's order; an event about one order reaches both (no scope).
export type Scope = "lab" | "client";
// A receipt confirmed tube by tube with a discrepancy (confirm_shipment_receipt): sent under the Shipment received row.
export type Checkin = { expected: number; checkedIn: number; missing: number; notIntact: number; note: string | null };
export type NotificationEvent =
  | ({ kind: "request_answered"; title: string | null; accepted: boolean; reason: string | null } & OrderFacts & { requestedBy: string | null })
  | ({ kind: "dataset_released"; datasetId: string; version: number } & OrderFacts)
  | ({ kind: "order_requested"; title: string | null } & OrderFacts)
  | { kind: "access_requested"; reference: string; fullName: string; organisation: string }
  | ({ kind: "shipment_received"; title: string | null; boxes: number | null; condition: string | null; checkin?: Checkin } & OrderFacts)
  | ({ kind: "gate_failed"; gate: string; stepOwner: string | null; scope?: Scope } & (OrderFacts | { orderId: null; code: string; clientId: null; clientName: null; requestedBy?: null }))
  | ({ kind: "batch_acquired"; batch: string; scope: Scope } & (OrderFacts | { orderId: null; code: string; clientId: null; clientName: null; requestedBy?: null; orders: string[] }))
  | ({ kind: "results_missing"; title: string | null; days: number; acquiredAt: string } & OrderFacts);

// The client whose members may be recipients (admin.notification_audience's argument); none for an access request or
// for the lab's copy of a batch event.
export const eventClientId = (event: NotificationEvent): string | null => event.kind === "access_requested" ? null : event.clientId;

// A row of admin.notification_audience: active lab staff (labRole) and active members of the event's client
// (clientRole), with the kinds they turned off.
export type AudiencePerson = { userId: string; email: string; labRole: string | null; clientRole: string | null; off: readonly string[] };
export type Recipient = { userId: string; email: string; enabled: boolean };

// Who gets an email for the event under its matrix row, once each, with whether their own switch for it is on.
export function selectRecipients(event: NotificationEvent, people: readonly AudiencePerson[], row: NotificationRule = defaultRules[event.kind]): Recipient[] {
  const scope = "scope" in event ? event.scope : undefined;
  const requestedBy = event.kind === "access_requested" ? null : event.requestedBy ?? null;
  const stepOwner = event.kind === "gate_failed" ? event.stepOwner : null;
  const picked = (person: AudiencePerson) => {
    if (person.labRole && scope !== "client") {
      if (row.labRoles.includes(person.labRole as RuleLabRole)) return true;
      if (row.stepOwner && stepOwner && person.userId === stepOwner && person.labRole !== "member") return true;
    }
    if (person.clientRole && scope !== "lab" && event.kind !== "access_requested") {
      if (row.clientAdmin && person.clientRole === "client_admin") return true;
      if (row.requester && requestedBy && person.userId === requestedBy) return true;
      if (row.clientMembers) return true;
    }
    return false;
  };
  const out = new Map<string, Recipient>();
  for (const person of people) {
    const email = person.email.trim();
    if (!email || !picked(person) || out.has(person.userId)) continue;
    out.set(person.userId, { userId: person.userId, email, enabled: !person.off.includes(event.kind) });
  }
  return [...out.values()];
}

// ---------------------------------------------------------------- configuration (environment)

export const SENDER_NAME = "Lipidomics · Libreros Lab";
export const OFF_REASON = "Sending is off (ADMIN_NOTIFY_ENABLED is not true)";
// The example workspace sends nothing: every email it would send is logged as skipped with this reason.
export const DEMO_OFF_REASON = "Example workspace: no email is sent";
export type NotifyConfig = { send: boolean; offReason: string; allow: string[] | null; apiKey: string | null; from: string | null; origin: string | null };
type Env = Record<string, string | undefined>;

// ADMIN_MAIL_FROM is an address (lab@lipidomics.example.org), shown as from "Lipidomics · Libreros Lab"; a value that
// already names a sender ("Name <address>") is used as it is.
export function senderFrom(value: string | undefined): string | null {
  const from = value?.trim();
  if (!from) return null;
  return from.includes("<") ? from : `${SENDER_NAME} <${from}>`;
}
// ADMIN_PUBLIC_ORIGIN: the origin people open Admin on (https://lipidomics.example.org). Without it emails carry no link.
export function publicOrigin(value: string | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin !== "null" ? url.origin : null;
  } catch {
    return null;
  }
}
export function allowedDomains(value: string | undefined): string[] | null {
  const domains = (value ?? "").split(",").map(item => item.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  return domains.length ? domains : null;
}
export const domainAllowed = (email: string, allow: readonly string[] | null) => !allow || allow.includes(email.slice(email.lastIndexOf("@") + 1).toLowerCase());

export function notifyConfig(env: Env = process.env): NotifyConfig {
  return {
    send: env.ADMIN_NOTIFY_ENABLED?.trim() === "true", offReason: OFF_REASON, allow: allowedDomains(env.ADMIN_NOTIFY_ALLOW),
    apiKey: env.RESEND_API_KEY?.trim() || null, from: senderFrom(env.ADMIN_MAIL_FROM), origin: publicOrigin(env.ADMIN_PUBLIC_ORIGIN),
  };
}

// ---------------------------------------------------------------- the email

export type Message = { subject: string; text: string; html: string };
export type Part = string | { href: string };

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
const withTitle = (code: string, title: string | null) => title?.trim() ? `${code} (${oneLine(title)})` : code;

// Short, plain English; the same paragraphs as plain text and as simple HTML. Links open Admin on its public origin
// under the base path (/admin, /admin-staging).
export function buildMessage(event: NotificationEvent, origin: string | null, basePath: string = BASE_PATH): Message {
  const link = (path: string): Part[] => origin ? [{ href: `${origin}${basePath}${path}` }] : [];
  let subject: string;
  let body: Part[][];
  switch (event.kind) {
    case "request_answered":
      subject = `Your order request ${event.code} was ${event.accepted ? "accepted" : "declined"}`;
      body = event.accepted
        ? [[`The lab accepted your order request ${withTitle(event.code, event.title)} for ${event.clientName}.`],
          [origin ? "How and when to ship the samples is on the request:" : "How and when to ship the samples is on the request in Lipidomics Admin."], link(`/orders/${encodeURIComponent(event.code)}`)]
        : [[`The lab declined your order request ${withTitle(event.code, event.title)} for ${event.clientName}.`],
          [`The lab's reason: ${(event.reason ?? "").trim() || "none given"}`]];
      break;
    case "dataset_released":
      subject = `Dataset released: ${event.code} version ${event.version}`;
      body = [[`The lab released version ${event.version} of the dataset for order ${event.code} to ${event.clientName}.`],
        [origin ? "Open it in Lipidomics Admin:" : "Open it in Lipidomics Admin."], link(`/orders/${encodeURIComponent(event.code)}`)];
      break;
    case "order_requested":
      subject = `New order request ${event.code} from ${oneLine(event.clientName)}`;
      body = [[`${event.clientName} asked for a new order: ${withTitle(event.code, event.title)}.`],
        [origin ? "Accept or decline it on the order:" : "Accept or decline it on the order in Lipidomics Admin."], link(`/orders/${encodeURIComponent(event.code)}`)];
      break;
    case "shipment_received":
      if (event.checkin) {
        const c = event.checkin;
        subject = `Receipt of ${event.code}: ${c.missing} ${c.missing === 1 ? "tube" : "tubes"} missing, ${c.notIntact} not intact`;
        body = [[`The lab checked in the samples of order ${withTitle(event.code, event.title)} for ${event.clientName}, tube by tube, and found a difference from your manifest.`],
          [`Tubes expected: ${c.expected}. Checked in: ${c.checkedIn}. Missing: ${c.missing}. Not intact: ${c.notIntact}.`],
          c.note?.trim() ? [`The lab's note: ${c.note.trim()}`] : [],
          [origin ? "See the receipt on your order:" : "See the receipt on your order in Lipidomics Admin."], link(`/orders/${encodeURIComponent(event.code)}`)];
        break;
      }
      subject = `Shipment received for ${event.code}`;
      body = [[`The lab received the samples for order ${withTitle(event.code, event.title)} of ${event.clientName}${event.boxes ? ` (${event.boxes} ${event.boxes === 1 ? "box" : "boxes"})` : ""}${event.condition ? `, ${event.condition}` : ""}.`],
        [origin ? "Follow the order in Lipidomics Admin:" : "Follow the order in Lipidomics Admin."], link(`/orders/${encodeURIComponent(event.code)}`)];
      break;
    case "gate_failed":
      subject = `Gate failed: ${event.code}`;
      body = [[event.clientName ? `A check failed on order ${event.code} of ${event.clientName}: ${oneLine(event.gate)}.` : `A check failed on ${event.code}: ${oneLine(event.gate)}.`],
        [origin ? "See what needs review:" : "See what needs review in Lipidomics Admin."], link(event.orderId ? `/orders/${encodeURIComponent(event.code)}` : `/batch-run/${encodeURIComponent(event.code)}#monitor`)];
      break;
    case "batch_acquired":
      subject = event.orderId ? `Samples of ${event.code} acquired` : `Batch acquired: ${event.batch}`;
      body = event.orderId
        ? [[`The samples of order ${event.code} for ${event.clientName} were acquired on the instrument (batch ${event.batch}). Processing the results comes next.`],
          [origin ? "Follow the order in Lipidomics Admin:" : "Follow the order in Lipidomics Admin."], link(`/orders/${encodeURIComponent(event.code)}`)]
        : [[`Batch ${event.batch} was marked acquired${"orders" in event && event.orders.length ? `, with orders ${event.orders.join(", ")}` : ""}. Its results TXT is next.`],
          [origin ? "Open the batch:" : "Open the batch in Lipidomics Admin."], link(`/batch-run/${encodeURIComponent(event.batch)}`)];
      break;
    case "results_missing":
      subject = `No results TXT for ${event.code} after ${event.days} ${event.days === 1 ? "day" : "days"}`;
      body = [[`Order ${withTitle(event.code, event.title)} of ${event.clientName} was acquired ${event.days} or more ${event.days === 1 ? "day" : "days"} ago and has no accepted results TXT yet.`],
        [origin ? "Ingest the results:" : "Ingest the results in Lipidomics Admin."], link("/ingest-results")];
      break;
    case "access_requested":
      subject = `New access request ${event.reference}`;
      body = [[`${oneLine(event.fullName)} (${oneLine(event.organisation)}) asked for access to Lipidomics Admin. Reference ${event.reference}.`],
        [origin ? "A lab Owner or Admin approves or declines it in People:" : "A lab Owner or Admin approves or declines it in People, in Lipidomics Admin."], link("/people")];
      break;
  }
  const footer: Part[][] = [[SENDER_NAME], [origin ? "You can turn these emails off under Notifications:" : "You can turn these emails off under Notifications in Lipidomics Admin."], link("/notifications")];
  return renderMessage(subject, [...body, ...footer]);
}

// The same paragraphs as plain text and as simple HTML (links written out); empty paragraphs are dropped.
export function renderMessage(subject: string, paragraphs: Part[][], greeting = "Hello,"): Message {
  const kept = paragraphs.filter(parts => parts.length > 0);
  const text = kept.map(parts => parts.map(part => typeof part === "string" ? part : part.href).join("")).join("\n\n");
  const html = kept.map(parts => `<p>${parts.map(part => typeof part === "string" ? escapeHtml(part) : `<a href="${escapeHtml(part.href)}">${escapeHtml(part.href)}</a>`).join("")}</p>`).join("\n");
  return { subject: oneLine(subject).slice(0, 300), text: `${greeting}\n\n${text}\n`, html: `<p>${escapeHtml(greeting)}</p>\n${html}\n` };
}

// ---------------------------------------------------------------- delivery and the log

export type Mail = { from: string; to: string; subject: string; text: string; html: string };
// Sends one email; throws with a short reason when it was not accepted.
export type Transport = (mail: Mail) => Promise<void>;
export type LogStatus = "sent" | "failed" | "skipped";
// The log also records the account emails (0029), which have no switch: an invitation (to an email with no account
// yet, so no user) and an activation email.
export type LogKind = NotificationKind | "invitation" | "activation";
export const logKindLabels: Record<LogKind, string> = {
  ...Object.fromEntries(notificationKinds.map(kind => [kind, kindInfo[kind].label])) as Record<NotificationKind, string>,
  invitation: "Invitation", activation: "Activation email",
};
export type LogEntry = {
  kind: LogKind; userId: string | null; email: string; subject: string; status: LogStatus; error: string | null;
  clientId: string | null; orderId: string | null; datasetId: string | null; reference: string | null;
};

const RESEND_URL = "https://api.resend.com/emails";
export const SEND_TIMEOUT_MS = 5000;
// Resend accepts 2 requests a second by default, so emails of one event go one after the other with this gap.
export const SEND_GAP_MS = 600;
const reasonOf = (error: unknown) => {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return `No answer from Resend within ${SEND_TIMEOUT_MS / 1000} s`;
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000) || "Unknown error";
};

// POST https://api.resend.com/emails with the API key; no SDK. fetchImpl is injected by tests.
export function resendTransport(apiKey: string, fetchImpl: typeof fetch = fetch, timeoutMs = SEND_TIMEOUT_MS): Transport {
  return async mail => {
    const response = await fetchImpl(RESEND_URL, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: mail.from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return;
    let detail = "";
    try { detail = String(((await response.json()) as { message?: unknown }).message ?? ""); } catch { /* no JSON body */ }
    throw new Error(`Resend answered ${response.status}${detail ? `: ${detail}` : ""}`);
  };
}

const related = (event: NotificationEvent) => ({
  clientId: event.kind === "access_requested" ? null : event.clientId,
  orderId: event.kind === "access_requested" ? null : event.orderId,
  datasetId: event.kind === "dataset_released" ? event.datasetId : null,
  reference: (event.kind === "access_requested" ? event.reference : event.code).slice(0, 40),
});
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// Why an email to this address would not go out with this configuration (skipped: sending off, not on the allowlist;
// failed: no key or sender), or null when it can be sent.
export function blocked(email: string, config: NotifyConfig): { status: "skipped" | "failed"; error: string } | null {
  if (!config.send) return { status: "skipped", error: config.offReason };
  if (!domainAllowed(email, config.allow)) return { status: "skipped", error: "Not on ADMIN_NOTIFY_ALLOW" };
  if (!config.apiKey || !config.from) return { status: "failed", error: "RESEND_API_KEY or ADMIN_MAIL_FROM is not set" };
  return null;
}

// One email, after blocked() said yes: sent, or failed with a short reason. Never throws.
export async function sendOne(to: string, message: Message, config: NotifyConfig, transport: Transport): Promise<{ status: "sent" | "failed"; error: string | null }> {
  try {
    await transport({ from: config.from as string, to, subject: message.subject, text: message.text, html: message.html });
    return { status: "sent", error: null };
  } catch (error) {
    return { status: "failed", error: reasonOf(error) };
  }
}

// One log entry per recipient. Turned off, sending off and outside the allowlist are skipped (in that order); a
// missing key or sender, a refusal or a timeout is failed. Never throws.
export async function deliver(event: NotificationEvent, recipients: readonly Recipient[], deps: { config: NotifyConfig; transport: Transport; pause?: (ms: number) => Promise<void> }): Promise<LogEntry[]> {
  const { config, transport, pause = wait } = deps;
  const message = buildMessage(event, config.origin);
  const entries: LogEntry[] = [];
  let sent = 0;
  for (const recipient of recipients) {
    const entry = { kind: event.kind, userId: recipient.userId, email: recipient.email, subject: message.subject, ...related(event) };
    if (!recipient.enabled) { entries.push({ ...entry, status: "skipped", error: "Turned off by the recipient" }); continue; }
    const stop = blocked(recipient.email, config);
    if (stop) { entries.push({ ...entry, ...stop }); continue; }
    if (sent++ > 0) await pause(SEND_GAP_MS);
    entries.push({ ...entry, ...await sendOne(recipient.email, message, config, transport) });
  }
  return entries;
}

export type NotifyDeps = {
  // The event's matrix row (admin.notification_rule); without it, the 0036 defaults.
  rule?: (kind: NotificationKind) => Promise<NotificationRule>;
  audience: (clientId: string | null) => Promise<AudiencePerson[]>;
  log: (entries: LogEntry[]) => Promise<void>;
  config: NotifyConfig;
  transport: Transport;
  pause?: (ms: number) => Promise<void>;
  report?: (message: string) => void;
};

// The whole step after an event: audience → recipients → send → log. A failure anywhere is reported (without any
// address) and never thrown, so the person's action is never failed by an email.
export async function runNotification(event: NotificationEvent, deps: NotifyDeps): Promise<LogEntry[]> {
  return (await runNotificationOutcome(event, deps)).entries;
}

// The same, saying whether the event is done with (0040, the results check): done unless the rule or the audience could
// not be read, or every email that was tried failed. Skipped emails (turned off, sending off) count as done; with some
// sent and some failed it is done too, so nobody gets the email twice.
export async function runNotificationOutcome(event: NotificationEvent, deps: NotifyDeps): Promise<{ entries: LogEntry[]; done: boolean }> {
  const report = deps.report ?? (message => console.error(message));
  try {
    const row = deps.rule ? await deps.rule(event.kind) : defaultRules[event.kind];
    const recipients = selectRecipients(event, await deps.audience(eventClientId(event)), row);
    if (!recipients.length) return { entries: [], done: true };
    const entries = await deliver(event, recipients, deps);
    try {
      await deps.log(entries);
    } catch (error) {
      report(`[notifications] ${event.kind}: the send log could not be written (${error instanceof Error ? error.message : error})`);
    }
    return { entries, done: entries.some(entry => entry.status === "sent") || !entries.some(entry => entry.status === "failed") };
  } catch (error) {
    report(`[notifications] ${event.kind}: nothing sent (${error instanceof Error ? error.message : error})`);
    return { entries: [], done: false };
  }
}
