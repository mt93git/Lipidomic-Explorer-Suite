import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getEnvironment } from "../environment";

// The service-role client: the only place that reads SUPABASE_SERVICE_ROLE_KEY (server-only, never NEXT_PUBLIC_).
// It bypasses RLS, so it is used for exactly three things on public pages: on the invitation page, creating the
// invited person's auth user (GoTrue has self sign-up off) and calling admin.accept_invitation; on the Request access
// page, calling admin.submit_access_request (0020). Only service_role may execute those two functions. Returns null in
// demo mode or when the key is not configured.
export function createServiceClient() {
  const env = getEnvironment();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (env.mock || !key) return null;
  return createClient(env.url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { schema: "admin" } });
}

