"use server";

import { headers } from "next/headers";
import { clientIp, takeAccessLimit, validateAccessForm, type AccessForm, type AccessFormErrors, type AccessOutcome } from "@/lib/access-requests";
import { AccessRefusal, DataError, submitAccessRequest } from "@/lib/data/access-requests";
import { getEnvironment } from "@/lib/environment";

// attempt: counts sends, so the form re-mounts with the typed values after each refusal.
export type RequestAccessState = { outcome?: AccessOutcome; errors?: AccessFormErrors; values?: AccessForm; attempt?: number };
const field = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").slice(0, max + 1);

// The public Request access form (no session). Order matters: the trap field, then the fields, then the
// per-IP/per-email limit, then the database. "sent" and "pending" never depend on whether the email has an account.
export async function requestAccessAction(previous: RequestAccessState, form: FormData): Promise<RequestAccessState> {
  return { ...await send(form), attempt: (previous.attempt ?? 0) + 1 };
}
async function send(form: FormData): Promise<RequestAccessState> {
  const values: AccessForm = {
    fullName: field(form, "fullName", 200), email: field(form, "email", 254), organisation: field(form, "organisation", 200),
    kind: field(form, "kind", 40), message: field(form, "message", 2000),
  };
  // A field people never see: only a script fills it. It is told the request was received, and nothing is stored.
  if (String(form.get("website") ?? "").trim()) return { outcome: { kind: "sent", email: values.email.trim().toLowerCase(), reference: null } };
  const checked = validateAccessForm(values);
  if ("errors" in checked) return { errors: checked.errors, values };
  // The demo writes only to this browser's in-memory records, so it is not limited (its end-to-end runs share one address).
  if (!getEnvironment().mock && !takeAccessLimit(clientIp(await headers()), checked.values.email)) return { outcome: { kind: "limited" }, values };
  try {
    return { outcome: { kind: "sent", email: checked.values.email, reference: await submitAccessRequest(checked.values) } };
  } catch (error) {
    if (error instanceof AccessRefusal) return error.code === "pending" ? { outcome: { kind: "pending", email: checked.values.email } } : { outcome: { kind: "full" }, values };
    if (error instanceof DataError) return { outcome: { kind: "unavailable" }, values };
    throw error;
  }
}
