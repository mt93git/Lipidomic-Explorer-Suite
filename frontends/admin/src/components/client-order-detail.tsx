import Link from "@/components/app-link";
import { clientDay, clientSteps, declined, stepOf, type ClientOrder } from "@/lib/client-portal";
import { clientMayOpenNexo, type ClientDeliverable } from "@/lib/deliverables";
import { mayOpenInNexo, nexoDatasetLink } from "@/lib/release";
import { ClientDeliverables } from "./deliverables";
import styles from "./client-portal.module.css";

// An order as a client member follows it: six steps with their dates, where it is now, and the order's own facts.
// No gate checklist, batch name, staff name or internal note (proposal, section 6). A declined request shows the lab's
// reason instead of the steps. shipping: the lab's shipping instructions, shown on the Accepted step when set.
// files: what the lab shows this client (F4), listed on the Released step, or earlier once the lab shares one.
// nexoAccess: the lab's per-client switch; Open in Nexo also needs the environment gate.
type Props = { order: ClientOrder; clientName: string; example: boolean; shipping?: string | null; mayRequest?: boolean; files?: ClientDeliverable[]; nexoAccess?: boolean };
export function ClientOrderDetail({ order, clientName, example, shipping = null, mayRequest = false, files = [], nexoAccess = false }: Props) {
  const step = stepOf(order);
  const steps = clientSteps(order);
  const closed = declined(order);
  return <>
    <div className="page-heading">
      <div><div className="eyebrow"><Link href="/client/home">Your orders</Link> / Order detail</div><h1>{order.code}</h1><p>{order.title}</p></div>
      <Link className="button secondary" href="/client/home">← Back to your orders</Link>
    </div>
    {!closed && <ol className={styles.steps} aria-label="Order progress">{steps.map(item => (
      <li className={styles.step} data-state={item.state} key={item.number} aria-current={item.state === "current" ? "step" : undefined}>
        <span className={styles.dot} aria-hidden="true">{item.state === "done" ? "✓" : item.number}</span>
        <span className={styles.stepName}>{item.label}</span>
        <span className={styles.stepDate}>{item.date ? clientDay(item.date) : item.state === "current" ? "Current" : item.state === "upcoming" ? "Upcoming" : ""}</span>
      </li>
    ))}</ol>}
    <div className="detail-grid">
      <div>{closed ? <DeclinedPanel order={order} mayRequest={mayRequest} /> : <NowPanel order={order} step={step} shipping={shipping} nexoAccess={nexoAccess} />}
        {!closed && (step === 6 || files.length > 0) && <ClientDeliverables items={files} />}</div>
      <section className="panel" aria-labelledby="facts-title">
        <div className="eyebrow">At a glance</div><h2 id="facts-title">Order facts</h2>
        <dl className="facts">{[
          ["Client", clientName], ["Order", order.code], ["Panel", order.panel ?? "Not set"], ["Matrix", order.matrix ?? "Not given"],
          ["Samples", `${order.registeredSamples} registered${order.expectedSamples ? ` · ${order.expectedSamples} expected` : ""}`],
          ["Billing ref.", order.billingRef ?? "Not given"],
        ].map(([label, value]) => <div className="fact-row" key={label}><dt>{label}</dt><dd className={label === "Order" || (label === "Billing ref." && order.billingRef) ? "mono" : undefined}>{value}</dd></div>)}</dl>
        <p className="notice">{example ? "Example data only. " : ""}Scientific values are never edited in Admin.</p>
      </section>
    </div>
  </>;
}

function DeclinedPanel({ order, mayRequest }: { order: ClientOrder; mayRequest: boolean }) {
  return <section className="panel" aria-labelledby="now-title">
    <div className="eyebrow">Request closed</div>
    <h2 id="now-title">Declined by the lab</h2>
    <p className={styles.reason}><strong>Reason from the lab.</strong> {order.declineReason || "The lab gave no further detail."}</p>
    <p className="muted">Requested {clientDay(order.requestedAt, true)}. Nothing was shipped or measured for this request.</p>
    {mayRequest && <p><Link href="/client/request-order">Request another order →</Link></p>}
  </section>;
}

function NowPanel({ order, step, shipping, nexoAccess }: { order: ClientOrder; step: number; shipping: string | null; nexoAccess: boolean }) {
  const samples = order.registeredSamples || order.expectedSamples || 0;
  const yours = samples ? `Your ${samples} sample${samples === 1 ? "" : "s"}` : "Your samples";
  const release = order.release;
  // Open in Nexo: a current released version, NEXT_PUBLIC_NEXO_URL, the environment gate for clients
  // (NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1, mayOpenInNexo) and the lab's switch for this client (decision 1).
  const nexo = release?.datasetId ? nexoDatasetLink(process.env.NEXT_PUBLIC_NEXO_URL, { id: release.datasetId, status: "released" }, clientMayOpenNexo(mayOpenInNexo("client"), nexoAccess)) : null;
  const content = step === 1 ? {
    title: "Waiting for the lab", tag: `Requested ${clientDay(order.requestedAt)}`, waiting: true,
    text: <>The lab has your request and will accept it or tell you why not. <strong>Do not ship samples yet.</strong></>,
  } : step === 2 ? {
    title: "Send your samples", tag: `Accepted ${clientDay(order.acceptedAt ?? order.requestedAt)}`, waiting: true,
    text: <>Write <strong className="mono">{order.code}</strong> on every box{shipping ? " and follow the lab's shipping instructions below" : " and ship as agreed with the lab"}.{order.expectedSamples ? ` ${order.expectedSamples} samples expected.` : ""} The lab records the arrival here.</>,
  } : step === 3 ? {
    title: "Samples received", tag: order.receivedAt ? `Received ${clientDay(order.receivedAt)}` : null, waiting: false,
    text: <>The lab has your samples and is registering them{order.registeredSamples ? ` (${order.registeredSamples} so far)` : ""}. Nothing is needed from you. The next step you will see here is the analysis.</>,
  } : step === 4 ? {
    title: "In analysis", tag: "With the lab", waiting: false,
    text: <>{yours} are registered and in the lab&apos;s workflow: extraction, the instrument run and data processing. Nothing is needed from you. The next step you will see here is the quality review, where two lab reviewers sign before anything is released.</>,
  } : step === 5 ? {
    title: "Quality review", tag: "With the lab", waiting: false,
    text: <>The lab is checking the results. Two different lab reviewers sign the dataset before it is released to you. Nothing is needed from you.</>,
  } : release?.retired ? {
    title: `Released, then ${release.retired.status}`, tag: `Dataset v${release.version}`, waiting: true,
    text: <>Dataset v{release.version} was {release.retired.status} on {clientDay(release.retired.at, true)}{release.retired.reason ? `: ${release.retired.reason}` : ""}. No version of this order is available now; the lab will tell you what comes next.</>,
  } : {
    title: "Released", tag: release ? `Dataset v${release.version}${release.releasedAt ? ` · ${clientDay(release.releasedAt, true)}` : ""}` : null, waiting: false,
    text: <>Signed by two different lab reviewers.{nexo ? " Open it in Nexo to explore the results." : ""}</>,
  };
  return <section className="panel" aria-labelledby="now-title">
    <div className="eyebrow">Step {step} of 6</div>
    <h2 id="now-title">{content.title}</h2>
    {content.tag && <span className={styles.tag} data-tone={content.waiting ? "waiting" : undefined}>{content.tag}</span>}
    <p className={release?.retired && step === 6 ? "notice" : "muted"}>{content.text}</p>
    {step === 2 && shipping && <div className={styles.shipping} role="note" aria-label="Shipping instructions">
      <div className="eyebrow">Shipping instructions from the lab</div><p>{shipping}</p>
    </div>}
    {step === 6 && !release?.retired && nexo && <div className="heading-actions"><a className="button" href={nexo} target="_blank" rel="noreferrer">Open in Nexo</a></div>}
  </section>;
}
