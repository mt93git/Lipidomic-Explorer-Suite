import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/session";

export const dynamic = "force-dynamic";
export default async function Home() {
  const session = await requireWorkspace();
  redirect(session.view === "staff" ? "/pipeline" : "/client/home");
}
