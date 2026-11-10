"use server";

import { cookies } from "next/headers";
import { redirectAfterAction } from "@/lib/action-redirect";
import { getEnvironment } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/server";
import { authenticate, endAppSession } from "@/lib/auth-service";
import { getAppSession } from "@/lib/session";
import { selectClient } from "@/lib/session-model";
import { clientCookie, preferenceCookieOptions, signedOutCookie, viewCookie } from "@/lib/auth-cookies";

export type SignInState = { error?: string };

export async function signIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  if (getEnvironment().mock) return { error: "Use Enter example workspace to review the demo. No credentials are needed." };
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const code = String(form.get("code") ?? "").trim();
  if (!email || !password) return { error: "Enter your email and password." };
  const client = await createAdminClient();
  if (!client) return { error: "Sign-in is unavailable. Please try again." };
  try {
    const result = await authenticate(client, email, password, code);
    if (!result.ok) return { error: result.error };
  } catch {
    return { error: "The sign-in service is unavailable. Please try again." };
  }
  // Discard a previous account's preference before resolving this account's memberships.
  (await cookies()).set(clientCookie, "", { ...preferenceCookieOptions, maxAge: 0 });
  // An existing account signing in to accept an invitation returns to that link; nothing else is followed.
  const next = String(form.get("next") ?? "");
  return redirectAfterAction(/^\/invite\/[0-9a-f]{64}$/.test(next) ? next : "/choose-client");
}

export async function enterDemo() {
  if (!getEnvironment().mock) return redirectAfterAction("/sign-in");
  const store = await cookies();
  store.set(signedOutCookie, "", { ...preferenceCookieOptions, maxAge: 0 });
  return redirectAfterAction("/choose-client");
}

export async function signOut() {
  const env = getEnvironment();
  if (!env.mock) {
    const client = await createAdminClient();
    if (client) {
      const { error } = await endAppSession(client);
      if (error) return redirectAfterAction("/sign-in?error=sign-out");
    }
  }
  const store = await cookies();
  store.set(signedOutCookie, "1", preferenceCookieOptions);
  store.set(clientCookie, "", { ...preferenceCookieOptions, maxAge: 0 });
  store.set(viewCookie, "", { ...preferenceCookieOptions, maxAge: 0 });
  return redirectAfterAction("/sign-in");
}

export async function switchView(form: FormData) {
  if (!getEnvironment().mock) return redirectAfterAction("/");
  if (!await getAppSession()) return redirectAfterAction("/sign-in");
  const view = form.get("view") === "client" ? "client" : "staff";
  (await cookies()).set(viewCookie, view, preferenceCookieOptions);
  return redirectAfterAction(view === "client" ? "/choose-client" : "/pipeline");
}

export async function chooseClient(form: FormData) {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  const selected = selectClient(session.clients, String(form.get("clientId") ?? ""));
  if (!selected) return redirectAfterAction("/choose-client?error=membership");
  // Staff never persist a client: the overview is filtered through its URL instead.
  if (session.view === "staff") return redirectAfterAction(`/pipeline?client=${encodeURIComponent(selected.id)}`);
  (await cookies()).set(clientCookie, selected.id, preferenceCookieOptions);
  return redirectAfterAction("/client/home");
}
