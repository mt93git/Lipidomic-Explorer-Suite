import type { AppSession, Client } from "./models";

type AuthUser = { id: string; app_metadata: Record<string, unknown>; user_metadata?: Record<string, unknown> };
const staffRoles = ["Owner", "Admin", "Operator"];
const clientRoles = ["Client admin", "Requester", "Viewer"];

export function selectClient(clients: Client[], id?: string): Client | null {
  return clients.find(client => client.id === id) ?? null;
}

export function sessionFromUser(user: AuthUser): AppSession {
  const claims = user.app_metadata.admin;
  const admin = claims && typeof claims === "object" ? claims as Record<string, unknown> : {};
  const role = typeof admin.lab_role === "string" && staffRoles.includes(admin.lab_role) ? admin.lab_role : "Viewer";
  const clients: Client[] = [];
  if (Array.isArray(admin.clients)) {
    for (const item of admin.clients) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.name !== "string") continue;
      if (clients.some(c => c.id === item.id)) continue;
      clients.push({ id: item.id, name: item.name, color: "atlas", role: clientRoles.includes(item.role) ? item.role : "Viewer" });
    }
  }
  return {
    userId: user.id,
    displayName: typeof admin.display_name === "string" ? admin.display_name : "Admin user",
    role, view: staffRoles.includes(role) ? "staff" : "client", mock: false, clients, selectedClient: null,
  };
}
