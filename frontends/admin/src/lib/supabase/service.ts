import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getEnvironment } from "../environment";

// The service-role client: the only place that reads SUPABASE_SERVICE_ROLE_KEY (server-only, never NEXT_PUBLIC_).
// It bypasses RLS, so it is used for exactly two things on the public invitation page: creating the invited
// person's auth user (GoTrue has self sign-up off) and calling admin.accept_invitation, which only service_role may
// execute. Returns null in demo mode or when the key is not configured.
export function createServiceClient() {
  const env = getEnvironment();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (env.mock || !key) return null;
  return createClient(env.url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { schema: "admin" } });
}

