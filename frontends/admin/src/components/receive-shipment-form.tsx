"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { receiveShipmentAction, type ReceiveShipmentState } from "@/app/(workspace)/receive-shipment/actions";
import { conditionLabels, conditionNotes, conditions, type OrderSummary } from "@/lib/samples";

const carriers = ["FedEx", "UPS", "DHL", "USPS", "World Courier", "Hand delivered"];

// The arrival record. The order is chosen here and mirrored into the URL so the page can show its facts;
// the other fields are plain form fields validated by the browser first and by the server action again.
export function ReceiveShipmentForm({ orders, selected }: { orders: OrderSummary[]; selected: string | null }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ReceiveShipmentState, FormData>(receiveShipmentAction, {});
  const [orderId, setOrderId] = useState(() => orders.find(order => order.code === selected)?.id ?? "");
  const current = orders.find(order => order.id === orderId) ?? null;
  const values = state.values;
  const error = (field: keyof NonNullable<ReceiveShipmentState["errors"]>) => state.errors?.[field];
  const describe = (field: keyof NonNullable<ReceiveShipmentState["errors"]>) => error(field) ? { "aria-invalid": true as const, "aria-describedby": `ship-${field}-error` } : {};
  const fieldError = (field: keyof NonNullable<ReceiveShipmentState["errors"]>) => error(field) ? <small id={`ship-${field}-error`} className="field-error">{error(field)}</small> : null;

  return <form action={action} className="record-form">
    {state.error && <p className="error" role="alert">{state.error}</p>}
    <input type="hidden" name="orderCode" value={current?.code ?? ""} />
    <div className="field">
      <label className="field-label" htmlFor="ship-orderId">Order</label>
      <select id="ship-orderId" name="orderId" required value={orderId} {...describe("orderId")}
        onChange={event => { setOrderId(event.target.value); const code = orders.find(order => order.id === event.target.value)?.code; router.replace(code ? `/receive-shipment?order=${code}` : "/receive-shipment", { scroll: false }); }}>
        <option value="">Choose an order…</option>
        {orders.map(order => <option key={order.id} value={order.id}>{order.code} · {order.clientName} · {order.description}</option>)}
      </select>
      <small className="field-hint">Only orders waiting to arrive are listed.</small>
      {fieldError("orderId")}
    </div>
    <div className="form-row">
      <div className="field">
        <label className="field-label" htmlFor="ship-carrier">Carrier</label>
        <input id="ship-carrier" name="carrier" list="ship-carriers" required autoComplete="off" defaultValue={values?.carrier ?? ""} placeholder="FedEx, UPS, hand delivered…" {...describe("carrier")} />
        <datalist id="ship-carriers">{carriers.map(carrier => <option key={carrier} value={carrier} />)}</datalist>
        {fieldError("carrier")}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ship-trackingNumber">Tracking number</label>
        <input id="ship-trackingNumber" name="trackingNumber" className="mono" autoComplete="off" defaultValue={values?.trackingNumber ?? ""} placeholder="Optional" {...describe("trackingNumber")} />
        {fieldError("trackingNumber")}
      </div>
    </div>
    <fieldset className="field radio-group" {...describe("condition")}>
      <legend className="field-label">Condition on arrival</legend>
      <div className="radio-options">
        {conditions.map(condition => <label key={condition} className="radio">
          <input type="radio" name="condition" value={condition} required defaultChecked={values?.condition === condition} />
          <span><strong>{conditionLabels[condition]}</strong><small>{conditionNotes[condition]}</small></span>
        </label>)}
      </div>
      {fieldError("condition")}
    </fieldset>
    <div className="form-row">
      <div className="field">
        <label className="field-label" htmlFor="ship-boxCount">Boxes</label>
        <input id="ship-boxCount" name="boxCount" type="number" min={0} step={1} inputMode="numeric" required defaultValue={values?.boxCount ?? ""} placeholder="1" {...describe("boxCount")} />
        {fieldError("boxCount")}
      </div>
    </div>
    <div className="field">
      <label className="field-label" htmlFor="ship-notes">Notes</label>
      <textarea id="ship-notes" name="notes" rows={3} defaultValue={values?.notes ?? ""} placeholder="Dry ice level, manifest differences, anything the registry should know." {...describe("notes")} />
      {fieldError("notes")}
    </div>
    <div className="form-actions">
      <button className="button" disabled={pending}>{pending ? "Recording…" : "Record arrival"}</button>
      <span className="muted"><small>Moves the order to Received and opens its sample registry.</small></span>
    </div>
  </form>;
}
