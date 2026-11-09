import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { getOrder } from "@/lib/data/orders";
import { OrderDetail } from "@/components/order-detail";

// Lab staff open any order; a client user opens only orders of their selected client (or of their memberships).
// In live mode RLS already hides other clients' orders (getOrder returns null); the membership check below is
// the same rule for demo mode and a second guard in live.
export default async function OrderPage({ params }: { params: Promise<{ code: string }> }) {
  const session = await requireWorkspace("all");
  const { code } = await params;
  const found = await getOrder(code);
  const reach = session.selectedClient ? [session.selectedClient] : session.clients;
  if (!found || (session.view === "client" && !reach.some(client => client.id === found.order.clientId))) notFound();
  return <OrderDetail order={found.order} client={found.client} audience={session.view} example={session.mock} />;
}
