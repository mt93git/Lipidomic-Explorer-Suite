import type { Metadata } from "next";
import Link from "@/components/app-link";
import { clientDay, clientStepLabels, declined, homeCounts, reachedOn, samplePhrase, stepOf, stepPhrase, type ClientOrder } from "@/lib/client-portal";
import { mayRequestOrders } from "@/lib/order-request";
import { listClientOrders } from "@/lib/data/client-orders";
import { clientNexoAccess } from "@/lib/data/clients";
import { countClientDeliverables } from "@/lib/data/deliverables";
import { getClientContact } from "@/lib/data/order-requests";
import { LabContact } from "@/components/lab-contact";
import { clientMayOpenNexo } from "@/lib/deliverables";
import { mayOpenInNexo, nexoDatasetLink } from "@/lib/release";
import { requireWorkspace } from "@/lib/session";
import styles from "@/components/client-portal.module.css";

export const metadata: Metadata = { title: "Your orders" };

// Client home: the selected client's orders, each at its client-facing step, and the datasets released to it.
// ?requested=ORD059 after Request an order. A request the lab declined stays in the list, closed, with its reason.
// Released datasets say how many files the client has; "you can open" only while this client can open Nexo.
export default async function ClientHomePage({ searchParams }: { searchParams: Promise<{ requested?: string }> }) {
  const session = await requireWorkspace("client");
  const client = session.selectedClient;
  if (!client) return <p className="empty-state">No client memberships are assigned. Ask the lab to add your client access.</p>;
  const { requested } = await searchParams;
  const sent = requested && /^ORD\d{3,}$/.test(requested) ? requested : null;
  const [orders, nexoAccess, fileCounts, contact] = await Promise.all([listClientOrders(client.id), clientNexoAccess(client.id), countClientDeliverables(client.id), getClientContact()]);
  const opensNexo = clientMayOpenNexo(mayOpenInNexo("client"), nexoAccess);
  const counts = homeCounts(orders);
  const mayRequest = mayRequestOrders(client.role);
  const inProgress = orders.filter(order => !declined(order) && stepOf(order) < 6).concat(orders.filter(declined));
  const released = orders.filter(order => !declined(order) && stepOf(order) === 6);
  const tiles = [
    { title: "Waiting for the lab", value: counts.waitingForLab, note: "Requests the lab has not answered yet" },
    { title: "Waiting for your samples", value: counts.waitingForSamples, note: "Accepted: ship with the order code" },
    { title: "With the lab", value: counts.withLab, note: "Received, in analysis or in review" },
    { title: "Released", value: counts.released, note: opensNexo ? "Datasets you can open" : "Results released by the lab", ready: true },
  ];
  return <>
    <div className="page-heading"><div>
      <div className="eyebrow">Client portal / {client.name}</div><h1>Your orders</h1>
      <p>Everything the lab is doing for {client.name}, and the datasets it has released to you.</p>
    </div>{mayRequest && <div className="heading-actions"><Link className="button" href="/client/request-order">+ Request an order</Link></div>}</div>
    {sent && <p className="notice success" role="status"><strong>Request <span className="mono">{sent}</span> sent.</strong> The lab will review it. Do not ship samples until it shows Accepted.</p>}
    <div className="metrics">{tiles.map(tile => <div className={`metric${tile.ready ? " ready" : ""}`} key={tile.title}>
      <span className="metric-title">{tile.title}</span><span className="number">{tile.value}</span><small>{tile.note}</small>
    </div>)}</div>
    <div className="detail-grid">
      <div>
        <section className="panel" aria-labelledby="orders-title">
          <div className="eyebrow">In progress</div><h2 id="orders-title">Orders</h2>
          {inProgress.length ? <ul className={styles.list}>{inProgress.map(order => <OrderRow order={order} key={order.code} />)}</ul>
            : <p className="muted">No orders in progress. {mayRequest ? "Request an order, or the lab opens one for you" : `The lab opens orders for ${client.name}`}; they appear here.</p>}
        </section>
        <section className="panel" aria-labelledby="datasets-title">
          <div className="eyebrow">Released</div><h2 id="datasets-title">Datasets</h2>
          {released.length ? <ul className={styles.list}>{released.map(order => <DatasetRow order={order} opensNexo={opensNexo} files={fileCounts.get(order.code) ?? 0} key={order.code} />)}</ul>
            : <p className="muted">No dataset has been released yet.</p>}
        </section>
      </div>
      <section className="panel" aria-labelledby="access-title">
        <div className="eyebrow">Your access</div><h2 id="access-title">{client.role ?? "Viewer"}</h2>
        <p className="muted">at <strong>{client.name}</strong>. You can {mayRequest ? "request orders and " : ""}follow every order of this client. The lab decides who belongs to it.</p>
        <div className="eyebrow">Sending samples</div>
        <p className="muted">Ship only after a request shows Accepted, with the order code on every box. The lab records the arrival here.</p>
        {session.clients.length > 1 && <p className="muted"><Link href="/choose-client">Change client</Link></p>}
        <LabContact text={contact?.text} />
      </section>
    </div>
  </>;
}

function OrderRow({ order }: { order: ClientOrder }) {
  const step = stepOf(order);
  const reached = reachedOn(order);
  const closed = declined(order);
  return <li className={styles.row}>
    <Link className={styles.code} href={`/orders/${order.code}`}>{order.code}</Link>
    <span><Link className={styles.title} href={`/orders/${order.code}`}>{order.title || order.code}</Link>
      <span className={styles.meta}>{samplePhrase(order)}{reached ? ` · ${reached.word} ${clientDay(reached.date)}` : ""}</span></span>
    <span>
      <span className={styles.progress} aria-hidden="true">{clientStepLabels.map((label, index) => <span className={styles.segment} key={label}
        data-state={closed ? undefined : index + 1 < step ? "done" : index + 1 === step ? (step <= 2 ? "waiting" : "current") : undefined} />)}</span>
      {closed ? <span className={styles.phrase}><strong className={styles.declined}>Declined by the lab</strong> · open it for the reason</span>
        : <span className={styles.phrase}><strong>{clientStepLabels[step - 1]}</strong> · {stepPhrase(step)}</span>}
    </span>
  </li>;
}

// Open in Nexo needs the environment gate and the lab's switch for this client (F4, decision 1). files: how many the
// client sees for the order.
function DatasetRow({ order, opensNexo, files }: { order: ClientOrder; opensNexo: boolean; files: number }) {
  const release = order.release;
  const nexo = release?.datasetId ? nexoDatasetLink(process.env.NEXT_PUBLIC_NEXO_URL, { id: release.datasetId, status: "released" }, opensNexo) : null;
  const what = !release ? "Released" : release.retired ? `Dataset v${release.version} ${release.retired.status}`
    : `Dataset v${release.version}${release.releasedAt ? ` · released ${clientDay(release.releasedAt, true)}` : ""}`;
  return <li className={styles.dataset}>
    <span className={styles.code}>{order.code}</span>
    <span className={styles.datasetText}><span className={styles.title}>{order.title || order.code}</span><span className={styles.meta}>{what} · {samplePhrase(order)}{files ? ` · ${files} file${files === 1 ? "" : "s"}` : ""}</span></span>
    <span className={styles.actions}>
      <Link className="button secondary" href={`/orders/${order.code}`} aria-label={`Order ${order.code}`}>Order →</Link>
      {nexo && <a className="button" href={nexo} target="_blank" rel="noreferrer">Open in Nexo</a>}
    </span>
  </li>;
}
