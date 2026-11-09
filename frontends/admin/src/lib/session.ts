import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "./supabase/server";
import { getEnvironment } from "./environment";
import { demoSession } from "./demo";
import { clientCookie, signedOutCookie, viewCookie } from "./auth-cookies";
import { selectClient } from "./session-model";
import { sessionFromDatabase } from "./supabase/memberships";
import type { AppSession } from "./models";

export const getAppSession = cache(async (): Promise<AppSession | null> => {
  const store = await cookies();
  if (getEnvironment().mock) {
    if (store.get(signedOutCookie)?.value === "1") return null;
    const view = store.get(viewCookie)?.value === "client" ? "client" : "staff";
    // Staff work across all clients (the overview filters by URL); only client users carry a selected client.
    const selectedClient = view === "client" ? selectClient(demoSession.clients, store.get(clientCookie)?.value) : null;
    return { ...demoSession, view, selectedClient, role: view === "staff" ? "Operator" : selectedClient?.role ?? "Client admin" };
  }
  const client = await createAdminClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || !assurance.data || (assurance.data.nextLevel === "aal2" && assurance.data.currentLevel !== "aal2")) return null;
  // Lab role and client memberships come from admin.lab_staff / admin.client_member through this user's token.
  const session = await sessionFromDatabase(client, data.user);
  const selectedClient = session.view === "client"
    ? selectClient(session.clients, store.get(clientCookie)?.value) ?? (session.clients.length === 1 ? session.clients[0] : null)
    : null;
  return { ...session, selectedClient, role: session.view === "client" ? selectedClient?.role ?? "Viewer" : session.role };
});

export async function requireSession() {
  const session = await getAppSession();
  if (!session) redirect("/sign-in");
  return session;
}

export async function requireWorkspace(audience: "staff" | "client" | "all" = "all") {
  const session = await requireSession();
  if (audience === "staff" && session.view !== "staff") redirect("/client/home");
  if (session.view === "client" && session.clients.length > 1 && !session.selectedClient) redirect("/choose-client");
  return session;
}
