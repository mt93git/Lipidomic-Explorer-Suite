import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { pendingAccessCount } from "@/lib/data/access-requests";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  // Waiting work shown next to a sidebar item: access requests next to People (lab Owner and Admin).
  const counts: Record<string, number> = session.view === "staff" ? { "/people": await pendingAccessCount() } : {};
  // NEXO_API_BASE (server, read per request): the same-origin path of Nexo's API the client companion's chat calls,
  // "/api" in production, "/nexo-staging/api" on staging. Only a path is accepted, so the token never leaves the origin.
  const nexoApiBase = /^\/[^/\\]/.test(process.env.NEXO_API_BASE?.trim() ?? "") ? process.env.NEXO_API_BASE!.trim() : "/api";
  return <AppShell session={session} counts={counts} nexoApiBase={nexoApiBase}>{children}</AppShell>;
}
