import type { Metadata } from "next";
import Link from "@/components/app-link";
import { listClients, listPanels } from "@/lib/data/orders";
import { requireWorkspace } from "@/lib/session";
import { NewOrderForm } from "./new-order-form";

export const metadata: Metadata = { title: "New order" };

// ?created=ORD055 after a successful create: the code and the next steps, above a fresh form for another order.
export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  await requireWorkspace("staff");
  const { created } = await searchParams;
  const code = created && /^ORD\d{3,}$/.test(created) ? created : null;
  const [clients, panels] = await Promise.all([listClients(), listPanels()]);
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / New order</div>
        <h1>New order</h1>
        <p>Open an order for a client: the panel, a title, the matrix and how many samples to expect. It starts at Request; the samples are registered when the shipment arrives.</p>
      </div>
      <Link className="button secondary" href="/pipeline">← Back to pipeline</Link>
    </div>
    {code && <p className="notice success" role="status">
      <strong>Order <span className="mono">{code}</span> created.</strong> It is at Request, waiting for its shipment.
      <Link className="button" href={`/receive-shipment?order=${code}`}>Receive shipment →</Link>
      <Link className="button secondary" href={`/orders/${code}`}>Open order →</Link>
    </p>}
    <section className="panel" aria-labelledby="order-form-title">
      <div className="eyebrow">Order record</div>
      <h2 id="order-form-title">{code ? "Another order" : "What is requested"}</h2>
      {clients.length && panels.length
        ? <NewOrderForm key={code ?? "new"} clients={clients} panels={panels} />
        : <p className="empty-state">{clients.length ? "No active panel exists yet." : "No active client exists yet."} An order needs both.</p>}
    </section>
  </>;
}
