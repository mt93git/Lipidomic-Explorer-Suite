import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { appCookieScope, authCookieOptions } from "../auth-cookies";
import { getEnvironment } from "../environment";
import { isSessionTokenPath } from "../session-token";

export async function updateSession(request: NextRequest) {
  const env = getEnvironment();
  let response = NextResponse.next({ request });
  // Authenticated pages must never enter a shared gateway/CDN cache. The session-token route's contract is exactly
  // no-store (docs/integration/admin-identity.md); the middleware's header would otherwise replace the route's.
  const cacheControl = isSessionTokenPath(request.nextUrl.pathname) ? "no-store" : "private, no-store";
  response.headers.set("Cache-Control", cacheControl);
  if (env.mock) return response;
  const client = createServerClient(env.url, env.anonKey, {
    db: { schema: "admin" },
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, ...appCookieScope }));
        if (headers) Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        response.headers.set("Cache-Control", cacheControl);
      },
    },
  });
  // getUser verifies against Auth and refreshes when necessary; never trust getSession alone.
  await client.auth.getUser();
  return response;
}
