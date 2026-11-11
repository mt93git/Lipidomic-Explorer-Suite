import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthResult = { ok: true } | { ok: false; error: string };
type AuthClient = Pick<SupabaseClient, "auth">;

export async function endAppSession(client: AuthClient) {
  return client.auth.signOut({ scope: "local" });
}

export async function authenticate(client: AuthClient, email: string, password: string, code: string): Promise<AuthResult> {
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) return { ok: false, error: "Sign-in failed. Check your email and password." };

  async function fail(error: string): Promise<AuthResult> {
    await endAppSession(client);
    return { ok: false, error };
  }

  try {
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error || !assurance.data) return fail("We could not verify your two-step settings. Please try again.");
    if (assurance.data.nextLevel === "aal2" && assurance.data.currentLevel !== "aal2") {
      if (!/^\d{6}$/.test(code)) return fail("Enter the six-digit two-step code from your authenticator app.");
      const factors = await client.auth.mfa.listFactors();
      if (factors.error) return fail("We could not load your authenticator. Please try again.");
      const factor = factors.data.totp.find(f => f.status === "verified");
      if (!factor) return fail("An app authenticator is required. Contact your administrator.");
      const verification = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (verification.error) return fail("That two-step code was not accepted. Please sign in again.");
    }
    return { ok: true };
  } catch {
    return fail("Sign-in could not be completed. Please try again.");
  }
}

// First enrollment of an app authenticator (TOTP) for a signed-in account without a verified factor: the lab-role
// accounts the session gate sends to /two-step-setup. Unverified leftovers of an abandoned attempt are removed first
// so the account holds at most one pending factor. The QR code and secret go to that person's page only, never a log.
export type Enrollment = { ok: true; factorId: string; qrCode: string; secret: string } | { ok: false; error: string };

export async function startTotpEnrollment(client: AuthClient): Promise<Enrollment> {
  try {
    const factors = await client.auth.mfa.listFactors();
    if (factors.error || !factors.data) return { ok: false, error: "We could not load your two-step settings. Please try again." };
    if (factors.data.all.some(f => f.status === "verified")) return { ok: false, error: "Two-step sign-in is already set up. Sign in again with your code." };
    for (const stale of factors.data.all.filter(f => f.status === "unverified")) await client.auth.mfa.unenroll({ factorId: stale.id });
    const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Lipidomic Explorer Admin" });
    if (enrolled.error || !enrolled.data || enrolled.data.type !== "totp") return { ok: false, error: "We could not start two-step setup. Please try again." };
    return { ok: true, factorId: enrolled.data.id, qrCode: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret };
  } catch {
    return { ok: false, error: "We could not start two-step setup. Please try again." };
  }
}

export async function verifyTotpEnrollment(client: AuthClient, factorId: string, code: string): Promise<AuthResult> {
  if (!factorId) return { ok: false, error: "Start two-step setup again." };
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "Enter the six-digit code from your authenticator app." };
  try {
    const verification = await client.auth.mfa.challengeAndVerify({ factorId, code });
    if (verification.error) return { ok: false, error: "That code was not accepted. Check your authenticator app and try the new code." };
    return { ok: true };
  } catch {
    return { ok: false, error: "That code could not be checked. Please try again." };
  }
}

// ---------------------------------------------------------------- forgotten password (decision 4)
// GoTrue answers /recover the same way whether or not the email has an account and sends the email itself (its SMTP).
// "unavailable" only when this server cannot use GoTrue at all (unreachable, a rejected key): that answer does not
// depend on the email. Every other refusal (a send failure or GoTrue's own per-email limit, which only happen for an
// existing account) is logged by code and answered like a send, so the page never says whether an account exists.
export type ResetRequest = "sent" | "unavailable";
type AuthFailure = { status?: number; code?: string; name?: string } | null;
// Unreachable: no answer, a gateway error (auth-js's retryable error), or GoTrue refusing this server's anon key.
const unreachable = (error: NonNullable<AuthFailure>) => error.name === "AuthRetryableFetchError" || !error.status || error.status === 401;

export async function requestPasswordReset(client: AuthClient, email: string): Promise<ResetRequest> {
  try {
    const { error } = await client.auth.resetPasswordForEmail(email);
    if (!error) return "sent";
    if (unreachable(error)) return "unavailable";
    console.error("[password-reset] recover refused", { status: error.status, code: error.code }); // never the email
    return "sent";
  } catch {
    return "unavailable";
  }
}

// The new password, only on the form's POST: the link's token is spent here, never when the page is opened (mail
// scanners open links). A lab account (a verified authenticator) also gives its two-step code: GoTrue changes the
// password of an account with two-step sign-in only at aal2. The session is ended whatever happens, everywhere when
// the password changed, so the person signs in again with it (lab staff with their code as usual).
// expired: the link was not accepted; unavailable: GoTrue did not answer (the link is unspent); spent: verified, then
// something stopped the change, so the link is used up.
export type ResetResult = { ok: true } | { ok: false; reason: "expired" | "unavailable" | "spent"; error: string };

export async function completePasswordReset(client: AuthClient, tokenHash: string, password: string, code: string): Promise<ResetResult> {
  const verified = await client.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }).catch(() => ({ error: { name: "AuthRetryableFetchError" } }));
  if (verified.error) {
    const error: NonNullable<AuthFailure> = verified.error;
    // GoTrue answers an unknown, used or expired token with 403 otp_expired; it is unchanged when GoTrue is down.
    return unreachable(error) || (error.status ?? 0) >= 500
      ? { ok: false, reason: "unavailable", error: "Password reset is unavailable right now. Please try again in a few minutes." }
      : { ok: false, reason: "expired", error: "This reset link has expired or has already been used." };
  }
  const used = "This link has now been used: ask for a new one.";
  async function fail(error: string): Promise<ResetResult> {
    await endAppSession(client).catch(() => undefined);
    return { ok: false, reason: "spent", error };
  }
  try {
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error || !assurance.data) return fail(`We could not check your two-step settings. ${used}`);
    if (assurance.data.nextLevel === "aal2" && assurance.data.currentLevel !== "aal2") {
      if (!/^\d{6}$/.test(code)) return fail(`Your account uses two-step sign-in: enter the six-digit code with your new password. ${used}`);
      const factor = (await client.auth.mfa.listFactors()).data?.totp.find(f => f.status === "verified");
      if (!factor) return fail(`We could not load your authenticator. ${used}`);
      const verification = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (verification.error) return fail(`That two-step code was not accepted. ${used}`);
    }
    const updated = await client.auth.updateUser({ password });
    if (updated.error) {
      return fail(updated.error.code === "same_password" ? "That is already your password, so nothing changed. Sign in with it."
        : updated.error.code === "weak_password" ? `That password is too easy to guess. ${used}`
        : `Your password could not be changed. ${used}`);
    }
  } catch {
    return fail(`Your password could not be changed. ${used}`);
  }
  const out = await client.auth.signOut({ scope: "global" }).catch(() => ({ error: true }));
  if (out.error) await endAppSession(client).catch(() => undefined);
  return { ok: true };
}
