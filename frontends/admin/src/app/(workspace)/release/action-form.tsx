"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "./actions";

type Action = (previous: ActionState, form: FormData) => Promise<ActionState>;

// One form per release action: the fields come from the server component, the submit shows its pending state
// and a refusal is shown next to it. On success the action redirects, so there is no success state here.
export function ActionForm({ action, submit, pendingLabel = "Working…", disabled = false, secondary = false, className, children }:
  { action: Action; submit: string; pendingLabel?: string; disabled?: boolean; secondary?: boolean; className?: string; children?: ReactNode }) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className={className} aria-busy={pending}>
    {children}
    <button className={`button${secondary ? " secondary" : ""}`} disabled={pending || disabled}>{pending ? pendingLabel : submit}</button>
    {state.error && <p role="alert" className="error">{state.error}</p>}
  </form>;
}
