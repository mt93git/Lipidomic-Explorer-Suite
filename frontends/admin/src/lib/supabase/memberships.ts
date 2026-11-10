import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppSession, Client } from "../models";

// The live identity, read with the user's own token from the same rows RLS uses: admin.lab_staff (lab role)
// and admin.client_member (client memberships). Lab staff (owner, admin, operator) see every client and land
// on the global pipeline; anyone else is a client user limited to their active memberships. Trusted
// app_metadata is no longer consulted, so the screens and the database always agree.
type User = { id: string; email?: string | null };
type Db = Pick<SupabaseClient, "schema">;
type StaffRow = { role: string; display_name: string | null };
type MemberRow = { role: string; client: { id: string; name: string; archived_at: string | null } | { id: string; name: string; archived_at: string | null }[] | null };

const labRoles: Record<string, string> = { owner: "Owner", admin: "Admin", operator: "Operator" };
const clientRoles: Record<string, string> = { client_admin: "Client admin", requester: "Requester", viewer: "Viewer" };
// Same order and colours as listClients (by name) for a client user, whose readable clients are their memberships.
const palette = ["atlas", "cedar", "meridian", "harbor", "juniper"];

export async function sessionFromDatabase(client: Db, user: User): Promise<AppSession> {
  return (await identityFromDatabase(client, user)).session;
}

// labRole: the database key of the user's active admin.lab_staff row ('owner' … 'member'), or null. A lab member is a
// client-view user here but still holds a lab role (the two-step rule, ../two-step.ts, applies to every lab role).
export async function identityFromDatabase(client: Db, user: User): Promise<{ session: AppSession; labRole: string | null }> {
  const db = client.schema("admin");
  const [staff, members, readable] = await Promise.all([
    db.from("lab_staff").select("role, display_name").eq("user_id", user.id).is("archived_at", null),
    db.from("client_member").select("role, client:client(id, name, archived_at)").eq("user_id", user.id).is("archived_at", null),
    // Lab staff scope the overview by any client: RLS lets them read every one.
    db.from("client").select("id, name").is("archived_at", null).order("name"),
  ]);
  if (staff.error) throw new Error(`Lab membership could not be read: ${staff.error.message}`);
  if (members.error) throw new Error(`Client memberships could not be read: ${members.error.message}`);
  if (readable.error) throw new Error(`Clients could not be read: ${readable.error.message}`);
  const own = ((staff.data ?? []) as StaffRow[])[0];
  const labRole = own ? labRoles[own.role] : undefined;
  const clients: Client[] = [];
  for (const row of (members.data ?? []) as unknown as MemberRow[]) {
    const item = Array.isArray(row.client) ? row.client[0] : row.client;
    if (!item || item.archived_at || clients.some(c => c.id === item.id)) continue;
    clients.push({ id: item.id, name: item.name, color: "", role: clientRoles[row.role] ?? "Viewer" });
  }
  clients.sort((a, b) => a.name.localeCompare(b.name)).forEach((c, index) => { c.color = palette[index % palette.length]; });
  const session: AppSession = {
    userId: user.id,
    displayName: own?.display_name || user.email || "Admin user",
    role: labRole ?? "Viewer",
    view: labRole ? "staff" : "client",
    mock: false,
    clients: labRole ? ((readable.data ?? []) as { id: string; name: string }[]).map((row, index) => ({ id: row.id, name: row.name, color: palette[index % palette.length] })) : clients,
    selectedClient: null,
  };
  return { session, labRole: own?.role ?? null };
}
