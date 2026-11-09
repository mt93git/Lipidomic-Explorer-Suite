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
