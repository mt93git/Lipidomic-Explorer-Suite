import type { ReactNode } from "react";
import Link from "@/components/app-link";
import { gateStatus, stages, type Client, type Order, type View } from "@/lib/models";
import { mayOpenInNexo, nexoDatasetLink } from "@/lib/release";
import { OrderStepper } from "./order-stepper";
import { GateChecklist } from "./gate-checklist";
import { GateActions } from "./gate-actions";
import { RequestReview } from "./request-review";
import type { Panel } from "@/lib/new-order";
import { formatLabInstant } from "@/lib/lab-time";

const date = (value: string, missing = "Not set") => {
  const instant = new Date(value);
  return value && !Number.isNaN(instant.getTime()) ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(instant) : missing;
};

// Lab staff get the gate actions (links into their workflows); a client user reads the same record without them.
// A client request still waiting for an answer shows the lab's decision (accept or decline) in place of the next gate.
// Once answered, the request's facts and the client's notes stay on the page. children: the lab's Deliverables
// section, shown right after the gate panel and before History.
type Props = { order: Order; client: Client; audience?: View; example?: boolean; panels?: Panel[]; accepted?: boolean; children?: ReactNode };
export function OrderDetail({ order, client, audience = "staff", example = true, panels = [], accepted = false, children }: Props) {
  const staff = audience === "staff";
  const pending = staff && order.request?.status === "pending";
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
  const request = order.request;
  const facts = pending && request ? [
    ["Client", client.name], ["Order", order.code], ["Requested by", request.requestedBy], ["Requested", formatLabInstant(request.requestedAt)],
    ["Panel", request.panelId ? order.panel : "Let the lab advise"], ["Matrix", order.sampleType], ["Billing ref.", request.billingRef ?? "Not given"],
  ] : [
    ["Client", client.name], ["Order", order.code],
    ...(request ? [["Requested by", request.requestedBy], ["Panel", request.panelId ? order.panel : "Not set yet"], ["Billing ref.", request.billingRef ?? "Not given"]] : []),
    ["Samples", String(order.sampleCount)], ["Material", order.sampleType],
    ["Received", date(order.received, "Not yet")], ["Target date", date(order.due)], ["Assigned to", order.owner],
  ];
  return <>
    <div className="page-heading">
      <div><div className="eyebrow">{staff ? <><Link href="/pipeline">Lab work / Pipeline</Link> / Order detail</> : "Your orders / Order detail"}</div><h1>{order.code}</h1><p>{order.description}</p></div>
      {staff && <Link className="button secondary" href="/pipeline">← Back to pipeline</Link>}
    </div>
    {accepted && request?.status === "accepted" && <p className="notice success" role="status">
      <strong>Request accepted.</strong> {client.name} now sees Accepted and can ship with the code {order.code}.
      <Link className="button" href={`/receive-shipment?order=${order.code}`}>Receive shipment →</Link>
    </p>}
    <OrderStepper stage={order.stage} released={Boolean(order.released)} />
    <div className="detail-grid">
      <div>
        {pending ? <RequestReview order={order} client={client} panels={panels} /> : <section className="panel" aria-labelledby="gate-title">
          <div className="panel-heading"><div><div className="eyebrow">{order.released ? "Final gate" : "Next gate"}</div><h2 id="gate-title">{heading}</h2></div><span className={`pill ${pill.className}`}>{pill.label}</span></div>
          <p className={retired ? "notice" : "muted"}>{summary}</p>
          {staff && request?.notes && <div className="notice"><div className="eyebrow">Notes from the client</div>{request.notes}</div>}
          <GateChecklist gates={order.gates} />
          {staff && !order.released && <GateActions ready={status === "ok"} nextStage={nextStage} reviewHref={reviewHref} />}
          {staff && order.released && <div className="heading-actions"><Link className="button secondary" href="/datasets">View datasets</Link>{nexo && <a className="button" href={nexo} target="_blank" rel="noreferrer">Open in Nexo</a>}</div>}
          {!staff && nexo && <div className="heading-actions"><a className="button" href={nexo} target="_blank" rel="noreferrer">Open in Nexo</a></div>}
        </section>}
        {children}
        <section className="panel" aria-labelledby="history-title"><div className="eyebrow">Order record</div><h2 id="history-title">History</h2>
          <ol className="history">{order.history.map(event => <li key={`${event.date}-${event.title}`}><time dateTime={event.date}>{date(event.date)} · {event.date.slice(11,16)} UTC</time>{event.title}<small>{event.actor}</small></li>)}</ol>
        </section>
      </div>
      <section className="panel" aria-labelledby="facts-title"><div className="eyebrow">At a glance</div><h2 id="facts-title">Order facts</h2><dl className="facts">{facts.map(([label, value]) => <div className="fact-row" key={label}><dt>{label}</dt><dd className={label === "Order" ? "mono" : undefined}>{value}</dd></div>)}</dl><p className="notice">{example ? "Example data only. " : ""}Scientific values are never edited in Admin.</p></section>
    </div>
  </>;
}
