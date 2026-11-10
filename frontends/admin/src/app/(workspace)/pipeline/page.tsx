import type { Metadata } from "next";
import { PipelineOverview } from "@/components/pipeline-overview";
import { requireWorkspace } from "@/lib/session";
import { listClients, listOrders } from "@/lib/data/orders";

export const metadata: Metadata = { title: "Pipeline" };

// Filters live in the URL (client, stage, focus, panel, owner, q, group); the client component parses them.
// Live mode reads the orders and clients through the signed-in user's token (RLS); demo mode uses the examples.
// ?declined=ORD059 after the lab declines a client request (the order is archived and leaves the board).
export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ declined?: string }> }) {
  await requireWorkspace("staff");
  const { declined } = await searchParams;
  const [orders, clients] = await Promise.all([listOrders(), listClients()]);
  return <PipelineOverview orders={orders} clients={clients} audience="staff" today={new Date().toISOString()}
    declined={declined && /^ORD\d{3,}$/.test(declined) ? declined : null} />;
}
