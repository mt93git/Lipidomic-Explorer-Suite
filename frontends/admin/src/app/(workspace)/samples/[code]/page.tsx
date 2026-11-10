import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/app-link";
import { getSampleDetail, SAMPLE_EVENT_LIMIT } from "@/lib/data/samples";
import { formatLabInstant } from "@/lib/lab-time";
import { stages } from "@/lib/models";
import { columns, conditionLabels, plural } from "@/lib/samples";

type Props = { params: Promise<{ code: string }> };
const CODE = /^ORD\d{3,}-S\d{3,}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Sample ${(await params).code}` };
}

const dash = "—";
const labeled = (rows: [string, string | null | undefined, string?][]) => <dl className="facts">
  {rows.map(([label, value, className]) => <div className="fact-row" key={label}><dt>{label}</dt><dd className={className}>{value || dash}</dd></div>)}
</dl>;

// Read-only: one registered sample, where it came from and where it went. Lab staff only (getSampleDetail asks for
// the staff workspace); every empty section says so in one line.
export default async function SamplePage({ params }: Props) {
  const { code } = await params;
  const detail = CODE.test(code) ? await getSampleDetail(code) : null;
  if (!detail) notFound();
  const { sample, order, shipment, aliquots, injections, history } = detail;
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / Sample</div>
        <h1 className="mono">{sample.code}</h1>
        <p>{sample.full_name}{order ? ` · ${order.clientName}` : ""}</p>
      </div>
      <div className="heading-actions">
        {order && <Link className="button secondary" href={`/sample-registry?order=${order.code}`}>Sample registry</Link>}
        {order && <Link className="button secondary" href={`/orders/${order.code}`}>← Order {order.code}</Link>}
      </div>
    </div>
    {sample.archivedReason && <p className="notice" role="status">This sample is archived: {sample.archivedReason}</p>}

    <section className="panel" aria-labelledby="identity-title">
      <div className="eyebrow">Identity</div><h2 id="identity-title">Sample</h2>
      {labeled([
        ["Sample code", sample.code, "mono"],
        ...columns.map(column => [column.label, sample[column.field] === null ? null : String(sample[column.field]), column.field === "full_name" || column.field === "client_sample_id" ? "mono" : undefined] as [string, string | null, string | undefined]),
      ])}
    </section>

    <section className="panel" aria-labelledby="order-title">
      <div className="eyebrow">Order</div><h2 id="order-title">Order</h2>
      {order
        ? <p><Link className="mono" href={`/orders/${order.code}`}>{order.code}</Link> · {order.description || "No description"} · {order.clientName} · {stages[order.stage]}</p>
        : <p className="empty-state">The order of this sample is not available to you.</p>}
    </section>

    <section className="panel" aria-labelledby="shipment-title">
      <div className="eyebrow">Arrival</div><h2 id="shipment-title">Shipment</h2>
      {shipment
        ? labeled([
          ["Received", shipment.receivedAt ? formatLabInstant(shipment.receivedAt) : null],
          ["Received by", shipment.receivedBy],
          ["Condition", shipment.condition ? conditionLabels[shipment.condition] : null],
          ["Carrier", [shipment.carrier, shipment.trackingNumber].filter(Boolean).join(" ")],
        ])
        : <p className="empty-state">No shipment is linked to this sample.</p>}
    </section>

    <section className="panel" aria-labelledby="aliquots-title">
      <div className="eyebrow">Extraction</div><h2 id="aliquots-title">Aliquots</h2>
      {aliquots.length
        ? <table className="registry-table" aria-label="Aliquots">
          <thead><tr><th scope="col">Volume (µL)</th><th scope="col">Extracted</th><th scope="col">Extracted by</th></tr></thead>
          <tbody>{aliquots.map(item => <tr key={item.id}>
            <td>{item.volumeUl ?? dash}{item.archived ? " (archived)" : ""}</td>
            <td>{item.extractedAt ? formatLabInstant(item.extractedAt) : "Not yet"}</td>
            <td>{item.extractedBy ?? dash}</td>
          </tr>)}</tbody>
        </table>
        : <p className="empty-state">No aliquots yet.</p>}
    </section>

    <section className="panel" aria-labelledby="injections-title">
      <div className="eyebrow">Acquisition</div><h2 id="injections-title">Injections</h2>
      {injections.length
        ? <table className="registry-table" aria-label="Injections">
          <thead><tr><th scope="col">Batch</th><th scope="col">Version</th><th scope="col">Sequence</th><th scope="col">Injection name</th><th scope="col">Status</th></tr></thead>
          <tbody>{injections.map(item => <tr key={item.id}>
            <td className="mono">{item.batch ?? dash}</td>
            <td>{item.version === null ? dash : `v${item.version}`}</td>
            <td>{item.seq}</td>
            <td className="mono">{item.name}</td>
            <td>{item.status}</td>
          </tr>)}</tbody>
        </table>
        : <p className="empty-state">Not in any batch yet.</p>}
    </section>

    <section className="panel" aria-labelledby="history-title">
      <div className="eyebrow">Audit</div><h2 id="history-title">History</h2>
      {history.length
        ? <ol className="history" aria-label="Sample history">{history.map(row => <li key={row.id}>
          <time dateTime={row.at}>{formatLabInstant(row.at)}</time>
          {row.summary}
          <small>{[row.who, ...row.changes.filter(change => change.before !== null).map(change => `${change.field} ${change.before} → ${change.after}`)].join(" · ")}</small>
        </li>)}</ol>
        : <p className="empty-state">No recorded changes for this sample.</p>}
      <p className="muted"><small>{history.length >= SAMPLE_EVENT_LIMIT ? `Latest ${SAMPLE_EVENT_LIMIT} events shown; older ones are in the audit log` : plural(history.length, "event")} · <Link href={`/audit-log${order ? `?order=${order.code}` : ""}`}>Audit log</Link></small></p>
    </section>
  </>;
}
