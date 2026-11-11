// Email notifications (decision of 2026-11-10, migration 0028): after four events the Admin app server emails the
// people concerned through Resend's HTTP API. Pure and injectable: the audience, the log and the transport are passed
// in, so tests never reach Resend (the server wiring is data/notifications.ts).
//
// To a client: request_answered (their order request was accepted or declined; to the person who asked) and
// dataset_released (to every active member of the client). To the lab: order_requested and access_requested (to lab
// Owner, Admin and Operator). Everyone may turn each kind off for themselves (no row in admin.notification_pref = on).
// Sending happens only with ADMIN_NOTIFY_ENABLED=true; ADMIN_NOTIFY_ALLOW (comma-separated email domains) limits who
// receives mail, on staging say; every recipient gets one log row: sent, failed or skipped, with why.
import { BASE_PATH } from "./base-path";
import type { View } from "./models";

export const notificationKinds = ["request_answered", "dataset_released", "order_requested", "access_requested"] as const;
export type NotificationKind = (typeof notificationKinds)[number];
export const isNotificationKind = (value: unknown): value is NotificationKind => notificationKinds.includes(value as NotificationKind);

// audience: whose switch it is. A client's people see the client kinds; lab staff the lab kinds.
export const kindInfo: Record<NotificationKind, { label: string; description: string; audience: View }> = {
  request_answered: { label: "My order request is answered", description: "When the lab accepts or declines an order you asked for. A decline gives the lab's reason; an accept links to the shipping instructions.", audience: "client" },
  dataset_released: { label: "A dataset is released", description: "When the lab releases a dataset to your client.", audience: "client" },
  order_requested: { label: "A client requests an order", description: "When a client asks for a new order. You accept or decline it on the order.", audience: "staff" },
  access_requested: { label: "Someone requests access", description: "When someone asks for access on the public Request access page. A lab Owner or Admin answers it in People.", audience: "staff" },
};
export const kindsFor = (view: View): NotificationKind[] => notificationKinds.filter(kind => kindInfo[kind].audience === view);
// Switches as the screen shows them: a kind is on unless the person turned it off.
export const switchesFor = (view: View, off: readonly string[]) => kindsFor(view).map(kind => ({ kind, ...kindInfo[kind], enabled: !off.includes(kind) }));

export type NotificationEvent =
  | { kind: "request_answered"; orderId: string; code: string; title: string | null; clientId: string; clientName: string; requestedBy: string | null; accepted: boolean; reason: string | null }
  | { kind: "dataset_released"; datasetId: string; orderId: string; code: string; version: number; clientId: string; clientName: string }
  | { kind: "order_requested"; orderId: string; code: string; title: string | null; clientId: string; clientName: string }
  | { kind: "access_requested"; reference: string; fullName: string; organisation: string };

// The client whose members may be recipients (admin.notification_audience's argument); none for an access request.
export const eventClientId = (event: NotificationEvent): string | null => event.kind === "access_requested" ? null : event.clientId;

// A row of admin.notification_audience: active lab staff (labRole) and active members of the event's client
// (clientRole), with the kinds they turned off.
export type AudiencePerson = { userId: string; email: string; labRole: string | null; clientRole: string | null; off: readonly string[] };
export type Recipient = { userId: string; email: string; enabled: boolean };
const LAB_RECIPIENTS = ["owner", "admin", "operator"];

// Who gets an email for the event, once each, with whether their switch for this kind is on.
export function selectRecipients(event: NotificationEvent, people: readonly AudiencePerson[]): Recipient[] {
  const picked = (person: AudiencePerson) => {
    switch (event.kind) {
      case "request_answered": return !!person.clientRole && !!event.requestedBy && person.userId === event.requestedBy;
      case "dataset_released": return !!person.clientRole;
      default: return !!person.labRole && LAB_RECIPIENTS.includes(person.labRole);
    }
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
  reference: event.kind === "access_requested" ? event.reference : event.code,
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
  const report = deps.report ?? (message => console.error(message));
  try {
    const recipients = selectRecipients(event, await deps.audience(eventClientId(event)));
    if (!recipients.length) return [];
    const entries = await deliver(event, recipients, deps);
    try {
      await deps.log(entries);
    } catch (error) {
      report(`[notifications] ${event.kind}: the send log could not be written (${error instanceof Error ? error.message : error})`);
    }
    return entries;
  } catch (error) {
    report(`[notifications] ${event.kind}: nothing sent (${error instanceof Error ? error.message : error})`);
    return [];
  }
}
