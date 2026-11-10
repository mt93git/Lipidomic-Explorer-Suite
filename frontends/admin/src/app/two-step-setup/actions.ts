"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { startTotpEnrollment, verifyTotpEnrollment } from "@/lib/auth-service";
import { needsTwoStepEnrollment } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";

export type TwoStepSetupState = { factorId?: string; qrCode?: string; secret?: string; error?: string };

// One action for both steps of /two-step-setup: without a factorId it starts the enrollment (QR code + secret); with
// one it verifies the six-digit code, which raises the session to aal2, and continues to the workspace. Only a session
// the gate sends here (a lab-role account with no verified factor) may enroll.
export async function twoStepSetupAction(previous: TwoStepSetupState, form: FormData): Promise<TwoStepSetupState> {
  if (!await needsTwoStepEnrollment()) return redirectAfterAction("/");
  const client = await createAdminClient();
  if (!client) return redirectAfterAction("/sign-in");
  const factorId = String(form.get("factorId") ?? "");
  if (!factorId) {
    const started = await startTotpEnrollment(client);
    return started.ok ? { factorId: started.factorId, qrCode: started.qrCode, secret: started.secret } : { error: started.error };
  }
  const result = await verifyTotpEnrollment(client, factorId, String(form.get("code") ?? "").trim());
  if (!result.ok) return { ...previous, error: result.error };
  return redirectAfterAction("/choose-client");
}
