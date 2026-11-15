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

// Where a page for this audience sends a session that may not see it, or null when it may. Client users never reach
// a lab screen (sent to Client home); lab staff have no client portal (sent to the pipeline); a client user with
// several memberships chooses one first.
export type Audience = "staff" | "client" | "all";
export function workspaceRedirect(session: Pick<AppSession, "view" | "clients" | "selectedClient">, audience: Audience): string | null {
  if (audience === "staff" && session.view !== "staff") return "/client/home";
  if (audience === "client" && session.view === "staff") return "/pipeline";
  if (session.view === "client" && session.clients.length > 1 && !session.selectedClient) return "/choose-client";
  return null;
}
