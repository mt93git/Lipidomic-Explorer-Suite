"use server";

import { cookies } from "next/headers";
import { redirectAfterAction } from "@/lib/action-redirect";
import { clientCookie, preferenceCookieOptions, signedOutCookie, viewCookie } from "@/lib/auth-cookies";
import { completePasswordReset } from "@/lib/auth-service";
import { getEnvironment } from "@/lib/environment";
import { isTokenHash, spendDemoResetLink, validateNewPassword } from "@/lib/password-reset";
import { createAdminClient } from "@/lib/supabase/server";

// expired: the link cannot be used (show the way back to Forgot password); spent: it was used up by this attempt.
export type ResetState = { error?: string; expired?: boolean; spent?: boolean; attempt?: number };
const expired: ResetState = { expired: true };

// The Reset password form's POST (and the Activate page's, purpose=activate: the same link and steps, only the words and
// the sign-in banner differ): the only place the link's token is checked and spent. The password rules come
// first so a typo does not use up the link. The password goes to GoTrue only and is never stored or logged.
export async function resetPasswordAction(previous: ResetState, form: FormData): Promise<ResetState> {
  const attempt = (previous.attempt ?? 0) + 1;
  const token = form.get("token_hash");
  if (!isTokenHash(token)) return { ...expired, attempt };
  const password = String(form.get("password") ?? "");
  const problem = validateNewPassword(password, String(form.get("confirm") ?? ""));
  if (problem) return { error: problem, attempt };
  if (getEnvironment().mock) {
    if (!spendDemoResetLink(token)) return { ...expired, attempt };
  } else {
    const client = await createAdminClient();
    if (!client) return { error: "Password reset is unavailable right now. Please try again in a few minutes.", attempt };
    const result = await completePasswordReset(client, token, password, String(form.get("code") ?? "").trim());
    if (!result.ok) return result.reason === "expired" ? { ...expired, attempt } : { error: result.error, spent: result.reason === "spent", attempt };
  }
  // Signed out on this browser too (the demo's session is these cookies), with no client or view left over.
  const store = await cookies();
  store.set(signedOutCookie, "1", preferenceCookieOptions);
  store.set(clientCookie, "", { ...preferenceCookieOptions, maxAge: 0 });
  store.set(viewCookie, "", { ...preferenceCookieOptions, maxAge: 0 });
  return redirectAfterAction(form.get("purpose") === "activate" ? "/sign-in?activated=done" : "/sign-in?reset=done");
}
