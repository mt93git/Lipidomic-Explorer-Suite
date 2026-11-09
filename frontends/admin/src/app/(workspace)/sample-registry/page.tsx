import type { Metadata } from "next";
import Link from "next/link";
import { SampleRegistryGrid } from "@/components/sample-registry-grid";
import { getRegistryOrder, listRegistryOrders } from "@/lib/data/samples";
import { formatLabInstant } from "@/lib/lab-time";
import { stages } from "@/lib/models";
import { columns, conditionLabels, plural, type OrderSummary, type ShipmentRecord } from "@/lib/samples";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Sample registry" };
type Params = { order?: string; received?: string; saved?: string };

function shipmentLine(shipment: ShipmentRecord): string {
  const parts = [[shipment.carrier, shipment.trackingNumber].filter(Boolean).join(" ") || "carrier not recorded"];
  if (shipment.boxCount !== null) parts.push(plural(shipment.boxCount, "box", "boxes"));
  if (shipment.condition) parts.push(conditionLabels[shipment.condition].toLowerCase());
  return parts.join(" · ");
}

function OrderList({ orders, label }: { orders: OrderSummary[]; label: string }) {
  return <ul className="order-list" aria-label={label}>
    {orders.map(order => <li key={order.id}><Link className="order-choice" href={`/sample-registry?order=${order.code}`}>
      <span className="order-code">{order.code}</span>{order.description}
      <small>{order.clientName} · {stages[order.stage]}{order.expectedSamples === null ? "" : ` · ${plural(order.expectedSamples, "sample")} expected`}</small>
    </Link></li>)}
  </ul>;
}

// ?order=ORD042 opens one order's registry; ?received= and ?saved= come from the two actions and only choose the banner.
export default async function SampleRegistryPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireWorkspace("staff");
  const { order: code, received, saved } = await searchParams;
  const candidates = await listRegistryOrders();
  const detail = code ? await getRegistryOrder(code) : null;
  const savedCount = Number(saved);
  const open = detail !== null && detail.order.stage >= 1 && detail.order.stage <= 2;
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / Sample registry</div>
        <h1>Sample registry</h1>
        <p>Register an order&apos;s samples with their Metadata columns. The lab assigns each sample a code; the order moves from Received to Registered.</p>
      </div>
      <div className="heading-actions">
        {detail && candidates.length > 1 && <details className="menu" data-align="end">
          <summary>Change order <span aria-hidden="true">▾</span></summary>
          <div className="menu-list">{candidates.map(order => <Link key={order.id} className="menu-option" href={`/sample-registry?order=${order.code}`} aria-current={order.code === detail.order.code ? "true" : undefined}>
            <span className="mono">{order.code}</span> {order.clientName}<span className="menu-count">{stages[order.stage]}</span>
          </Link>)}</div>
        </details>}
        <Link className="button secondary" href="/pipeline">← Back to pipeline</Link>
      </div>
    </div>

    {code && !detail && <p className="notice" role="status">No order {code} was found. Choose one below.</p>}
    {detail && received && detail.shipment && <p className="notice" role="status">Shipment recorded for {detail.order.code} · {shipmentLine(detail.shipment)}. Now register its samples.</p>}
    {detail && Number.isInteger(savedCount) && savedCount > 0 && <p className="notice" role="status">
      {plural(savedCount, "sample")} registered. {detail.order.code} is now {stages[detail.order.stage]} · <Link href={`/pipeline?q=${detail.order.code}`}>see it in the pipeline</Link> · <Link href={`/orders/${detail.order.code}`}>order detail</Link>.
    </p>}

    {!detail && <section className="panel" aria-labelledby="choose-title">
      <div className="eyebrow">Open registries</div>
      <h2 id="choose-title">Choose an order</h2>
      {candidates.length
        ? <OrderList orders={candidates} label="Orders with an open registry" />
        : <p className="empty-state">No order is waiting for its registry. <Link href="/receive-shipment">Receive a shipment</Link> first.</p>}
      <p className="muted" style={{ marginTop: 14 }}><small>Orders still at Request appear under <Link href="/receive-shipment">Receive shipment</Link>.</small></p>
    </section>}

    {detail && detail.order.stage === 0 && <p className="notice">{detail.order.code} has not arrived yet. <Link href={`/receive-shipment?order=${detail.order.code}`}>Receive its shipment</Link> first; the registry opens after that.</p>}

    {detail && detail.order.stage !== 0 && <>
      <div className="facts-strip">
        <section className="panel" aria-labelledby="facts-title">
          <div className="eyebrow">At a glance</div>
          <h2 id="facts-title">{detail.order.code}</h2>
          <dl className="facts">
            {[["Client", detail.order.clientName], ["Description", detail.order.description], ["Stage", stages[detail.order.stage]], ["Expected", detail.order.expectedSamples === null ? "Not stated" : plural(detail.order.expectedSamples, "sample")], ["Registered", plural(detail.samples.length, "sample")], ["Material", detail.order.sampleType ?? "Not stated"]]
              .map(([label, value]) => <div className="fact-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </section>
        <section className="panel" aria-labelledby="shipment-title">
          <div className="eyebrow">Arrival</div>
          <h2 id="shipment-title">Shipment</h2>
          {detail.shipment
            ? <dl className="facts">
              {[["Carrier", detail.shipment.carrier ?? "Not recorded"], ["Tracking", detail.shipment.trackingNumber ?? "None"], ["Condition", detail.shipment.condition ? conditionLabels[detail.shipment.condition] : "Not recorded"],
                ["Boxes", detail.shipment.boxCount === null ? "Not recorded" : String(detail.shipment.boxCount)], ["Received", detail.shipment.receivedAt ? formatLabInstant(detail.shipment.receivedAt) : "Not recorded"],
                ...(detail.shipment.receivedBy ? [["By", detail.shipment.receivedBy]] : []), ...(detail.shipment.notes ? [["Notes", detail.shipment.notes]] : [])]
                .map(([label, value]) => <div className="fact-row" key={label}><dt>{label}</dt><dd className={label === "Tracking" ? "mono" : undefined}>{value}</dd></div>)}
            </dl>
            : <p className="muted">No shipment record for this order.</p>}
        </section>
      </div>
      {detail.samples.length > 0 && <section className="panel" aria-labelledby="registered-title">
        <div className="panel-heading"><div><div className="eyebrow">Registered</div><h2 id="registered-title">{plural(detail.samples.length, "sample")}</h2></div><span className="pill ok">Codes assigned</span></div>
        <div className="grid-scroll" role="region" aria-label="Registered sample list" tabIndex={0}>
          <table className="registry-table registered" aria-label="Registered samples">
            <thead><tr><th scope="col">Code</th>{columns.map(column => <th key={column.field} scope="col">{column.label}</th>)}</tr></thead>
            <tbody>{detail.samples.map(sample => <tr key={sample.id}>
              <td className="mono code-cell">{sample.code}</td>
              {columns.map(column => <td key={column.field} className={column.field === "full_name" || column.field === "client_sample_id" ? "mono" : undefined}>{sample[column.field] ?? ""}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </section>}
      <section className="panel" aria-labelledby="register-title">
        <div className="eyebrow">{detail.samples.length ? "Add more" : "Register"}</div>
        <h2 id="register-title">{detail.samples.length ? "More samples" : "Samples to register"}</h2>
        {open
          ? <SampleRegistryGrid key={`${detail.order.code}-${detail.samples.length}`} order={detail.order} shipmentId={detail.shipment?.id ?? null} existingNames={detail.samples.map(sample => sample.full_name)} />
          : <p className="notice">{detail.order.code} is {stages[detail.order.stage]}; its registry is closed. The samples above are listed for reference.</p>}
      </section>
    </>}
  </>;
}
