import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return updateSession(request);
}

// Next.js prepends basePath to this matcher automatically.
export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
  runtime: "nodejs",
};
