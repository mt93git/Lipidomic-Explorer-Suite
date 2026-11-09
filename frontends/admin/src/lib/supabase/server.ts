import "server-only";
import { createServerClient } from "@supabase/ssr";
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
