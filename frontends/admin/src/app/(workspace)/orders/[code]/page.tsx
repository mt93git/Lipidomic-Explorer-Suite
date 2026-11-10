import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { getOrder, listPanels } from "@/lib/data/orders";
import { getClientOrder } from "@/lib/data/client-orders";
import { getShippingInstructions } from "@/lib/data/order-requests";
import { stepOf } from "@/lib/client-portal";
import { isPending, mayRequestOrders } from "@/lib/order-request";
import { OrderDetail } from "@/components/order-detail";
import { ClientOrderDetail } from "@/components/client-order-detail";
import { LabDeliverables } from "@/components/deliverables";
import { listClientDeliverables, listOrderDeliverables } from "@/lib/data/deliverables";
import { clientNexoAccess } from "@/lib/data/clients";

// Lab staff open any order with the lab's detail; a client request still waiting gets the accept/decline panel instead
// of the next gate. A client user gets the client view (six steps, no gate checks, batches or staff names) and opens
// only orders of their selected client (or of their memberships). In live mode RLS already hides other clients'
// orders; the membership filter is the same rule for demo mode and a second guard.
export default async function OrderPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ answered?: string; deliverable?: string }> }) {
  const session = await requireWorkspace("all");
  const { code } = await params;
  if (session.view === "client") {
    const reach = session.selectedClient ? [session.selectedClient] : session.clients;
    const order = await getClientOrder(code, reach.map(client => client.id));
    if (!order) notFound();
    const client = reach.find(item => item.id === order.clientId);
    // The shipping instructions matter only while the client has to ship (2 · Accepted).
    const shipping = order.review === "accepted" && stepOf(order) === 2 ? (await getShippingInstructions())?.text ?? null : null;
    // F4: the files the lab shows this client, and the lab's per-client Nexo switch.
    const [files, nexoAccess] = await Promise.all([listClientDeliverables(code, [order.clientId]), clientNexoAccess(order.clientId)]);
    return <ClientOrderDetail order={order} clientName={client?.name ?? "Your client"} example={session.mock} shipping={shipping} mayRequest={mayRequestOrders(client?.role)}
      files={files} nexoAccess={nexoAccess} />;
  }
  const found = await getOrder(code);
  if (!found) notFound();
  const panels = isPending(found.order) ? await listPanels() : [];
  const [{ answered, deliverable }, files] = await Promise.all([searchParams, listOrderDeliverables(code)]);
  const pending = isPending(found.order);
  return <>
    <OrderDetail order={found.order} client={found.client} audience={session.view} example={session.mock} panels={panels} accepted={answered === "accepted"} />
    {(!pending || files.items.length > 0) && <LabDeliverables code={code} items={files.items} dataset={files.dataset} open={files.open} notice={deliverable} example={session.mock} />}
  </>;
}
