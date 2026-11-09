import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

// Next 16 "proxy" (formerly middleware); it always runs on the Node.js runtime.
export function proxy(request: NextRequest) {
  return updateSession(request);
}

// Next.js prepends basePath to this matcher automatically.
export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
