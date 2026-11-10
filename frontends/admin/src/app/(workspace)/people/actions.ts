"use server";

import { revalidatePath } from "next/cache";
import { redirectAfterAction } from "@/lib/action-redirect";
import { archiveMember, createInvitation, DataError, revokeInvitation, setRole } from "@/lib/data/people";
import { invitePath, type PersonKind } from "@/lib/people";
import { getAppSession } from "@/lib/session";

export type PeopleActionState = { error?: string };
// On success the invite form shows the link once; the raw token is not kept anywhere else.
export type InviteState = { error?: string; link?: string; email?: string };
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
    return { link: `/admin${invitePath(token)}`, email: email.toLowerCase() };
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
