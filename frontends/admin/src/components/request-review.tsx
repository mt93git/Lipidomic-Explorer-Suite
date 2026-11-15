"use client";

import { useActionState } from "react";
import { acceptRequestAction, declineRequestAction, type AnswerState } from "@/app/(workspace)/orders/[code]/actions";
import { FormAlert } from "@/components/error-summary";
import type { Client, Order } from "@/lib/models";
import type { Panel } from "@/lib/new-order";

// The lab's decision on a client request, in place of the Next gate panel: accept (with the panel as agreed) or decline
// with a reason the client reads. Any lab writer may answer (accept_order / decline_order).
export function RequestReview({ order, client, panels }: { order: Order; client: Client; panels: Panel[] }) {
  const [accepted, accept, accepting] = useActionState<AnswerState, FormData>(acceptRequestAction, {});
  const [declined, decline, declining] = useActionState<AnswerState, FormData>(declineRequestAction, {});
  const request = order.request;
  const busy = accepting || declining;
  return <section className="panel" aria-labelledby="review-title">
    <div className="panel-heading"><div><div className="eyebrow">Client request</div><h2 id="review-title">Accept this request?</h2></div><span className="pill pending">Needs an answer</span></div>
    <p className="muted">{client.name} asked for this order. Until you accept it, no shipment can be received for it and the client sees “Waiting for the lab”.</p>
    {request?.notes && <div className="notice"><div className="eyebrow">Notes from the client</div>{request.notes}</div>}
    <form action={accept} className="record-form" aria-label="Accept request">
      <input type="hidden" name="code" value={order.code} />
      <div className="form-row">
        <div className="field">
          <label className="field-label" htmlFor="review-panel">Panel</label>
          <select id="review-panel" name="panelId" defaultValue={request?.panelId ?? ""} disabled={busy}>
            <option value="">{request?.panelId ? "Keep the client's choice" : "Not set yet"}</option>
            {panels.map(panel => <option key={panel.id} value={panel.id}>{panel.name}</option>)}
          </select>
          <small className="field-hint">{request?.panelId ? "As the client chose it; change it if you agreed otherwise." : "The client let the lab advise; set it now or later."}</small>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="review-expected">Expected samples</label>
          <input id="review-expected" value={order.sampleCount ? String(order.sampleCount) : "Not given"} readOnly disabled />
        </div>
      </div>
      {accepted.error && <FormAlert>{accepted.error}</FormAlert>}
      <div className="form-actions"><button className="button" disabled={busy}>{accepting ? "Accepting…" : "Accept request"}</button></div>
    </form>
    <hr className="rule" />
    <form action={decline} className="record-form" aria-label="Decline request">
      <input type="hidden" name="code" value={order.code} />
      <div className="field">
        <label className="field-label" htmlFor="review-reason">Or decline, with a reason</label>
        <textarea id="review-reason" name="reason" rows={2} maxLength={1000} defaultValue={declined.reason ?? ""} placeholder="The client reads this reason on the order." disabled={busy}
          aria-invalid={declined.error ? true : undefined} aria-describedby={declined.error ? "review-reason-error" : undefined} />
        {declined.error && <small id="review-reason-error" className="field-error">{declined.error}</small>}
      </div>
      <div className="form-actions"><button className="button secondary" disabled={busy}>{declining ? "Declining…" : "Decline request"}</button>
        <span className="muted"><small>The order is archived, never deleted, and leaves the pipeline.</small></span></div>
    </form>
  </section>;
}
