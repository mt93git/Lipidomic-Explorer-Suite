import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { demoClients } from "../demo";
import { getEnvironment } from "../environment";
import {
  acceptDemoInvitation, archiveDemoMember, createDemoInvitation, demoPeopleSeed, MIN_PASSWORD, normaliseEmail, pendingInvitations,
  previewDemoInvitation, requireInviter, revokeDemoInvitation, setDemoRole, targetLabel, TOKEN, validateTarget,
  type Invitation, type PeopleState, type Person, type PersonKind,
} from "../people";
import type { LabPerson } from "../release";
import { demoLabStaff } from "../release-demo";
import { allows, labRoleKey, type ClientRoleKey, type LabRoleKey } from "../roles";
import { DataError } from "../samples";
import { requireWorkspace } from "../session";
import { createAdminClient } from "../supabase/server";
import { createServiceClient } from "../supabase/service";
import { readDemoAccess, readDemoPeople, writeDemoPeople } from "./demo-store";

export { DataError };

// The people side of the data seam: lab staff and client members, pending invitations, and the public invitation
// page. Live mode calls the 0015 functions with the signed-in user's token (RLS and the functions' own checks
// apply); only the invitation page's final step uses the service-role client (supabase/service.ts). Demo mode works
// on the browser's demo records with a random token and no account. A plain `if (live)` each, like data/clients.ts.
const live = () => !getEnvironment().mock;

export type PeopleView = {
  people: Person[]; invitations: Invitation[]; clients: { id: string; name: string }[];
  canInviteLab: boolean; canInviteClient: boolean; demoActors: LabPerson[] | null;
};
// hasAccount: the invited email already has an account, so the person signs in and accepts (acceptMyInvitation).
export type InvitationPreview = { email: string; target: string; expiresAt: string; hasAccount: boolean };

// ---------------------------------------------------------------- demo

async function demoState(): Promise<PeopleState> {
  return (await readDemoPeople()) ?? demoPeopleSeed();
}
// The demo lab person a form acts as; by default the session's own demo identity (the Operator).
function demoActorOf(session: { userId: string }, actorId?: string) {
  const person = demoLabStaff.find(item => item.userId === (actorId || session.userId));
  if (!person) throw new DataError("Choose a demo lab person.");
  return person;
}

// ---------------------------------------------------------------- live

async function db() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}
function anon() {
  const env = getEnvironment();
  return createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { schema: "admin" } });
}
type One<T> = T | T[] | null;
const one = <T>(value: One<T>) => Array.isArray(value) ? value[0] ?? null : value;
type StaffRow = { id: string; user_id: string; role: string; display_name: string | null };
type MemberRow = { id: string; user_id: string; role: string; display_name?: string | null; client: One<{ id: string; name: string }> };
type InvitationRow = {
  id: string; email: string; lab_role: LabRoleKey | null; client_id: string | null; client_role: ClientRoleKey | null; created_at: string; expires_at: string;
  accepted_by: string | null; revoked_at: string | null; archived_at: string | null; client: One<{ name: string }>;
};
// token_sha256 is not readable through the API: name the columns.
const invitationColumns = "id, email, lab_role, client_id, client_role, created_at, expires_at, accepted_by, revoked_at, archived_at, client:client(name)";
const labOrder = ["owner", "admin", "operator", "member"];
const byPerson = (a: Person, b: Person) => a.kind !== b.kind ? (a.kind === "lab_staff" ? -1 : 1)
  : a.kind === "lab_staff" ? labOrder.indexOf(a.role) - labOrder.indexOf(b.role) || a.name.localeCompare(b.name)
    : (a.clientName ?? "").localeCompare(b.clientName ?? "") || a.name.localeCompare(b.name);

async function livePeople(): Promise<Omit<PeopleView, "canInviteLab" | "canInviteClient" | "demoActors">> {
  const admin = await db();
  const [staff, members, invitations, clients] = await Promise.all([
    admin.from("lab_staff").select("id, user_id, role, display_name").is("archived_at", null),
    admin.from("client_member").select("id, user_id, role, display_name, client:client(id, name)").is("archived_at", null),
    // Lab Owners and Admins only (RLS); an Operator reads none.
    admin.from("invitation").select(invitationColumns).order("created_at"),
    admin.from("client").select("id, name").is("archived_at", null).order("name"),
  ]);
  for (const [label, result] of [["Lab staff", staff], ["Client members", members], ["Invitations", invitations], ["Clients", clients]] as const) {
    if (result.error) throw new DataError(`${label} could not be read: ${result.error.message}`);
  }
  const rows = (invitations.data ?? []) as unknown as InvitationRow[];
  // Emails are not readable from the membership rows; an accepted invitation names its person's email.
  const emails = new Map(rows.filter(row => row.accepted_by).map(row => [row.accepted_by as string, row.email]));
  const fallback = (userId: string) => emails.get(userId) ?? `User ${userId.slice(0, 8)}`;
  const now = Date.now();
  const people: Person[] = [
    ...((staff.data ?? []) as StaffRow[]).map((row): Person => ({ kind: "lab_staff", id: row.id, userId: row.user_id, name: row.display_name || fallback(row.user_id),
      email: emails.get(row.user_id) ?? null, role: row.role, clientId: null, clientName: null, twoStep: null })),
    ...((members.data ?? []) as unknown as MemberRow[]).map((row): Person => {
      const client = one(row.client);
      // Named when they accepted their invitation (0023); older rows fall back to the invitation's email.
      return { kind: "client_member", id: row.id, userId: row.user_id, name: row.display_name || fallback(row.user_id), email: emails.get(row.user_id) ?? null, role: row.role,
        clientId: client?.id ?? null, clientName: client?.name ?? null, twoStep: null };
    }),
  ].sort(byPerson);
  const pending = rows.filter(row => !row.accepted_by && !row.revoked_at && !row.archived_at && Date.parse(row.expires_at) > now).map((row): Invitation => ({
    id: row.id, email: row.email, labRole: row.lab_role, clientId: row.client_id, clientRole: row.client_role,
    target: targetLabel({ labRole: row.lab_role, clientRole: row.client_role, clientName: one(row.client)?.name }), createdAt: row.created_at, expiresAt: row.expires_at,
  }));
  return { people, invitations: pending, clients: (clients.data ?? []) as { id: string; name: string }[] };
}

// ---------------------------------------------------------------- what the screens call

export async function listPeople(): Promise<PeopleView> {
  const session = await requireWorkspace("staff");
  if (!live()) {
    const state = await demoState();
    return {
      people: state.people.filter(person => !person.archivedAt).map(({ kind, id, userId, name, email, role, clientId, clientName, twoStep }): Person => ({ kind, id, userId, name, email, role, clientId, clientName, twoStep })).sort(byPerson),
      invitations: pendingInvitations(state, new Date()), clients: demoClients.map(({ id, name }) => ({ id, name })),
      canInviteLab: true, canInviteClient: true, demoActors: demoLabStaff,
    };
  }
  const role = labRoleKey(session.role);
  return { ...await livePeople(), canInviteLab: allows("invite_lab", role), canInviteClient: allows("invite_client", role), demoActors: null };
}

// Returns the raw token once (only its digest is stored); the screen shows the link to copy.
export async function createInvitation(input: { email: string; labRole: string | null; clientId: string | null; clientRole: string | null; actorId?: string }): Promise<string> {
  const session = await requireWorkspace("staff");
  const target = validateTarget(input);
  const email = normaliseEmail(input.email);
  if (live()) {
    requireInviter(labRoleKey(session.role) ?? "", target.labRole);
    const { data, error } = await (await db()).rpc("create_invitation", { p_email: email, p_lab_role: target.labRole, p_client_id: target.labRole ? null : target.clientId, p_client_role: target.labRole ? null : target.clientRole });
    if (error) throw new DataError(error.message);
    return data as string;
  }
  const token = randomBytes(32).toString("hex");
  const state = createDemoInvitation(await demoState(), { ...target, email, actor: demoActorOf(session, input.actorId), token, id: randomUUID(), now: new Date() });
  await writeDemoPeople(state);
  return token;
}

export async function revokeInvitation(input: { invitationId: string; actorId?: string }): Promise<void> {
  const session = await requireWorkspace("staff");
  if (live()) {
    const { error } = await (await db()).rpc("revoke_invitation", { p_invitation_id: input.invitationId });
    if (error) throw new DataError(error.message);
    return;
  }
  await writeDemoPeople(revokeDemoInvitation(await demoState(), { invitationId: input.invitationId, actor: demoActorOf(session, input.actorId), now: new Date() }));
}

// kind + id = the membership row; userId is what set_lab_role takes.
export async function setRole(input: { kind: PersonKind; id: string; userId: string; role: string; actorId?: string }): Promise<void> {
  const session = await requireWorkspace("staff");
  if (live()) {
    const { error } = input.kind === "lab_staff"
      ? await (await db()).rpc("set_lab_role", { p_user_id: input.userId, p_role: input.role })
      : await (await db()).rpc("set_client_member_role", { p_member_id: input.id, p_role: input.role });
    if (error) throw new DataError(error.message);
    return;
  }
  await writeDemoPeople(setDemoRole(await demoState(), { kind: input.kind, id: input.id, role: input.role, actorRole: demoActorOf(session, input.actorId).role }));
}

export async function archiveMember(input: { kind: PersonKind; id: string; reason: string; actorId?: string }): Promise<void> {
  const session = await requireWorkspace("staff");
  const reason = input.reason.trim();
  if (!reason) throw new DataError("Archiving a membership needs a reason.");
  if (live()) {
    const { error } = await (await db()).rpc("archive_member", { p_kind: input.kind, p_id: input.id, p_reason: reason });
    if (error) throw new DataError(error.message);
    return;
  }
  await writeDemoPeople(archiveDemoMember(await demoState(), { kind: input.kind, id: input.id, reason, actorRole: demoActorOf(session, input.actorId).role, now: new Date() }));
}

// ---------------------------------------------------------------- the public invitation page (no session)

export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  if (!TOKEN.test(token)) return null;
  if (!live()) return previewDemoInvitation(await demoState(), token, new Date());
  const { data, error } = await anon().rpc("invitation_preview", { p_token: token });
  if (error) throw new DataError("The invitation could not be checked. Please try again.");
  const row = ((data ?? []) as { email: string; target: string; expires_at: string; has_account: boolean }[])[0];
  return row ? { email: row.email, target: row.target, expiresAt: row.expires_at, hasAccount: row.has_account === true } : null;
}

// The email of whoever is signed in on this browser (verified with Auth), lower-cased; null when nobody is, or in demo.
// The invitation page uses it to offer accepting with an existing account. It does not need an app session: an
// account may have no membership yet.
export async function signedInEmail(): Promise<string | null> {
  if (!live()) return null;
  const client = await createAdminClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  return error || !data.user?.email ? null : data.user.email.toLowerCase();
}

// accept_my_invitation with the signed-in person's own token: the role is added to their existing account and the
// password is not touched. The database checks that their auth email is the invited one.
export async function acceptMyInvitation(token: string): Promise<{ email: string }> {
  if (!live()) throw new DataError("Accepting with an existing account is not available in the demo.");
  if (!TOKEN.test(token)) throw new DataError("This invitation link is not valid.");
  const client = await createAdminClient();
  const { data } = client ? await client.auth.getUser() : { data: { user: null } };
  if (!client || !data.user?.email) throw new DataError("Sign in with the invited email address first.");
  const { error } = await client.schema("admin").rpc("accept_my_invitation", { p_token: token });
  if (error) throw new DataError(error.message);
  return { email: data.user.email.toLowerCase() };
}

// The invited person sets a password: the server creates their account (self sign-up is off) with the service-role
// key, then accept_invitation adds the membership. If accepting fails, the account just created is removed again so
// the person can retry; if that removal fails too, the server logs it and the person is told to contact the lab (they
// can then sign in with the password they chose and accept with acceptMyInvitation). A person who already has an
// account signs in and uses acceptMyInvitation instead.
export async function acceptInvitation(input: { token: string; password: string }): Promise<{ email: string }> {
  if (input.password.length < MIN_PASSWORD) throw new DataError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
  const invitation = await previewInvitation(input.token);
  if (!invitation) throw new DataError("This invitation link is not valid any more. Ask the lab for a new one.");
  if (!live()) {
    const requests = (await readDemoAccess())?.requests ?? [];
    const nameFor = (invitationId: string) => requests.find(request => request.invitationId === invitationId)?.fullName;
    await writeDemoPeople(acceptDemoInvitation(await demoState(), { token: input.token, userId: `example-${randomUUID()}`, now: new Date(), nameFor }));
    return { email: invitation.email };
  }
  const service = createServiceClient();
  if (!service) throw new DataError("Accepting invitations is not configured on this server. Ask the lab.");
  const created = await service.auth.admin.createUser({ email: invitation.email, password: input.password, email_confirm: true });
  if (created.error || !created.data.user) {
    if (created.error?.status === 422 || /already/i.test(created.error?.message ?? "")) {
      throw new DataError("An account with this email already exists. Sign in with it, then open this link again to accept.");
    }
    throw new DataError("Your account could not be created. Please try again.");
  }
  const userId = created.data.user.id;
  const accepted = await service.schema("admin").rpc("accept_invitation", { p_token: input.token, p_user_id: userId });
  if (accepted.error) {
    const cleanup = await service.auth.admin.deleteUser(userId).then(result => result.error?.message ?? null, (error: unknown) => error instanceof Error ? error.message : String(error));
    if (cleanup) {
      // Ids and messages only: never the password.
      console.error("[invitation] accept_invitation failed and the new account could not be removed", { userId, accept: accepted.error.message, cleanup });
      throw new DataError(`${accepted.error.message}. Your account was created but you were not added: contact the lab. Once they have checked it, sign in with ${invitation.email} and the password you chose, and open this link again.`);
    }
    throw new DataError(accepted.error.message);
  }
  return { email: invitation.email };
}
