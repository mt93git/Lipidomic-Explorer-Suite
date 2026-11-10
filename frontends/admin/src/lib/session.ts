import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "./supabase/server";
import { getEnvironment } from "./environment";
import { demoSession } from "./demo";
import { clientCookie, signedOutCookie, viewCookie } from "./auth-cookies";
import { selectClient } from "./session-model";
import { identityFromDatabase } from "./supabase/memberships";
import { twoStepState } from "./two-step";
import type { AppSession } from "./models";

// The live sign-in, checked once per request: the verified user, their second factor and their memberships.
// enroll: a lab-role account at aal1 with no verified factor (two-step.ts). It gets no app session, so no workspace
// page, server action or session token works for it until it enrolls at /two-step-setup.
const liveAuth = cache(async (): Promise<{ session: AppSession | null; enroll: boolean }> => {
  const none = { session: null, enroll: false };
  const client = await createAdminClient();
  if (!client) return none;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return none;
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || !assurance.data) return none;
  // Lab role and client memberships come from admin.lab_staff / admin.client_member through this user's token.
  const { session, labRole } = await identityFromDatabase(client, data.user);
  const state = twoStepState(assurance.data, labRole !== null);
  if (state !== "ok") return { session: null, enroll: state === "enroll" };
  const store = await cookies();
  const selectedClient = session.view === "client"
    ? selectClient(session.clients, store.get(clientCookie)?.value) ?? (session.clients.length === 1 ? session.clients[0] : null)
    : null;
  return { session: { ...session, selectedClient, role: session.view === "client" ? selectedClient?.role ?? "Viewer" : session.role }, enroll: false };
});

export const getAppSession = cache(async (): Promise<AppSession | null> => {
  if (getEnvironment().mock) {
    const store = await cookies();
    if (store.get(signedOutCookie)?.value === "1") return null;
    const view = store.get(viewCookie)?.value === "client" ? "client" : "staff";
    // Staff work across all clients (the overview filters by URL); only client users carry a selected client.
    const selectedClient = view === "client" ? selectClient(demoSession.clients, store.get(clientCookie)?.value) : null;
    return { ...demoSession, view, selectedClient, role: view === "staff" ? "Operator" : selectedClient?.role ?? "Client admin" };
  }
  return (await liveAuth()).session;
});

// True for a signed-in lab-role account that still has to enroll its app authenticator (never in demo mode).
export async function needsTwoStepEnrollment() {
  return !getEnvironment().mock && (await liveAuth()).enroll;
}

export async function requireSession() {
  const session = await getAppSession();
  if (!session) redirect(await needsTwoStepEnrollment() ? "/two-step-setup" : "/sign-in");
  return session;
}

export async function requireWorkspace(audience: "staff" | "client" | "all" = "all") {
  const session = await requireSession();
  if (audience === "staff" && session.view !== "staff") redirect("/client/home");
  if (session.view === "client" && session.clients.length > 1 && !session.selectedClient) redirect("/choose-client");
  return session;
}
