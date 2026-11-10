import type { NextRequest } from "next/server";
import { getAppSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { sessionTokenResponse, tokenSubject, type SessionToken } from "@/lib/session-token";

// GET /admin/api/session-token (docs/integration/admin-identity.md). The middleware has already refreshed the session
// like on any page (getUser, new cookies on this response). getAppSession verifies the user with Auth, requires the
// second factor when one is enrolled and reads the view from admin.lab_staff / admin.client_member; the access token
// comes from the same cookie-backed client and its subject must be that user. Demo mode has no GoTrue session: signed_out.
export const dynamic = "force-dynamic";

async function signedInToken(): Promise<SessionToken | null> {
  const session = await getAppSession();
  if (!session) return null;
  const client = await createAdminClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  const stored = data?.session;
  if (error || !stored?.access_token || typeof stored.expires_at !== "number" || tokenSubject(stored.access_token) !== session.userId) return null;
  // AppSession.displayName may contain an e-mail fallback. Nexo receives only the stored profile name.
  let displayName: string | null = null;
  if (session.view === "staff" || session.selectedClient) {
    let profile = client.schema("admin").from(session.view === "staff" ? "lab_staff" : "client_member")
      .select("display_name").eq("user_id", session.userId).is("archived_at", null);
    if (session.view === "client") profile = profile.eq("client_id", session.selectedClient!.id);
    const { data: person, error: profileError } = await profile.maybeSingle();
    if (profileError) throw new Error("Profile could not be read");
    displayName = person?.display_name ?? null;
  }
  return { accessToken: stored.access_token, expiresAt: stored.expires_at, userId: session.userId, view: session.view, displayName };
}

export function GET(request: NextRequest) {
  return sessionTokenResponse(request.headers, signedInToken);
}
