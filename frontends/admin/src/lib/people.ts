// People, invitations and roles: the demo's records and rules, laid over the synthetic lab people. Pure functions
// over an immutable state slice (kept in DemoState per browser; the server side is data/people.ts). Refusals use the
// wording of the 0015 database functions they stand in for; who may do what comes from roles.ts.
import { createHash } from "node:crypto";
import { demoClients } from "./demo";
import { demoLabStaff } from "./release-demo";
import { allows, clientRoleNames, clientRoles, labRoleNames, labRoles, type ClientRoleKey, type LabRoleKey } from "./roles";
import { DataError } from "./samples";

export type PersonKind = "lab_staff" | "client_member";
// twoStep: whether the person has an app authenticator; null when the app cannot read it (live mode, other people).
export type Person = {
  kind: PersonKind; id: string; userId: string; name: string; email: string | null; role: string;
  clientId: string | null; clientName: string | null; twoStep: boolean | null;
};
export type Invitation = {
  id: string; email: string; labRole: LabRoleKey | null; clientId: string | null; clientRole: ClientRoleKey | null;
  target: string; createdAt: string; expiresAt: string;
};
export type DemoPerson = Person & { archivedAt: string | null; archivedReason: string | null };
// clientName: kept when the client is not one of the fixed demo clients (one created while approving an access request).
export type DemoInvitation = Omit<Invitation, "target"> & {
  clientName?: string | null; tokenSha256: string; createdBy: string; acceptedAt: string | null; acceptedBy: string | null; revokedAt: string | null; revokedBy: string | null;
};
export type PeopleState = { people: DemoPerson[]; invitations: DemoInvitation[] };
export type InvitationTarget = { labRole: string | null; clientId: string | null; clientRole: string | null };

export const INVITATION_DAYS = 7;
export const TOKEN = /^[0-9a-f]{64}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MIN_PASSWORD = 12;

export const tokenDigest = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
export const invitePath = (token: string) => `/invite/${token}`;
const clientName = (id: string | null) => demoClients.find(client => client.id === id)?.name ?? null;
const invitationClient = (item: DemoInvitation) => item.clientName ?? clientName(item.clientId);

export function targetLabel(target: { labRole: string | null; clientRole: string | null; clientName?: string | null }) {
  if (target.labRole) return `Lab ${labRoleNames[target.labRole as LabRoleKey] ?? target.labRole}`;
  return `${clientRoleNames[target.clientRole as ClientRoleKey] ?? target.clientRole} at ${target.clientName ?? "a client"}`;
}

export function demoPeopleSeed(): PeopleState {
  const lab: DemoPerson[] = demoLabStaff.map(person => ({
    kind: "lab_staff", id: `lab-${person.userId}`, userId: person.userId, name: person.name, email: `${person.userId.replace("example-", "")}@example.test`, role: person.role,
    clientId: null, clientName: null, twoStep: true, archivedAt: null, archivedReason: null,
  }));
  const members: DemoPerson[] = [
    { userId: "example-client-member", name: "Demo Client Admin", role: "client_admin", clientId: "example-atlas" },
    { userId: "example-requester", name: "Demo Requester", role: "requester", clientId: "example-cedar" },
  ].map(member => ({ ...member, kind: "client_member", id: `member-${member.userId}`, email: `${member.userId.replace("example-", "")}@example.test`, clientName: clientName(member.clientId), twoStep: false, archivedAt: null, archivedReason: null }));
  return { people: [...lab, ...members], invitations: [] };
}

// The checks create_invitation makes before it stores a link, in the same order.
export function validateTarget(input: InvitationTarget): { labRole: LabRoleKey | null; clientId: string | null; clientRole: ClientRoleKey | null } {
  const labRole = input.labRole?.trim() || null;
  const clientId = input.clientId?.trim() || null;
  const clientRole = input.clientRole?.trim() || null;
  if (!!labRole === !!(clientId || clientRole) || (!labRole && (!clientId || !clientRole))) {
    throw new DataError("Invite for exactly one of: a lab role, or a client with a client role.");
  }
  if (labRole && !(labRoles as readonly string[]).includes(labRole)) throw new DataError("Choose a valid lab role.");
  if (clientRole && !(clientRoles as readonly string[]).includes(clientRole)) throw new DataError("Choose a valid client role.");
  return { labRole: labRole as LabRoleKey | null, clientId, clientRole: clientRole as ClientRoleKey | null };
}
export function requireInviter(actorRole: string, labRole: string | null) {
  if (labRole && !allows("invite_lab", actorRole)) throw new DataError("Only the lab Owner can invite or manage lab staff.");
  if (!allows("invite_client", actorRole)) throw new DataError("Lab Owner or Admin access is required to invite people.");
}
export function normaliseEmail(email: string) {
  const clean = email.trim().toLowerCase();
  if (!EMAIL.test(clean)) throw new DataError("Enter a valid email address.");
  return clean;
}

const active = <T extends { archivedAt: string | null }>(items: T[]) => items.filter(item => !item.archivedAt);
const pending = (invitation: DemoInvitation, now: Date) => !invitation.acceptedAt && !invitation.revokedAt && new Date(invitation.expiresAt) > now;

export function createDemoInvitation(state: PeopleState, input: InvitationTarget & { email: string; actor: { userId: string; role: string }; token: string; id: string; now: Date; clientName?: string }): PeopleState {
  const target = validateTarget(input);
  requireInviter(input.actor.role, target.labRole);
  const email = normaliseEmail(input.email);
  const people = active(state.people);
  if (target.labRole) {
    const held = people.find(person => person.kind === "lab_staff" && person.email === email);
    if (held) throw new DataError(`${email} already holds a lab role (${held.role}); change it in People instead.`);
  } else {
    const name = input.clientName ?? clientName(target.clientId);
    if (!name) throw new DataError("Client not found.");
    const held = people.find(person => person.kind === "client_member" && person.clientId === target.clientId && person.email === email);
    if (held) throw new DataError(`${email} is already a member of ${name} (${held.role}); change the role in People instead.`);
  }
  if (state.invitations.some(item => item.email === email && item.labRole === target.labRole && item.clientId === (target.labRole ? null : target.clientId) && pending(item, input.now))) {
    throw new DataError(`${email} already has a pending invitation for this; revoke it first to send a new link.`);
  }
  const invitation: DemoInvitation = {
    id: input.id, email, labRole: target.labRole, clientId: target.labRole ? null : target.clientId, clientRole: target.labRole ? null : target.clientRole,
    ...(input.clientName && !target.labRole ? { clientName: input.clientName } : {}), tokenSha256: tokenDigest(input.token), createdAt: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + INVITATION_DAYS * 86_400_000).toISOString(), createdBy: input.actor.userId,
    acceptedAt: null, acceptedBy: null, revokedAt: null, revokedBy: null,
  };
  return { ...state, invitations: [...state.invitations, invitation] };
}

export function pendingInvitations(state: PeopleState, now: Date): Invitation[] {
  return state.invitations.filter(item => pending(item, now)).map(item => ({
    id: item.id, email: item.email, labRole: item.labRole, clientId: item.clientId, clientRole: item.clientRole,
    target: targetLabel({ ...item, clientName: invitationClient(item) }), createdAt: item.createdAt, expiresAt: item.expiresAt,
  }));
}

// invitation_preview: a valid, unexpired, unaccepted, unrevoked token only; otherwise null.
export function previewDemoInvitation(state: PeopleState, token: string, now: Date) {
  if (!TOKEN.test(token)) return null;
  const item = state.invitations.find(invitation => invitation.tokenSha256 === tokenDigest(token));
  if (!item || !pending(item, now)) return null;
  // The demo creates no accounts, so an invited email never has one yet.
  return { email: item.email, target: targetLabel({ ...item, clientName: invitationClient(item) }), expiresAt: item.expiresAt, hasAccount: false };
}

// accept_invitation for a person who has just set a password (the demo creates no account and keeps no password).
// nameFor: the full name of the access request an invitation came from (0023: the member is named after it, else the
// invited email).
export function acceptDemoInvitation(state: PeopleState, input: { token: string; userId: string; now: Date; nameFor?: (invitationId: string) => string | null | undefined }): PeopleState {
  const item = TOKEN.test(input.token) ? state.invitations.find(invitation => invitation.tokenSha256 === tokenDigest(input.token)) : undefined;
  if (!item) throw new DataError("This invitation link is not valid.");
  if (item.revokedAt) throw new DataError("This invitation was revoked.");
  if (item.acceptedAt) throw new DataError("This invitation was already used.");
  if (new Date(item.expiresAt) <= input.now) throw new DataError("This invitation has expired.");
  const person: DemoPerson = {
    kind: item.labRole ? "lab_staff" : "client_member", id: `${item.labRole ? "lab" : "member"}-${input.userId}`, userId: input.userId,
    name: (!item.labRole && input.nameFor?.(item.id)) || item.email, email: item.email, role: (item.labRole ?? item.clientRole) as string, clientId: item.clientId, clientName: invitationClient(item),
    twoStep: false, archivedAt: null, archivedReason: null,
  };
  const at = input.now.toISOString();
  return {
    people: [...state.people, person],
    invitations: state.invitations.map(invitation => invitation.id === item.id ? { ...invitation, acceptedAt: at, acceptedBy: input.userId } : invitation),
  };
}

export function revokeDemoInvitation(state: PeopleState, input: { invitationId: string; actor: { userId: string; role: string }; now: Date }): PeopleState {
  const item = state.invitations.find(invitation => invitation.id === input.invitationId);
  if (!allows("invite_client", input.actor.role)) throw new DataError("Lab Owner or Admin access is required to invite people.");
  if (!item) throw new DataError("Invitation not found.");
  requireInviter(input.actor.role, item.labRole);
  if (item.acceptedAt) throw new DataError("This invitation was already used.");
  if (item.revokedAt) throw new DataError("This invitation is already revoked.");
  return { ...state, invitations: state.invitations.map(invitation => invitation.id === item.id ? { ...invitation, revokedAt: input.now.toISOString(), revokedBy: input.actor.userId } : invitation) };
}

function lastOwner(state: PeopleState, person: DemoPerson) {
  return person.role === "owner" && !active(state.people).some(other => other.kind === "lab_staff" && other.role === "owner" && other.id !== person.id);
}
function activeRow(state: PeopleState, kind: PersonKind, id: string) {
  const person = active(state.people).find(item => item.kind === kind && item.id === id);
  if (!person) throw new DataError(kind === "lab_staff" ? "This person is not active lab staff." : "This client membership is not active.");
  return person;
}
const replace = (state: PeopleState, person: DemoPerson): PeopleState => ({ ...state, people: state.people.map(item => item.id === person.id ? person : item) });

// set_lab_role / set_client_member_role. id = the membership row.
export function setDemoRole(state: PeopleState, input: { kind: PersonKind; id: string; role: string; actorRole: string }): PeopleState {
  if (input.kind === "lab_staff") {
    if (!allows("invite_lab", input.actorRole)) throw new DataError("Only the lab Owner can invite or manage lab staff.");
    if (!(labRoles as readonly string[]).includes(input.role)) throw new DataError("Choose a valid lab role.");
  } else {
    if (!allows("invite_client", input.actorRole)) throw new DataError("Lab Owner or Admin access is required to manage client members.");
    if (!(clientRoles as readonly string[]).includes(input.role)) throw new DataError("Choose a valid client role.");
  }
  const person = activeRow(state, input.kind, input.id);
  if (input.kind === "lab_staff" && input.role !== "owner" && lastOwner(state, person)) {
    throw new DataError("The lab needs at least one active Owner; make someone else Owner first.");
  }
  return replace(state, { ...person, role: input.role });
}

export function archiveDemoMember(state: PeopleState, input: { kind: PersonKind; id: string; reason: string; actorRole: string; now: Date }): PeopleState {
  if (input.kind === "lab_staff" && !allows("invite_lab", input.actorRole)) throw new DataError("Only the lab Owner can invite or manage lab staff.");
  if (input.kind === "client_member" && !allows("invite_client", input.actorRole)) throw new DataError("Lab Owner or Admin access is required to manage client members.");
  const reason = input.reason.trim();
  if (!reason) throw new DataError("Archiving a membership needs a reason.");
  const person = activeRow(state, input.kind, input.id);
  if (input.kind === "lab_staff" && lastOwner(state, person)) throw new DataError("The lab needs at least one active Owner; make someone else Owner first.");
  return replace(state, { ...person, archivedAt: input.now.toISOString(), archivedReason: reason });
}
