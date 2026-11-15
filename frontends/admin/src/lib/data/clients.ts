import "server-only";
import { demoClients } from "../demo";
import { getEnvironment } from "../environment";
import { stages } from "../models";
import { demoLabStaff } from "../release-demo";
import { DataError, stageFromDb } from "../samples";
import { demoPeopleSeed, type PeopleState } from "../people";
import { allows, labRoleKey } from "../roles";
import { requireWorkspace } from "../session";
import { createAdminClient } from "../supabase/server";
import { listClients, listOrders } from "./orders";
import { readDemoClients, readDemoPeople, writeDemoClients } from "./demo-store";

export { DataError };
export const kindLabels: Record<string, string> = { pi_lab: "PI lab", internal_group: "Internal group", company: "Company" };
export const billingLabels: Record<string, string> = { charge_code: "Charge code", po: "Purchase order", grant: "Grant", quote: "Quote" };
export const memberRoleLabels: Record<string, string> = { client_admin: "Client admin", requester: "Requester", viewer: "Viewer" };
// name: the name the member was given (0023), email and lastSignInAt: from 0037's client_people (lab staff only). The
// screens name a member by name, else email; never by user id.
export type ClientMember = { userId: string; role: string; name?: string | null; email?: string | null; lastSignInAt?: string | null };
// panel and samples: from the order list (null for an archived order, which leaves it).
export type ClientOrder = { code: string; title: string; stage: string; archivedAt: string | null; panel?: string | null; samples?: number | null };
export type ClientRecord = {
  id: string; name: string; kind: string; billingMethod: string | null; notes: string | null;
  archivedAt: string | null; archivedReason: string | null; memberCount: number; openOrders: number;
  members: ClientMember[]; orders: ClientOrder[];
  // 0037: the client's code (CL-001), given by the database.
  code?: string | null;
  // The pipeline's colour for the client (same palette and order as listClients); "shared" when archived.
  color?: string;
  // Orders that reached Released (archived ones excluded).
  released?: number;
  // 0021: whether the client's people get Open in Nexo (off by default; lab Owner or Admin).
  nexoAccess?: boolean;
  // 0024: whether its members may prepare datasets and upload their own Excel in Nexo (off by default; lab Owner or
  // Admin, only while nexoAccess is on).
  membersPrepare?: boolean;
};
export type ClientInput = { name: string; kind: string; billingMethod: string | null; notes: string | null; actorId?: string };
const live = () => !getEnvironment().mock;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const has = (labels: Record<string, string>, key: string) => Object.hasOwn(labels, key);
function validated(input: ClientInput): ClientInput {
  const name = input.name.trim();
  if (!name) throw new DataError("Client name is required.");
  if (!has(kindLabels, input.kind)) throw new DataError("Choose a valid client kind.");
  if (input.billingMethod !== null && !has(billingLabels, input.billingMethod)) throw new DataError("Choose a valid billing method.");
  return { ...input, name, notes: input.notes?.trim() || null };
}
async function manager(actorId?: string) {
  const session = await requireWorkspace("staff");
  let role = session.role.toLowerCase();
  if (!live() && actorId) {
    const person = demoLabStaff.find(person => person.userId === actorId);
    if (!person) throw new DataError("Choose a demo lab person.");
    role = person.role;
  }
  if (role !== "owner" && role !== "admin") throw new DataError("Lab Owner or Admin access is required to manage clients.");
}
// canInvite: Invite user (a lab Owner or Admin, as People and create_invitation check); by the signed-in role in both
// modes, so the demo's Operator sees what a real Operator sees (the demo's People form still has its Act as picker).
export async function clientPermissions() {
  const session = await requireWorkspace("staff");
  return {
    canEdit: !live() || ["Owner", "Admin"].includes(session.role), canInvite: allows("invite_client", labRoleKey(session.role)),
    demoActors: live() ? null : demoLabStaff,
  };
}
async function admin() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}

type ClientRow = {
  id: string; name: string; kind: string; billing_method: string | null; notes: string | null;
  archived_at: string | null; archived_reason: string | null; nexo_access?: boolean; members_prepare?: boolean;
  code?: string | null;
  client_member: { user_id: string; role: string; archived_at: string | null; display_name?: string | null }[] | null;
  order: { code: string; title: string | null; stage: string; archived_at: string | null }[] | null;
};
const select = "id, code, name, kind, billing_method, notes, archived_at, archived_reason, nexo_access, members_prepare, client_member(user_id, role, archived_at, display_name), order(code, title, stage, archived_at)";
const stageLabel = (stage: string) => stage === "released" ? "Released" : stages[stageFromDb(stage)];
function fromRow(row: ClientRow): ClientRecord {
  const members = (row.client_member ?? []).filter(member => !member.archived_at).map(member => ({ userId: member.user_id, role: member.role, name: member.display_name?.trim() || null }));
  const orders = (row.order ?? []).map(order => ({ code: order.code, title: order.title ?? "", stage: stageLabel(order.stage), archivedAt: order.archived_at })).sort((a, b) => a.code.localeCompare(b.code));
  return { id: row.id, code: row.code ?? null, name: row.name, kind: row.kind, billingMethod: row.billing_method, notes: row.notes,
    archivedAt: row.archived_at, archivedReason: row.archived_reason, nexoAccess: row.nexo_access === true, membersPrepare: row.members_prepare === true, memberCount: members.length,
    openOrders: orders.filter(order => !order.archivedAt && order.stage !== "Released").length, members, orders };
}
// Colour, released count, and each order's panel and samples, from the pipeline's own reads (live and demo alike).
// Presentation only: when the pipeline cannot be read, the records stay as they are (grey square, no panel).
async function withPipeline(records: ClientRecord[]): Promise<ClientRecord[]> {
  const read = await Promise.all([listClients(), listOrders()]).catch(() => null);
  if (!read) return records.map(record => ({ ...record, color: "shared", released: record.orders.filter(order => !order.archivedAt && order.stage === "Released").length }));
  const [colors, orders] = read;
  const byCode = new Map(orders.map(order => [order.code, order]));
  return records.map(record => ({
    ...record,
    color: record.archivedAt ? "shared" : colors.find(client => client.id === record.id)?.color ?? "shared",
    released: record.orders.filter(order => !order.archivedAt && order.stage === "Released").length,
    orders: record.orders.map(order => ({ ...order, panel: byCode.get(order.code)?.panel ?? null, samples: byCode.get(order.code)?.sampleCount ?? null })),
  }));
}
const demoCode = (index: number) => `CL-${String(index + 1).padStart(3, "0")}`;
// The demo's members: People's demo records of each client (names, emails, last sign-in), as the lab sees them.
const demoPeople = (state: PeopleState) => (clientId: string): ClientMember[] =>
  state.people.filter(person => person.kind === "client_member" && person.clientId === clientId && !person.archivedAt)
    .map(person => ({ userId: person.userId, role: person.role, name: person.name, email: person.email, lastSignInAt: person.signedInAt ?? null }));
type PeopleRow = { user_id: string; display_name: string | null; email: string | null; role: string; last_sign_in_at: string | null };
// 0037's admin.client_people: names, emails and last sign-in of the client's active members (lab staff only). When it
// cannot be read, the members keep the names the client row gave them.
async function liveMembers(clientId: string, fallback: ClientMember[]): Promise<ClientMember[]> {
  let rows: PeopleRow[];
  try {
    const { data, error } = await (await admin()).rpc("client_people", { p_client_id: clientId });
    if (error || !Array.isArray(data)) return fallback;
    rows = data as PeopleRow[];
  } catch { return fallback; }
  return rows.map(row => ({ userId: row.user_id, role: row.role, name: row.display_name?.trim() || null, email: row.email, lastSignInAt: row.last_sign_in_at }));
}
async function demoRecords(): Promise<ClientRecord[]> {
  const stored = await readDemoClients();
  const orders = await listOrders();
  const people = demoPeople((await readDemoPeople()) ?? demoPeopleSeed());
  const records = demoClients.map((client, index): ClientRecord => ({
    id: client.id, code: demoCode(index), name: client.name, kind: index === 2 ? "company" : "pi_lab", billingMethod: "charge_code", notes: null,
    archivedAt: null, archivedReason: null, nexoAccess: false, membersPrepare: false, memberCount: 0, openOrders: 0,
    members: [], orders: [],
  }));
  for (const client of stored ?? []) {
    const index = records.findIndex(record => record.id === client.id);
    if (index < 0) records.push(client); else records[index] = client;
  }
  return records.map((client, index) => {
    const children = orders.filter(order => order.clientId === client.id).map(order => ({ code: order.code, title: order.description, stage: order.released ? "Released" : stages[order.stage], archivedAt: null }));
    const members = people(client.id);
    return { ...client, code: client.code ?? demoCode(index), members, memberCount: members.length, orders: children, openOrders: children.filter(order => order.stage !== "Released").length };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
export async function listClientRecords(): Promise<ClientRecord[]> {
  await requireWorkspace("staff");
  if (!live()) return withPipeline(await demoRecords());
  const { data, error } = await (await admin()).from("client").select(select).order("name");
  if (error) throw new DataError(`Clients could not be read: ${error.message}`);
  return withPipeline(((data ?? []) as unknown as ClientRow[]).map(fromRow));
}
export async function getClient(id: string): Promise<ClientRecord | null> {
  await requireWorkspace("staff");
  if (!live()) {
    const client = (await demoRecords()).find(item => item.id === id);
    return client ? (await withPipeline([client]))[0] : null;
  }
  if (!uuid.test(id)) return null;
  const { data, error } = await (await admin()).from("client").select(select).eq("id", id).maybeSingle();
  if (error) throw new DataError(`Client could not be read: ${error.message}`);
  if (!data) return null;
  const client = fromRow(data as unknown as ClientRow);
  const [record] = await withPipeline([{ ...client, members: await liveMembers(client.id, client.members) }]);
  return record;
}
function args(input: ClientInput) {
  return { p_name: input.name, p_kind: input.kind, p_billing_method: input.billingMethod, p_notes: input.notes };
}
function available(records: ClientRecord[], id: string) {
  const client = records.find(client => client.id === id);
  if (!client) throw new DataError("Client not found.");
  if (client.archivedAt) throw new DataError("Client is archived.");
  return client;
}
function uniqueName(records: ClientRecord[], name: string, id?: string) {
  if (records.some(client => client.id !== id && client.name === name)) throw new DataError(`A client named "${name}" already exists.`);
}
export async function createClient(input: ClientInput): Promise<string> {
  await manager(input.actorId);
  const clean = validated(input);
  if (live()) {
    const { data, error } = await (await admin()).rpc("create_client", args(clean));
    if (error) throw new DataError(error.message);
    return data as string;
  }
  const records = await demoRecords();
  uniqueName(records, clean.name);
  const id = crypto.randomUUID();
  await writeDemoClients([...records, { id, code: demoCode(records.length), name: clean.name, kind: clean.kind, billingMethod: clean.billingMethod, notes: clean.notes,
    archivedAt: null, archivedReason: null, memberCount: 0, openOrders: 0, members: [], orders: [] }]);
  return id;
}
export async function updateClient(input: ClientInput & { clientId: string }): Promise<void> {
  await manager(input.actorId);
  const clean = validated(input);
  if (live()) {
    const { error } = await (await admin()).rpc("update_client", { p_client_id: input.clientId, ...args(clean) });
    if (error) throw new DataError(error.message);
    return;
  }
  const records = await demoRecords();
  available(records, input.clientId);
  uniqueName(records, clean.name, input.clientId);
  await writeDemoClients(records.map(client => client.id === input.clientId ? { ...client, name: clean.name, kind: clean.kind, billingMethod: clean.billingMethod, notes: clean.notes } : client));
}
export async function archiveClient(input: { clientId: string; reason: string; actorId?: string }): Promise<void> {
  await manager(input.actorId);
  const reason = input.reason.trim();
  if (!reason) throw new DataError("Archiving a client needs a reason.");
  if (live()) {
    const { error } = await (await admin()).rpc("archive_client", { p_client_id: input.clientId, p_reason: reason });
    if (error) throw new DataError(error.message);
    return;
  }
  const records = await demoRecords();
  const client = available(records, input.clientId);
  if (client.openOrders) throw new DataError("Client has an open order; release or archive its open orders first.");
  await writeDemoClients(records.map(client => client.id === input.clientId ? { ...client, archivedAt: new Date().toISOString(), archivedReason: reason } : client));
}

// The per-client Nexo switch (0021's set_client_nexo_access): lab Owner or Admin; audited in the database.
export async function setClientNexoAccess(input: { clientId: string; enabled: boolean; actorId?: string }): Promise<void> {
  await manager(input.actorId);
  if (live()) {
    const { error } = await (await admin()).rpc("set_client_nexo_access", { p_client_id: input.clientId, p_enabled: input.enabled });
    if (error) throw new DataError(error.message);
    return;
  }
  const records = await demoRecords();
  available(records, input.clientId);
  await writeDemoClients(records.map(client => client.id === input.clientId ? { ...client, nexoAccess: input.enabled } : client));
}

// The per-client "members prepare in Nexo" switch (0024's set_client_members_prepare): lab Owner or Admin; turned on
// only while Nexo access is on (the database refuses it too); audited in the database.
export async function setClientMembersPrepare(input: { clientId: string; enabled: boolean; actorId?: string }): Promise<void> {
  await manager(input.actorId);
  if (live()) {
    const { error } = await (await admin()).rpc("set_client_members_prepare", { p_client_id: input.clientId, p_enabled: input.enabled });
    if (error) throw new DataError(error.message);
    return;
  }
  const records = await demoRecords();
  const client = available(records, input.clientId);
  if (input.enabled && !client.nexoAccess) throw new DataError("Turn Nexo access on for this client first.");
  await writeDemoClients(records.map(record => record.id === input.clientId ? { ...record, membersPrepare: input.enabled } : record));
}

// Read by the client portal for the client being viewed (a client member reads its own client row; RLS decides).
// False whenever it cannot be read: no switch, no Open in Nexo.
export async function clientNexoAccess(clientId: string): Promise<boolean> {
  if (!live()) return (await readDemoClients())?.find(client => client.id === clientId)?.nexoAccess === true;
  if (!uuid.test(clientId)) return false;
  const { data, error } = await (await admin()).from("client").select("nexo_access").eq("id", clientId).maybeSingle();
  return !error && (data as { nexo_access?: boolean } | null)?.nexo_access === true;
}
