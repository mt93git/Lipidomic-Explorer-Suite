"use server";

import { revalidatePath } from "next/cache";
import { redirectAfterAction } from "@/lib/action-redirect";
import { validateApprove } from "@/lib/access-requests";
import { emailNote, type EmailOutcome } from "@/lib/activation";
import { withBasePath } from "@/lib/base-path";
import { approveAccessRequest, declineAccessRequest } from "@/lib/data/access-requests";
import { emailInvitation, sendActivation } from "@/lib/data/activation";
import { archiveMember, createInvitation, DataError, revokeInvitation, setRole } from "@/lib/data/people";
import { invitePath, type PersonKind } from "@/lib/people";
import { getAppSession } from "@/lib/session";

export type PeopleActionState = { error?: string };
// On success the invite form shows the link once; the raw token is not kept anywhere else. emailNote / emailed: whether
// the invitation email went (activation.ts), or why not; the link is the fallback either way.
export type InviteState = { error?: string; link?: string; email?: string; emailNote?: string; emailed?: boolean };
const noted = (outcome: (EmailOutcome & { email: string }) | null) => outcome
  ? { emailNote: emailNote(outcome, outcome.email), emailed: outcome.status === "sent" }
  : { emailNote: "Not emailed: the invitation could not be read back.", emailed: false };
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim().slice(0, 500);
const kindOf = (form: FormData): PersonKind => value(form, "kind") === "lab_staff" ? "lab_staff" : "client_member";
const actor = (form: FormData) => value(form, "actor") || undefined;
async function authorize() {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
}
async function attempt(work: () => Promise<void>, banner: string): Promise<PeopleActionState> {
  await authorize();
  try { await work(); } catch (error) { if (error instanceof DataError) return { error: error.message }; throw error; }
  revalidatePath("/people");
  return redirectAfterAction(`/people?done=${banner}`);
}

// target = "lab:<role>" or "client:<role>" (then clientId names the client).
export async function inviteAction(_previous: InviteState, form: FormData): Promise<InviteState> {
  await authorize();
  const [scope, role] = value(form, "target").split(":");
  const email = value(form, "email");
  try {
    const token = await createInvitation({
      email, labRole: scope === "lab" ? role : null, clientId: scope === "client" ? value(form, "clientId") || null : null,
      clientRole: scope === "client" ? role : null, actorId: actor(form),
    });
    revalidatePath("/people");
    return { link: withBasePath(invitePath(token)), email: email.toLowerCase(), ...noted(await emailInvitation(token, scope === "lab", actor(form))) };
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
}
export async function revokeAction(_previous: PeopleActionState, form: FormData) {
  return attempt(() => revokeInvitation({ invitationId: value(form, "invitationId"), actorId: actor(form) }), "revoked");
}
export async function setRoleAction(_previous: PeopleActionState, form: FormData) {
  return attempt(() => setRole({ kind: kindOf(form), id: value(form, "id"), userId: value(form, "userId"), role: value(form, "role"), actorId: actor(form) }), "role");
}
export async function archiveMemberAction(_previous: PeopleActionState, form: FormData) {
  return attempt(() => archiveMember({ kind: kindOf(form), id: value(form, "id"), reason: value(form, "reason"), actorId: actor(form) }), "archived");
}

// Access requests (F3). One state per section, so the link survives the request leaving the list. requestId names
// the request the result (or the error) is about.
export type AccessAnswerState = { error?: string; requestId?: string; link?: string; declined?: boolean; emailNote?: string; emailed?: boolean };
// intent = "approve" (target existing|new, clientId or newClientName + newClientKind, role) or "decline" (reason).
export async function answerAccessAction(_previous: AccessAnswerState, form: FormData): Promise<AccessAnswerState> {
  return value(form, "intent") === "decline" ? decline(form) : approve(form);
}
async function approve(form: FormData): Promise<AccessAnswerState> {
  await authorize();
  const requestId = value(form, "requestId");
  try {
    const { target, role } = validateApprove({ target: value(form, "target"), clientId: value(form, "clientId"), newClientName: value(form, "newClientName"), newClientKind: value(form, "newClientKind"), role: value(form, "role") });
    const token = await approveAccessRequest({ requestId, target, role, actorId: actor(form) });
    revalidatePath("/people");
    return { requestId, link: withBasePath(invitePath(token)), ...noted(await emailInvitation(token, false, actor(form))) };
  } catch (error) {
    if (error instanceof DataError) return { requestId, error: error.message };
    throw error;
  }
}
async function decline(form: FormData): Promise<AccessAnswerState> {
  await authorize();
  const requestId = value(form, "requestId");
  try {
    await declineAccessRequest({ requestId, reason: value(form, "reason"), actorId: actor(form) });
    revalidatePath("/people");
    return { requestId, declined: true };
  } catch (error) {
    if (error instanceof DataError) return { requestId, error: error.message };
    throw error;
  }
}

// "Send activation email" / "Resend" on a People row (activation.ts): the result stays next to the button.
export type ActivationState = { error?: string; note?: string; sent?: boolean };
export async function sendActivationAction(_previous: ActivationState, form: FormData): Promise<ActivationState> {
  await authorize();
  try {
    const outcome = await sendActivation({ kind: kindOf(form), id: value(form, "id"), actorId: actor(form) });
    revalidatePath("/people");
    return { note: emailNote(outcome, outcome.email), sent: outcome.status === "sent" };
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
}
