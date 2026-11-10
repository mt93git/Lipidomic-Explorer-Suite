"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/error-summary";
import { SHIPPING_LIMIT } from "@/lib/order-request";
import { setShippingAction, type ShippingState } from "./actions";

export function ShippingForm({ text }: { text: string }) {
  const [state, action, pending] = useActionState<ShippingState, FormData>(setShippingAction, {});
  return <form action={action} className="record-form">
    {state.error && <FormAlert>{state.error}</FormAlert>}
    <div className="field">
      <label className="field-label" htmlFor="shipping-text">Instructions clients read</label>
      <textarea id="shipping-text" name="text" rows={6} maxLength={SHIPPING_LIMIT} defaultValue={state.text ?? text} disabled={pending}
        placeholder="Address, dry ice or cold packs, the days the lab receives, who to email with the tracking number." />
      <small className="field-hint">Shown to every client on an accepted request, under “Write the order code on every box”. Leave it empty to show only that sentence.</small>
    </div>
    <div className="form-actions"><button className="button" disabled={pending}>{pending ? "Saving…" : "Save instructions"}</button></div>
  </form>;
}
