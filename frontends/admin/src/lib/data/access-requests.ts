import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import {
  AccessRefusal, answerDemoAccess, demoAccessSeed, eraseExpired, listDemoAccess, pendingDemoAccess, requireAccessManager, submitDemoAccess,
  type AccessRequest, type AccessRequestState, type ApproveTarget, type CleanAccessForm, type ClientKind,
} from "../access-requests";
import { getEnvironment } from "../environment";
import { createDemoInvitation, demoPeopleSeed } from "../people";
import type { LabPerson } from "../release";
import { demoLabStaff } from "../release-demo";
import type { ClientRoleKey } from "../roles";
import { DataError } from "../samples";
import { getAppSession, requireWorkspace } from "../session";
import { createAdminClient } from "../supabase/server";
import { createServiceClient } from "../supabase/service";
import { createClient as createClientRecord, listClientRecords } from "./clients";
import { readDemoAccess, readDemoPeople, writeDemoAccess, writeDemoPeople } from "./demo-store";
import { notify } from "./notifications";

export { AccessRefusal, DataError };

// The access-request side of the data seam (0020). The public form submits with the service-role client (the only
// key that may call submit_access_request); the lab lists and answers with the signed-in user's token. Demo mode keeps
// the browser's records (two seeded requests) and creates demo clients and invitations like the screens they reuse.
const live = () => !getEnvironment().mock;

export type AccessView = { requests: AccessRequest[]; clients: { id: string; name: string }[]; canAnswer: boolean; demoActors: LabPerson[] | null };

async function demoState(): Promise<AccessRequestState> {
  return eraseExpired((await readDemoAccess()) ?? demoAccessSeed(new Date()), new Date());
}
function demoActorOf(session: { userId: string }, actorId?: string) {
  const person = demoLabStaff.find(item => item.userId === (actorId || session.userId));
  if (!person) throw new DataError("Choose a demo lab person.");
  return person;
}
async function db() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}
type Row = {
  id: string; reference: string; created_at: string; status: AccessRequest["status"]; full_name: string | null; email: string | null;
  organisation: string | null; kind: ClientKind; message: string | null; decided_at: string | null; decided_by: string | null;
  decline_reason: string | null; client_id: string | null; invitation_id: string | null; erased_at: string | null; matching_client_id: string | null;
};
const fromRow = (row: Row): AccessRequest => ({
  id: row.id, reference: row.reference, createdAt: row.created_at, status: row.status, fullName: row.full_name, email: row.email,
  organisation: row.organisation, kind: row.kind, message: row.message, decidedAt: row.decided_at, decidedBy: row.decided_by,
  declineReason: row.decline_reason, clientId: row.client_id, invitationId: row.invitation_id, erasedAt: row.erased_at, matchingClientId: row.matching_client_id,
});
const isManager = (role: string) => role === "Owner" || role === "Admin";

// ---------------------------------------------------------------- the public form (no session)

// Returns the reference. AccessRefusal "pending" / "full" for the database's own caps; DataError when the server
// cannot take requests. The caller has already applied the per-IP/per-email limit.
export async function submitAccessRequest(input: CleanAccessForm): Promise<string> {
  if (!live()) {
    const { state, reference } = submitDemoAccess(await demoState(), input, new Date());
    await writeDemoAccess(state);
    await notify({ kind: "access_requested", reference, fullName: input.fullName, organisation: input.organisation });
    return reference;
  }
  const service = createServiceClient();
  if (!service) throw new DataError("Access requests are not configured on this server.");
  const { data, error } = await service.schema("admin").rpc("submit_access_request", {
    p_full_name: input.fullName, p_email: input.email, p_organisation: input.organisation, p_kind: input.kind, p_message: input.message,
  });
  if (error?.code === "PT409") throw new AccessRefusal("pending", error.message);
  if (error?.code === "54000") throw new AccessRefusal("full", error.message);
  if (error) {
    console.error("[access-request] submit failed", { code: error.code }); // never the person's data
    throw new DataError("Your request could not be sent.");
  }
  // The lab's Owner, Admin and Operator are told (0028), after the response.
  await notify({ kind: "access_requested", reference: data as string, fullName: input.fullName, organisation: input.organisation });
  return data as string;
}

// ---------------------------------------------------------------- the lab

export async function listAccessRequests(): Promise<AccessView> {
  const session = await requireWorkspace("staff");
  if (!live()) {
    const clients = (await listClientRecords()).filter(client => !client.archivedAt);
    return { requests: listDemoAccess(await demoState(), clients), clients: clients.map(({ id, name }) => ({ id, name })), canAnswer: true, demoActors: demoLabStaff };
  }
  if (!isManager(session.role)) return { requests: [], clients: [], canAnswer: false, demoActors: null };
  const admin = await db();
  const [requests, clients] = await Promise.all([admin.rpc("list_access_requests"), admin.from("client").select("id, name").is("archived_at", null).order("name")]);
  if (requests.error) throw new DataError(`Access requests could not be read: ${requests.error.message}`);
  if (clients.error) throw new DataError(`Clients could not be read: ${clients.error.message}`);
  return { requests: ((requests.data ?? []) as Row[]).map(fromRow), clients: (clients.data ?? []) as { id: string; name: string }[], canAnswer: true, demoActors: null };
}

// The sidebar counter: pending requests for a lab Owner or Admin (everyone in the demo), else nothing. It never
// breaks the page it sits on.
export async function pendingAccessCount(): Promise<number> {
  const session = await getAppSession();
  if (!session || session.view !== "staff") return 0;
  try {
    if (!live()) return (await demoState()).requests.filter(item => item.status === "pending").length;
    if (!isManager(session.role)) return 0;
    const { data, error } = await (await db()).rpc("pending_access_request_count");
    return error ? 0 : Number(data) || 0;
  } catch {
    return 0;
  }
}

// Returns the raw invitation token once; the screen shows the link to copy.
export async function approveAccessRequest(input: { requestId: string; target: ApproveTarget; role: ClientRoleKey; actorId?: string }): Promise<string> {
  const session = await requireWorkspace("staff");
  if (live()) {
    const newClient = "newClientName" in input.target ? input.target : null;
    const { data, error } = await (await db()).rpc("approve_access_request", {
      p_request_id: input.requestId, p_client_id: newClient ? null : (input.target as { clientId: string }).clientId,
      p_new_client_name: newClient?.newClientName ?? null, p_new_client_kind: newClient?.newClientKind ?? null, p_client_role: input.role,
    });
    if (error) throw new DataError(error.message);
    return data as string;
  }
  const actor = demoActorOf(session, input.actorId);
  requireAccessManager(actor.role);
  const state = await demoState();
  const request = pendingDemoAccess(state, input.requestId);
  const email = request.email as string;
  // Checked before anything is written, so a refusal leaves no demo client behind (approve_access_request is one transaction).
  const records = await listClientRecords();
  let client: { id: string; name: string };
  if ("clientId" in input.target) {
    const found = records.find(item => item.id === (input.target as { clientId: string }).clientId);
    if (!found) throw new DataError("Client not found.");
    if (found.archivedAt) throw new DataError(`Client ${found.name} is archived.`);
    client = found;
  } else {
    const name = input.target.newClientName;
    if (records.some(item => item.name === name)) throw new DataError(`A client named "${name}" already exists.`);
    client = { id: "", name };
  }
  const people = (await readDemoPeople()) ?? demoPeopleSeed();
  const token = randomBytes(32).toString("hex");
  const invitationId = randomUUID();
  const invite = (clientId: string) => createDemoInvitation(people, {
    email, labRole: null, clientId, clientRole: input.role, actor, token, id: invitationId, now: new Date(), clientName: client.name,
  });
  invite(client.id || "pending-new-client"); // a dry run: refuses an existing member or a pending invitation
  if (!client.id) {
    const target = input.target as { newClientName: string; newClientKind: ClientKind };
    client = { id: await createClientRecord({ name: target.newClientName, kind: target.newClientKind, billingMethod: null, notes: null, actorId: actor.userId }), name: client.name };
  }
  await writeDemoPeople(invite(client.id));
  await writeDemoAccess(answerDemoAccess(state, { id: request.id, status: "approved", clientId: client.id, invitationId, actor, now: new Date() }));
  return token;
}

export async function declineAccessRequest(input: { requestId: string; reason: string; actorId?: string }): Promise<void> {
  const session = await requireWorkspace("staff");
  if (live()) {
    const { error } = await (await db()).rpc("decline_access_request", { p_request_id: input.requestId, p_reason: input.reason });
    if (error) throw new DataError(error.message);
  } else {
    await writeDemoAccess(answerDemoAccess(await demoState(), { id: input.requestId, status: "declined", reason: input.reason, actor: demoActorOf(session, input.actorId), now: new Date() }));
  }
}
