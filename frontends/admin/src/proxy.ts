import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

// Next 16 "proxy" (formerly middleware); it always runs on the Node.js runtime.
export function proxy(request: NextRequest) {
  return updateSession(request);
}

// Next.js prepends basePath to this matcher automatically. The deliverable upload route (POST, up to 50 MB) is left
// out: the proxy would buffer its body and cut it at 10 MB (proxyClientMaxBodySize). That route checks the session
// itself, and the Supabase client it uses refreshes the token like the proxy does.
export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico|orders/[^/]+/deliverables$).*)"],
};
