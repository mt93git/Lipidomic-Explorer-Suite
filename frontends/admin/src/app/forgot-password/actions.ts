"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/access-requests";
import { requestPasswordReset } from "@/lib/auth-service";
import { getEnvironment } from "@/lib/environment";
import { issueDemoResetLink, takeResetLimit, validateResetEmail } from "@/lib/password-reset";
import { createAnonAuthClient } from "@/lib/supabase/server";

// sent: the one neutral answer, whether or not the email has an account. demoLink: the demo's link (no email is sent).
export type ForgotState = { outcome?: "sent" | "limited" | "unavailable"; error?: string; email?: string; demoLink?: string; attempt?: number };

// The public Forgot password form (no session). Order: the email's form, the per-IP/per-email limit, then GoTrue.
export async function forgotPasswordAction(previous: ForgotState, form: FormData): Promise<ForgotState> {
  return { ...await send(String(form.get("email") ?? "").slice(0, 255)), attempt: (previous.attempt ?? 0) + 1 };
}
async function send(input: string): Promise<ForgotState> {
  const checked = validateResetEmail(input);
  if ("error" in checked) return { error: checked.error, email: input };
  // The demo writes nothing and sends nothing, so it is not limited (its end-to-end runs share one address).
  if (getEnvironment().mock) return { outcome: "sent", demoLink: issueDemoResetLink() };
  if (!takeResetLimit(clientIp(await headers()), checked.email)) return { outcome: "limited", email: checked.email };
  const client = createAnonAuthClient();
  const result = client ? await requestPasswordReset(client, checked.email) : "unavailable";
  return result === "sent" ? { outcome: "sent" } : { outcome: "unavailable", email: checked.email };
}
