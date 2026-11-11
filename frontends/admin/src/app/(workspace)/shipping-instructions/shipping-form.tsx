"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/error-summary";
import { CONTACT_LIMIT, SHIPPING_LIMIT } from "@/lib/order-request";
import { setContactAction, setShippingAction, type ShippingState } from "./actions";

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

// The lab's contact for clients (0023): where a client writes when something changes or a request is waiting.
export function ContactForm({ text }: { text: string }) {
  const [state, action, pending] = useActionState<ShippingState, FormData>(setContactAction, {});
  return <form action={action} className="record-form" aria-label="Contact for clients">
    {state.error && <FormAlert>{state.error}</FormAlert>}
    <div className="field">
      <label className="field-label" htmlFor="contact-text">Contact clients read</label>
      <textarea id="contact-text" name="text" rows={3} maxLength={CONTACT_LIMIT} defaultValue={state.text ?? text} disabled={pending}
        placeholder="The lab's email address or phone, and when someone answers." />
      <small className="field-hint">Shown on Request access, on a request that is waiting or declined, and in Your access. Leave it empty to show nothing.</small>
    </div>
    <div className="form-actions"><button className="button" disabled={pending}>{pending ? "Saving…" : "Save contact"}</button></div>
  </form>;
}
