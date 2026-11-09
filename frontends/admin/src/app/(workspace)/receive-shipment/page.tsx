import type { Metadata } from "next";
import Link from "next/link";
import { ReceiveShipmentForm } from "@/components/receive-shipment-form";
import { getRegistryOrder, listReceivableOrders } from "@/lib/data/samples";
import { formatLabInstant } from "@/lib/lab-time";
import { stages } from "@/lib/models";
import { plural } from "@/lib/samples";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Receive shipment" };

// ?order=ORD042 preselects an order; the form mirrors its choice back into the URL so the facts follow.
export default async function ReceiveShipmentPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  await requireWorkspace("staff");
  const { order: code } = await searchParams;
  const orders = await listReceivableOrders();
  const selected = code ? orders.find(order => order.code === code) ?? null : null;
  // Asked for an order that is no longer waiting: say where it is instead of showing a form that cannot apply.
  const elsewhere = code && !selected ? await getRegistryOrder(code) : null;
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / Receive shipment</div>
        <h1>Receive shipment</h1>
        <p>Record how an order&apos;s samples arrived: carrier, tracking, condition and boxes. The order moves from Request to Received and its sample registry opens.</p>
      </div>
      <Link className="button secondary" href="/pipeline">← Back to pipeline</Link>
    </div>
    {elsewhere && <p className="notice" role="status">
      {elsewhere.order.code} is already {stages[elsewhere.order.stage]}{elsewhere.shipment?.receivedAt ? `, received ${formatLabInstant(elsewhere.shipment.receivedAt)}` : ""}. <Link href={`/sample-registry?order=${elsewhere.order.code}`}>Open its sample registry</Link>.
    </p>}
    {code && !selected && !elsewhere && <p className="notice" role="status">No order {code} is waiting to arrive. Choose one below.</p>}
    <div className="detail-grid">
      <section className="panel" aria-labelledby="arrival-title">
        <div className="eyebrow">Arrival record</div>
        <h2 id="arrival-title">What arrived</h2>
        {orders.length
          ? <ReceiveShipmentForm orders={orders} selected={selected?.code ?? null} />
          : <p className="empty-state">No orders are waiting to arrive. Orders appear here as soon as they are requested.</p>}
      </section>
      <div>
        <section className="panel" aria-labelledby="order-title">
          <div className="eyebrow">{selected ? "Order at a glance" : "Waiting to arrive"}</div>
          <h2 id="order-title">{selected ? selected.code : plural(orders.length, "order")}</h2>
          {selected
            ? <dl className="facts">
              {[["Client", selected.clientName], ["Description", selected.description], ["Stage", stages[selected.stage]], ["Expected samples", selected.expectedSamples === null ? "Not stated" : String(selected.expectedSamples)], ["Material", selected.sampleType ?? "Not stated"]]
                .map(([label, value]) => <div className="fact-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
            : <ul className="order-list compact" aria-label="Orders waiting to arrive">
              {orders.map(order => <li key={order.id}><Link className="order-choice" href={`/receive-shipment?order=${order.code}`}>
                <span className="order-code">{order.code}</span>{order.description}<small>{order.clientName}{order.expectedSamples === null ? "" : ` · ${plural(order.expectedSamples, "sample")} expected`}</small>
              </Link></li>)}
              {!orders.length && <li className="muted">Nothing is waiting.</li>}
            </ul>}
        </section>
        <section className="panel" aria-labelledby="next-title">
          <div className="eyebrow">Then</div>
          <h2 id="next-title">Register the samples</h2>
          <p className="muted">Once the arrival is recorded, paste the order&apos;s Metadata sheet in the sample registry. Each sample receives a code such as <span className="mono">ORD041-S037</span>; codes never contain a client name.</p>
        </section>
      </div>
    </div>
  </>;
}
