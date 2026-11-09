import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  return <AppShell session={session}>{children}</AppShell>;
}
