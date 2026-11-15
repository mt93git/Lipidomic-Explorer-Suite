import "server-only";

type AdminEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  ADMIN_MOCK?: string;
};

export function getEnvironment(env: AdminEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ADMIN_MOCK: process.env.ADMIN_MOCK,
}) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  return { url, anonKey, mock: env.ADMIN_MOCK === "1" || !url || !anonKey };
}
