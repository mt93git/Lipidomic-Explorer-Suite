import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { pendingAccessCount } from "@/lib/data/access-requests";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  // Waiting work shown next to a sidebar item: access requests next to People (lab Owner and Admin).
  const counts: Record<string, number> = session.view === "staff" ? { "/people": await pendingAccessCount() } : {};
  return <AppShell session={session} counts={counts}>{children}</AppShell>;
}
