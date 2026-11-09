import { notFound } from "next/navigation";
import { findRoute } from "@/lib/navigation";
import { requireWorkspace } from "@/lib/session";
import { Placeholder } from "@/components/placeholder";

export default async function PlaceholderPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const route = findRoute(`/${path.join("/")}`);
  if (!route) notFound();
  const session = await requireWorkspace(route.audience);
  return <Placeholder title={route.label} phase={route.phase} description={route.description} homeHref={session.view === "staff" ? "/pipeline" : "/client/home"} />;
}
