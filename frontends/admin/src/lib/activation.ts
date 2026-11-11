// Account emails (decision of 2026-11-11, migration 0029), so nobody needs "Forgot password" to get in the first time:
// (1) an invitation from People emails itself, a welcome with an "Activate your account" link to /invite/<token>;
// (2) a lab Owner or Admin sends an existing account that has not signed in to Admin an activation email, whose
// one-time recovery link (GoTrue's generate_link; GoTrue sends nothing itself) opens /activate. Both go through the
// 0028 sender (notifications.ts: configuration, Resend transport, allowlist, log) and have no switch. Pure and
// injectable: the transport, the link generator, the log and the audit are passed in, so tests never reach Resend
// or GoTrue (the server wiring is data/activation.ts).
import { BASE_PATH } from "./base-path";
import {
  blocked, DEMO_OFF_REASON, OFF_REASON, renderMessage, sendOne, SENDER_NAME, type LogEntry, type LogStatus, type Message,
  type NotifyConfig, type Part, type Transport,
} from "./notifications";
import { activatePath } from "./password-reset";
import { INVITATION_DAYS, invitePath, type PersonKind } from "./people";
import { DataError } from "./samples";

// ---------------------------------------------------------------- who, which state, how often

// Only a lab Owner or Admin sends activation emails (roles.ts keys).
export const maySendActivation = (labRole: string | null | undefined) => labRole === "owner" || labRole === "admin";

// What admin.account_state says about an account (the demo keeps the same facts on its people).
export type AccountFacts = { email: string | null; signedInAt: string | null; twoStep: boolean; hasPassword: boolean; activationSentAt: string | null };
// active: has signed in to Admin. lastSentAt: the last activation email that was sent (skipped or failed ones do not count).
export type Activation = { active: boolean; hasPassword: boolean; lastSentAt: string | null };

// Active: the account has signed in (Admin or Team: the same accounts), so someone copied from Team keeps theirs.
export function activationOf(_kind: PersonKind, facts: AccountFacts): Activation {
  return { active: !!facts.signedInAt, hasPassword: facts.hasPassword, lastSentAt: facts.activationSentAt };
}

// One activation email per person per 10 minutes: each one replaces the previous link, so a quick second send would
// break the first email's link. The milliseconds left, 0 when another may go.
export const ACTIVATION_GAP_MS = 10 * 60_000;
export function activationWait(lastSentAt: string | null, now = Date.now()): number {
  const sent = lastSentAt ? Date.parse(lastSentAt) : NaN;
  return Number.isNaN(sent) ? 0 : Math.max(0, sent + ACTIVATION_GAP_MS - now);
}

// ---------------------------------------------------------------- the emails

const SERVICE = "Lipidomics Admin, the Libreros Lab's lipidomics service";
const IGNORE = "If you did not expect this email, you can ignore it.";
const url = (origin: string, basePath: string, path: string): Part => ({ href: `${origin}${basePath}${path}` });

export type InvitationMail = { inviter: string; target: string; labStaff: boolean; token: string };
export const INVITATION_SUBJECT = "Welcome to Lipidomics · Activate your account";

// From "Lipidomics · Libreros Lab": who invited them, for what, and the link to the invitation page.
export function invitationMessage(input: InvitationMail, origin: string, basePath: string = BASE_PATH): Message {
  return renderMessage(INVITATION_SUBJECT, [
    [`${input.inviter} invited you to ${SERVICE}, as ${input.target}.`],
    [`Activate your account: choose your password at this link. It works once, for ${INVITATION_DAYS} days.`],
    [url(origin, basePath, invitePath(input.token))],
    [IGNORE],
    [SENDER_NAME],
  ]);
}

export type ActivationMail = { name: string; email: string; target: string; labStaff: boolean; hasPassword: boolean; sender: string; tokenHash: string };
export const activationSubject = (hasPassword: boolean) => hasPassword ? "Welcome to Lipidomics · Sign in to Admin" : "Welcome to Lipidomics · Choose your password";

// Without a password: choose one at the link. With one (people copied from Team): it already works, sign in; the link
// still lets them choose a new one. The link works once, for one hour (GoTrue's recovery token).
export function activationMessage(input: ActivationMail, origin: string, basePath: string = BASE_PATH): Message {
  const link = url(origin, basePath, activatePath(input.tokenHash));
  const intro = [`${input.sender} set up your account in ${SERVICE}, as ${input.target}. You sign in with ${input.email}.`];
  const body: Part[][] = input.hasPassword
    ? [intro,
      ["Your Lipidomics Team password already works here. Sign in with it:"], [url(origin, basePath, "/sign-in")],
      ["Would you rather choose a new password? Use this link; it works once, for one hour:"], [link]]
    : [intro,
      ["Choose your password at this link. It works once, for one hour:"], [link],
      ["If the link has expired, ask the lab to send a new one, or use Forgot password on the sign-in page."]];
  return renderMessage(activationSubject(input.hasPassword), [...body, [IGNORE], [SENDER_NAME]], `Hello ${input.name},`);
}

// ---------------------------------------------------------------- sending, logging, auditing

export type EmailOutcome = { status: LogStatus; error: string | null };
export const NO_ORIGIN = "ADMIN_PUBLIC_ORIGIN is not set, so the email would have no link";
type Log = (entries: LogEntry[]) => Promise<void>;
type Report = (message: string) => void;
const say = (error: unknown) => error instanceof Error ? error.message : String(error);
const entry = (kind: "invitation" | "activation", userId: string | null, email: string, subject: string, outcome: EmailOutcome, clientId: string | null): LogEntry =>
  ({ kind, userId, email, subject, ...outcome, clientId, orderId: null, datasetId: null, reference: null });
// blocked() of 0028, and an account email without a link is no use.
const stopped = (email: string, config: NotifyConfig): EmailOutcome | null => blocked(email, config) ?? (config.origin ? null : { status: "failed", error: NO_ORIGIN });
async function quietly(work: () => Promise<void>, what: string, report: Report) {
  try { await work(); } catch (error) { report(`[account email] ${what} (${say(error)})`); }
}

export type InvitationDeps = { config: NotifyConfig; transport: Transport; log: Log; report?: Report };

// After create_invitation succeeded. Never throws: the invitation exists and its link is on screen either way.
export async function sendInvitationEmail(input: InvitationMail & { email: string; clientId: string | null }, deps: InvitationDeps): Promise<EmailOutcome> {
  const report = deps.report ?? (message => console.error(message));
  const outcome = stopped(input.email, deps.config)
    ?? await sendOne(input.email, invitationMessage(input, deps.config.origin as string), deps.config, deps.transport);
  await quietly(() => deps.log([entry("invitation", null, input.email, INVITATION_SUBJECT, outcome, input.clientId)]), "invitation: the send log could not be written", report);
  return outcome;
}

// The person as People lists them, with their account state (null: not readable).
export type ActivationTarget = { userId: string; kind: PersonKind; name: string; email: string | null; target: string; clientId: string | null; activation: Activation | null };
export type ActivationDeps = {
  config: NotifyConfig; transport: Transport; log: Log;
  // GoTrue's generate_link (type recovery) with the service role: the one-time token hash; GoTrue sends no email.
  generateLink: (email: string) => Promise<string>;
  // admin.record_activation_email, as the sender: the "Activation email sent to <name>" audit row.
  audit: (userId: string) => Promise<void>;
  now?: number; report?: Report;
};

// "Send activation email" in People. Refuses (DataError) a sender who is not lab Owner or Admin, an active or
// unreadable account and a second email within 10 minutes. Otherwise logs one row (sent, skipped or failed); a link
// is made only when the email can actually go out, and only a sent email is audited.
export async function sendActivationEmail(input: { senderRole: string | null; sender: string; person: ActivationTarget }, deps: ActivationDeps): Promise<EmailOutcome & { email: string }> {
  const { person } = input;
  const report = deps.report ?? (message => console.error(message));
  if (!maySendActivation(input.senderRole)) throw new DataError("Only a lab Owner or Admin can send activation emails.");
  if (!person.activation) throw new DataError("Whether this account is active could not be read. Reload the page and try again.");
  if (person.activation.active) throw new DataError(`${person.name} has already signed in: the account is active.`);
  if (!person.email) throw new DataError(`${person.name}'s account has no email address.`);
  const wait = activationWait(person.activation.lastSentAt, deps.now ?? Date.now());
  if (wait) throw new DataError(`An activation email went to ${person.name} less than 10 minutes ago. You can send another in ${Math.ceil(wait / 60_000)} min.`);
  const { email } = person;
  const subject = activationSubject(person.activation.hasPassword);
  let outcome = stopped(email, deps.config);
  if (!outcome) {
    let tokenHash: string | null = null;
    try { tokenHash = await deps.generateLink(email); } catch (error) { outcome = { status: "failed", error: `The activation link could not be created: ${say(error)}`.slice(0, 1000) }; }
    if (tokenHash) {
      const message = activationMessage({ name: person.name, email, target: person.target, labStaff: person.kind === "lab_staff", hasPassword: person.activation.hasPassword, sender: input.sender, tokenHash }, deps.config.origin as string);
      outcome = await sendOne(email, message, deps.config, deps.transport);
    }
  }
  const result = outcome as EmailOutcome;
  await quietly(() => deps.log([entry("activation", person.userId, email, subject, result, person.clientId)]), "activation: the send log could not be written", report);
  if (result.status === "sent") await quietly(() => deps.audit(person.userId), "activation: the audit row could not be written", report);
  return { ...result, email };
}

// What People says about an email (the invitation's copy box, the activation result).
export function emailNote(outcome: EmailOutcome, email: string): string {
  if (outcome.status === "sent") return `Emailed to ${email}.`;
  const why = outcome.error === OFF_REASON ? "sending is off on this server (ADMIN_NOTIFY_ENABLED)"
    : outcome.error === DEMO_OFF_REASON ? "the example workspace sends no email"
    : outcome.error === "Not on ADMIN_NOTIFY_ALLOW" ? `${email.slice(email.lastIndexOf("@") + 1)} is not on this server's allowlist (ADMIN_NOTIFY_ALLOW)`
    : `the email failed (${outcome.error ?? "unknown error"})`;
  return `Not emailed: ${why}.`;
}
