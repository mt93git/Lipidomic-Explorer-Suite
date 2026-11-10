import type { Metadata } from "next";
import Link from "@/components/app-link";
import { getShippingInstructions } from "@/lib/data/order-requests";
import { formatLabInstant } from "@/lib/lab-time";
import { requireWorkspace } from "@/lib/session";
import { ShippingForm } from "./shipping-form";

export const metadata: Metadata = { title: "Shipping instructions" };

// The lab's one shipping text, shown to every client on the Accepted step. Lab Owner and Admin edit it
// (set_shipping_instructions); an Operator reads it. Earlier texts are kept in the database and the audit log.
export default async function ShippingInstructionsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const session = await requireWorkspace("staff");
  const { saved } = await searchParams;
  const current = await getShippingInstructions();
  // The example workspace edits as the demo lab (like Release policy); live, the session's lab role decides.
  const canEdit = session.mock || session.role === "Owner" || session.role === "Admin";
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">Organization / Shipping instructions</div>
        <h1>Shipping instructions</h1>
        <p>What a client reads once the lab accepts their request: how and when to ship the samples. One text for every client.</p>
      </div>
    </div>
    {saved === "1" && <p className="notice success" role="status"><strong>Shipping instructions saved.</strong> Clients see them on every accepted request from now on.</p>}
    {saved === "cleared" && <p className="notice success" role="status"><strong>Shipping instructions cleared.</strong> Clients read only “ship as agreed with the lab”.</p>}
    <div className="detail-grid">
      <section className="panel" aria-labelledby="shipping-title">
        <div className="eyebrow">Current text</div>
        <h2 id="shipping-title">{current ? "Set" : "Not set"}</h2>
        {current && <p className="muted"><small>Saved {formatLabInstant(current.setAt)}{session.mock ? ` by ${current.setBy}` : ""}.</small></p>}
        {canEdit ? <ShippingForm text={current?.text ?? ""} />
          : <>
            {current ? <p style={{ whiteSpace: "pre-line" }}>{current.text}</p> : <p className="muted">Clients read “Write the order code on every box and ship as agreed with the lab”.</p>}
            <p className="notice">Only a lab Owner or Admin changes the shipping instructions.</p>
          </>}
      </section>
      <section className="panel" aria-labelledby="where-title">
        <div className="eyebrow">Where clients see it</div>
        <h2 id="where-title">Step 2 · Accepted</h2>
        <p className="muted">On the client&apos;s order, after the lab accepts the request and before the samples arrive. Requests are answered in <Link href="/pipeline">Pipeline</Link>.</p>
      </section>
    </div>
  </>;
}
