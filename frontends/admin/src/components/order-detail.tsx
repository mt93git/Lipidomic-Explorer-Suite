import Link from "next/link";
import { gateStatus, stages, type Client, type Order, type View } from "@/lib/models";
import { mayOpenInNexo, nexoDatasetLink } from "@/lib/release";
import { OrderStepper } from "./order-stepper";
import { GateChecklist } from "./gate-checklist";
import { GateActions } from "./gate-actions";

const date = (value: string, missing = "Not set") => {
  const instant = new Date(value);
  return value && !Number.isNaN(instant.getTime()) ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(instant) : missing;
};

// Lab staff get the gate actions (links into their workflows); a client user reads the same record without them.
export function OrderDetail({ order, client, audience = "staff", example = true }: { order: Order; client: Client; audience?: View; example?: boolean }) {
  const staff = audience === "staff";
  const status = gateStatus(order.gates);
  const nextStage = stages[order.stage + 1] ?? "Released";
  const reviewHref = order.stage >= 9 ? "/release" : order.stage >= 7 ? "/qc-review" : order.stage >= 4 ? "/batch-run" : "/sample-registry";
  // Released once, but the released version was withdrawn: not a current release (a stage never moves back).
  const retired = order.released ? order.retired : undefined;
  const nexo = order.currentDatasetId && !retired ? nexoDatasetLink(process.env.NEXT_PUBLIC_NEXO_URL, { id: order.currentDatasetId, status: "released" }, mayOpenInNexo(audience)) : null;
  const heading = retired ? `Released, then ${retired.status}` : order.released ? "Release complete" : `Ready for ${nextStage.toLowerCase()}?`;
  const pill = retired ? { className: "fail", label: retired.status === "withdrawn" ? "Withdrawn" : "Superseded" }
    : { className: status, label: status === "fail" ? "Gate blocked" : status === "pending" ? "Checks pending" : "Checks complete" };
  const summary = retired
    ? `Dataset v${retired.version} was ${retired.status} on ${date(retired.at)}${retired.reason ? `: ${retired.reason}` : ""}. No version of this order is available now. The Team project made at release still exists; do not use its files.`
    : order.released ? `This ${example ? "example " : ""}version has two distinct reviewer signatures.` : "Every check must pass before this order moves forward.";
  const facts = [
    ["Client", client.name], ["Order", order.code], ["Samples", String(order.sampleCount)], ["Material", order.sampleType],
    ["Received", date(order.received, "Not yet")], ["Target date", date(order.due)], ["Assigned to", order.owner],
  ];
  return <>
    <div className="page-heading">
      <div><div className="eyebrow">{staff ? <><Link href="/pipeline">Lab work / Pipeline</Link> / Order detail</> : "Your orders / Order detail"}</div><h1>{order.code}</h1><p>{order.description}</p></div>
      {staff && <Link className="button secondary" href="/pipeline">← Back to pipeline</Link>}
    </div>
    <OrderStepper stage={order.stage} released={Boolean(order.released)} />
    <div className="detail-grid">
      <div>
        <section className="panel" aria-labelledby="gate-title">
          <div className="panel-heading"><div><div className="eyebrow">{order.released ? "Final gate" : "Next gate"}</div><h2 id="gate-title">{heading}</h2></div><span className={`pill ${pill.className}`}>{pill.label}</span></div>
          <p className={retired ? "notice" : "muted"}>{summary}</p>
          <GateChecklist gates={order.gates} />
          {staff && !order.released && <GateActions ready={status === "ok"} nextStage={nextStage} reviewHref={reviewHref} />}
          {staff && order.released && <div className="heading-actions"><Link className="button secondary" href="/datasets">View datasets</Link>{nexo && <a className="button" href={nexo} target="_blank" rel="noreferrer">Open in Nexo</a>}</div>}
          {!staff && nexo && <div className="heading-actions"><a className="button" href={nexo} target="_blank" rel="noreferrer">Open in Nexo</a></div>}
        </section>
        <section className="panel" aria-labelledby="history-title"><div className="eyebrow">Order record</div><h2 id="history-title">History</h2>
          <ol className="history">{order.history.map(event => <li key={`${event.date}-${event.title}`}><time dateTime={event.date}>{date(event.date)} · {event.date.slice(11,16)} UTC</time>{event.title}<small>{event.actor}</small></li>)}</ol>
        </section>
      </div>
      <section className="panel" aria-labelledby="facts-title"><div className="eyebrow">At a glance</div><h2 id="facts-title">Order facts</h2><dl className="facts">{facts.map(([label, value]) => <div className="fact-row" key={label}><dt>{label}</dt><dd className={label === "Order" ? "mono" : undefined}>{value}</dd></div>)}</dl><p className="notice">{example ? "Example data only. " : ""}Scientific values are never edited in Admin.</p></section>
    </div>
  </>;
}
