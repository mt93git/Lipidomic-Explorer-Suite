import type { Metadata } from "next";
import Link from "@/components/app-link";
import { listPanels } from "@/lib/data/orders";
import { mayRequestOrders } from "@/lib/order-request";
import { requireWorkspace } from "@/lib/session";
import styles from "@/components/client-portal.module.css";
import { RequestOrderForm } from "./request-form";

export const metadata: Metadata = { title: "Request an order" };

// A client admin or requester asks the lab for an order for their selected client (admin.request_order). The lab
// accepts or declines it; nothing is shipped before it is accepted. A viewer reads why they cannot.
export default async function RequestOrderPage() {
  const session = await requireWorkspace("client");
  const client = session.selectedClient;
  if (!client) return <p className="empty-state">No client memberships are assigned. Ask the lab to add your client access.</p>;
  const allowed = mayRequestOrders(client.role);
  const panels = allowed ? await listPanels() : [];
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/client/home">Client portal / {client.name}</Link> / Request an order</div>
        <h1>Request an order</h1>
        <p>Tell the lab what you would like measured. The lab reviews the request and answers before you ship anything.</p>
      </div>
      <Link className="button secondary" href="/client/home">← Back to your orders</Link>
    </div>
    <div className="detail-grid">
      <section className="panel" aria-labelledby="request-form-title">
        <div className="eyebrow">Order request</div>
        <h2 id="request-form-title">What you need</h2>
        {allowed ? <RequestOrderForm clientName={client.name} panels={panels} />
          : <p className="notice">As a {client.role ?? "Viewer"} at {client.name} you can follow every order but not request one. Your client admin or a requester can.</p>}
      </section>
      <div>
        <section className="panel" aria-labelledby="next-title">
          <div className="eyebrow">After you send it</div>
          <h2 id="next-title">What happens next</h2>
          <ol className={styles.nextSteps}>
            <li><strong>The lab reviews it</strong><span className="muted">You see it at once in your orders, marked Requested.</span></li>
            <li><strong>The lab accepts, or tells you why not</strong><span className="muted">The answer appears on the order.</span></li>
            <li><strong>You ship the samples</strong><span className="muted">With the order code on every box.</span></li>
            <li><strong>You follow it here</strong><span className="muted">Six steps, up to the released dataset.</span></li>
          </ol>
        </section>
        <section className="panel"><p className="notice">Sample names and groups are not entered here. The lab registers them from your manifest when the shipment arrives.</p></section>
      </div>
    </div>
  </>;
}
