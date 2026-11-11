import { DELIVERABLE_MAX_BYTES } from "./deliverables";
import { labRoleKey } from "./roles";
import type { AppSession } from "./models";

// The upload route's guard, before it reads the body: signed in, lab staff with a writer role, a valid order code, a
// same-origin request (a route handler gets no server-action origin check; the auth cookie is SameSite=Lax, which
// already keeps it off a cross-site POST), and a body that can be at most one deliverable plus its form fields.
export type UploadDecision = "ok" | "sign-in" | "forbidden" | "not-found" | "size";
const FORM_OVERHEAD = 64 * 1024;
export function uploadTarget(input: { session: Pick<AppSession, "view" | "role"> | null; code: string | null; origin: string | null; host: string | null; length: number }): UploadDecision {
  if (!input.session) return "sign-in";
  const role = labRoleKey(input.session.role);
  if (input.session.view !== "staff" || (role !== "owner" && role !== "admin" && role !== "operator")) return "forbidden";
  let sameOrigin = false;
  try { sameOrigin = Boolean(input.origin && input.host && new URL(input.origin).host === input.host); } catch { sameOrigin = false; }
  if (!sameOrigin) return "forbidden";
  if (!input.code) return "not-found";
  if (input.length > DELIVERABLE_MAX_BYTES + FORM_OVERHEAD) return "size";
  return "ok";
}
