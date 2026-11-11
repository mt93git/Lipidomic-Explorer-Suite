import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getEnvironment } from "../environment";

// The service-role client: the only place that reads SUPABASE_SERVICE_ROLE_KEY (server-only, never NEXT_PUBLIC_).
// It bypasses RLS. On public pages it is used for exactly these: on the invitation page, creating the
// invited person's auth user (GoTrue has self sign-up off) and calling admin.accept_invitation; on the Request access
// page, calling admin.submit_access_request (0020). Only service_role may execute those two functions. The app server
// also writes admin.notification_log with it (0028) and, for People's activation emails, asks GoTrue's admin
// generate_link for a recovery link (data/activation.ts). Returns null in demo mode or when the key is not configured.
export function createServiceClient() {
  const env = getEnvironment();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (env.mock || !key) return null;
  return createClient(env.url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { schema: "admin" } });
}

