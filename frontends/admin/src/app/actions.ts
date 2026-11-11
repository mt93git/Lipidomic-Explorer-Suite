"use server";

import { cookies, headers } from "next/headers";
import { clientIp } from "@/lib/access-requests";
import { redirectAfterAction } from "@/lib/action-redirect";
import { getEnvironment } from "@/lib/environment";
import { endSignedInSession, startAppSession } from "@/lib/app-sign-in";
import { nexoReturnPath, signInNext } from "@/lib/return-path";
import { getAppSession } from "@/lib/session";
import { selectClient } from "@/lib/session-model";
import { clientCookie, preferenceCookieOptions, signedOutCookie, viewCookie } from "@/lib/auth-cookies";

// next: a Nexo path to leave the app for after signing in (the form navigates the browser there).
export type SignInState = { error?: string; next?: string };

export async function signIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  if (getEnvironment().mock) return { error: "Use Enter example workspace to review the demo. No credentials are needed." };
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const code = String(form.get("code") ?? "").trim();
  if (!email || !password) return { error: "Enter your email and password." };
  // Also discards a previous account's client preference before this account's memberships are resolved.
  const result = await startAppSession(email, password, code, clientIp(await headers()));
  if (!result.ok) return { error: result.error };
  // An invitation link (an existing account signing in to accept it) or a Nexo path; nothing else is followed.
  const next = signInNext(String(form.get("next") ?? ""));
  if (next && nexoReturnPath(next)) return { next };
  return redirectAfterAction(next ?? "/choose-client");
}

// The example workspace as lab staff (default) or as the example client user (view=client).
export async function enterDemo(form?: FormData) {
  if (!getEnvironment().mock) return redirectAfterAction("/sign-in");
  const store = await cookies();
  store.set(signedOutCookie, "", { ...preferenceCookieOptions, maxAge: 0 });
  store.set(clientCookie, "", { ...preferenceCookieOptions, maxAge: 0 });
  const client = form?.get("view") === "client";
  store.set(viewCookie, client ? "client" : "staff", preferenceCookieOptions);
  return redirectAfterAction("/choose-client");
}

export async function signOut() {
  if (!await endSignedInSession(getEnvironment().mock)) return redirectAfterAction("/sign-in?error=sign-out");
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
