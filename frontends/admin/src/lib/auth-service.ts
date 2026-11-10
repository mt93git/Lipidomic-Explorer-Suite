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
