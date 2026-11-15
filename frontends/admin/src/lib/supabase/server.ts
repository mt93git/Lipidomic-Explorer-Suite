import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getEnvironment } from "../environment";
import { appCookieScope, authCookieOptions } from "../auth-cookies";

export async function createAdminClient() {
  const env = getEnvironment();
  if (env.mock) return null;
  const store = await cookies();
  return createServerClient(env.url, env.anonKey, {
    db: { schema: "admin" },
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => store.set(name, value, { ...options, ...appCookieScope }));
        } catch {
          // RSC reads cannot write cookies; middleware persists refreshed tokens.
        }
      },
    },
  });
}

// No session and no cookies, for the public Forgot password request: the implicit flow, so GoTrue's link carries a
// plain token hash and no PKCE code verifier is left in the requester's browser.
export function createAnonAuthClient() {
  const env = getEnvironment();
  if (env.mock) return null;
  return createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: "implicit" } });
}
