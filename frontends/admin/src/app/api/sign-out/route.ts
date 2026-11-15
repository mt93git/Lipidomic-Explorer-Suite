import type { NextRequest } from "next/server";
import { endSignedInSession } from "@/lib/app-sign-in";
import { getEnvironment } from "@/lib/environment";
import { noStoreJson, sameOriginRequest } from "@/lib/session-token";

// POST <base path>/api/sign-out: Nexo's Sign out ends the Admin session exactly as Admin's own sign-out does. 204;
// 503 {error: unavailable} when GoTrue could not end it (it may still be active); 403 cross_origin.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameOriginRequest(request.headers)) return noStoreJson(403, { error: "cross_origin" });
  if (!await endSignedInSession(getEnvironment().mock)) return noStoreJson(503, { error: "unavailable" });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
