import "server-only";
import { demoClients } from "../demo";
import { getEnvironment } from "../environment";
import { stages } from "../models";
import { demoLabStaff } from "../release-demo";
import { DataError, stageFromDb } from "../samples";
import { requireWorkspace } from "../session";
import { createAdminClient } from "../supabase/server";
import { listOrders } from "./orders";
import { readDemoClients, writeDemoClients } from "./demo-store";

export { DataError };
export const kindLabels: Record<string, string> = { pi_lab: "PI lab", internal_group: "Internal group", company: "Company" };
export const billingLabels: Record<string, string> = { charge_code: "Charge code", po: "Purchase order", grant: "Grant", quote: "Quote" };
export const memberRoleLabels: Record<string, string> = { client_admin: "Client admin", requester: "Requester", viewer: "Viewer" };
export type ClientMember = { userId: string; role: string };
export type ClientOrder = { code: string; title: string; stage: string; archivedAt: string | null };
export type ClientRecord = {
  id: string; name: string; kind: string; billingMethod: string | null; notes: string | null;
  archivedAt: string | null; archivedReason: string | null; memberCount: number; openOrders: number;
  members: ClientMember[]; orders: ClientOrder[];
  // 0021: whether the client's people get Open in Nexo (off by default; lab Owner or Admin).
  nexoAccess?: boolean;
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
export async function clientPermissions() {
  const session = await requireWorkspace("staff");
  return { canEdit: !live() || ["Owner", "Admin"].includes(session.role), demoActors: live() ? null : demoLabStaff };
}
async function admin() {
  const client = await createAdminClient();
  if (!client) throw new DataError("Your session is not available. Sign in again.");
  return client.schema("admin");
}

type ClientRow = {
  id: string; name: string; kind: string; billing_method: string | null; notes: string | null;
  archived_at: string | null; archived_reason: string | null; nexo_access?: boolean;
  client_member: { user_id: string; role: string; archived_at: string | null }[] | null;
  order: { code: string; title: string | null; stage: string; archived_at: string | null }[] | null;
};
const select = "id, name, kind, billing_method, notes, archived_at, archived_reason, nexo_access, client_member(user_id, role, archived_at), order(code, title, stage, archived_at)";
const stageLabel = (stage: string) => stage === "released" ? "Released" : stages[stageFromDb(stage)];
function fromRow(row: ClientRow): ClientRecord {
  const members = (row.client_member ?? []).filter(member => !member.archived_at).map(member => ({ userId: member.user_id, role: member.role }));
  const orders = (row.order ?? []).map(order => ({ code: order.code, title: order.title ?? "", stage: stageLabel(order.stage), archivedAt: order.archived_at })).sort((a, b) => a.code.localeCompare(b.code));
  return { id: row.id, name: row.name, kind: row.kind, billingMethod: row.billing_method, notes: row.notes,
    archivedAt: row.archived_at, archivedReason: row.archived_reason, nexoAccess: row.nexo_access === true, memberCount: members.length,
    openOrders: orders.filter(order => !order.archivedAt && order.stage !== "Released").length, members, orders };
}
async function demoRecords(): Promise<ClientRecord[]> {
  const stored = await readDemoClients();
  const orders = await listOrders();
  const records = demoClients.map((client, index): ClientRecord => ({
    id: client.id, name: client.name, kind: index === 2 ? "company" : "pi_lab", billingMethod: "charge_code", notes: null,
    archivedAt: null, archivedReason: null, nexoAccess: false, memberCount: 1, openOrders: 0,
    members: [{ userId: "example-client-member", role: "client_admin" }], orders: [],
  }));
  for (const client of stored ?? []) {
    const index = records.findIndex(record => record.id === client.id);
    if (index < 0) records.push(client); else records[index] = client;
  }
  return records.map(client => {
    const children = orders.filter(order => order.clientId === client.id).map(order => ({ code: order.code, title: order.description, stage: order.released ? "Released" : stages[order.stage], archivedAt: null }));
    return { ...client, orders: children, openOrders: children.filter(order => order.stage !== "Released").length };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
export async function listClientRecords(): Promise<ClientRecord[]> {
  await requireWorkspace("staff");
  if (!live()) return demoRecords();
  const { data, error } = await (await admin()).from("client").select(select).order("name");
  if (error) throw new DataError(`Clients could not be read: ${error.message}`);
  return ((data ?? []) as unknown as ClientRow[]).map(fromRow);
}
export async function getClient(id: string): Promise<ClientRecord | null> {
  await requireWorkspace("staff");
  if (!live()) return (await demoRecords()).find(client => client.id === id) ?? null;
  if (!uuid.test(id)) return null;
  const { data, error } = await (await admin()).from("client").select(select).eq("id", id).maybeSingle();
  if (error) throw new DataError(`Client could not be read: ${error.message}`);
  return data ? fromRow(data as unknown as ClientRow) : null;
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
  await writeDemoClients([...records, { id, name: clean.name, kind: clean.kind, billingMethod: clean.billingMethod, notes: clean.notes,
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

// Read by the client portal for the client being viewed (a client member reads its own client row; RLS decides).
// False whenever it cannot be read: no switch, no Open in Nexo.
export async function clientNexoAccess(clientId: string): Promise<boolean> {
  if (!live()) return (await readDemoClients())?.find(client => client.id === clientId)?.nexoAccess === true;
  if (!uuid.test(clientId)) return false;
  const { data, error } = await (await admin()).from("client").select("nexo_access").eq("id", clientId).maybeSingle();
  return !error && (data as { nexo_access?: boolean } | null)?.nexo_access === true;
}
