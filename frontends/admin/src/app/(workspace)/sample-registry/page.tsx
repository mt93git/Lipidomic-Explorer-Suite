import type { Metadata } from "next";
import Link from "@/components/app-link";
import { SampleRegistryGrid } from "@/components/sample-registry-grid";
import { getRegistryOrder, listRegistryOrders } from "@/lib/data/samples";
import { formatLabInstant } from "@/lib/lab-time";
import { stages } from "@/lib/models";
import { columns, conditionLabels, plural, type OrderSummary, type RegistryDetail, type ShipmentRecord } from "@/lib/samples";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Sample registry" };
type Params = { order?: string; received?: string; saved?: string };

function shipmentLine(shipment: ShipmentRecord): string {
  const parts = [[shipment.carrier, shipment.trackingNumber].filter(Boolean).join(" ") || "carrier not recorded"];
  if (shipment.boxCount !== null) parts.push(plural(shipment.boxCount, "box", "boxes"));
  if (shipment.condition) parts.push(conditionLabels[shipment.condition].toLowerCase());
  return parts.join(" · ");
}

// " · codes ORD042-S001 to ORD042-S004" for the samples just saved (the last `count` of the list, in order).
function codeRange(samples: RegistryDetail["samples"], count: number): string {
  const saved = samples.slice(-count);
  if (!saved.length) return "";
  return saved.length === 1 ? ` · code ${saved[0].code}` : ` · codes ${saved[0].code} to ${saved[saved.length - 1].code}`;
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
        <h1>Sample registry{detail ? ` · ${detail.order.code}` : ""}</h1>
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
    {detail && received && detail.shipment && <p className="notice success" role="status">
      <strong>Shipment recorded for {detail.order.code}</strong> · {shipmentLine(detail.shipment)}{detail.shipment.receivedAt ? ` · ${formatLabInstant(detail.shipment.receivedAt)}` : ""}{detail.shipment.receivedBy ? ` · ${detail.shipment.receivedBy}` : ""}. Now paste the Metadata sheet.
    </p>}
    {detail && Number.isInteger(savedCount) && savedCount > 0 && <p className="notice success" role="status">
      <strong>{plural(savedCount, "sample")} registered.</strong> {detail.order.code} is now {stages[detail.order.stage]}{codeRange(detail.samples, savedCount)} · <Link href={`/pipeline?q=${detail.order.code}`}>see it in the pipeline</Link>.
      <Link className="button" href={`/orders/${detail.order.code}`}>Order detail →</Link>
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
      <section className="panel facts-strip" aria-label="Order facts">
        <p className="facts-line"><strong>{detail.order.clientName}</strong> · {detail.order.description} · {detail.order.sampleType ?? "Material not stated"}</p>
        <dl className="facts-inline">
          {[["Stage", stages[detail.order.stage]], ["Expected", detail.order.expectedSamples === null ? "Not stated" : plural(detail.order.expectedSamples, "sample")], ["Registered", String(detail.samples.length)]]
            .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <details className="facts-more">
          <summary>Shipment details</summary>
          {detail.shipment
            ? <dl className="facts">
              {[["Carrier", detail.shipment.carrier ?? "Not recorded"], ["Tracking", detail.shipment.trackingNumber ?? "None"], ["Condition", detail.shipment.condition ? conditionLabels[detail.shipment.condition] : "Not recorded"],
                ["Boxes", detail.shipment.boxCount === null ? "Not recorded" : String(detail.shipment.boxCount)], ["Received", detail.shipment.receivedAt ? formatLabInstant(detail.shipment.receivedAt) : "Not recorded"],
                ...(detail.shipment.receivedBy ? [["By", detail.shipment.receivedBy]] : []), ...(detail.shipment.notes ? [["Notes", detail.shipment.notes]] : [])]
                .map(([label, value]) => <div className="fact-row" key={label}><dt>{label}</dt><dd className={label === "Tracking" ? "mono" : undefined}>{value}</dd></div>)}
            </dl>
            : <p className="muted">No shipment record for this order.</p>}
        </details>
      </section>
      {detail.samples.length > 0 && <section className="panel" aria-labelledby="registered-title">
        <div className="panel-heading"><div><div className="eyebrow">Registered</div><h2 id="registered-title">{plural(detail.samples.length, "sample")}</h2></div><span className="pill ok">Codes assigned</span></div>
        <div className="grid-frame"><div className="grid-scroll" role="region" aria-label="Registered sample list" tabIndex={0}>
          <table className="registry-table registered" aria-label="Registered samples">
            <thead><tr><th scope="col" className="pinned">Code</th>{columns.map(column => <th key={column.field} scope="col">{column.label}</th>)}</tr></thead>
            <tbody>{detail.samples.map(sample => <tr key={sample.id}>
              <td className="mono code-cell pinned">{sample.code}</td>
              {columns.map(column => <td key={column.field} className={column.field === "full_name" || column.field === "client_sample_id" ? "mono" : undefined}>{sample[column.field] ?? ""}</td>)}
            </tr>)}</tbody>
          </table>
        </div><p className="grid-hint">↔ {columns.length} more columns · Code stays pinned</p></div>
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
